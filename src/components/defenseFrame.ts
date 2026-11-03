import type { DefenseState } from '../games/defense/types.ts';

/** A terminal battle stops ticking as soon as its last visual effect expires.
 * Publish that final frame even inside the normal render throttle, or React can
 * retain a stale effect and never reveal the result dialog. */
export function shouldPublishDefenseFrame(before: DefenseState, next: DefenseState, lastPublished: DefenseState, elapsedMs: number): boolean {
  const finishedEffects = (before.phase === 'won' || before.phase === 'lost') && before.effects.length > 0 && next.effects.length === 0;
  return next !== lastPublished && (elapsedMs >= 32 || before.phase !== next.phase || finishedEffects);
}

/** Portrait phones leave the 3:2 board with unused height, so the enlarged view
 * is the default until a player explicitly picks the full view ('0'). */
export function resolveZoomPreference(stored: string | null): boolean {
  return stored !== '0';
}

/** The zoom shown on screen: the player's wish, but only while the layout has room for it. */
export function nextZoomState(wanted: boolean, room: boolean): boolean {
  return wanted && room;
}

// Units are authored for a ~900-unit board; on a narrow rendered board they shrink below ~25px, so grow them (capped to keep roads and pads usable).
export function unitScale(boardWidthPx: number): number {
  if (!(boardWidthPx > 0)) return 1;
  return Math.min(1.25, Math.max(1, 520 / boardWidthPx * 0.82 + 0.18));
}

/** Enemies hidden past either edge of the zoomed camera. `leftTo`/`rightTo` are the
 * scrollLeft that brings the nearest hidden enemy to the edge side of the view. */
export type OffscreenThreats = { left: number; right: number; leftTo: number; rightTo: number };
export function offscreenThreats(enemyXs: readonly number[], scrollLeft: number, viewWidth: number, mapWidth: number, boardUnits = 900): OffscreenThreats {
  const out: OffscreenThreats = { left: 0, right: 0, leftTo: 0, rightTo: 0 };
  if (!(mapWidth > viewWidth + 1) || !(viewWidth > 0)) return out;
  const margin = 6, max = mapWidth - viewWidth;
  let nearestLeft = -Infinity, nearestRight = Infinity;
  for (const x of enemyXs) {
    const px = x / boardUnits * mapWidth;
    if (px < scrollLeft - margin) { out.left++; nearestLeft = Math.max(nearestLeft, px); }
    else if (px > scrollLeft + viewWidth + margin) { out.right++; nearestRight = Math.min(nearestRight, px); }
  }
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  if (out.left) out.leftTo = clamp(nearestLeft - viewWidth * .25);
  if (out.right) out.rightTo = clamp(nearestRight - viewWidth * .75);
  return out;
}
