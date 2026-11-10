import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,PerspectiveCamera,Raycaster,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GateOcclusion} from './gateOcclusion.ts';
import {cameraFrame} from './camera.ts';
import {CORE,createFrontier,heightAt} from './engine.ts';

const load=async()=>{const b=readFileSync('public/defense/models/forest-gate.glb');return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;};
const cameraAt=(x:number,z:number,mode:'solo'|'command',width:number,height:number)=>{
 const s=createFrontier(mode);s.hero.x=x;s.hero.z=z;
 const frame=cameraFrame(s,{width,height,zoom:1,overview:false,reduced:true});
 const camera=new PerspectiveCamera();camera.position.copy(frame.target).add(frame.offset);camera.lookAt(frame.target);camera.updateMatrixWorld();
 return camera;
};
test('authored gate fades the surfaces in front of the hero and restores them',async()=>{
 const gate=await load();gate.scale.setScalar(1.23333764);gate.position.set(CORE.x,.058894,CORE.z);gate.updateMatrixWorld(true);
 const v=new GateOcclusion(gate),target=new Vector3(-17,1.5,22),camera=cameraAt(-17,22,'solo',844,390);
 const dir=target.clone().sub(camera.position),ray=new Raycaster(camera.position,dir.clone().normalize(),0,dir.length()-.15);
 const hits=ray.intersectObject(gate,true);assert.ok(hits.length,'baseline gate obscures the hero');
 const materials=new Set(hits.map(h=>(h.object as Mesh).material as MeshBasicMaterial));v.update(camera,target);
 assert.ok(v.count>0);for(const m of materials){assert.equal(m.opacity,.03);assert.equal(m.depthWrite,false);assert.equal(m.forceSinglePass,true);}
 v.update(null);assert.equal(v.count,0);for(const m of materials){assert.equal(m.opacity,1);assert.equal(m.depthWrite,true);assert.equal(m.transparent,false);assert.equal(m.forceSinglePass,false);}
 v.update(camera,target);assert.ok(v.count);v.dispose();for(const m of materials)assert.equal(m.opacity,1);
});
test('fallback surfaces and replaced models restore original material settings',()=>{
 const root=new Group(),material=new MeshBasicMaterial({opacity:.73,transparent:true,depthWrite:true}),cube=new Mesh(new BoxGeometry(2,2,2),material);material.forceSinglePass=true;root.add(cube);
 const v=new GateOcclusion(root),camera=new PerspectiveCamera();camera.position.set(0,0,5);const target=new Vector3(0,0,-5);
 v.update(camera,target);assert.equal(v.count,1);assert.equal(material.opacity,.03);
 root.clear();v.invalidate();assert.equal(material.opacity,.73);assert.equal(material.transparent,true);assert.equal(material.depthWrite,true);assert.equal(material.forceSinglePass,true);
 const replacement=new Mesh(new BoxGeometry(2,2,2),new MeshBasicMaterial());root.add(replacement);v.update(camera,target);assert.equal(v.count,1,'same eye and target retested after model swap');
 v.update(camera,new Vector3(0,0,3));assert.equal(v.count,0,'surfaces beyond the hero remain opaque');
 v.update(camera,new Vector3(5,0,-5));assert.equal(v.count,0);assert.equal(replacement.material.opacity,1);v.dispose();
});
test('a narrow obstruction crossing the edge of the hero also fades',()=>{
 const root=new Group(),obstacle=new Mesh(new BoxGeometry(.18,.3,.3),new MeshBasicMaterial());obstacle.position.x=.325;root.add(obstacle);
 const camera=new PerspectiveCamera();camera.position.set(0,0,5);camera.updateMatrixWorld();const target=new Vector3(0,0,-5);
 root.updateMatrixWorld(true);assert.equal(new Raycaster(camera.position,new Vector3(0,0,-1),0,10).intersectObject(root,true).length,0);
 const v=new GateOcclusion(root);v.update(camera,target);assert.equal(v.count,1);assert.equal(obstacle.material.opacity,.03);v.dispose();
});
test('actual gate occlusion samples are handled even away from the gate',async()=>{
 const gate=await load();gate.scale.setScalar(1.23333764);gate.position.set(CORE.x,.058894,CORE.z);gate.updateMatrixWorld(true);
 let blocked=0,far=0;const v=new GateOcclusion(gate);
 for(const mode of ['solo','command'] as const)for(const [w,h] of [[1440,900],[844,390]])for(let x=-27;x<=-1;x++)for(let z=12;z<=27;z++){
  const camera=cameraAt(x,z,mode,w,h),target=new Vector3(x,heightAt(x,z)+1.5,z),delta=target.clone().sub(camera.position);
  const hits=new Raycaster(camera.position,delta.clone().normalize(),0,delta.length()-.15).intersectObject(gate,true);
  if(!hits.length)continue;blocked++;if(Math.hypot(x-CORE.x,z-CORE.z)>=8)far++;
  v.update(camera,target);assert.ok(v.count>0,`${mode} ${w} ${x},${z}`);
 }
 assert.ok(blocked>0);assert.ok(far>0,'the gate can occlude an actor more than eight units away');v.dispose();
});
