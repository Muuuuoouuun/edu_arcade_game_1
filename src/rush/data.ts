// Arcana Rush prototype tunables. World units are metres on the ground plane (x → east, z → south).
// Design references (principles only, no copied content): hero-shooter touch combat with ammo/super,
// and kingdom-defence waves where a hand-controlled hero and buildable towers guard a town.

export const STEP = 1 / 60;

export type Vec = { x: number; z: number };
/** Axis-aligned block: centre plus full width (x) and depth (z). Blocks movement and flat shots. */
export type Block = { x: number; z: number; w: number; d: number };

export const ARENA = { minX: -15, maxX: 15, minZ: -26, maxZ: 13 } as const;
export const TOWN = { x: 0, z: 10, radius: 2.6, hp: 1000 } as const;
export const HERO_SPAWN: Vec = { x: 0, z: 6.1 };

export const WALLS: readonly Block[] = [
  { x: -4, z: -20, w: 2, d: 1 }, { x: 4, z: -20, w: 2, d: 1 },
  { x: -4.5, z: -12, w: 3, d: 1 }, { x: 4.5, z: -12, w: 3, d: 1 },
  { x: -3.2, z: -3.5, w: 1, d: 1.2 }, { x: 3.2, z: -3.5, w: 1, d: 1.2 },
  { x: -9.5, z: 3, w: 1.2, d: 4 }, { x: 9.5, z: 3, w: 1.2, d: 4 },
];

/** Tall grass: walkable; a hero inside is hidden from enemies further than BUSH.reveal (see sim). */
export const BUSHES: readonly Block[] = [
  { x: -6, z: -7, w: 2.4, d: 2 }, { x: 6, z: -7, w: 2.4, d: 2 },
  { x: -3.6, z: 1.5, w: 2, d: 1.6 }, { x: 3.6, z: 1.5, w: 2, d: 1.6 },
];
export const BUSH = { reveal: 1.8, exposeAfterAttack: 1 } as const;
/** Breakable wooden crates beside the lanes (never on them): cover that can be shot away. */
export const CRATES: readonly Vec[] = [{ x: -2.2, z: -9 }, { x: 2.2, z: -9 }, { x: -8.5, z: -16 }, { x: 8.5, z: -16 }];
export const CRATE = { size: 1, hp: 120, gold: 4 } as const;

/** Enemy lanes from the northern edge to the town gate. The last point sits on the town edge. */
export const LANES: readonly (readonly Vec[])[] = [
  [{ x: 0, z: -25 }, { x: 0, z: -17 }, { x: 0, z: -6 }, { x: 0, z: 7.4 }],
  [{ x: -13, z: -24 }, { x: -12.5, z: -12 }, { x: -7, z: -2 }, { x: -2.2, z: 7.6 }],
  [{ x: 13, z: -24 }, { x: 12.5, z: -12 }, { x: 7, z: -2 }, { x: 2.2, z: 7.6 }],
];

export const PADS: readonly Vec[] = [
  { x: -4.6, z: 5.2 }, { x: 4.6, z: 5.2 }, { x: -7.8, z: 9.6 }, { x: 7.8, z: 9.6 },
];
export const PAD_REACH = 1.8;

export type HeroKind = 'ranger' | 'bron';
export type HeroDef = {
  name: string; attack: 'bolts' | 'swing';
  speed: number; hp: number; radius: number;
  ammoMax: number; reload: number; fireGap: number;
  /** bolts: projectile fan · swing: instant melee cone (range = reach, swingArc = half angle). */
  bolts: number; spread: number; boltDamage: number; boltSpeed: number; range: number; boltRadius: number;
  swingArc: number; swingKnock: number;
  /** superSelf: the super lands on the hero (no aiming). */
  superHits: number; superRange: number; superRadius: number; superDamage: number; superKnock: number; superTravel: number; superSelf: boolean;
  regenDelay: number; regenRate: number; respawn: number;
  pickup: number; magnet: number; magnetSpeed: number;
};
const COMMON = { regenDelay: 3, regenRate: 0.12, respawn: 4, pickup: 1.3, magnet: 2.8, magnetSpeed: 9 } as const;
export const HEROES: Record<HeroKind, HeroDef> = {
  ranger: {
    name: '도마뱀 궁수', attack: 'bolts', speed: 5.2, hp: 420, radius: 0.5,
    ammoMax: 3, reload: 1.25, fireGap: 0.32,
    bolts: 3, spread: 0.13, boltDamage: 24, boltSpeed: 22, range: 9.5, boltRadius: 0.25, swingArc: 0, swingKnock: 0,
    superHits: 12, superRange: 8, superRadius: 3.2, superDamage: 150, superKnock: 7, superTravel: 0.35, superSelf: false,
    ...COMMON,
  },
  bron: {
    name: '브론', attack: 'swing', speed: 4.8, hp: 800, radius: 0.55,
    ammoMax: 3, reload: 0.85, fireGap: 0.36,
    bolts: 1, spread: 0, boltDamage: 58, boltSpeed: 0, range: 2.8, boltRadius: 0, swingArc: 0.96, swingKnock: 4,
    superHits: 8, superRange: 0, superRadius: 4, superDamage: 130, superKnock: 10, superTravel: 0.12, superSelf: true,
    ...COMMON,
  },
};
/** The default hero (kept for code that predates hero choice). */
export const HERO = HEROES.ranger;

