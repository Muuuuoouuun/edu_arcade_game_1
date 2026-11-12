// DRAFT test (cycle 73). Copy to src/games/defense/skillSummary.test.ts and add it to the npm test list. Checked on main b175a9f.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_FACTS, skillSummary } from './skillSummary.ts';
import { actDefense, createDefense, damageMultiplier, stepDefense } from './engine.ts';
import { HERO_ORDER } from './data.ts';
import type { DefenseState } from './types.ts';

test('the skill table matches what a real cast does in the engine', () => {
  for (const hero of HERO_ORDER) {
    const f = SKILL_FACTS[hero];
    let s: DefenseState = actDefense(createDefense(1, hero), { type: 'start-wave' });
    while (s.enemies.length < 3) s = stepDefense(s, 1 / 30);
    s = { ...s, enemies: s.enemies.map(e => ({ ...e, burn: 0, slow: 0, knockVelocity: 0, knockCooldown: 0 })) };
    const cast = actDefense(s, { type: 'skill' });
    assert.notEqual(cast, s, hero);
    for (const before of s.enemies) {
      const after = cast.enemies.find(e => e.id === before.id);
      if (!after) continue; // killed by the cast
      const expected = f.power * damageMultiplier(before.kind, f.element);
      assert.ok(Math.abs((before.hp - after.hp) - expected) < 1e-6, `${hero} damage ${before.hp - after.hp} vs ${expected}`);
      assert.equal(after.slow, f.slow, `${hero} slow`);
      assert.equal(after.burn > 0, f.burn, `${hero} burn`);
      assert.equal(after.knockVelocity > 0, f.knock !== 'none', `${hero} knockback`);
    }
  }
});

test('every card line says the skill reaches the whole field and follows promotion', () => {
  for (const hero of HERO_ORDER) assert.match(skillSummary(hero), /^전장의 모든 적에게/);
  assert.equal(skillSummary('barbarian'), '전장의 모든 적에게 강한 충격 피해 · 멀리 밀어내요');
  assert.equal(skillSummary('druid'), '전장의 모든 적에게 약한 피해 · 5초 느려져요');
  assert.equal(skillSummary('elf', 'control'), '전장의 모든 적에게 피해 · 4초 느려져요');
  assert.equal(skillSummary('mage', 'power'), '전장의 모든 적에게 불꽃 피해 +40% · 불이 붙어요');
});
