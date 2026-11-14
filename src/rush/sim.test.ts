import test from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY, ENEMIES, HERO, HERO_SPAWN, PADS, STEP, TOWER_LEVELS, type EnemyKind } from './data.ts';
import { createRush, NO_MODS, padCost, rushHash, stepRush, superReady, wardBreakBurst, type Command, type Enemy, type RushEvent, type RushState } from './sim.ts';
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
  for (const file of ['sim.ts', 'data.ts', 'maps.ts', 'bot.ts', 'kingdom.ts', 'stages.ts']) {
    const src = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    assert.ok(imports.every(i => ['./data.ts', './maps.ts', './sim.ts', './kingdom.ts', './stages.ts'].includes(i)), `${file} imports only rules modules: ${imports.join(', ')}`);
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const banned of ['Math.random', 'document.', 'window.', 'performance.', 'Date.now', 'requestAnimationFrame']) {
      assert.ok(!code.includes(banned), `${file} must not use ${banned}`);
    }
  }
});

test('tall grass hides the hero from enemies beyond 1.8 m; attacking reveals for a second', async () => {
  const { BUSH } = await import('./data.ts');
  const BUSHES = (await import('./maps.ts')).FOREST.bushes;
  const { heroHidden } = await import('./sim.ts');
  const s = createRush(1);
  const b = BUSHES[0];
  s.hero.x = b.x; s.hero.z = b.z;
  assert.ok(heroHidden(s), 'hidden inside the bush');
  const watcher = enemy(s, 'grunt', b.x, b.z - 2.6); // inside the grunt's 3.2 m aggro, outside 1.8 m
  watcher.cd = 0;
  steps(s, 3);
  assert.equal(watcher.chasing, false, 'a hidden hero is not chased from 2.6 m');
  steps(s, 1, { fire: { x: 1, z: 0 } });
  assert.equal(heroHidden(s), false, 'attacking reveals');
  steps(s, 2);
  assert.equal(watcher.chasing, true, 'a revealed hero is chased');
  steps(s, Math.ceil((BUSH.exposeAfterAttack + 0.1) / STEP));
  s.hero.x = b.x; s.hero.z = b.z;
  assert.ok(heroHidden(s), 'hidden again after the reveal window');
  const close = enemy(s, 'grunt', b.x + 1.2, b.z);
  steps(s, 2);
  assert.equal(close.chasing, true, 'enemies right next to the bush still find the hero');
});

test('crates block movement and shots, break after enough damage and drop gold', async () => {
  const { CRATE } = await import('./data.ts');
  const CRATES = (await import('./maps.ts')).FOREST.crates;
  const s = createRush(1);
  const c = CRATES[0];
  s.hero.x = c.x; s.hero.z = c.z + 3;
  steps(s, 90, { move: { x: 0, z: -1 } });
  assert.ok(s.hero.z >= c.z + CRATE.size / 2 + HERO.radius - 1e-6, `stopped at the crate (${s.hero.z.toFixed(2)})`);
  const crate = s.crates[0], earned = s.stats.goldEarned;
  let volleys = 0;
  while (s.crates.includes(crate) && volleys++ < 20) steps(s, Math.ceil(HERO.reload / STEP) + 1, { fire: { x: 0, z: -1 } });
  assert.ok(!s.crates.includes(crate), 'the crate broke');
  // The hero stands right next to it, so the dropped coin may already be collected.
  assert.ok(s.coins.some(k => k.value === CRATE.gold) || s.stats.goldEarned >= earned + CRATE.gold, 'it dropped gold');
  steps(s, 60, { move: { x: 0, z: -1 } });
  assert.ok(s.hero.z < c.z, 'the path is open once it is gone');
});

test('tower branches: Lv2 picks fire or frost and Lv3 keeps it; fire splashes, frost slows (boss less)', async () => {
  const { PADS, TOWER_BRANCH, ENEMIES } = await import('./data.ts');
  const s = createRush(1);
  s.gold = 1000;
  Object.assign(s.hero, { x: PADS[0].x, z: PADS[0].z });
  stepRush(s, { build: true });
  stepRush(s, { build: 'frost' });
  assert.equal(s.towers[0]!.branch, 'frost');
  stepRush(s, { build: 'fire' });
  assert.deepEqual([s.towers[0]!.level, s.towers[0]!.branch], [2, 'frost'], 'Lv3 keeps the Lv2 branch');
  Object.assign(s.hero, { x: PADS[1].x, z: PADS[1].z });
  stepRush(s, { build: true }); stepRush(s, { build: true });
  assert.equal(s.towers[1]!.branch, 'fire', 'a plain build picks fire');

  // Fire: the neighbour of the target takes splash damage.
  const f = createRush(2);
  f.phase = 'wave'; f.groups = [];
  f.towers[0] = { level: 1, cd: 0, facing: 0, branch: 'fire' };
  const a = enemy(f, 'brute', PADS[0].x, PADS[0].z - 3), b = enemy(f, 'brute', PADS[0].x + 0.9, PADS[0].z - 3);
  for (let i = 0; i < 40 && a.hp === a.maxHp && b.hp === b.maxHp; i++) stepRush(f, {});
  for (let i = 0; i < 20; i++) stepRush(f, {});
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'both brutes hurt by one fire tower');

  // Frost: a slowed grunt covers less ground; the boss is slowed less.
  const pace = (kind: 'grunt' | 'boss', branch: 'frost' | undefined) => {
    const g = createRush(3);
    g.phase = 'wave'; g.groups = [];
    g.towers[0] = { level: 1, cd: 0, facing: 0, ...(branch ? { branch } : {}) };
    const e = enemy(g, kind, 0, -6);
    e.hp = e.maxHp = 1e6;
    for (let i = 0; i < 30; i++) { e.slowT = branch ? TOWER_BRANCH.frost.slowTime : 0; stepRush(g, {}); }
    return Math.abs(e.z + 6) / (ENEMIES[kind].speed * 0.5);
  };
  assert.ok(Math.abs(pace('grunt', 'frost') - TOWER_BRANCH.frost.slow) < 0.05, `grunt pace ${pace('grunt', 'frost')}`);
  assert.ok(Math.abs(pace('boss', 'frost') - TOWER_BRANCH.frost.bossSlow) < 0.05, `boss pace ${pace('boss', 'frost')}`);
});

test('tower branches play different roles: fire hits extra enemies per bolt, only frost slows', () => {
  const run = (seed: number, branch: 'fire' | 'frost') => {
    const s = createRush(seed);
    let hits = 0, splashes = 0, slowed = 0;
    while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < 60 * 60 * 6) {
      const c = guardBot(s);
      if (typeof c.build === 'string') c.build = branch;
      stepRush(s, c);
      for (const ev of s.events) { if (ev.type === 'hit' && ev.owner === 'tower') hits++; if (ev.type === 'splash') splashes++; }
      for (const e of s.enemies) if ((e.slowT ?? 0) > 0) slowed++;
    }
    return { hits, splashes, slowed };
  };
  for (const seed of [1, 2, 3]) {
    const fire = run(seed, 'fire'), frost = run(seed, 'frost');
    // Fire: every landing is one target hit plus splash hits on neighbours.
    assert.ok(fire.splashes > 0 && fire.hits - fire.splashes >= fire.splashes * 0.1, `seed ${seed}: fire ${fire.hits} hits over ${fire.splashes} landings`);
    assert.equal(frost.splashes, 0);
    assert.ok(frost.slowed > 0 && fire.slowed === 0, `seed ${seed}: slowed enemy-ticks frost ${frost.slowed}, fire ${fire.slowed}`);
  }
});

