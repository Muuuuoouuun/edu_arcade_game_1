import {Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,OctahedronGeometry,CylinderGeometry,Object3D,DoubleSide,type BufferGeometry,type Material} from 'three';
import {heightAt,type Point} from './engine.ts';
import {RELIC_PICKUP} from './relic.ts';
import {createShockwaveGeometry,projectShockwave} from './effectsView.ts';

/** A partial model must never replace the playable fallback. */
export function validRelicModel(model:Object3D){
 for(const name of ['relic-base','relic-core']){const part=model.getObjectByName(name);if(!part)return false;let surface=false;part.traverse(o=>{if(o instanceof Mesh&&o.geometry.getAttribute('position')?.count>0)surface=true;});if(!surface)return false;}
 const p=model.getObjectByName('relic-core')!.position;return Math.abs(p.x)<.001&&Math.abs(p.y-.55)<.001&&Math.abs(p.z)<.001;
}

/** One world-space pickup; all clocks and reward rules come from the simulation. */
export class RelicView {
 readonly root=new Group();readonly ring:Mesh;readonly anchor=new Group();readonly point:Point;
 private model:Object3D=new Group();private core:Object3D;private fallback=new Set<BufferGeometry|Material>();
 loaded=false;claimed=false;near=false;pose=1;
 constructor(point:Point){
  this.point={...point};this.anchor.position.set(point.x,heightAt(point.x,point.z),point.z);this.root.add(this.anchor);
  const stone=new MeshStandardMaterial({color:'#476168',roughness:.9}),gem=new MeshStandardMaterial({color:'#42c1b8',emissive:'#22675f',emissiveIntensity:.3,roughness:.4});
  const base=new Mesh(new CylinderGeometry(1.05,1.12,.3,8),stone);base.position.y=.15;this.model.add(base);
  const pivot=new Group();pivot.position.y=.55;const crystal=new Mesh(new OctahedronGeometry(.7),gem);crystal.position.y=.65;crystal.scale.y=1.35;pivot.add(crystal);this.model.add(pivot);this.core=pivot;
  this.fallback.add(base.geometry);this.fallback.add(stone);this.fallback.add(crystal.geometry);this.fallback.add(gem);this.anchor.add(this.model);
  const geometry=createShockwaveGeometry(32);projectShockwave(geometry,point,1,RELIC_PICKUP.radius-.14,RELIC_PICKUP.radius);
  this.ring=new Mesh(geometry,new MeshBasicMaterial({color:'#e5ba61',transparent:true,opacity:.82,depthWrite:false,side:DoubleSide,forceSinglePass:true}));this.ring.frustumCulled=false;this.ring.visible=false;this.root.add(this.ring);
 }
 setModel(template:Object3D){
  if(!validRelicModel(template))throw Error('Incomplete recovery crystal');
  const next=template.clone(true),core=next.getObjectByName('relic-core')!;
  this.anchor.remove(this.model);for(const r of this.fallback)r.dispose();this.fallback.clear();this.model=next;this.core=core;this.anchor.add(next);this.loaded=true;
 }
 update(collected:boolean,claimedAt:number|undefined,now:number,near:boolean,reduced:boolean){
  this.claimed=collected;this.near=near&&!collected;this.ring.visible=this.near;
  const age=claimedAt===undefined?Infinity:now-claimedAt,animating=collected&&!reduced&&age>=0&&age<RELIC_PICKUP.animation;
  const t=animating?Math.min(1,age/RELIC_PICKUP.animation):0,ease=t*t*(3-2*t);
  this.pose=collected?(animating?1-ease:0):1;this.core.visible=this.pose>0;
  this.core.scale.setScalar(this.pose);this.core.position.y=.55+(animating?.36*ease:!collected&&!reduced?.06*Math.sin(now*2):0);
  this.core.rotation.y=reduced?0:now*.7;
 }
 dispose(){for(const r of this.fallback)r.dispose();this.fallback.clear();this.ring.geometry.dispose();(this.ring.material as Material).dispose();this.root.clear();}
}
