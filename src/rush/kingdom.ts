// Between-battle kingdom meta (town growth). Pure rules: no DOM, no clock — callers pass `now` in ms.
// Principles taken from kingdom-builder games: the castle is the hub and caps everything else, resource
// buildings produce over (offline) time, and permanent upgrades change the next battle.
import { WAVE_COUNT, type RushMods, type RushState } from './sim.ts';

export type Resource = 'food' | 'wood';
export type Building = 'castle' | 'farm' | 'mill';
export type Perk = 'attack' | 'towerDiscount' | 'townHp';
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
  /** Recently rewarded battle ids, so one battle never pays twice. */
  rewarded: string[];
}

export const CASTLE_MAX = 5;
/** Production per minute per building level, and how many minutes of production storage holds. */
export const RATE_PER_LEVEL = 8;
export const STORAGE_MINUTES = 120;
export const PERK_EFFECT = { attack: 0.08, towerDiscount: 0.08, townHp: 0.1 } as const;

export const createKingdom = (now: number): Kingdom => ({
  version: 1, castle: 1, farm: 1, mill: 1, perks: { attack: 0, towerDiscount: 0, townHp: 0 },
  food: 120, wood: 120, lastCollect: now, battles: { won: 0, lost: 0 }, rewarded: [],
});

const clone = (k: Kingdom): Kingdom => ({ ...k, perks: { ...k.perks }, battles: { ...k.battles }, rewarded: [...k.rewarded] });

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

/** Battle modifiers from permanent upgrades. */
export const kingdomMods = (k: Kingdom): RushMods => ({
  damage: 1 + PERK_EFFECT.attack * k.perks.attack,
  towerCost: Math.max(0.6, 1 - PERK_EFFECT.towerDiscount * k.perks.towerDiscount),
  townHp: 1 + PERK_EFFECT.townHp * k.perks.townHp,
});

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

// ---------- save format ----------
const count = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/** Parse a saved kingdom; anything malformed falls back to a fresh kingdom rather than crashing the game. */
export function parseKingdom(raw: string | null, now: number): Kingdom {
  try {
    if (!raw) return createKingdom(now);
    const v = JSON.parse(raw) as Partial<Kingdom>;
    const castle = count(v.castle, 1, CASTLE_MAX);
    if (v.version !== 1 || castle === null) return createKingdom(now);
    const farm = count(v.farm, 1, castle), mill = count(v.mill, 1, castle);
    const p = v.perks ?? ({} as Kingdom['perks']);
    const perks = { attack: count(p.attack, 0, castle), towerDiscount: count(p.towerDiscount, 0, castle), townHp: count(p.townHp, 0, castle) };
    const food = count(v.food, 0, 1e9), wood = count(v.wood, 0, 1e9);
    const won = count(v.battles?.won, 0, 1e9), lost = count(v.battles?.lost, 0, 1e9);
    if ([farm, mill, perks.attack, perks.towerDiscount, perks.townHp, food, wood, won, lost].some(x => x === null)) return createKingdom(now);
    const last = typeof v.lastCollect === 'number' && Number.isFinite(v.lastCollect) ? Math.min(v.lastCollect, now) : now;
    const rewarded = Array.isArray(v.rewarded) ? v.rewarded.filter((x): x is string => typeof x === 'string').slice(-20) : [];
    return {
      version: 1, castle, farm: farm!, mill: mill!,
      perks: { attack: perks.attack!, towerDiscount: perks.towerDiscount!, townHp: perks.townHp! },
      food: food!, wood: wood!, lastCollect: last, battles: { won: won!, lost: lost! }, rewarded,
    };
  } catch {
    return createKingdom(now);
  }
}
export const serializeKingdom = (k: Kingdom): string => JSON.stringify(k);
