import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefense, stepDefense } from '../games/defense/engine.ts';
import type { DefenseState } from '../games/defense/types.ts';
import { resolveZoomPreference, unitScale, nextZoomState, shouldPublishDefenseFrame } from './defenseFrame.ts';

test('the last terminal effect is published inside the frame throttle so the result can appear', () => {
  for (const phase of ['won', 'lost'] as const) {
    const previous: DefenseState = {
      ...createDefense(4, 'barbarian', 1, 'veteran'), phase,
      effects: [{ id: 1, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, element: 'physical', life: 0.01 }],
    };
    const final = stepDefense(previous, 1 / 60);
    assert.equal(final.effects.length, 0);
    assert.equal(shouldPublishDefenseFrame(previous, final, previous, 16), true);
    // The engine is now idle; without publishing this frame no later tick can
    // update the result dialog's effects.length === 0 condition.
    assert.equal(stepDefense(final, 1 / 60), final);
  }
});

test('ordinary frames stay throttled and terminal phase changes publish immediately', () => {
  const before = createDefense(1, 'mage');
  const movement = { ...before, time: before.time + 1 / 60 };
  assert.equal(shouldPublishDefenseFrame(before, movement, before, 16), false);
  assert.equal(shouldPublishDefenseFrame(before, movement, before, 32), true);
  assert.equal(shouldPublishDefenseFrame(before, { ...movement, phase: 'lost' }, before, 16), true);
  assert.equal(shouldPublishDefenseFrame(before, before, before, 40), false);
});

test('enlarged battle view is the default and only an explicit full-view choice opts out', () => {
  assert.equal(resolveZoomPreference(null), true);
  assert.equal(resolveZoomPreference('1'), true);
  assert.equal(resolveZoomPreference('0'), false);
});

test('zoom wish survives a layout without room and returns when room comes back', () => {
  assert.equal(nextZoomState(true, false), false);
  assert.equal(nextZoomState(true, true), true);
  assert.equal(nextZoomState(false, true), false);
});

test('units grow on a narrow board but stay unchanged on wide boards and bad measurements', () => {
  assert.equal(unitScale(0), 1);
  assert.equal(unitScale(NaN), 1);
  assert.equal(unitScale(900), 1);
  assert.equal(unitScale(520), 1);
  assert.equal(unitScale(375), 1.25);
  assert.ok(unitScale(450) > 1 && unitScale(450) < 1.25);
});

test('offscreenThreats counts enemies hidden beyond each zoomed edge and aims the camera', async () => {
  const { offscreenThreats } = await import('./defenseFrame.ts');
  const none = offscreenThreats([100, 800], 0, 300, 300);
  assert.deepEqual([none.left, none.right], [0, 0]); // full view hides nothing
  const t = offscreenThreats([50, 400, 880], 300, 300, 900); // 900px map, view spans 300..600
  assert.deepEqual([t.left, t.right], [1, 1]);
  assert.ok(t.leftTo >= 0 && t.leftTo <= 600 && t.rightTo >= 0 && t.rightTo <= 600);
  const mid = offscreenThreats([400], 300, 300, 900);
  assert.equal(mid.left + mid.right, 0);
});
