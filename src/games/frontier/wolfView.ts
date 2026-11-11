import {AnimationMixer,Color,Float32BufferAttribute,Group,LoopRepeat,MathUtils,Mesh,MeshStandardMaterial,Quaternion,Vector3,type AnimationAction,type Object3D} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {heightAt,type Enemy} from './engine.ts';
import {WOOD_ATTACK} from './woodAttack.ts';
import {WOOD_DEFEAT} from './woodDefeat.ts';
import {WOOD_HIT_DURATION,type WoodTemplate} from './woodView.ts';
import {shockwaveSurface} from './effectsView.ts';

// Existing authored walk has a 1.68-model-unit planted stride, scaled to the battlefield.
export const WOLF_SCALE=.52,WOLF_STRIDE=1.68*WOLF_SCALE;

/** Anticipation, contact and recovery sampled from the existing combat clock. */
export function wolfBitePose(time:number){
 const t=Math.max(0,Math.min(WOOD_ATTACK.duration,time));
 const wind=MathUtils.smoothstep(t,0,.14)*(1-MathUtils.smoothstep(t,.14,WOOD_ATTACK.contact));
 const strike=MathUtils.smoothstep(t,.14,WOOD_ATTACK.contact)*(1-MathUtils.smoothstep(t,WOOD_ATTACK.contact,WOOD_ATTACK.duration));
 return {neckX:-.12*wind+.45*strike,neckY:-.12*wind-.06*strike,neckZ:-.08*wind-.09*strike,headX:.18*strike,headZ:-.08*strike,jaw:.38*wind+.03*strike,tailZ:.08*wind-.05*strike};
}

/** Merge the existing rigid parts by their animated joint, preserving color as vertex color.
 * This keeps the one shared scene and batches all wolves without 66 draw calls per animal. */
export function compactWolf(template:WoodTemplate):WoodTemplate {
 const source=template.scene,groups=new Map<Object3D,Mesh[]>(),originalMaterials=new Set<MeshStandardMaterial>();
 source.traverse(o=>{if(o instanceof Mesh){if(!(o.material instanceof MeshStandardMaterial)||!o.parent)throw Error('Unsupported wolf surface');let list=groups.get(o.parent);if(!list)groups.set(o.parent,list=[]);list.push(o);originalMaterials.add(o.material);}});
 const required=['wolf-root','neck','head','jaw','tail','foot-near-front','foot-far-front','foot-near-back','foot-far-back'];
 if(!template.animations.some(c=>c.name==='frost-wolf-stride')||groups.size<10||required.some(name=>!source.getObjectByName(name)))throw Error('Incomplete wolf model');
 const material=new MeshStandardMaterial({vertexColors:true,roughness:.9});
 for(const [parent,meshes] of groups){
  const parts=meshes.map(mesh=>{mesh.updateMatrix();const g=mesh.geometry.clone();g.applyMatrix4(mesh.matrix);const source=mesh.material as MeshStandardMaterial,c=source.name==='silver white fur'?new Color('#aebfcb'):source.color,a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}g.setAttribute('color',new Float32BufferAttribute(a,3));return g;});
  const combined=mergeGeometries(parts);for(const p of parts)p.dispose();if(!combined)throw Error('Cannot merge wolf surfaces');
  const merged=new Mesh(combined,material);merged.name='wolf-surface-'+parent.name;parent.add(merged);
  for(const mesh of meshes){parent.remove(mesh);mesh.geometry.dispose();}
 }
 for(const m of originalMaterials)m.dispose();
 return template;
}

