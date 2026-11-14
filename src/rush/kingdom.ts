// Between-battle kingdom meta (town growth). Pure rules: no DOM, no clock — callers pass `now` in ms.
// Principles taken from kingdom-builder games: the castle is the hub and caps everything else, resource
// buildings produce over (offline) time, and permanent upgrades change the next battle.
import { WAVE_COUNT, type RushMods, type RushState } from './sim.ts';
import { TALENT_MAX, type HeroKind } from './data.ts';
import { STAGE_COUNT, starBonus, starsFor, stageRewardMul } from './stages.ts';

export type Resource = 'food' | 'wood';
export type Building = 'castle' | 'farm' | 'mill';
export type Perk = 'attack' | 'towerDiscount' | 'townHp' | 'forge' | 'vault';
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
  /** Talent level per hero (cycle 45), 0..TALENT_MAX. */
  talent: Record<HeroKind, number>;
  /** Hero shards (cycle 26): earned from stage stars and high-stage wins, spent on hero training from Lv3. */
  shards: number;
  /** Endless challenge (cycle 46): most waves held in one run. */
  endlessBest: number;
  /** Kingdom goal chain (cycle 64): index of the next goal to claim; past GOALS.length it is a power ladder rung (cycle 83). */
  goal: number;
  /** Local day number (see `dayIndex`) of the last daily first-win bonus (cycle 32); 0 = never. */
  dailyWin: number;
  /** Recently rewarded battle ids, so one battle never pays twice. */
  rewarded: string[];
}

export const CASTLE_MAX = 5;
/** Production per minute per building level, and how many minutes of production storage holds. */
export const RATE_PER_LEVEL = 8;
export const STORAGE_MINUTES = 120;
export const PERK_EFFECT = { attack: 0.08, towerDiscount: 0.08, townHp: 0.1 } as const;
/** Vault (cycle 38): battle starting gold per level. */
export const VAULT_GOLD = 12;
/** Hero training: the castle allows two hero levels per castle level; each level adds health and attack. */
export const HERO_LV_PER_CASTLE = 2;
export const HERO_GROWTH = { hp: 0.1, damage: 0.1 } as const;

export const createKingdom = (now: number): Kingdom => ({
  version: 1, castle: 1, farm: 1, mill: 1, perks: { attack: 0, towerDiscount: 0, townHp: 0, forge: 0, vault: 0 },
  food: 120, wood: 120, lastCollect: now, battles: { won: 0, lost: 0 }, stars: Array(STAGE_COUNT).fill(0), hero: 'ranger', heroLv: { ranger: 1, bron: 1, bear: 1 }, talent: { ranger: 0, bron: 0, bear: 0 }, shards: 0, endlessBest: 0, goal: 0, dailyWin: 0, rewarded: [],
});

const clone = (k: Kingdom): Kingdom => ({ ...k, perks: { ...k.perks }, battles: { ...k.battles }, stars: [...k.stars], heroLv: { ...k.heroLv }, talent: { ...k.talent }, rewarded: [...k.rewarded] });

/** The endless challenge sits after the last stage and opens with a star on it (cycle 46). */
export const ENDLESS_STAGE = STAGE_COUNT + 1;
export const stageUnlocked = (k: Kingdom, n: number) => n >= 1 && n <= ENDLESS_STAGE && (n === 1 || k.stars[n - 2] > 0);
/** Heroes join through progress: Bron once stage 2 has a star, Popo (cycle 39) once stage 4 has one. */
export const HERO_JOINS: Record<HeroKind, number> = { ranger: 0, bron: 2, bear: 4 };
export const heroUnlocked = (k: Kingdom, hero: HeroKind) => HERO_JOINS[hero] === 0 || (k.stars[HERO_JOINS[hero] - 1] ?? 0) > 0;
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
    case 'vault': return { food: 60 * n, wood: 50 * n };
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
export type TrainCost = Cost & { shards: number };
/** Shards a training step needs: none up to Lv3, then one more per level (Lv3→4: 1 … Lv9→10: 7). */
export const SHARDS_FROM_LV = 3;
export function trainCost(k: Kingdom, hero: HeroKind): TrainCost | null {
  const l = k.heroLv[hero];
  if (!heroUnlocked(k, hero) || l >= heroMaxLevel(k)) return null;
  return { food: 45 * l, wood: 25 * l, shards: Math.max(0, l - SHARDS_FROM_LV + 1) };
}
export function canTrain(k: Kingdom, hero: HeroKind): boolean {
  const c = trainCost(k, hero);
  return !!c && k.food >= c.food && k.wood >= c.wood && k.shards >= c.shards;
}
/** Collects first, then pays and levels the hero up. Unaffordable or capped → unchanged (but collected). */
export function train(k: Kingdom, hero: HeroKind, now: number): Kingdom {
  const next = collect(k, now), c = trainCost(next, hero);
  if (!c || next.food < c.food || next.wood < c.wood || next.shards < c.shards) return next;
  next.food -= c.food;
  next.wood -= c.wood;
  next.shards -= c.shards;
  next.heroLv[hero]++;
  return next;
}

