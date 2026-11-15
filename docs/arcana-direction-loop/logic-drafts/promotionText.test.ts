// DRAFT test (cycle 91). Copy to src/games/defense/promotionText.test.ts and add it to the npm test list. Checked on main b175a9f.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROL_RANGE, HERO_RANGE, OWN_SKILL_SLOW, PROMOTION_NAMES, promotionDescription, promotionFacts, promotionLabel, promotionNotice } from './promotionText.ts';
import { actDefense, createDefense, stepDefense } from './engine.ts';
import { HEROES, HERO_ORDER } from './data.ts';
import type { DefenseState, HeroId } from './types.ts';

/** A wave with exactly one sturdy enemy on the field and the hero ready to attack. */
function oneEnemy(hero: HeroId): DefenseState {
  let s = actDefense(createDefense(1, hero), { type: 'start-wave' });
  while (s.enemies.length < 1) s = stepDefense(s, 1 / 60);
  return { ...s, enemies: s.enemies.slice(0, 1).map(e => ({ ...e, hp: 1e6, maxHp: 1e6, slow: 0 })), heroCooldown: 0 };
}
const heroAt = (s: DefenseState, distance: number): DefenseState => {
  const point = { x: s.enemies[0].x + distance, y: s.enemies[0].y };
  return { ...s, heroPosition: point, heroTarget: { ...point } };
};
const heroAttacks = (s: DefenseState) => stepDefense(s, 1 / 60).attacks.some(a => a.source === 'hero');

test('the range table and the control range match what the engine lets a hero reach', () => {
  for (const hero of HERO_ORDER) {
    const s = oneEnemy(hero), range = HERO_RANGE[hero];
    assert.equal(heroAttacks(heroAt(s, range - 20)), true, `${hero} inside own range`);
    assert.equal(heroAttacks(heroAt(s, range + 25)), false, `${hero} outside own range`);
    assert.equal(heroAttacks(heroAt({ ...s, promotion: 'power' }, range + 25)), false, `${hero} power adds no range`);
    assert.equal(heroAttacks(heroAt({ ...s, promotion: 'control' }, range + CONTROL_RANGE - 20)), true, `${hero} control reach`);
    assert.equal(heroAttacks(heroAt({ ...s, promotion: 'control' }, range + CONTROL_RANGE + 25)), false, `${hero} control limit`);
  }
});

test('skill slow and damage follow the facts for every hero and both paths', () => {
  for (const hero of HERO_ORDER) {
    const s = oneEnemy(hero), cast = (state: DefenseState) => actDefense(state, { type: 'skill' }).enemies[0];
    const base = cast(s), power = cast({ ...s, promotion: 'power' }), control = cast({ ...s, promotion: 'control' });
    assert.equal(base.slow, OWN_SKILL_SLOW[hero], `${hero} own slow`);
    assert.equal(power.slow, promotionFacts(hero, 'power').keepsSlow, `${hero} power slow`);
    assert.equal(control.slow, promotionFacts(hero, 'control').addsSlow || promotionFacts(hero, 'control').keepsSlow, `${hero} control slow`);
    assert.ok(Math.abs((1e6 - power.hp) / (1e6 - base.hp) - 1.4) < 1e-6, `${hero} power skill damage`);
    assert.ok(Math.abs((1e6 - control.hp) / (1e6 - base.hp) - 1) < 1e-6, `${hero} control skill damage`);
  }
});

test('every screen line says what the path really adds', () => {
  for (const hero of HERO_ORDER) {
    const control = promotionFacts(hero, 'control');
    assert.equal(promotionNotice(hero, 'control').includes('둔화'), control.addsSlow > 0, `${hero} notice`);
    assert.equal(promotionDescription(hero, 'control').includes('추가'), control.addsSlow > 0, `${hero} dialog`);
    assert.equal(promotionDescription(hero, 'control').includes('유지'), control.addsSlow === 0, `${hero} dialog keeps`);
    for (const choice of ['power', 'control'] as const) assert.ok(promotionLabel(hero, choice).startsWith(PROMOTION_NAMES[hero][choice] + ' · '));
  }
  assert.equal(promotionDescription('mage', 'power'), '영웅의 기본 공격과 필살기 피해 +40%');
  assert.equal(promotionDescription('druid', 'power'), '영웅의 기본 공격·필살기와 늑대 공격 피해 +40%');
  assert.equal(promotionDescription('mage', 'control'), '영웅 기본 공격 사거리 +65 · 필살기에 4초 둔화 추가');
  assert.equal(promotionDescription('tao', 'control'), '영웅 기본 공격 사거리 +65 · 필살기의 기존 둔화 4초 유지');
  assert.equal(promotionDescription('druid', 'control'), '영웅 기본 공격 사거리 +65 · 필살기의 기존 둔화 5초 유지');
  assert.equal(promotionNotice('tao', 'control'), '전직 완료! 사거리가 늘었어요.');
  assert.equal(promotionLabel('barbarian', 'control'), '산맥의 수호자 · 사거리 +65 · 필살기 둔화');
});

test('a promotion name never repeats the role on the hero card, and all twelve differ', () => {
  const names = HERO_ORDER.flatMap(hero => Object.values(PROMOTION_NAMES[hero]));
  assert.equal(new Set(names).size, 12);
  for (const hero of HERO_ORDER) for (const name of Object.values(PROMOTION_NAMES[hero])) assert.ok(!HEROES[hero].role.includes(name), `${hero}: ${name}`);
});

// Documents main b175a9f. Drop this test when engine.ts uses promotionNotice().
test('today the control notice promises a skill slow to the two heroes who already have one', () => {
  for (const hero of ['tao', 'druid'] as const) {
    const s = actDefense({ ...createDefense(1, hero), phase: 'promotion' }, { type: 'promote', choice: 'control' });
    assert.equal(s.notice, '전직 완료! 사거리 증가 · 필살기에 둔화 효과!');
  }
});
