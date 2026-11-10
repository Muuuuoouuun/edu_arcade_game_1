// Between-battle kingdom meta (town growth). Pure rules: no DOM, no clock — callers pass `now` in ms.
// Principles taken from kingdom-builder games: the castle is the hub and caps everything else, resource
// buildings produce over (offline) time, and permanent upgrades change the next battle.
import { WAVE_COUNT, type RushMods, type RushState } from './sim.ts';
import type { HeroKind } from './data.ts';
import { STAGE_COUNT, starBonus, starsFor, stageRewardMul } from './stages.ts';

export type Resource = 'food' | 'wood';
export type Building = 'castle' | 'farm' | 'mill';
export type Perk = 'attack' | 'towerDiscount' | 'townHp' | 'forge';
export type Upgrade = Building | Perk;
export type Cost = Record<Resource, number>;

export interface Kingdom {
  version: 1;
  castle: number; farm: number; mill: number;
  perks: Record<Perk, number>;
  food: number; wood: number;
  /** Time up to which production has been collected (ms). */
  lastCollect: number;
  battles: { won: number; lost: number };
  /** Best stars (0-3) per stage; stage n opens once stage n-1 has at least one star. */
  stars: number[];
  /** Hero taken into battle. */
  hero: HeroKind;
  /** Level per hero (cycle 14); only the hero taken into battle gets its bonus. */
  heroLv: Record<HeroKind, number>;
  /** Recently rewarded battle ids, so one battle never pays twice. */
  rewarded: string[];
}

export const CASTLE_MAX = 5;
/** Production per minute per building level, and how many minutes of production storage holds. */
export const RATE_PER_LEVEL = 8;
export const STORAGE_MINUTES = 120;
export const PERK_EFFECT = { attack: 0.08, towerDiscount: 0.08, townHp: 0.1 } as const;
/** Hero training: the castle allows two hero levels per castle level; each level adds health and attack. */
export const HERO_LV_PER_CASTLE = 2;
export const HERO_GROWTH = { hp: 0.1, damage: 0.1 } as const;

export const createKingdom = (now: number): Kingdom => ({
  version: 1, castle: 1, farm: 1, mill: 1, perks: { attack: 0, towerDiscount: 0, townHp: 0, forge: 0 },
  food: 120, wood: 120, lastCollect: now, battles: { won: 0, lost: 0 }, stars: Array(STAGE_COUNT).fill(0), hero: 'ranger', heroLv: { ranger: 1, bron: 1 }, rewarded: [],
});

const clone = (k: Kingdom): Kingdom => ({ ...k, perks: { ...k.perks }, battles: { ...k.battles }, stars: [...k.stars], heroLv: { ...k.heroLv }, rewarded: [...k.rewarded] });

export const stageUnlocked = (k: Kingdom, n: number) => n >= 1 && n <= STAGE_COUNT && (n === 1 || k.stars[n - 2] > 0);
/** Heroes join through progress: Bron arrives once stage 2 has a star. */
export const heroUnlocked = (k: Kingdom, hero: HeroKind) => hero === 'ranger' || (hero === 'bron' && k.stars[1] > 0);
export function chooseHero(k: Kingdom, hero: HeroKind): Kingdom {
  if (!heroUnlocked(k, hero) || k.hero === hero) return k;
  return { ...clone(k), hero };
}
/** The furthest stage the player may enter. */
export const latestStage = (k: Kingdom) => { let n = 1; while (n < STAGE_COUNT && stageUnlocked(k, n + 1)) n++; return n; };

export const rate = (k: Kingdom): Cost => ({ food: k.farm * RATE_PER_LEVEL, wood: k.mill * RATE_PER_LEVEL });

/** Whole minutes of production waiting at `now` (storage holds at most STORAGE_MINUTES). Clock rollback → 0. */
const readyMinutes = (k: Kingdom, now: number) => Math.min(STORAGE_MINUTES, Math.floor(Math.max(0, now - k.lastCollect) / 60000));
/** Resources waiting to be collected at `now`. */
export function pending(k: Kingdom, now: number): Cost {
  const m = readyMinutes(k, now), r = rate(k);
  return { food: r.food * m, wood: r.wood * m };
}
export const storageFull = (k: Kingdom, now: number) => now - k.lastCollect >= STORAGE_MINUTES * 60000;

/** Collect in whole minutes so nothing is ever counted twice; partial minutes keep ticking. */
export function collect(k: Kingdom, now: number): Kingdom {
  const next = clone(k), got = pending(k, now);
  next.food += got.food;
  next.wood += got.wood;
  if (now <= k.lastCollect || storageFull(k, now)) next.lastCollect = now;
  else next.lastCollect = k.lastCollect + readyMinutes(k, now) * 60000;
  return next;
}