// ---------- hero talents (cycle 45) ----------
/** Talent level n costs 3n shards and needs the hero trained to Lv 2n+1 (3, 5, 7). */
export const talentNeedsLv = (n: number) => 2 * n + 1;
export function talentCost(k: Kingdom, hero: HeroKind): { shards: number; needLv: number; ready: boolean } | null {
  const n = k.talent[hero] + 1;
  if (n > TALENT_MAX) return null;
  return { shards: 3 * n, needLv: talentNeedsLv(n), ready: k.heroLv[hero] >= talentNeedsLv(n) };
}
export function canLearnTalent(k: Kingdom, hero: HeroKind): boolean {
  const c = talentCost(k, hero);
  return !!c && c.ready && k.shards >= c.shards;
}
export function learnTalent(k: Kingdom, hero: HeroKind): Kingdom {
  if (!canLearnTalent(k, hero)) return k;
  const next = clone(k);
  next.shards -= talentCost(k, hero)!.shards;
  next.talent[hero]++;
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
    startGold: VAULT_GOLD * k.perks.vault,
    talent: k.talent[k.hero],
  };
};

/** Reward for a finished battle: a small participation base, more per wave defended, plus a victory bonus. */
export function battleReward(s: RushState): Cost & { waves: number; won: boolean } {
  const won = s.phase === 'won', waves = won ? WAVE_COUNT : s.wave;
  return { food: 10 + 15 * waves + (won ? 40 : 0), wood: 8 + 12 * waves + (won ? 30 : 0), waves, won };
}
/** Grants a battle's reward once per battle id. */
export function grantReward(k: Kingdom, battleId: string, reward: Cost & { won: boolean; shards?: number }): { kingdom: Kingdom; granted: boolean } {
  if (k.rewarded.includes(battleId)) return { kingdom: k, granted: false };
  const next = clone(k);
  next.food += reward.food;
  next.wood += reward.wood;
  next.shards += reward.shards ?? 0;
  if (reward.won) next.battles.won++; else next.battles.lost++;
  next.rewarded = [...next.rewarded, battleId].slice(-20);
  return { kingdom: next, granted: true };
}

export type Settlement = Cost & { won: boolean; waves: number; stars: number; newStars: number; bonus: Cost; shards: number; daily: TrainCost | null };

// ---------- daily first win (cycle 32) ----------
/** Extra reward for the first battle won on each local day: a reason to come back that still needs a battle. */
export const DAILY_WIN: TrainCost = { food: 100, wood: 100, shards: 3 };
/** Local day number for `now` (ms); `offsetMin` is Date#getTimezoneOffset() (UTC minus local, in minutes). */
export const dayIndex = (now: number, offsetMin = 0) => Math.floor((now - offsetMin * 60000) / 86400000);
/** The bonus waits when today is later than the last day it was paid; a clock set back never pays again. */
export const dailyReady = (k: Kingdom, day: number) => day > k.dailyWin;
/** Shards from one battle: 2 per newly earned star, plus floor(stage / 3) for a win from stage 3 up (repeatable). */
export const shardReward = (stage: number, won: boolean, newStars: number) => 2 * newStars + (won ? Math.floor(stage / 3) : 0);
/**
 * Settle a finished stage battle once: stage-scaled base reward plus a bonus for each newly earned star.
 * Replaying with fewer stars never lowers the record.
 */
