// Deterministic fixed-step simulation for the Arcana Rush prototype.
// Pure TypeScript: no DOM, no clock, no Math.random. The same seed and command stream give the same state,
// so this module can run in tests, in the browser and later on an authoritative server.
import {
  ARENA, BUSH, BUSHES, CRATE, CRATES, ECONOMY, ENEMIES, HEROES, HERO_SPAWN, LANES, PADS, PAD_REACH, STEP, TOWER_LEVELS, TOWER_SHOT_SPEED, TOWN, WALLS, WAVES,
  type Block, heroStats, type EnemyDef, type EnemyKind, type HeroDef, type HeroKind, type Vec, TOWER_BRANCH, type TowerBranch, FORGE } from './data.ts';

export type Phase = 'prep' | 'wave' | 'won' | 'lost';

export interface Hero {
  kind: HeroKind;
  x: number; z: number; hp: number; facing: number;
  ammo: number; reloadT: number; fireCd: number;
  superCharge: number; downT: number; calmT: number;
  /** Game time until which the hero stays visible even inside a bush (attacking reveals). */
  exposedUntil: number;
}
export interface Enemy {
  id: number; kind: EnemyKind; x: number; z: number; kx: number; kz: number;
  hp: number; maxHp: number; lane: number; wp: number; cd: number; flash: number; chasing: boolean; facing: number;
  windup: { x: number; z: number; t: number } | null;
  /** Seconds of frost slow left (cycle 15). */
  slowT?: number;
  /** Boss rally (cycle 33): seconds of roar left, and whether it has already called its minions. */
  roarT?: number; rallied?: boolean;
  /** Shaman (cycle 59): seconds until its next heal pulse (starts at a full period). */
  healT?: number;
}
export type ShotOwner = 'hero' | 'super' | 'tower' | 'enemy' | 'lob';
export interface Shot {
  id: number; owner: ShotOwner; x: number; z: number; vx: number; vz: number;
  damage: number; life: number; radius: number; target: number; tx: number; tz: number;
  branch?: TowerBranch;
}
/** branch is chosen when Lv1 becomes Lv2 and kept at Lv3. */
export interface Tower { level: number; cd: number; facing: number; branch?: TowerBranch }
export interface Coin { id: number; x: number; z: number; value: number; life: number }
export interface Crate { id: number; x: number; z: number; hp: number }
export interface GroupProgress { spawned: number; timer: number }

export type RushEvent =
  | { type: 'fire'; x: number; z: number; angle: number }
  | { type: 'swing'; x: number; z: number; angle: number; range: number; arc: number; hits: number }
  | { type: 'hit'; x: number; z: number; owner: ShotOwner; damage: number; id?: number }
  | { type: 'kill'; x: number; z: number; kind: EnemyKind }
  | { type: 'spark'; x: number; z: number }
  | { type: 'crateHit'; id: number; x: number; z: number }
  | { type: 'crateBreak'; id: number; x: number; z: number }
  | { type: 'burst'; x: number; z: number; radius: number }
  | { type: 'superReady' }
  | { type: 'heroHit'; damage: number }
  | { type: 'heroDown' }
  | { type: 'heroBack' }
  | { type: 'townHit'; damage: number }
  | { type: 'telegraph'; x: number; z: number; radius: number; time: number }
  | { type: 'slam'; x: number; z: number; radius: number }
  | { type: 'roar'; x: number; z: number; radius: number; time: number }
  /** A shaman's pulse that restored at least one ally (cycle 59). */
  | { type: 'heal'; x: number; z: number; radius: number; count: number }
  | { type: 'summon'; x: number; z: number; count: number }
  | { type: 'coin'; value: number }
  | { type: 'build'; pad: number; level: number; branch?: TowerBranch }
  | { type: 'splash'; x: number; z: number; radius: number }
  | { type: 'chill'; x: number; z: number }
  | { type: 'snow'; x: number; z: number; radius: number }
  | { type: 'block'; x: number; z: number }
  | { type: 'waveStart'; wave: number }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'lap'; lap: number; twist?: LapTwist }
  | { type: 'won' }
  | { type: 'lost' };

/** Battle modifiers from permanent (between-battle) upgrades. All 1 = the base game. */
/** Battle modifiers from the kingdom. heroHp scales the hero's max health (hero level, cycle 14). */
export interface RushMods {
  damage: number; towerCost: number; townHp: number; heroHp: number; forge: number;
  /** Extra gold at the start of the battle (cycle 38, kingdom vault). */
  startGold?: number;
  /** Talent level of the hero taken into battle (cycle 45). */
  talent?: number;
}
export const NO_MODS: RushMods = { damage: 1, towerCost: 1, townHp: 1, heroHp: 1, forge: 0 };
/** Stage difficulty: multipliers on enemy health, group sizes (bosses excluded) and damage. All 1 = the base game. */
/** stage: groups with a minStage above it do not appear (absent = stage 1). */
export interface Difficulty {
  enemyHp: number; enemyCount: number; enemyDamage: number; stage?: number;
  /** Endless challenge (cycle 46): the five waves repeat with no victory, harder every lap. */
  endless?: boolean;
  /** Endless lap twist (cycle 52), for that lap only. */
  twist?: LapTwist;
}
/** Endless lap twists (cycle 52): from lap 2, one per lap in this order, then round again. */
export type LapTwist = 'swift' | 'shields' | 'twin';
export const LAP_TWISTS: readonly LapTwist[] = ['swift', 'shields', 'twin'];
export const TWIST = { swiftSpeed: 1.2, shieldCount: 2, twinBosses: 2 } as const;
export const twistForLap = (lap: number): LapTwist | undefined => (lap >= 2 ? LAP_TWISTS[(lap - 2) % LAP_TWISTS.length] : undefined);
/** Endless: each completed lap of five waves multiplies enemy health, numbers and damage by these. */
export const ENDLESS_LAP = { enemyHp: 1.35, enemyCount: 1.2, enemyDamage: 1.15 } as const;
/** The wave plan for the current wave (endless runs reuse the five in a loop). */
const waveDef = (s: RushState) => WAVES[s.wave % WAVE_COUNT];
export const BASE_DIFFICULTY: Difficulty = { enemyHp: 1, enemyCount: 1, enemyDamage: 1 };

