import {AnimationMixer,BufferGeometry,Float32BufferAttribute,BoxGeometry,CircleGeometry,Frustum,Group,InstancedMesh,LoopOnce,LoopRepeat,Matrix4,Mesh,MeshBasicMaterial,MeshStandardMaterial,Quaternion,RingGeometry,Sphere,Vector3,type AnimationAction,type AnimationClip,type Camera,type Object3D} from 'three';
import {WOOD_ATTACK} from './woodAttack.ts';
import {heightAt,type Enemy} from './engine.ts';
export const WOOD_SCALE=.52,WOOD_STRIDE=1.5,WOOD_SETTLE=.16,WOOD_HIT_DURATION=.24,WOOD_MARK_DURATION=.32;
// Hard normals duplicate vertex coordinates. Contact testing needs each position only once.
const contactCache=new WeakMap<BufferGeometry,Vector3[]>();
function contactPoints(mesh:Mesh){let points=contactCache.get(mesh.geometry);if(!points){const unique=new Map<string,Vector3>(),a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=new Vector3().fromBufferAttribute(a,i);unique.set(`${p.x},${p.y},${p.z}`,p);}points=[...unique.values()];contactCache.set(mesh.geometry,points);}return points;}
export type WoodTemplate={scene:Group;animations:AnimationClip[]};
/** Rigid-joint geometry is shared; only transforms and clip clocks belong to each enemy. */
export class WoodView {
 readonly root=new Group();readonly model:Group;readonly surfaces:Mesh[]=[];private soles:{mesh:Mesh;points:Vector3[]}[]=[];private mixer?:AnimationMixer;private walk?:AnimationAction;private strike?:AnimationAction;
 private rest:{node:Object3D;position:Vector3;quaternion:Quaternion;samplePosition:Vector3;sampleQuaternion:Quaternion}[]=[];private point=new Vector3();private footPoint=new Vector3();private hitAxis=new Vector3();private hitRotation=new Quaternion();
 readonly authored:boolean;
 constructor(template:WoodTemplate,authored=true){
  this.authored=authored;
  this.model=template.scene.clone(true);this.model.scale.setScalar(authored?WOOD_SCALE:1);this.model.rotation.y=authored?-Math.PI/2:0;this.root.add(this.model);
  if(authored){this.mixer=new AnimationMixer(this.model);this.walk=this.mixer.clipAction(template.animations.find(a=>a.name==='frontier-wood-walk')!).setLoop(LoopRepeat,Infinity).play();this.mixer.setTime(0);const strike=template.animations.find(a=>a.name==='frontier-wood-strike');if(strike){this.strike=this.mixer.clipAction(strike).setLoop(LoopOnce,1).setEffectiveWeight(0).play();this.strike.clampWhenFinished=true;}}
  this.model.traverse(o=>{if(o instanceof Mesh){this.surfaces.push(o);o.visible=false;if(o.name.startsWith('surface-leg-'))this.soles.push({mesh:o,points:contactPoints(o)});}else if(o!==this.model)this.rest.push({node:o,position:o.position.clone(),quaternion:o.quaternion.clone(),samplePosition:o.position.clone(),sampleQuaternion:o.quaternion.clone()});});
 }
 update(enemy:Enemy,reduced:boolean,now=0){
  const attack=enemy.attack,phase=((attack?.entryDistance??enemy.walkDistance??0)/WOOD_STRIDE)%1;
  // Restore the unmodified last sample before mixer caching; terrain/settle offsets must never accumulate.
  for(const r of this.rest){r.node.position.copy(r.samplePosition);r.node.quaternion.copy(r.sampleQuaternion);}
  if(this.walk){
   let weight=attack&&this.strike?Math.min(1,attack.time/WOOD_ATTACK.entry):0;weight=weight*weight*(3-2*weight);
   if(reduced)weight=attack&&this.strike?1:0;
   this.walk.enabled=true;this.walk.time=reduced?0:phase;this.walk.setEffectiveWeight(1-weight);
   if(this.strike){this.strike.enabled=true;this.strike.time=attack?(reduced?(attack.hit?.28:.18):Math.min(attack.time,WOOD_ATTACK.duration)):0;this.strike.setEffectiveWeight(weight);}
   this.mixer!.update(0);
  }
  for(const r of this.rest){r.samplePosition.copy(r.node.position);r.sampleQuaternion.copy(r.node.quaternion);}
  if(!reduced&&!enemy.moving&&!attack){const t=Math.min(1,(enemy.restTime??WOOD_SETTLE)/WOOD_SETTLE),a=t*t*(3-2*t);for(const r of this.rest){r.node.position.lerp(r.position,a);r.node.quaternion.slerp(r.quaternion,a);}}
  this.root.position.set(enemy.x,heightAt(enemy.x,enemy.z),enemy.z);this.root.rotation.set(0,enemy.heading??0,0);
  // Visual-only impulse; the game position, heading, swing and clocks remain untouched.
  const age=now-(enemy.hitAt??-Infinity);
  if(!reduced&&age>=0&&age<WOOD_HIT_DURATION){const h=enemy.hitHeading??0,t=age/WOOD_HIT_DURATION,amount=.32*Math.sin(Math.PI*t)*(1-t*.4);this.hitAxis.set(Math.cos(h),0,-Math.sin(h));this.hitRotation.setFromAxisAngle(this.hitAxis,amount);this.root.quaternion.premultiply(this.hitRotation);}
  this.root.updateMatrixWorld(true);
  // The box fallback has no articulated legs; lift its body only when the impulse would put it underground.
  if(!this.authored&&!reduced&&age>=0&&age<WOOD_HIT_DURATION){let clearance=Infinity;for(const mesh of this.surfaces)for(const p of contactPoints(mesh)){this.point.copy(p).applyMatrix4(mesh.matrixWorld);clearance=Math.min(clearance,this.point.y-heightAt(this.point.x,this.point.z));}if(clearance<0){this.root.position.y-=clearance;this.root.updateMatrixWorld(true);}}
  // Preserve each authored swing clearance while placing its rigid sole above the actual ramp/bridge surface.
  // This adjusts leg height; it does not claim ankle rotation or world-locked horizontal feet.
  if(this.authored)for(const {mesh,points} of this.soles){
   let localLow=Infinity,clearance=Infinity;
   for(const p of points){this.point.copy(p).applyMatrix4(mesh.matrixWorld);localLow=Math.min(localLow,this.point.y);clearance=Math.min(clearance,this.point.y-heightAt(this.point.x,this.point.z));}
   const lift=Math.max(0,localLow-this.root.position.y)-clearance,leg=mesh.parent!;
   leg.getWorldPosition(this.footPoint);this.footPoint.y+=lift;leg.parent!.worldToLocal(this.footPoint);leg.position.copy(this.footPoint);leg.updateWorldMatrix(false,true);
  }
 }
 dispose(){this.mixer?.stopAllAction();this.mixer?.uncacheRoot(this.model);}
}
export function woodFallback():WoodTemplate {
 const scene=new Group(),bark=new MeshStandardMaterial({color:'#995b31',roughness:.9}),cut=new MeshStandardMaterial({color:'#d2ad69',roughness:.9});
 for(const [x,y,z,w,h,d,mat]of [[0,1.4,0,1,1.8,.8,bark],[0,2.5,0,.8,.7,.75,cut],[-.3,.3,0,.35,.6,.5,bark],[.3,.3,0,.35,.6,.5,bark]] as const){const m=new Mesh(new BoxGeometry(w,h,d),mat);m.position.set(x,y,z);scene.add(m);}return{scene,animations:[]};
}
/** Single two-tone, camera-facing target cue; the dark rim keeps it readable on snow. */
function hitMarkerGeometry(){
 const positions:number[]=[],colors:number[]=[],indices:number[]=[];
 const gold=[1,.68,.16],rim=[.08,.10,.09];
 positions.push(0,0,0);colors.push(...gold);
 for(let ring=0;ring<2;ring++)for(let i=0;i<8;i++){
  const a=Math.PI/2+i*Math.PI/4,r=(i%2===0?1:.42)*(ring?1.36:1);
  positions.push(Math.cos(a)*r,Math.sin(a)*r,0);colors.push(...(ring?rim:gold));
 }
 for(let i=0;i<8;i++){const j=(i+1)%8,a=1+i,b=1+j,c=9+i,d=9+j;indices.push(0,a,b,a,c,b,b,c,d);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setIndex(indices);return g;
}
/** Shared instanced geometry keeps target feedback independent without a renderer per enemy. */
export class WoodBatch {
 readonly root=new Group();readonly views=new Map<number,WoodView>();meshes:InstancedMesh[]=[];private contacts:InstancedMesh;private health:InstancedMesh;private warnings:InstancedMesh;private hitMarkers:InstancedMesh;private capacity=0;
 private frustum=new Frustum();private projection=new Matrix4();private warningRight=new Vector3();private warningBack=new Vector3();private warningNormal=new Vector3();private sphere=new Sphere(new Vector3(),2.5);private matrix=new Matrix4();private q=new Quaternion();private scale=new Vector3();private point=new Vector3();
 readonly template:WoodTemplate;readonly authored:boolean;
 get markerCount(){return this.hitMarkers.count;}
 constructor(template:WoodTemplate,authored=true){
  this.template=template;this.authored=authored;
  this.contacts=new InstancedMesh(new CircleGeometry(.8,12),new MeshBasicMaterial({color:'#183d2d',transparent:true,opacity:.25,depthWrite:false}),1);
  this.warnings=new InstancedMesh(new RingGeometry(.55,WOOD_ATTACK.hitReach,24,1,-Math.PI/2-WOOD_ATTACK.halfArc,WOOD_ATTACK.halfArc*2),new MeshBasicMaterial({color:'#df6449',transparent:true,opacity:.68,depthWrite:false,side:2}),1);
  this.health=new InstancedMesh(new BoxGeometry(1,.11,.08),new MeshBasicMaterial({color:'#ffbd9d'}),1);this.hitMarkers=new InstancedMesh(hitMarkerGeometry(),new MeshBasicMaterial({vertexColors:true,transparent:true,opacity:1,depthTest:true,depthWrite:false,forceSinglePass:true,side:2}),1);this.hitMarkers.name='wood-hit-marker';this.grow(16);
 }
 private grow(size:number){
  this.capacity=size;for(const mesh of this.meshes){this.root.remove(mesh);mesh.dispose();}this.meshes=[];
  this.template.scene.traverse(o=>{if(o instanceof Mesh){const m=new InstancedMesh(o.geometry,o.material,size);m.name=o.name;m.count=0;m.frustumCulled=false;m.receiveShadow=true;this.meshes.push(m);this.root.add(m);}});
  for(const name of ['contacts','health','warnings','hitMarkers'] as const){const old=this[name];this.root.remove(old);const next=new InstancedMesh(old.geometry,old.material,size);next.count=0;next.name=old.name;next.frustumCulled=false;this[name]=next;old.dispose();this.root.add(next);}
 }
 update(enemies:Enemy[],reduced:boolean,camera:Camera,now=0){
  if(enemies.length>this.capacity)this.grow(2**Math.ceil(Math.log2(enemies.length)));
  const alive=new Set(enemies.map(e=>e.id));for(const [id,view]of this.views)if(!alive.has(id)){view.dispose();this.views.delete(id);}
  camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));let count=0,healthCount=0,warningCount=0,markerCount=0;
  for(const enemy of enemies){let view=this.views.get(enemy.id);if(!view){view=new WoodView(this.template,this.authored);this.views.set(enemy.id,view);}view.update(enemy,reduced,now);
   this.sphere.center.set(enemy.x,heightAt(enemy.x,enemy.z)+1.5,enemy.z);if(!this.frustum.intersectsSphere(this.sphere))continue;
   for(let j=0;j<this.meshes.length;j++)this.meshes[j].setMatrixAt(count,view.surfaces[j].matrixWorld);
   this.matrix.makeRotationX(-Math.PI/2);this.matrix.setPosition(enemy.x,heightAt(enemy.x,enemy.z)+.025,enemy.z);this.contacts.setMatrixAt(count,this.matrix);count++;
   if(enemy.attack&&!enemy.attack.hit){const h=enemy.attack.heading,base=heightAt(enemy.x,enemy.z),dx=(heightAt(enemy.x+.1,enemy.z)-heightAt(enemy.x-.1,enemy.z))/.2,dz=(heightAt(enemy.x,enemy.z+.1)-heightAt(enemy.x,enemy.z-.1))/.2;this.warningRight.set(Math.cos(h),dx*Math.cos(h)-dz*Math.sin(h),-Math.sin(h));this.warningBack.set(-Math.sin(h),-dx*Math.sin(h)-dz*Math.cos(h),-Math.cos(h));this.warningNormal.crossVectors(this.warningRight,this.warningBack).normalize();this.matrix.makeBasis(this.warningRight,this.warningBack,this.warningNormal);this.matrix.setPosition(enemy.x,base+.06,enemy.z);this.warnings.setMatrixAt(warningCount++,this.matrix);}
   const hitAge=now-(enemy.hitAt??-Infinity);
   if(enemy.hp>0&&hitAge>=0&&hitAge<WOOD_MARK_DURATION){camera.getWorldQuaternion(this.q);this.point.set(enemy.x,heightAt(enemy.x,enemy.z)+4.15,enemy.z);const t=hitAge/WOOD_MARK_DURATION,size=.55*(reduced?1:.8+.2*Math.sin(Math.PI*t));this.scale.setScalar(size);this.matrix.compose(this.point,this.q,this.scale);this.hitMarkers.setMatrixAt(markerCount++,this.matrix);}
   const ratio=enemy.hp/(enemy.maxHp??enemy.hp);if(ratio<1){camera.getWorldQuaternion(this.q);this.point.set(enemy.x,heightAt(enemy.x,enemy.z)+3.5,enemy.z);this.scale.set(Math.max(.02,ratio),1,1);this.matrix.compose(this.point,this.q,this.scale);this.health.setMatrixAt(healthCount++,this.matrix);}
  }
  for(const mesh of [...this.meshes,this.contacts]){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}this.health.count=healthCount;this.health.instanceMatrix.needsUpdate=true;this.warnings.count=warningCount;this.warnings.instanceMatrix.needsUpdate=true;this.hitMarkers.count=markerCount;this.hitMarkers.instanceMatrix.needsUpdate=true;
 }
 dispose(){for(const v of this.views.values())v.dispose();this.views.clear();for(const m of [...this.meshes,this.contacts,this.health,this.warnings,this.hitMarkers])m.dispose();this.hitMarkers.geometry.dispose();(this.hitMarkers.material as MeshBasicMaterial).dispose();this.warnings.geometry.dispose();(this.warnings.material as MeshBasicMaterial).dispose();this.contacts.geometry.dispose();this.health.geometry.dispose();(this.contacts.material as MeshBasicMaterial).dispose();(this.health.material as MeshBasicMaterial).dispose();}
}
