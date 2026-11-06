import type { Point } from './types.ts';

export const DASH_DAMAGE = 36;
export const DASH_IMPACT = 100;
export const DASH_HIT_RADIUS = 28;

/** Swept collision prevents a fast dash skipping targets between simulation steps. */
export function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy;
  const t=length===0?0:Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy)/length));
  return Math.hypot(point.x-from.x-t*dx,point.y-from.y-t*dy);
}

/** Light enemies leave streaks; heavy enemies visibly brace close to the ground. */
export function knockbackPresentation(velocity: number) {
  const strength=Math.max(0,Math.min(1,velocity/110));
  return { strength, bracing:velocity>7&&velocity<35, streak:velocity>=35 };
}
