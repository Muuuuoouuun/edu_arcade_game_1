// DRAFT from the direction loop (cycle 73). Copy to src/games/defense/skillSummary.ts; checked against main b175a9f in a scratch copy.
// One table of what each hero's skill actually does (engine.ts `skill` action), so the card and button text cannot drift.
import type { Element, HeroId } from './types.ts';

export type SkillFacts = { power: number; element: Element; knock: 'none' | 'push' | 'far'; slow: number; burn: boolean };

/** Mirrors engine.ts: skillPower (barbarian 165, druid 90, others 115), heroStats element, knockback force
 * (barbarian 220, dwarf 170), slow (druid 5 s, tao 4 s, control promotion 4 s), fire sets burn. */
export const SKILL_FACTS: Record<HeroId, SkillFacts> = {
  mage: { power: 115, element: 'fire', knock: 'none', slow: 0, burn: true },
  elf: { power: 115, element: 'physical', knock: 'none', slow: 0, burn: false },
  dwarf: { power: 115, element: 'impact', knock: 'push', slow: 0, burn: false },
  tao: { power: 115, element: 'lightning', knock: 'none', slow: 4, burn: false },
  barbarian: { power: 165, element: 'impact', knock: 'far', slow: 0, burn: false },
  druid: { power: 90, element: 'physical', knock: 'none', slow: 5, burn: false },
};

const ELEMENT_WORD: Record<Element, string> = { fire: '불꽃 ', physical: '', impact: '충격 ', lightning: '번개 ', water: '물 ' };

/** One short line for the hero card and the skill button. Words, not raw numbers: the floating damage numbers already
 * show the real values after shared gear and promotion. */
export function skillSummary(hero: HeroId, promotion: null | 'power' | 'control' = null): string {
  const f = SKILL_FACTS[hero];
  const strength = f.power >= 150 ? '강한 ' : f.power < 100 ? '약한 ' : '';
  const slow = f.slow || (promotion === 'control' ? 4 : 0);
  const parts = [`전장의 모든 적에게 ${strength}${ELEMENT_WORD[f.element]}피해${promotion === 'power' ? ' +40%' : ''}`];
  if (f.burn) parts.push('불이 붙어요');
  if (f.knock === 'push') parts.push('밀어내요');
  if (f.knock === 'far') parts.push('멀리 밀어내요');
  if (slow) parts.push(`${slow}초 느려져요`);
  return parts.join(' · ');
}

export const SKILL_COMMON = '20초마다 · 웨이브가 끝나면 다시 충전 · 서리군주의 충전을 끊어요';
