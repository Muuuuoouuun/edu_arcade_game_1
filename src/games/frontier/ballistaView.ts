import {AnimationMixer,Group,Mesh,BoxGeometry,MeshStandardMaterial,LoopRepeat,type AnimationClip,type Object3D,InstancedMesh,Frustum,Matrix4,Sphere,Vector3,type Camera} from 'three';
import {BALLISTA} from './ballista.ts';
import type {Tower} from './engine';
export type BallistaTemplate={scene:Group;animations:AnimationClip[]};
export class BallistaView {
 readonly root=new Group();readonly surfaces:Mesh[]=[];readonly aim:Object3D;readonly source:'glb'|'geometry';private mixer?:AnimationMixer;private pips:Mesh[]=[];
 constructor(template?:BallistaTemplate){
  this.source=template?'glb':'geometry';
  if(template){const model=template.scene.clone(true);model.scale.setScalar(BALLISTA.scale);this.root.add(model);model.traverse(o=>{if(o instanceof Mesh)this.surfaces.push(o);});this.aim=model.getObjectByName('aim-platform')!;this.mixer=new AnimationMixer(model);const action=this.mixer.clipAction(template.animations.find(c=>c.name==='frontier-ballista-release')!);action.setLoop(LoopRepeat,Infinity);action.clampWhenFinished=true;action.play();}
  else {const base=new Mesh(new BoxGeometry(2,1.4,2),new MeshStandardMaterial({color:'#8b9c88'}));base.position.y=.7;this.root.add(base);this.aim=new Group();this.aim.position.y=1.9;this.root.add(this.aim);const bow=new Mesh(new BoxGeometry(3,.35,.5),new MeshStandardMaterial({color:'#b58c46'}));bow.position.set(0,.7,1.2);this.aim.add(bow);const rail=new Mesh(new BoxGeometry(.35,.35,2.3),new MeshStandardMaterial({color:'#72583b'}));rail.position.y=.7;this.aim.add(rail);}
  for(let i=0;i<3;i++){const pip=new Mesh(new BoxGeometry(.27,.3,.12),new MeshStandardMaterial({color:'#f6d375',metalness:.55,roughness:.5}));pip.position.set((i-1)*.38,.8,1.4);this.root.add(pip);this.pips.push(pip);}
  this.root.traverse(o=>{if(o instanceof Mesh){o.castShadow=false;o.receiveShadow=true;}});
 }
 update(tower:Tower,reduced:boolean){
  // Clip sampling depends only on simulation age: pause, speed and asset loading cannot restart a shot.
  this.mixer?.setTime(reduced?0:tower.actionTime??0);
  this.aim.rotation.y=tower.heading;
  this.pips.forEach((p,i)=>p.visible=i<tower.level);
 }
}

/** One draw per articulated surface for all visible towers; each keeps its own clip and yaw. */
export class BallistaBatch {
 readonly root=new Group();readonly meshes:InstancedMesh[]=[];
 private frustum=new Frustum();private projection=new Matrix4();private sphere=new Sphere(new Vector3(),4);
 constructor(template:BallistaTemplate){template.scene.traverse(o=>{if(o instanceof Mesh){const batch=new InstancedMesh(o.geometry,o.material,6);batch.name=o.name;batch.count=0;batch.frustumCulled=false;batch.receiveShadow=true;this.meshes.push(batch);this.root.add(batch);}});}
 update(views:BallistaView[],camera?:Camera){
  if(camera){camera.updateMatrixWorld();this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.projection);}
  const visible=views.filter(v=>{if(v.source!=='glb')return false;v.root.updateWorldMatrix(true,true);for(const m of v.surfaces)m.visible=false;if(!camera)return true;v.root.getWorldPosition(this.sphere.center);this.sphere.center.y+=1.5;return this.frustum.intersectsSphere(this.sphere);}).slice(0,6);
  this.root.visible=visible.length>0;
  this.meshes.forEach((batch,j)=>{batch.count=visible.length;for(let i=0;i<visible.length;i++)batch.setMatrixAt(i,visible[i].surfaces[j].matrixWorld);batch.instanceMatrix.needsUpdate=true;});
 }
 dispose(){for(const m of this.meshes)m.dispose();}
}
