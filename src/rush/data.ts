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

// Walls, tall-grass cover and crate positions are per region: see maps.ts (`RushState.map`).
/** Cover that hides: a hero inside is hidden from enemies further than `reveal` (see sim). */
export const BUSH = { reveal: 1.8, exposeAfterAttack: 1 } as const;
/** Breakable crates beside the lanes (never on them): cover that can be shot away. */
export const CRATE = { size: 1, hp: 120, gold: 4 } as const;

/** Enemy lanes from the northern edge to the town gate. The last point sits on the town edge. */
export const LANES: readonly (readonly Vec[])[] = [
  [{ x: 0, z: -25 }, { x: 0, z: -17 }, { x: 0, z: -6 }, { x: 0, z: 7.4 }],
  [{ x: -13, z: -24 }, { x: -12.5, z: -12 }, { x: -7, z: -2 }, { x: -2.2, z: 7.6 }],
  [{ x: 13, z: -24 }, { x: 12.5, z: -12 }, { x: 7, z: -2 }, { x: 2.2, z: 7.6 }],
];

/** Tower pads. The first HOME_PADS guard the town where the lanes meet. The last two are outposts (2026-11-14): out
 * beside the side lanes, by their barricades, where a tower meets one lane's wave early but cannot see the other
 * lanes or the gate. TOWER_CAP towers may stand at once, so with six pads where they go is a choice. */
export const PADS: readonly Vec[] = [
  { x: -4.6, z: 5.2 }, { x: 4.6, z: 5.2 }, { x: -7.8, z: 9.6 }, { x: 7.8, z: 9.6 },
  { x: -10.6, z: -2.6 }, { x: 10.6, z: -2.6 },
];
export const HOME_PADS = 4;
export const TOWER_CAP = 4;
/** Taking a tower down returns this share of everything spent on it, so a tower can be moved to another pad (the
 * cap frees a place) at a price. */
export const TOWER_REFUND = 0.6;
export const PAD_REACH = 1.8;

/** Barricades (defence lane, 2026-11-13): one build site per lane, an arc across the field in front of the tall grass,
 * further out than the tower pads (the side ones a little further, clear of what a Lv3 tower hides from the camera). Enemies walking that lane stop at a standing barricade and attack it like the town;
 * melee enemies cannot reach a hero behind it (ranged ones still shoot one in reach). Built, upgraded and repaired from
 * the same build button as towers. Each site sits on its lane (sim.test.ts checks it). */
export const BARRICADES: readonly (Vec & { lane: number })[] = [
  { x: 0, z: 1.4, lane: 0 }, { x: -6.3, z: -0.6, lane: 1 }, { x: 6.3, z: -0.6, lane: 2 },
];
/** Lv1 wooden palisade; Lv2 adds iron spikes that hurt every melee attacker per blow (as tower damage, so a ward blunts it).
 * Health grows by BARRICADE.masonry times the kingdom's town-health perk (Lv5: twice) and spikes gain BARRICADE.spikeForge per
 * forge level (sim.ts): with no kingdom behind it a barricade is a speed bump, with one it holds. */
export type BarricadeLevel = { cost: number; hp: number; spike: number };
export const BARRICADE_LEVELS: readonly BarricadeLevel[] = [
  { cost: 40, hp: 180, spike: 0 },
  { cost: 60, hp: 280, spike: 10 },
];
/** length and depth: the solid box (across the lane, along it) for movement and attack reach, as wide and deep as the
 * model. hold: how many of its lane's enemies it stops at once (the nearest); the rest of a horde walks round it. repair: share of the level's cost to restore full health, scaled by the health missing (rubble = the whole
 * share, rebuilt at its level); never below repairMin. */
export const BARRICADE = { length: 2.4, depth: 0.8, repair: 0.75, repairMin: 5, hold: 6, spikeForge: 3, masonry: 2 } as const;

/** The frost lord's howl (2026-11-14, last stage only): when the boss of stage `stage` ends its roar it also knocks
 * `barricade` of every standing barricade's full health off it and freezes every tower for `towerFreeze` s. Measured:
 * barricades had made the last stage as easy as stage 9 (2,500 against 2,450); the howl gives the finale its own
 * moment and its step back (tools/rush-stage-power.ts). */
