import type { SpriteAsset } from '../defense/art.ts';
import type { LegionPhase, Soldier } from './types.ts';
import { SHIELD_WALK_FRAME } from './shieldWalkFrame.ts';
import { legionShieldAsset } from './shieldMotion.ts';

export const LEGION_SHIELD_WALK_ATLAS='/defense/models/legion-shield-walk-atlas.webp';
type Tracked = {x:number;y:number;distance:number;moving:boolean};
export type ShieldMotionState = {time:number;phase:LegionPhase;units:Map<number,Tracked>};

/** Visual state samples simulation positions, never wall time or render calls.
 * Entering/leaving a wave resets tracking so instant home reposition is not walking.
 */
export function advanceShieldMotion(previous:ShieldMotionState|null,time:number,phase:LegionPhase,units:readonly Soldier[]):ShieldMotionState {
 const sameTick=previous?.phase===phase&&previous.time===time;
 const advancing=previous?.phase==='wave'&&phase==='wave'&&time>previous.time;
 const next=new Map<number,Tracked>();
 for(const unit of units){
  if(unit.kind!=='shield')continue;
  const old=previous?.units.get(unit.id);
  if(sameTick&&old){next.set(unit.id,old);continue;}
  const d=advancing&&old?Math.hypot(unit.x-old.x,unit.y-old.y):0;
  next.set(unit.id,{x:unit.x,y:unit.y,distance:advancing&&old?old.distance+d:0,moving:d>.001});
 }
 return {time,phase,units:next};
}

/** Distance and size use the same projected planted-foot stride as the 3D model. */
export function legionShieldWalkFrame(distance:number,size:number):number {
 if(!Number.isFinite(distance)||!Number.isFinite(size)||size<=0)return 0;
 return Math.floor((Math.max(0,distance)/(SHIELD_WALK_FRAME.stridePerSize*size)+1e-9)*8)%8;
}
export function legionShieldWalkAsset(distance:number,size:number):SpriteAsset {
 const {width,height,crop,groundY,displayScale}=SHIELD_WALK_FRAME;
 const frame=legionShieldWalkFrame(distance,size);
 return {src:LEGION_SHIELD_WALK_ATLAS,width:width*8,height,viewBox:`${frame*width+crop[0]} ${crop[1]} ${crop[2]} ${crop[3]}`,groundY,displayScale};
}

/** Damage-driven bash always wins over movement; missing walk art keeps the existing model. */
export function legionShieldDisplayAsset(attackAge:number|null,reduced:boolean,motion:{moving:boolean;distance:number}|undefined,walkReady:boolean,size:number):SpriteAsset {
 return attackAge===null&&!reduced&&motion?.moving&&walkReady?legionShieldWalkAsset(motion.distance,size):legionShieldAsset(attackAge,reduced);
}
