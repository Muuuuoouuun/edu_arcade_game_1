import test from 'node:test';
import assert from 'node:assert/strict';
import {
  battleReward, canUpgrade, collect, createKingdom, grantReward, heroMaxLevel, kingdomMods, parseKingdom, pending, RATE_PER_LEVEL, settleBattle,
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
  assert.deepEqual(createRush(1).mods, { damage: 1, towerCost: 1, townHp: 1, heroHp: 1, forge: 0 }, 'a fresh kingdom changes nothing');
  assert.deepEqual(kingdomMods(createKingdom(T0)), { damage: 1, towerCost: 1, townHp: 1, heroHp: 1, forge: 0, startGold: 0 });
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
  assert.deepEqual(trainCost(k, 'ranger'), { food: 45, wood: 25, shards: 0 });
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
  const k = { ...createKingdom(T0), castle: 5, heroLv: { ranger: 6, bron: 1 }, perks: { attack: 2, towerDiscount: 0, townHp: 0, forge: 0, vault: 0 } };
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

test('forge: castle caps it, costs grow, old saves start it at 0, battles get its level', () => {
  let k = rich(createKingdom(T0));
  assert.equal(k.perks.forge, 0);
  assert.deepEqual(upgradeCost(k, 'forge'), { food: 50, wood: 60 });
  k = upgrade(k, 'forge', T0);
  assert.equal(k.perks.forge, 1);
  assert.equal(upgradeCost(k, 'forge'), null, 'castle 1 caps the forge at 1');
  assert.equal(kingdomMods(k).forge, 1);
  const old = JSON.parse(serializeKingdom({ ...k, castle: 3, perks: { ...k.perks, attack: 2 } }));
  delete old.perks.forge;
  const loaded = parseKingdom(JSON.stringify(old), T0);
  assert.equal(loaded.perks.forge, 0, 'missing forge → 0');
  assert.deepEqual([loaded.castle, loaded.perks.attack], [3, 2], 'the rest of an old save is kept');
  assert.equal(parseKingdom(JSON.stringify({ ...old, perks: { ...old.perks, forge: 9 } }), T0).castle, 1, 'a forge above the castle cap is a broken save');
});

test('hero shards: earned from new stars and high-stage wins, once per battle; training needs them from Lv3', async () => {
  const { shardReward } = await import('./kingdom.ts');
  assert.equal(shardReward(1, true, 3), 6, 'three new stars on stage 1');
  assert.equal(shardReward(3, true, 0), 1, 'a repeat win on stage 3');
  assert.equal(shardReward(9, true, 1), 2 + 3);
  assert.equal(shardReward(9, false, 0), 0, 'a loss pays no shards');
  // Settling pays once per battle id.
  const won = createRush(1);
  won.phase = 'won';
  won.town.hp = won.town.maxHp;
  let k = createKingdom(T0);
  const first = settleBattle(k, 'b1', won, 1);
  assert.equal(first.reward.shards, 6);
  assert.equal(first.kingdom.shards, 6);
  assert.equal(settleBattle(first.kingdom, 'b1', won, 1).kingdom.shards, 6, 'same battle id pays once');
  // Training: Lv1→2 and 2→3 cost no shards; Lv3→4 needs 1.
  k = { ...rich(createKingdom(T0)), castle: 5, shards: 0 };
  k = train(train(k, 'ranger', T0), 'ranger', T0);
  assert.equal(k.heroLv.ranger, 3);
  assert.equal(trainCost(k, 'ranger')!.shards, 1);
  assert.equal(train(k, 'ranger', T0).heroLv.ranger, 3, 'no shard, no Lv4');
  const paid = train({ ...k, shards: 1 }, 'ranger', T0);
  assert.deepEqual([paid.heroLv.ranger, paid.shards], [4, 0]);
  // Lv1 → Lv10 needs 1 + 2 + … + 7 = 28 shards.
  let total = 0;
  for (let l = 1; l < 10; l++) total += Math.max(0, l - 2);
  assert.equal(total, 28);
});

test('saves from before shards get 2 per star already earned', () => {
  const old = JSON.parse(serializeKingdom({ ...createKingdom(T0), stars: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0] }));
  delete old.shards;
  assert.equal(parseKingdom(JSON.stringify(old), T0).shards, 12);
  assert.equal(parseKingdom(JSON.stringify({ ...old, shards: 5 }), T0).shards, 5, 'an existing count is kept');
});