test('forge levels widen fire splash and lengthen frost slows', async () => {
  const { PADS, TOWER_BRANCH, FORGE } = await import('./data.ts');
  const splash = (forge: number) => {
    const s = createRush(2, { ...NO_MODS, forge });
    s.phase = 'wave'; s.groups = [];
    s.towers[0] = { level: 1, cd: 0, facing: 0, branch: 'fire' };
    const a = enemy(s, 'brute', PADS[0].x, PADS[0].z - 3), b = enemy(s, 'brute', PADS[0].x + 0.9, PADS[0].z - 3);
    a.hp = a.maxHp = b.hp = b.maxHp = 1e6;
    let hits: number[] = [];
    for (let i = 0; i < 120 && hits.length < 2; i++) { stepRush(s, {}); hits = s.events.filter(e => e.type === 'hit' && e.owner === 'tower').map(e => (e as { damage: number }).damage); }
    return hits[1] / hits[0];
  };
  assert.ok(Math.abs(splash(0) - TOWER_BRANCH.fire.splashShare) < 1e-9, `splash share ${splash(0)}`);
  assert.ok(Math.abs(splash(5) - (TOWER_BRANCH.fire.splashShare + 5 * FORGE.splashShare)) < 1e-9, `forge 5 splash share ${splash(5)}`);
  const slow = (forge: number) => {
    const s = createRush(3, { ...NO_MODS, forge });
    s.phase = 'wave'; s.groups = [];
    s.towers[0] = { level: 1, cd: 0, facing: 0, branch: 'frost' };
    const e = enemy(s, 'brute', PADS[0].x, PADS[0].z - 3);
    e.hp = e.maxHp = 1e6;
    for (let i = 0; i < 120 && !s.events.some(v => v.type === 'chill'); i++) stepRush(s, {});
    return e.slowT ?? 0;
  };
  assert.ok(Math.abs(slow(0) - TOWER_BRANCH.frost.slowTime) < 1e-9 && Math.abs(slow(5) - (TOWER_BRANCH.frost.slowTime + 5 * FORGE.slowTime)) < 1e-9, `slow ${slow(0)} / ${slow(5)}`);
});

test('shield-bearers turn aside frontal bolts only, and appear from stage 6', async () => {
  const { ENEMIES, WAVES } = await import('./data.ts');
  const { stageDifficulty } = await import('./stages.ts');
  const { groupCount } = await import('./sim.ts');
  const hitFrom = (fromFront: boolean) => {
    // The hero stands south, out of aggro range, so the bearer keeps walking its lane: towards the hero
    // (waypoint 3, south: shield in front) or away (waypoint 1, north: bolts hit its back).
    const s = createRush(1);
    const e = enemy(s, 'shield', 0, -6);
    e.wp = fromFront ? 3 : 1;
    Object.assign(s.hero, { x: 0, z: -1.5, facing: -Math.PI / 2 });
    // Damage of the first bolt that lands (the spread can make one, two or three land).
    let lost = 0, blocked = false;
    for (let i = 0; i < 40 && !lost; i++) {
      stepRush(s, { fire: { x: 0, z: -1 } });
      const hit = s.events.find(v => v.type === 'hit' && v.owner === 'hero');
      if (hit && hit.type === 'hit') { lost = hit.damage; blocked = s.events.some(v => v.type === 'block'); }
    }
    return { lost, blocked };
  };
  const front = hitFrom(true), back = hitFrom(false);
  assert.ok(front.lost > 0 && back.lost > 0, JSON.stringify({ front, back }));
  assert.ok(Math.abs(front.lost / back.lost - ENEMIES.shield.shield!) < 0.01 && front.blocked && !back.blocked, `front ${front.lost} vs back ${back.lost}`);
  // Only from stage 6.
  const shieldGroups = WAVES.flat().filter(g => g.kind === 'shield');
  assert.ok(shieldGroups.length > 0);
  assert.ok(shieldGroups.every(g => groupCount(createRush(1, undefined, stageDifficulty(5)), g) === 0), 'none before stage 6');
  assert.ok(shieldGroups.every(g => groupCount(createRush(1, undefined, stageDifficulty(6)), g) > 0), 'present from stage 6');
});

test("the shield does not stop Bron's swing", () => {
  const s = createRush(1, undefined, undefined, 'bron');
  const e = enemy(s, 'shield', 0, -2.2);
  e.facing = Math.PI / 2;
  Object.assign(s.hero, { x: 0, z: -0.8, facing: -Math.PI / 2 });
  const before = e.hp;
  for (let i = 0; i < 30 && e.hp === before; i++) stepRush(s, { fire: { x: 0, z: -1 } });
  assert.ok(e.hp < before, 'swing landed');
  assert.ok(!s.events.some(v => v.type === 'block'));
});

test('auto-aim skips a raised shield when another target is close, but still shoots a lone shield-bearer', async () => {
  const { autoTarget, shieldFaces, SHIELD_AIM_PENALTY } = await import('./sim.ts');
  const s = createRush(1);
  Object.assign(s.hero, { x: 0, z: 0 });
  const shield = enemy(s, 'shield', 0, -3), grunt = enemy(s, 'grunt', 2.5, -3.6);
  shield.facing = Math.PI / 2; // facing the hero (south)
  assert.ok(shieldFaces(shield, s.hero));
  assert.equal(autoTarget(s, s.hero, 9.5), grunt, 'the grunt behind the shield line is the better shot');
  grunt.hp = 0;
  assert.equal(autoTarget(s, s.hero, 9.5), shield, 'alone, the shield-bearer is still the target');
  grunt.hp = 60;
  shield.facing = -Math.PI / 2; // turned away: no penalty, the nearer one wins
  assert.ok(!shieldFaces(shield, s.hero));
  assert.equal(autoTarget(s, s.hero, 9.5), shield);
  assert.ok(SHIELD_AIM_PENALTY > 0);
});

test('boss rally: from stage 6, below half health it roars in place for a second, then calls its minions once, town side', async () => {
  const { stageDifficulty } = await import('./stages.ts');
  const call = ENEMIES.boss.summon!;
  const setup = (stage: number) => {
    const s = createRush(1, NO_MODS, stageDifficulty(stage));
    Object.assign(s.hero, { x: 9, z: 9 }); // far away: the boss walks its lane
    const b = enemy(s, 'boss', 0, -8);
    b.hp = Math.floor(b.maxHp * call.at);
    return { s, b };
  };
  const run = (s: RushState, n: number) => { const seen: string[] = []; for (let i = 0; i < n; i++) { stepRush(s, {}); seen.push(...s.events.map(e => e.type)); } return seen; };
  const { s, b } = setup(6);
  assert.ok(run(s, 1).includes('roar'), 'roars on dropping to half');
  const at = { x: b.x, z: b.z }, roarTicks = Math.round(call.roar / STEP);
  const during = run(s, roarTicks - 2);
  assert.ok(!during.includes('summon') && s.enemies.length === 1, 'nobody yet during the roar');
  assert.ok(Math.hypot(b.x - at.x, b.z - at.z) < 1e-9, 'stands still while roaring');
  assert.ok(run(s, 3).includes('summon'), 'calls when the roar ends');
  const minions = s.enemies.filter(e => e !== b);
  assert.equal(minions.length, call.count);
  assert.ok(minions.every(m => m.kind === call.kind && m.hp === Math.round(ENEMIES[call.kind].hp * stageDifficulty(6).enemyHp) && m.lane === b.lane));
  assert.ok(minions.every(m => Math.hypot(m.x - b.x, m.z - b.z) > ENEMIES.boss.radius), 'minions appear around the boss, not inside it');
  // Cycle 34: they stand on the arc that faces the town (here due south), so the boss never hides one from the camera.
  const { TOWN } = await import('./data.ts');
  const toTown = Math.atan2(TOWN.z - b.z, TOWN.x - b.x);
  const off = (m: Enemy) => { const d = Math.atan2(m.z - b.z, m.x - b.x) - toTown; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); };
  assert.ok(minions.every(m => off(m) <= call.arc / 2 + 0.1 && m.z > b.z), `minions lead towards the town: ${minions.map(off).map(v => v.toFixed(2))}`);
  b.hp = Math.floor(b.maxHp * 0.2);
  const later = run(s, 120);
  assert.ok(!later.includes('roar') && !later.includes('summon'), 'only once per boss');
  // Stage 5 and below: no rally, the boss keeps walking.
  const low = setup(5);
  const seen = run(low.s, 90);
  assert.ok(!seen.includes('roar') && low.s.enemies.length === 1 && Math.hypot(low.b.x, low.b.z + 8) > 0.5, 'no rally before stage 6');
  // A boss killed mid-roar calls nobody.
  const cut = setup(6);
  run(cut.s, 1);
  cut.b.hp = 0;
  assert.ok(!run(cut.s, roarTicks + 5).includes('summon'), 'killed during the roar: no minions');
});