export const FROST_HOWL = { stage: 10, barricade: 1, towerFreeze: 4 } as const;

export type HeroKind = 'ranger' | 'bron' | 'bear';
export type HeroDef = {
  name: string; attack: 'bolts' | 'swing' | 'lob';
  speed: number; hp: number; radius: number;
  ammoMax: number; reload: number; fireGap: number;
  /** bolts: projectile fan · swing: instant melee cone (range = reach, swingArc = half angle). */
  bolts: number; spread: number; boltDamage: number; boltSpeed: number; range: number; boltRadius: number;
  swingArc: number; swingKnock: number;
  /** superSelf: the super lands on the hero (no aiming). */
  superHits: number; superRange: number; superRadius: number; superDamage: number; superKnock: number; superTravel: number; superSelf: boolean;
  regenDelay: number; regenRate: number; respawn: number;
  pickup: number; magnet: number; magnetSpeed: number;
  /** lob (cycle 39): a snowball arcs to a point in lobTravel s and hits everything within boltRadius, slowing it for
   * lobSlow s. It drops from above, so a shield-bearer cannot turn it aside. superSlow: the super slows what it hits. */
  lobTravel?: number; lobSlow?: number; superSlow?: number;
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
  // Third hero (cycle 39): crowd control. Lobbed snowballs splash and slow; the super is a blizzard that slows longer.
  bear: {
    name: '눈곰 포포', attack: 'lob', speed: 4.9, hp: 620, radius: 0.55,
    ammoMax: 2, reload: 1.3, fireGap: 0.45,
    bolts: 1, spread: 0, boltDamage: 44, boltSpeed: 0, range: 8, boltRadius: 1.6, swingArc: 0, swingKnock: 0,
    superHits: 10, superRange: 8, superRadius: 3.6, superDamage: 110, superKnock: 3, superTravel: 0.45, superSelf: false,
    lobTravel: 0.55, lobSlow: 1.2, superSlow: 3,
    ...COMMON,
  },
};
/** Hero talents (cycle 45): one per hero, Lv0-3, bought with shards. Each level adds `per` to one HeroDef stat.
 * Tuned with the bot: a longer bolt range or a wider swing gained nothing there, so the ranger narrows its fan
 * (more of the three bolts land on one target) and Bron reaches further. */
export const TALENTS: Record<HeroKind, { name: string; stat: 'spread' | 'range' | 'boltRadius'; per: number; label: string }> = {
  ranger: { name: '매의 눈', stat: 'spread', per: -0.03, label: '화살 부채 폭' },
  bron: { name: '긴 망치', stat: 'range', per: 0.25, label: '휘두르기 거리' },
  bear: { name: '눈사태', stat: 'boltRadius', per: 0.15, label: '눈덩이 범위' },
};
export const TALENT_MAX = 3;
/** The hero's stats with its talent level applied (cached: one object per hero and level). */
const talented = new Map<string, HeroDef>();
export function heroStats(kind: HeroKind, talent = 0): HeroDef {
  if (!talent) return HEROES[kind];
  const key = `${kind}:${talent}`;
  let d = talented.get(key);
  if (!d) { const t = TALENTS[kind]; d = { ...HEROES[kind], [t.stat]: HEROES[kind][t.stat] + t.per * talent }; talented.set(key, d); }
  return d;
}
/** The default hero (kept for code that predates hero choice). */
export const HERO = HEROES.ranger;

