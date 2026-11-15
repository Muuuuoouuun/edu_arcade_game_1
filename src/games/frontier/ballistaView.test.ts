import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{Matrix4,Vector3,PerspectiveCamera}from'three';
import{BallistaView,BallistaBatch}from'./ballistaView.ts';
const bytes=readFileSync(new URL('../../../public/defense/models/frontier-ballista-game.glb',import.meta.url));
const template=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
test('batched articulated towers share geometry but retain independent grounded bases and firing poses',()=>{
 const batch=new BallistaBatch(template),views=Array.from({length:6},()=>new BallistaView(template));
 const towers=views.map((v,i)=>{v.root.position.set(i*5,0,0);return{pad:i,level:1,cooldown:0,heading:i*Math.PI/3,actionTime:i%2?.14:0,targetId:99,released:true};});
 views.forEach((v,i)=>v.update(towers[i],false));batch.update(views);assert.equal(batch.meshes.length,7);const bases:Matrix4[]=[];
 for(let j=0;j<batch.meshes.length;j++){assert.equal(batch.meshes[j].count,6);for(let i=0;i<6;i++){const actual=new Matrix4();batch.meshes[j].getMatrixAt(i,actual);assert.ok(actual.elements.every((v,k)=>Math.abs(v-views[i].surfaces[j].matrixWorld.elements[k])<1e-5));assert.equal(views[i].surfaces[j].visible,false);assert.equal(views[i].surfaces[j].geometry,batch.meshes[j].geometry);}}
 const baseIndex=views[0].surfaces.findIndex(m=>m.name==='surface-piercing-ballista');for(let i=0;i<6;i++){const m=new Matrix4();batch.meshes[baseIndex].getMatrixAt(i,m);bases.push(m);}
 towers.forEach(t=>{t.heading+=.7;t.actionTime=.25;});views.forEach((v,i)=>v.update(towers[i],false));batch.update(views);for(let i=0;i<6;i++){const m=new Matrix4();batch.meshes[baseIndex].getMatrixAt(i,m);assert.deepEqual(m.elements,bases[i].elements);}
 const before=views[0].surfaces.map(m=>m.matrixWorld.clone());views[0].update(towers[0],false);batch.update(views);views[0].surfaces.forEach((m,i)=>assert.deepEqual(m.matrixWorld.elements,before[i].elements));
 views[0].update(towers[0],true);assert.ok(Math.abs(views[0].root.getObjectByName('recoil-carriage')!.position.z)<1e-8);assert.ok(Math.abs(views[0].aim.rotation.y-towers[0].heading)<1e-8);batch.dispose();
});
test('batch culls distant towers and can restore a second shot without losing the renderer surface',()=>{
 const batch=new BallistaBatch(template),view=new BallistaView(template);const tower={pad:0,level:3,cooldown:0,heading:0,actionTime:.14,targetId:1,released:true};const camera=new PerspectiveCamera(45,1,.1,100);camera.position.set(0,8,15);camera.lookAt(new Vector3(0,2,0));
 view.update(tower,false);batch.update([view],camera);assert.equal(batch.meshes[0].count,1);view.root.position.x=1000;batch.update([view],camera);assert.equal(batch.meshes[0].count,0);view.root.position.x=0;
 for(const actionTime of [null,0,.14])view.update({...tower,actionTime},false);batch.update([view],camera);assert.equal(batch.meshes[0].count,1);assert.ok(view.root.getObjectByName('recoil-carriage')!.position.z<-.1);batch.dispose();
});
