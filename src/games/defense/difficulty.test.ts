import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, DIFFICULTY_ORDER, getDifficulty, getWavePlan } from './difficulty.ts';
import type { EnemyKind } from './types.ts';

test('standard forecasts preserve the original eight-stage wave counts and encounter order', () => {
  const counts = [[10,12,14,16], [12,14,16,18], [14,16,18,20], [16,18,20,23],
    [14,16,18,20], [16,18,20,22], [18,20,22,24], [20,22,24,27]];
  for (let stage = 1; stage <= 8; stage++) for (let wave = 1; wave <= 4; wave++) {
    const plan = getWavePlan(stage, wave);
    assert.equal(plan.length, counts[stage - 1][wave - 1]);
    assert.deepEqual(getWavePlan(stage, wave, 'relaxed'), plan);
    const bosses = plan.filter(kind => kind === 'boss' || kind === 'frostboss');
    assert.equal(bosses.length, wave === 4 && (stage === 4 || stage === 8) ? 1 : 0);
    if (bosses.length) assert.equal(plan.at(-1), bosses[0]);
  }
  assert.deepEqual(getWavePlan(1, 1), ['sprout','sprout','wood','sprout','sprout','wood','sprout','sprout','wood','sprout']);
  assert.deepEqual(getWavePlan(2, 3), ['wood','metal','insulator','sprout','metal','wood','metal','insulator','sprout','metal','wood','metal','insulator','sprout','metal','wood']);
  assert.deepEqual(getWavePlan(4, 4).slice(-5), ['stone','insulator','sprout','wood','boss']);
  assert.deepEqual(getWavePlan(8, 4).slice(-5), ['ice','stone','metal','insulator','frostboss']);
});

test('veteran inserts fast packs without dropping normal encounters or moving the final boss', () => {
  for (let stage = 1; stage <= 8; stage++) for (let wave = 1; wave <= 4; wave++) {
    const standard = getWavePlan(stage, wave), veteran = getWavePlan(stage, wave, 'veteran');
    assert.equal(veteran.length - standard.length, [2,3,3,4][wave - 1]);
    let next = 0;
    for (const kind of veteran) if (kind === standard[next]) next++;
    assert.equal(next, standard.length, 'the original encounters remain in order');
    const count = (plan: EnemyKind[], kind: EnemyKind) => plan.filter(enemy => enemy === kind).length;
    for (const kind of ['wood','ice','stone','metal','boss','frostboss'] as const) assert.equal(count(veteran, kind), count(standard, kind));
    if (standard.at(-1) === 'boss' || standard.at(-1) === 'frostboss') assert.equal(veteran.at(-1), standard.at(-1));
  }
});

test('difficulty profiles change pressure and resources while leaving relaxed rewards intact', () => {
  assert.deepEqual(DIFFICULTY_ORDER, ['relaxed','standard','veteran']);
  assert.equal(DIFFICULTIES.standard.enemyHp, 1);
  assert.equal(DIFFICULTIES.standard.enemySpeed, 1);
  assert.equal(DIFFICULTIES.standard.spawnInterval, 1);
  assert.equal(DIFFICULTIES.standard.startingCoins, 0);
  assert.equal(DIFFICULTIES.standard.rewardMultiplier, 1);
  assert(DIFFICULTIES.relaxed.enemyHp < 1 && DIFFICULTIES.relaxed.enemySpeed < 1);
  assert(DIFFICULTIES.relaxed.spawnInterval > 1 && DIFFICULTIES.relaxed.startingCoins > 0);
  assert.equal(DIFFICULTIES.relaxed.rewardMultiplier, 1);
  assert(DIFFICULTIES.veteran.enemyHp > 1 && DIFFICULTIES.veteran.enemySpeed > 1);
  assert(DIFFICULTIES.veteran.spawnInterval < 1 && DIFFICULTIES.veteran.rewardMultiplier > 1);
});

test('forecasts are deterministic, mutation-safe and reject invalid stage/wave input', () => {
  const original = getWavePlan(4, 4, 'veteran');
  const changed = getWavePlan(4, 4, 'veteran');
  changed.splice(0, changed.length, 'sprout');
  assert.deepEqual(getWavePlan(4, 4, 'veteran'), original);
  for (const invalid of [undefined, null, {}, [], true, 'constructor', 'STANDARD', 1]) assert.equal(getDifficulty(invalid), 'standard');
  for (const valid of DIFFICULTY_ORDER) assert.equal(getDifficulty(valid), valid);
  for (const stage of [0, -1, 9, 1.5, NaN, Infinity]) assert.deepEqual(getWavePlan(stage, 1), []);
  for (const wave of [0, -1, 5, 1.5, NaN, Infinity]) assert.deepEqual(getWavePlan(1, wave), []);
});