export type EnemyKind = 'grunt' | 'skirmisher' | 'brute' | 'boss' | 'shield' | 'shaman' | 'wolf';
export type EnemyDef = {
  hp: number; speed: number; radius: number; damage: number; reach: number; cooldown: number;
  aggro: number; gold: number; knockTaken: number; shotSpeed?: number; windup?: number; slamRadius?: number;
  /** Shield-bearer (cycle 27): hero bolts from within shieldArc (rad) of its facing deal this share of damage. */
  shield?: number; shieldArc?: number;
  /** Boss rally (cycle 33): the first time health drops to `at` of max, it stands and roars for `roar` s, then
   * calls `count` minions of `kind` at distance `ring`, spread over `arc` rad in front of it (cycle 34: in front, so the
   * boss's own body never hides one from the camera). Only from stage `minStage`. */
  summon?: { at: number; roar: number; count: number; kind: EnemyKind; ring: number; arc: number; minStage: number };
  /** Shaman (cycle 59): every `every` s it restores `amount` (times the stage health multiplier) to each hurt ally
   * within `radius` of it, never itself. A priority target: it keeps the brutes and shield-bearers around it alive. */
  heal?: { every: number; radius: number; amount: number; minStage?: number };
  /** Ward (cycle 90, measured in cycles 72-84): every `every` s it wards each ally within `radius` (never itself) for
   * `duration` s. A warded enemy takes `towerShare` of tower damage; a direct hero hit breaks it, and a melee hit also
   * breaks the wards within `meleeBreak` of its target, so Bron clears a warded pack while the ranger picks wards off. */
  ward?: { every: number; radius: number; duration: number; towerShare: number; meleeBreak: number };
  /** Frost wolf lunge: when its target is further than its bite but within `range`, it crouches for `windup` s (the
   * tell: it stands still and blinks white), then dashes at `speed` times its pace for `time` s. Once per `cooldown` s. */
  lunge?: { range: number; windup: number; speed: number; time: number; cooldown: number };
};
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: { hp: 60, speed: 2.5, radius: 0.42, damage: 9, reach: 0.6, cooldown: 0.8, aggro: 3.2, gold: 6, knockTaken: 1 },
  skirmisher: { hp: 45, speed: 2.2, radius: 0.4, damage: 12, reach: 6, cooldown: 1.7, aggro: 7, gold: 8, knockTaken: 1, shotSpeed: 9 },
  brute: { hp: 260, speed: 1.5, radius: 0.7, damage: 28, reach: 0.7, cooldown: 1.3, aggro: 3, gold: 18, knockTaken: 0.35 },
  shield: { hp: 90, speed: 1.9, radius: 0.5, damage: 14, reach: 0.6, cooldown: 1, aggro: 3.2, gold: 10, knockTaken: 0.6, shield: 0.25, shieldArc: 1 },
  boss: { hp: 1800, speed: 1.25, radius: 1.15, damage: 70, reach: 2.2, cooldown: 2.6, aggro: 5, gold: 0, knockTaken: 0.1, windup: 0.9, slamRadius: 2.8,
    summon: { at: 0.5, roar: 1, count: 3, kind: 'skirmisher', ring: 1.9, arc: 1.8, minStage: 6 } },
  // Heal is endless-only (cycle 90): heal and ward together dropped the maxed ranger to 3/8 at stage 10 (cycle 73).
  shaman: { hp: 70, speed: 1.8, radius: 0.45, damage: 8, reach: 0.6, cooldown: 1, aggro: 3, gold: 14, knockTaken: 1, heal: { every: 2.5, radius: 3, amount: 30, minStage: 11 },
    ward: { every: 2.5, radius: 5, duration: 4, towerShare: 0.1, meleeBreak: 2.5 } },
  // Frost wolf (snow region monster, from the old expedition campaign): 1.6x a grunt's pace, about a third of its
  // health, small packs that reach the gate before the wave's body. It closes the last metres with a lunge.
  wolf: { hp: 22, speed: 4, radius: 0.38, damage: 6, reach: 0.6, cooldown: 0.8, aggro: 2.6, gold: 6, knockTaken: 1.2,
    lunge: { range: 3.2, windup: 0.4, speed: 2.6, time: 0.35, cooldown: 3 } },
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

/** minStage: the group only appears from that stage on (shield-bearers from stage 6, cycle 27; frost wolves from 7, so
 * the snow region shows a new face on each of stages 6, 7 and 8). Shamans (cycle 59) use
 * 11, the endless challenge only: in stages 8-10 they cost a maxed kingdom stage 10 wins without rewarding focus fire. */