export interface RushState {
  seed: number; rng: number; tick: number; t: number; phase: Phase; mods: RushMods; diff: Difficulty;
  /** Index of the current wave while fighting, or of the next wave while preparing. */
  wave: number; prepT: number; groups: GroupProgress[];
  town: { hp: number; maxHp: number }; gold: number;
  hero: Hero; enemies: Enemy[]; shots: Shot[]; towers: (Tower | null)[]; coins: Coin[]; crates: Crate[];
  nextId: number;
  stats: { kills: number; shots: number; hits: number; supers: number; goldEarned: number; heroDowns: number };
  events: RushEvent[];
}

/** One tick of player intent. Vectors are directions (fire) or world offsets from the hero (super). */
export interface Command {
  move?: Vec;
  fire?: Vec | 'auto';
  super?: Vec | 'auto';
  /** true builds or upgrades; a branch name also picks fire or frost when Lv1 becomes Lv2 (true → fire). */
  build?: boolean | TowerBranch;
  startWave?: boolean;
}

export const WAVE_COUNT = WAVES.length;

// ---------- random & math ----------
function rand(s: RushState): number {
  // mulberry32
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const len = (x: number, z: number) => Math.hypot(x, z);
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Push a circle out of a block; returns true when they overlapped. */
function pushOut(p: Vec, r: number, b: Block): boolean {
  const hx = b.w / 2, hz = b.d / 2;
  const cx = clamp(p.x, b.x - hx, b.x + hx), cz = clamp(p.z, b.z - hz, b.z + hz);
  const dx = p.x - cx, dz = p.z - cz, d = len(dx, dz);
  if (d >= r) return false;
  if (d > 1e-9) { p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; return true; }
  // Centre inside the block: leave by the nearest face.
  const exits = [b.x + hx - p.x, p.x - (b.x - hx), b.z + hz - p.z, p.z - (b.z - hz)];
  const i = exits.indexOf(Math.min(...exits));
  if (i === 0) p.x = b.x + hx + r; else if (i === 1) p.x = b.x - hx - r;
  else if (i === 2) p.z = b.z + hz + r; else p.z = b.z - hz - r;
  return true;
}
function insideBlock(x: number, z: number, pad: number): boolean {
  return WALLS.some(b => Math.abs(x - b.x) <= b.w / 2 + pad && Math.abs(z - b.z) <= b.d / 2 + pad);
}
const crateBlock = (c: Crate): Block => ({ x: c.x, z: c.z, w: CRATE.size, d: CRATE.size });
const inCrate = (s: RushState, x: number, z: number) =>
  s.crates.find(c => Math.abs(x - c.x) <= CRATE.size / 2 && Math.abs(z - c.z) <= CRATE.size / 2) ?? null;
function confine(p: Vec, r: number, s?: RushState): void {
  for (const b of WALLS) pushOut(p, r, b);
  if (s) for (const c of s.crates) pushOut(p, r, crateBlock(c));
  const tr = TOWN.radius + r, dx = p.x - TOWN.x, dz = p.z - TOWN.z, d = len(dx, dz);
  if (d < tr) {
    if (d > 1e-9) { p.x = TOWN.x + (dx / d) * tr; p.z = TOWN.z + (dz / d) * tr; } else p.z = TOWN.z - tr;
  }
  p.x = clamp(p.x, ARENA.minX + r, ARENA.maxX - r);
  p.z = clamp(p.z, ARENA.minZ + r, ARENA.maxZ - r);
}

// ---------- creation ----------
export function createRush(seed = 1, mods: RushMods = NO_MODS, diff: Difficulty = BASE_DIFFICULTY, heroKind: HeroKind = 'ranger'): RushState {
  const townHp = Math.round(TOWN.hp * mods.townHp);
  return {
    seed, rng: seed | 0, tick: 0, t: 0, phase: 'prep', mods: { ...mods }, diff: { ...diff }, wave: 0, prepT: ECONOMY.prepTime, groups: [],
    town: { hp: townHp, maxHp: townHp }, gold: ECONOMY.startGold + (mods.startGold ?? 0),
    hero: { kind: heroKind, x: HERO_SPAWN.x, z: HERO_SPAWN.z, hp: Math.round(HEROES[heroKind].hp * mods.heroHp), facing: -Math.PI / 2, ammo: HEROES[heroKind].ammoMax, reloadT: 0, fireCd: 0, superCharge: 0, downT: 0, calmT: 0, exposedUntil: 0 },
    enemies: [], shots: [], towers: PADS.map(() => null), coins: [], nextId: 1 + CRATES.length,
    crates: CRATES.map((c, i) => ({ id: 1 + i, x: c.x, z: c.z, hp: CRATE.hp })),
    stats: { kills: 0, shots: 0, hits: 0, supers: 0, goldEarned: 0, heroDowns: 0 },
    events: [],
  };
}

// ---------- queries used by the UI and bots ----------
/** The current hero's numbers. */
export const heroDef = (s: RushState): HeroDef => heroStats(s.hero.kind, s.mods.talent ?? 0);
export const heroAlive = (s: RushState) => s.hero.downT <= 0;
/** The hero's max health with the kingdom's hero-level bonus. */
export const heroMaxHp = (s: RushState) => Math.round(heroDef(s).hp * s.mods.heroHp);
export const superReady = (s: RushState) => s.hero.superCharge >= heroDef(s).superHits;

/** Hero inside tall grass and not recently attacking: only enemies within BUSH.reveal can see them. */
export function heroHidden(s: RushState): boolean {
  const h = s.hero;
  return s.t >= h.exposedUntil && BUSHES.some(b => Math.abs(h.x - b.x) <= b.w / 2 && Math.abs(h.z - b.z) <= b.d / 2);
}
/** Nearest pad within reach of the hero, or -1. */
export function padInReach(s: RushState): number {
  let best = -1, bestD = PAD_REACH;
  PADS.forEach((p, i) => { const d = dist(p, s.hero); if (d <= bestD) { best = i; bestD = d; } });
  return best;
}
/** Cost of building or upgrading the given pad, or null when maxed. */
export function padCost(s: RushState, pad: number): number | null {
  const tower = s.towers[pad];
  const next = tower ? tower.level + 1 : 0;
  return next < TOWER_LEVELS.length ? Math.round(TOWER_LEVELS[next].cost * s.mods.towerCost) : null;
}
export function nearestEnemy(s: RushState, from: Vec, range: number): Enemy | null {
  let best: Enemy | null = null, bestD = range;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(e, from) - ENEMIES[e.kind].radius;
    if (d <= bestD) { best = e; bestD = d; }
  }
  return best;
}
/** Extra distance (m) auto-aim adds to a shield-bearer whose shield faces the shooter (cycle 28). */
export const SHIELD_AIM_PENALTY = 3;
/** True when a bolt from `from` would hit this enemy's shield. */
export function shieldFaces(e: Enemy, from: Vec): boolean {
  const def = ENEMIES[e.kind];
  if (def.shield === undefined) return false;
  let off = Math.atan2(from.z - e.z, from.x - e.x) - e.facing;
  off = Math.atan2(Math.sin(off), Math.cos(off));
  return Math.abs(off) <= (def.shieldArc ?? 1);
}
/** Auto-aim for bolts: nearest enemy in range, but a raised shield counts as SHIELD_AIM_PENALTY further away. */
export function autoTarget(s: RushState, from: Vec, range: number): Enemy | null {
  let best: Enemy | null = null, bestScore = Infinity;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(e, from) - ENEMIES[e.kind].radius;
    if (d > range) continue;
    const score = d + (shieldFaces(e, from) ? SHIELD_AIM_PENALTY : 0);
    if (score < bestScore) { best = e; bestScore = score; }
  }
  return best;
}
/** Point inside super range that catches the most enemies (ties: nearer). */
export function bestSuperPoint(s: RushState): Vec | null {
  let best: Vec | null = null, bestCount = 0, bestD = Infinity;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(e, s.hero);
    if (d > heroDef(s).superRange) continue;
    let count = 0;
    for (const o of s.enemies) if (o.hp > 0 && dist(o, e) <= heroDef(s).superRadius) count++;
    if (count > bestCount || (count === bestCount && d < bestD)) { best = { x: e.x, z: e.z }; bestCount = count; bestD = d; }
  }
  return best;
}

