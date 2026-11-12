// Fixed-step battle clock with hit-stop (pure; seconds). Same contract as the Arcana campaign clock:
// no steps run during a stop, the first frame after a stop does not catch up, and stops never change
// the simulation's result — they only delay when steps run.
import { STEP } from './data.ts';
import type { RushEvent } from './sim.ts';

export type RushClock = { acc: number; last: number; stopUntil: number; lastStopTick: number };
export const createClock = (now: number): RushClock => ({ acc: 0, last: now, stopUntil: -Infinity, lastStopTick: -Infinity });

/** How many fixed steps to run for this frame. Time spent inside a stop never accumulates. */
export function advanceClock(c: RushClock, now: number, speed = 1, cap = 0.1): { clock: RushClock; steps: number } {
  if (now <= c.stopUntil) return { clock: { ...c, last: now }, steps: 0 };
  const elapsed = Math.min(cap, Math.max(0, now - Math.max(c.last, c.stopUntil))) * speed;
  let acc = c.acc + elapsed, steps = 0;
  while (acc >= STEP - 1e-12) { acc -= STEP; steps++; }
  return { clock: { ...c, acc, last: now }, steps };
}

/** Stop lengths (seconds) and the minimum game time between ordinary stops. */
export const HIT_STOP = { boss: 0.11, heroDown: 0.09, burst: 0.07, heavy: 0.045, spacing: 0.6 } as const;

export type StopRequest = { length: number; urgent: boolean };
/** The hit-stop a step's events ask for. Urgent stops (boss kill, hero down) ignore the spacing rule. */
export function hitStopFor(events: readonly RushEvent[]): StopRequest {
  let length = 0, urgent = false;
  const superLanded = events.some(e => e.type === 'hit' && e.owner === 'super');
  for (const e of events) {
    if (e.type === 'kill' && e.kind === 'boss') { length = Math.max(length, HIT_STOP.boss); urgent = true; }
    else if (e.type === 'heroDown') { length = Math.max(length, HIT_STOP.heroDown); urgent = true; }
    else if (e.type === 'burst' && superLanded) length = Math.max(length, HIT_STOP.burst);
    else if (e.type === 'kill' && e.kind === 'brute') length = Math.max(length, HIT_STOP.heavy);
  }
  return { length, urgent };
}

/**
 * Start a stop at `now` for the step `tick`, unless an ordinary stop happened under `spacing` game-seconds ago.
 * `scale` 0 (reduced motion) keeps the bookkeeping but never freezes. Returns the same object when nothing changes.
 */
export function tryStop(c: RushClock, now: number, tick: number, req: StopRequest, scale = 1): RushClock {
  if (req.length <= 0) return c;
  if (!req.urgent && (tick - c.lastStopTick) * STEP < HIT_STOP.spacing) return c;
  return { ...c, stopUntil: now + req.length * scale, lastStopTick: tick };
}
