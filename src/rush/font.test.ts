import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

// The rush screens use a subset of Bagel Fat One (cycle 24). A character used in a rush source but missing from
// the subset would fall back to another font, so this fails until tools/rush-font-subset.py is rerun.
test('every character the rush sources use is in the display-font subset', async () => {
  const dir = new URL('./', import.meta.url);
  const files = (await readdir(dir)).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).map(f => new URL(f, dir));
  files.push(new URL('../../rush.html', dir), new URL('./rush.css', dir));
  const kept = new Set(await readFile(new URL('./fonts/bagel-rush.chars.txt', dir), 'utf8'));
  const missing = new Set<string>();
  for (const f of files) for (const ch of await readFile(f, 'utf8')) if (ch.codePointAt(0)! > 0x7e && !/\s/.test(ch) && !kept.has(ch)) missing.add(ch);
  assert.equal([...missing].join(''), '', 'rerun: python3 tools/rush-font-subset.py');
});
