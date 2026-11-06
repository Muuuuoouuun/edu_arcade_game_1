import type { Point } from './types.ts';

export type Locomotion = { distance: number; speed: number };

/** Visual travel belongs to simulation state, never render cadence or wall time. */
export function advanceLocomotion(previous: Locomotion, from: Point, to: Point, dt: number, moving: boolean, dashing = false): Locomotion {
  const travel = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    distance: previous.distance + (dashing ? 0 : travel),
    speed: moving && !dashing && dt > 0 ? travel / dt : 0,
  };
}

/** Keep facing on almost vertical paths; tiny horizontal drift is not a turn. */
export function movementFacing(previous: -1 | 1, from: Point, to: Point): -1 | 1 {
  const dx = to.x - from.x, travel = Math.hypot(dx, to.y - from.y);
  return travel > .001 && Math.abs(dx) > travel * .18 ? (dx < 0 ? -1 : 1) : previous;
}

export const WALK_STRIDE = 64;
export function walkFrame(distance: number): number {
  return Math.floor((Math.max(0, distance) % WALK_STRIDE) / WALK_STRIDE * 8);
}
