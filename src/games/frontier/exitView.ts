import * as THREE from 'three';
import {EXIT,SOLO_EXIT,heightAt,soloExitReady,type Frontier} from './engine.ts';

// Move the marker toward the playable center; the entire plinth remains inside
// the real interaction radius while keeping it clear of the foreground cliff.
export const EXIT_MARKER={x:EXIT.x-1.6,z:EXIT.z+.8,outerRadius:2.08} as const;

/** Existing exit, presented in the shared 3D scene; no interaction or combat state is owned here. */
export class SoloExitView {
 readonly root=new THREE.Group();
 readonly crystals:THREE.InstancedMesh;
 readonly marks:THREE.InstancedMesh;
 readonly supports:THREE.InstancedMesh;
 readonly markSupports:THREE.InstancedMesh;
 readonly ring:THREE.Mesh<THREE.TorusGeometry,THREE.MeshStandardMaterial>;
 private floor:THREE.Mesh<THREE.CylinderGeometry,THREE.MeshStandardMaterial>;
 private readonly scratch=new THREE.Object3D();
 private readonly color=new THREE.Color();
 private lastCrystals=-1;private lastKills=-1;
 ready=false;
 constructor(){
  this.root.position.set(EXIT_MARKER.x,heightAt(EXIT_MARKER.x,EXIT_MARKER.z),EXIT_MARKER.z);
  this.floor=new THREE.Mesh(new THREE.CylinderGeometry(1.95,EXIT_MARKER.outerRadius,.22,12),new THREE.MeshStandardMaterial({color:'#777f79',roughness:.9}));
  this.floor.position.y=.11;this.floor.receiveShadow=true;this.root.add(this.floor);
  this.ring=new THREE.Mesh(new THREE.TorusGeometry(1.7,.14,6,32),new THREE.MeshStandardMaterial({color:'#a99a69',emissive:'#4d432a',emissiveIntensity:.1,roughness:.6,metalness:.2}));
  this.ring.rotation.x=Math.PI/2;this.ring.position.y=.28;this.root.add(this.ring);
  this.crystals=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.34),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.48,metalness:.08}),SOLO_EXIT.crystals);
  this.supports=new THREE.InstancedMesh(new THREE.CylinderGeometry(.08,.13,2.1,6),new THREE.MeshStandardMaterial({color:'#7a8980',roughness:.85}),SOLO_EXIT.crystals);
  for(let i=0;i<SOLO_EXIT.crystals;i++){const a=(i-1)*Math.PI/3;this.scratch.position.set(Math.sin(a)*.82,1.27,-Math.cos(a)*.82);this.scratch.rotation.set(0,0,0);this.scratch.scale.set(1,1,1);this.scratch.updateMatrix();this.supports.setMatrixAt(i,this.scratch.matrix);}
  this.supports.instanceMatrix.needsUpdate=true;
  this.markSupports=new THREE.InstancedMesh(new THREE.CylinderGeometry(.07,.11,1.25,6),new THREE.MeshStandardMaterial({color:'#817d6a',roughness:.9}),SOLO_EXIT.kills);
  for(let i=0;i<SOLO_EXIT.kills;i++){const a=(i+.5)*Math.PI*2/SOLO_EXIT.kills;this.scratch.position.set(Math.sin(a)*1.45,.845,Math.cos(a)*1.45);this.scratch.rotation.set(0,0,0);this.scratch.scale.set(1,1,1);this.scratch.updateMatrix();this.markSupports.setMatrixAt(i,this.scratch.matrix);}
  this.markSupports.instanceMatrix.needsUpdate=true;
  this.marks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.31,.36,.3,6),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.75,metalness:.12}),SOLO_EXIT.kills);
  // Active markers rise above their initial bounds; never cull them using stale instance bounds.
  this.crystals.frustumCulled=false;this.marks.frustumCulled=false;
  this.root.add(this.supports,this.markSupports,this.crystals,this.marks);
  this.update({crystals:[],kills:0,time:0},false);
 }
 /** Shapes, brightness and height distinguish each completed objective without an informational HUD. */
 update(s:Pick<Frontier,'crystals'|'kills'|'time'>,reduced:boolean){
  const crystalCount=Math.max(0,Math.min(SOLO_EXIT.crystals,s.crystals.length));
  const killCount=Math.max(0,Math.min(SOLO_EXIT.kills,Math.floor(Number.isFinite(s.kills)?s.kills:0)));
  this.ready=soloExitReady(s);
  if(crystalCount!==this.lastCrystals){
   for(let i=0;i<SOLO_EXIT.crystals;i++){
    const active=i<crystalCount,a=(i-1)*Math.PI/3;this.scratch.position.set(Math.sin(a)*.82,active ? 2.55 : 2.4,-Math.cos(a)*.82);this.scratch.rotation.set(0,0,0);this.scratch.scale.set(active?1:.7,active?1.45:.55,active?1:.7);this.scratch.updateMatrix();this.crystals.setMatrixAt(i,this.scratch.matrix);this.crystals.setColorAt(i,this.color.set(active?'#56dfd1':'#697e7b'));
   }
   this.crystals.instanceMatrix.needsUpdate=true;this.crystals.instanceColor!.needsUpdate=true;this.lastCrystals=crystalCount;
  }
  if(killCount!==this.lastKills){
   for(let i=0;i<SOLO_EXIT.kills;i++){
    const active=i<killCount,a=(i+.5)*Math.PI*2/SOLO_EXIT.kills;this.scratch.position.set(Math.sin(a)*1.45,active ? 1.725 : 1.575,Math.cos(a)*1.45);this.scratch.rotation.set(0,0,0);this.scratch.scale.set(1,active?1.7:.7,1);this.scratch.updateMatrix();this.marks.setMatrixAt(i,this.scratch.matrix);this.marks.setColorAt(i,this.color.set(active?'#f0c86e':'#68746f'));
   }
   this.marks.instanceMatrix.needsUpdate=true;this.marks.instanceColor!.needsUpdate=true;this.lastKills=killCount;
  }
  this.ring.material.color.set(this.ready?'#74edcf':'#a99a69');
  this.ring.material.emissive.set(this.ready?'#2eaf94':'#4d432a');
  this.ring.material.emissiveIntensity=this.ready?(reduced ? .5 : .5+.12*Math.sin((Number.isFinite(s.time)?s.time:0)*3)):.1;
 }
 dispose(){this.floor.geometry.dispose();this.floor.material.dispose();this.ring.geometry.dispose();this.ring.material.dispose();this.crystals.geometry.dispose();(this.crystals.material as THREE.Material).dispose();this.crystals.dispose();this.supports.geometry.dispose();(this.supports.material as THREE.Material).dispose();this.supports.dispose();this.markSupports.geometry.dispose();(this.markSupports.material as THREE.Material).dispose();this.markSupports.dispose();this.marks.geometry.dispose();(this.marks.material as THREE.Material).dispose();this.marks.dispose();this.root.clear();}
}
