import { METAL_SOLDIER_STRIDE } from './metalSoldierGait.ts';
import { attackOctant } from './action.ts';
import { FROST_WOLF_STRIDE } from './frostWolfGait.ts';
import { PET_WOLF_STRIDE } from './petWolfGait.ts';
import type { Point } from './types.ts';
import type { EnemyKind } from './types.ts';

export type Locomotion = { distance: number; speed: number; heading?: Point; gaitCycles?: number; settle?: { frame: number; elapsed: number; heading: Point } };

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

/** Frost wolf cycles use the same camera projection as its baked directional poses. */
export function frostWolfStride(heading:Point,size=73):number {
 const direction=attackOctant({x:0,y:0},heading);
 return direction===null||!Number.isFinite(size)||size<=0?0:FROST_WOLF_STRIDE[direction]*size;
}

/** Only forward locomotion advances the paws; knockback preserves the last heading. */
export function advanceFrostWolfGait(cycles:number,heading:Point|undefined,from:Point,to:Point,travel:number):{walkCycles:number;walkHeading?:Point} {
 const length=Math.hypot(to.x-from.x,to.y-from.y);
 if(!Number.isFinite(travel)||travel<=0||length<=.001)return {walkCycles:cycles,walkHeading:heading};
 const next={x:(to.x-from.x)/length,y:(to.y-from.y)/length};
 return {walkCycles:cycles+travel/frostWolfStride(next),walkHeading:next};
}

export function frostWolfWalkFrame(heading:Point,distance:number,size=73,cycles?:number):number {
 const stride=frostWolfStride(heading,size);if(stride<=0)return 0;
 const phase=cycles===undefined?distance/stride:cycles*73/size;
 return Number.isFinite(phase)?Math.floor((Math.max(0,phase)+1e-9)*8)%8:0;
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

// The golem's support foot travels 11.0845 board units in each half-cycle
// at size 68 in the shared orthographic camera. Larger sprites need a longer step.
export const STONE_GOLEM_STRIDE = 22.16903;
// Ice knight's planted foot travel at the same 68-unit display size.
export const ICE_KNIGHT_STRIDE = 24.83730;
export const enemyStride = (kind: EnemyKind, size = 68) => kind === 'stone' || kind === 'ice' ? (kind === 'stone' ? STONE_GOLEM_STRIDE : ICE_KNIGHT_STRIDE) * (Number.isFinite(size) && size > 0 ? size / 68 : 1) : kind === 'frostwolf' ? 40 : kind === 'wood' ? 52 : 48;

/** The new metal gait uses camera-projected support-foot travel; legacy fallback keeps its old cadence. */
export function metalWalkFrame(distance:number,size=68):number {
 const stride=METAL_SOLDIER_STRIDE*(Number.isFinite(size)&&size>0?size/68:1);
 return Math.floor((Math.max(0,distance)/stride+1e-9)*8)%8;
}

/** Impulses slide a body; they must not wind its gait backwards or flip its facing. */
export function advanceEnemyGait(distance: number, before: number, after: number, dt: number, bracing: boolean): Locomotion {
  const travel = bracing ? 0 : Math.max(0, after - before);
  return { distance: distance + travel, speed: dt > 0 ? travel / dt : 0 };
}

export function enemyWalkFrame(kind: EnemyKind, distance: number, size = 68): number {
  const stride = enemyStride(kind, size), travelled = Math.max(0, distance);
  return kind === 'stone' || kind === 'ice' ? Math.floor((travelled / stride + 1e-9) * 8) % 8 : Math.floor((travelled % stride) / stride * 8);
}

export const MAGE_STOP_DURATION = .24;
/** A visual transition only: movement, hit timing and the accumulated stride stay unchanged. */
export function advanceMageLocomotion(previous:Locomotion,from:Point,to:Point,dt:number,moving:boolean,dashing=false):Locomotion {
 const next=advanceLocomotion(previous,from,to,dt,moving,dashing);
 if(moving||dashing)return next;
 const settle=previous.speed>.5?{frame:walkFrame(previous.distance),elapsed:0,heading:previous.heading??{x:1,y:0}}:
  previous.settle?{...previous.settle,elapsed:previous.settle.elapsed+Math.max(0,dt)}:undefined;
 return settle&&settle.elapsed<MAGE_STOP_DURATION?{...next,settle}:next;
}