test('Popo (cycle 39): a snowball lands where thrown, hurts and slows everything in the splash, ignores shields, charges the super', async () => {
  const { HEROES } = await import('./data.ts');
  const def = HEROES.bear;
  const s = createRush(1, NO_MODS, undefined, 'bear');
  Object.assign(s.hero, { x: 0, z: 0, facing: -Math.PI / 2 });
  // A shield-bearer facing the hero and a grunt beside it, both 4 m north; a third grunt far outside the splash.
  const sh = enemy(s, 'shield', 0, -4); sh.facing = Math.PI / 2;
  const g = enemy(s, 'grunt', 0.9, -4);
  const far = enemy(s, 'grunt', 6, -4);
  for (const e of [sh, g, far]) e.wp = 99; // past the lane's end: they only edge towards the town during the throw
  stepRush(s, { fire: 'auto' });
  assert.equal(s.shots.filter(x => x.owner === 'lob').length, 1, 'one snowball in the air');
  const seen: string[] = [];
  for (let i = 0; i < Math.round((def.lobTravel ?? 0.5) / STEP) + 2; i++) { stepRush(s, {}); seen.push(...s.events.map(e => e.type)); }
  assert.ok(seen.includes('snow') && !seen.includes('block'), 'lands with a splash; no shield block');
  const dmg = def.boltDamage;
  assert.ok(Math.abs(sh.maxHp - sh.hp - dmg) < 1e-6, `shield-bearer takes full damage (${sh.maxHp - sh.hp})`);
  assert.ok(Math.abs(g.maxHp - g.hp - dmg) < 1e-6, 'the grunt beside it too');
  assert.equal(far.hp, far.maxHp, 'outside the splash: untouched');
  assert.ok((sh.slowT ?? 0) > 0 && (g.slowT ?? 0) > 0 && !(far.slowT ?? 0), 'both in the splash are slowed');
  assert.equal(s.hero.superCharge, 2, 'each enemy hit charges the super');
});

test('aim offsets (cycle 40): a hand-thrown snowball lands as far as aimed, within 1.5 m and its range; bolts use only the direction', async () => {
  const { HEROES } = await import('./data.ts');
  const { LOB_MIN } = await import('./sim.ts');
  const landing = (offset: { x: number; z: number }) => {
    const s = createRush(1, NO_MODS, undefined, 'bear');
    Object.assign(s.hero, { x: 0, z: 0 });
    stepRush(s, { fire: offset });
    const shot = s.shots.find(x => x.owner === 'lob')!;
    return Math.hypot(shot.tx, shot.tz);
  };
  assert.ok(Math.abs(landing({ x: 0, z: -4 }) - 4) < 1e-9, 'aimed 4 m → lands 4 m out');
  assert.ok(Math.abs(landing({ x: 3, z: -20 }) - HEROES.bear.range) < 1e-9, 'beyond range → at range');
  assert.ok(Math.abs(landing({ x: 0, z: -0.5 }) - LOB_MIN) < 1e-9, 'too close → the minimum');
  // The ranger's bolts fly the same whatever the offset's length.
  const bolts = (offset: { x: number; z: number }) => { const s = createRush(1); stepRush(s, { fire: offset }); return s.shots.filter(x => x.owner === 'hero').map(x => [x.vx.toFixed(6), x.vz.toFixed(6)].join()); };
  assert.deepEqual(bolts({ x: 0, z: -1 }), bolts({ x: 0, z: -7.5 }));
});

test('endless challenge (cycle 46): the five waves loop, each lap is harder, and it never ends in a win', async () => {
  const { stageDifficulty } = await import('./stages.ts');
  const { ENDLESS_LAP, WAVE_COUNT } = await import('./sim.ts');
  const s = createRush(1, NO_MODS, { ...stageDifficulty(10), endless: true });
  s.town.hp = s.town.maxHp = 1e9; // hold forever: only the wave loop is under test
  const hp0 = s.diff.enemyHp, n0 = s.diff.enemyCount;
  while (s.wave < WAVE_COUNT + 1 && s.tick < 60 * 60 * 30) stepRush(s, guardBot(s));
  assert.ok(s.wave >= WAVE_COUNT + 1, `past the fifth wave (wave index ${s.wave})`);
  assert.notEqual(s.phase, 'won');
  assert.ok(Math.abs(s.diff.enemyHp - hp0 * ENDLESS_LAP.enemyHp) < 1e-9 && Math.abs(s.diff.enemyCount - n0 * ENDLESS_LAP.enemyCount) < 1e-9, 'one lap harder');
  // A stage battle still ends in a win after five waves.
  const t = playOut(1, guardBot);
  assert.equal(t.phase, 'won');
  assert.equal(t.wave, WAVE_COUNT - 1);
});

test('endless lap event (cycle 47): one per new lap, numbered from 2; none in a stage battle', async () => {
  const { stageDifficulty } = await import('./stages.ts');
  const { WAVE_COUNT } = await import('./sim.ts');
  const s = createRush(1, NO_MODS, { ...stageDifficulty(10), endless: true });
  s.town.hp = s.town.maxHp = 1e9;
  const laps: { lap: number; wave: number }[] = [];
  while (s.wave < 2 * WAVE_COUNT + 1 && s.tick < 60 * 60 * 60) {
    stepRush(s, guardBot(s));
    for (const e of s.events) if (e.type === 'lap') laps.push({ lap: e.lap, wave: s.wave });
  }
  assert.deepEqual(laps, [{ lap: 2, wave: WAVE_COUNT }, { lap: 3, wave: 2 * WAVE_COUNT }]);
  const t = createRush(1);
  let seen = 0;
  while (t.phase !== 'won' && t.phase !== 'lost' && t.tick < 60 * 60 * 6) { stepRush(t, guardBot(t)); seen += t.events.filter(e => e.type === 'lap').length; }
  assert.equal(seen, 0);
});

test('endless lap twists (cycle 52): swift, shields, twin in turn from lap 2; none in a stage battle', async () => {
  const { stageDifficulty } = await import('./stages.ts');
  const { twistForLap, groupCount, TWIST, WAVE_COUNT } = await import('./sim.ts');
  const { WAVES } = await import('./data.ts');
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(twistForLap), [undefined, 'swift', 'shields', 'twin', 'swift', 'shields', 'twin']);
  const base = { ...stageDifficulty(10), endless: true };
  const at = (twist?: 'swift' | 'shields' | 'twin') => createRush(1, NO_MODS, { ...base, twist });
  const shieldGroup = WAVES.flat().find(g => g.kind === 'shield')!, bossGroup = WAVES.flat().find(g => g.kind === 'boss')!;
  assert.equal(groupCount(at('shields'), shieldGroup), Math.round(shieldGroup.count * base.enemyCount * TWIST.shieldCount));
  assert.equal(groupCount(at(), shieldGroup), Math.round(shieldGroup.count * base.enemyCount));
  assert.equal(groupCount(at('twin'), bossGroup), 2);
  assert.equal(groupCount(at(), bossGroup), 1);
  // Swift: a grunt with nothing in reach walks 20% further per tick.
  const walk = (twist?: 'swift') => { const s = at(twist); Object.assign(s.hero, { x: 9, z: 9 }); const e = enemy(s, 'grunt', 0, -10); e.wp = 99; const z0 = e.z; steps(s, 30); return e.z - z0; };
  assert.ok(Math.abs(walk('swift') / walk() - TWIST.swiftSpeed) < 0.02, `swift ×${(walk('swift') / walk()).toFixed(3)}`);
  // The lap event carries the twist; stage battles never get one.
  const s = createRush(1, NO_MODS, base);
  s.town.hp = s.town.maxHp = 1e9;
  const seen: (string | undefined)[] = [];
  while (s.wave < WAVE_COUNT + 1 && s.tick < 60 * 60 * 30) { stepRush(s, guardBot(s)); for (const e of s.events) if (e.type === 'lap') seen.push(e.twist); }
  assert.deepEqual(seen, ['swift']);
  assert.equal(s.diff.twist, 'swift');
  assert.equal(createRush(1, NO_MODS, stageDifficulty(10)).diff.twist, undefined);
});