// ---------- step ----------
export function stepRush(s: RushState, cmd: Command = {}): RushState {
  s.events = [];
  if (s.phase === 'won' || s.phase === 'lost') return s;
  s.tick++;
  s.t = s.tick * STEP;

  if (cmd.startWave && s.phase === 'prep') {
    const bonus = Math.floor(s.prepT) * ECONOMY.earlyBonusPerSecond;
    addGold(s, bonus);
    beginWave(s);
  }
  updateHero(s, cmd);
  if (s.phase === 'prep') {
    s.prepT -= STEP;
    if (s.prepT <= 0) beginWave(s);
  }
  if (s.phase === 'wave') spawn(s);
  updateEnemies(s);
  updateTowers(s);
  updateShots(s);
  updateCoins(s);
  reap(s);

  if (s.town.hp <= 0) {
    s.town.hp = 0;
    s.phase = 'lost';
    s.events.push({ type: 'lost' });
  } else if (s.phase === 'wave' && waveSpawned(s) && s.enemies.length === 0) {
    if (s.wave >= WAVE_COUNT - 1 && !s.diff.endless) {
      s.phase = 'won';
      s.events.push({ type: 'won' });
    } else {
      addGold(s, ECONOMY.waveBonus);
      s.events.push({ type: 'waveClear', wave: s.wave, bonus: ECONOMY.waveBonus });
      s.wave++;
      // Endless: a new lap of the five waves starts harder.
      if (s.diff.endless && s.wave % WAVE_COUNT === 0) {
        const d = s.diff;
        const lap = s.wave / WAVE_COUNT + 1, twist = twistForLap(lap);
        s.diff = { ...d, enemyHp: d.enemyHp * ENDLESS_LAP.enemyHp, enemyCount: d.enemyCount * ENDLESS_LAP.enemyCount, enemyDamage: d.enemyDamage * ENDLESS_LAP.enemyDamage, twist };
        s.events.push({ type: 'lap', lap, twist }); // cycle 47: the player must see the step up; cycle 52: and the twist
      }
      s.phase = 'prep';
      s.prepT = ECONOMY.prepTime;
    }
  }
  return s;
}

function addGold(s: RushState, value: number) {
  if (value <= 0) return;
  s.gold += value;
  s.stats.goldEarned += value;
}