export function settleBattle(k: Kingdom, battleId: string, s: RushState, stage: number, day?: number): { kingdom: Kingdom; granted: boolean; reward: Settlement } {
  const base = battleReward(s), mul = stageRewardMul(stage), stars = starsFor(s);
  const prev = k.stars[stage - 1] ?? 0, newStars = Math.max(0, stars - prev), b = starBonus(stage);
  const bonus = { food: b.food * newStars, wood: b.wood * newStars };
  const reward: Settlement = {
    food: Math.round(base.food * mul) + bonus.food, wood: Math.round(base.wood * mul) + bonus.wood,
    won: base.won, waves: base.waves, stars, newStars, bonus, shards: shardReward(stage, base.won, newStars), daily: null,
  };
  // A battle id already paid never claims the daily bonus either (grantReward refuses it below).
  if (base.won && day !== undefined && dailyReady(k, day) && !k.rewarded.includes(battleId)) {
    reward.daily = { ...DAILY_WIN };
    reward.food += DAILY_WIN.food; reward.wood += DAILY_WIN.wood; reward.shards += DAILY_WIN.shards;
  }
  const result = grantReward(k, battleId, reward);
  if (result.granted && stars > prev) result.kingdom.stars[stage - 1] = stars;
  if (result.granted && reward.daily) result.kingdom.dailyWin = day!;
  return { ...result, reward };
}

// ---------- endless challenge (cycle 46) ----------
export type EndlessResult = Cost & { waves: number; shards: number; best: number; newBest: boolean; milestones: EndlessMilestone[] };
/** Record milestones (cycle 51): shards the first time a run holds this many waves. Derived from the best record. */
export type EndlessMilestone = { waves: number; shards: number };
export const ENDLESS_MILESTONES: readonly EndlessMilestone[] = [{ waves: 5, shards: 3 }, { waves: 10, shards: 6 }, { waves: 15, shards: 10 }, { waves: 20, shards: 15 }];
/** Milestones a run of `waves` passes for the first time, given the record before it. */
export const milestonesPassed = (best: number, waves: number) => ENDLESS_MILESTONES.filter(m => m.waves > best && m.waves <= waves);
/** The next milestone above the record, if any. */
export const nextMilestone = (best: number) => ENDLESS_MILESTONES.find(m => m.waves > best) ?? null;
/** Settle an endless run once: resources grow with the waves held (stage-10 rate), 1 shard per 5 waves, best record kept. */
export function settleEndless(k: Kingdom, battleId: string, s: RushState): { kingdom: Kingdom; granted: boolean; reward: EndlessResult } {
  const waves = s.wave, mul = stageRewardMul(STAGE_COUNT);
  const milestones = k.rewarded.includes(battleId) ? [] : milestonesPassed(k.endlessBest, waves);
  const food = Math.round((10 + 15 * waves) * mul), wood = Math.round((8 + 12 * waves) * mul);
  const shards = Math.floor(waves / 5) + milestones.reduce((a, m) => a + m.shards, 0);
  const result = grantReward(k, battleId, { food, wood, won: false, shards });
  const newBest = result.granted && waves > k.endlessBest;
  if (newBest) result.kingdom.endlessBest = waves;
  return { ...result, reward: { food, wood, waves, shards, best: Math.max(k.endlessBest, result.granted ? waves : 0), newBest, milestones: result.granted ? milestones : [] } };
}

// ---------- save format ----------
const count = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

