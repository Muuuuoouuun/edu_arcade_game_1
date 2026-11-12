import {PerspectiveCamera,Vector3} from 'three';
import {heightAt,type Frontier} from './engine.ts';
export type CameraOptions={width:number;height:number;zoom:number;overview:boolean;reduced:boolean};
/** World-space camera policy: UI height changes the lens distance, never actor scale or combat ranges. */
export function cameraFrame(s:Frontier,o:CameraOptions){
 const height=Math.max(1,o.height),aspect=Math.max(1,o.width)/height;
 const landscape=height<430&&aspect>1.6,overview=o.overview||s.mode==='defense';
 const zoom=Math.max(.7,Math.min(1.5,o.zoom));
 const near=landscape?Math.max(12.1,Math.min(25,height/20)):aspect<1?30:25;
 const range=(overview?(s.mode==='defense'?(landscape?32.4:52):65):near*(s.mode==='command'?1.33:1))*zoom;
 // A lower action camera exposes the cliff faces and keeps the full 8m shockwave readable at default zoom.
 const slope=overview?.85:landscape?(s.mode==='solo'?1.6:1.35):.85;
 const lead=!overview&&!o.reduced&&s.hero.moving?1.4:0;
 const target=overview?new Vector3(s.mode==='defense'?-15:0,0,0):new Vector3(s.hero.x+Math.sin(s.hero.heading)*lead,heightAt(s.hero.x,s.hero.z)+1.1,s.hero.z+Math.cos(s.hero.heading)*lead);
 return{landscape,overview,range,target,offset:landscape?new Vector3(range*slope,range,0):new Vector3(0,range,range*slope)};
}
export class FrontierCameraRig{
 private center=new Vector3();private key='';
 private camera:PerspectiveCamera;
 constructor(camera:PerspectiveCamera){this.camera=camera;}
 update(s:Frontier,dt:number,o:CameraOptions){
  const frame=cameraFrame(s,o),key=`${frame.overview}:${frame.landscape}`;
  // A committed strike holds its framing so its target never drifts under the pointer.
  // View switches are deliberate. Never fly across the map, especially with reduced motion.
  if(this.key!==key){this.center.copy(frame.target);this.key=key;}
  else if(!s.paused&&!s.hero.attack)this.center.lerp(frame.target,o.reduced?1:1-Math.exp(-Math.max(0,dt)*8));
  this.camera.position.copy(this.center).add(frame.offset);this.camera.lookAt(this.center);this.camera.updateMatrixWorld();
  return frame;
 }
}
