// DRAFT from the direction loop (cycle 67). Copy to src/components/effectTier.ts; checked against main 355e573 in a scratch copy.
// Picture rules only: engine damage, range, area and targets stay exactly as they are.
import type { HeroId } from '../games/defense/types.ts';

/** 0 = base, 1 = one step up, 2 = top. */
export type FxTier = 0 | 1 | 2;

/** Tower: Lv1 → 0, Lv2 (branch chosen) → 1, Lv3 (mastery) → 2. */
export const towerTier = (level: number): FxTier => (level >= 3 ? 2 : level === 2 ? 1 : 0);

/** Hero: promotion is one step, shared gear Lv3 or higher is one step. */
export const heroTier = (training: number, promoted: boolean): FxTier =>
  Math.min(2, (promoted ? 1 : 0) + (training >= 3 ? 1 : 0)) as FxTier;

/** Engine damage multiplier of a tower level (engine.ts: 1 + (level - 1) * .45). Used only to size the picture. */
const TIER_POWER = [1, 1.45, 1.9] as const;

export type ImpactFx = { core: number; sparks: number; ring: boolean; rim: boolean };

/**
 * Hit picture by tier. The core grows with the square root of the damage step, so its area follows damage
 * but its width stays small on a landscape phone (Lv3: ×1.38). One extra spark per tier, a thin ring from
 * tier 1, a gold rim at tier 2. Reduced motion keeps the size cue and drops motion parts.
 */
export function impactFx(baseCore: number, tier: FxTier, reduced: boolean): ImpactFx {
  return {
    core: Math.round(baseCore * Math.sqrt(TIER_POWER[tier]) * 10) / 10,
    sparks: reduced ? 0 : 4 + tier,
    ring: !reduced && tier >= 1,
    rim: tier === 2,
  };
}

export type SkillShape = 'meteor' | 'arrows' | 'quake' | 'storm' | 'cleave' | 'vines';
/** One shape per hero, taken from the skill names in data.ts. */
export const SKILL_SHAPE: Record<HeroId, SkillShape> = {
  mage: 'meteor',     // 유성 낙하
  elf: 'arrows',      // 별빛 화살비
  dwarf: 'quake',     // 대지 강타
  tao: 'storm',       // 뇌운 결계
  barbarian: 'cleave', // 산맥 가르기
  druid: 'vines',     // 덩굴의 포효
};

export type SkillTarget = { id: number; x: number; y: number; maxHp: number };
export type SkillMark = { id: number; x: number; y: number; delay: number; big: boolean };

/**
 * The skill hits every enemy on the board (engine.ts `skill`), so every enemy gets a mark; the ring at the
 * hero is not the reach. Marks land in order of distance from the hero within `spread` seconds. The heaviest
 * 2 + tier enemies (boss first) get the big version. Reduced motion: all marks at once.
 */
export function skillMarks(
  targets: SkillTarget[], from: { x: number; y: number }, tier: FxTier, reduced: boolean, spread = .3,
): SkillMark[] {
  const far = Math.max(1, ...targets.map(t => Math.hypot(t.x - from.x, t.y - from.y)));
  const big = new Set([...targets].sort((a, b) => b.maxHp - a.maxHp || a.id - b.id).slice(0, 2 + tier).map(t => t.id));
  return targets.map(t => ({
    id: t.id, x: t.x, y: t.y, big: big.has(t.id),
    delay: reduced ? 0 : Math.round(spread * Math.hypot(t.x - from.x, t.y - from.y) / far * 1000) / 1000,
  }));
}