export type EnemyKind = 'grunt' | 'skirmisher' | 'brute' | 'boss' | 'shield';
export type EnemyDef = {
  hp: number; speed: number; radius: number; damage: number; reach: number; cooldown: number;
  aggro: number; gold: number; knockTaken: number; shotSpeed?: number; windup?: number; slamRadius?: number;
  /** Shield-bearer (cycle 27): hero bolts from within shieldArc (rad) of its facing deal this share of damage. */
  shield?: number; shieldArc?: number;
};
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: { hp: 60, speed: 2.5, radius: 0.42, damage: 9, reach: 0.6, cooldown: 0.8, aggro: 3.2, gold: 6, knockTaken: 1 },
  skirmisher: { hp: 45, speed: 2.2, radius: 0.4, damage: 12, reach: 6, cooldown: 1.7, aggro: 7, gold: 8, knockTaken: 1, shotSpeed: 9 },
  brute: { hp: 260, speed: 1.5, radius: 0.7, damage: 28, reach: 0.7, cooldown: 1.3, aggro: 3, gold: 18, knockTaken: 0.35 },
  shield: { hp: 90, speed: 1.9, radius: 0.5, damage: 14, reach: 0.6, cooldown: 1, aggro: 3.2, gold: 10, knockTaken: 0.6, shield: 0.25, shieldArc: 1 },
  boss: { hp: 1800, speed: 1.25, radius: 1.15, damage: 70, reach: 2.2, cooldown: 2.6, aggro: 5, gold: 0, knockTaken: 0.1, windup: 0.9, slamRadius: 2.8 },
};

export type TowerLevel = { cost: number; damage: number; cooldown: number; range: number };
export const TOWER_LEVELS: readonly TowerLevel[] = [
  { cost: 60, damage: 20, cooldown: 0.9, range: 7.5 },
  { cost: 100, damage: 34, cooldown: 0.75, range: 8.2 },
  { cost: 160, damage: 52, cooldown: 0.6, range: 9 },
];
export const TOWER_SHOT_SPEED = 16;
/** Lv2 choice (cycle 15), kept at Lv3: fire splashes around the target, frost slows it. */
export type TowerBranch = 'fire' | 'frost';
export const TOWER_BRANCH = {
  fire: { damage: 0.85, splash: 1.3, splashShare: 0.3 },
  frost: { damage: 0.8, slow: 0.65, bossSlow: 0.85, slowTime: 1 },
} as const;
/** Town forge (cycle 20): per level, fire splash share +5 points and frost slow +0.15 s. */
export const FORGE = { splashShare: 0.05, slowTime: 0.15 } as const;

export const ECONOMY = { startGold: 60, waveBonus: 30, earlyBonusPerSecond: 2, prepTime: 12, coinLife: 14 } as const;

/** minStage: the group only appears from that stage on (shield-bearers from stage 6, cycle 27). */
export type SpawnGroup = { kind: EnemyKind; count: number; lane: number; interval: number; delay: number; minStage?: number };
export const WAVES: readonly (readonly SpawnGroup[])[] = [
  [{ kind: 'grunt', count: 8, lane: 0, interval: 1.1, delay: 0 }],
  [
    { kind: 'grunt', count: 6, lane: 1, interval: 1, delay: 0 },
    { kind: 'grunt', count: 6, lane: 2, interval: 1, delay: 0.5 },
    { kind: 'brute', count: 1, lane: 0, interval: 0, delay: 6 },
  ],
  [
    { kind: 'grunt', count: 8, lane: 0, interval: 0.8, delay: 0 },
    { kind: 'skirmisher', count: 4, lane: 1, interval: 1.6, delay: 2 },
    { kind: 'skirmisher', count: 4, lane: 2, interval: 1.6, delay: 2 },
    { kind: 'brute', count: 2, lane: 0, interval: 4, delay: 8 },
    { kind: 'shield', count: 1, lane: 0, interval: 3, delay: 4, minStage: 6 },
  ],
  [
    { kind: 'grunt', count: 10, lane: 1, interval: 0.7, delay: 0 },
    { kind: 'grunt', count: 10, lane: 2, interval: 0.7, delay: 0 },
    { kind: 'skirmisher', count: 6, lane: 0, interval: 1.2, delay: 3 },
    { kind: 'brute', count: 3, lane: 0, interval: 3.5, delay: 6 },
    { kind: 'shield', count: 1, lane: 1, interval: 3, delay: 4, minStage: 6 },
    { kind: 'shield', count: 1, lane: 2, interval: 3, delay: 5, minStage: 6 },
  ],
  [
    { kind: 'boss', count: 1, lane: 0, interval: 0, delay: 2 },
    { kind: 'grunt', count: 12, lane: 1, interval: 0.9, delay: 0 },
    { kind: 'grunt', count: 12, lane: 2, interval: 0.9, delay: 4 },
    { kind: 'skirmisher', count: 6, lane: 0, interval: 1.4, delay: 6 },
    { kind: 'shield', count: 2, lane: 0, interval: 2.5, delay: 8, minStage: 6 },
  ],
];
