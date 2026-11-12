#!/usr/bin/env python3
"""One narrowly scoped Fable image review; never retries or exposes credentials."""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
ENDPOINT = 'https://api.anthropic.com/v1/messages'
MODEL = 'claude-fable-5-2'
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PROMPT_BYTES = 16 * 1024


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def scoped_file(path: str, limit: int) -> tuple[Path, bytes]:
    """Read only ordinary files within this worktree, capped before allocation."""
    real = (ROOT / path).resolve()
    if not real.is_relative_to(ROOT.resolve()) or not real.is_file():
        raise ValueError('input must be an existing file inside the project')
    with real.open('rb') as stream:
        data = stream.read(limit + 1)
    if not data or len(data) > limit:
        raise ValueError(f'input must be nonempty and at most {limit} bytes')
    return real, data


def image_mime(data: bytes) -> str:
    # Signature validation is not full image decoding.
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    raise ValueError('image must have a PNG, JPEG or WebP signature')


def parse_events(lines):
    text = []
    meta = {'model': None, 'stop_reason': None, 'usage': None, 'message_stop': False}
    for raw in lines:
        line = raw.decode('utf-8').strip()
        if not line.startswith('data: '):
            continue
        event = json.loads(line[6:])
        kind = event.get('type')
        if kind == 'message_start':
            meta['model'] = event.get('message', {}).get('model')
            meta['start_usage'] = event.get('message', {}).get('usage')
        elif kind == 'content_block_delta' and event.get('delta', {}).get('type') == 'text_delta':
            text.append(event['delta'].get('text', ''))
        elif kind == 'message_delta':
            meta['stop_reason'] = event.get('delta', {}).get('stop_reason')
            meta['usage'] = event.get('usage')
        elif kind == 'message_stop':
            meta['message_stop'] = True
        elif kind == 'error':
            raise RuntimeError('stream reported an error; outcome and cost may be unknown')
    return ''.join(text), meta


def output_dir(path: str) -> Path:
    # Avoid overwriting existing evidence and writing to arbitrary paths.
    candidate = (ROOT / path).resolve()
    docs = (ROOT / 'docs').resolve()
    if not candidate.is_relative_to(docs) or candidate == docs:
        raise ValueError('output directory must be a new directory within docs/')
    return candidate


def run(args) -> int:
    if not 1 <= args.max_tokens <= 5000:
        raise ValueError('max-tokens must be between 1 and 5000')
    if not 1 <= args.timeout <= 300:
        raise ValueError('timeout must be between 1 and 300 seconds per socket operation')
    image_path, image = scoped_file(args.image, MAX_IMAGE_BYTES)
    prompt_path, prompt_bytes = scoped_file(args.prompt_file, MAX_PROMPT_BYTES)
    mime = image_mime(image)
    try:
        prompt = prompt_bytes.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise ValueError('prompt must be UTF-8') from exc
    if not prompt.strip():
        raise ValueError('prompt must not be blank')
    output = output_dir(args.output_dir)
    key = os.environ.get('ANTHROPIC_API_KEY_KR2')
    if not key:
        raise ValueError('ANTHROPIC_API_KEY_KR2 is not set')
    fingerprint = sha(json.dumps({'model': MODEL, 'effort': args.effort, 'max_tokens': args.max_tokens,
                                  'image_sha256': sha(image), 'prompt_sha256': sha(prompt_bytes)}, sort_keys=True).encode())
    # The local ledger prevents duplicate submissions, including after a timeout.
    ledger = ROOT / '.fable-review.local'
    if ledger.is_symlink():
        raise ValueError('request ledger must not be a symlink')
    ledger.mkdir(exist_ok=True, mode=0o700)
    marker = ledger / fingerprint
    output.mkdir(parents=True, exist_ok=False)
    try:
        fd = os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w') as file:
            file.write(str(output.relative_to(ROOT)) + '\n')
    except FileExistsError:
        output.rmdir()
        raise ValueError('identical request already recorded locally; inspect previous result before another paid call')
    receipt = {
        'requested_model': MODEL, 'effort': args.effort, 'max_tokens': args.max_tokens,
        'image_path': str(image_path.relative_to(ROOT)), 'image_sha256': sha(image), 'image_bytes': len(image),
        'image_mime': mime, 'prompt_path': str(prompt_path.relative_to(ROOT)), 'prompt_sha256': sha(prompt_bytes),
        'request_fingerprint': fingerprint, 'created_utc': datetime.now(timezone.utc).isoformat(),
        'status': 'outcome_unknown', 'cost': 'unknown',
    }
    receipt_path = output / 'receipt.json'
    def save():
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    save()  # A crash after this point may leave the paid request outcome unknown.
    payload = {'model': MODEL, 'max_tokens': args.max_tokens, 'stream': True,
               'thinking': {'type': 'adaptive'}, 'output_config': {'effort': args.effort},
               'messages': [{'role': 'user', 'content': [
                   {'type': 'image', 'source': {'type': 'base64', 'media_type': mime, 'data': base64.b64encode(image).decode()}},
                   {'type': 'text', 'text': prompt}]}]}
    request = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(), headers={
        'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': key})
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            text, meta = parse_events(response)
        receipt.update(meta)
        receipt['text_characters'] = len(text)
        if not meta['message_stop']:
            receipt['status'] = 'incomplete_stream'
        elif meta['model'] != MODEL:
            receipt['status'] = 'model_mismatch'
        elif meta['usage'] is None:
            receipt['status'] = 'missing_usage'
        elif not text.strip():
            receipt['status'] = 'empty_response'
        elif meta['stop_reason'] != 'end_turn':
            receipt['status'] = 'truncated_or_other_stop'
        else:
            receipt['status'] = 'complete'
        if text:
            (output / 'response.md').write_text(text, encoding='utf-8')
    except urllib.error.HTTPError as exc:
        receipt['http_status'] = exc.code
        receipt['status'] = 'http_rejected' if 400 <= exc.code < 500 else 'outcome_unknown'
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError, ValueError, RuntimeError):
        receipt['status'] = 'outcome_unknown'
    finally:
        save()
    print(f"status={receipt['status']} receipt={receipt_path.relative_to(ROOT)}; cost unknown; no retry")
    return 0 if receipt['status'] == 'complete' else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description='Send exactly one image review request; no retries.')
    parser.add_argument('--image', required=True, help='Image file inside the project (PNG/JPEG/WebP; <= 5 MiB)')
    parser.add_argument('--prompt-file', required=True, help='UTF-8 prompt file inside the project')
    parser.add_argument('--output-dir', required=True, help='New output directory within docs/')
    parser.add_argument('--effort', required=True, choices=['low', 'medium', 'high', 'xhigh', 'max'])
    parser.add_argument('--max-tokens', type=int, default=3000)
    parser.add_argument('--timeout', type=int, default=120)
    args = parser.parse_args(argv)
    try:
        return run(args)
    except ValueError as exc:
        print(f'preflight failed: {exc}', file=sys.stderr)
        return 2
    except OSError:
        print('preflight failed: filesystem error', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
