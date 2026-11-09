// DRAFT test (cycle 63). Copy to src/components/battleClock.test.ts and add it to the npm test list. 2/2 pass on main 2cd0b9c; engine tests 53/53 unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceClock, bigImpact, createClock, stopAt } from './battleClock.ts';
import { actDefense, createDefense, stepDefense } from '../games/defense/engine.ts';
import { getStage } from '../games/defense/data.ts';
import type { DefenseAction, DefenseState } from '../games/defense/types.ts';

test('no step runs during a stop and the first frame after it does not catch up', () => {
  let c = createClock(0), t = 0;
  ({ clock: c } = advanceClock(c, (t += 1 / 60), 1));
  c = stopAt(c, t, .05);
  for (let i = 0; i < 3; i++) { const r = advanceClock(c, (t += 1 / 60), 1); c = r.clock; if (t <= c.stopUntil) assert.equal(r.steps, 0); }
  const after = advanceClock(c, (t += 1 / 60), 1);
  assert.ok(after.steps <= 1, `burst ${after.steps}`);
});

/** Scripted inputs keyed to engine steps (like campaignBattle at 1/60), driven by a jittery real-time loop. */
function runBattle(stage: number, withStops: boolean, seed: number) {
  let s: DefenseState = createDefense(stage, stage === 8 ? 'druid' : 'barbarian', 0, 'standard');
  const route: DefenseAction[] = [{ type: 'build', slot: 2, kind: 'magic' }, { type: 'build', slot: 3, kind: 'cannon' }, { type: 'upgrade', slot: 2, branch: 'fire' }, { type: 'build', slot: 0, kind: 'crossbow' }, { type: 'upgrade', slot: 3, branch: 'crush' }, { type: 'build', slot: 5, kind: 'crossbow' }, { type: 'upgrade', slot: 2 }, { type: 'build', slot: 4, kind: 'cannon' }];
  if (getStage(stage).expanded) route.push({ type: 'build', slot: 6, kind: 'magic' }, { type: 'build', slot: 7, kind: 'cannon' });
  let index = 0, steps = 0, stops = 0, stepsDuringStop = 0, now = 0, lastBig = -Infinity, rnd = seed;
  const rand = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
  let clock = createClock(0);
  for (let frame = 0; frame < 200000; frame++) {
    now += .008 + rand() * .035;
    const r = advanceClock(clock, now, 1); clock = r.clock;
    if (now <= clock.stopUntil) stepsDuringStop += r.steps;
    for (let i = 0; i < r.steps; i++) {
      if (index < route.length) { const n = actDefense(s, route[index]); if (n.coins < s.coins) { index++; s = n; } }
      if (s.phase === 'prep' || s.phase === 'intermission') s = actDefense(s, { type: 'start-wave' });
      if (s.phase === 'promotion') s = actDefense(s, { type: 'promote', choice: 'power' });
      let skillUsed = false;
      if (s.enemies.length >= 5 && s.skillCooldown === 0) { const n = actDefense(s, { type: 'skill' }); skillUsed = n !== s; s = n; }
      if (s.phase === 'won' || s.phase === 'lost') return { s, steps, stops, stepsDuringStop };
      const prev = s; s = stepDefense(s, 1 / 60); steps++;
      // A skill is a player action: its stop starts after this step so the input order matches the plain run.
      const impact = withStops ? (bigImpact(prev, s) ?? (skillUsed ? 'big' : null)) : null;
      if (impact && (impact === 'boss' || s.time - lastBig >= .6)) {
        if (impact === 'big') lastBig = s.time;
        clock = stopAt(clock, now, impact === 'boss' ? .09 : .05); stops++; break;
      }
    }
  }
  throw new Error('never finished');
}

test('hit-stops change only real time: the same scripted battle ends in the same state', () => {
  for (const stage of [1, 4, 8]) {
    const plain = runBattle(stage, false, 7), stopped = runBattle(stage, true, 7);
    assert.ok(stopped.stops > 0, `stage ${stage} had no stop`);
    assert.equal(stopped.stepsDuringStop, 0);
    assert.equal(stopped.steps, plain.steps);
    for (const key of ['phase', 'hp', 'outpostHp', 'kills', 'coins', 'time', 'weakHits'] as const) assert.deepEqual(stopped.s[key], plain.s[key], `stage ${stage} ${key}`);
  }
});