function beginWave(s: RushState) {
  s.phase = 'wave';
  s.prepT = 0;
  s.groups = waveDef(s).map(g => ({ spawned: 0, timer: g.delay }));
  s.events.push({ type: 'waveStart', wave: s.wave });
}
function waveSpawned(s: RushState) {
  return waveDef(s).every((g, i) => (s.groups[i]?.spawned ?? 0) >= groupCount(s, g));
}
/** Enemies in a spawn group after stage scaling. The boss stays a single boss. */
export const groupCount = (s: RushState, g: { kind: EnemyKind; count: number; minStage?: number }) => {
  if ((g.minStage ?? 1) > (s.diff.stage ?? 1)) return 0;
  const t = s.diff.twist;
  if (g.kind === 'boss') return g.count * (t === 'twin' ? TWIST.twinBosses : 1);
  return Math.max(1, Math.round(g.count * s.diff.enemyCount * (t === 'shields' && g.kind === 'shield' ? TWIST.shieldCount : 1)));
};
function spawn(s: RushState) {
  waveDef(s).forEach((g, i) => {
    const p = s.groups[i];
    const total = groupCount(s, g);
    if (!p || p.spawned >= total) return;
    p.timer -= STEP;
    while (p.timer <= 0 && p.spawned < total) {
      const start = LANES[g.lane][0], def = ENEMIES[g.kind];
      s.enemies.push({
        id: s.nextId++, kind: g.kind, x: start.x + (rand(s) - 0.5) * 1.6, z: start.z + (rand(s) - 0.5) * 0.8, kx: 0, kz: 0,
        hp: Math.round(def.hp * s.diff.enemyHp), maxHp: Math.round(def.hp * s.diff.enemyHp), lane: g.lane, wp: 1, cd: def.cooldown * 0.5, flash: 0, chasing: false, facing: Math.PI / 2, windup: null,
      });
      p.spawned++;
      // Single-spawn groups (interval 0) can grow with stage scaling: space the extras instead of never spawning them.
      p.timer += g.interval > 0 ? g.interval : 1.5;
    }
  });
}

// ---------- hero ----------
function updateHero(s: RushState, cmd: Command) {
  const h = s.hero;
  if (h.downT > 0) {
    h.downT -= STEP;
    if (h.downT <= 0) {
      h.downT = 0; h.hp = heroMaxHp(s); h.x = HERO_SPAWN.x; h.z = HERO_SPAWN.z; h.ammo = heroDef(s).ammoMax; h.reloadT = 0; h.calmT = 0;
      s.events.push({ type: 'heroBack' });
    }
    return;
  }
  // Movement
  const m = cmd.move;
  if (m && (m.x !== 0 || m.z !== 0)) {
    const l = len(m.x, m.z), k = Math.min(1, l) / l;
    h.x += m.x * k * heroDef(s).speed * STEP;
    h.z += m.z * k * heroDef(s).speed * STEP;
    h.facing = Math.atan2(m.z, m.x);
  }
  confine(h, heroDef(s).radius, s);
  // Ammo: reload continuously while not full, like a magazine that refills one round at a time.
  h.fireCd = Math.max(0, h.fireCd - STEP);
  if (h.ammo < heroDef(s).ammoMax) {
    h.reloadT += STEP;
    if (h.reloadT >= heroDef(s).reload) { h.ammo++; h.reloadT = h.ammo < heroDef(s).ammoMax ? h.reloadT - heroDef(s).reload : 0; }
  }
  // Out-of-combat regeneration.
  h.calmT += STEP;
  if (h.calmT >= heroDef(s).regenDelay && h.hp < heroMaxHp(s)) h.hp = Math.min(heroMaxHp(s), h.hp + heroMaxHp(s) * heroDef(s).regenRate * STEP);

  if (cmd.fire && h.ammo >= 1 && h.fireCd <= 0) fire(s, cmd.fire);
  if (cmd.super && superReady(s)) castSuper(s, cmd.super);
  if (cmd.build) build(s, cmd.build);
}

/** Lob reach (cycle 40): a hand-aimed snowball lands as far out as aimed, between LOB_MIN and the hero's range. */
export const LOB_MIN = 1.5;
export const lobReach = (def: HeroDef, aimed: number) => Math.min(def.range, Math.max(LOB_MIN, aimed));

/** `aim` is an offset from the hero (m): bolts and swings use only its direction, a lob also its length. */
function fire(s: RushState, aim: Vec | 'auto') {
  const h = s.hero;
  let angle = h.facing, lobAt: Vec | null = null;
  if (aim === 'auto') {
    const swing = heroDef(s).attack === 'swing', lob = heroDef(s).attack === 'lob';
    // A lob drops from above (shields do not matter), so it simply takes the nearest enemy in range.
    const target = swing ? nearestEnemy(s, h, heroDef(s).range + 1.5) : lob ? nearestEnemy(s, h, heroDef(s).range) : autoTarget(s, h, heroDef(s).range);
    if (target && lob) lobAt = { x: target.x, z: target.z };
    if (target) angle = Math.atan2(target.z - h.z, target.x - h.x);
  } else if (aim.x !== 0 || aim.z !== 0) angle = Math.atan2(aim.z, aim.x);
  h.facing = angle;
  h.ammo -= 1;
  h.fireCd = heroDef(s).fireGap;
  h.calmT = 0;
  h.exposedUntil = s.t + BUSH.exposeAfterAttack;
  const def = heroDef(s);
  if (def.attack === 'swing') {
    // Melee cone: everything inside reach and the half-angle is hit at once and shoved back.
    let hits = 0;
    for (const e of s.enemies) {
      if (e.hp <= 0) continue;
      const er = ENEMIES[e.kind].radius, dx = e.x - h.x, dz = e.z - h.z, d = len(dx, dz);
      if (d > def.range + er) continue;
      let off = Math.atan2(dz, dx) - angle;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (Math.abs(off) > def.swingArc && d > er + def.radius) continue; // touching enemies are always hit
      hurtEnemy(s, e, def.boltDamage * s.mods.damage, 'hero');
      const k = def.swingKnock * ENEMIES[e.kind].knockTaken;
      if (d > 1e-6) { e.kx += (dx / d) * k; e.kz += (dz / d) * k; }
      hits++;
    }
    for (const c of [...s.crates]) {
      const dx = c.x - h.x, dz = c.z - h.z, d = len(dx, dz);
      let off = Math.atan2(dz, dx) - angle;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (d <= def.range + CRATE.size / 2 && Math.abs(off) <= def.swingArc) hurtCrate(s, c, def.boltDamage * s.mods.damage);
    }
    s.stats.shots++;
    s.events.push({ type: 'swing', x: h.x, z: h.z, angle, range: def.range, arc: def.swingArc, hits });
    return;
  }
  if (def.attack === 'lob') {
    // Auto-aim: on the target (or three quarters out with none); by hand: as far as aimed (cycle 40).
    const reach = aim === 'auto' ? def.range * 0.75 : lobReach(def, len(aim.x, aim.z));
    const point = lobAt ?? { x: h.x + Math.cos(angle) * reach, z: h.z + Math.sin(angle) * reach };
    const t = def.lobTravel ?? 0.5;
    s.shots.push({
      id: s.nextId++, owner: 'lob', x: h.x, z: h.z, vx: (point.x - h.x) / t, vz: (point.z - h.z) / t,
      damage: def.boltDamage * s.mods.damage, life: t, radius: def.boltRadius, target: 0, tx: point.x, tz: point.z,
    });
    s.stats.shots++;
    s.events.push({ type: 'fire', x: h.x, z: h.z, angle });
    return;
  }
  const half = (heroDef(s).bolts - 1) / 2;
  for (let i = 0; i < heroDef(s).bolts; i++) {
    const a = angle + (i - half) * heroDef(s).spread;
    s.shots.push({
      id: s.nextId++, owner: 'hero', x: h.x + Math.cos(a) * 0.5, z: h.z + Math.sin(a) * 0.5,
      vx: Math.cos(a) * heroDef(s).boltSpeed, vz: Math.sin(a) * heroDef(s).boltSpeed, damage: heroDef(s).boltDamage * s.mods.damage,
      life: heroDef(s).range / heroDef(s).boltSpeed, radius: heroDef(s).boltRadius, target: 0, tx: 0, tz: 0,
    });
  }
  s.stats.shots++;
  s.events.push({ type: 'fire', x: h.x, z: h.z, angle });
}

