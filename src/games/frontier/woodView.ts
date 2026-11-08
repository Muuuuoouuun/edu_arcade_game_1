import {AnimationMixer,BoxGeometry,CircleGeometry,Frustum,Group,InstancedMesh,LoopRepeat,Matrix4,Mesh,MeshBasicMaterial,MeshStandardMaterial,Quaternion,Sphere,Vector3,type AnimationClip,type Camera,type Object3D,type BufferGeometry} from 'three';
import {heightAt,type Enemy} from './engine.ts';
export const WOOD_SCALE=.52,WOOD_STRIDE=1.5,WOOD_SETTLE=.16;
// Hard normals duplicate vertex coordinates. Contact testing needs each position only once.
const contactCache=new WeakMap<BufferGeometry,Vector3[]>();
function contactPoints(mesh:Mesh){let points=contactCache.get(mesh.geometry);if(!points){const unique=new Map<string,Vector3>(),a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=new Vector3().fromBufferAttribute(a,i);unique.set(`${p.x},${p.y},${p.z}`,p);}points=[...unique.values()];contactCache.set(mesh.geometry,points);}return points;}
export type WoodTemplate={scene:Group;animations:AnimationClip[]};
/** Rigid-joint geometry is shared; only transforms and clip clocks belong to each enemy. */
export class WoodView {
 readonly root=new Group();readonly model:Group;readonly surfaces:Mesh[]=[];private soles:{mesh:Mesh;points:Vector3[]}[]=[];private mixer?:AnimationMixer;
 private rest:{node:Object3D;position:Vector3;quaternion:Quaternion;samplePosition:Vector3;sampleQuaternion:Quaternion}[]=[];private point=new Vector3();private footPoint=new Vector3();
 readonly authored:boolean;
 constructor(template:WoodTemplate,authored=true){
  this.authored=authored;
  this.model=template.scene.clone(true);this.model.scale.setScalar(authored?WOOD_SCALE:1);this.model.rotation.y=authored?-Math.PI/2:0;this.root.add(this.model);
  if(authored){this.mixer=new AnimationMixer(this.model);this.mixer.clipAction(template.animations.find(a=>a.name==='frontier-wood-walk')!).setLoop(LoopRepeat,Infinity).play();this.mixer.setTime(0);}
  this.model.traverse(o=>{if(o instanceof Mesh){this.surfaces.push(o);o.visible=false;if(o.name.startsWith('surface-leg-'))this.soles.push({mesh:o,points:contactPoints(o)});}else if(o!==this.model)this.rest.push({node:o,position:o.position.clone(),quaternion:o.quaternion.clone(),samplePosition:o.position.clone(),sampleQuaternion:o.quaternion.clone()});});
 }
 update(enemy:Enemy,reduced:boolean){
  const phase=((enemy.walkDistance??0)/WOOD_STRIDE)%1;
  // Restore the unmodified last sample before mixer caching; terrain/settle offsets must never accumulate.
  for(const r of this.rest){r.node.position.copy(r.samplePosition);r.node.quaternion.copy(r.sampleQuaternion);}
  this.mixer?.setTime(reduced?0:phase);
  for(const r of this.rest){r.samplePosition.copy(r.node.position);r.sampleQuaternion.copy(r.node.quaternion);}
  if(!reduced&&!enemy.moving){const t=Math.min(1,(enemy.restTime??WOOD_SETTLE)/WOOD_SETTLE),a=t*t*(3-2*t);for(const r of this.rest){r.node.position.lerp(r.position,a);r.node.quaternion.slerp(r.quaternion,a);}}
  this.root.position.set(enemy.x,heightAt(enemy.x,enemy.z),enemy.z);this.root.rotation.y=enemy.heading??0;this.root.updateMatrixWorld(true);
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
/** At most eight authored joint draws, one contact draw and one health draw per batch (capacity grows geometrically). */
export class WoodBatch {
 readonly root=new Group();readonly views=new Map<number,WoodView>();meshes:InstancedMesh[]=[];private contacts:InstancedMesh;private health:InstancedMesh;private capacity=0;
 private frustum=new Frustum();private projection=new Matrix4();private sphere=new Sphere(new Vector3(),2.5);private matrix=new Matrix4();private q=new Quaternion();private scale=new Vector3();private point=new Vector3();
 readonly template:WoodTemplate;readonly authored:boolean;
 constructor(template:WoodTemplate,authored=true){
  this.template=template;this.authored=authored;
  this.contacts=new InstancedMesh(new CircleGeometry(.8,12),new MeshBasicMaterial({color:'#183d2d',transparent:true,opacity:.25,depthWrite:false}),1);
  this.health=new InstancedMesh(new BoxGeometry(1,.11,.08),new MeshBasicMaterial({color:'#ffbd9d'}),1);this.grow(16);
 }
 private grow(size:number){
  this.capacity=size;for(const mesh of this.meshes){this.root.remove(mesh);mesh.dispose();}this.meshes=[];
  this.template.scene.traverse(o=>{if(o instanceof Mesh){const m=new InstancedMesh(o.geometry,o.material,size);m.name=o.name;m.count=0;m.frustumCulled=false;m.receiveShadow=true;this.meshes.push(m);this.root.add(m);}});
  for(const name of ['contacts','health'] as const){const old=this[name];this.root.remove(old);const next=new InstancedMesh(old.geometry,old.material,size);next.count=0;next.frustumCulled=false;this[name]=next;old.dispose();this.root.add(next);}
 }
 update(enemies:Enemy[],reduced:boolean,camera:Camera){
  if(enemies.length>this.capacity)this.grow(2**Math.ceil(Math.log2(enemies.length)));
  const alive=new Set(enemies.map(e=>e.id));for(const [id,view]of this.views)if(!alive.has(id)){view.dispose();this.views.delete(id);}
  camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));let count=0,healthCount=0;
  for(const enemy of enemies){let view=this.views.get(enemy.id);if(!view){view=new WoodView(this.template,this.authored);this.views.set(enemy.id,view);}view.update(enemy,reduced);
   this.sphere.center.set(enemy.x,heightAt(enemy.x,enemy.z)+1.5,enemy.z);if(!this.frustum.intersectsSphere(this.sphere))continue;
   for(let j=0;j<this.meshes.length;j++)this.meshes[j].setMatrixAt(count,view.surfaces[j].matrixWorld);
   this.matrix.makeRotationX(-Math.PI/2);this.matrix.setPosition(enemy.x,heightAt(enemy.x,enemy.z)+.025,enemy.z);this.contacts.setMatrixAt(count,this.matrix);count++;
   const ratio=enemy.hp/(enemy.maxHp??enemy.hp);if(ratio<1){camera.getWorldQuaternion(this.q);this.point.set(enemy.x,heightAt(enemy.x,enemy.z)+3.5,enemy.z);this.scale.set(Math.max(.02,ratio),1,1);this.matrix.compose(this.point,this.q,this.scale);this.health.setMatrixAt(healthCount++,this.matrix);}
  }
  for(const mesh of [...this.meshes,this.contacts]){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}this.health.count=healthCount;this.health.instanceMatrix.needsUpdate=true;
 }
 dispose(){for(const v of this.views.values())v.dispose();this.views.clear();for(const m of [...this.meshes,this.contacts,this.health])m.dispose();this.contacts.geometry.dispose();this.health.geometry.dispose();(this.contacts.material as MeshBasicMaterial).dispose();(this.health.material as MeshBasicMaterial).dispose();}
}