test('shaman (cycle 59): its pulse heals hurt allies in range, never itself or the unhurt or the far, and reports it', () => {
  // Heal is endless-only since cycle 90 (stage 11 = the endless challenge); stage 8 keeps only the ward (below).
  const s = createRush(1, NO_MODS, { enemyHp: 2, enemyCount: 1, enemyDamage: 1, stage: 11 });
  s.prepT = 999; // stay in prep: no spawns, but enemies still update
  const mk = (id: number, kind: EnemyKind, x: number, hp: number, maxHp: number): Enemy =>
    ({ id, kind, x, z: -12, kx: 0, kz: 0, hp, maxHp, lane: 0, wp: 1, cd: 9, flash: 0, chasing: false, facing: 0, windup: null });
  const shaman = mk(1, 'shaman', 0, 10, 140), near = mk(2, 'brute', 2, 100, 520), full = mk(3, 'grunt', -1.5, 120, 120), far = mk(4, 'grunt', 9, 10, 120);
  const almost = mk(5, 'grunt', -1, 110, 120); // cycle 60: a heal that tops out reports only what it restored
  s.enemies.push(shaman, near, full, far, almost);
  const heal = ENEMIES.shaman.heal!;
  let pulses: RushEvent[] = [];
  const healed: RushEvent[] = [];
  const at = new Map(s.enemies.map(e => [e, e.x]));
  for (let t = 0; t < heal.every + 0.05; t += STEP) {
    for (const e of s.enemies) { e.x = at.get(e)!; e.z = -12; } // pinned: only the pulse is under test
    stepRush(s, {});
    pulses.push(...s.events.filter(e => e.type === 'heal'));
    healed.push(...s.events.filter(e => e.type === 'healed'));
  }
  assert.equal(pulses.length, 1, 'one pulse per period');
  assert.equal(near.hp, 100 + heal.amount * 2, 'ally in range healed by amount × stage health');
  assert.equal(shaman.hp, 10, 'never heals itself');
  assert.equal(full.hp, 120, 'unhurt ally unchanged');
  assert.equal(far.hp, 10, 'ally out of range unchanged');
  assert.equal(almost.hp, 120, 'capped at max');
  assert.deepEqual(pulses[0].type === 'heal' && [pulses[0].count, pulses[0].radius], [2, heal.radius]);
  assert.deepEqual(healed.map(e => e.type === 'healed' && [e.id, e.amount]), [[2, heal.amount * 2], [5, 10]], 'one healed event per ally with the amount restored');
});

test('boss arrival (cycle 67): exactly one bossEnter per boss, at its spawn, and none for other enemies', () => {
  const s = createRush(3);
  const enters: RushEvent[] = [];
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < 60 * 60 * 8) {
    stepRush(s, guardBot(s));
    for (const e of s.events) if (e.type === 'bossEnter') {
      enters.push(e);
      const boss = s.enemies.find(x => x.id === e.id)!;
      assert.equal(boss.kind, 'boss');
      assert.ok(Math.hypot(boss.x - e.x, boss.z - e.z) < 0.3, 'reported where it spawned (it has taken at most one step since)');
    }
  }
  assert.equal(enters.length, 1, 'stage 1 has one boss');
});

test('ward (cycle 90): the shaman wards allies in range for a while, and from stage 8 heals no one', () => {
  const s = createRush(1, NO_MODS, { enemyHp: 1, enemyCount: 1, enemyDamage: 1, stage: 8 });
  s.prepT = 999;
  const ward = ENEMIES.shaman.ward!;
  const shaman = enemy(s, 'shaman', 0, -12), near = enemy(s, 'brute', 3, -12), far = enemy(s, 'grunt', 9, -12);
  near.hp = 100;
  const at = new Map(s.enemies.map(e => [e, e.x]));
  const wards: RushEvent[] = [];
  for (let t = 0; t < ward.every + 0.05; t += STEP) {
    for (const e of s.enemies) { e.x = at.get(e)!; e.z = -12; }
    stepRush(s, {});
    wards.push(...s.events.filter(e => e.type === 'ward'));
    assert.ok(!s.events.some(e => e.type === 'heal'), 'no heal below the endless challenge');
  }
  assert.equal(wards.length, 1, 'one pulse per period');
  assert.ok((near.wardT ?? 0) > ward.duration - 0.1, 'ally in range warded for the duration');
  assert.equal(far.wardT ?? 0, 0, 'ally out of range unwarded');
  assert.equal(shaman.wardT ?? 0, 0, 'never wards itself');
  assert.equal(near.hp, 100, 'no heal at stage 8');
  shaman.hp = 0; // with the shaman gone the ward runs out
  steps(s, Math.ceil(ward.duration / STEP) + 1);
  assert.equal(near.wardT, 0, 'the ward wears off');
});

test('ward (cycle 90): towers only scratch a warded enemy', () => {
  const taken = (warded: boolean) => {
    const s = createRush(1);
    s.towers[1] = { level: 2, cd: 0, facing: 0 };
    const e = enemy(s, 'brute', PADS[1].x, PADS[1].z - 5);
    for (let i = 0; i < 90; i++) { if (warded) e.wardT = 9; stepRush(s, {}); }
    return e.maxHp - e.hp;
  };
  const open = taken(false), shut = taken(true);
  assert.ok(open > 0, 'the tower hits');
  assert.ok(Math.abs(shut - open * ENEMIES.shaman.ward!.towerShare) < 1e-6, `warded takes the tower share (${shut} vs ${open})`);
});

test('ward (cycle 90): a hero hit breaks it; the ranger breaks only its target, Bron the wards around his', () => {
  const hitAll = (hero: 'ranger' | 'bron', dx: number, dz: number, others: [number, number][]) => {
    const s = createRush(1, NO_MODS, undefined, hero);
    s.prepT = 999;
    const h = s.hero, target = enemy(s, 'brute', h.x + dx, h.z + dz);
    const rest = others.map(([x, z]) => enemy(s, 'grunt', target.x + x, target.z + z));
    for (const e of s.enemies) e.wardT = 9;
    const breaks: RushEvent[] = [];
    for (let i = 0; i < 90 && (target.wardT ?? 0) > 0; i++) { stepRush(s, { fire: { x: dx, z: dz } }); breaks.push(...s.events.filter(e => e.type === 'wardBreak')); }
    return { target, rest, breaks };
  };
  const r = hitAll('ranger', 0, -4, [[1.2, 0]]);
  assert.equal(r.target.wardT, 0, 'ranger bolt breaks the ward');
  assert.ok(r.breaks.some(e => e.type === 'wardBreak' && e.id === r.target.id), 'and reports it');
  assert.ok((r.rest[0].wardT ?? 0) > 0, 'a bolt breaks only what it hits');
  // The second grunt stands 2.4 m behind the target: past Bron's 2.8 m reach from the hero, inside the 2.5 m break.
  const b = hitAll('bron', 0, -1.1, [[0, -2.4], [5, -1]]);
  assert.equal(b.target.wardT, 0, 'Bron breaks his target');
  assert.equal(b.rest[0].hp, b.rest[0].maxHp, 'the second grunt is out of the swing itself');
  assert.equal(b.rest[0].wardT, 0, 'yet its ward within 2.5 m of the target breaks');
  assert.ok((b.rest[1].wardT ?? 0) > 0, 'but not one further away');
});

test('ward breaks (cycle 91): one step summarised as a count, a centre and a covering radius', () => {
  const firstBreak = (hero: 'ranger' | 'bron', dx: number, dz: number, others: [number, number][]) => {
    const s = createRush(1, NO_MODS, undefined, hero);
    s.prepT = 999;
    const target = enemy(s, 'brute', s.hero.x + dx, s.hero.z + dz);
    for (const [x, z] of others) enemy(s, 'grunt', target.x + x, target.z + z);
    for (const e of s.enemies) e.wardT = 9;
    for (let i = 0; i < 90; i++) { stepRush(s, { fire: { x: dx, z: dz } }); const b = wardBreakBurst(s.events); if (b) return b; }
    return null;
  };
  assert.equal(wardBreakBurst([]), null, 'no breaks, no burst');
  const bolt = firstBreak('ranger', 0, -4, [[1.2, 0]]);
  assert.equal(bolt?.count, 1, 'a ranger bolt breaks one ward');
  assert.equal(bolt?.radius, 0);
  const swing = firstBreak('bron', 0, -1.1, [[0, -2.4], [0.8, 0.6]]);
  assert.ok(swing && swing.count >= 2, `Bron's swing clears several at once (${swing?.count})`);
  assert.ok(swing!.radius >= 1.2 - 1e-9, 'the radius reaches the furthest break');
});