function castSuper(s: RushState, aim: Vec | 'auto') {
  const h = s.hero;
  let point: Vec | null;
  if (heroDef(s).superSelf) point = { x: h.x, z: h.z }; // ground slam around the hero
  else if (aim === 'auto') point = bestSuperPoint(s) ?? { x: h.x + Math.cos(h.facing) * heroDef(s).superRange * 0.6, z: h.z + Math.sin(h.facing) * heroDef(s).superRange * 0.6 };
  else {
    const l = len(aim.x, aim.z), k = l > heroDef(s).superRange ? heroDef(s).superRange / l : 1;
    point = { x: h.x + aim.x * k, z: h.z + aim.z * k };
  }
  const dx = point.x - h.x, dz = point.z - h.z;
  h.superCharge = 0;
  h.calmT = 0;
  h.exposedUntil = s.t + BUSH.exposeAfterAttack;
  if (dx !== 0 || dz !== 0) h.facing = Math.atan2(dz, dx);
  s.shots.push({
    id: s.nextId++, owner: 'super', x: h.x, z: h.z, vx: dx / heroDef(s).superTravel, vz: dz / heroDef(s).superTravel,
    damage: heroDef(s).superDamage * s.mods.damage, life: heroDef(s).superTravel, radius: heroDef(s).superRadius, target: 0, tx: point.x, tz: point.z,
  });
  s.stats.supers++;
}

function build(s: RushState, choice: boolean | TowerBranch) {
  const pad = padInReach(s);
  if (pad < 0) return;
  const cost = padCost(s, pad);
  if (cost === null || s.gold < cost) return;
  s.gold -= cost;
  const tower = s.towers[pad];
  if (tower) {
    tower.level++;
    if (tower.level === 1) tower.branch = choice === 'frost' ? 'frost' : 'fire';
  } else s.towers[pad] = { level: 0, cd: 0, facing: -Math.PI / 2 };
  s.events.push({ type: 'build', pad, level: s.towers[pad]!.level, branch: s.towers[pad]!.branch });
}

function hurtHero(s: RushState, damage: number) {
  const h = s.hero;
  if (h.downT > 0) return;
  h.hp -= damage;
  h.calmT = 0;
  s.events.push({ type: 'heroHit', damage });
  if (h.hp <= 0) {
    h.hp = 0;
    h.downT = heroDef(s).respawn;
    s.stats.heroDowns++;
    s.events.push({ type: 'heroDown' });
  }
}
function hurtTown(s: RushState, damage: number) {
  s.town.hp -= damage;
  s.events.push({ type: 'townHit', damage });
}
function hurtEnemy(s: RushState, e: Enemy, damage: number, owner: ShotOwner) {
  if (e.hp <= 0) return;
  e.hp -= damage;
  e.flash = 0.12;
  s.events.push({ type: 'hit', x: e.x, z: e.z, owner, damage, id: e.id });
  if (owner === 'hero') {
    s.stats.hits++;
    const before = s.hero.superCharge;
    s.hero.superCharge = Math.min(heroDef(s).superHits, before + 1);
    if (before < heroDef(s).superHits && s.hero.superCharge >= heroDef(s).superHits) s.events.push({ type: 'superReady' });
  }
}

/** Damage a crate; at 0 it breaks, stops blocking and drops a little gold. */
function hurtCrate(s: RushState, c: Crate, damage: number) {
  if (c.hp <= 0) return;
  c.hp -= damage;
  if (c.hp > 0) { s.events.push({ type: 'crateHit', id: c.id, x: c.x, z: c.z }); return; }
  s.crates = s.crates.filter(o => o !== c);
  s.events.push({ type: 'crateBreak', id: c.id, x: c.x, z: c.z });
  s.coins.push({ id: s.nextId++, x: c.x, z: c.z, value: CRATE.gold, life: ECONOMY.coinLife });
}

