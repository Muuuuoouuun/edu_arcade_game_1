import * as THREE from 'three';

/** Fade only the gate surfaces between the camera and the moving hero. */
export class GateOcclusion {
 private ray=new THREE.Raycaster();
 private direction=new THREE.Vector3();
 private sample=new THREE.Vector3();
 private right=new THREE.Vector3();
 private lastEye=new THREE.Vector3(Infinity,Infinity,Infinity);
 private lastTarget=new THREE.Vector3(Infinity,Infinity,Infinity);
 private bounds=new THREE.Box3();
 private boundsDirty=true;
 private faded=new Map<THREE.Material,{opacity:number;transparent:boolean;depthWrite:boolean;forceSinglePass:boolean}>();
 private root:THREE.Object3D;
 constructor(root:THREE.Object3D){this.root=root;}
 get count(){return this.faded.size;}
 /** The asynchronous gate load replaces the fallback children in the same root. */
 invalidate(){this.restore();this.boundsDirty=true;this.lastEye.set(Infinity,Infinity,Infinity);this.lastTarget.set(Infinity,Infinity,Infinity);}
 private restore(){
  for(const [material,original] of this.faded){Object.assign(material,original);material.needsUpdate=true;}
  this.faded.clear();
 }
 update(camera:THREE.Camera|null,target?:THREE.Vector3){
  if(!camera||!target){if(this.faded.size)this.restore();this.lastEye.set(Infinity,Infinity,Infinity);return;}
  if(this.lastEye.distanceToSquared(camera.position)<1e-8&&this.lastTarget.distanceToSquared(target)<1e-8)return;
  this.lastEye.copy(camera.position);this.lastTarget.copy(target);
  this.root.updateWorldMatrix(true,true);
  if(this.boundsDirty){this.bounds.setFromObject(this.root);this.boundsDirty=false;}
  const selected=new Set<THREE.Material>();
  this.right.setFromMatrixColumn(camera.matrixWorld,0).normalize();
  // Sample the body width and head/feet as well as the center, so a nearby
  // narrow piece cannot continue to cover most of the hero after the fade.
  for(const [horizontal,vertical] of [[0,0],[-.65,0],[.65,0],[0,.7],[0,-.7]]){
   this.sample.copy(target).addScaledVector(this.right,horizontal);this.sample.y+=vertical;
   this.direction.copy(this.sample).sub(camera.position);const distance=this.direction.length();
   if(distance>.15){
    this.ray.set(camera.position,this.direction.multiplyScalar(1/distance));this.ray.far=distance-.15;
    for(const hit of this.ray.ray.intersectsBox(this.bounds)?this.ray.intersectObject(this.root,true):[]){
     const mesh=hit.object;if(!(mesh instanceof THREE.Mesh))continue;
     const material=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
     if(material)selected.add(material);
    }
   }
  }
  for(const [material,original] of this.faded)if(!selected.has(material)){Object.assign(material,original);material.needsUpdate=true;this.faded.delete(material);}
  for(const material of selected)if(!this.faded.has(material)){
   this.faded.set(material,{opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite,forceSinglePass:material.forceSinglePass});
   // Several stones/roof layers can overlap along one sightline. A very low
   // per-surface opacity keeps the actor readable after those layers blend.
   material.transparent=true;material.opacity=.03;material.depthWrite=false;material.forceSinglePass=true;material.needsUpdate=true;
  }
 }
 dispose(){this.restore();}
}
