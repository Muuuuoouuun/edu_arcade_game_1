import test from 'node:test';
import assert from 'node:assert/strict';
import {
  battleReward, canUpgrade, collect, createKingdom, grantReward, heroMaxLevel, kingdomMods, parseKingdom, pending, RATE_PER_LEVEL,
  serializeKingdom, STORAGE_MINUTES, train, trainCost, upgrade, upgradeCost, type Kingdom,
} from './kingdom.ts';
import { createRush, heroMaxHp, padCost, stepRush, WAVE_COUNT } from './sim.ts';
import { HERO, PADS, TOWER_LEVELS, TOWN } from './data.ts';
import { guardBot } from './bot.ts';

const MIN = 60000, T0 = 1_700_000_000_000;
const rich = (k: Kingdom): Kingdom => ({ ...k, food: 1e6, wood: 1e6 });

test('buildings produce per whole minute, keep partial minutes, and cap at storage', () => {
  const k = createKingdom(T0);
  assert.deepEqual(pending(k, T0 + 30 * MIN + 59_000), { food: 30 * RATE_PER_LEVEL, wood: 30 * RATE_PER_LEVEL });
  const c = collect(k, T0 + 30.5 * MIN);
  assert.equal(c.food, k.food + 30 * RATE_PER_LEVEL);
  assert.equal(c.lastCollect, T0 + 30 * MIN, 'the half minute keeps ticking');
  assert.equal(collect(c, T0 + 31 * MIN).food, k.food + 31 * RATE_PER_LEVEL, 'collecting twice never double counts');
  const capped = pending(k, T0 + 10 * 60 * MIN);
  assert.equal(capped.food, STORAGE_MINUTES * RATE_PER_LEVEL);
});

test('a clock that runs backwards produces nothing and does not jam future production', () => {
  const k = createKingdom(T0);
  const back = collect(k, T0 - 10 * MIN);
  assert.equal(back.food, k.food);
  assert.equal(pending(back, T0 - 5 * MIN).food, 5 * RATE_PER_LEVEL);
});

test('the castle caps buildings and perks; upgrades cost resources and fail when unaffordable', () => {
  let k = rich(createKingdom(T0));
  assert.equal(upgradeCost(k, 'farm'), null, 'farm cannot pass castle Lv1');
  assert.ok(upgradeCost(k, 'attack'), 'perk level 1 is allowed at castle 1');
  k = upgrade(k, 'attack', T0);
  assert.equal(k.perks.attack, 1);
  assert.equal(upgradeCost(k, 'attack'), null);
  const before = k.food;
  k = upgrade(k, 'castle', T0);
  assert.equal(k.castle, 2);
  assert.equal(k.food, before - 120);
  k = upgrade(k, 'farm', T0);
  assert.equal(k.farm, 2);
  const poor = { ...createKingdom(T0), food: 0, wood: 0 };
  assert.equal(canUpgrade(poor, 'attack'), false);
  assert.deepEqual(upgrade(poor, 'attack', T0).perks, poor.perks);
});

test('perks change the next battle: town HP, tower cost and arrow damage', () => {
  let k = rich(createKingdom(T0));
  for (let i = 0; i < 2; i++) k = upgrade(k, 'castle', T0);
  for (const p of ['attack', 'towerDiscount', 'townHp'] as const) for (let i = 0; i < 3; i++) k = upgrade(k, p, T0);
  const mods = kingdomMods(k);
  const s = createRush(1, mods);
  assert.equal(s.town.maxHp, Math.round(TOWN.hp * 1.3));
  assert.equal(padCost(s, 0), Math.round(TOWER_LEVELS[0].cost * (1 - 0.24)));
  s.hero.x = PADS[0].x; s.hero.z = PADS[0].z;
  stepRush(s, { fire: { x: 0, z: -1 } });
  assert.ok(Math.abs(s.shots[0].damage - HERO.boltDamage * 1.24) < 1e-9);
  assert.deepEqual(createRush(1).mods, { damage: 1, towerCost: 1, townHp: 1, heroHp: 1 }, 'a fresh kingdom changes nothing');
  assert.deepEqual(kingdomMods(createKingdom(T0)), { damage: 1, towerCost: 1, townHp: 1, heroHp: 1 });
});

