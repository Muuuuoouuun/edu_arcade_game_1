import type { CombatAttack, Point, Projectile } from './types.ts';

export const DASH_DAMAGE = 36;
export const DASH_IMPACT = 100;
export const DASH_HIT_RADIUS = 28;

/** Screen-space clockwise octants: east=0, south=2, west=4, north=6. */
export function attackOctant(from:Point,to:Point):number|null {
  const dx=to.x-from.x,dy=to.y-from.y;
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<.5)return null;
  return (Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8;
}

/** Visual samples follow simulation phases; the contact pose cannot precede hitAt.
 * Keep neutral bookends so movement/idle does not snap straight to an overhead hammer.
 */
export function dwarfHammerFrame(a:Pick<CombatAttack,'elapsed'|'hitAt'|'duration'>,reduced=false):number {
  if(![a.elapsed,a.hitAt,a.duration].every(Number.isFinite)||a.hitAt<=0||a.duration<=a.hitAt||a.elapsed<0||a.elapsed>=a.duration)return 0;
  if(a.elapsed<a.hitAt){
    if(reduced)return 0;
    const load=a.elapsed/a.hitAt;
    return load<.1?0:load<.35?1:load<.65?2:3;
  }
  const recovery=(a.elapsed-a.hitAt)/(a.duration-a.hitAt);
  if(recovery>=.94)return 0;
  return reduced?4:recovery<.22?4:recovery<.5?5:recovery<.78?6:7;
}

export function projectileScreenPosition(p:Projectile,launchOffset:Point={x:0,y:0}) {
  const blend=1-Math.max(0,Math.min(1,p.progress)),duration=Math.max(.1,p.duration);
  const offsetSpeed=p.progress>=0&&p.progress<1?1/duration:0;
  const heightSpeed=p.arcHeight?4*p.arcHeight*(1-2*p.progress)/duration:0;
  return {x:p.position.x+launchOffset.x*blend,y:p.position.y-27-p.height+launchOffset.y*blend,
    angle:Math.atan2(p.velocity.y-heightSpeed-launchOffset.y*offsetSpeed,p.velocity.x-launchOffset.x*offsetSpeed)*180/Math.PI};
}

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
