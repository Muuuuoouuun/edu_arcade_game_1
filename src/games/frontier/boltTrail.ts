import * as THREE from 'three';
import { BALLISTA } from './ballista.ts';
import type { Bolt } from './engine.ts';

// The rendered bolt tip is at position; its wooden tail ends 1.19 units behind.
const TAIL_OFFSET = 1.19;
const MAX_LENGTH = 2.4;
const CAPACITY = 64;

/** A short visual wake behind the actual bolt; it never creates hits or advances time. */
export function boltTrailPose(bolt:Bolt,reduced=false) {
 if(reduced||![bolt.life,bolt.position.x,bolt.position.y,bolt.position.z,bolt.previous.x,bolt.previous.y,bolt.previous.z].every(Number.isFinite))return null;
 const dx=bolt.position.x-bolt.previous.x,dy=bolt.position.y-bolt.previous.y,dz=bolt.position.z-bolt.previous.z;
 const distance=Math.hypot(dx,dy,dz);
 // Do not draw ahead of motion or behind the socket while the bolt is leaving it.
 const length=Math.min(MAX_LENGTH,Math.max(0,(BALLISTA.boltLifetime-bolt.life)*BALLISTA.boltSpeed-TAIL_OFFSET));
 if(distance<1e-6||length<1e-4)return null;
 const direction={x:dx/distance,y:dy/distance,z:dz/distance},offset=TAIL_OFFSET+length/2;
 return {length,direction,center:{x:bolt.position.x-direction.x*offset,y:bolt.position.y-direction.y*offset,z:bolt.position.z-direction.z*offset}};
}

/** One shared batch for all bolts in the existing scene, with normal depth occlusion. */
export class BoltTrail {
 readonly mesh:THREE.InstancedMesh;
 private readonly object=new THREE.Object3D();
 private readonly up=new THREE.Vector3(0,1,0);
 private readonly direction=new THREE.Vector3();
 constructor(){
  const geometry=new THREE.ConeGeometry(.22,1,8);geometry.rotateX(Math.PI);
  const material=new THREE.MeshBasicMaterial({color:'#d47d20',transparent:true,opacity:.72,depthWrite:false});
  this.mesh=new THREE.InstancedMesh(geometry,material,CAPACITY);this.mesh.count=0;this.mesh.frustumCulled=false;
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 }
 update(bolts:readonly Bolt[],reduced:boolean){
  let count=0;
  // Match the renderer's first 64 bolts, so no wake appears without a visible bolt.
  for(let i=0;i<Math.min(bolts.length,CAPACITY);i++){
   const bolt=bolts[i];
   const pose=boltTrailPose(bolt,reduced);if(!pose)continue;if(count>=CAPACITY)break;
   this.direction.set(pose.direction.x,pose.direction.y,pose.direction.z);
   this.object.quaternion.setFromUnitVectors(this.up,this.direction);
   this.object.position.set(pose.center.x,pose.center.y,pose.center.z);
   this.object.scale.set(1,pose.length,1);this.object.updateMatrix();this.mesh.setMatrixAt(count++,this.object.matrix);
  }
  this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;
 }
 dispose(){this.mesh.geometry.dispose();(this.mesh.material as THREE.Material).dispose();this.mesh.dispose();}
}
