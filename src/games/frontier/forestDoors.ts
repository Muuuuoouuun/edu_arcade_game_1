import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {gateImpact,GATE_IMPACT_DURATION} from './gateView.ts';

/** Two independent leaves reuse the single battlefield scene and simulation clock. */
export class ForestDoors {
 readonly root=new THREE.Group();private shell=new THREE.Group();private model=new THREE.Group();
 private leaves:THREE.Object3D[]=[];private base:THREE.Quaternion[]=[];private mixer?:THREE.AnimationMixer;private action?:THREE.AnimationAction;private ray=new THREE.Raycaster();private direction=new THREE.Vector3();
 private resources=new Set<THREE.BufferGeometry|THREE.Material>();readonly ring:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
 loaded=false;faded=false;state=gateImpact(0,undefined,180,false,false);
 constructor(){
  for(const [i,side] of [-1,1].entries()){
   const leaf=new THREE.Group();leaf.name=`forest-leaf-${i}`;leaf.position.set(side*1.17,-.0477514,0);this.model.add(leaf);this.leaves.push(leaf);
   const panel=new THREE.Mesh(new THREE.BoxGeometry(1.16,2.45,.28),new THREE.MeshStandardMaterial({color:'#8b5936',roughness:.8}));panel.position.set(-side*.58,1.225,0);leaf.add(panel);
   if(i===0){const stile=new THREE.Mesh(new THREE.BoxGeometry(.1,2.45,.36),new THREE.MeshStandardMaterial({color:'#34443c',roughness:.7}));stile.position.set(1.16,1.225,0);leaf.add(stile);}
   for(const y of [.52,1.5,2.17]){const strap=new THREE.Mesh(new THREE.BoxGeometry(1.16,.13,.36),new THREE.MeshStandardMaterial({color:'#34443c',roughness:.7}));strap.position.set(-side*.58,y,0);leaf.add(strap);}
  }
  this.shell.scale.setScalar(1.23333764);this.shell.position.y=.058894;this.root.add(this.shell);this.shell.add(this.model);
  this.ring=new THREE.Mesh(new THREE.RingGeometry(3.2,3.65,32),new THREE.MeshBasicMaterial({color:'#ffcf77',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));this.ring.rotation.x=-Math.PI/2;this.ring.position.y=.09;this.root.add(this.ring);this.track(this.root);
 }
 private track(root:THREE.Object3D){root.traverse(o=>{if(o instanceof THREE.Mesh){this.resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])this.resources.add(m);o.castShadow=false;o.receiveShadow=true;}});}
 private discard(root:THREE.Object3D){const used=new Set<THREE.BufferGeometry|THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){used.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])used.add(m);}});for(const r of used){r.dispose();this.resources.delete(r);}}
 align(scale:number,y:number){this.shell.scale.setScalar(scale);this.shell.position.y=y;}
 setModel(g:GLTF){
  const leaves=[0,1].map(i=>g.scene.getObjectByName(`forest-leaf-${i}`)),clip=g.animations.find(c=>c.name==='forest-door-impact');
  if(!leaves.every(Boolean)||!clip||Math.abs(clip.duration-GATE_IMPACT_DURATION)>1e-5){this.discard(g.scene);throw Error('Incomplete forest door motion');}
  this.mixer?.stopAllAction();if(this.mixer)this.mixer.uncacheRoot(this.model);this.discard(this.model);this.shell.remove(this.model);this.model=g.scene;this.shell.add(this.model);this.leaves=leaves as THREE.Object3D[];this.base=this.leaves.map(o=>o.quaternion.clone());this.track(this.model);
  this.mixer=new THREE.AnimationMixer(this.model);this.action=this.mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);this.action.clampWhenFinished=true;this.action.play();this.loaded=true;this.faded=false;
 }
 update(time:number,hitAt:number|undefined,hp:number,open:boolean,reduced:boolean){
  this.state=gateImpact(time,hitAt,hp,open,reduced);const s=this.state;
  if(this.mixer&&this.action){this.leaves.forEach((o,i)=>o.quaternion.copy(this.base[i]));this.action.enabled=true;this.action.paused=false;this.mixer.setTime(s.pose);this.leaves.forEach((o,i)=>this.base[i].copy(o.quaternion));}
  else{const t=s.pose;const angle=t<5/60?.15*t/(5/60):t<12/60?.15+(-.195)*(t-5/60)/(7/60):t<21/60?-.045+.063*(t-12/60)/(9/60):t<.55?.018*(.55-t)/(.55-21/60):0;this.leaves.forEach((o,i)=>o.rotation.y=(i===0?-1:1)*angle);}
  if(s.open)this.leaves.forEach((o,i)=>o.rotateY((i===0?-1:1)*(s.breached?Math.PI*.38:Math.PI/2)));
  this.ring.visible=s.opacity>0;this.ring.material.opacity=s.opacity;this.ring.material.color.set(s.breached?'#d56b61':'#ffcf77');this.ring.scale.setScalar(s.scale);
 }
 /** Fade only when an open door lies between the camera and the hero's center. */
 updateOcclusion(camera:THREE.Camera|null,target?:THREE.Vector3){
  let blocked=false;
  if(camera&&target&&this.state.open){this.model.updateWorldMatrix(true,true);this.direction.copy(target).sub(camera.position);const distance=this.direction.length();if(distance>.15){this.ray.set(camera.position,this.direction.multiplyScalar(1/distance));this.ray.far=distance-.15;blocked=this.ray.intersectObject(this.model,true).length>0;}}
  if(blocked===this.faded)return;this.faded=blocked;
  const materials=new Set<THREE.Material>();this.model.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
  for(const material of materials){material.transparent=blocked;material.opacity=blocked?.18:1;material.depthWrite=!blocked;material.needsUpdate=true;}
 }
 get angles(){return this.leaves.map(o=>o.rotation.y);}
 dispose(){this.mixer?.stopAllAction();if(this.mixer)this.mixer.uncacheRoot(this.model);for(const r of this.resources)r.dispose();this.resources.clear();}
}
