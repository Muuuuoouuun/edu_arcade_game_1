// DRAFT test (cycle 67). Copy to src/components/effectTier.test.ts and add it to the npm test list. Checked on main 355e573.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heroTier, impactFx, SKILL_SHAPE, skillMarks, towerTier } from './effectTier.ts';
import { actDefense, createDefense, stepDefense } from '../games/defense/engine.ts';
import { HERO_ORDER } from '../games/defense/data.ts';
import type { DefenseState } from '../games/defense/types.ts';

test('the hit picture grows with level, gently, and reduced motion drops only the moving parts', () => {
  assert.deepEqual([1, 2, 3].map(towerTier), [0, 1, 2]);
  const [lv1, lv2, lv3] = ([0, 1, 2] as const).map(t => impactFx(21, t, false));
  assert.ok(lv1.core < lv2.core && lv2.core < lv3.core);
  assert.ok(lv3.core / lv1.core <= 1.39, 'Lv3 core at most ×1.38 wide');
  assert.deepEqual([lv1.sparks, lv2.sparks, lv3.sparks], [4, 5, 6]);
  assert.deepEqual([lv1.ring, lv2.ring, lv3.rim], [false, true, true]);
  const calm = impactFx(21, 2, true);
  assert.equal(calm.core, lv3.core);
  assert.equal(calm.sparks, 0);
  assert.equal(calm.ring, false);
  assert.equal(heroTier(0, false), 0);
  assert.equal(heroTier(5, false), 1);
  assert.equal(heroTier(2, true), 1);
  assert.equal(heroTier(5, true), 2);
});

test('every hero has its own skill shape', () => {
  assert.equal(new Set(HERO_ORDER.map(h => SKILL_SHAPE[h])).size, HERO_ORDER.length);
});

test('a skill marks exactly the enemies the engine hits, nearest first', () => {
  for (const hero of HERO_ORDER) {
    let s: DefenseState = actDefense(createDefense(1, hero), { type: 'start-wave' });
    while (s.enemies.length < 5) s = stepDefense(s, 1 / 30);
    const before = new Map(s.enemies.map(e => [e.id, e.hp]));
    const cast = actDefense(s, { type: 'skill' });
    assert.notEqual(cast, s);
    const hit = new Set(s.enemies.filter(e => (cast.enemies.find(n => n.id === e.id)?.hp ?? 0) < before.get(e.id)!).map(e => e.id));
    const marks = skillMarks(s.enemies, s.heroPosition, 0, false);
    assert.deepEqual(new Set(marks.map(m => m.id)), hit, `${hero}: marks = hit enemies`);
    const byDistance = [...marks].sort((a, b) => Math.hypot(a.x - s.heroPosition.x, a.y - s.heroPosition.y) - Math.hypot(b.x - s.heroPosition.x, b.y - s.heroPosition.y));
    for (let i = 1; i < byDistance.length; i++) assert.ok(byDistance[i].delay >= byDistance[i - 1].delay);
    assert.ok(marks.every(m => m.delay >= 0 && m.delay <= .3));
    assert.equal(marks.filter(m => m.big).length, Math.min(2, marks.length));
    assert.ok(skillMarks(s.enemies, s.heroPosition, 2, true).every(m => m.delay === 0));
  }
});