// ---------- enemies ----------
function nearestSegmentEnd(lane: readonly Vec[], p: Vec): number {
  let best = 1, bestD = Infinity;
  for (let i = 0; i < lane.length - 1; i++) {
    const a = lane[i], b = lane[i + 1], abx = b.x - a.x, abz = b.z - a.z;
    const t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
    const d = len(a.x + abx * t - p.x, a.z + abz * t - p.z);
    if (d < bestD) { bestD = d; best = i + 1; }
  }
  return best;
}

/** A tower bolt lands: plain damage, plus the branch effect (fire splash or frost slow). */
function towerHit(s: RushState, target: Enemy, shot: Shot) {
  const at = { x: target.x, z: target.z };
  hurtEnemy(s, target, shot.damage, 'tower');
  if (shot.branch === 'fire') {
    const f = TOWER_BRANCH.fire;
    const share = f.splashShare + FORGE.splashShare * s.mods.forge;
    for (const e of s.enemies) if (e !== target && e.hp > 0 && dist(e, at) <= f.splash + ENEMIES[e.kind].radius) hurtEnemy(s, e, shot.damage * share, 'tower');
    s.events.push({ type: 'splash', x: at.x, z: at.z, radius: f.splash });
  } else if (shot.branch === 'frost' && target.hp > 0) {
    target.slowT = TOWER_BRANCH.frost.slowTime + FORGE.slowTime * s.mods.forge;
    s.events.push({ type: 'chill', x: at.x, z: at.z });
  }
}

/** Shaman heal (cycle 59): on its period, every hurt living ally in range (not the shaman) gains the amount. */
function healPulse(s: RushState, e: Enemy, heal: NonNullable<EnemyDef['heal']>) {
  e.healT = (e.healT ?? heal.every) - STEP;
  if (e.healT > 0) return;
  e.healT += heal.every;
  const amount = heal.amount * s.diff.enemyHp;
  let count = 0;
  for (const o of s.enemies) {
    if (o === e || o.hp <= 0 || o.hp >= o.maxHp || dist(o, e) > heal.radius + ENEMIES[o.kind].radius) continue;
    o.hp = Math.min(o.maxHp, o.hp + amount);
    count++;
  }
  if (count) s.events.push({ type: 'heal', x: e.x, z: e.z, radius: heal.radius, count });
}

function updateEnemies(s: RushState) {
  const h = s.hero, alive = heroAlive(s), hidden = heroHidden(s);
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const def = ENEMIES[e.kind];
    e.flash = Math.max(0, e.flash - STEP);
    e.cd = Math.max(0, e.cd - STEP);
    const slowed = (e.slowT ?? 0) > 0;
    if (slowed) e.slowT = Math.max(0, e.slowT! - STEP);
    const pace = slowed ? (e.kind === 'boss' ? TOWER_BRANCH.frost.bossSlow : TOWER_BRANCH.frost.slow) : 1;
    // Knockback impulse decays quickly.
    e.x += e.kx * STEP; e.z += e.kz * STEP;
    const decay = Math.exp(-8 * STEP);
    e.kx *= decay; e.kz *= decay;

    if (e.windup) {
      e.windup.t -= STEP;
      if (e.windup.t <= 0) {
        const r = def.slamRadius ?? 2;
        if (alive && dist(h, e.windup) <= r + heroDef(s).radius) hurtHero(s, def.damage * s.diff.enemyDamage);
        if (dist(TOWN, e.windup) <= r + TOWN.radius) hurtTown(s, def.damage * s.diff.enemyDamage);
        s.events.push({ type: 'slam', x: e.windup.x, z: e.windup.z, radius: r });
        e.windup = null;
        e.cd = def.cooldown;
      }
      continue;
    }
    // Rally (cycle 33): once below the threshold it stands still and roars, then calls minions. A slam already
    // winding up lands first; a boss killed mid-roar calls nobody.
    const call = def.summon;
    if (call && !e.rallied && (s.diff.stage ?? 1) >= call.minStage && e.hp <= e.maxHp * call.at) {
      e.rallied = true;
      e.roarT = call.roar;
      s.events.push({ type: 'roar', x: e.x, z: e.z, radius: call.ring + ENEMIES[call.kind].radius, time: call.roar });
    }
    if (e.roarT) {
      e.roarT = Math.max(0, e.roarT - STEP);
      if (e.roarT === 0) rally(s, e, call!);
      continue;
    }
    if (def.heal) healPulse(s, e, def.heal);

    const chase = alive && dist(e, h) <= def.aggro && (!hidden || dist(e, h) <= BUSH.reveal);
    if (e.chasing && !chase) e.wp = nearestSegmentEnd(LANES[e.lane], e);
    e.chasing = chase;
    const target: Vec = chase ? h : TOWN;
    const targetR = chase ? heroDef(s).radius : TOWN.radius;
    const gap = dist(e, target) - targetR - def.radius;

    if (gap <= def.reach) {
      e.facing = Math.atan2(target.z - e.z, target.x - e.x);
      if (e.cd <= 0) attack(s, e, chase);
    } else {
      let goal: Vec = target;
      if (!chase) {
        const lane = LANES[e.lane];
        if (e.wp < lane.length - 1 && dist(e, lane[e.wp]) < 1.2) e.wp++;
        goal = lane[Math.min(e.wp, lane.length - 1)];
      }
      const dx = goal.x - e.x, dz = goal.z - e.z, d = len(dx, dz);
      if (d > 1e-6) {
        const step = Math.min(d, def.speed * pace * (s.diff.twist === 'swift' ? TWIST.swiftSpeed : 1) * STEP);
        e.x += (dx / d) * step; e.z += (dz / d) * step;
        e.facing = Math.atan2(dz, dx);
      }
    }
  }
  // Soft separation so crowds read as crowds, then solid geometry wins.
  const list = s.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.hp <= 0) continue;
    const ra = ENEMIES[a.kind].radius;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.hp <= 0) continue;
      const min = ra + ENEMIES[b.kind].radius, dx = b.x - a.x, dz = b.z - a.z;
      // Cheap reject first (cycle 18): most pairs are far apart. Overlapping pairs keep the exact distance below.
      if (dx * dx + dz * dz >= min * min) continue;
      const d = len(dx, dz);
      if (d >= min || d < 1e-9) continue;
      const push = (min - d) / 2, nx = dx / d, nz = dz / d;
      const wa = ENEMIES[a.kind].knockTaken, wb = ENEMIES[b.kind].knockTaken, sum = wa + wb;
      a.x -= nx * push * 2 * (wa / sum); a.z -= nz * push * 2 * (wa / sum);
      b.x += nx * push * 2 * (wb / sum); b.z += nz * push * 2 * (wb / sum);
    }
  }
  for (const e of list) if (e.hp > 0) confine(e, ENEMIES[e.kind].radius, s);
}