// ---------- battlefield layouts (maps.ts) ----------
test('layout follows the region: stages 6-10 fight on the snow map, everything else in the forest', async () => {
  const { mapFor, FOREST, SNOW } = await import('./maps.ts');
  const { regionOf } = await import('./expedition.ts');
  for (let stage = 1; stage <= 11; stage++) assert.equal(mapFor(stage).id, regionOf(stage), `stage ${stage}`);
  // One battlefield per stage, named after its village; the endless challenge reuses stage 1's.
  const { STAGE_MAPS } = await import('./maps.ts');
  const { EXPEDITION } = await import('./expedition.ts');
  assert.equal(STAGE_MAPS.length, 10);
  STAGE_MAPS.forEach((m, i) => { assert.equal(m.stage, i + 1); assert.equal(m.name, EXPEDITION[i].name); assert.equal(mapFor(i + 1), m); });
  assert.equal(mapFor(11), STAGE_MAPS[0]);
  const shape = (m: (typeof STAGE_MAPS)[number]) => JSON.stringify([m.walls, m.crates, m.bushes, m.ice, m.stream, m.props]);
  assert.equal(new Set(STAGE_MAPS.map(shape)).size, 10, 'no two stages share a battlefield');
  // What the guard bot's battles depend on is the same on every stage of a region: the gate-road cover pair, the two
  // walls beside the gate road, a stream that only slows the hero, and ice that leaves the march alone.
  for (const m of STAGE_MAPS) {
    assert.ok(m.bushes.some(b => b.x === 3.6 && b.z === 1.5) && m.walls.some(w => w.x === 3.2 && w.z === -3.5), m.name);
    assert.equal(m.walls.filter(w => w.z + w.d / 2 > -5 && Math.abs(w.x) < 9).length, 2, `${m.name}: nothing else solid near the gate road`);
    assert.equal(m.bushes.filter(b => b.z + b.d / 2 > -2).length, 2, `${m.name}: no other cover near the town`);
  }
  assert.equal(createRush(1).map, FOREST, 'a battle without a stage is the forest');
  const snow = createRush(1, NO_MODS, { enemyHp: 1, enemyCount: 1, enemyDamage: 1, stage: 6 });
  assert.equal(snow.map, SNOW);
  assert.deepEqual(snow.crates.map(c => [c.x, c.z]), SNOW.crates.map(c => [c.x, c.z]));
  assert.equal(snow.nextId, 1 + SNOW.crates.length);
  // The two halves of the campaign do not share a wall, a crate spot or a zone; only the cover by the gate road.
  const key = (b: { x: number; z: number }) => `${b.x},${b.z}`;
  assert.equal(FOREST.walls.filter(w => SNOW.walls.some(o => key(o) === key(w) && o.kind === w.kind)).length, 0);
  assert.equal(FOREST.crates.filter(c => SNOW.crates.some(o => key(o) === key(c))).length, 0);
  assert.equal(FOREST.bushes.filter(c => SNOW.bushes.some(o => key(o) === key(c))).length, 2);
  assert.ok(FOREST.stream && !SNOW.stream && SNOW.ice.length === 3 && FOREST.ice.length === 0);
});

test('layouts keep the lanes, the town, the pads and the barricade strip clear, and are mirror-symmetric', async () => {
  const { STAGE_MAPS, laneDistance, onBridge, pathDistance, onIce } = await import('./maps.ts');
  const { ARENA, LANES, PADS, TOWN, HERO_SPAWN, CRATE } = await import('./data.ts');
  const gap = (b: { x: number; z: number; w: number; d: number }, p: { x: number; z: number }) => Math.hypot(Math.max(0, Math.abs(p.x - b.x) - b.w / 2), Math.max(0, Math.abs(p.z - b.z) - b.d / 2));
  /** Smallest distance from a block to any lane centre line (sampled every 10 cm along the lanes). */
  const laneGap = (b: { x: number; z: number; w: number; d: number }) => {
    let best = Infinity;
    for (const lane of LANES) for (let i = 1; i < lane.length; i++) for (let u = 0; u <= 1; u += 0.1 / Math.hypot(lane[i].x - lane[i - 1].x, lane[i].z - lane[i - 1].z))
      best = Math.min(best, gap(b, { x: lane[i - 1].x + (lane[i].x - lane[i - 1].x) * u, z: lane[i - 1].z + (lane[i].z - lane[i - 1].z) * u }));
    return best;
  };
  for (const m of STAGE_MAPS) {
    const solids = [...m.walls, ...m.crates.map(c => ({ ...c, w: CRATE.size, d: CRATE.size }))];
    for (const b of solids) {
      assert.ok(b.x - b.w / 2 >= ARENA.minX && b.x + b.w / 2 <= ARENA.maxX && b.z - b.d / 2 >= ARENA.minZ && b.z + b.d / 2 <= ARENA.maxZ, `${m.id}: inside the arena`);
      for (const o of solids) assert.ok(o === b || Math.abs(o.x - b.x) >= (o.w + b.w) / 2 || Math.abs(o.z - b.z) >= (o.d + b.d) / 2, `${m.name}: solids overlap at ${b.x},${b.z}`);
      // The boss (radius 1.15) and a brute pushed aside by a crowd still pass: 1.3 m from every lane centre line.
      assert.ok(laneGap(b) >= 1.3, `${m.id}: solid at ${b.x},${b.z} is ${laneGap(b).toFixed(2)} m from a lane`);
      assert.ok(gap(b, TOWN) >= TOWN.radius + 1.5 && gap(b, HERO_SPAWN) >= 1.5, `${m.id}: clear of the town and the hero's start`);
      for (const p of PADS) assert.ok(gap(b, p) >= 2, `${m.id}: clear of a tower pad`);
      // Barricade strip: the lanes 4-9 m north of the town stay free of solid cover.
      if (b.z + b.d / 2 > TOWN.z - 9 && b.z - b.d / 2 < TOWN.z - 4) assert.ok(laneGap(b) >= 3, `${m.id}: barricade strip`);
    }
    for (const list of [m.walls, m.bushes, m.crates, m.ice, m.props] as const) for (const b of list)
      assert.ok(list.some(o => o.x === -b.x && o.z === b.z), `${m.id}: mirrored at ${b.x},${b.z}`);
    // Every lane crosses the stream on a bridge, and every ice sheet lies on a lane.
    if (m.stream) for (const lane of LANES) for (let z = -26; z < 8; z += 0.05) {
      const i = lane.findIndex((p, k) => k > 0 && z >= lane[k - 1].z && z <= p.z);
      if (i < 1) continue;
      const u = (z - lane[i - 1].z) / (lane[i].z - lane[i - 1].z), x = lane[i - 1].x + (lane[i].x - lane[i - 1].x) * u;
      for (const dx of [-1.2, 0, 1.2]) if (pathDistance(x + dx, z, m.stream.path) < m.stream.half) assert.ok(onBridge(m, x + dx, z), `bridge under the lane at ${x + dx},${z}`);
    }
    for (const b of m.ice) assert.ok(laneDistance(b.x, b.z) < 0.5 && onIce(m, b.x, b.z));
  }
});

