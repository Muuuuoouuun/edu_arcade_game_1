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
  assert.deepEqual(kingdomMods(createKingdom(T0)), { damage: 1, towerCost: 1, townHp: 1, heroHp: 1, forge: 0, startGold: 0, talent: 0 });
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
  assert.deepEqual(k.heroLv, { ranger: 1, bron: 1, bear: 1 });
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
  const k = { ...createKingdom(T0), castle: 5, heroLv: { ranger: 6, bron: 1, bear: 1 }, perks: { attack: 2, towerDiscount: 0, townHp: 0, forge: 0, vault: 0 } };
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
  assert.deepEqual(parseKingdom(JSON.stringify(old), T0).heroLv, { ranger: 1, bron: 1, bear: 1 });
  const tampered = { ...old, castle: 2, heroLv: { ranger: 9, bron: 'x' } };
  assert.deepEqual(parseKingdom(JSON.stringify(tampered), T0).heroLv, { ranger: 4, bron: 1, bear: 1 });
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

test('hero talents (cycle 45): 3n shards, need hero Lv 2n+1, max 3, battle stats change for the chosen hero only', async () => {
  const { learnTalent, canLearnTalent, talentCost } = await import('./kingdom.ts');
  const { HEROES, TALENTS, heroStats } = await import('./data.ts');
  let k = { ...createKingdom(T0), castle: 5, shards: 100 };
  assert.deepEqual(talentCost(k, 'ranger'), { shards: 3, needLv: 3, ready: false });
  assert.ok(!canLearnTalent(k, 'ranger'), 'hero Lv1 cannot learn Lv1 talent');
  assert.equal(learnTalent(k, 'ranger'), k, 'refused: unchanged');
  k = { ...k, heroLv: { ranger: 7, bron: 3, bear: 1 } };
  for (let i = 0; i < 3; i++) k = learnTalent(k, 'ranger');
  assert.deepEqual([k.talent.ranger, k.shards], [3, 100 - 3 - 6 - 9]);
  assert.equal(talentCost(k, 'ranger'), null, 'max 3');
  const b = learnTalent(k, 'bron');
  assert.equal(b.talent.bron, 1);
  assert.ok(!canLearnTalent(b, 'bron'), 'Bron Lv3 cannot learn talent Lv2 (needs Lv5)');
  assert.equal(k.talent.bron, 0, 'the old kingdom object is untouched');
  // Battle: the chosen hero's talent changes its stat; talent 0 is the plain hero.
  assert.equal(kingdomMods(k).talent, 3);
  const s = createRush(1, kingdomMods(k));
  assert.ok(Math.abs(s.mods.talent! - 3) < 1e-9);
  for (const [h, n] of [['ranger', 3], ['bron', 2], ['bear', 1]] as const) {
    const stat = TALENTS[h].stat;
    assert.ok(Math.abs(heroStats(h, n)[stat] - (HEROES[h][stat] + n * TALENTS[h].per)) < 1e-9, `${h} talent ${n} changes ${stat}`);
  }
  assert.equal(heroStats('ranger', 0), HEROES.ranger, 'no talent: the same object');
  assert.equal(kingdomMods({ ...k, hero: 'bron' }).talent, 0, 'Bron has none yet');
  // Old saves: no talents → all 0; out-of-range values clamp.
  const old = JSON.parse(serializeKingdom(createKingdom(T0)));
  delete old.talent;
  assert.deepEqual(parseKingdom(JSON.stringify(old), T0).talent, { ranger: 0, bron: 0, bear: 0 });
  assert.deepEqual(parseKingdom(JSON.stringify({ ...old, talent: { ranger: 9, bron: -2, bear: 'x' } }), T0).talent, { ranger: 3, bron: 0, bear: 0 });
});

