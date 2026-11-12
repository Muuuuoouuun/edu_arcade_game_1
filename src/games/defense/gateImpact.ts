import type { Effect } from './types.ts';
export const GATE_IMPACT_ATLAS={src:'/defense/models/forest-gate-impact-atlas.webp',width:2048,height:512} as const;
/** Only a committed breach can animate its own gate. Latest event restarts one response; no stacking. */
export function gateImpact(effects:readonly Effect[],outpost=false,reduced=false){
 if(reduced)return null;
 const target=outpost?'outpost':'village';let latest:Effect|undefined;
 for(const effect of effects)if(effect.kind==='breach'&&effect.targetGate===target&&(!latest||effect.id>latest.id))latest=effect;
 if(!latest)return null;
 const age=latest.age??((latest.maxLife??.6)-latest.life);
 if(!Number.isFinite(age)||age<0||age>=.6)return null;
 return {id:latest.id,frame:age<.12?1:age<.29?2:age<.46?3:0};
}