test('zones: the hero wades the stream slowly but crosses a bridge at full speed; ice is fast and slippery; treasure pays more', async () => {
  const { FOREST, SNOW, ZONE, inWater, onIce } = await import('./maps.ts');
  const { CRATE, ENEMIES } = await import('./data.ts');
  const walk = (x: number) => { const s = createRush(1); s.hero.x = x; s.hero.z = -9.4; steps(s, 12, { move: { x: 0, z: -1 } }); return -9.4 - s.hero.z; };
  assert.ok(inWater(FOREST, 6, -10) && !inWater(FOREST, 0, -10));
  const bridge = walk(0), wading = walk(6);
  assert.ok(Math.abs(bridge - HERO.speed * 0.2) < 1e-6, `bridge: full speed (${bridge.toFixed(2)} m in 0.2 s)`);
  assert.ok(Math.abs(wading - bridge * ZONE.streamSpeed) < 1e-6, `wading is slower (${wading.toFixed(2)} m)`);
  // Enemies keep their pace in the stream (the guard bot's forest battles are exactly the pre-region ones).
  const f = createRush(1), wet = enemy(f, 'grunt', 6, -10), dry = enemy(f, 'grunt', 6, -6);
  f.hero.x = 14; f.hero.z = 12; wet.wp = dry.wp = 3;
  const wet0 = { ...wet }, dry0 = { ...dry };
  steps(f, 10);
  assert.ok(Math.abs(Math.hypot(wet.x - wet0.x, wet.z - wet0.z) - Math.hypot(dry.x - dry0.x, dry.z - dry0.z)) < 1e-6);
  // Ice: ×ZONE.iceSpeed for an enemy on the sheet.
  const s = createRush(1, NO_MODS, { enemyHp: 1, enemyCount: 1, enemyDamage: 1, stage: 6 });
  const ice = SNOW.ice[0];
  assert.ok(onIce(SNOW, ice.x, ice.z));
  const onSheet = enemy(s, 'grunt', ice.x, ice.z - 1), off = enemy(s, 'grunt', ice.x, ice.z + ice.d / 2 + 3);
  s.hero.x = 14; s.hero.z = 12; onSheet.wp = off.wp = 3;
  const a0 = onSheet.z, b0 = off.z;
  steps(s, 30);
  assert.ok(Math.abs((onSheet.z - a0) / (off.z - b0) - ZONE.iceSpeed) < 1e-6, 'an enemy on ice marches at the ice factor');
  assert.ok(Math.abs(off.z - b0 - ENEMIES.grunt.speed * 0.5) < 1e-6);
  // The hero runs faster on the sheet, and a knocked-back enemy slides further on it than on snow.
  const run = (z: number) => { const r = createRush(1, NO_MODS, { enemyHp: 1, enemyCount: 1, enemyDamage: 1, stage: 6 }); r.hero.x = ice.x; r.hero.z = z; steps(r, 12, { move: { x: 0, z: -1 } }); return z - r.hero.z; };
  assert.ok(Math.abs(run(ice.z + 1) / run(ice.z + ice.d / 2 + 4) - ZONE.iceHero) < 1e-6, 'the hero is faster on ice');
  const slide = (z: number) => { const r = createRush(1, NO_MODS, { enemyHp: 1, enemyCount: 1, enemyDamage: 1, stage: 6 }); const e = enemy(r, 'brute', ice.x, z); r.hero.x = 14; r.hero.z = 12; e.wp = 3; e.kx = 6; const x0 = e.x; steps(r, 20); return e.x - x0; };
  assert.ok(slide(ice.z) > slide(ice.z + ice.d / 2 + 4) * 1.3, 'knockback carries further on ice');
  // Treasure crates drop their own gold.
  const chest = s.crates.find(c => c.gold)!;
  assert.equal(chest.gold, ZONE.cacheGold);
  assert.ok(ZONE.cacheGold > CRATE.gold * 3);
  s.hero.x = chest.x; s.hero.z = chest.z + 4;
  let volleys = 0;
  while (s.crates.includes(chest) && volleys++ < 20) steps(s, Math.ceil(HERO.reload / STEP) + 1, { fire: { x: 0, z: -1 } });
  assert.ok(!s.crates.includes(chest) && (s.coins.some(k => k.value === ZONE.cacheGold) || s.stats.goldEarned >= ZONE.cacheGold), 'the chest dropped the cache gold');
});

test('map size and density stay where they were measured (docs/rush/map-metrics.md)', async () => {
  const { FOREST, SNOW, mapStats, laneTime, laneLength } = await import('./maps.ts');
  const { ENEMIES } = await import('./data.ts');
  for (const m of (await import('./maps.ts')).STAGE_MAPS) {
    const near2 = mapStats(m, 2), near3 = mapStats(m, 3);
    // Before the regions: 65.7% of the field within 2 m of a feature (north half 68.3%), 19 features.
    assert.ok(near2.used >= 0.74 && near2.north >= 0.85, `${m.id}: used ${near2.used.toFixed(3)}, north ${near2.north.toFixed(3)}`);
    assert.ok(near3.used >= 0.86 && near3.north >= 0.95, `${m.id}: within 3 m ${near3.used.toFixed(3)}, north ${near3.north.toFixed(3)}`);
    assert.ok(near2.features >= 25, `${m.id}: ${near2.features} features`);
    // Waves must not arrive much sooner: a grunt took 13.0 s down the centre lane and 13.7 s down a side lane.
    const centre = laneTime(m, 0, ENEMIES.grunt.speed), side = laneTime(m, 1, ENEMIES.grunt.speed);
    assert.ok(centre <= 13.0 + 1e-6 && centre >= 12.3 && side <= 13.7 + 1e-6 && side >= 13.0, `${m.id}: grunt arrival ${centre.toFixed(2)} / ${side.toFixed(2)} s`);
    assert.ok(Math.abs(laneTime(m, 1, 2.5) - laneTime(m, 2, 2.5)) < 1e-9);
  }
  assert.ok(Math.abs(laneLength(0) - 32.4) < 0.01 && Math.abs(laneLength(1) - 34.2) < 0.05);
  // The snow field is a different shape: its outcrops close about 9% of the arena, the forest's walls about 2%.
  assert.ok(mapStats(SNOW).blocked > 100 && mapStats(FOREST).blocked < 30);
});

test('frost wolves: snow stages 7-9 only, swapped in for a few grunts, fast, and they crouch before they lunge', async () => {
  const { ENEMIES, WAVES } = await import('./data.ts');
  const { stageDifficulty } = await import('./stages.ts');
  const { groupCount } = await import('./sim.ts');
  const { regionOf } = await import('./expedition.ts');
  const packs = WAVES.flat().filter(g => g.kind === 'wolf');
  assert.ok(packs.length >= 2 && packs.every(g => g.count <= 4), 'a few small packs');
  const grunts = WAVES.flat().filter(g => g.kind === 'grunt');
  const total = (stage: number, groups: typeof packs, plain = false) => groups.reduce((sum, g) => sum + groupCount(createRush(1, undefined, { ...stageDifficulty(stage), ...(stage > 10 ? { stage } : {}) }), plain ? { ...g, less: undefined } : g), 0);
  for (let stage = 1; stage <= 11; stage++) {
    const n = total(stage, packs), swapped = total(stage, grunts, true) - total(stage, grunts);
    if (stage < 7 || stage > 9) { assert.equal(n, 0, `no wolves on stage ${stage}`); assert.equal(swapped, 0, `every grunt on stage ${stage}`); }
    else { assert.ok(n > 0 && swapped > 0, `wolves for grunts on stage ${stage}: ${n} for ${swapped}`); assert.equal(regionOf(stage), 'snow'); }
  }
  const wolf = ENEMIES.wolf, lunge = wolf.lunge!;
  assert.ok(wolf.speed >= ENEMIES.grunt.speed * 1.5 && wolf.hp < ENEMIES.grunt.hp && wolf.gold > 0);
  // A wolf north of the hero, inside its aggro and lunge range: it warns, stands still for the wind-up, then covers ground faster than it runs.
  const s = createRush(1);
  Object.assign(s.hero, { x: 0, z: 0 });
  const e = enemy(s, 'wolf', 0, -2.4);
  let warnedAt = -1, sprangAt = -1, from = { x: 0, z: 0 };
  for (let i = 0; i < 240 && sprangAt < 0; i++) {
    stepRush(s, {});
    if (warnedAt < 0 && s.events.some(v => v.type === 'lunge')) { warnedAt = i; from = { x: e.x, z: e.z }; }
    if (s.events.some(v => v.type === 'pounce')) sprangAt = i;
  }
  assert.ok(warnedAt >= 0 && sprangAt > warnedAt, 'warned, then sprang');
  assert.ok(Math.abs((sprangAt - warnedAt) / 60 - lunge.windup) < 0.05, `wind-up ${(sprangAt - warnedAt) / 60}s`);
  assert.ok(Math.hypot(e.x - from.x, e.z - from.z) < 1e-9, 'it does not move while crouched');
  const z0 = e.z;
  for (let i = 0; i < 6; i++) stepRush(s, {});
  assert.ok((e.z - z0) / (6 / 60) > wolf.speed * 1.5, `dash pace ${(e.z - z0) / 0.1}`);
  // It lands a bite and cannot lunge again straight away.
  const hp = s.hero.hp;
  e.cd = 0;
  for (let i = 0; i < 60; i++) stepRush(s, {});
  assert.ok(s.hero.hp < hp, 'the bite lands');
  assert.ok((e.lungeCd ?? 0) > 0);
});

