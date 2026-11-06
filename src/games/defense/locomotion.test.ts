import test from 'node:test';
import assert from 'node:assert/strict';
import { actDefense, createDefense, stepDefense } from './engine.ts';
import { advanceLocomotion, movementFacing, walkFrame } from './locomotion.ts';

test('walking distance measures actual displacement and stops at the destination without mutating prior frames', () => {
  const initial = createDefense(1, 'dwarf');
  let state = actDefense(initial, { type: 'move', point: { x: 600, y: 355 } });
  for (let i = 0; i < 180; i++) state = stepDefense(state, 1 / 60);
  assert.deepEqual(state.heroPosition, { x: 600, y: 355 });
  assert.ok(Math.abs(state.locomotion.hero.distance - 160) < .001);
  assert.equal(state.locomotion.hero.speed, 0);
  assert.equal(initial.locomotion.hero.distance, 0);
  assert.equal(stepDefense(state, 1 / 60), state);
});

test('pause preserves travel and a dash does not advance the walking cycle', () => {
  let state = actDefense(createDefense(1, 'dwarf'), { type: 'start-wave' });
  state = actDefense(state, { type: 'move', point: { x: 550, y: 355 } });
  state = stepDefense(state, .05);
  const paused = actDefense(state, { type: 'pause' });
  assert.equal(stepDefense(paused, .1), paused);
  const travel = state.locomotion.hero.distance;
  state = actDefense(state, { type: 'dash', point: { x: 700, y: 355 } });
  assert.ok(state.dashTime > 0);
  state = stepDefense(state, .05);
  assert.equal(state.locomotion.hero.distance, travel);
  assert.equal(state.locomotion.hero.speed, 0);
});

test('companions settle at clamped follow destinations without walking forever at map edges', () => {
  let state = actDefense(createDefense(1, 'druid'), { type: 'hire', hero: 'dwarf' });
  state = actDefense(state, { type: 'move', point: { x: 850, y: 555 } });
  for (let i = 0; i < 300; i++) state = stepDefense(state, 1 / 60);
  assert.deepEqual(state.mercenaryPosition, { x: 875, y: 565 });
  assert.ok(state.locomotion.mercenary.distance > 0);
  assert.ok(state.locomotion.pet.distance > 0);
  assert.equal(state.locomotion.mercenary.speed, 0);
  assert.equal(state.locomotion.pet.speed, 0);
});

test('walk phase depends on distance rather than sampling rate, and vertical drift keeps facing stable', () => {
  const origin = { x: 0, y: 0 };
  const once = advanceLocomotion({ distance: 0, speed: 0 }, origin, { x: 32, y: 0 }, .1, true);
  let split = { distance: 0, speed: 0 };
  for (let i = 0; i < 4; i++) split = advanceLocomotion(split, { x: i * 8, y: 0 }, { x: (i + 1) * 8, y: 0 }, .025, true);
  assert.deepEqual(split, once);
  assert.equal(walkFrame(split.distance), 4);
  assert.equal(movementFacing(-1, origin, { x: .1, y: 5 }), -1);
  assert.equal(movementFacing(1, origin, { x: -.1, y: 5 }), 1);
  assert.equal(movementFacing(-1, origin, { x: 2, y: 2 }), 1);
  assert.equal(movementFacing(1, origin, { x: -2, y: 2 }), -1);
});
