import test from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY, ENEMIES, HERO, HERO_SPAWN, PADS, STEP, TOWER_LEVELS, type EnemyKind } from './data.ts';
import { createRush, NO_MODS, padCost, rushHash, stepRush, superReady, type Command, type Enemy, type RushEvent, type RushState } from './sim.ts';
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

test('tall grass hides the hero from enemies beyond 1.8 m; attacking reveals for a second', async () => {
  const { BUSHES, BUSH } = await import('./data.ts');
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
  const { CRATES, CRATE } = await import('./data.ts');
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
  const s = createRush(1, NO_MODS, { enemyHp: 2, enemyCount: 1, enemyDamage: 1, stage: 8 });
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
