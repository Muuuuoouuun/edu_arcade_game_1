import argparse
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError, HTTPError

import fable_image_review as review


class Response:
    def __init__(self, events): self.events = events
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def __iter__(self):
        return iter([('data: ' + json.dumps(x) + '\n').encode() for x in self.events])


def events(text='좋은 검토', stop='end_turn', ended=True):
    result = [{'type': 'message_start', 'message': {'model': 'claude-fable-5-2', 'usage': {'input_tokens': 100}}},
              {'type': 'content_block_delta', 'delta': {'type': 'thinking_delta', 'thinking': 'should not be saved'}},
              {'type': 'content_block_delta', 'delta': {'type': 'text_delta', 'text': text}},
              {'type': 'message_delta', 'delta': {'stop_reason': stop}, 'usage': {'output_tokens': 42}}]
    if ended: result.append({'type': 'message_stop'})
    return result


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'docs').mkdir()
        (self.root / 'image.png').write_bytes(b'\x89PNG\r\n\x1a\nexample')
        (self.root / 'prompt.txt').write_text('검토 요청', encoding='utf-8')
        self.root_patch = patch.object(review, 'ROOT', self.root)
        self.root_patch.start()
        self.env = patch.dict(os.environ, {'ANTHROPIC_API_KEY_KR2': 'SECRET-TEST-KEY'})
        self.env.start()
        self.args = argparse.Namespace(image='image.png', prompt_file='prompt.txt', output_dir='docs/result', effort='high', max_tokens=3000, timeout=20)

    def tearDown(self): self.env.stop(); self.root_patch.stop(); self.temp.cleanup()
    def receipt(self): return json.loads((self.root / self.args.output_dir / 'receipt.json').read_text())
    def call(self):
        with contextlib.redirect_stdout(io.StringIO()): return review.run(self.args)

    def test_complete_and_identical_request_cannot_resubmit(self):
        with patch.object(review.urllib.request, 'urlopen', return_value=Response(events())) as call:
            self.assertEqual(self.call(), 0)
            request = call.call_args.args[0]
            body = json.loads(request.data)
            self.assertEqual(body['model'], 'claude-fable-5-2')
            self.assertEqual(body['output_config'], {'effort': 'high'})
            self.assertEqual(body['thinking'], {'type': 'adaptive'})
            self.assertTrue(body['stream'])
            self.assertEqual(body['messages'][0]['content'][0]['source']['media_type'], 'image/png')
            receipt = self.receipt()
            self.assertEqual(receipt['status'], 'complete')
            self.assertEqual(receipt['usage']['output_tokens'], 42)
            self.assertEqual((self.root/'docs/result/response.md').read_text(), '좋은 검토')
            self.assertNotIn('SECRET-TEST-KEY', (self.root/'docs/result/receipt.json').read_text())
            self.assertNotIn('should not be saved', (self.root/'docs/result/response.md').read_text())
            self.args.output_dir = 'docs/result2'
            with self.assertRaisesRegex(ValueError, 'identical request'): self.call()
            self.assertEqual(call.call_count, 1)
            self.assertFalse((self.root/'docs/result2').exists())

    def test_empty_or_unfinished_not_success(self):
        for index, (payload, expected) in enumerate([(events('', 'max_tokens'), 'empty_response'), (events('partial', ended=False), 'incomplete_stream'), (events('partial', 'max_tokens'), 'truncated_or_other_stop')]):
            self.args.output_dir = f'docs/res{index}'
            self.args.max_tokens += 1
            with patch.object(review.urllib.request, 'urlopen', return_value=Response(payload)):
                self.assertEqual(self.call(), 1)
            self.assertEqual(self.receipt()['status'], expected)

    def test_model_mismatch_is_not_success(self):
        payload = events()
        payload[0]['message']['model'] = 'other-model'
        with patch.object(review.urllib.request, 'urlopen', return_value=Response(payload)):
            self.assertEqual(self.call(), 1)
        self.assertEqual(self.receipt()['status'], 'model_mismatch')

    def test_missing_usage_is_not_success(self):
        payload = events()
        del payload[3]['usage']
        with patch.object(review.urllib.request, 'urlopen', return_value=Response(payload)):
            self.assertEqual(self.call(), 1)
        self.assertEqual(self.receipt()['status'], 'missing_usage')

    def test_timeout_is_unknown_and_never_retried(self):
        with patch.object(review.urllib.request, 'urlopen', side_effect=URLError('timed out SECRET-TEST-KEY')) as call:
            self.assertEqual(self.call(), 1)
            self.assertEqual(call.call_count, 1)
        self.assertEqual(self.receipt()['status'], 'outcome_unknown')
        self.assertNotIn('SECRET-TEST-KEY', (self.root/'docs/result/receipt.json').read_text())

    def test_http_rejection_is_recorded_without_body(self):
        failure = HTTPError('https://example.invalid', 401, 'secret', {}, None)
        with patch.object(review.urllib.request, 'urlopen', side_effect=failure): self.assertEqual(self.call(), 1)
        self.assertEqual(self.receipt()['status'], 'http_rejected')
        self.assertEqual(self.receipt()['http_status'], 401)

    def test_preflight_rejects_bad_image_and_paths(self):
        with self.assertRaises(ValueError): review.image_mime(b'nope')
        self.assertEqual(review.image_mime(b'RIFFxxxxWEBPpayload'), 'image/webp')
        self.assertEqual(review.image_mime(b'\xff\xd8\xffexample'), 'image/jpeg')
        (self.root/'large.png').write_bytes(b'x' * (review.MAX_IMAGE_BYTES+1))
        with self.assertRaises(ValueError): review.scoped_file('large.png', review.MAX_IMAGE_BYTES)
        with self.assertRaises(ValueError): review.output_dir('../escape')
        self.args.max_tokens = 5001
        with patch.object(review.urllib.request, 'urlopen') as call:
            with self.assertRaises(ValueError): self.call()
            call.assert_not_called()

    def test_ledger_symlink_rejected(self):
        (self.root/'.fable-review.local').symlink_to('/tmp')
        with patch.object(review.urllib.request, 'urlopen') as call:
            with self.assertRaises(ValueError): self.call()
            call.assert_not_called()

if __name__ == '__main__': unittest.main()