test('endless settlement (cycle 46): rewards grow with waves held, 1 shard per 5, best record kept, paid once', async () => {
  const { settleEndless, stageUnlocked, ENDLESS_STAGE } = await import('./kingdom.ts');
  let k = createKingdom(T0);
  assert.ok(!stageUnlocked(k, ENDLESS_STAGE), 'locked until stage 10 has a star');
  k = { ...k, stars: [3, 3, 3, 3, 3, 3, 3, 3, 3, 1] };
  assert.ok(stageUnlocked(k, ENDLESS_STAGE));
  const run = (waves: number) => { const s = createRush(1); s.wave = waves; s.phase = 'lost'; return s; };
  const a = settleEndless(k, 'e1', run(7));
  // 1 shard for 5 waves held, plus 3 for passing the 5-wave milestone the first time (cycle 51).
  assert.deepEqual([a.reward.waves, a.reward.shards, a.reward.newBest, a.kingdom.endlessBest], [7, 1 + 3, true, 7]);
  assert.equal(settleEndless(a.kingdom, 'e1', run(7)).granted, false, 'same run pays once');
  const b = settleEndless(a.kingdom, 'e2', run(4));
  assert.deepEqual([b.reward.newBest, b.kingdom.endlessBest, b.reward.best], [false, 7, 7]);
  assert.ok(b.reward.food < a.reward.food, 'fewer waves, less food');
  const old = JSON.parse(serializeKingdom(createKingdom(T0)));
  delete old.endlessBest;
  assert.equal(parseKingdom(JSON.stringify(old), T0).endlessBest, 0);
});

test('endless milestones (cycle 51): shards the first time a record passes 5/10/15/20, all passed at once, never twice', async () => {
  const { settleEndless, nextMilestone, ENDLESS_MILESTONES } = await import('./kingdom.ts');
  const run = (waves: number) => { const s = createRush(1); s.wave = waves; s.phase = 'lost'; return s; };
  let k = { ...createKingdom(T0), stars: [3, 3, 3, 3, 3, 3, 3, 3, 3, 1] };
  assert.deepEqual(nextMilestone(0), ENDLESS_MILESTONES[0]);
  const a = settleEndless(k, 'm1', run(4));
  assert.deepEqual(a.reward.milestones, [], 'below 5: none');
  const b = settleEndless(a.kingdom, 'm2', run(11));
  assert.deepEqual(b.reward.milestones.map(m => m.waves), [5, 10], 'one run passes two milestones');
  assert.equal(b.reward.shards, Math.floor(11 / 5) + 3 + 6);
  assert.equal(settleEndless(b.kingdom, 'm2', run(11)).granted, false, 'same run id: nothing again');
  const c = settleEndless(b.kingdom, 'm3', run(11));
  assert.deepEqual([c.reward.milestones, c.reward.shards], [[], Math.floor(11 / 5)], 'equal record: no milestone');
  const d = settleEndless(c.kingdom, 'm4', run(15));
  assert.deepEqual(d.reward.milestones.map(m => m.waves), [15]);
  assert.deepEqual(nextMilestone(d.kingdom.endlessBest), { waves: 20, shards: 15 });
  assert.equal(nextMilestone(25), null);
  k = d.kingdom;
  assert.equal(settleEndless(k, 'm5', run(7)).reward.milestones.length, 0, 'a lower run pays no milestone');
});

test('the town record flag (cycle 57) appears once endless opens and gains a stage per record milestone', async () => {
  const { flagStage } = await import('./townScene.ts'), { ENDLESS_MILESTONES } = await import('./kingdom.ts');
  const k = createKingdom(0);
  assert.equal(flagStage(k), -1, 'no flag while endless is locked');
  const open = { ...k, stars: k.stars.map(() => 1) };
  assert.equal(flagStage({ ...open, endlessBest: 0 }), 0);
  assert.equal(flagStage({ ...open, endlessBest: 4 }), 0);
  assert.equal(flagStage({ ...open, endlessBest: 5 }), 1);
  assert.equal(flagStage({ ...open, endlessBest: 14 }), 2);
  assert.equal(flagStage({ ...open, endlessBest: 40 }), ENDLESS_MILESTONES.length);
});

