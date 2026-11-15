import {AnimationMixer,Color,Float32BufferAttribute,Group,LoopRepeat,MathUtils,Mesh,MeshStandardMaterial,Quaternion,Vector3,type AnimationAction,type Object3D} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {heightAt,type Enemy} from './engine.ts';
import {WOOD_ATTACK} from './woodAttack.ts';
import {WOOD_DEFEAT} from './woodDefeat.ts';
import {WOOD_HIT_DURATION,type WoodTemplate} from './woodView.ts';
import {shockwaveSurface} from './effectsView.ts';

// Existing authored walk has a 1.68-model-unit planted stride, scaled to the battlefield.
export const WOLF_SCALE=.52,WOLF_STRIDE=1.68*WOLF_SCALE;
const angular=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

/** Anticipation, contact and recovery sampled from the existing combat clock. */
export function wolfBitePose(time:number){
 const t=Math.max(0,Math.min(WOOD_ATTACK.duration,time));
 const wind=MathUtils.smoothstep(t,0,.14)*(1-MathUtils.smoothstep(t,.14,WOOD_ATTACK.contact));
 const strike=MathUtils.smoothstep(t,.14,WOOD_ATTACK.contact)*(1-MathUtils.smoothstep(t,WOOD_ATTACK.contact,WOOD_ATTACK.duration));
 const brace=MathUtils.smoothstep(t,0,.18),thrust=MathUtils.smoothstep(t,.18,WOOD_ATTACK.contact),recover=1-MathUtils.smoothstep(t,WOOD_ATTACK.contact,WOOD_ATTACK.duration);
 return {bodyX:((-.06*brace+.075*thrust)*recover)||0,bodyY:((-.18*brace+.09*thrust)*recover)||0,neckX:-.12*wind+.45*strike,neckY:-.12*wind-.06*strike,neckZ:-.08*wind-.09*strike,headX:.18*strike,headZ:-.08*strike,jaw:.38*wind+.03*strike,tailZ:.08*wind-.05*strike};
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
 private mixer:AnimationMixer;private walk:AnimationAction;private body?:Object3D;private limbs:{hip:Object3D;knee:Object3D;foot:Object3D;target:Vector3;orientation:Quaternion}[]=[];private localTarget=new Vector3();private parentRotation=new Quaternion();private jaw?:Object3D;private neck?:Object3D;private head?:Object3D;private tail?:Object3D;
 private feet:{node:Object3D;mesh:Mesh;points:Vector3[]}[]=[];private rest:{node:Object3D;position:Vector3;rotation:Quaternion;sample:Vector3;sampleRotation:Quaternion}[]=[];private point=new Vector3();private target=new Vector3();private hitAxis=new Vector3();private hitRotation=new Quaternion();
 constructor(template:WoodTemplate){
  this.model=template.scene.clone(true);this.model.scale.setScalar(WOLF_SCALE);this.model.rotation.y=-Math.PI/2;this.root.add(this.model);
  const clip=template.animations.find(c=>c.name==='frost-wolf-stride');if(!clip)throw Error('Missing wolf gait');this.mixer=new AnimationMixer(this.model);this.walk=this.mixer.clipAction(clip).setLoop(LoopRepeat,Infinity).play();
  this.body=this.model.getObjectByName('wolf-root');for(const side of ['near','far'])for(const end of ['front','back']){const hip=this.model.getObjectByName(`leg-${side}-${end}`),knee=this.model.getObjectByName(`knee-${side}-${end}`),foot=this.model.getObjectByName(`foot-${side}-${end}`);if(hip&&knee&&foot&&hip.parent===this.body&&knee.parent===hip&&foot.parent===knee)this.limbs.push({hip,knee,foot,target:new Vector3(),orientation:new Quaternion()});}
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
  // Sample neck and head from the same combat clock as the body.
  // The simulation still owns movement, warning, hit time and damage.
  this.model.position.set(0,0,0);
  const pose=attack&&!reduced?wolfBitePose(attack.time):undefined;
  if(pose){
   if(this.neck){this.neck.position.x+=pose.neckX;this.neck.position.y+=pose.neckY;this.neck.rotation.z+=pose.neckZ;}
   if(this.head){this.head.position.x+=pose.headX;this.head.rotation.z+=pose.headZ;}
   if(this.jaw)this.jaw.rotation.z-=pose.jaw;if(this.tail)this.tail.rotation.z+=pose.tailZ;
  }
  this.root.position.set(enemy.x,heightAt(enemy.x,enemy.z),enemy.z);this.root.rotation.set(0,enemy.heading??0,0);this.root.scale.setScalar(1);
  const hitAge=fallenAge===undefined?now-(enemy.hitAt??-Infinity):Infinity;
  if(!reduced&&hitAge>=0&&hitAge<WOOD_HIT_DURATION){const h=enemy.hitHeading??0,t=hitAge/WOOD_HIT_DURATION;this.hitAxis.set(Math.cos(h),0,-Math.sin(h));this.hitRotation.setFromAxisAngle(this.hitAxis,.20*Math.sin(Math.PI*t)*(1-t*.4));this.root.quaternion.premultiply(this.hitRotation);}
  this.root.updateMatrixWorld(true);
  // Preserve the interrupted crouch at defeat, then release it into the fall.
  const braceWeight=fallenAge===undefined?1:1-MathUtils.smoothstep(fallenAge,0,.18);
  if(pose&&braceWeight>0)this.braceBody(pose,braceWeight);
  for(const foot of this.feet){let flat=Infinity,clearance=Infinity;for(const p of foot.points){this.point.copy(p).applyMatrix4(foot.mesh.matrixWorld);flat=Math.min(flat,this.point.y-this.root.position.y);clearance=Math.min(clearance,this.point.y-shockwaveSurface(this.point.x,this.point.z));}const lift=Math.max(0,flat)-clearance;if(Number.isFinite(lift)){foot.node.getWorldPosition(this.target);this.target.y+=lift;foot.node.position.copy(foot.node.parent!.worldToLocal(this.target));foot.node.updateWorldMatrix(false,true);}}
  if(fallenAge!==undefined){
   const t=Math.max(0,Math.min(1,fallenAge/WOOD_DEFEAT.duration)),fall=Math.min(1,t/.62),ease=fall*fall*(3-2*fall),h=enemy.hitHeading??0;
   this.hitAxis.set(Math.cos(h),0,-Math.sin(h));this.hitRotation.setFromAxisAngle(this.hitAxis,1.1*ease);this.root.quaternion.premultiply(this.hitRotation);
   const fade=Math.max(0,Math.min(1,(t-.72)/.28));this.root.scale.setScalar(1-fade*fade*(3-2*fade));this.root.updateMatrixWorld(true);
   let clearance=Infinity;for(const mesh of this.surfaces){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){this.point.fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld);clearance=Math.min(clearance,this.point.y-shockwaveSurface(this.point.x,this.point.z));}}
   if(Number.isFinite(clearance)){this.root.position.y-=clearance;this.root.updateMatrixWorld(true);}
  }
 }
 /** Lower the torso while two rigid segments keep each sampled paw pivot planted. */
 private braceBody(pose:ReturnType<typeof wolfBitePose>,weight:number){
  if(!this.body||this.limbs.length!==4)return;
  const bodyX=pose.bodyX*weight,bodyY=pose.bodyY*weight;
  if(Math.abs(bodyX)+Math.abs(bodyY)<1e-8)return;
  // This rig uses planar, nonzero leg segments; an incompatible asset keeps the old pose.
  for(const {hip,knee,foot}of this.limbs){
   if(Math.abs(knee.position.z)>1e-5||Math.abs(foot.position.z)>1e-5||Math.hypot(knee.position.x,knee.position.y)<1e-6||Math.hypot(foot.position.x,foot.position.y)<1e-6||Math.abs(hip.rotation.x)+Math.abs(hip.rotation.y)+Math.abs(knee.rotation.x)+Math.abs(knee.rotation.y)>1e-5)return;
  }
  for(const limb of this.limbs){limb.foot.getWorldPosition(limb.target);limb.foot.getWorldQuaternion(limb.orientation);}
  this.body.position.x+=bodyX;this.body.position.y+=bodyY;this.body.updateWorldMatrix(true,true);
  for(const {hip,knee,foot,target,orientation} of this.limbs){
   this.localTarget.copy(target);this.body.worldToLocal(this.localTarget);this.localTarget.sub(hip.position);
   const upper=knee.position,lower=foot.position,l1=Math.hypot(upper.x,upper.y),l2=Math.hypot(lower.x,lower.y);if(l1<1e-6||l2<1e-6)continue;
   const dx=this.localTarget.x,dy=this.localTarget.y,c=MathUtils.clamp((dx*dx+dy*dy-l1*l1-l2*l2)/(2*l1*l2),-1,1),bend=Math.acos(c),base1=Math.atan2(upper.y,upper.x),base2=Math.atan2(lower.y,lower.x);
   let bestA=hip.rotation.z,bestB=knee.rotation.z,bestCost=Infinity;
   for(let choice=0;choice<2;choice++){const angle=choice===0?bend:-bend,a=Math.atan2(dy,dx)-Math.atan2(l2*Math.sin(angle),l1+l2*Math.cos(angle))-base1,b=angle+base1-base2,cost=angular(a,hip.rotation.z)**2+angular(b,knee.rotation.z)**2;if(cost<bestCost){bestCost=cost;bestA=hip.rotation.z+angular(a,hip.rotation.z);bestB=knee.rotation.z+angular(b,knee.rotation.z);}}
   hip.rotation.z=bestA;knee.rotation.z=bestB;knee.updateWorldMatrix(true,false);knee.getWorldQuaternion(this.parentRotation);foot.quaternion.copy(this.parentRotation.invert().multiply(orientation));hip.updateWorldMatrix(true,true);
  }
 }
 dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);}
}