// ---------- barricades (defence lane, 2026-11-13) ----------
test('barricade sites: each sits on its lane, clear of pads, cover, crates, the town and each other', async () => {
  const { BARRICADE, BARRICADES, HOME_PADS, LANES, PAD_REACH, TOWN, ARENA } = await import('./data.ts');
  // Every battlefield layout (maps.ts): the sites are the same on all of them, the cover and crates are not.
  const { FOREST, SNOW } = await import('./maps.ts');
  const onSegment = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
    const ax = b.x - a.x, az = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * ax + (p.z - a.z) * az) / (ax * ax + az * az)));
    return Math.hypot(a.x + ax * t - p.x, a.z + az * t - p.z);
  };
  const near = (p: { x: number; z: number }, b: { x: number; z: number; w: number; d: number }, pad: number) => Math.abs(p.x - b.x) <= b.w / 2 + pad && Math.abs(p.z - b.z) <= b.d / 2 + pad;
  assert.equal(new Set(BARRICADES.map(b => b.lane)).size, BARRICADES.length, 'one site per lane');
  for (const [i, b] of BARRICADES.entries()) {
    const lane = LANES[b.lane];
    assert.ok(Math.min(...lane.slice(1).map((p, k) => onSegment(b, lane[k], p))) < 0.05, `site ${i} lies on lane ${b.lane}`);
    for (const p of PADS) assert.ok(Math.hypot(p.x - b.x, p.z - b.z) >= 2 * PAD_REACH, `site ${i} reach does not overlap a pad`);
    const half = BARRICADE.length / 2; // the box turned any way still fits in this circle
    for (const map of [FOREST, SNOW]) {
      for (const w of [...map.walls, ...map.bushes]) assert.ok(!near(b, w, half), `site ${i} clear of walls and tall grass (${map.id})`);
      for (const c of map.crates) assert.ok(Math.hypot(c.x - b.x, c.z - b.z) > half + 1, `site ${i} clear of crates (${map.id})`);
    }
    assert.ok(Math.hypot(TOWN.x - b.x, TOWN.z - b.z) > Math.max(...PADS.slice(0, HOME_PADS).map(p => Math.hypot(TOWN.x - p.x, TOWN.z - p.z))), `site ${i} further out than every home pad`);
    assert.ok(b.x - half > ARENA.minX && b.x + half < ARENA.maxX);
    for (const o of BARRICADES) if (o !== b) assert.ok(Math.hypot(o.x - b.x, o.z - b.z) >= 2 * PAD_REACH);
  }
});

test('barricades are built, spiked and repaired from the build button, priced by the health missing', async () => {
  const { BARRICADE, BARRICADES, BARRICADE_LEVELS } = await import('./data.ts');
  const { barricadeOrder } = await import('./sim.ts');
  const s = createRush(1);
  const site = BARRICADES[0];
  s.hero.x = site.x; s.hero.z = site.z + 1.2;
  steps(s, 1, { build: true });
  assert.deepEqual(s.barricades[0], { level: 0, hp: BARRICADE_LEVELS[0].hp });
  assert.equal(s.gold, ECONOMY.startGold - BARRICADE_LEVELS[0].cost);
  assert.ok(s.events.some(e => e.type === 'barricade' && e.slot === 0 && e.level === 0 && !e.repair));
  assert.equal(s.towers.filter(Boolean).length, 0, 'no tower bought');
  s.gold = 1000;
  steps(s, 1, { build: 'frost' }); // any build press; the branch means nothing here
  assert.deepEqual(s.barricades[0], { level: 1, hp: BARRICADE_LEVELS[1].hp });
  assert.equal(barricadeOrder(s, 0), null, 'spiked and unhurt: nothing to do');
  s.barricades[0]!.hp = BARRICADE_LEVELS[1].hp / 2;
  const half = Math.round(BARRICADE_LEVELS[1].cost * BARRICADE.repair * 0.5);
  assert.deepEqual(barricadeOrder(s, 0), { action: 'repair', cost: half });
  steps(s, 1, { build: true });
  assert.equal(s.barricades[0]!.hp, BARRICADE_LEVELS[1].hp);
  assert.equal(s.gold, 1000 - BARRICADE_LEVELS[1].cost - half);
  s.barricades[0]!.hp = 0;
  assert.deepEqual(barricadeOrder(s, 0), { action: 'repair', cost: Math.round(BARRICADE_LEVELS[1].cost * BARRICADE.repair) }, 'rubble is rebuilt at its level');
  // A hurt Lv1: spikes when affordable (back to full health too), else the cheaper repair.
  s.barricades[1] = { level: 0, hp: 60 };
  assert.equal(barricadeOrder(s, 1)?.action, 'upgrade');
  s.gold = BARRICADE_LEVELS[1].cost - 1;
  assert.equal(barricadeOrder(s, 1)?.action, 'repair');
});

test('enemies on a lane stop at its barricade and break it before the town; other lanes walk on', async () => {
  const { BARRICADES, BARRICADE_LEVELS, LANES } = await import('./data.ts');
  const s = createRush(1);
  s.prepT = 999;
  s.hero.downT = 999; // out of the way
  s.barricades[0] = { level: 0, hp: BARRICADE_LEVELS[0].hp };
  const start = LANES[0][2];
  const pack = [0, 1, 2].map(i => { const e = enemy(s, 'grunt', start.x + (i - 1) * 0.5, start.z); e.wp = 3; e.cd = 0; e.hp = e.maxHp = 9999; return e; });
  const side = enemy(s, 'grunt', LANES[1][2].x, LANES[1][2].z); side.lane = 1; side.wp = 3; side.cd = 0; side.hp = side.maxHp = 9999;
  let hits = 0, broke = false;
  for (let i = 0; i < 60 * 60 && !broke; i++) {
    stepRush(s, {});
    for (const e of s.events) { if (e.type === 'barricadeHit') hits++; if (e.type === 'barricadeBreak') broke = true; }
    if (!broke) assert.ok(pack.every(e => e.z < BARRICADES[0].z), 'the pack stays in front of it');
  }
  assert.ok(hits > 0 && broke, `the pack wore it down (${hits} hits)`);
  assert.ok(s.town.hp < s.town.maxHp, 'the side-lane grunt reached the town meanwhile');
  steps(s, 60 * 10);
  assert.ok(pack.some(e => e.z > BARRICADES[0].z + 1), 'after the break they walk on');
  assert.equal(s.barricades[0]!.hp, 0, 'rubble stays until rebuilt');
});

test('a held melee enemy cannot reach a hero behind the barricade; spikes bite back; a shooter shoots the barricade', async () => {
  const { BARRICADES, BARRICADE_LEVELS, BARRICADE } = await import('./data.ts');
  const s = createRush(1);
  s.prepT = 999;
  const b = BARRICADES[0];
  s.barricades[0] = { level: 1, hp: BARRICADE_LEVELS[1].hp };
  s.hero.x = b.x; s.hero.z = b.z + BARRICADE.depth / 2 + 0.6; // right behind it, within the grunt's aggro range
  const grunt = enemy(s, 'grunt', b.x + 0.2, b.z - BARRICADE.depth / 2 - 0.5); grunt.wp = 3; grunt.cd = 0;
  const heroHp = s.hero.hp;
  steps(s, 120);
  assert.equal(s.hero.hp, heroHp, 'the grunt never reached the hero');
  assert.ok(grunt.z < b.z, 'it stays on its side');
  assert.ok(s.barricades[0]!.hp < BARRICADE_LEVELS[1].hp, 'it hit the barricade instead');
  assert.ok(grunt.hp < grunt.maxHp, `spikes hurt the grunt (${grunt.hp}/${grunt.maxHp})`);
  // With the hero out of its reach, a shooter shoots the barricade; spikes do not reach it.
  const t = createRush(1);
  t.prepT = 999;
  t.barricades[0] = { level: 1, hp: BARRICADE_LEVELS[1].hp };
  t.hero.x = 6; t.hero.z = 8;
  const archer = enemy(t, 'skirmisher', b.x, b.z - 6.5); archer.wp = 3; archer.cd = 0;
  let aimed = false;
  for (let i = 0; i < 240; i++) { stepRush(t, {}); if (t.shots.some(sh => sh.owner === 'enemy' && sh.wall === 0)) aimed = true; }
  assert.ok(aimed && t.barricades[0]!.hp < BARRICADE_LEVELS[1].hp, 'the archer shot the barricade');
  assert.equal(archer.hp, archer.maxHp, 'no spikes for a shooter');
});

