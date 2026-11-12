import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO, createFrameWatch, nextPref, parsePref, QUALITY, resolveQuality, watchFrame } from './quality.ts';

const feed = (fps: number, seconds: number, w = createFrameWatch()) => {
  let drops = 0;
  for (let t = 0; t < seconds; t += 1 / fps) if (watchFrame(w, 1 / fps)) drops++;
  return { w, drops };
};

test('auto quality drops once on a slow device and never on a fast one', () => {
  assert.equal(feed(60, 30).drops, 0);
  assert.equal(feed(45, 30).drops, 0);
  const slow = feed(25, 30);
  assert.equal(slow.drops, 1, 'drops exactly once');
  assert.ok(slow.w.dropped);
});

test('auto quality ignores the warm-up and long gaps', () => {
  // Slow only during warm-up (loading, shader compile), then fast: no drop.
  const w = createFrameWatch();
  feed(10, AUTO.warmup - 0.2, w);
  assert.equal(feed(60, 20, w).drops, 0);
  // Tab switches and hitches longer than maxGap are not frames.
  const g = createFrameWatch();
  let drops = 0;
  for (let i = 0; i < 400; i++) { if (watchFrame(g, 1 / 60)) drops++; if (i % 50 === 0 && watchFrame(g, 1.5)) drops++; }
  assert.equal(drops, 0);
  assert.equal(watchFrame(createFrameWatch(), Number.NaN), false);
});

test('quality preference cycles, parses safely and resolves', () => {
  assert.equal(nextPref('auto'), 'high');
  assert.equal(nextPref('high'), 'low');
  assert.equal(nextPref('low'), 'auto');
  assert.equal(parsePref('low'), 'low');
  assert.equal(parsePref('ultra'), 'auto');
  assert.equal(parsePref(null), 'auto');
  assert.equal(resolveQuality('auto', false), 'high');
  assert.equal(resolveQuality('auto', true), 'low');
  assert.equal(resolveQuality('high', true), 'high');
  assert.ok(QUALITY.low.pixelRatio < QUALITY.high.pixelRatio);
  assert.ok(!QUALITY.low.terrainOutlines && QUALITY.high.terrainOutlines);
});
