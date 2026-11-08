/** Simulation seconds; the authored GLB places club contact at 0.28s. */
export const WOOD_ATTACK={contact:.28,duration:.60,interval:1,reach:1.8,hitReach:2.2,halfArc:.65,entry:.10} as const;
export type WoodAttack={time:number;target:'hero'|'core';heading:number;hit:boolean;entryDistance:number};
export function inWoodStrike(x:number,z:number,heading:number,target:{x:number;z:number}){
 const dx=target.x-x,dz=target.z-z,d=Math.hypot(dx,dz);
 return d<=WOOD_ATTACK.hitReach&&(d<.05||(dx*Math.sin(heading)+dz*Math.cos(heading))/d>=Math.cos(WOOD_ATTACK.halfArc));
}
