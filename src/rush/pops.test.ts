import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addHit, MERGE_WINDOW, popKey, type PopSlot } from './pops.ts';

test('damage numbers merge per enemy and attacker kind within the window', () => {
  const slots: PopSlot[] = [];
  // A three-bolt volley on one enemy: one number that adds up.
  for (let i = 0; i < 3; i++) addHit(slots, popKey('hero', 7), 24, 1, 2);
  assert.equal(slots.length, 1);
  assert.deepEqual([slots[0].value, slots[0].bumps], [72, 2]);
  // Another enemy, or another attacker kind on the same enemy: separate numbers.
  addHit(slots, popKey('hero', 8), 24, 3, 2);
  addHit(slots, popKey('tower', 7), 30, 1, 2);
  assert.equal(slots.length, 3);
  // After the window the old number is left to fade; a new hit starts a new one.
  slots[0].age = MERGE_WINDOW + 0.01;
  const r = addHit(slots, popKey('hero', 7), 24, 1.2, 2);
  assert.equal(r.merged, false);
  assert.equal(slots.length, 4);
  // A hit without an enemy id never merges.
  addHit(slots, popKey('hero', undefined), 5, 0, 0);
  addHit(slots, popKey('hero', undefined), 5, 0, 0);
  assert.equal(slots.length, 6);
});

test('area hits on a crowd stack upward instead of piling on one spot', () => {
  const slots: PopSlot[] = [];
  const lifts = [1, 2, 3, 4, 5, 6].map(id => addHit(slots, popKey('super', id), 150, 0.25 * id, 0).slot.lift);
  assert.deepEqual(lifts.map(l => +l.toFixed(2)), [0, 0.6, 1.2, 1.8, 2.4, 2.4], 'one step per recent neighbour, capped');
  const far = addHit(slots, popKey('super', 9), 150, 5, 0).slot;
  assert.equal(far.lift, 0, 'a number away from the crowd stays low');
});
