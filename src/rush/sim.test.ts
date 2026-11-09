import test from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY, ENEMIES, HERO, HERO_SPAWN, PADS, STEP, TOWER_LEVELS } from './data.ts';
import { createRush, padCost, rushHash, stepRush, superReady, type Command, type Enemy, type RushState } from './sim.ts';
import { guardBot, idleBot } from './bot.ts';

const steps = (s: RushState, n: number, cmd: Command | ((s: RushState) => Command) = {}) => {
  for (let i = 0; i < n; i++) stepRush(s, typeof cmd === 'function' ? cmd(s) : cmd);
  return s;
};
const playOut = (seed: number, bot: (s: RushState) => Command, limit = 60 * 60 * 6) => {
  const s = createRush(seed);
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < limit) stepRush(s, bot(s));
  return s;
};
const enemy = (s: RushState, kind: Enemy['kind'], x: number, z: number): Enemy => {
  const e: Enemy = { id: s.nextId++, kind, x, z, kx: 0, kz: 0, hp: ENEMIES[kind].hp, maxHp: ENEMIES[kind].hp, lane: 0, wp: 1, cd: 99, flash: 0, chasing: false, facing: 0, windup: null };
  s.enemies.push(e);
  return e;
};

test('hero moves at full speed and stops at the town wall', () => {
  const s = createRush(1);
  steps(s, 60, { move: { x: 1, z: 0 } });
  assert.ok(Math.abs(s.hero.x - (HERO_SPAWN.x + HERO.speed)) < 0.01, `x=${s.hero.x}`);
  steps(s, 600, { move: { x: 0, z: 1 } });
  assert.ok(s.hero.z < 13, 'arena edge holds');
  const t = createRush(1);
  steps(t, 120, { move: { x: 0, z: 1 } }); // straight into the town
  assert.ok(Math.hypot(t.hero.x, t.hero.z - 10) >= 2.6 + HERO.radius - 1e-6, 'hero cannot enter the town');
});

test('three rounds of ammo, then a one-at-a-time reload', () => {
  const s = createRush(1);
  for (let i = 0; i < 3; i++) steps(s, Math.ceil(HERO.fireGap / STEP) + 1, { fire: { x: 0, z: -1 } });
  assert.equal(s.stats.shots, 3);
  assert.ok(s.hero.ammo < 1);
  const before = s.stats.shots;
  steps(s, 5, { fire: { x: 0, z: -1 } });
  assert.equal(s.stats.shots, before, 'an empty magazine does not fire');
  const s2 = createRush(1);
  steps(s2, 1, { fire: { x: 0, z: -1 } });
  assert.equal(s2.hero.ammo, 2);
  steps(s2, Math.ceil(HERO.reload / STEP) + 1);
  assert.equal(s2.hero.ammo, 3);
});

test('tap-to-fire auto-aims at the nearest enemy and hits charge the super', () => {
  const s = createRush(1);
  const target = enemy(s, 'brute', s.hero.x + 5, s.hero.z - 0.2);
  steps(s, 1, { fire: 'auto' });
  steps(s, 30);
  assert.ok(target.hp < ENEMIES.brute.hp, 'auto-aimed volley hit');
  assert.ok(s.hero.superCharge >= 2, `charge ${s.hero.superCharge}`);
});

test('a charged super blasts a crowd, knocks it back and resets the charge', () => {
  const s = createRush(1);
  s.hero.superCharge = HERO.superHits;
  assert.ok(superReady(s));
  const crowd = [enemy(s, 'grunt', 0, 0), enemy(s, 'grunt', 1, 0), enemy(s, 'brute', -1, 0.5)];
  const far = enemy(s, 'grunt', 0, -12);
  steps(s, 1, { super: { x: 0 - s.hero.x, z: 0 - s.hero.z } });
  assert.equal(s.hero.superCharge, 0);
  steps(s, Math.ceil(HERO.superTravel / STEP) + 2);
  assert.ok(crowd.every(e => e.hp < e.maxHp), 'everything in the radius was hit');
  assert.ok(crowd[0].hp <= 0 && crowd[1].hp <= 0, 'grunts die to one super');
  assert.equal(far.hp, far.maxHp, 'outside the radius is untouched');
  assert.equal(s.stats.supers, 1);
});

