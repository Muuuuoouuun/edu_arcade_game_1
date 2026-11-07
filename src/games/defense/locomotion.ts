import { attackOctant } from './action.ts';
import { PET_WOLF_STRIDE } from './petWolfGait.ts';
import type { Point } from './types.ts';
import type { EnemyKind } from './types.ts';

export type Locomotion = { distance: number; speed: number; heading?: Point; gaitCycles?: number };

/** Visual travel belongs to simulation state, never render cadence or wall time. */
export function advanceLocomotion(previous: Locomotion, from: Point, to: Point, dt: number, moving: boolean, dashing = false): Locomotion {
  const travel = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    distance: previous.distance + (dashing ? 0 : travel),
    ...(travel > .001 ? { heading: { x: (to.x-from.x)/travel, y: (to.y-from.y)/travel } } : previous.heading ? { heading: previous.heading } : {}),
    speed: moving && !dashing && dt > 0 ? travel / dt : 0,
  };
}

/** Projected authored cycle length in board units, including the displayed actor size. */
export function petStride(heading:Point,size=73):number {
 const direction=attackOctant({x:0,y:0},heading);
 return direction===null||!Number.isFinite(size)||size<=0?0:PET_WOLF_STRIDE[direction]*size;
}

/** Accumulate visual cycles per actual segment so turns do not rephase all prior travel. */
export function advancePetLocomotion(previous:Locomotion,from:Point,to:Point,dt:number):Locomotion {
 const motion=advanceLocomotion(previous,from,to,dt,true),stride=petStride(motion.heading??{x:1,y:0});
 return {...motion,gaitCycles:(previous.gaitCycles??0)+(stride>0?(motion.distance-previous.distance)/stride:0)};
}

/** Gait cycles are authored at size 73; mobile enlargement lengthens the visible stride. */
export function petWalkFrame(heading:Point,distance:number,size=73,gaitCycles?:number):number {
 const stride=petStride(heading,size);if(stride<=0)return 0;
 const cycles=gaitCycles===undefined?distance/stride:gaitCycles*73/size;
 return Number.isFinite(cycles)?Math.floor((Math.max(0,cycles)+1e-9)*8)%8:0;
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

export const enemyStride = (kind: EnemyKind) => kind === 'stone' ? 64 : kind === 'frostwolf' ? 40 : kind === 'wood' ? 52 : 48;

/** Impulses slide a body; they must not wind its gait backwards or flip its facing. */
export function advanceEnemyGait(distance: number, before: number, after: number, dt: number, bracing: boolean): Locomotion {
  const travel = bracing ? 0 : Math.max(0, after - before);
  return { distance: distance + travel, speed: dt > 0 ? travel / dt : 0 };
}

export function enemyWalkFrame(kind: EnemyKind, distance: number): number {
  return Math.floor(Math.max(0, distance) % enemyStride(kind) / enemyStride(kind) * 8);
}
