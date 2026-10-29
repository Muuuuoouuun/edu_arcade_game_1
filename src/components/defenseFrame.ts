import type { DefenseState } from '../games/defense/types.ts';

/** A terminal battle stops ticking as soon as its last visual effect expires.
 * Publish that final frame even inside the normal render throttle, or React can
 * retain a stale effect and never reveal the result dialog. */
export function shouldPublishDefenseFrame(before: DefenseState, next: DefenseState, lastPublished: DefenseState, elapsedMs: number): boolean {
  const finishedEffects = (before.phase === 'won' || before.phase === 'lost') && before.effects.length > 0 && next.effects.length === 0;
  return next !== lastPublished && (elapsedMs >= 32 || before.phase !== next.phase || finishedEffects);
}