test('towers are built and upgraded only on a pad in reach and only with enough gold', () => {
  const s = createRush(1);
  steps(s, 1, { build: true });
  assert.equal(s.towers.filter(Boolean).length, 0, 'no pad in reach at spawn');
  s.hero.x = PADS[0].x; s.hero.z = PADS[0].z;
  steps(s, 1, { build: true });
  assert.equal(s.towers[0]?.level, 0);
  assert.equal(s.gold, ECONOMY.startGold - TOWER_LEVELS[0].cost);
  steps(s, 1, { build: true });
  assert.equal(s.towers[0]?.level, 0, 'cannot afford the upgrade yet');
  s.gold = 1000;
  steps(s, 2, { build: true });
  assert.equal(s.towers[0]?.level, 2);
  assert.equal(padCost(s, 0), null, 'max level');
});

test('a tower shoots enemies by itself and kills drop coins the hero can collect', () => {
  const s = createRush(1);
  s.towers[1] = { level: 2, cd: 0, facing: 0 };
  const e = enemy(s, 'grunt', PADS[1].x, PADS[1].z - 5);
  steps(s, 120);
  assert.ok(e.hp <= 0 && s.stats.kills === 1);
  assert.equal(s.coins.length, 1);
  const gold = s.gold;
  s.hero.x = s.coins[0].x; s.hero.z = s.coins[0].z + 2;
  steps(s, 30);
  assert.equal(s.gold, gold + ENEMIES.grunt.gold);
});

test('starting a wave early pays a bonus per remaining second', () => {
  const s = createRush(1);
  steps(s, 1, { startWave: true });
  assert.equal(s.phase, 'wave');
  assert.equal(s.gold, ECONOMY.startGold + Math.floor(ECONOMY.prepTime - 0) * ECONOMY.earlyBonusPerSecond);
});

test('the boss telegraphs its slam before it lands', () => {
  const s = createRush(1);
  const boss = enemy(s, 'boss', s.hero.x, s.hero.z - 3);
  boss.cd = 0;
  steps(s, 2);
  assert.ok(boss.windup, 'wind-up started');
  const hp = s.hero.hp;
  steps(s, Math.floor((ENEMIES.boss.windup! - 0.1) / STEP));
  assert.equal(s.hero.hp, hp, 'no damage during the telegraph');
  steps(s, 20, { move: { x: 1, z: 0 } }); // too late to escape a 2.8 m slam from standing still
  assert.ok(s.hero.hp < hp || s.hero.downT > 0, 'slam lands');
});

test('same seed and same inputs give the same game', () => {
  const a = playOut(7, guardBot, 60 * 40), b = playOut(7, guardBot, 60 * 40);
  assert.equal(rushHash(a), rushHash(b));
});

test('design pillars: hero alone or towers alone lose, both together win', () => {
  const heroOnly = (s: RushState) => { const c = guardBot(s); delete c.build; return c; };
  const towersOnly = (s: RushState) => { const c = guardBot(s); delete c.fire; delete c.super; return c; };
  for (const seed of [1, 2]) {
    assert.equal(playOut(seed, idleBot).phase, 'lost', `idle seed ${seed}`);
    assert.equal(playOut(seed, heroOnly).phase, 'lost', `hero only seed ${seed}`);
    assert.equal(playOut(seed, towersOnly).phase, 'lost', `towers only seed ${seed}`);
    const full = playOut(seed, guardBot);
    assert.equal(full.phase, 'won', `full seed ${seed}`);
    assert.ok(full.t > 100 && full.t < 240, `match length ${full.t}s stays in a 2–4 minute band`);
  }
});

test('the rules core stays engine-free (portable to a server or another renderer)', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['sim.ts', 'data.ts', 'bot.ts', 'kingdom.ts', 'stages.ts']) {
    const src = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    assert.ok(imports.every(i => ['./data.ts', './sim.ts', './kingdom.ts', './stages.ts'].includes(i)), `${file} imports only rules modules: ${imports.join(', ')}`);
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const banned of ['Math.random', 'document.', 'window.', 'performance.', 'Date.now', 'requestAnimationFrame']) {
      assert.ok(!code.includes(banned), `${file} must not use ${banned}`);
    }
  }
});
