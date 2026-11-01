#!/usr/bin/env python3
"""Run a bounded development cycle while this execution environment stays online.

This is a local scheduler, not a service that can restart a stopped cloud machine.
It deliberately leaves checkout, branch and review policy to the supplied prompt.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid

DEFAULT_STATE = Path('/workspace/.cloud-setup/arcana-loop')
RUNTIME_NOTE = 'Runs only while this cloud environment is running; it cannot restart a stopped environment.'
DEFAULTS = dict(interval_seconds=3600, timeout_seconds=3000, model='claude-sonnet-5-5',
                effort='medium', max_turns=64, max_budget_usd=8)
CONFIG_KEYS = {*DEFAULTS, 'workspace', 'prompt_path', 'claude_bin', 'agents_file'}
SECRET_NAMES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY_KR1', 'ANTHROPIC_API_KEY_KR2',
                'ANTHROPIC_API_KEY_KRVIDEO', 'ANTHROPIC_API_KEY_JUNGSANGHWA',
                'OPENAI_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN']
OUTPUT_LIMIT = 8 * 1024 * 1024


class BusyError(RuntimeError):
    pass


def redact(text: str, env=None) -> str:
    env = os.environ if env is None else env
    for name in SECRET_NAMES:
        value = env.get(name)
        if value:
            text = text.replace(value, '[REDACTED]')
            text = text.replace(json.dumps(value)[1:-1], '[REDACTED]')
    text = re.sub(r'(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+', 'Bearer [REDACTED]', text)
    return re.sub(r'\bsk-ant-[A-Za-z0-9_-]+', '[REDACTED]', text)


def atomic_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(redact(json.dumps(value, ensure_ascii=False, indent=2)) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextmanager
def file_lock(path: Path, blocking=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+') as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        except BlockingIOError as error:
            raise BusyError(path.name + ' is already held') from error
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def lock_held(path: Path) -> bool:
    try:
        with file_lock(path):
            return False
    except BusyError:
        return True


def read_state(directory: Path) -> dict:
    try:
        state = json.loads((directory / 'state.json').read_text())
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError):
        return {}


def update_state(directory: Path, **changes) -> dict:
    with file_lock(directory / 'state.lock', blocking=True):
        state = read_state(directory)
        state.update(version=1, runtime_note=RUNTIME_NOTE, **changes)
        atomic_json(directory / 'state.json', state)
        return state


def process_info(pid: int | None) -> dict | None:
    if not isinstance(pid, int) or pid <= 0:
        return None
    try:
        # Linux start ticks distinguish a live owner from a subsequently reused PID.
        fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
        return dict(pid=pid, state=fields[0], group=int(fields[2]), session=int(fields[3]), start_token=fields[19])
    except (OSError, IndexError, ValueError):
        return None


def process_token(pid: int | None) -> str | None:
    info = process_info(pid)
    return info['start_token'] if info and info['state'] != 'Z' else None


def group_members(pid: int, start_token: str) -> list[dict]:
    """Read process metadata only; never inspect environment or command contents."""
    leader = process_info(pid)
    if leader and leader['start_token'] != start_token:
        return []  # A reused PID belongs to somebody else.
    members = []
    for entry in Path('/proc').glob('[0-9]*'):
        info = process_info(int(entry.name))
        if (info and info['state'] != 'Z' and info['group'] == pid and info['session'] == pid and
                int(info['start_token']) >= int(start_token)):
            members.append(info)
    return members


def live_recorded_worker(state: dict) -> dict | None:
    job = state.get('active_job') or {}
    pid, token = job.get('child_pid'), job.get('child_start_token')
    if not isinstance(pid, int) or not isinstance(token, str) or not token.isdigit():
        return None
    info = process_info(pid)
    if info and info['start_token'] != token:
        return None
    members = group_members(pid, token)
    if info and info['state'] != 'Z' and not members:
        members = [info]
    if members:
        return dict(reason='recorded_worker_still_alive', run_id=job.get('id'),
                    child_pid=pid, child_start_token=token,
                    members=[dict(pid=item['pid'], start_token=item['start_token']) for item in members],
                    recovery='A previous worker is still alive. No new cycle will start. Inspect its recorded ownership before recovery; stale PIDs are never killed automatically.')
    return None


def owner_alive(owner: dict | None) -> bool:
    return bool(owner and owner.get('start_token') and
                process_token(owner.get('pid')) == owner['start_token'])


def load_config(path: Path) -> dict:
    raw = json.loads(path.read_text())
    if not isinstance(raw, dict) or set(raw) - CONFIG_KEYS:
        raise ValueError('Config must contain only documented non-secret configuration fields')
    config = {**DEFAULTS, **raw}
    for name in ['workspace', 'prompt_path', 'claude_bin']:
        if not isinstance(config.get(name), str) or not Path(config[name]).is_absolute():
            raise ValueError(name + ' must be an absolute path')
        config[name] = str(Path(config[name]).resolve())
    if not Path(config['workspace']).is_dir():
        raise ValueError('workspace does not exist')
    if not Path(config['prompt_path']).is_file():
        raise ValueError('prompt_path does not exist')
    if not Path(config['claude_bin']).is_file() or not os.access(config['claude_bin'], os.X_OK):
        raise ValueError('claude_bin must be an executable file')
    if config.get('agents_file'):
        agents = Path(config['agents_file'])
        if not agents.is_absolute() or not agents.is_file():
            raise ValueError('agents_file must name an existing absolute file')
        config['agents_file'] = str(agents.resolve())
    for name, ceiling in [('interval_seconds', 604800), ('timeout_seconds', 5400),
                          ('max_turns', 100), ('max_budget_usd', 100)]:
        value = config[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= ceiling:
            raise ValueError(name + ' is outside the supported bounds')
    if not isinstance(config['max_turns'], int):
        raise ValueError('max_turns must be an integer')
    if config['effort'] not in ['low', 'medium', 'high', 'xhigh', 'max']:
        raise ValueError('unsupported effort')
    if not isinstance(config['model'], str) or not re.fullmatch(r'claude-[a-z0-9-]+', config['model']):
        raise ValueError('model must be a Claude model identifier')
    return config


def next_future_due(previous: float, now: float, interval: float) -> float:
    """Preserve cadence, skipping missed cycles instead of launching a backlog."""
    return previous + max(1, math.floor((now - previous) / interval) + 1) * interval


def command_for(config: dict) -> list[str]:
    command = [config['claude_bin'], '-p', '--model', config['model'],
               '--effort', config['effort'], '--output-format', 'json',
               '--max-turns', str(config['max_turns']), '--max-budget-usd', str(config['max_budget_usd']),
               '--permission-mode', 'acceptEdits', '--permission-prompts', 'none',
               '--setting-sources', '', '--settings', '{"disableAllHooks":true,"autoMemoryEnabled":false}',
               '--disable-slash-commands', '--tools', 'Bash,Read,Edit,Write,Glob,Grep,Agent',
               '--allowedTools', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Agent',
               '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
               '--no-session-persistence']
    if config.get('agents_file'):
        command.extend(['--agents', config['agents_file']])
    return command


def child_finished(process: subprocess.Popen) -> bool:
    # Keep the exited leader unreaped until its group is cleaned. Its zombie
    # reserves the PID, so cleanup cannot accidentally target a reused group ID.
    try:
        return os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT) is not None
    except ChildProcessError:
        return process.returncode is not None


def terminate_worker(process: subprocess.Popen, start_token: str) -> bool:
    """Clean the whole directly owned session before reaping its leader."""
    leader = process_info(process.pid)
    if leader and leader['start_token'] != start_token:
        return False
    for sig, grace in [(signal.SIGTERM, .5), (signal.SIGKILL, 2)]:
        if not group_members(process.pid, start_token):
            break
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            break
        until = time.monotonic() + grace
        while time.monotonic() < until and group_members(process.pid, start_token):
            time.sleep(.025)
    clean = not group_members(process.pid, start_token)
    if child_finished(process):
        process.wait(timeout=2)
    return clean


def execute_worker(config: dict, prompt: str, stop_file: Path, on_started) -> dict:
    env = os.environ.copy()
    if not env.get('ANTHROPIC_API_KEY_KR2'):
        return dict(status='blocked', error='ANTHROPIC_API_KEY_KR2 is not configured', stdout='', stderr='')
    env['ANTHROPIC_API_KEY'] = env['ANTHROPIC_API_KEY_KR2']
    started = time.monotonic()
    process = subprocess.Popen(command_for(config), cwd=config['workspace'], env=env,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               start_new_session=True, close_fds=True)
    identity = process_info(process.pid)
    # Popen's child cannot be reused before we reap it, even if it exits at once.
    start_token = identity['start_token'] if identity else ''
    buffers = [bytearray(), bytearray()]
    overflow = threading.Event()

    def collect(pipe, index):
        try:
            while chunk := pipe.read(65536):
                available = OUTPUT_LIMIT - len(buffers[index])
                buffers[index].extend(chunk[:available])
                if len(chunk) > available:
                    overflow.set()
        finally:
            pipe.close()

    def supply():
        try:
            process.stdin.write(prompt.encode())
        except (BrokenPipeError, OSError):
            pass
        finally:
            try:
                process.stdin.close()
            except (BrokenPipeError, OSError):
                pass

    readers = [threading.Thread(target=collect, args=(pipe, index), daemon=True)
               for index, pipe in enumerate([process.stdout, process.stderr])]
    writer = threading.Thread(target=supply, daemon=True)
    reason = None
    cleanup_ok = False
    try:
        if not start_token:
            raise RuntimeError('Cannot establish ownership of the worker process')
        on_started(process.pid)
        for thread in [*readers, writer]:
            thread.start()
        while not child_finished(process):
            if stop_file.exists():
                reason = 'cancelled'
            elif time.monotonic() - started >= config['timeout_seconds']:
                reason = 'timed_out'
            elif overflow.is_set():
                reason = 'output_limit'
            if reason:
                break
            time.sleep(.05)
        if not reason and any(item['pid'] != process.pid for item in group_members(process.pid, start_token)):
            reason = 'background_children'
    finally:
        if start_token:
            cleanup_ok = terminate_worker(process, start_token)
        else:
            # Only the just-created, unreaped Popen child is addressed here.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=2)
        for pipe, thread in [(process.stdout, readers[0]), (process.stderr, readers[1]), (process.stdin, writer)]:
            if thread.ident is None:
                pipe.close()
    for thread in readers:
        thread.join(timeout=2)
    if not cleanup_ok:
        reason = 'cleanup_incomplete'
    if any(thread.is_alive() for thread in readers):
        reason = reason or 'output_incomplete'
    if overflow.is_set():
        reason = reason or 'output_limit'
    stdout, stderr = [redact(bytes(buffer).decode(errors='replace'), env) for buffer in buffers]
    result = dict(status=reason or 'failed', returncode=process.returncode,
                  duration_seconds=round(time.monotonic() - started, 3), stdout=stdout, stderr=stderr)
    if not reason:
        try:
            payload = json.loads(stdout)
        except ValueError:
            result['error'] = 'Worker did not return a JSON result'
        else:
            if (process.returncode == 0 and isinstance(payload, dict) and
                    payload.get('type') == 'result' and payload.get('subtype') == 'success' and
                    payload.get('is_error') is False and isinstance(payload.get('result'), str) and payload['result'].strip()):
                result['status'] = 'success'
            else:
                result['error'] = 'Worker did not report a nonempty successful result'
            if isinstance(payload, dict):
                result['worker_receipt'] = {key: payload[key] for key in
                    ['subtype', 'is_error', 'num_turns', 'total_cost_usd', 'modelUsage'] if key in payload}
    return result


def run_once(directory: Path, config_path: Path, trigger='manual') -> dict:
    with file_lock(directory / 'job.lock'):
        blocker = live_recorded_worker(read_state(directory))
        if blocker:
            raise BusyError('A recorded worker is still alive; refusing an overlapping cycle')
        run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
        run_dir = directory / 'runs' / run_id
        run_dir.mkdir(parents=True, mode=0o700)
        began = time.time()
        job = dict(id=run_id, trigger=trigger, started_at=began, pid=os.getpid(),
                   start_token=process_token(os.getpid()), run_dir=str(run_dir))
        update_state(directory, active_job=job)
        receipt = dict(id=run_id, trigger=trigger, started_at=began, run_dir=str(run_dir))
        try:
            config = load_config(config_path)
            prompt = Path(config['prompt_path']).read_text()
            if not prompt.strip() or len(prompt.encode()) > 256 * 1024:
                raise ValueError('prompt must be nonempty and at most 256 KiB')
            receipt.update(model=config['model'], workspace=config['workspace'],
                           prompt_sha256=hashlib.sha256(prompt.encode()).hexdigest(),
                           max_budget_usd=config['max_budget_usd'], max_turns=config['max_turns'])
            prompt = (f'Cycle ID: {run_id}\nCycle evidence directory: {run_dir}\n'
                      f'Authorized working checkout: {config["workspace"]}\n'
                      'Keep validation logs and screenshots in the cycle evidence directory. '
                      'Do not print credentials or dump the environment. Do not start background services that outlive this cycle.\n\n' + prompt)
            if (directory / 'stop.requested').exists():
                result = dict(status='cancelled', stdout='', stderr='')
            else:
                def record_child(pid):
                    identity = process_info(pid)
                    update_state(directory, active_job={**job, 'child_pid': pid, 'child_start_token': identity['start_token'] if identity else None})
                result = execute_worker(config, prompt, directory / 'stop.requested', record_child)
            stdout, stderr = result.pop('stdout'), result.pop('stderr')
            (run_dir / 'result.json').write_text(redact(stdout))
            (run_dir / 'stderr.log').write_text(redact(stderr))
            receipt.update(result)
        except Exception as error:
            receipt.update(status='failed', error=redact(f'{type(error).__name__}: {error}'))
        finally:
            receipt['finished_at'] = time.time()
            atomic_json(run_dir / 'receipt.json', receipt)
            current = read_state(directory)
            # Failed cleanup remains discoverable after this process releases its lock.
            update_state(directory, active_job=current.get('active_job') if live_recorded_worker(current) else None, last_run=receipt)
        return receipt


def status(directory: Path) -> dict:
    state = read_state(directory)
    job_locked = lock_held(directory / 'job.lock')
    blocker = None if job_locked else live_recorded_worker(state)
    return {**state, 'running': owner_alive(state.get('daemon')) and lock_held(directory / 'daemon.lock'),
            'job_running': job_locked or bool(blocker), 'blocker': blocker,
            'stop_requested': (directory / 'stop.requested').exists(), 'runtime_note': RUNTIME_NOTE}


def daemon(directory: Path, config_path: Path, immediate=False) -> int:
    with file_lock(directory / 'daemon.lock'):
        config = load_config(config_path)
        interval = config['interval_seconds']
        now = time.time()
        saved = read_state(directory)
        previous = saved.get('next_due')
        # A cadence change starts a new interval instead of retaining an old two-hour deadline.
        if saved.get('interval_seconds', interval) != interval:
            previous = None
        due = now if immediate else (previous if isinstance(previous, (int, float)) and math.isfinite(previous) else now + interval)
        if not immediate and due <= now:
            due = next_future_due(due, now, interval)
        owner = dict(pid=os.getpid(), start_token=process_token(os.getpid()), started_at=now)
        update_state(directory, daemon=owner, phase='waiting', config_path=str(config_path),
                     interval_seconds=interval, next_due=due, heartbeat_at=now)

        def request_stop(_signum, _frame):
            (directory / 'stop.requested').touch()
        signal.signal(signal.SIGTERM, request_stop)
        signal.signal(signal.SIGINT, request_stop)
        try:
            while not (directory / 'stop.requested').exists():
                now = time.time()
                if now >= due:
                    update_state(directory, phase='running', heartbeat_at=now)
                    try:
                        run_once(directory, config_path, trigger='scheduled')
                    except BusyError:
                        update_state(directory, last_skipped_at=time.time(), skip_reason='another cycle is running')
                    due = next_future_due(due, time.time(), interval)
                    update_state(directory, phase='waiting', next_due=due, heartbeat_at=time.time())
                time.sleep(min(.25, max(.01, due - time.time())))
        finally:
            update_state(directory, daemon=None, phase='stopped', stopped_at=time.time())
    return 0


def start(directory: Path, config_path: Path, immediate=False) -> dict:
    load_config(config_path)
    if not os.environ.get('ANTHROPIC_API_KEY_KR2'):
        raise ValueError('ANTHROPIC_API_KEY_KR2 is not configured')
    with file_lock(directory / 'control.lock'):
        existing = status(directory)
        if existing['blocker']:
            raise BusyError('A recorded worker is still alive; refusing to start another loop')
        if existing['running']:
            return {**existing, 'start_result': 'already_running'}
        if lock_held(directory / 'daemon.lock'):
            raise BusyError('daemon is starting or its owner cannot be verified')
        if existing['job_running']:
            raise BusyError('wait for the current manual cycle before starting the loop')
        (directory / 'stop.requested').unlink(missing_ok=True)
        command = [sys.executable, str(Path(__file__).resolve()), '--state-dir', str(directory),
                   '_daemon', '--config', str(config_path)]
        if immediate:
            command.append('--now')
        with (directory / 'daemon.log').open('ab') as log:
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                     start_new_session=True, close_fds=True)
        # Reap children when this caller remains alive (tests or imported usage).
        # The daemon thread does not hold the short-lived start CLI open.
        threading.Thread(target=child.wait, daemon=True).start()
        until = time.monotonic() + 3
        while time.monotonic() < until:
            current = status(directory)
            if current['running'] and current.get('daemon', {}).get('pid') == child.pid:
                return {**current, 'start_result': 'started'}
            if child.poll() is not None:
                raise RuntimeError('scheduler exited during startup; inspect daemon.log')
            time.sleep(.05)
        raise RuntimeError('scheduler startup was not confirmed within 3 seconds; inspect status')


def stop(directory: Path) -> dict:
    # No signal is sent to a PID read from a file. The owner notices this flag and
    # terminates only the child process group it started itself.
    with file_lock(directory / 'control.lock'):
        (directory / 'stop.requested').touch()
    until = time.monotonic() + 3
    while time.monotonic() < until:
        current = status(directory)
        if not current['running'] and not current['job_running']:
            return current
        time.sleep(.05)
    return status(directory)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir', type=Path, default=DEFAULT_STATE)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ['start', 'run-once', '_daemon']:
        command = commands.add_parser(name)
        command.add_argument('--config', type=Path, required=True)
        if name != 'run-once':
            command.add_argument('--now', action='store_true')
    commands.add_parser('status')
    commands.add_parser('stop')
    args = parser.parse_args(argv)
    directory = args.state_dir.resolve()
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    try:
        if args.command == '_daemon':
            return daemon(directory, args.config.resolve(), args.now)
        if args.command == 'start':
            result = start(directory, args.config.resolve(), args.now)
        elif args.command == 'run-once':
            with file_lock(directory / 'control.lock'):
                current = status(directory)
                if not current['running'] and not current['job_running']:
                    (directory / 'stop.requested').unlink(missing_ok=True)
            result = run_once(directory, args.config.resolve())
        elif args.command == 'stop':
            result = stop(directory)
        else:
            result = status(directory)
        print(redact(json.dumps(result, ensure_ascii=False, indent=2)))
        return 0 if args.command != 'run-once' or result['status'] == 'success' else 1
    except Exception as error:
        print(redact(json.dumps({'error': str(error), 'type': type(error).__name__, 'runtime_note': RUNTIME_NOTE})), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