function rally(s: RushState, boss: Enemy, call: NonNullable<EnemyDef['summon']>) {
  const def = ENEMIES[call.kind], hp = Math.round(def.hp * s.diff.enemyHp), toTown = Math.atan2(TOWN.z - boss.z, TOWN.x - boss.x);
  for (let i = 0; i < call.count; i++) {
    // Evenly over the arc that faces the town: the minions lead the march, and the boss never hides one from view.
    const a = toTown + (call.count > 1 ? (i / (call.count - 1) - 0.5) * call.arc : 0);
    s.enemies.push({
      id: s.nextId++, kind: call.kind, x: boss.x + Math.cos(a) * call.ring, z: boss.z + Math.sin(a) * call.ring, kx: 0, kz: 0,
      hp, maxHp: hp, lane: boss.lane, wp: boss.wp, cd: def.cooldown * 0.5, flash: 0, chasing: false, facing: boss.facing, windup: null,
    });
  }
  s.events.push({ type: 'summon', x: boss.x, z: boss.z, count: call.count });
}

function attack(s: RushState, e: Enemy, atHero: boolean) {
  const def = ENEMIES[e.kind];
  e.cd = def.cooldown;
  if (e.kind === 'boss') {
    const h = s.hero;
    const point = atHero ? { x: h.x, z: h.z } : { x: e.x + Math.cos(e.facing) * 1.6, z: e.z + Math.sin(e.facing) * 1.6 };
    e.windup = { ...point, t: def.windup ?? 0.8 };
    s.events.push({ type: 'telegraph', x: point.x, z: point.z, radius: def.slamRadius ?? 2, time: def.windup ?? 0.8 });
    return;
  }
  if (def.shotSpeed) {
    const target = atHero ? s.hero : TOWN;
    const dx = target.x - e.x, dz = target.z - e.z, d = len(dx, dz) || 1;
    s.shots.push({
      id: s.nextId++, owner: 'enemy', x: e.x, z: e.z, vx: (dx / d) * def.shotSpeed, vz: (dz / d) * def.shotSpeed,
      damage: def.damage * s.diff.enemyDamage, life: (def.reach + 2) / def.shotSpeed, radius: 0.22, target: 0, tx: 0, tz: 0,
    });
    return;
  }
  if (atHero) hurtHero(s, def.damage * s.diff.enemyDamage); else hurtTown(s, def.damage * s.diff.enemyDamage);
}

// ---------- towers ----------
function updateTowers(s: RushState) {
  s.towers.forEach((tower, i) => {
    if (!tower) return;
    tower.cd = Math.max(0, tower.cd - STEP);
    if (tower.cd > 0) return;
    const lvl = TOWER_LEVELS[tower.level], pad = PADS[i];
    // Prefer the enemy closest to the town among those in range.
    let pick: Enemy | null = null, pickD = Infinity;
    for (const e of s.enemies) {
      if (e.hp <= 0 || dist(e, pad) > lvl.range + ENEMIES[e.kind].radius) continue;
      const d = dist(e, TOWN);
      if (d < pickD) { pick = e; pickD = d; }
    }
    if (!pick) return;
    tower.cd = lvl.cooldown;
    tower.facing = Math.atan2(pick.z - pad.z, pick.x - pad.x);
    const branch = tower.branch;
    s.shots.push({
      id: s.nextId++, owner: 'tower', x: pad.x, z: pad.z, vx: 0, vz: 0, damage: lvl.damage * (branch ? TOWER_BRANCH[branch].damage : 1),
      life: 2, radius: 0.2, target: pick.id, tx: pick.x, tz: pick.z, ...(branch ? { branch } : {}),
    });
  });
}

