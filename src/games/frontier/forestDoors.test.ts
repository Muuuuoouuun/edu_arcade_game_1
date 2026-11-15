import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {Box3,Mesh,PerspectiveCamera,Raycaster,Vector3} from 'three';
import {ForestDoors} from './forestDoors.ts';import {actFrontier,createFrontier,stepFrontier,CORE} from './engine.ts';
import {cameraFrame} from './camera.ts';
const load=async()=>{const b=readFileSync('public/defense/models/frontier-forest-doors.glb');return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const matrices=(v:ForestDoors)=>{v.root.updateMatrixWorld(true);const a:number[]=[];v.root.traverse(o=>a.push(...o.matrixWorld.elements));return a;};
test('forest door asset keeps reproducible source, rigid leaves and one actual clip',async()=>{
 const meta=JSON.parse(readFileSync('public/defense/models/frontier-forest-doors.json','utf8'));
 for(const f of meta.files)assert.equal(createHash('sha256').update(readFileSync(f.path)).digest('hex'),f.sha256,f.path);
 const g=await load();assert.ok(g.scene.getObjectByName('forest-leaf-0'));assert.ok(g.scene.getObjectByName('forest-leaf-1'));assert.equal(g.animations.length,1);assert.equal(g.animations[0].name,'forest-door-impact');assert.ok(Math.abs(g.animations[0].duration-.55)<1e-5);
 let meshes=0;g.scene.traverse(o=>{if('isMesh'in o&&o.isMesh)meshes++;});assert.equal(meshes,2);
});
test('door reaction follows actual contact, pause and simulation speed',async()=>{
 let s=actFrontier(createFrontier('defense'),{type:'start'});s.remaining=100;s.spawnIn=1e6;s.enemies=[{id:99,x:CORE.x,z:CORE.z-1.7,hp:62,maxHp:62,cooldown:0,path:3}];
 for(let i=0;i<6;i++)s=stepFrontier(s,.05);assert.equal(s.coreHp,180);assert.equal(s.coreHitAt,undefined);s=stepFrontier(s,.05);assert.equal(s.coreHp,170);assert.equal(s.coreHitAt,s.time);
 const v=new ForestDoors();v.setModel(await load());v.update(s.time,s.coreHitAt,s.coreHp,false,false);const paused=actFrontier(s,{type:'pause'}),before=matrices(v);assert.equal(stepFrontier(paused,.05),paused);v.update(paused.time,paused.coreHitAt,paused.coreHp,false,false);assert.deepEqual(matrices(v),before);
 const fast=stepFrontier(actFrontier(s,{type:'speed'}),.05);v.update(fast.time,fast.coreHitAt,fast.coreHp,false,false);assert.ok(Math.abs(v.state.age-.1)<1e-8);assert.ok(Math.abs(v.angles[0])>.08);v.dispose();
});
test('authored and fallback doors open the passage without accumulating offsets',async()=>{
 const authored=new ForestDoors(),fallback=new ForestDoors();authored.setModel(await load());
 for(const age of [0,.04,5/60,.15,.3,.5,.55]){authored.update(1+age,1,170,false,false);fallback.update(1+age,1,170,false,false);for(let i=0;i<2;i++)assert.ok(Math.abs(authored.angles[i]-fallback.angles[i])<.002,`leaf ${i} at ${age}`);}
 authored.update(2,undefined,180,false,false);matrices(authored);const leaf=authored.root.getObjectByName('forest-door-0')!;assert.ok(Math.abs(new Box3().setFromObject(leaf).min.y)<.002,'door is grounded at the existing gate anchor');const ray=new Raycaster(new Vector3(0,1.5,-5),new Vector3(0,0,1));assert.ok(ray.intersectObject(authored.root,true).length,'closed leaves meet at the center');
 authored.update(2,undefined,180,true,false);const open=matrices(authored);assert.equal(ray.intersectObject(authored.root,true).length,0,'open passage is clear');for(let i=0;i<20;i++)authored.update(2,undefined,180,true,false);assert.deepEqual(matrices(authored),open);
 fallback.update(2,undefined,180,true,false);const fallbackOpen=matrices(fallback);assert.equal(ray.intersectObject(fallback.root,true).length,0,'fallback passage is clear');for(let i=0;i<20;i++)fallback.update(2,undefined,180,true,false);assert.deepEqual(matrices(fallback),fallbackOpen);
 authored.update(3.08,3,170,false,true);assert.ok(authored.angles.every(x=>Math.abs(x)<1e-7));assert.equal(authored.ring.visible,true);assert.equal(authored.ring.scale.x,1);
 authored.update(4,4,0,false,false);assert.equal(authored.state.breached,true);assert.ok(authored.angles.every(x=>Math.abs(x)>1));authored.dispose();fallback.dispose();
});
test('invalid door clip keeps a working fallback',async()=>{const v=new ForestDoors(),g=await load();g.animations=[];assert.throws(()=>v.setModel(g));v.update(.08,0,170,false,false);assert.equal(v.loaded,false);assert.ok(Math.abs(v.angles[0])>.1);v.dispose();});
test('open doors fade only when the mobile camera sees the hero through them',async()=>{
 for(const loaded of [false,true]){const v=new ForestDoors();if(loaded)v.setModel(await load());v.root.position.set(CORE.x,0,CORE.z);v.update(0,undefined,180,true,false);
  const s=createFrontier('solo');s.hero.x=-15;s.hero.z=22;const frame=cameraFrame(s,{width:844,height:390,zoom:1,overview:false,reduced:true}),camera=new PerspectiveCamera();camera.position.copy(frame.target).add(frame.offset);camera.lookAt(frame.target);camera.updateMatrixWorld();
  const target=new Vector3(s.hero.x,1.5,s.hero.z);v.updateOcclusion(camera,target);assert.equal(v.faded,true);const materials:{opacity:number;depthWrite:boolean}[]=[];v.root.traverse(o=>{if(o instanceof Mesh&&o!==v.ring)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.push(m);});assert.ok(materials.every(m=>m.opacity===.18&&!m.depthWrite));
  v.updateOcclusion(null);assert.equal(v.faded,false);assert.ok(materials.every(m=>m.opacity===1&&m.depthWrite));v.dispose();
 }
});
