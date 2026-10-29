import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefense, stepDefense } from '../games/defense/engine.ts';
import type { DefenseState } from '../games/defense/types.ts';
import { shouldPublishDefenseFrame } from './defenseFrame.ts';

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