export const level = (k: Kingdom, u: Upgrade): number => (u === 'castle' || u === 'farm' || u === 'mill' ? k[u] : k.perks[u]);
/** Highest level the upgrade may reach right now (the castle caps everything else). */
export const maxLevel = (k: Kingdom, u: Upgrade): number => (u === 'castle' ? CASTLE_MAX : k.castle);

/** Cost of the next level, or null when it cannot go higher yet. */
export function upgradeCost(k: Kingdom, u: Upgrade): Cost | null {
  const l = level(k, u);
  if (l >= maxLevel(k, u)) return null;
  const n = u === 'castle' || u === 'farm' || u === 'mill' ? l : l + 1;
  switch (u) {
    case 'castle': return { food: 120 * n, wood: 120 * n };
    case 'farm': return { food: 20 * n, wood: 50 * n };
    case 'mill': return { food: 50 * n, wood: 20 * n };
    case 'attack': return { food: 70 * n, wood: 40 * n };
    case 'towerDiscount': return { food: 40 * n, wood: 70 * n };
    case 'townHp': return { food: 55 * n, wood: 55 * n };
    case 'forge': return { food: 50 * n, wood: 60 * n };
  }
}
export function canUpgrade(k: Kingdom, u: Upgrade): boolean {
  const c = upgradeCost(k, u);
  return !!c && k.food >= c.food && k.wood >= c.wood;
}
/** Collects first (production rates may change), then pays and levels up. Unaffordable → unchanged. */
export function upgrade(k: Kingdom, u: Upgrade, now: number): Kingdom {
  const next = collect(k, now), c = upgradeCost(next, u);
  if (!c || next.food < c.food || next.wood < c.wood) return next;
  next.food -= c.food;
  next.wood -= c.wood;
  if (u === 'castle' || u === 'farm' || u === 'mill') next[u]++;
  else next.perks[u]++;
  return next;
}

// ---------- hero training ----------
export const heroMaxLevel = (k: Kingdom): number => k.castle * HERO_LV_PER_CASTLE;
/** Health and attack multipliers a hero level gives. */
export const heroGrowth = (lv: number) => ({ hp: 1 + HERO_GROWTH.hp * (lv - 1), damage: 1 + HERO_GROWTH.damage * (lv - 1) });
/** Cost of the hero's next level, or null when locked or capped by the castle. */
export function trainCost(k: Kingdom, hero: HeroKind): Cost | null {
  const l = k.heroLv[hero];
  if (!heroUnlocked(k, hero) || l >= heroMaxLevel(k)) return null;
  return { food: 45 * l, wood: 25 * l };
}
export function canTrain(k: Kingdom, hero: HeroKind): boolean {
  const c = trainCost(k, hero);
  return !!c && k.food >= c.food && k.wood >= c.wood;
}
/** Collects first, then pays and levels the hero up. Unaffordable or capped → unchanged (but collected). */
export function train(k: Kingdom, hero: HeroKind, now: number): Kingdom {
  const next = collect(k, now), c = trainCost(next, hero);
  if (!c || next.food < c.food || next.wood < c.wood) return next;
  next.food -= c.food;
  next.wood -= c.wood;
  next.heroLv[hero]++;
  return next;
}

/** Battle modifiers from permanent upgrades and the chosen hero's level. */
export const kingdomMods = (k: Kingdom): RushMods => {
  const g = heroGrowth(k.heroLv[k.hero]);
  return {
    damage: (1 + PERK_EFFECT.attack * k.perks.attack) * g.damage,
    towerCost: Math.max(0.6, 1 - PERK_EFFECT.towerDiscount * k.perks.towerDiscount),
    townHp: 1 + PERK_EFFECT.townHp * k.perks.townHp,
    heroHp: g.hp,
    forge: k.perks.forge,
  };
};

/** Reward for a finished battle: a small participation base, more per wave defended, plus a victory bonus. */
export function battleReward(s: RushState): Cost & { waves: number; won: boolean } {
  const won = s.phase === 'won', waves = won ? WAVE_COUNT : s.wave;
  return { food: 10 + 15 * waves + (won ? 40 : 0), wood: 8 + 12 * waves + (won ? 30 : 0), waves, won };
}
/** Grants a battle's reward once per battle id. */
export function grantReward(k: Kingdom, battleId: string, reward: Cost & { won: boolean }): { kingdom: Kingdom; granted: boolean } {
  if (k.rewarded.includes(battleId)) return { kingdom: k, granted: false };
  const next = clone(k);
  next.food += reward.food;
  next.wood += reward.wood;
  if (reward.won) next.battles.won++; else next.battles.lost++;
  next.rewarded = [...next.rewarded, battleId].slice(-20);
  return { kingdom: next, granted: true };
}

