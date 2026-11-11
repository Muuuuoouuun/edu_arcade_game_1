import test from 'node:test';
import assert from 'node:assert/strict';
import { STEP } from './data.ts';
import { advanceClock, createClock, HIT_STOP, hitStopFor, tryStop, type RushClock } from './clock.ts';
import { createRush, rushHash, stepRush, type RushEvent } from './sim.ts';
import { stageDifficulty } from './stages.ts';
import { guardBot } from './bot.ts';

test('steps follow elapsed time, scale with speed and cap long frames', () => {
  let c = createClock(0);
  let r = advanceClock(c, 0.5, 1);
  assert.equal(r.steps, 6, '0.1 s cap → 6 steps, no spiral after a long frame');
  c = r.clock;
  r = advanceClock(c, 0.5 + STEP * 3 + 1e-6, 2);
  assert.equal(r.steps, 6, 'double speed');
});

test('no steps during a stop, and the first frame after it does not catch up', () => {
  let c: RushClock = createClock(0), t = 0;
  ({ clock: c } = advanceClock(c, (t += 1 / 60)));
  c = tryStop(c, t, 100, { length: 0.1, urgent: true });
  for (let i = 0; i < 5; i++) {
    const r = advanceClock(c, (t += 1 / 60));
    c = r.clock;
    if (t <= c.stopUntil) assert.equal(r.steps, 0);
  }
  while (t <= c.stopUntil) c = advanceClock(c, (t += 1 / 60)).clock;
  const after = advanceClock(c, (t += 1 / 60));
  assert.ok(after.steps <= 1, `burst of ${after.steps}`);
});

test('which moments stop: boss kill and hero down are urgent; a super only when it lands', () => {
  const kill = (kind: 'boss' | 'brute' | 'grunt'): RushEvent => ({ type: 'kill', x: 0, z: 0, kind });
  assert.deepEqual(hitStopFor([kill('boss')]), { length: HIT_STOP.boss, urgent: true });
  assert.deepEqual(hitStopFor([{ type: 'heroDown' }]), { length: HIT_STOP.heroDown, urgent: true });
  assert.equal(hitStopFor([{ type: 'burst', x: 0, z: 0, radius: 3 }]).length, 0, 'a super that hits nothing does not stop');
  assert.equal(hitStopFor([{ type: 'burst', x: 0, z: 0, radius: 3 }, { type: 'hit', x: 0, z: 0, owner: 'super', damage: 150 }]).length, HIT_STOP.burst);
  assert.equal(hitStopFor([kill('brute')]).length, HIT_STOP.heavy);
  assert.equal(hitStopFor([kill('grunt'), { type: 'fire', x: 0, z: 0, angle: 0 }]).length, 0, 'routine moments never stop');
});

test('ordinary stops keep their spacing; urgent ones always land; reduced motion never freezes', () => {
  let c = tryStop(createClock(0), 1, 600, { length: HIT_STOP.burst, urgent: false });
  assert.equal(c.lastStopTick, 600);
  const soon = 600 + Math.floor(HIT_STOP.spacing / STEP) - 1;
  assert.equal(tryStop(c, 1.2, soon, { length: HIT_STOP.heavy, urgent: false }), c, 'too soon');
  assert.equal(tryStop(c, 1.2, soon, { length: HIT_STOP.boss, urgent: true }).lastStopTick, soon);
  c = tryStop(createClock(0), 2, 50, { length: HIT_STOP.boss, urgent: true }, 0);
  assert.equal(c.stopUntil, 2, 'zero-length stop');
});

test('hit-stops never change the battle: random frame times with real stops end where plain stepping ends', () => {
  const play = (withClock: boolean) => {
    const s = createRush(4, undefined, stageDifficulty(3));
    let c = createClock(0), t = 0, stops = 0, seed = 9;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < 60 * 60 * 8) {
      if (!withClock) { stepRush(s, guardBot(s)); continue; }
      t += 0.008 + rand() * 0.035;
      const r = advanceClock(c, t);
      c = r.clock;
      for (let i = 0; i < r.steps; i++) {
        stepRush(s, guardBot(s));
        const next = tryStop(c, t, s.tick, hitStopFor(s.events));
        if (next !== c) { c = next; stops++; break; }
      }
    }
    return { s, stops };
  };
  const plain = play(false), timed = play(true);
  assert.ok(timed.stops >= 3, `stops actually happened (${timed.stops})`);
  assert.equal(rushHash(timed.s), rushHash(plain.s));
});
