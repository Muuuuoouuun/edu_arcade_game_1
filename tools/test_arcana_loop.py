import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('arcana_loop', Path(__file__).with_name('arcana_loop.py'))
loop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loop)

FAKE = '''#!/usr/bin/env python3
import json, os, subprocess, sys, time
from pathlib import Path
sys.stdin.read()
mode=os.environ.get('ARCANA_FAKE_WORKER','success')
if mode=='sleep': time.sleep(20)
if mode.startswith('group_'):
 pidfile=os.environ['ARCANA_FAKE_CHILD_PID_FILE']
 program="import os,signal,time;from pathlib import Path;signal.signal(signal.SIGTERM,signal.SIG_IGN);Path(os.environ['ARCANA_FAKE_CHILD_PID_FILE']).write_text(str(os.getpid()));time.sleep(20)"
 options={'stdout':subprocess.DEVNULL,'stderr':subprocess.DEVNULL} if mode=='group_null' else {}
 subprocess.Popen([sys.executable,'-c',program],**options)
 until=time.monotonic()+2
 while not Path(pidfile).exists() and time.monotonic()<until:time.sleep(.01)
 if mode=='group_sleep':time.sleep(20)
if mode=='invalid': print('not JSON'); raise SystemExit(0)
if mode=='error': print(json.dumps({'type':'result','subtype':'error_max_turns','is_error':True,'result':'unfinished'})); raise SystemExit(0)
if mode=='empty': print(json.dumps({'type':'result','subtype':'success','is_error':False,'result':' '})); raise SystemExit(0)
text='checked '+os.environ.get('ANTHROPIC_API_KEY','')
print(json.dumps({'type':'result','subtype':'success','is_error':False,'result':text}))
print('Bearer '+os.environ.get('ANTHROPIC_API_KEY',''),file=sys.stderr)
if mode=='nonzero': raise SystemExit(2)
'''


class LoopTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.state = self.base / 'state'
        self.state.mkdir()
        self.workspace = self.base / 'workspace'
        self.workspace.mkdir()
        self.worker = self.base / 'worker'
        self.worker.write_text(FAKE)
        self.worker.chmod(0o700)
        self.prompt = self.base / 'prompt.md'
        self.prompt.write_text('Inspect only this fake workspace and report.')
        self.config = self.base / 'config.json'
        self.write_config()
        self.environment = patch.dict(os.environ, {'ANTHROPIC_API_KEY_KR2': 'fake-test-credential-arcana', 'ARCANA_FAKE_WORKER': 'success'})
        self.environment.start()

    def tearDown(self):
        loop.stop(self.state)
        self.environment.stop()
        self.temp.cleanup()

    def write_config(self, **overrides):
        data = dict(workspace=str(self.workspace), prompt_path=str(self.prompt), claude_bin=str(self.worker),
                    interval_seconds=7200, timeout_seconds=2)
        data.update(overrides)
        self.config.write_text(json.dumps(data))

    def test_skips_missed_intervals_without_catchup(self):
        self.assertEqual(loop.next_future_due(100, 100, 7200), 7300)
        self.assertEqual(loop.next_future_due(100, 7301, 7200), 14500)
        self.assertEqual(loop.next_future_due(100, 28900, 7200), 36100)

    def test_success_is_recorded_and_credentials_are_redacted(self):
        receipt = loop.run_once(self.state, self.config)
        self.assertEqual(receipt['status'], 'success')
        files = list(self.state.rglob('*.json')) + list(self.state.rglob('*.log'))
        for path in files:
            self.assertNotIn('fake-test-credential-arcana', path.read_text())
        result = json.loads((Path(receipt['run_dir']) / 'result.json').read_text())
        self.assertEqual(result['result'], 'checked [REDACTED]')
        self.assertIsNone(loop.read_state(self.state)['active_job'])

    def test_failed_empty_invalid_and_nonzero_results_are_not_success(self):
        for mode in ['error', 'empty', 'invalid', 'nonzero']:
            with self.subTest(mode=mode), patch.dict(os.environ, {'ARCANA_FAKE_WORKER': mode}):
                self.assertEqual(loop.run_once(self.state, self.config)['status'], 'failed')

    def test_job_lock_prevents_overlap(self):
        with loop.file_lock(self.state / 'job.lock'):
            with self.assertRaises(loop.BusyError):
                loop.run_once(self.state, self.config)
        self.assertFalse((self.state / 'runs').exists())

    def test_timeout_stops_only_owned_worker_and_releases_job_lock(self):
        self.write_config(timeout_seconds=.15)
        with patch.dict(os.environ, {'ARCANA_FAKE_WORKER': 'sleep'}):
            started = time.monotonic()
            result = loop.run_once(self.state, self.config)
        self.assertEqual(result['status'], 'timed_out')
        self.assertLess(time.monotonic() - started, 3)
        self.assertFalse(loop.lock_held(self.state / 'job.lock'))

    def test_stop_flag_prevents_a_worker_from_starting(self):
        (self.state / 'stop.requested').touch()
        result = loop.run_once(self.state, self.config)
        self.assertEqual(result['status'], 'cancelled')

    def test_stop_flag_cancels_the_active_owned_worker(self):
        self.write_config(timeout_seconds=10)
        results = []
        with patch.dict(os.environ, {'ARCANA_FAKE_WORKER': 'sleep'}):
            thread = threading.Thread(target=lambda: results.append(loop.run_once(self.state, self.config)))
            thread.start()
            until = time.monotonic() + 2
            while time.monotonic() < until and not (loop.read_state(self.state).get('active_job') or {}).get('child_pid'):
                time.sleep(.02)
            self.assertTrue((loop.read_state(self.state).get('active_job') or {}).get('child_pid'))
            stopped = loop.stop(self.state)
            thread.join(timeout=2)
        self.assertFalse(thread.is_alive())
        self.assertEqual(results[0]['status'], 'cancelled')
        self.assertFalse(stopped['job_running'])

    def test_missing_prompt_records_failure_in_state(self):
        self.prompt.unlink()
        result = loop.run_once(self.state, self.config)
        self.assertEqual(result['status'], 'failed')
        self.assertIn('prompt_path', result['error'])
        self.assertEqual(loop.read_state(self.state)['last_run']['status'], 'failed')

    def test_missing_credential_does_not_launch_worker(self):
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY_KR2': ''}):
            result = loop.run_once(self.state, self.config)
        self.assertEqual(result['status'], 'blocked')

    def test_configuration_rejects_embedded_credentials(self):
        self.write_config(api_key='must-not-be-read-by-worker')
        with self.assertRaises(ValueError):
            loop.load_config(self.config)

    def test_claude_command_has_no_secret_and_uses_explicit_mcp(self):
        command = loop.command_for(loop.load_config(self.config))
        self.assertNotIn('fake-test-credential-arcana', ' '.join(command))
        self.assertEqual(command[command.index('--mcp-config') + 1], '{"mcpServers":{}}')
        self.assertIn('--no-session-persistence', command)
        self.assertNotIn('--bare', command)
        self.assertEqual(command[command.index('--tools') + 1], 'Bash,Read,Edit,Write,Glob,Grep,Agent')
        self.assertEqual(command[command.index('--setting-sources') + 1], '')
        self.assertEqual(json.loads(command[command.index('--settings') + 1]), {'disableAllHooks': True, 'autoMemoryEnabled': False})

    def test_state_corruption_falls_back_without_executing(self):
        (self.state / 'state.json').write_text('broken')
        self.assertFalse(loop.status(self.state)['running'])
        self.assertEqual(loop.read_state(self.state), {})

    def test_reused_or_unrelated_pid_is_not_treated_as_daemon(self):
        loop.update_state(self.state, daemon={'pid': os.getpid(), 'start_token': 'not-the-current-start-time'})
        self.assertFalse(loop.status(self.state)['running'])
        with patch.object(loop.os, 'killpg') as kill:
            loop.stop(self.state)
            kill.assert_not_called()

    def test_daemon_start_confirms_identity_is_single_and_stops_by_flag(self):
        began = time.time()
        first = loop.start(self.state, self.config)
        self.assertTrue(first['running'])
        self.assertGreaterEqual(first['next_due'], began + 7199)
        second = loop.start(self.state, self.config)
        self.assertEqual(second['start_result'], 'already_running')
        self.assertEqual(first['daemon']['pid'], second['daemon']['pid'])
        stopped = loop.stop(self.state)
        self.assertFalse(stopped['running'])
        self.assertFalse(stopped['job_running'])
        self.assertIn('environment', stopped['runtime_note'])

    def test_restart_keeps_future_due_but_skips_expired_due(self):
        due = time.time() + 1200
        loop.update_state(self.state, next_due=due)
        first = loop.start(self.state, self.config)
        self.assertEqual(first['next_due'], due)
        loop.stop(self.state)
        expired = time.time() - 20000
        loop.update_state(self.state, next_due=expired)
        restarted = loop.start(self.state, self.config)
        self.assertGreater(restarted['next_due'], time.time())
        self.assertIsNone(restarted.get('last_run'))

    def test_orphan_worker_blocks_start_and_run_once_without_locks(self):
        worker = subprocess.Popen([os.sys.executable, '-c', 'import time;time.sleep(20)'], start_new_session=True)
        try:
            loop.update_state(self.state, active_job={'id': 'crashed-cycle', 'child_pid': worker.pid,
                              'child_start_token': loop.process_token(worker.pid)})
            current = loop.status(self.state)
            self.assertFalse(current['running'])
            self.assertTrue(current['job_running'])
            self.assertEqual(current['blocker']['reason'], 'recorded_worker_still_alive')
            with patch.object(loop.subprocess, 'Popen') as create:
                with self.assertRaises(loop.BusyError):
                    loop.start(self.state, self.config)
                with self.assertRaises(loop.BusyError):
                    loop.run_once(self.state, self.config)
                create.assert_not_called()
            self.assertEqual(loop.read_state(self.state)['active_job']['child_pid'], worker.pid)
            self.assertFalse((self.state / 'runs').exists())
        finally:
            os.killpg(worker.pid, signal.SIGKILL)
            worker.wait()

    def test_stale_active_worker_pid_does_not_block_or_signal_unrelated_process(self):
        loop.update_state(self.state, active_job={'child_pid': os.getpid(), 'child_start_token': '1'})
        self.assertIsNone(loop.status(self.state)['blocker'])
        with patch.object(loop.os, 'killpg') as kill:
            loop.stop(self.state)
            kill.assert_not_called()
        (self.state / 'stop.requested').unlink()
        self.assertEqual(loop.run_once(self.state, self.config)['status'], 'success')

    def test_callback_failure_cleans_just_started_process(self):
        owned = []
        def fail(pid):
            owned.append((pid, loop.process_info(pid)['start_token']))
            raise OSError('state write failed')
        with self.assertRaisesRegex(OSError, 'state write failed'):
            loop.execute_worker(loop.load_config(self.config), 'inspect', self.state / 'stop.requested', fail)
        self.assertIsNone(loop.process_token(owned[0][0]))
        self.assertEqual(loop.group_members(*owned[0]), [])

    def test_group_children_are_killed_after_timeout_or_successful_leader_exit(self):
        for mode in ['group_sleep', 'group_exit', 'group_null']:
            with self.subTest(mode=mode):
                pidfile = self.base / (mode + '.pid')
                self.write_config(timeout_seconds=.35 if mode=='group_sleep' else 3)
                with patch.dict(os.environ, {'ARCANA_FAKE_WORKER': mode, 'ARCANA_FAKE_CHILD_PID_FILE': str(pidfile)}):
                    result = loop.run_once(self.state, self.config)
                self.assertTrue(pidfile.exists(), 'fixture child installed its SIGTERM-ignoring handler')
                self.assertIsNone(loop.process_token(int(pidfile.read_text())))
                self.assertEqual(result['status'], 'timed_out' if mode=='group_sleep' else 'background_children')
                self.assertFalse(loop.lock_held(self.state / 'job.lock'))
                self.assertIsNone(loop.status(self.state)['blocker'])


if __name__ == '__main__':
    unittest.main()
