import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoxGeometry,Group,Material,Mesh,MeshBasicMaterial,PerspectiveCamera,Raycaster,Vector2,Vector3,Vector4,WebGLRenderer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GateOcclusion} from './gateOcclusion.ts';
import {cameraFrame} from './camera.ts';
import {CORE,createFrontier,heightAt} from './engine.ts';

const load=async()=>{const b=readFileSync('public/defense/models/forest-gate.glb');return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;};
const compile=(m:Material)=>{
 const shader={uniforms:{} as Record<string,{value:Vector4}>,fragmentShader:'void main() {\n#include <clipping_planes_fragment>\n}'};
 m.onBeforeCompile(shader as Parameters<Material['onBeforeCompile']>[0],{} as WebGLRenderer);
 assert.match(shader.fragmentShader,/arcanaGateMask/);assert.ok(shader.uniforms.arcanaGateMask);return shader.uniforms.arcanaGateMask.value;
};
const cameraAt=(x:number,z:number,mode:'solo'|'command',width:number,height:number)=>{
 const s=createFrontier(mode);s.hero.x=x;s.hero.z=z;
 const frame=cameraFrame(s,{width,height,zoom:1,overview:false,reduced:true});
 const camera=new PerspectiveCamera();camera.position.copy(frame.target).add(frame.offset);camera.lookAt(frame.target);camera.updateMatrixWorld();
 return camera;
};
test('authored gate masks the hero locally while retaining material settings',async()=>{
 const gate=await load();gate.scale.setScalar(1.23333764);gate.position.set(CORE.x,.058894,CORE.z);gate.updateMatrixWorld(true);
 const v=new GateOcclusion(gate),target=new Vector3(-17,1.5,22),camera=cameraAt(-17,22,'solo',844,390);
 const dir=target.clone().sub(camera.position),ray=new Raycaster(camera.position,dir.clone().normalize(),0,dir.length()-.15);
 const hits=ray.intersectObject(gate,true);assert.ok(hits.length,'baseline gate obscures the hero');
 const materials=new Set(hits.map(h=>(h.object as Mesh).material as MeshBasicMaterial));const originals=new Map([...materials].map(m=>[m,m.onBeforeCompile]));v.update(camera,target);
 assert.ok(v.count>0);const masks=[...materials].map(m=>{assert.equal(m.opacity,1);assert.equal(m.depthWrite,true);assert.equal(m.transparent,false);return compile(m);});assert.ok(masks.every(m=>m.z>0&&m.w>0));
 v.update(null);assert.equal(v.count,0);assert.ok(masks.every(m=>m.z===0&&m.w===0));
 v.update(camera,target);assert.ok(v.count);assert.ok(masks.every(m=>m.z>0));v.dispose();for(const m of materials)assert.equal(m.onBeforeCompile,originals.get(m));
});
test('fallback surfaces and replaced models restore original material settings',()=>{
 const root=new Group(),material=new MeshBasicMaterial({opacity:.73,transparent:true,depthWrite:true}),cube=new Mesh(new BoxGeometry(2,2,2),material);material.forceSinglePass=true;root.add(cube);
 const v=new GateOcclusion(root),camera=new PerspectiveCamera();camera.position.set(0,0,5);camera.updateMatrixWorld();const target=new Vector3(0,0,-5),hook=material.onBeforeCompile,cacheKey=material.customProgramCacheKey;
 v.update(camera,target);assert.equal(v.count,1);assert.equal(material.opacity,.73);const mask=compile(material);assert.ok(mask.z>0);
 const unsupported={uniforms:{},fragmentShader:'void main(){\n#include <clipping_planes_fragment>\n}'};material.onBeforeCompile(unsupported as Parameters<Material['onBeforeCompile']>[0],{} as WebGLRenderer);assert.equal(unsupported.fragmentShader,'void main(){\n#include <clipping_planes_fragment>\n}');
 root.clear();v.invalidate();assert.equal(material.opacity,.73);assert.equal(material.transparent,true);assert.equal(material.depthWrite,true);assert.equal(material.forceSinglePass,true);assert.equal(material.onBeforeCompile,hook);assert.equal(material.customProgramCacheKey,cacheKey);assert.equal(mask.z,0);
 const replacement=new Mesh(new BoxGeometry(2,2,2),new MeshBasicMaterial());root.add(replacement);v.update(camera,target);assert.equal(v.count,1,'same eye and target retested after model swap');
 v.update(camera,new Vector3(0,0,3));assert.equal(v.count,0,'surfaces beyond the hero remain opaque');
 v.update(camera,new Vector3(5,0,-5));assert.equal(v.count,0);assert.equal(replacement.material.opacity,1);v.dispose();
});
test('a narrow obstruction crossing the edge of the hero is included',()=>{
 const root=new Group(),obstacle=new Mesh(new BoxGeometry(.18,.3,.3),new MeshBasicMaterial());obstacle.position.x=.325;root.add(obstacle);
 const camera=new PerspectiveCamera();camera.position.set(0,0,5);camera.updateMatrixWorld();const target=new Vector3(0,0,-5);
 root.updateMatrixWorld(true);assert.equal(new Raycaster(camera.position,new Vector3(0,0,-1),0,10).intersectObject(root,true).length,0);
 const v=new GateOcclusion(root);v.update(camera,target);assert.equal(v.count,1);assert.equal(obstacle.material.opacity,1);assert.ok(compile(obstacle.material).z>0);v.dispose();
});
test('mask follows the drawing buffer size even when camera and hero are still',()=>{
 const root=new Group(),material=new MeshBasicMaterial(),cube=new Mesh(new BoxGeometry(2,2,2),material);root.add(cube);
 const v=new GateOcclusion(root),camera=new PerspectiveCamera(42,844/390,.1,200);camera.position.set(0,0,5);camera.updateMatrixWorld();const target=new Vector3(0,0,-5);
 v.update(camera,target,new Vector2(844,390));const mask=compile(material),old=mask.clone();assert.ok(old.z>0&&old.w>0);
 v.update(camera,target,new Vector2(1688,780));assert.equal(mask.x,old.x*2);assert.equal(mask.y,old.y*2);assert.ok(mask.z>old.z&&mask.w>old.w);v.dispose();
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