export type SpawnGroup = { kind: EnemyKind; count: number; lane: number; interval: number; delay: number; minStage?: number;
  /** The group stops appearing after this stage (frost wolves: stages 7-9, see WOLF_STAGES). */
  maxStage?: number;
  /** On stages `minStage`..`maxStage` this group is `count` smaller (before stage scaling): frost wolves take those
   * places, so a wolf stage swaps some grunts for wolves instead of only adding enemies. */
  less?: { count: number; minStage: number; maxStage: number } };
/** Frost wolves raid stages 7-9 (2-2 'the wolf pack raid' to 2-4). Not stage 10: there the same packs dropped a maxed
 * kingdom from 7/8 wins to 0-4/8 in every variant tried, and the frost lord's stage stays as it was tuned. Not the
 * endless challenge either (its region is the forest). */
const WOLF_STAGES = { minStage: 7, maxStage: 9 } as const;
const WOLF_SWAP = { count: 1, ...WOLF_STAGES } as const;
export const WAVES: readonly (readonly SpawnGroup[])[] = [
  [{ kind: 'grunt', count: 8, lane: 0, interval: 1.1, delay: 0 }],
  [
    { kind: 'grunt', count: 6, lane: 1, interval: 1, delay: 0, less: WOLF_SWAP },
    { kind: 'grunt', count: 6, lane: 2, interval: 1, delay: 0.5, less: WOLF_SWAP },
    { kind: 'brute', count: 1, lane: 0, interval: 0, delay: 6 },
    { kind: 'wolf', count: 3, lane: 0, interval: 0.5, delay: 3, ...WOLF_STAGES },
  ],
  [
    { kind: 'grunt', count: 8, lane: 0, interval: 0.8, delay: 0 },
    { kind: 'skirmisher', count: 4, lane: 1, interval: 1.6, delay: 2 },
    { kind: 'skirmisher', count: 4, lane: 2, interval: 1.6, delay: 2 },
    { kind: 'brute', count: 2, lane: 0, interval: 4, delay: 8 },
    { kind: 'shield', count: 1, lane: 0, interval: 3, delay: 4, minStage: 6 },
    { kind: 'shaman', count: 1, lane: 0, interval: 0, delay: 9, minStage: 8 },
  ],
  [
    { kind: 'grunt', count: 10, lane: 1, interval: 0.7, delay: 0, less: WOLF_SWAP },
    { kind: 'grunt', count: 10, lane: 2, interval: 0.7, delay: 0, less: WOLF_SWAP },
    { kind: 'skirmisher', count: 6, lane: 0, interval: 1.2, delay: 3 },
    { kind: 'brute', count: 3, lane: 0, interval: 3.5, delay: 6 },
    { kind: 'shield', count: 1, lane: 1, interval: 3, delay: 4, minStage: 6 },
    { kind: 'shield', count: 1, lane: 2, interval: 3, delay: 5, minStage: 6 },
    { kind: 'shaman', count: 1, lane: 1, interval: 0, delay: 7, minStage: 8 },
    { kind: 'wolf', count: 3, lane: 0, interval: 0.5, delay: 10, ...WOLF_STAGES },
  ],
  [
    { kind: 'boss', count: 1, lane: 0, interval: 0, delay: 2 },
    { kind: 'grunt', count: 12, lane: 1, interval: 0.9, delay: 0, less: WOLF_SWAP },
    { kind: 'grunt', count: 12, lane: 2, interval: 0.9, delay: 4, less: WOLF_SWAP },
    { kind: 'skirmisher', count: 6, lane: 0, interval: 1.4, delay: 6 },
    { kind: 'shield', count: 2, lane: 0, interval: 2.5, delay: 8, minStage: 6 },
    { kind: 'shaman', count: 2, lane: 0, interval: 3, delay: 9, minStage: 8 },
    { kind: 'wolf', count: 3, lane: 2, interval: 0.5, delay: 12, ...WOLF_STAGES },
  ],
];