test('daily first win: the first win of each local day pays once more; losses, repeats and a clock set back do not', async () => {
  const { DAILY_WIN, dayIndex, dailyReady } = await import('./kingdom.ts');
  // Local day boundaries follow the offset: 23:30 UTC is already the next day in Seoul (UTC+9, offset -540).
  const t = Date.UTC(2026, 10, 10, 23, 30);
  assert.equal(dayIndex(t, -540), dayIndex(t, 0) + 1);
  assert.equal(dayIndex(Date.UTC(2026, 10, 10, 0, 0)), dayIndex(Date.UTC(2026, 10, 10, 23, 59)));
  const won = createRush(1);
  won.phase = 'won';
  won.town.hp = won.town.maxHp;
  const lost = createRush(1);
  lost.phase = 'lost';
  const day = dayIndex(T0);
  let k = createKingdom(T0);
  assert.ok(dailyReady(k, day), 'a new kingdom can claim today');
  // A loss neither pays nor uses up the bonus.
  const loss = settleBattle(k, 'l1', lost, 1, day);
  assert.equal(loss.reward.daily, null);
  assert.ok(dailyReady(loss.kingdom, day));
  // The first win pays the battle reward plus the bonus.
  const plain = settleBattle(k, 'w0', won, 1);
  const first = settleBattle(loss.kingdom, 'w1', won, 1, day);
  assert.deepEqual(first.reward.daily, DAILY_WIN);
  assert.equal(first.reward.food, plain.reward.food + DAILY_WIN.food);
  assert.equal(first.reward.shards, plain.reward.shards + DAILY_WIN.shards);
  assert.equal(first.kingdom.dailyWin, day);
  assert.equal(first.kingdom.shards, loss.kingdom.shards + plain.reward.shards + DAILY_WIN.shards);
  // Same battle id again: nothing; another win the same day: no bonus.
  assert.equal(settleBattle(first.kingdom, 'w1', won, 1, day).granted, false);
  k = settleBattle(first.kingdom, 'w2', won, 1, day).kingdom;
  assert.equal(settleBattle(first.kingdom, 'w2', won, 1, day).reward.daily, null);
  // Next day pays again; a clock set back to an earlier day does not.
  assert.deepEqual(settleBattle(k, 'w3', won, 1, day + 1).reward.daily, DAILY_WIN);
  assert.equal(settleBattle(k, 'w4', won, 1, day - 3).reward.daily, null);
  // Without a day (tools, bots) settling is unchanged.
  assert.equal(plain.reward.daily, null);
});

test('saves from before the daily bonus can claim it today; the claimed day round-trips', () => {
  const old = JSON.parse(serializeKingdom(createKingdom(T0)));
  delete old.dailyWin;
  assert.equal(parseKingdom(JSON.stringify(old), T0).dailyWin, 0);
  assert.equal(parseKingdom(JSON.stringify({ ...old, dailyWin: 20402 }), T0).dailyWin, 20402);
  assert.equal(parseKingdom(JSON.stringify({ ...old, dailyWin: 'x' }), T0).dailyWin, 0, 'a broken value resets to claimable');
});

test('vault: castle caps it, costs grow, each level adds starting gold, old saves start it at 0', async () => {
  const { VAULT_GOLD } = await import('./kingdom.ts');
  const { ECONOMY } = await import('./data.ts');
  let k = rich(createKingdom(T0));
  assert.equal(k.perks.vault, 0);
  assert.deepEqual(upgradeCost(k, 'vault'), { food: 60, wood: 50 });
  k = upgrade(k, 'vault', T0);
  assert.equal(k.perks.vault, 1);
  assert.equal(upgradeCost(k, 'vault'), null, 'castle 1 caps the vault at 1');
  k = { ...k, castle: 5 };
  for (let i = 0; i < 4; i++) k = upgrade(k, 'vault', T0);
  assert.equal(k.perks.vault, 5);
  assert.equal(kingdomMods(k).startGold, 5 * VAULT_GOLD);
  assert.equal(createRush(1, kingdomMods(k)).gold, ECONOMY.startGold + 5 * VAULT_GOLD, 'the battle starts with the extra gold');
  assert.equal(createRush(1).gold, ECONOMY.startGold, 'no kingdom, no extra gold');
  const old = JSON.parse(serializeKingdom({ ...k, castle: 3, perks: { ...k.perks, vault: 0, attack: 2 } }));
  delete old.perks.vault;
  const loaded = parseKingdom(JSON.stringify(old), T0);
  assert.equal(loaded.perks.vault, 0, 'missing vault → 0');
  assert.deepEqual([loaded.castle, loaded.perks.attack], [3, 2], 'the rest of an old save is kept');
  assert.equal(parseKingdom(JSON.stringify({ ...old, perks: { ...old.perks, vault: 9 } }), T0).castle, 1, 'a vault above the castle cap is a broken save');
});
