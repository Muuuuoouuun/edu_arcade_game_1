import { getStage } from './data.ts';

export const BRIDGE_FRONT={src:'/defense/terrain/forest-bridge-front.webp',x:596,yOffset:-46,width:164,height:100,sortYOffset:25} as const;
export function terrainAssetPlan(stageId:number){
 const stage=getStage(stageId),id=`${stage.region}-${stage.expanded?'expanded':'single'}`;
 const fallback=`/defense/terrain/${id}.webp`;
 return {fallback,preferred:stage.region==='forest'?`/defense/terrain/${id}-bridge.webp`:fallback,front:stage.region==='forest'?BRIDGE_FRONT.src:null};
}
export function hasModeledBridge(asset:string|null){return asset==='/defense/terrain/forest-single-bridge.webp'||asset==='/defense/terrain/forest-expanded-bridge.webp';}
/** Never expose the open river cutout without its matching front layer. */
export async function loadTerrainAsset(stageId:number,load:(src:string)=>Promise<boolean>):Promise<string|null>{
 const plan=terrainAssetPlan(stageId);
 if(plan.front){
  const complete=await Promise.all([load(plan.preferred),load(plan.front)]);
  if(complete.every(Boolean))return plan.preferred;
 }
 return await load(plan.fallback)?plan.fallback:null;
}