test('kingdom goals (cycle 64): one at a time, claimed only when met, paid once, saved and migrated', async () => {
  const { GOALS, currentGoal, claimGoal } = await import('./kingdom.ts');
  const k = createKingdom(T0);
  const first = currentGoal(k)!;
  assert.deepEqual([first.index, first.done, first.have, first.need], [0, false, 0, 1]);
  assert.equal(claimGoal(k), k, 'an unmet goal cannot be claimed');
  const won = { ...k, stars: [1, ...k.stars.slice(1)] };
  const after = claimGoal(won);
  assert.deepEqual([after.goal, after.food - won.food, won.goal], [1, GOALS[0].reward.food, 0], 'pays, moves on, leaves the input alone');
  assert.equal(claimGoal(after), after, 'the next goal (castle Lv2) is not met yet');
  // A grown kingdom meets every goal in order: the whole chain can be claimed; what follows is the power ladder (cycle 83).
  let grown: Kingdom = { ...k, castle: 5, farm: 5, mill: 5, perks: { ...k.perks, attack: 1, forge: 1 }, stars: k.stars.map(() => 3), heroLv: { ...k.heroLv, ranger: 2 }, endlessBest: 5 };
  const shards0 = grown.shards;
  for (let i = 0; i < GOALS.length; i++) grown = claimGoal(grown);
  assert.equal(grown.goal, GOALS.length);
  assert.equal(currentGoal(grown)?.goal.ladder, true, 'the chain hands over to the ladder');
  assert.equal(claimGoal(grown), grown, 'this kingdom is still short of the first rung');
  assert.equal(grown.shards - shards0, GOALS.reduce((a, g) => a + (g.reward.shards ?? 0), 0));
  // Saves: the index round-trips; older saves start at 0; nonsense clamps to a valid start.
  assert.equal(parseKingdom(serializeKingdom({ ...k, goal: 4 }), T0).goal, 4);
  const old = JSON.parse(serializeKingdom(k)); delete old.goal;
  assert.equal(parseKingdom(JSON.stringify(old), T0).goal, 0);
  for (const bad of [-1, 2.5, 'x', 1e6]) assert.equal(parseKingdom(JSON.stringify({ ...old, goal: bad }), T0).goal, 0, `goal ${bad}`);
});

test('kingdom power ladder (cycle 83): after the chain, power targets every 500 from 2,500, claimed only when met', async () => {
  const { GOALS, POWER_LADDER, currentGoal, claimGoal, goalAt, kingdomPower } = await import('./kingdom.ts');
  const k = createKingdom(T0);
  // The rungs follow from the goal index alone.
  assert.deepEqual([0, 1, 4].map(r => goalAt(GOALS.length + r)!.progress(k)[1]), [2500, 3000, 4500]);
  assert.equal(goalAt(GOALS.length)!.text, '전투력 2,500');
  assert.equal(goalAt(GOALS.length + POWER_LADDER.rungs), null);
  assert.equal(goalAt(-1), null);
  // A chain finisher near 2,000 power waits; the first rung pays its shards once met, and the next rung is 3,000.
  let done: Kingdom = { ...k, goal: GOALS.length, castle: 5, farm: 3, mill: 3, perks: { attack: 2, towerDiscount: 1, townHp: 1, forge: 1, vault: 1 }, heroLv: { ranger: 5, bron: 2, bear: 2 }, talent: { ranger: 1, bron: 0, bear: 0 }, stars: [3, 3, 3, 3, 3, 2, 2, 1, 1, 1], endlessBest: 5 };
  assert.equal(kingdomPower(done), 2080);
  const wait = currentGoal(done)!;
  assert.deepEqual([wait.have, wait.need, wait.done], [2080, 2500, false]);
  assert.equal(claimGoal(done), done);
  done = { ...done, talent: { ranger: 3, bron: 2, bear: 2 } }; // +480 power: 2,560
  const paid = claimGoal(done);
  assert.deepEqual([paid.goal, paid.shards - done.shards, kingdomPower(paid)], [GOALS.length + 1, POWER_LADDER.shards, kingdomPower(done)], 'pays shards, power itself unchanged');
  assert.deepEqual([currentGoal(paid)!.need, currentGoal(paid)!.done], [3000, false]);
  // A kingdom far ahead catches up one tap at a time; everything but the endless challenge reaches five rungs.
  let max: Kingdom = { ...k, goal: GOALS.length, castle: 5, farm: 5, mill: 5, perks: { attack: 5, towerDiscount: 5, townHp: 5, forge: 5, vault: 5 }, heroLv: { ranger: 10, bron: 10, bear: 10 }, talent: { ranger: 3, bron: 3, bear: 3 }, stars: k.stars.map(() => 3) };
  assert.equal(kingdomPower(max), 4970);
  let taps = 0;
  for (let next = claimGoal(max); next !== max; next = claimGoal(max)) { max = next; taps++; }
  assert.equal(taps, 5);
  assert.equal(currentGoal(max)!.need, 5000);
  // Ladder rungs survive a save.
  assert.equal(parseKingdom(serializeKingdom(max), T0).goal, GOALS.length + 5);
});

