import{BEACON_CAPTURE}from'./beacon.ts';
import * as THREE from 'three';
import type{GLTF}from'three/addons/loaders/GLTFLoader.js';
export const BEACON_RADIUS=BEACON_CAPTURE.radius;
/** Capture progress is simulation-owned. No wall-clock animation or per-unit renderer. */
export class BeaconView{
 readonly root=new THREE.Group();readonly ring:THREE.InstancedMesh;
 private model=new THREE.Group();private mixer?:THREE.AnimationMixer;private action?:THREE.AnimationAction;
 private hinges:THREE.Object3D[]=[];private crystal:THREE.Mesh;private resources=new Set<THREE.BufferGeometry|THREE.Material>();
 loaded=false;progress=0;pose=0;
 constructor(){
  const stone=new THREE.MeshStandardMaterial({color:'#8d9e92',roughness:.85}),brass=new THREE.MeshStandardMaterial({color:'#c6a260',roughness:.65});
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material,y:number)=>{const mesh=new THREE.Mesh(geo,mat);mesh.position.y=y;this.model.add(mesh);return mesh;};
  add(new THREE.CylinderGeometry(1.7,1.8,.3,8),stone,.15).castShadow=true;
  add(new THREE.CylinderGeometry(.9,1.1,2.0,8),stone,1.3).castShadow=true;
  add(new THREE.CylinderGeometry(1.3,1.3,.2,8),brass,2.4);
  const arm=new THREE.BoxGeometry(.3,1.7,.4);
  for(let i=0;i<4;i++){const h=new THREE.Group(),a=i*Math.PI/2;h.position.set(Math.cos(a)*1.12,2.53,Math.sin(a)*1.12);h.rotation.y=-a;const m=new THREE.Mesh(arm,brass);m.position.set(-.22,.8,0);h.add(m);this.model.add(h);this.hinges.push(h);}
  this.crystal=add(new THREE.OctahedronGeometry(.66),new THREE.MeshStandardMaterial({color:'#ffc966',emissive:'#ffc966',emissiveIntensity:.35}),3.25);this.crystal.scale.y=1.65;
  this.root.add(this.model);this.track(this.model);
  this.ring=new THREE.InstancedMesh(new THREE.RingGeometry(3.86,BEACON_RADIUS,1,1,.025,Math.PI*2/32-.05),new THREE.MeshBasicMaterial({transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide}),32);
  const matrix=new THREE.Object3D();for(let i=0;i<32;i++){matrix.rotation.set(-Math.PI/2,0,i*Math.PI*2/32);matrix.position.y=.09;matrix.updateMatrix();this.ring.setMatrixAt(i,matrix.matrix);this.ring.setColorAt(i,new THREE.Color('#b3aa89'));}
  this.root.add(this.ring);this.track(this.ring);this.update(0,false);
 }
 private track(o:THREE.Object3D){o.traverse(n=>{if(n instanceof THREE.Mesh){this.resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])this.resources.add(m);n.receiveShadow=true;}});}
 setModel(gltf:GLTF){
  const hinges=Array.from({length:4},(_,i)=>gltf.scene.getObjectByName('crown-hinge-'+i)),core=gltf.scene.getObjectByName('signal-crystal');
  if(hinges.some(h=>!h)||!(core instanceof THREE.Mesh)||gltf.animations.length!==1||gltf.animations[0].name!=='beacon-capture'){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});throw Error('Incomplete beacon capture model');}
  const oldResources=new Set<THREE.BufferGeometry|THREE.Material>();this.model.traverse(o=>{if(o instanceof THREE.Mesh){oldResources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])oldResources.add(m);}});for(const r of oldResources){r.dispose();this.resources.delete(r);}
  this.root.remove(this.model);this.model=gltf.scene;this.root.add(this.model);this.hinges=hinges as THREE.Object3D[];this.crystal=core;this.track(this.model);
  this.model.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=o.name==='fixed-foundation';});
  this.mixer=new THREE.AnimationMixer(this.model);this.action=this.mixer.clipAction(gltf.animations[0]).setLoop(THREE.LoopOnce,1);this.action.clampWhenFinished=true;this.action.play();this.loaded=true;
 }
 update(progress:number,reduced:boolean){
  this.progress=Number.isFinite(progress)?THREE.MathUtils.clamp(progress,0,1):0;
  this.pose=reduced?(this.progress===1?1:0):this.progress;
  if(this.mixer&&this.action){this.action.enabled=true;this.action.paused=false;this.mixer.setTime(this.pose*this.action.getClip().duration);}
  else{for(const h of this.hinges)h.rotation.z=-this.pose*52*Math.PI/180;this.crystal.position.y=3.25+.4*this.pose;}
  const material=this.crystal.material as THREE.MeshStandardMaterial;material.color.set(this.progress===1?'#67f2cc':'#ffc966');material.emissive.copy(material.color);
  const filled=Math.floor(this.progress*32+1e-8),color=new THREE.Color();for(let i=0;i<32;i++)this.ring.setColorAt(i,color.set(i<filled?'#67f2cc':'#b3aa89'));this.ring.instanceColor!.needsUpdate=true;
 }
 dispose(){this.mixer?.stopAllAction();if(this.mixer)this.mixer.uncacheRoot(this.model);for(const r of this.resources)r.dispose();this.ring.dispose();}
}
