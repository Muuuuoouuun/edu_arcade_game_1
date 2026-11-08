import test from 'node:test';
import assert from 'node:assert/strict';
import { startingSpeed } from './defenseSpeed.ts';

test('a first clear starts at 1x even when 2x was saved', () => {
  assert.equal(startingSpeed(3, [1, 2], '2'), 1);
});

test('2x is restored only on an already cleared stage', () => {
  assert.equal(startingSpeed(2, [1, 2], '2'), 2);
});

test('missing or bad stored values fall back to 1x', () => {
  for (const stored of [null, '1', '9']) assert.equal(startingSpeed(1, [1], stored), 1);
});