test('kingdom power (cycle 71): a start value, and each kind of growth adds exactly its weight', async () => {
  const { kingdomPower, POWER } = await import('./kingdom.ts');
  const k = createKingdom(T0);
  // castle 1, farm 1, mill 1, three heroes at Lv1: 100 + 60 + 120.
  assert.equal(kingdomPower(k), POWER.castle + 2 * POWER.field + 3 * POWER.heroLv);
  const rich = { ...k, castle: 3, food: 1e6, wood: 1e6, shards: 1e3 }; // castle 3 so the farm may grow
  const p0 = kingdomPower(rich);
  assert.equal(kingdomPower(upgrade(rich, 'castle', T0)) - p0, POWER.castle);
  assert.equal(kingdomPower(upgrade(rich, 'farm', T0)) - p0, POWER.field);
  assert.equal(kingdomPower(upgrade(rich, 'attack', T0)) - p0, POWER.perk);
  assert.equal(kingdomPower(train(rich, 'ranger', T0)) - p0, POWER.heroLv);
  assert.equal(kingdomPower({ ...rich, stars: [2, ...rich.stars.slice(1)] }) - p0, 2 * POWER.star);
  assert.equal(kingdomPower({ ...rich, endlessBest: 7 }) - p0, 7 * POWER.endlessWave);
  assert.equal(kingdomPower({ ...rich, talent: { ...rich.talent, bron: 2 } }) - p0, 2 * POWER.talent);
  assert.ok(!('power' in JSON.parse(serializeKingdom(rich))), 'not saved: always computed');
});

test('recommended stage power (cycle 89): one per stage, rising, a new kingdom already meets stage 1', async () => {
  const { STAGE_POWER, recommendedPower, kingdomPower } = await import('./kingdom.ts');
  const { STAGE_COUNT } = await import('./stages.ts');
  assert.equal(STAGE_POWER.length, STAGE_COUNT);
  for (let i = 1; i < STAGE_POWER.length; i++) assert.ok(STAGE_POWER[i] > STAGE_POWER[i - 1], `stage ${i + 1} above stage ${i}`);
  assert.ok(STAGE_POWER[0] <= kingdomPower(createKingdom(T0)), 'a fresh kingdom is ready for stage 1');
  assert.equal(recommendedPower(1), STAGE_POWER[0]);
  assert.equal(recommendedPower(STAGE_COUNT + 1), null, 'endless has no recommendation');
});

test('stage goals name their stage (1.0): the town can point an unmet goal at it', async () => {
  const { GOALS } = await import('./kingdom.ts');
  for (const g of GOALS) {
    const m = g.text.match(/^스테이지 (\d+)/);
    assert.equal(g.stage, m ? Number(m[1]) : undefined, g.text);
  }
});