/** Samples the authored four-legged gait from simulated distance, not wall time. */
export class WolfView {
 readonly root=new Group();readonly model:Group;readonly surfaces:Mesh[]=[];
 private mixer:AnimationMixer;private walk:AnimationAction;private jaw?:Object3D;private neck?:Object3D;private head?:Object3D;private tail?:Object3D;
 private feet:{node:Object3D;mesh:Mesh;points:Vector3[]}[]=[];private rest:{node:Object3D;position:Vector3;rotation:Quaternion;sample:Vector3;sampleRotation:Quaternion}[]=[];private point=new Vector3();private target=new Vector3();private hitAxis=new Vector3();private hitRotation=new Quaternion();
 constructor(template:WoodTemplate){
  this.model=template.scene.clone(true);this.model.scale.setScalar(WOLF_SCALE);this.model.rotation.y=-Math.PI/2;this.root.add(this.model);
  const clip=template.animations.find(c=>c.name==='frost-wolf-stride');if(!clip)throw Error('Missing wolf gait');this.mixer=new AnimationMixer(this.model);this.walk=this.mixer.clipAction(clip).setLoop(LoopRepeat,Infinity).play();
  this.jaw=this.model.getObjectByName('jaw');this.neck=this.model.getObjectByName('neck');this.head=this.model.getObjectByName('head');this.tail=this.model.getObjectByName('tail');
  this.model.traverse(o=>{if(o instanceof Mesh){this.surfaces.push(o);o.visible=false;if(o.name.startsWith('wolf-surface-foot-')){const a=o.geometry.attributes.position,unique=new Map<string,Vector3>();for(let i=0;i<a.count;i++){const p=new Vector3().fromBufferAttribute(a,i);unique.set(`${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`,p);}const pts=[...unique.values()],bottom=Math.min(...pts.map(p=>p.y));this.feet.push({node:o.parent!,mesh:o,points:pts.filter(p=>p.y<bottom+.16)});}}else if(o!==this.model)this.rest.push({node:o,position:o.position.clone(),rotation:o.quaternion.clone(),sample:o.position.clone(),sampleRotation:o.quaternion.clone()});});
 }
 update(enemy:Enemy,reduced:boolean,now=0,fallenAge?:number){
  const attack=enemy.attack;
  for(const r of this.rest){r.node.position.copy(r.sample);r.node.quaternion.copy(r.sampleRotation);}
  this.walk.time=reduced?0:((attack?.entryDistance??enemy.walkDistance??0)/WOLF_STRIDE%1)*this.walk.getClip().duration;this.mixer.update(0);
  for(const r of this.rest){r.sample.copy(r.node.position);r.sampleRotation.copy(r.node.quaternion);}
  // Stop the sampled stride with all paws planted before the bite contact.
  if(!reduced&&(!enemy.moving||attack)){const q=Math.max(0,Math.min(1,attack?attack.time/.18:(enemy.restTime??.16)/.16)),blend=q*q*(3-2*q);for(const r of this.rest){r.node.position.lerp(r.position,blend);r.node.quaternion.slerp(r.rotation,blend);}}
  // Keep the planted body in place; neck and head provide the forward bite.
  // The simulation still owns movement, warning, hit time and damage.
  this.model.position.set(0,0,0);
  if(attack&&!reduced){const pose=wolfBitePose(attack.time);
   if(this.neck){this.neck.position.x+=pose.neckX;this.neck.position.y+=pose.neckY;this.neck.rotation.z+=pose.neckZ;}
   if(this.head){this.head.position.x+=pose.headX;this.head.rotation.z+=pose.headZ;}
   if(this.jaw)this.jaw.rotation.z-=pose.jaw;if(this.tail)this.tail.rotation.z+=pose.tailZ;
  }
  this.root.position.set(enemy.x,heightAt(enemy.x,enemy.z),enemy.z);this.root.rotation.set(0,enemy.heading??0,0);this.root.scale.setScalar(1);
  const hitAge=fallenAge===undefined?now-(enemy.hitAt??-Infinity):Infinity;
  if(!reduced&&hitAge>=0&&hitAge<WOOD_HIT_DURATION){const h=enemy.hitHeading??0,t=hitAge/WOOD_HIT_DURATION;this.hitAxis.set(Math.cos(h),0,-Math.sin(h));this.hitRotation.setFromAxisAngle(this.hitAxis,.20*Math.sin(Math.PI*t)*(1-t*.4));this.root.quaternion.premultiply(this.hitRotation);}
  this.root.updateMatrixWorld(true);
  for(const foot of this.feet){let flat=Infinity,clearance=Infinity;for(const p of foot.points){this.point.copy(p).applyMatrix4(foot.mesh.matrixWorld);flat=Math.min(flat,this.point.y-this.root.position.y);clearance=Math.min(clearance,this.point.y-shockwaveSurface(this.point.x,this.point.z));}const lift=Math.max(0,flat)-clearance;if(Number.isFinite(lift)){foot.node.getWorldPosition(this.target);this.target.y+=lift;foot.node.position.copy(foot.node.parent!.worldToLocal(this.target));foot.node.updateWorldMatrix(false,true);}}
  if(fallenAge!==undefined){
   const t=Math.max(0,Math.min(1,fallenAge/WOOD_DEFEAT.duration)),fall=Math.min(1,t/.62),ease=fall*fall*(3-2*fall),h=enemy.hitHeading??0;
   this.hitAxis.set(Math.cos(h),0,-Math.sin(h));this.hitRotation.setFromAxisAngle(this.hitAxis,1.1*ease);this.root.quaternion.premultiply(this.hitRotation);
   const fade=Math.max(0,Math.min(1,(t-.72)/.28));this.root.scale.setScalar(1-fade*fade*(3-2*fade));this.root.updateMatrixWorld(true);
   let clearance=Infinity;for(const mesh of this.surfaces){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){this.point.fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld);clearance=Math.min(clearance,this.point.y-shockwaveSurface(this.point.x,this.point.z));}}
   if(Number.isFinite(clearance)){this.root.position.y-=clearance;this.root.updateMatrixWorld(true);}
  }
 }
 dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);}
}
