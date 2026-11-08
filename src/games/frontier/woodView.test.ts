import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import {GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import {Matrix4,PerspectiveCamera,Vector3}from'three';
import {WoodBatch,WoodView,woodFallback,WOOD_STRIDE}from'./woodView.ts';import{actFrontier,createFrontier,stepFrontier,CORE,heightAt,type Enemy}from'./engine.ts';
const data=readFileSync(new URL('../../../public/defense/models/frontier-wood-game.glb',import.meta.url));const template=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const camera=new PerspectiveCamera(60,1,.1,200);camera.position.set(0,30,50);camera.lookAt(0,0,0);
const enemy=(id:number):Enemy=>({id,x:(id%5)*2,z:Math.floor(id/5)*2,hp:40,maxHp:62,cooldown:0,path:0,walkDistance:id*.113,heading:id*.4,moving:true,restTime:0});
test('wooden enemies retain independent gait/heading through batch growth, culling and removal',()=>{
 const batch=new WoodBatch(template),enemies=Array.from({length:30},(_,i)=>enemy(i));batch.update(enemies,false,camera);assert.equal(batch.meshes.length,8);assert.equal(batch.views.size,30);assert.equal(batch.meshes[0].count,30);
 for(let j=0;j<8;j++)for(let i=0;i<30;i++){const m=new Matrix4();batch.meshes[j].getMatrixAt(i,m);const view=batch.views.get(i)!;assert.equal(view.surfaces[j].geometry,batch.meshes[j].geometry);assert.ok(m.elements.every((v,k)=>Math.abs(v-view.surfaces[j].matrixWorld.elements[k])<1e-5));}
 const first=batch.views.get(0)!,other=batch.views.get(1)!;assert.notDeepEqual(first.root.getObjectByName('leg-near')!.quaternion.toArray(),other.root.getObjectByName('leg-near')!.quaternion.toArray());const saved=first.surfaces.map(m=>m.matrixWorld.clone());batch.update(enemies,false,camera);first.surfaces.forEach((m,i)=>assert.deepEqual(m.matrixWorld.elements,saved[i].elements));
 batch.update([{...enemies[0],x:1000}],false,camera);assert.equal(batch.views.size,1);assert.equal(batch.meshes[0].count,0);batch.update([enemies[0]],false,camera);assert.equal(batch.meshes[0].count,1);batch.dispose();assert.equal(batch.views.size,0);
});
test('distance samples loop and settle onto a stable local ground without running during rest/reduced motion',()=>{
 const view=new WoodView(template),e=enemy(3),point=new Vector3();view.update(e,false);const first=view.surfaces.map(m=>m.matrixWorld.clone());view.update({...e,walkDistance:e.walkDistance!+WOOD_STRIDE},false);view.surfaces.forEach((m,i)=>assert.ok(m.matrixWorld.elements.every((v,k)=>Math.abs(v-first[i].elements[k])<1e-6)));
 for(let phase=0;phase<8;phase++)for(const restTime of [0,.04,.08,.12,.16,.3]){view.update({...e,walkDistance:phase/8*WOOD_STRIDE,moving:false,restTime},false);let min=Infinity;for(const mesh of view.surfaces){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){point.fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld);min=Math.min(min,point.y);}}assert.ok(min>=-.006,`ground ${min}`);}
 view.update({...e,moving:false,restTime:.3},false);const settled=view.surfaces.map(m=>m.matrixWorld.clone());view.update({...e,walkDistance:99},true);view.surfaces.forEach((m,i)=>assert.ok(m.matrixWorld.elements.every((v,k)=>Math.abs(v-settled[i].elements[k])<1e-5)));view.dispose();
});
test('motion follows actual travel and simulation pause/speed, then stops at the gate without changing attacks',()=>{
 let s=actFrontier(createFrontier('defense'),{type:'start'});s.spawnIn=999;s.remaining=1;s.enemies=[{...enemy(1),x:-22,z:-26,path:1,walkDistance:0}];const a=stepFrontier(s,.02),b=stepFrontier({...s,speed:2},.02);assert.ok(Math.abs(b.enemies[0].walkDistance!-2*a.enemies[0].walkDistance!)<1e-8);assert.ok(Math.abs(a.enemies[0].heading!-Math.atan2(10,11))<1e-8);assert.equal(s.enemies[0].walkDistance,0);const paused=actFrontier(a,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);
 s.enemies=[{...enemy(1),...CORE,path:3,walkDistance:7,cooldown:0}];const stopped=stepFrontier(s,.05);assert.equal(stopped.enemies[0].walkDistance,7);assert.equal(stopped.enemies[0].moving,false);assert.equal(stopped.enemies[0].restTime,.05);assert.equal(stopped.coreHp,170);
});
test('missing GLB still batches fallback bodies with depth-tested health and a single shared template',()=>{const fallback=woodFallback(),batch=new WoodBatch(fallback,false);batch.update([enemy(1),enemy(2)],true,camera);assert.equal(batch.meshes.length,4);assert.equal(batch.meshes[0].count,2);assert.equal(batch.views.get(1)!.surfaces[0].geometry,batch.views.get(2)!.surfaces[0].geometry);batch.root.traverse(o=>{if('material'in o)assert.equal((o.material as {depthTest:boolean}).depthTest,true);});batch.dispose();});

test('feet retain authored swing clearance on ramps and bridges without accumulating correction while paused',()=>{
 const view=new WoodView(template),point=new Vector3();
 for(const [x,z]of [[-15,-6],[6,0],[2.1,0],[-15,-20]])for(let i=0;i<8;i++)for(const moving of [true,false]){
  const e={...enemy(2),x,z,walkDistance:i/8*WOOD_STRIDE,heading:i*Math.PI/4,moving,restTime:.08};view.update(e,false);
  let low=Infinity;for(const mesh of view.surfaces){if(!mesh.name.startsWith('surface-leg-'))continue;const a=mesh.geometry.attributes.position;for(let k=0;k<a.count;k++){point.fromBufferAttribute(a,k).applyMatrix4(mesh.matrixWorld);low=Math.min(low,point.y-heightAt(point.x,point.z));}}assert.ok(low>=-1e-6,'no terrain penetration');assert.ok(low<.06,'at least one supporting foot');
  const before=view.surfaces.map(m=>m.matrixWorld.clone());for(let k=0;k<5;k++)view.update(e,false);view.surfaces.forEach((m,j)=>assert.ok(m.matrixWorld.elements.every((v,k)=>Math.abs(v-before[j].elements[k])<1e-6),'paused poses do not drift'));
 }view.dispose();
});
