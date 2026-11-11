import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spriteAsset } from '../defense/art.ts';
import { legionWolfAsset, legionWolfFrame, LEGION_WOLF_SIZE, WOLF_BASE, WOLF_GROUND_Y, WOLF_ILLUSTRATION, WOLF_WALK } from './wolfMotion.ts';

test('Legion wolf gait follows travelled distance with a size-scaled eight-pose cycle', () => {
  const size = LEGION_WOLF_SIZE, stride = 40 * size / 68;
  for (let frame = 0; frame < 8; frame++) assert.equal(legionWolfFrame(stride * (frame + .1) / 8, size, false), frame);
  assert.equal(legionWolfFrame(stride, size, false), 0);
  assert.equal(legionWolfFrame(stride / 2, size, true), legionWolfFrame(stride * 7, size, true));
  assert.equal(legionWolfFrame(Number.NaN, size, false), 0);
});

test('Legion hit and loading fallback preserve the modeled wolf ground anchor', () => {
  const walk = legionWolfAsset(12, 0, 43, false, true);
  const hit = legionWolfAsset(12, .1, 43, false, true);
  const fallback = legionWolfAsset(12, 0, 43, false, false);
  assert.equal(walk.src, WOLF_WALK);
  assert.equal(hit.src, WOLF_BASE);
  assert.equal(fallback.src, WOLF_BASE);
  assert.equal(hit.viewBox, '776 100 368 228');
  assert.equal(walk.groundY, WOLF_GROUND_Y);
  assert.equal(hit.groundY, walk.groundY);
  assert.equal(fallback.groundY, walk.groundY);
  assert.deepEqual(legionWolfAsset(12, .1, 43, true, true), legionWolfAsset(60, 0, 43, true, true));
  assert.deepEqual(legionWolfAsset(12, .1, 43, true, false), legionWolfAsset(60, 0, 43, true, false));
  assert.deepEqual(WOLF_ILLUSTRATION, spriteAsset(19), 'the fallback stays aligned with the original snow atlas');
});