test('a battle pays once, scaled by waves defended, with a victory bonus', () => {
  const s = createRush(2);
  while (s.phase !== 'won' && s.phase !== 'lost') stepRush(s, guardBot(s));
  const reward = battleReward(s);
  assert.equal(reward.won, true);
  assert.equal(reward.waves, WAVE_COUNT);
  const k = createKingdom(T0);
  const first = grantReward(k, 'battle-1', reward);
  assert.ok(first.granted);
  assert.equal(first.kingdom.food, k.food + reward.food);
  const again = grantReward(first.kingdom, 'battle-1', reward);
  assert.equal(again.granted, false);
  assert.equal(again.kingdom.food, first.kingdom.food);
  const lost = createRush(2);
  while (lost.phase !== 'lost') stepRush(lost, {});
  assert.ok(battleReward(lost).food < reward.food && !battleReward(lost).won);
});

test('saves round-trip; broken or tampered saves fall back to a fresh kingdom', () => {
  let k = rich(createKingdom(T0));
  k = upgrade(k, 'castle', T0);
  k = upgrade(k, 'townHp', T0);
  assert.deepEqual(parseKingdom(serializeKingdom(k), T0), k);
  for (const bad of [null, '', '{', '{"version":2}', JSON.stringify({ ...k, farm: 9 }), JSON.stringify({ ...k, food: -5 }), JSON.stringify({ ...k, perks: { attack: 'x' } })]) {
    assert.equal(parseKingdom(bad, T0).castle, 1, `fallback for ${String(bad).slice(0, 30)}`);
  }
  assert.equal(parseKingdom(serializeKingdom({ ...k, lastCollect: T0 + 99 * MIN }), T0).lastCollect, T0, 'a future mark is clamped');
});

test('hero training: castle caps the level, costs grow, collect first, only unlocked heroes', () => {
  let k = createKingdom(T0);
  assert.deepEqual(k.heroLv, { ranger: 1, bron: 1 });
  assert.equal(heroMaxLevel(k), 2, 'castle 1 allows hero Lv2');
  assert.deepEqual(trainCost(k, 'ranger'), { food: 45, wood: 25 });
  assert.equal(trainCost(k, 'bron'), null, 'locked hero cannot train');
  k = train(k, 'ranger', T0);
  assert.equal(k.heroLv.ranger, 2);
  assert.deepEqual([k.food, k.wood], [120 - 45, 120 - 25]);
  assert.equal(trainCost(k, 'ranger'), null, 'capped by castle 1');
  assert.equal(train(k, 'ranger', T0).heroLv.ranger, 2);
  // Poor kingdom: training collects production first, then pays if it can.
  const poor = { ...createKingdom(T0), food: 0, wood: 0 };
  assert.equal(train(poor, 'ranger', T0).heroLv.ranger, 1, 'unaffordable → unchanged');
  const later = train(poor, 'ranger', T0 + 10 * 60000);
  assert.equal(later.heroLv.ranger, 2, 'ten minutes of production pays for Lv2');
  assert.equal(poor.heroLv.ranger, 1, 'input kingdom is not mutated');
});

test('hero level feeds battle modifiers for the chosen hero only', () => {
  const k = { ...createKingdom(T0), castle: 5, heroLv: { ranger: 6, bron: 1 }, perks: { attack: 2, towerDiscount: 0, townHp: 0 } };
  const m = kingdomMods(k);
  assert.ok(Math.abs(m.heroHp - 1.5) < 1e-9 && Math.abs(m.damage - 1.16 * 1.5) < 1e-9, JSON.stringify(m));
  assert.equal(kingdomMods({ ...k, hero: 'bron' }).heroHp, 1, 'bron keeps his own level');
  const s = createRush(1, m);
  assert.equal(s.hero.hp, Math.round(420 * 1.5));
  assert.equal(heroMaxHp(s), s.hero.hp);
});

test('hero levels load from old saves and clamp to the castle cap', () => {
  const old = JSON.parse(serializeKingdom(createKingdom(T0)));
  delete old.heroLv;
  assert.deepEqual(parseKingdom(JSON.stringify(old), T0).heroLv, { ranger: 1, bron: 1 });
  const tampered = { ...old, castle: 2, heroLv: { ranger: 9, bron: 'x' } };
  assert.deepEqual(parseKingdom(JSON.stringify(tampered), T0).heroLv, { ranger: 4, bron: 1 });
});