export type Settlement = Cost & { won: boolean; waves: number; stars: number; newStars: number; bonus: Cost };
/**
 * Settle a finished stage battle once: stage-scaled base reward plus a bonus for each newly earned star.
 * Replaying with fewer stars never lowers the record.
 */
export function settleBattle(k: Kingdom, battleId: string, s: RushState, stage: number): { kingdom: Kingdom; granted: boolean; reward: Settlement } {
  const base = battleReward(s), mul = stageRewardMul(stage), stars = starsFor(s);
  const prev = k.stars[stage - 1] ?? 0, newStars = Math.max(0, stars - prev), b = starBonus(stage);
  const bonus = { food: b.food * newStars, wood: b.wood * newStars };
  const reward: Settlement = {
    food: Math.round(base.food * mul) + bonus.food, wood: Math.round(base.wood * mul) + bonus.wood,
    won: base.won, waves: base.waves, stars, newStars, bonus,
  };
  const result = grantReward(k, battleId, reward);
  if (result.granted && stars > prev) result.kingdom.stars[stage - 1] = stars;
  return { ...result, reward };
}

// ---------- save format ----------
const count = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

const heroLevel = (v: unknown, castle: number) => (typeof v === 'number' && Number.isInteger(v) ? Math.min(Math.max(1, v), castle * HERO_LV_PER_CASTLE) : 1);

/** Parse a saved kingdom; anything malformed falls back to a fresh kingdom rather than crashing the game. */
export function parseKingdom(raw: string | null, now: number): Kingdom {
  try {
    if (!raw) return createKingdom(now);
    const v = JSON.parse(raw) as Partial<Kingdom>;
    const castle = count(v.castle, 1, CASTLE_MAX);
    if (v.version !== 1 || castle === null) return createKingdom(now);
    const farm = count(v.farm, 1, castle), mill = count(v.mill, 1, castle);
    const p = v.perks ?? ({} as Kingdom['perks']);
    // Saves from before the forge (cycle 20) have no forge level: start it at 0, keep everything else.
    const perks = { attack: count(p.attack, 0, castle), towerDiscount: count(p.towerDiscount, 0, castle), townHp: count(p.townHp, 0, castle), forge: p.forge === undefined ? 0 : count(p.forge, 0, castle) };
    const food = count(v.food, 0, 1e9), wood = count(v.wood, 0, 1e9);
    const won = count(v.battles?.won, 0, 1e9), lost = count(v.battles?.lost, 0, 1e9);
    if ([farm, mill, perks.attack, perks.towerDiscount, perks.townHp, perks.forge, food, wood, won, lost].some(x => x === null)) return createKingdom(now);
    const last = typeof v.lastCollect === 'number' && Number.isFinite(v.lastCollect) ? Math.min(v.lastCollect, now) : now;
    const rewarded = Array.isArray(v.rewarded) ? v.rewarded.filter((x): x is string => typeof x === 'string').slice(-20) : [];
    // Saves from before stages existed have no star record: start the ladder fresh, keep everything else.
    const starList = Array.isArray(v.stars) && v.stars.length === STAGE_COUNT && v.stars.every(x => count(x, 0, 3) !== null)
      ? [...v.stars] : Array(STAGE_COUNT).fill(0);
    return {
      version: 1, castle, farm: farm!, mill: mill!,
      perks: { attack: perks.attack!, towerDiscount: perks.towerDiscount!, townHp: perks.townHp!, forge: perks.forge! },
      food: food!, wood: wood!, lastCollect: last, battles: { won: won!, lost: lost! }, stars: starList,
      // Saves from before hero choice (or naming an unknown or still-locked hero) take the ranger.
      hero: v.hero === 'bron' && starList[1] > 0 ? 'bron' : 'ranger',
      // Saves from before hero training start every hero at Lv1; levels above the castle cap are clamped.
      heroLv: { ranger: heroLevel(v.heroLv?.ranger, castle), bron: heroLevel(v.heroLv?.bron, castle) }, rewarded,
    };
  } catch {
    return createKingdom(now);
  }
}
export const serializeKingdom = (k: Kingdom): string => JSON.stringify(k);
