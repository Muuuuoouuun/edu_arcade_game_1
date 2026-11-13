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

test('music score (1.0, completion C4): moods, tempos, drums only where they belong, a 16-bar loop', async () => {
  const { musicBar } = await import('./music.ts');
  const moods = ['title', 'town', 'battle', 'boss'] as const;
  for (const mood of moods) {
    for (let bar = 0; bar < 16; bar++) {
      const b = musicBar(mood, bar);
      assert.ok(b.notes.every(n => n.t >= 0 && n.t < 4 && n.t + n.dur <= 4 + 1e-9), `${mood} ${bar}: notes stay in the bar`);
      assert.ok(b.notes.every((n, i) => i === 0 || b.notes[i - 1].t <= n.t), `${mood} ${bar}: sorted`);
      assert.deepEqual(musicBar(mood, bar + 16), b, `${mood}: a 16-bar loop`);
    }
  }
  const voices = (mood: typeof moods[number]) => new Set(Array.from({ length: 16 }, (_, b) => musicBar(mood, b).notes.map(n => n.voice)).flat());
  assert.ok(!voices('town').has('kick') && !voices('town').has('snare') && !voices('town').has('hat'), 'town is calm: no drums');
  for (const mood of ['battle', 'boss'] as const) assert.ok(voices(mood).has('kick') && voices(mood).has('snare'), `${mood} drives with kick and snare`);
  assert.equal(musicBar('battle', 0).tempo, musicBar('boss', 0).tempo, 'battle and boss share a tempo so a boss arrival stays in step');
  assert.ok(musicBar('town', 0).tempo < musicBar('battle', 0).tempo, 'town is slower than battle');
});