// ---------- shots ----------
function updateShots(s: RushState) {
  const keep: Shot[] = [];
  for (const shot of s.shots) {
    if (shot.owner === 'lob') {
      // Snowball (cycle 39): lands where it was thrown, hurts and slows everything in the splash. Counts as a hero hit.
      shot.x += shot.vx * STEP; shot.z += shot.vz * STEP; shot.life -= STEP;
      if (shot.life > 0) { keep.push(shot); continue; }
      const slow = heroDef(s).lobSlow ?? 0;
      for (const e of s.enemies) {
        if (e.hp <= 0 || len(e.x - shot.tx, e.z - shot.tz) > shot.radius + ENEMIES[e.kind].radius) continue;
        hurtEnemy(s, e, shot.damage, 'hero');
        if (e.hp > 0 && slow > 0) e.slowT = Math.max(e.slowT ?? 0, slow);
      }
      for (const c of [...s.crates]) if (len(c.x - shot.tx, c.z - shot.tz) <= shot.radius + CRATE.size / 2) hurtCrate(s, c, shot.damage);
      s.events.push({ type: 'snow', x: shot.tx, z: shot.tz, radius: shot.radius });
      continue;
    }
    if (shot.owner === 'super') {
      shot.x += shot.vx * STEP; shot.z += shot.vz * STEP; shot.life -= STEP;
      if (shot.life > 0) { keep.push(shot); continue; }
      const superSlow = heroDef(s).superSlow ?? 0;
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - shot.tx, dz = e.z - shot.tz, d = len(dx, dz);
        if (d > shot.radius + ENEMIES[e.kind].radius) continue;
        hurtEnemy(s, e, shot.damage, 'super');
        if (e.hp > 0 && superSlow > 0) e.slowT = Math.max(e.slowT ?? 0, superSlow);
        const k = heroDef(s).superKnock * ENEMIES[e.kind].knockTaken;
        if (d > 1e-6) { e.kx += (dx / d) * k; e.kz += (dz / d) * k; } else e.kz -= k;
      }
      for (const c of [...s.crates]) if (len(c.x - shot.tx, c.z - shot.tz) <= shot.radius + CRATE.size / 2) hurtCrate(s, c, shot.damage);
      s.events.push({ type: 'burst', x: shot.tx, z: shot.tz, radius: shot.radius });
      continue;
    }
    if (shot.owner === 'tower') {
      const target = s.enemies.find(e => e.id === shot.target && e.hp > 0);
      if (target) { shot.tx = target.x; shot.tz = target.z; }
      const dx = shot.tx - shot.x, dz = shot.tz - shot.z, d = len(dx, dz), step = TOWER_SHOT_SPEED * STEP;
      shot.life -= STEP;
      if (target && d <= step + ENEMIES[target.kind].radius) { towerHit(s, target, shot); continue; }
      if (!target && d <= step) continue; // target vanished; the bolt fizzles where it was going
      if (shot.life <= 0) continue;
      shot.vx = (dx / d) * TOWER_SHOT_SPEED; shot.vz = (dz / d) * TOWER_SHOT_SPEED;
      shot.x += shot.vx * STEP; shot.z += shot.vz * STEP;
      keep.push(shot);
      continue;
    }
    shot.x += shot.vx * STEP; shot.z += shot.vz * STEP; shot.life -= STEP;
    if (insideBlock(shot.x, shot.z, 0) || shot.x < ARENA.minX || shot.x > ARENA.maxX || shot.z < ARENA.minZ || shot.z > ARENA.maxZ) {
      s.events.push({ type: 'spark', x: shot.x, z: shot.z });
      continue;
    }
    const crate = inCrate(s, shot.x, shot.z);
    if (crate) { hurtCrate(s, crate, shot.damage); continue; }
    let hit = false;
    if (shot.owner === 'hero') {
      for (const e of s.enemies) {
        if (e.hp <= 0 || dist(e, shot) > ENEMIES[e.kind].radius + shot.radius) continue;
        // A shield-bearer turns aside bolts that come at its face (cycle 27); swings, supers and towers get through.
        const def = ENEMIES[e.kind];
        let damage = shot.damage;
        if (def.shield !== undefined && shieldFaces(e, shot)) { damage *= def.shield; s.events.push({ type: 'block', x: e.x, z: e.z }); }
        hurtEnemy(s, e, damage, 'hero');
        hit = true;
        break;
      }
    } else {
      if (heroAlive(s) && dist(s.hero, shot) <= heroDef(s).radius + shot.radius) { hurtHero(s, shot.damage); hit = true; }
      else if (dist(TOWN, shot) <= TOWN.radius + shot.radius) { hurtTown(s, shot.damage); hit = true; }
    }
    if (!hit && shot.life > 0) keep.push(shot);
  }
  s.shots = keep;
}

// ---------- coins & cleanup ----------
function updateCoins(s: RushState) {
  const h = s.hero, alive = heroAlive(s), keep: Coin[] = [];
  for (const c of s.coins) {
    c.life -= STEP;
    if (alive) {
      const dx = h.x - c.x, dz = h.z - c.z, d = len(dx, dz);
      if (d <= heroDef(s).pickup) { addGold(s, c.value); s.events.push({ type: 'coin', value: c.value }); continue; }
      if (d <= heroDef(s).magnet) { const step = Math.min(d, heroDef(s).magnetSpeed * STEP); c.x += (dx / d) * step; c.z += (dz / d) * step; }
    }
    if (c.life > 0) keep.push(c);
  }
  s.coins = keep;
}

function reap(s: RushState) {
  const keep: Enemy[] = [];
  for (const e of s.enemies) {
    if (e.hp > 0) { keep.push(e); continue; }
    s.stats.kills++;
    s.events.push({ type: 'kill', x: e.x, z: e.z, kind: e.kind });
    const gold = ENEMIES[e.kind].gold;
    if (gold > 0) {
      const p = { x: e.x + (rand(s) - 0.5) * 0.8, z: e.z + (rand(s) - 0.5) * 0.8 };
      confine(p, 0.2, s);
      s.coins.push({ id: s.nextId++, x: p.x, z: p.z, value: gold, life: ECONOMY.coinLife });
    }
  }
  s.enemies = keep;
}

/** Compact fingerprint for determinism checks and replays. */
export function rushHash(s: RushState): string {
  const r = (v: number) => Math.round(v * 1000);
  return JSON.stringify([
    s.tick, s.phase, s.wave, s.gold, r(s.town.hp), r(s.hero.x), r(s.hero.z), r(s.hero.hp), s.hero.ammo, s.hero.superCharge,
    s.enemies.map(e => [e.id, e.kind, r(e.x), r(e.z), r(e.hp)]), s.shots.length, s.coins.map(c => [c.id, r(c.x), r(c.z)]),
    s.towers.map(t => (t ? `${t.level}${t.branch ?? ''}` : -1)), s.crates.map(c => [c.id, Math.round(c.hp)]), s.stats,
  ]);
}