const talentLevel = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? Math.min(Math.max(0, v), TALENT_MAX) : 0);
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
    const perks = { attack: count(p.attack, 0, castle), towerDiscount: count(p.towerDiscount, 0, castle), townHp: count(p.townHp, 0, castle), forge: p.forge === undefined ? 0 : count(p.forge, 0, castle),
      // Saves from before the vault (cycle 38) start it at 0, like the forge.
      vault: p.vault === undefined ? 0 : count(p.vault, 0, castle) };
    const food = count(v.food, 0, 1e9), wood = count(v.wood, 0, 1e9);
    const won = count(v.battles?.won, 0, 1e9), lost = count(v.battles?.lost, 0, 1e9);
    if ([farm, mill, perks.attack, perks.towerDiscount, perks.townHp, perks.forge, perks.vault, food, wood, won, lost].some(x => x === null)) return createKingdom(now);
    const last = typeof v.lastCollect === 'number' && Number.isFinite(v.lastCollect) ? Math.min(v.lastCollect, now) : now;
    const rewarded = Array.isArray(v.rewarded) ? v.rewarded.filter((x): x is string => typeof x === 'string').slice(-20) : [];
    // Saves from before stages existed have no star record: start the ladder fresh, keep everything else.
    const starList = Array.isArray(v.stars) && v.stars.length === STAGE_COUNT && v.stars.every(x => count(x, 0, 3) !== null)
      ? [...v.stars] : Array(STAGE_COUNT).fill(0);
    return {
      version: 1, castle, farm: farm!, mill: mill!,
      perks: { attack: perks.attack!, towerDiscount: perks.towerDiscount!, townHp: perks.townHp!, forge: perks.forge!, vault: perks.vault! },
      food: food!, wood: wood!, lastCollect: last, battles: { won: won!, lost: lost! }, stars: starList,
      // Saves from before hero choice (or naming an unknown or still-locked hero) take the ranger.
      hero: (v.hero === 'bron' && starList[1] > 0) || (v.hero === 'bear' && starList[3] > 0) ? v.hero : 'ranger',
      // Saves from before hero training start every hero at Lv1; levels above the castle cap are clamped.
      heroLv: { ranger: heroLevel(v.heroLv?.ranger, castle), bron: heroLevel(v.heroLv?.bron, castle), bear: heroLevel(v.heroLv?.bear, castle) },
      // Saves from before talents (cycle 45) start every talent at 0; out-of-range values clamp.
      talent: { ranger: talentLevel(v.talent?.ranger), bron: talentLevel(v.talent?.bron), bear: talentLevel(v.talent?.bear) },
      // Saves from before shards (cycle 26) get 2 per star already earned, so past progress still counts.
      shards: v.shards === undefined ? 2 * starList.reduce((a: number, b: number) => a + b, 0) : count(v.shards, 0, 1e6) ?? 0,
      // Saves from before the daily bonus (cycle 32) can claim it today.
      dailyWin: count(v.dailyWin, 0, 1e7) ?? 0,
      // Saves from before the endless challenge (cycle 46) have no record yet.
      endlessBest: count(v.endlessBest, 0, 1e6) ?? 0, rewarded,
      // Saves from before goals (cycle 64) start the chain at the first goal; ones already met can be claimed at once.
      goal: count(v.goal, 0, GOALS.length + POWER_LADDER.rungs) ?? 0,
    };
  } catch {
    return createKingdom(now);
  }
}
export const serializeKingdom = (k: Kingdom): string => JSON.stringify(k);

/** Kingdom power (cycle 71): one number that every kind of growth raises, shown in town. Always computed, never saved. */
export const POWER = { castle: 100, field: 30, perk: 60, heroLv: 40, talent: 80, star: 25, endlessWave: 10 } as const;
/** Recommended kingdom power per stage (cycle 89), measured: on a balanced growth path (castle 1 + L/2, the five perks
 * at L/2, hero Lv 1 + L, talent L/3) the least step L at which the guard bot wins at least 4 of seeds 1-8, counted with
 * two stars per earlier stage, rounded down to 50. Stages 1-5 need no growth; stage 6 is the first wall. Stages 8-9
 * re-measured with the ward shaman (cycle 90; tools/rush-stage-power.ts). */
/** Re-measured 2026-11-14 on the merged six-area build (per-region maps, frost wolves on 7-9, barricades, the frost
 * lord's howl on 10): 7 fell 1200 -> 1100, 8 fell 1800 -> 1750 and 10 fell 3050 -> 2500, because barricades hold the
 * waves in front of the towers. Stage 10 sits one rounding step above stage 9: at the same growth step the bot wins
 * 5 of 8 there against 8 of 8 on stage 9, but both pass the 4-of-8 rule at L6. */
export const STAGE_POWER: readonly number[] = [250, 300, 350, 400, 450, 1050, 1100, 1750, 2450, 2500];
export const recommendedPower = (stage: number): number | null => STAGE_POWER[stage - 1] ?? null;
export function kingdomPower(k: Kingdom): number {
  const perks = Object.values(k.perks).reduce((a, b) => a + b, 0);
  const heroLv = k.heroLv.ranger + k.heroLv.bron + k.heroLv.bear, talents = k.talent.ranger + k.talent.bron + k.talent.bear;
  const stars = k.stars.reduce((a, b) => a + b, 0);
  return k.castle * POWER.castle + (k.farm + k.mill) * POWER.field + perks * POWER.perk + heroLv * POWER.heroLv
    + talents * POWER.talent + stars * POWER.star + k.endlessBest * POWER.endlessWave;
}

