import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{Vector3,Box3}from'three';
import{FrostGateView,GATE_IMPACT_DURATION}from'./gateView.ts';import{createFrontier,actFrontier,stepFrontier,CORE}from'./engine.ts';
const load=async()=>{const b=readFileSync('public/defense/models/frontier-frost-gate-impact.glb');return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const matrices=(v:FrostGateView)=>{v.root.updateMatrixWorld(true);const a:number[]=[];v.root.traverse(o=>a.push(...o.matrixWorld.elements));return a;};
function battle(){let s=actFrontier(createFrontier('defense'),{type:'start'});s.remaining=100;s.spawnIn=1e6;s.enemies=[{id:99,x:CORE.x,z:CORE.z-1.7,hp:62,maxHp:62,cooldown:0,path:3}];return s;}
test('gate recoil starts only at actual club contact; pause and speed use the same simulation clock',()=>{
 let s=battle();s=stepFrontier(s,.05);assert.equal(s.coreHitAt,undefined);for(let i=0;i<5;i++)s=stepFrontier(s,.05);assert.equal(s.coreHp,180);assert.equal(s.coreHitAt,undefined);
 s=stepFrontier(s,.05);assert.equal(s.coreHp,170);assert.equal(s.coreHitAt,s.time);const hit=s.coreHitAt;
 const v=new FrostGateView();v.update(s.time,hit,s.coreHp,false,false);assert.equal(v.state.age,0);assert.equal(v.ring.visible,true);
 const p=actFrontier(s,{type:'pause'});assert.equal(stepFrontier(p,.05),p);const initial=matrices(v);v.update(p.time,p.coreHitAt,p.coreHp,false,false);assert.deepEqual(matrices(v),initial);
 const fast=stepFrontier(actFrontier(s,{type:'speed'}),.05);assert.ok(Math.abs(fast.time-s.time-.1)<1e-8);v.update(fast.time,fast.coreHitAt,fast.coreHp,false,false);assert.ok(Math.abs(v.state.age-.1)<1e-8);assert.equal(fast.coreHp,170);
 for(let i=0;i<25;i++)s=stepFrontier(s,.05);assert.equal(s.coreHp,160);assert.ok(s.coreHitAt!>hit!);assert.equal(createFrontier('defense').coreHitAt,undefined);v.dispose();
});
test('authored and fallback recoil share pose timing; stone stays fixed and feet stay grounded',async()=>{
 const v=new FrostGateView(),f=new FrostGateView();v.setModel(await load());v.update(1,undefined,180,false,false);const idle=matrices(v),stone=v.root.getObjectByName('gate-fixed-stone')!,fixed=stone.matrixWorld.toArray();assert.ok(Math.abs(new Box3().setFromObject(stone).min.y)<1e-6);
 for(const age of[0,.04,5/60,.15,.3,.5,.55]){v.update(1+age,1,170,false,false);f.update(1+age,1,170,false,false);matrices(v);assert.deepEqual(stone.matrixWorld.toArray(),fixed);for(let i=0;i<2;i++)assert.ok(Math.abs(v.angles[i]-f.angles[i])<1e-5,`leaf${i} at${age}`);}
 v.update(2,undefined,180,false,false);assert.deepEqual(matrices(v),idle);v.update(2.08,2,160,false,false);assert.notDeepEqual(matrices(v),idle);const held=matrices(v);v.update(2.08,2,160,false,false);assert.deepEqual(matrices(v),held);assert.equal(GATE_IMPACT_DURATION,.55);v.dispose();f.dispose();
});
test('open passage poses do not accumulate, reduced motion keeps static damage cue, defeat does not need a running clock',async()=>{
 const v=new FrostGateView();v.setModel(await load());v.update(3,undefined,180,true,false);const open=matrices(v);for(let i=0;i<50;i++)v.update(3,undefined,180,true,false);assert.deepEqual(matrices(v),open);
 const leaf=v.root.getObjectByName('gate-door-0')!;assert.ok(new Box3().setFromObject(leaf).getSize(new Vector3()).z>1.4,'door is swung out of passage');
 v.update(4.08,4,170,false,true);matrices(v);assert.ok(v.angles.every(x=>Math.abs(x)<1e-8));assert.equal(v.ring.visible,true);assert.equal(v.ring.scale.x,1);
 v.update(5,5,0,false,false);assert.equal(v.state.breached,true);const breached=matrices(v);v.update(5,5,0,false,false);assert.deepEqual(matrices(v),breached);v.update(0,undefined,180,false,false);assert.equal(v.ring.visible,false);assert.ok(v.angles.every(x=>Math.abs(x)<1e-8));v.dispose();
});
test('invalid clip is rejected while fallback remains operational',async()=>{const v=new FrostGateView(),g=await load();g.animations=[];assert.throws(()=>v.setModel(g));v.update(.08,0,170,false,false);assert.equal(v.loaded,false);assert.ok(Math.abs(v.angles[0])>.1);v.dispose();});
