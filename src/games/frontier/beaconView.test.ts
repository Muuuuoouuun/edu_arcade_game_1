import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{Matrix4,Vector3}from'three';
import{BeaconView,BEACON_RADIUS}from'./beaconView.ts';import{BEACON_CAPTURE}from'./beacon.ts';import{createFrontier,actFrontier,stepFrontier,BEACON}from'./engine.ts';
async function model(){const b=readFileSync('public/defense/models/frontier-beacon.glb');return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const matrices=(v:BeaconView)=>{v.root.updateMatrixWorld(true);const values:number[]=[];v.root.traverse(o=>values.push(...o.matrixWorld.elements));return values;};
test('authored beacon stays grounded and its four hinges follow capture, pause and reduced motion',async()=>{
 const v=new BeaconView();v.setModel(await model());const base=v.root.getObjectByName('fixed-foundation')!,gem=v.root.getObjectByName('signal-crystal')!;
 v.update(0,false);v.root.updateMatrixWorld(true);const fixed=base.matrixWorld.toArray(),idle=matrices(v),low=gem.getWorldPosition(new Vector3()).y;
 v.update(.5,false);assert.deepEqual(base.matrixWorld.toArray(),fixed);const half=matrices(v);assert.notDeepEqual(half,idle);v.update(.5,false);assert.deepEqual(matrices(v),half);
 v.update(1,false);const claimed=matrices(v);assert.ok(Math.abs(gem.getWorldPosition(new Vector3()).y-low-.4)<1e-5);assert.deepEqual(base.matrixWorld.toArray(),fixed);
 v.update(.5,true);assert.deepEqual(matrices(v),idle);v.update(1,true);assert.deepEqual(matrices(v),claimed);
 // Rewinding/reselecting and repeated reads must not latch LoopOnce's finished state.
 v.update(.5,false);assert.deepEqual(matrices(v),half);v.update(0,false);assert.deepEqual(matrices(v),idle);assert.equal(v.root.children.length,2);v.dispose();
});
test('fallback captures with a fixed footing and accurate ground radius',()=>{
 const v=new BeaconView();v.update(.5,false);assert.equal(v.pose,.5);v.update(.5,true);assert.equal(v.pose,0);v.update(1,true);assert.equal(v.pose,1);
 assert.equal(v.ring.count,32);const m=new Matrix4();v.ring.getMatrixAt(0,m);const p=v.ring.geometry.getAttribute('position');let max=0;for(let i=0;i<p.count;i++){const q=new Vector3().fromBufferAttribute(p,i).applyMatrix4(m);max=Math.max(max,Math.hypot(q.x,q.z));assert.ok(Math.abs(q.y-.09)<1e-6);}assert.ok(Math.abs(max-BEACON_RADIUS)<1e-6);v.dispose();
});
test('capture is strictly in range, pauses, scales with speed, preserves progress and pays once',()=>{
 let s=actFrontier(createFrontier('command'),{type:'start'});s.remaining=100;s.spawnIn=1e6;Object.assign(s.hero,{x:BEACON.x,z:BEACON.z+BEACON_CAPTURE.radius,target:{x:BEACON.x,z:BEACON.z+BEACON_CAPTURE.radius}});
 s=stepFrontier(s,.05);assert.equal(s.beacon,0);s.hero.z-=1;s.hero.target={x:s.hero.x,z:s.hero.z};const initial=s;
 s=stepFrontier(s,.05);assert.ok(Math.abs(s.beacon-.05/3)<1e-8);const paused=actFrontier(s,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);
 const fast=stepFrontier(actFrontier(initial,{type:'speed'}),.05);assert.ok(Math.abs(fast.beacon-.1/3)<1e-8);
 const away={...s,hero:{...s.hero,x:0,target:{x:0,z:s.hero.z}}};assert.equal(stepFrontier(away,.05).beacon,s.beacon);
 for(let i=0;i<200;i++)s=stepFrontier(s,.05);assert.equal(s.beacon,1);assert.equal(s.gold,180+BEACON_CAPTURE.reward);
});
test('incomplete model leaves the interactive fallback usable',async()=>{const v=new BeaconView(),g=await model();g.animations=[];assert.throws(()=>v.setModel(g));v.update(.75,false);assert.equal(v.loaded,false);assert.equal(v.pose,.75);v.dispose();});