/** Kingdom goal chain (cycle 64): one goal at a time, in the order a growing kingdom meets them (castle, stages, hero,
 * forge, endless), each paying a little food, wood or shards when claimed in town. */
/** `stage`: the stage a goal is about (1.0): tapping the unmet goal in town selects it, so '3 stars on stage 5' points at stage 5. */
export type Goal = { text: string; progress: (k: Kingdom) => [number, number]; reward: Partial<Cost> & { shards?: number }; ladder?: boolean; stage?: number };
const starsOn = (k: Kingdom, n: number) => k.stars[n - 1] ?? 0;
const bestHeroLv = (k: Kingdom) => Math.max(k.heroLv.ranger, k.heroLv.bron, k.heroLv.bear);
export const GOALS: readonly Goal[] = [
  { text: '스테이지 1 승리', stage: 1, progress: k => [Math.min(1, starsOn(k, 1)), 1], reward: { food: 60 } },
  { text: '성 Lv 2', progress: k => [Math.min(2, k.castle), 2], reward: { wood: 60 } },
  { text: '농장 Lv 2', progress: k => [Math.min(2, k.farm), 2], reward: { food: 80 } },
  { text: '스테이지 3에서 별', stage: 3, progress: k => [Math.min(1, starsOn(k, 3)), 1], reward: { shards: 2 } },
  { text: '공격 강화 Lv 1', progress: k => [Math.min(1, k.perks.attack), 1], reward: { wood: 80 } },
  { text: '영웅 Lv 2', progress: k => [Math.min(2, bestHeroLv(k)), 2], reward: { shards: 2 } },
  { text: '성 Lv 3', progress: k => [Math.min(3, k.castle), 3], reward: { food: 150, wood: 150 } },
  { text: '스테이지 5에서 별 3개', stage: 5, progress: k => [starsOn(k, 5), 3], reward: { shards: 3 } },
  { text: '대장간 Lv 1', progress: k => [Math.min(1, k.perks.forge), 1], reward: { shards: 3 } },
  { text: '스테이지 10에서 별', stage: 10, progress: k => [Math.min(1, starsOn(k, 10)), 1], reward: { shards: 5 } },
  { text: '끝없는 도전 5웨이브', progress: k => [Math.min(5, k.endlessBest), 5], reward: { shards: 5 } },
  { text: '성 Lv 5', progress: k => [Math.min(5, k.castle), 5], reward: { shards: 8 } },
];
/** Power ladder (cycle 83): after the fixed chain the goals go on as kingdom power targets, 2,500 then every 500 more,
 * each paying a few shards. The rung follows from the saved goal index, so nothing new is stored. A chain finisher sits
 * near 2,000 power; everything but the endless challenge tops out at 4,970, so that is five rungs (15 shards). */
export const POWER_LADDER = { from: 2500, step: 500, shards: 3, rungs: 1000 } as const;
export function goalAt(index: number): Goal | null {
  if (!Number.isInteger(index) || index < 0) return null;
  if (index < GOALS.length) return GOALS[index];
  const rung = index - GOALS.length;
  if (rung >= POWER_LADDER.rungs) return null;
  const need = POWER_LADDER.from + rung * POWER_LADDER.step;
  return { text: `전투력 ${need.toLocaleString('en-US')}`, progress: k => [Math.min(need, kingdomPower(k)), need], reward: { shards: POWER_LADDER.shards }, ladder: true };
}
/** The goal to work on (null only past the end of the ladder), its progress and whether it can be claimed. */
export function currentGoal(k: Kingdom): { index: number; goal: Goal; have: number; need: number; done: boolean } | null {
  const goal = goalAt(k.goal);
  if (!goal) return null;
  const [have, need] = goal.progress(k);
  return { index: k.goal, goal, have, need, done: have >= need };
}
/** Claim the current goal if it is met: pay its reward and move to the next. Otherwise the kingdom is unchanged. */
export function claimGoal(k: Kingdom): Kingdom {
  const g = currentGoal(k);
  if (!g?.done) return k;
  const next = clone(k), r = g.goal.reward;
  next.food += r.food ?? 0; next.wood += r.wood ?? 0; next.shards += r.shards ?? 0;
  next.goal = k.goal + 1;
  return next;
}
