import { useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { batchTerrain, createTerrainCamera, createTerrainScene, disposeTerrain } from '../games/defense/terrain3d';
import { createBattleActors3D } from '../games/defense/battleActors3d';
import type { DefenseState } from '../games/defense/types';

type BattleView = {state:DefenseState;unit:number;reduced:boolean};
/** Terrain and supported GLB actors share one renderer. The SVG above retains
 * controls, labels, effects and fallback bodies for unloaded/unsupported units. */
export function DefenseTerrain3D({stage,mode='battle',onReady,battle,onActorsReady}:{stage:number;mode?:'battle'|'camp';onReady?:(ready:boolean)=>void;battle?:BattleView;onActorsReady?:(keys:string[])=>void}){
 const holder=useRef<HTMLDivElement>(null);
 const latestBattle=useRef(battle),redraw=useRef<()=>void>(()=>{});
 latestBattle.current=battle;
 useLayoutEffect(()=>{redraw.current();},[battle]);
 useEffect(()=>{
  const host=holder.current;if(!host)return;
  let ready=false,actorKey='';
  const report=(value:boolean,keys:string[]=[])=>{
   if(value!==ready){ready=value;onReady?.(value);}
   const key=keys.join(',');if(key!==actorKey){actorKey=key;onActorsReady?.(keys);}
   host.dataset.modelCount=String(keys.length);host.dataset.modelKeys=key;
  };
  onReady?.(false);onActorsReady?.([]);
  let renderer:THREE.WebGLRenderer|undefined,scene:THREE.Scene;
  try{
   renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
   scene=createTerrainScene(stage,mode);
   if(mode==='battle')batchTerrain(scene);
  }catch{renderer?.dispose();return;}
  const camera=createTerrainCamera();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.domElement.setAttribute('aria-hidden','true');host.appendChild(renderer.domElement);
  let disposed=false,contextLost=false,width=0,height=0;
  const actors=mode==='battle'?createBattleActors3D(scene,{onLoad:()=>draw()}):undefined;
  const draw=()=>{
   if(disposed||contextLost||width<=0||height<=0)return;
   const view=latestBattle.current;
   try{
    const keys=view&&actors?actors.sync(view.state,view.unit,view.reduced):[];
    renderer.render(scene,camera);report(true,keys);
    if(import.meta.env.DEV){host.dataset.renderCalls=String(renderer.info.render.calls);host.dataset.renderTriangles=String(renderer.info.render.triangles);host.dataset.actorStates=JSON.stringify(actors?.diagnostics()??[]);}
   }catch{report(false);}
  };
  const resize=()=>{
   const next=host.getBoundingClientRect();width=next.width;height=next.height;
   if(width<=0||height<=0)return;
   camera.left=-300*width/height;camera.right=300*width/height;camera.updateProjectionMatrix();
   try{renderer.setSize(width,height,false);draw();}catch{report(false);}
  };
  const lost=(event:Event)=>{event.preventDefault();contextLost=true;report(false);};
  const restored=()=>{contextLost=false;resize();};
  renderer.domElement.addEventListener('webglcontextlost',lost);renderer.domElement.addEventListener('webglcontextrestored',restored);
  redraw.current=draw;
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  return ()=>{disposed=true;redraw.current=()=>{};observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.domElement.removeEventListener('webglcontextrestored',restored);actors?.dispose();disposeTerrain(scene);renderer.dispose();renderer.domElement.remove();};
 },[stage,mode,onReady,onActorsReady]);
 return <div ref={holder} className={`def-terrain-3d def-terrain-3d-${mode}`} aria-hidden="true" data-terrain-renderer="webgl"/>;
}
