import test from 'node:test';
import assert from 'node:assert/strict';
import { createRush, NO_MODS, stepRush, type RushMods, type RushState } from './sim.ts';
import { guardBot } from './bot.ts';
import { STAGE_COUNT, stageDifficulty, starBonus, starsFor } from './stages.ts';
import { chooseHero, createKingdom, heroGrowth, heroUnlocked, latestStage, parseKingdom, serializeKingdom, settleBattle, stageUnlocked } from './kingdom.ts';

const LIMIT = 60 * 60 * 8;
const play = (seed: number, stage: number, mods: RushMods = NO_MODS) => {
  const s = createRush(seed, mods, stageDifficulty(stage));
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < LIMIT) stepRush(s, guardBot(s));
  return s;
};
const MAXED: RushMods = { damage: 1.4, towerCost: 0.6, townHp: 1.5, heroHp: 1, forge: 5 }; // castle 5 with every perk at 5, hero Lv1

test('stage 1 is exactly the base game', () => {
  assert.deepEqual(stageDifficulty(1), { enemyHp: 1, enemyCount: 1, enemyDamage: 1, stage: 1 });
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
  }
  // A maxed kingdom wins stage 10 on most seeds. Single seeds flip with small rule changes (cycle 28: smarter
  // auto-aim moved the ranger's losses from seeds 3 and 5 to 2 and 3, still 6 of 8), so this checks the total.
  const maxedWins = [1, 2, 3, 4, 5, 6, 7, 8].filter(seed => play(seed, 10, MAXED).phase === 'won').length;
  assert.ok(maxedWins >= 6, `stage 10 with a maxed kingdom: ${maxedWins}/8 wins`);
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

test('Bron: a melee cone hits in front, not behind, and shoves enemies back', async () => {
  const { createRush: create, stepRush: step } = await import('./sim.ts');
  const { ENEMIES } = await import('./data.ts');
  const s = create(1, undefined, undefined, 'bron');
  const h = s.hero;
  const mk = (x: number, z: number) => { const e = { id: s.nextId++, kind: 'grunt' as const, x, z, kx: 0, kz: 0, hp: 1000, maxHp: 1000, lane: 0, wp: 1, cd: 99, flash: 0, chasing: false, facing: 0, windup: null }; s.enemies.push(e); return e; };
  const front = mk(h.x + 2, h.z), back = mk(h.x - 2, h.z), far = mk(h.x + 5, h.z);
  step(s, { fire: { x: 1, z: 0 } });
  assert.ok(front.hp < 1000 && front.kx > 0, 'front enemy hit and pushed');
  assert.equal(back.hp, 1000, 'behind is safe');
  assert.equal(far.hp, 1000, 'out of reach');
  assert.ok(s.events.some(e => e.type === 'swing'));
  assert.ok(ENEMIES.grunt.radius > 0);
});

test('Bron: the super slams around himself; both heroes keep the progression shape', async () => {
  const { createRush: create, stepRush: step } = await import('./sim.ts');
  const { HEROES } = await import('./data.ts');
  const s = create(1, undefined, undefined, 'bron');
  s.hero.superCharge = HEROES.bron.superHits;
  const ring = [[2, 0], [-2, 0], [0, 2]].map(([dx, dz]) => { const e = { id: s.nextId++, kind: 'grunt' as const, x: s.hero.x + dx, z: s.hero.z + dz, kx: 0, kz: 0, hp: 60, maxHp: 60, lane: 0, wp: 1, cd: 99, flash: 0, chasing: false, facing: 0, windup: null }; s.enemies.push(e); return e; });
  step(s, { super: { x: 5, z: 0 } }); // aim is ignored for a self-centred slam
  for (let i = 0; i < 12; i++) step(s, {});
  assert.ok(ring.every(e => e.hp <= 0), 'every enemy around him is hit');
  for (const seed of [1, 2]) {
    for (const n of [1, 2, 3]) assert.equal(playHero(seed, n, 'bron').phase, 'won', `bron stage ${n} seed ${seed}`);
    assert.equal(playHero(seed, 10, 'bron').phase, 'lost', `bron stage 10 seed ${seed} without upgrades`);
    assert.equal(playHero(seed, 10, 'bron', MAXED).phase, 'won', `bron stage 10 seed ${seed} maxed`);
  }
});

test('Bron joins after a star on stage 2; the choice is saved and old saves take the ranger', () => {
  let k = createKingdom(0);
  assert.equal(k.hero, 'ranger');
  assert.equal(heroUnlocked(k, 'bron'), false);
  assert.equal(chooseHero(k, 'bron').hero, 'ranger', 'locked heroes cannot be chosen');
  k = { ...k, stars: [3, 1, 0, 0, 0, 0, 0, 0, 0, 0] };
  k = chooseHero(k, 'bron');
  assert.equal(k.hero, 'bron');
  assert.equal(parseKingdom(serializeKingdom(k), 0).hero, 'bron');
  const old = { ...k } as Record<string, unknown>;
  delete old.hero;
  assert.equal(parseKingdom(JSON.stringify(old), 0).hero, 'ranger');
  assert.equal(parseKingdom(JSON.stringify({ ...k, stars: Array(10).fill(0) }), 0).hero, 'ranger', 'a tampered save cannot skip the unlock');
});

function playHero(seed: number, stage: number, hero: 'ranger' | 'bron', mods: RushMods = NO_MODS) {
  const s = createRush(seed, mods, stageDifficulty(stage), hero);
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < LIMIT) stepRush(s, guardBot(s));
  return s;
}

test('hero training pays off: Lv10 wins clearly more of stages 7-8, but stage 10 still needs the kingdom', () => {
  // The bot run is chaotic seed to seed, so the claim is about totals, not every single seed.
  const lv = (n: number): RushMods => { const g = heroGrowth(n); return { ...NO_MODS, damage: g.damage, heroHp: g.hp }; };
  for (const hero of ['ranger', 'bron'] as const) {
    const wins = (n: number) => [7, 8].reduce((sum, stage) => sum + [1, 2, 3, 4, 5, 6].filter(seed => playHero(seed, stage, hero, lv(n)).phase === 'won').length, 0);
    const low = wins(1), high = wins(10);
    assert.ok(high >= low + 3, `${hero}: stage 7-8 wins Lv1 ${low} → Lv10 ${high}`);
    for (const seed of [1, 2, 3, 4]) assert.equal(playHero(seed, 10, hero, lv(10)).phase, 'lost', `${hero} Lv10 alone, stage 10 seed ${seed}`);
  }
});
