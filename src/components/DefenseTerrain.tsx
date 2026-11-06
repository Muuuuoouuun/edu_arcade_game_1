import { memo, useEffect, useState } from 'react';
import { getStage, getPaths } from '../games/defense/data';
import { BRIDGE_FRONT, hasModeledBridge, loadTerrainAsset, terrainAssetPlan } from '../games/defense/terrainAssets';
import type { Point } from '../games/defense/types';
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);

export function useTerrainAsset(stageId:number):string|null {
 const plan=terrainAssetPlan(stageId);
 const [ready,setReady]=useState('');
 useEffect(()=>{
  let cancelled=false;const images:HTMLImageElement[]=[];
  const load=(src:string)=>new Promise<boolean>(resolve=>{
   const img=new Image();images.push(img);
   img.onload=()=>{img.onload=null;img.onerror=null;resolve(true);};
   img.onerror=()=>{img.onload=null;img.onerror=null;resolve(false);};
   img.src=src;
  });
  void loadTerrainAsset(stageId,load).then(src=>{if(!cancelled)setReady(src??'');});
  return()=>{cancelled=true;for(const img of images){img.onload=null;img.onerror=null;}};
 },[stageId]);
 return ready===plan.preferred||ready===plan.fallback?ready:null;
}

/** Front railing joins the same Y-sort as units, so feet pass behind it. */
export function BridgeFrontRail({y,asset}:{y:number;asset:string|null}) {
 if(hasModeledBridge(asset))return <g className="def-bridge-front" data-bridge-model="baked" data-sort-y={y+BRIDGE_FRONT.sortYOffset} pointerEvents="none" aria-hidden="true"><image href={BRIDGE_FRONT.src} x={BRIDGE_FRONT.x} y={y+BRIDGE_FRONT.yOffset} width={BRIDGE_FRONT.width} height={BRIDGE_FRONT.height}/></g>;
 return <g className="def-bridge-front" data-bridge-model="legacy" pointerEvents="none" aria-hidden="true">
  {[620,650,680,710,738].map(x=><g key={x}>
   <path d={`M${x-2} ${y+25}v-19h4v19Z`} fill="#694727" stroke="#392e20" strokeWidth=".8"/>
   <path d={`M${x-2} ${y+6}l2-2 3 1-1 3Z`} fill="#cfa567"/>
  </g>)}
  <path d={`M618 ${y+6}h124v4H618Z`} fill="#b98e54" stroke="#5f452b" strokeWidth="1"/>
  <path d={`M618 ${y+6}h124`} stroke="#e0bc81" strokeWidth="1.2"/>
 </g>;
}

const pathD=(path:Point[])=>{
 let d=`M${path[0].x} ${path[0].y}`;
 for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1],r=18,al=distance(a,p),bl=distance(p,b);d+=`L${p.x-(p.x-a.x)/al*r} ${p.y-(p.y-a.y)/al*r}Q${p.x} ${p.y} ${p.x+(b.x-p.x)/bl*r} ${p.y+(b.y-p.y)/bl*r}`;}
 return d+`L${path.at(-1)!.x} ${path.at(-1)!.y}`;
};
export const DefenseTerrain=memo(function DefenseTerrain({stageId,asset}:{stageId:number;asset:string|null}){
 const stage=getStage(stageId),snow=stage.region==='snow',paths=getPaths(stageId).slice(0,stage.expanded?2:1);
 return <g className="def-terrain" data-terrain-model={asset?'baked':'fallback'}>
  <defs><linearGradient id="def-road" x1="0" y1="0" x2="0" y2="1"><stop stopColor={snow?'#dde9e8':'#d9be89'}/><stop offset="1" stopColor={snow?'#b6c8ca':'#c1a26b'}/></linearGradient><pattern id="def-gravel" width="79" height="37" patternUnits="userSpaceOnUse"><ellipse cx="8" cy="6" rx="3" ry="1.4" fill="#a8895666"/><ellipse cx="33" cy="20" rx="4" ry="1.8" fill="#e8d39a99"/><ellipse cx="65" cy="30" rx="2" ry="1.2" fill="#b58f5c77"/><path d="M15 31l7-1M54 8l5 1" stroke="#a9895966" strokeWidth="1"/></pattern><mask id="def-ice-mask"><rect width="900" height="600" fill="black"/>{paths.map((p,i)=><path key={i} d={pathD(p)} fill="none" stroke="white" strokeWidth="44"/>)}</mask><pattern id="def-ice-lines" width="50" height="35" patternUnits="userSpaceOnUse"><path d="M0 15 30 0M13 35 50 12" stroke="#effbff" strokeWidth="2" opacity=".65"/></pattern></defs>
  <image className="def-terrain-backdrop" href={snow?'/defense/snow.png':'/defense/forest.png'} width="900" height="600" preserveAspectRatio="xMidYMid slice"/>
  {!asset?<>{paths.map((p,i)=><g key={i}><path d={pathD(p)} fill="none" stroke={snow?'#70929788':'#89744499'} strokeWidth="52" strokeLinejoin="round"/><path d={pathD(p)} fill="none" stroke="url(#def-road)" strokeWidth="45" strokeLinejoin="round"/><path d={pathD(p)} fill="none" stroke="url(#def-gravel)" strokeWidth="43" strokeLinejoin="round"/></g>)}
  {!snow?[430,...(stage.expanded?[235]:[])].map(y=><image key={y} href="/defense/bridge.png" x="620" y={y-52} width="180" height="103" preserveAspectRatio="none"/>):<g mask="url(#def-ice-mask)"><rect x="300" width="220" height="600" fill="#8fd5ee" opacity=".65"/><rect x="300" width="220" height="600" fill="url(#def-ice-lines)"/></g>}
  </>:<image href={asset} width="900" height="600" preserveAspectRatio="none"/>}
  {!stage.expanded?<g opacity=".9"><rect x="695" y="66" width="168" height="54" rx="9" fill="#1c463be0"/><text x="779" y="88" textAnchor="middle" fill="#f4ead3" fontSize="17" fontFamily="Jua">{snow?'산맥 피난소':'강 건너 마을'}</text><text x="779" y="108" textAnchor="middle" fill="#c4d8ba" fontSize="14">{snow?'2-4에서 길이 열립니다':'1-4에서 길이 열립니다'}</text></g>:null}
 </g>;
});

