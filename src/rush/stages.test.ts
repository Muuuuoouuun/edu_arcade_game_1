import test from 'node:test';
import assert from 'node:assert/strict';
import { createRush, NO_MODS, stepRush, type RushMods, type RushState } from './sim.ts';
import { guardBot } from './bot.ts';
import { STAGE_COUNT, stageDifficulty, starBonus, starsFor } from './stages.ts';
import { createKingdom, latestStage, parseKingdom, serializeKingdom, settleBattle, stageUnlocked } from './kingdom.ts';

const LIMIT = 60 * 60 * 8;
const play = (seed: number, stage: number, mods: RushMods = NO_MODS) => {
  const s = createRush(seed, mods, stageDifficulty(stage));
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < LIMIT) stepRush(s, guardBot(s));
  return s;
};
const MAXED: RushMods = { damage: 1.4, towerCost: 0.6, townHp: 1.5 }; // castle 5 with every perk at 5

test('stage 1 is exactly the base game', () => {
  assert.deepEqual(stageDifficulty(1), { enemyHp: 1, enemyCount: 1, enemyDamage: 1 });
});

test('every stage ends (no stalled waves), with and without upgrades', () => {
  for (let n = 1; n <= STAGE_COUNT; n++) {
    for (const mods of [NO_MODS, MAXED]) {
      const s = play(1, n, mods);
      assert.ok(s.phase === 'won' || s.phase === 'lost', `stage ${n} still ${s.phase} at wave ${s.wave + 1}`);
    }
  }
});

test('progression: early stages clear without upgrades; stage 10 needs a grown kingdom', () => {
  for (const seed of [1, 2]) {
    for (const n of [1, 2, 3]) assert.equal(play(seed, n).phase, 'won', `stage ${n} seed ${seed} without upgrades`);
    assert.equal(play(seed, 10).phase, 'lost', `stage 10 seed ${seed} without upgrades`);
    assert.equal(play(seed, 10, MAXED).phase, 'won', `stage 10 seed ${seed} with a maxed kingdom`);
  }
});

test('stars follow the town health left; a loss has none', () => {
  const s = createRush(1);
  const at = (hp: number, phase: RushState['phase']) => starsFor({ ...s, phase, town: { hp, maxHp: 1000 } });
  assert.equal(at(900, 'won'), 3);
  assert.equal(at(500, 'won'), 2);
  assert.equal(at(100, 'won'), 1);
  assert.equal(at(900, 'lost'), 0);
});

test('stages unlock in order; new stars pay a one-time bonus and records never go down', () => {
  let k = createKingdom(0);
  assert.equal(latestStage(k), 1);
  assert.equal(stageUnlocked(k, 2), false);
  const win = play(1, 1);
  const stars = starsFor(win);
  assert.ok(stars >= 1);
  const first = settleBattle(k, 'b1', win, 1);
  assert.ok(first.granted);
  assert.equal(first.reward.newStars, stars);
  assert.equal(first.reward.bonus.food, starBonus(1).food * stars);
  k = first.kingdom;
  assert.equal(k.stars[0], stars);
  assert.equal(latestStage(k), 2);
  assert.equal(settleBattle(k, 'b1', win, 1).granted, false, 'same battle id pays once');
  const replay = settleBattle(k, 'b2', win, 1);
  assert.equal(replay.reward.newStars, 0, 'no bonus for stars already earned');
  const loss = play(1, 10);
  const after = settleBattle(replay.kingdom, 'b3', loss, 1);
  assert.equal(after.kingdom.stars[0], stars, 'a worse result keeps the record');
});

test('older saves without star records still load, keeping their progress', () => {
  const old = { ...createKingdom(0), castle: 3, food: 999 } as Record<string, unknown>;
  delete old.stars;
  const k = parseKingdom(JSON.stringify(old), 0);
  assert.equal(k.castle, 3);
  assert.equal(k.food, 999);
  assert.deepEqual(k.stars, Array(STAGE_COUNT).fill(0));
  const withStars = { ...createKingdom(0), stars: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0] };
  assert.deepEqual(parseKingdom(serializeKingdom(withStars), 0).stars, withStars.stars);
});