test('a standing barricade blocks the hero; its rubble does not', async () => {
  const { BARRICADES, BARRICADE } = await import('./data.ts');
  const s = createRush(1);
  const b = BARRICADES[0];
  s.barricades[0] = { level: 0, hp: 100 };
  s.hero.x = b.x; s.hero.z = b.z + 3;
  steps(s, 90, { move: { x: 0, z: -1 } });
  assert.ok(s.hero.z >= b.z + BARRICADE.depth / 2 + HERO.radius - 1e-6, `stopped at it (z ${s.hero.z.toFixed(2)})`);
  s.barricades[0]!.hp = 0;
  steps(s, 90, { move: { x: 0, z: -1 } });
  assert.ok(s.hero.z < b.z - 1, 'walks over the rubble');
});


test("frost lord's howl: on the last stage the boss's roar freezes the hero in ice for a while; towers and barricades stand", async () => {
  const { stageDifficulty } = await import('./stages.ts');
  const { FROST_HOWL } = await import('./data.ts');
  const call = ENEMIES.boss.summon!, roarTicks = Math.round(call.roar / STEP);
  const setup = (stage: number) => {
    const s = createRush(1, NO_MODS, stageDifficulty(stage));
    Object.assign(s.hero, { x: 9, z: 9 });
    const b = enemy(s, 'boss', 0, -8);
    b.hp = Math.floor(b.maxHp * call.at);
    s.barricades[0] = { level: 0, hp: 180 };
    s.towers[0] = { level: 0, cd: 0, facing: 0 };
    return s;
  };
  const run = (s: RushState, n: number, cmd = {}) => { const seen: string[] = []; for (let i = 0; i < n; i++) { stepRush(s, cmd); seen.push(...s.events.map(e => e.type)); } return seen; };
  assert.ok(FROST_HOWL.heroFreeze > 0 && FROST_HOWL.barricade === 0 && FROST_HOWL.towerFreeze === 0);
  const last = setup(FROST_HOWL.stage), seen = run(last, roarTicks + 2);
  assert.ok(seen.includes('howl') && seen.includes('summon'), 'the howl comes with the summon');
  assert.ok((last.hero.frozenT ?? 0) > FROST_HOWL.heroFreeze - 0.1, 'the hero is frozen');
  assert.equal(last.barricades[0]!.hp, 180, 'the barricade stands');
  assert.ok(!last.towers[0]!.frozen, 'the tower keeps firing');
  // Frozen: commands do nothing (no moving, no shooting).
  const at = { x: last.hero.x, z: last.hero.z }, shots = last.stats.shots;
  run(last, 30, { move: { x: 1, z: 0 }, fire: 'auto' });
  assert.deepEqual({ x: last.hero.x, z: last.hero.z }, at, 'cannot move while frozen');
  assert.equal(last.stats.shots, shots, 'cannot shoot while frozen');
  // It thaws on time and moves again.
  run(last, Math.round(FROST_HOWL.heroFreeze / STEP));
  assert.ok(!last.hero.frozenT, 'thawed');
  run(last, 10, { move: { x: -1, z: 0 } });
  assert.ok(last.hero.x < at.x, 'moves again');
  // Stage 9's boss only calls its minions.
  const ninth = setup(FROST_HOWL.stage - 1), seen9 = run(ninth, roarTicks + 2);
  assert.ok(seen9.includes('summon') && !seen9.includes('howl') && !ninth.hero.frozenT);
});

test('outposts: six pads but only TOWER_CAP towers; an empty pad offers nothing once they all stand; the bot keeps home', async () => {
  const { HOME_PADS, TOWER_CAP, LANES } = await import('./data.ts');
  const { padCost, towersFull } = await import('./sim.ts');
  const { guardBot } = await import('./bot.ts');
  assert.ok(PADS.length > TOWER_CAP && HOME_PADS === TOWER_CAP);
  // Each outpost stands beside one side lane, within a Lv1 tower's range of it and out of range of the other lanes.
  const laneGap = (p: { x: number; z: number }, lane: readonly { x: number; z: number }[]) => Math.min(...lane.slice(1).map((b, k) => {
    const a = lane[k], ax = b.x - a.x, az = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * ax + (p.z - a.z) * az) / (ax * ax + az * az)));
    return Math.hypot(a.x + ax * t - p.x, a.z + az * t - p.z);
  }));
  for (const p of PADS.slice(HOME_PADS)) {
    const gaps = LANES.map(l => laneGap(p, l)).sort((a, b) => a - b);
    assert.ok(gaps[0] > 1.5 && gaps[0] < TOWER_LEVELS[0].range, `outpost near its lane (${gaps[0].toFixed(1)} m)`);
    assert.ok(gaps[1] > TOWER_LEVELS[TOWER_LEVELS.length - 1].range, `and out of range of the next lane (${gaps[1].toFixed(1)} m)`);
  }
  const s = createRush(1);
  s.gold = 9999;
  for (let i = 0; i < TOWER_CAP - 1; i++) s.towers[i] = { level: 0, cd: 0, facing: 0 };
  assert.ok(!towersFull(s) && padCost(s, PADS.length - 1) !== null, 'room for one more: an outpost can be built');
  Object.assign(s.hero, { x: PADS[PADS.length - 1].x, z: PADS[PADS.length - 1].z });
  stepRush(s, { build: true });
  assert.ok(s.towers[PADS.length - 1], 'built at the outpost');
  assert.ok(towersFull(s) && padCost(s, TOWER_CAP - 1) === null, 'the last home pad now offers nothing');
  assert.ok(padCost(s, 0) !== null, 'standing towers still upgrade');
  // The guard bot never builds on an outpost.
  const b = createRush(3);
  for (let i = 0; i < 60 * 60 * 3 && b.phase !== 'won' && b.phase !== 'lost'; i++) stepRush(b, guardBot(b));
  assert.ok(b.towers.slice(HOME_PADS).every(t => !t));
});

test('demolish: a tower comes down for 60% of what it cost and frees a place under the cap', async () => {
  const { TOWER_CAP, TOWER_REFUND } = await import('./data.ts');
  const { padCost, towerRefund, towersFull } = await import('./sim.ts');
  const s = createRush(1);
  s.gold = 0;
  for (let i = 0; i < TOWER_CAP; i++) s.towers[i] = { level: 0, cd: 0, facing: 0 };
  s.towers[0] = { level: 2, cd: 0, facing: 0, branch: 'fire' };
  const spent = TOWER_LEVELS.reduce((a, l) => a + l.cost, 0);
  assert.equal(towerRefund(s, 0), Math.round(spent * TOWER_REFUND));
  assert.equal(towerRefund(s, PADS.length - 1), null, 'no tower, nothing to take down');
  assert.ok(towersFull(s) && padCost(s, PADS.length - 1) === null);
  Object.assign(s.hero, { x: PADS[0].x, z: PADS[0].z });
  stepRush(s, { demolish: true });
  assert.equal(s.towers[0], null);
  assert.equal(s.gold, Math.round(spent * TOWER_REFUND));
  assert.ok(s.events.some(e => e.type === 'demolish' && e.pad === 0));
  assert.ok(!towersFull(s) && padCost(s, PADS.length - 1) !== null, 'the outpost can be built now');
  // Away from any tower the command does nothing.
  Object.assign(s.hero, { x: 0, z: -10 });
  const gold = s.gold;
  stepRush(s, { demolish: true });
  assert.equal(s.gold, gold);
});
