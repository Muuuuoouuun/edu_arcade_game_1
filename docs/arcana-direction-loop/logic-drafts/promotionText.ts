// DRAFT from the direction loop (cycle 91). Copy to src/games/defense/promotionText.ts; checked against main b175a9f in a scratch copy.
// One table for what a mid-battle promotion does and what each screen says about it, so the dialog, the notice
// after choosing and the party panel cannot drift apart (today the names and descriptions live inside DefenseGame.tsx
// and the notice inside engine.ts).
import type { HeroId } from './types.ts';

export type Promotion = 'power' | 'control';

/** Dialog names. Same as DefenseGame.tsx on main except the elf power name: today it is '명사수', which is already
 * her role on the hero card (엘프 · 명사수), so the promotion reads as no change. */
export const PROMOTION_NAMES: Record<HeroId, Record<Promotion, string>> = {
  mage: { power: '화염 현자', control: '결계 현자' },
  elf: { power: '별빛 사수', control: '숲의 추적자' },
  dwarf: { power: '파쇄 장인', control: '요새 공병' },
  tao: { power: '뇌전 도사', control: '결계 도사' },
  barbarian: { power: '분노의 전사', control: '산맥의 수호자' },
  druid: { power: '야수왕', control: '달빛 수호자' },
};

/** Mirrors engine.ts: heroStats ranges, the slow a hero's skill already has, and the promotion numbers. */
export const HERO_RANGE: Record<HeroId, number> = { mage: 170, elf: 280, dwarf: 155, tao: 220, barbarian: 140, druid: 195 };
export const OWN_SKILL_SLOW: Record<HeroId, number> = { mage: 0, elf: 0, dwarf: 0, tao: 4, barbarian: 0, druid: 5 };
export const POWER_PERCENT = 40, CONTROL_RANGE = 65, CONTROL_SLOW = 4;

export type PromotionFacts = {
  damagePercent: number; // basic attack and skill damage
  wolf: boolean;         // the druid's wolf shares the damage bonus
  range: number;         // added basic attack range
  rangePercent: number;  // that range against the hero's own
  addsSlow: number;      // seconds of skill slow the promotion adds
  keepsSlow: number;     // seconds of skill slow the hero already had (unchanged by the promotion)
};

export function promotionFacts(hero: HeroId, choice: Promotion): PromotionFacts {
  const own = OWN_SKILL_SLOW[hero];
  return choice === 'power'
    ? { damagePercent: POWER_PERCENT, wolf: hero === 'druid', range: 0, rangePercent: 0, addsSlow: 0, keepsSlow: own }
    : { damagePercent: 0, wolf: false, range: CONTROL_RANGE, rangePercent: Math.round(CONTROL_RANGE / HERO_RANGE[hero] * 100), addsSlow: own ? 0 : CONTROL_SLOW, keepsSlow: own };
}

/** The dialog line. Same wording as DefenseGame.tsx on main. */
export function promotionDescription(hero: HeroId, choice: Promotion): string {
  const f = promotionFacts(hero, choice);
  if (choice === 'power') return f.wolf ? `영웅의 기본 공격·필살기와 늑대 공격 피해 +${f.damagePercent}%` : `영웅의 기본 공격과 필살기 피해 +${f.damagePercent}%`;
  return `영웅 기본 공격 사거리 +${f.range} · ` + (f.addsSlow ? `필살기에 ${f.addsSlow}초 둔화 추가` : `필살기의 기존 둔화 ${f.keepsSlow}초 유지`);
}

/** The notice after choosing. Today engine.ts says '필살기에 둔화 효과!' for every hero, also where nothing is added. */
export function promotionNotice(hero: HeroId, choice: Promotion): string {
  if (choice === 'power') return '전직 완료! 공격력과 필살기가 강해졌어요.';
  return promotionFacts(hero, choice).addsSlow ? '전직 완료! 사거리 증가 · 필살기에 둔화 효과!' : '전직 완료! 사거리가 늘었어요.';
}

/** A short line for the party panel, so the chosen path stays visible after the dialog closes. */
export function promotionLabel(hero: HeroId, choice: Promotion): string {
  const f = promotionFacts(hero, choice);
  const effect = choice === 'power' ? `피해 +${f.damagePercent}%` : f.addsSlow ? `사거리 +${f.range} · 필살기 둔화` : `사거리 +${f.range}`;
  return `${PROMOTION_NAMES[hero][choice]} · ${effect}`;
}
