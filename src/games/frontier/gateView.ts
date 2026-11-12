import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
export const GATE_IMPACT_DURATION=.55;
const leafKeys=[[0,0],[5/60,.15],[12/60,-.045],[21/60,.018],[.55,0]];
const lampKeys=[[0,0],[3/60,0],[9/60,.30],[19/60,-.11],[27/60,.04],[.55,0]];
function sample(keys:number[][],t:number){for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const a=keys[i-1],b=keys[i],f=(t-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*f;}return 0;}
/** Pure presentation clock: no HP, collision, attack timing or reward changes. */
export function gateImpact(time:number,hitAt:number|undefined,hp:number,open:boolean,reduced:boolean){
 const age=hitAt===undefined||!Number.isFinite(hitAt)||!Number.isFinite(time)?Infinity:Math.max(0,time-hitAt),breached=hp<=0,active=age<GATE_IMPACT_DURATION&&!breached;
 return {age,active,breached,open:open||breached,pose:active&&!reduced?age:0,opacity:breached?.35:active?.75*(1-age/GATE_IMPACT_DURATION):0,scale:active&&!reduced?1+.16*age/GATE_IMPACT_DURATION:1};
}
export class FrostGateView{
 readonly root=new THREE.Group();private model=new THREE.Group();private leaves:THREE.Object3D[]=[];private lamps:THREE.Object3D[]=[];
 readonly ring:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
 private resources=new Set<THREE.BufferGeometry|THREE.Material>();private mixer?:THREE.AnimationMixer;private action?:THREE.AnimationAction;private base:THREE.Quaternion[]=[];
 loaded=false;state=gateImpact(0,undefined,180,false,false);
 constructor(){
  const box=(parent:THREE.Object3D,name:string,x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.8}));m.name=name;m.position.set(x,y,z);parent.add(m);return m;};
  const fixed=new THREE.Group();fixed.name='gate-fixed-stone';this.model.add(fixed);
  for(const side of[-1,1]){box(fixed,'pillar',side*2.35,2,0,1.5,4,1.7,'#718ca5');box(fixed,'snow',side*2.35,4.15,0,1.9,.25,2,'#d4e8ed');}
  box(fixed,'lintel',0,4,0,3.7,.5,1.65,'#a1b8c7');
  for(const[i,side]of[-1,1].entries()){
   const leaf=new THREE.Group();leaf.name=`gate-leaf-${i}`;leaf.position.set(side*1.48,.08,0);this.model.add(leaf);this.leaves.push(leaf);
   box(leaf,'timber',-side*.73,1.3,0,1.46,2.6,.32,'#946d46');for(const y of[.5,1.7])box(leaf,'strap',-side*.73,y,.2,1.46,.16,.1,'#30475d');
   const lamp=new THREE.Group();lamp.name=`gate-lantern-${i}`;lamp.position.set(side*2.35,1.65,1.3);this.model.add(lamp);this.lamps.push(lamp);box(lamp,'lantern',0,-.49,0,.4,.55,.4,'#ffca71');
  }
  this.model.scale.setScalar(7/6.65);this.root.add(this.model);
  this.ring=new THREE.Mesh(new THREE.RingGeometry(3.2,3.65,32),new THREE.MeshBasicMaterial({color:'#ffcf77',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));this.ring.rotation.x=-Math.PI/2;this.ring.position.y=.09;this.root.add(this.ring);this.track(this.root);
 }
 private track(root:THREE.Object3D){root.traverse(o=>{if(o instanceof THREE.Mesh){this.resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])this.resources.add(m);o.castShadow=o.name==='gate-fixed-stone'||o.name==='pillar';o.receiveShadow=true;}});}
 private discard(root:THREE.Object3D){const used=new Set<THREE.BufferGeometry|THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){used.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])used.add(m);}});for(const r of used){r.dispose();this.resources.delete(r);}}
 setModel(g:GLTF){
  const leaves=[0,1].map(i=>g.scene.getObjectByName(`gate-leaf-${i}`)),lamps=[0,1].map(i=>g.scene.getObjectByName(`gate-lantern-${i}`)),clip=g.animations.find(c=>c.name==='frost-gate-impact');
  if(!leaves.every(Boolean)||!lamps.every(Boolean)||!g.scene.getObjectByName('gate-fixed-stone')||!clip||Math.abs(clip.duration-GATE_IMPACT_DURATION)>1e-5){this.discard(g.scene);throw Error('Incomplete frost gate motion');}
  this.mixer?.stopAllAction();if(this.mixer)this.mixer.uncacheRoot(this.model);this.discard(this.model);this.root.remove(this.model);this.model=g.scene;const bounds=new THREE.Box3().setFromObject(this.model);this.model.scale.setScalar(7/6.65);this.model.position.y=-bounds.min.y*7/6.65;this.root.add(this.model);this.leaves=leaves as THREE.Object3D[];this.lamps=lamps as THREE.Object3D[];this.base=this.leaves.map(o=>o.quaternion.clone());this.track(this.model);
  this.mixer=new THREE.AnimationMixer(this.model);this.action=this.mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);this.action.clampWhenFinished=true;this.action.play();this.loaded=true;
 }
 update(time:number,hitAt:number|undefined,hp:number,open:boolean,reduced:boolean){
  this.state=gateImpact(time,hitAt,hp,open,reduced);const s=this.state;
  // Remove our passage offset first: Three may skip writing an unchanged sampled quaternion.
  if(this.mixer&&this.action){this.leaves.forEach((o,i)=>o.quaternion.copy(this.base[i]));this.action.enabled=true;this.action.paused=false;this.mixer.setTime(s.pose);this.leaves.forEach((o,i)=>this.base[i].copy(o.quaternion));}
  else{this.leaves.forEach((o,i)=>o.rotation.y=(i===0?-1:1)*sample(leafKeys,s.pose));this.lamps.forEach(o=>o.rotation.x=sample(lampKeys,s.pose));}
  if(s.open)this.leaves.forEach((o,i)=>o.rotateY((i===0?-1:1)*(s.breached?Math.PI*.38:Math.PI/2)));
  this.ring.visible=s.opacity>0;this.ring.material.opacity=s.opacity;this.ring.material.color.set(s.breached?'#d56b61':'#ffcf77');this.ring.scale.setScalar(s.scale);
 }
 get angles(){return this.leaves.map(o=>o.rotation.y);}
 dispose(){this.mixer?.stopAllAction();if(this.mixer)this.mixer.uncacheRoot(this.model);for(const r of this.resources)r.dispose();this.resources.clear();}
}
