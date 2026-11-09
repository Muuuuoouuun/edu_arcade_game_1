// Fixed-step battle clock with hit-stop (ported from the direction-loop cycle 47/63 draft). Seconds throughout.
import type { DefenseState } from '../games/defense/types.ts';

/** Fixed-step battle clock (cycle 47 draft). Seconds throughout. */
export type BattleClock = { accumulated: number; last: number; stopUntil: number };
export const createClock = (now: number): BattleClock => ({ accumulated: 0, last: now, stopUntil: -Infinity });

/** During a hit-stop no time accumulates and no step runs; afterwards only the time past the stop counts. */
export function advanceClock(c: BattleClock, now: number, speed: number, step = 1 / 60, cap = .1): { clock: BattleClock; steps: number } {
  const elapsed = now <= c.stopUntil ? 0 : Math.min(cap, Math.max(0, now - Math.max(c.last, c.stopUntil)));
  let accumulated = c.accumulated + elapsed * speed, steps = 0;
  if (now > c.stopUntil) while (accumulated >= step - 1e-12) { accumulated -= step; steps++; }
  return { clock: { ...c, accumulated, last: now }, steps };
}

/** A big impact on the current step: remaining steps of this frame are discarded (game time pauses for the stop; the 0.6s gap in game time is shorter in real time at 2x). */
export const stopAt = (c: BattleClock, now: number, length: number): BattleClock => ({ ...c, accumulated: c.accumulated % (1 / 60), stopUntil: now + length });

const HEAVY = new Set(['stone', 'ice', 'metal', 'wood']);
/** Tier-3 moments of cycle 41: skill hit / charge interrupt, hero melee kill of a heavy enemy, boss kill. */
export function bigImpact(prev: DefenseState, next: DefenseState): 'boss' | 'big' | null {
  const alive = new Set(next.enemies.map(e => e.id));
  const died = prev.enemies.filter(e => !alive.has(e.id));
  if (died.some(e => e.kind === 'boss' || e.kind === 'frostboss')) return 'boss';
  if (next.effects.some(e => e.id >= prev.nextId && (e.kind === 'skill' || e.kind === 'interrupt'))) return 'big';
  const melee = next.attacks.find(a => a.source === 'hero' && (a.kind === 'melee' || a.kind === 'slam') && a.fired && !prev.attacks.find(o => o.id === a.id)?.fired);
  if (melee && died.some(e => HEAVY.has(e.kind))) return 'big';
  return null;
}
