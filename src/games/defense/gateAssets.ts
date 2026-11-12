import { GATE_ART } from './gateArt.ts';
import { FOREST_GATE } from './forestGateModel.ts';
import type { DefenseThemeId } from './themes.ts';
export type GateAssetMode='modeled'|'illustrated'|'fallback';
export function gateModelEligible(theme:DefenseThemeId,snow:boolean){return theme==='verdant'&&!snow;}
/** Keep the existing snowy and other themed gates until their matching models exist. */
export async function loadGateAsset(theme:DefenseThemeId,snow:boolean,load:(src:string)=>Promise<boolean>):Promise<GateAssetMode>{
 if(gateModelEligible(theme,snow)&&await load(FOREST_GATE.src))return 'modeled';
 return await load(GATE_ART[theme].src)?'illustrated':'fallback';
}
export function gatePlacement(outpost=false){
 const scale=outpost?FOREST_GATE.outpost_scale:1,y=outpost?131:318;
 return {x:outpost?840:830,y,scale,sortY:y+FOREST_GATE.depth_offset*scale};
}
