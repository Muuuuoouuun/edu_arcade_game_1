import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createTerrainCamera, createTerrainScene, disposeTerrain } from '../games/defense/terrain3d';

/** Render static geometry once per stage/size; the SVG above owns controls and units. */
export function DefenseTerrain3D({stage,mode='battle',onReady}:{stage:number;mode?:'battle'|'camp';onReady?:(ready:boolean)=>void}){
 const holder=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const host=holder.current;if(!host)return;
  onReady?.(false);
  let renderer:THREE.WebGLRenderer|undefined,scene:THREE.Scene;
  try{
   renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
   scene=createTerrainScene(stage,mode);
  }catch{renderer?.dispose();return;}
  const camera=createTerrainCamera();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.domElement.setAttribute('aria-hidden','true');host.appendChild(renderer.domElement);
  let disposed=false;
  const draw=()=>{
   if(disposed)return;
   const {width,height}=host.getBoundingClientRect();if(width<=0||height<=0)return;
   const aspect=width/height;camera.left=-300*aspect;camera.right=300*aspect;camera.updateProjectionMatrix();
   try{renderer.setSize(width,height,false);renderer.render(scene,camera);onReady?.(true);}catch{onReady?.(false);}
  };
  const lost=(event:Event)=>{event.preventDefault();onReady?.(false);};
  const restored=()=>draw();
  renderer.domElement.addEventListener('webglcontextlost',lost);renderer.domElement.addEventListener('webglcontextrestored',restored);
  const observer=new ResizeObserver(draw);observer.observe(host);draw();
  return ()=>{disposed=true;observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.domElement.removeEventListener('webglcontextrestored',restored);disposeTerrain(scene);renderer.dispose();renderer.domElement.remove();};
 },[stage,mode,onReady]);
 return <div ref={holder} className={`def-terrain-3d def-terrain-3d-${mode}`} aria-hidden="true" data-terrain-renderer="webgl"/>;
}
