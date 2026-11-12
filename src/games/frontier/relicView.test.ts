import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {Mesh} from 'three';
import {RelicView,validRelicModel} from './relicView.ts';import {RELIC_PICKUP} from './relic.ts';import {CRYSTALS,actFrontier,createFrontier,stepFrontier} from './engine.ts';import {shockwaveSurface} from './effectsView.ts';
async function model(){const b=readFileSync('public/defense/models/frontier-relic.glb');return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

test('pickup is strictly within its existing radius, heals once, and records simulation time immutably',()=>{
 let s=actFrontier(createFrontier('solo'),{type:'start'});s.enemies=[];s.hero.hp=30;const p=CRYSTALS[0];s.hero.x=p.x+RELIC_PICKUP.radius;s.hero.z=p.z;s.hero.target={x:s.hero.x,z:s.hero.z};
 const out=actFrontier(s,{type:'interact'});assert.equal(out.crystals.length,0);assert.equal(out.hero.hp,30);
 s.hero.x-=.01;s.time=4;const claimed=actFrontier(s,{type:'interact'});assert.equal(claimed.hero.hp,55);assert.deepEqual(claimed.crystals,[0]);assert.equal(claimed.crystalClaimedAt?.[0],4);assert.equal(s.crystalClaimedAt,undefined);
 const again=actFrontier(claimed,{type:'interact'});assert.equal(again.hero.hp,55);assert.deepEqual(again.crystals,[0]);assert.equal(again.crystalClaimedAt?.[0],4);
 const paused=actFrontier(claimed,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);assert.equal(actFrontier(paused,{type:'interact'}),paused);
 const fast=stepFrontier(actFrontier(claimed,{type:'speed'}),.05);near(fast.time,4.1);
});

test('world ring follows the height field and uses the real pickup radius',()=>{
 for(const p of [CRYSTALS[0],CRYSTALS[1],{x:3,z:2.7}]){
  const v=new RelicView(p),g=v.ring.geometry,a=g.getAttribute('position'),ix=g.getIndex()!,n=g.drawRange.count;assert.ok(n>0);let max=0;
  for(let i=0;i<n;i++){const j=ix.getX(i),x=a.getX(j),z=a.getZ(j),y=a.getY(j);max=Math.max(max,Math.hypot(x-p.x,z-p.z));near(y,shockwaveSurface(x,z)+.09);}
  assert.ok(max<=RELIC_PICKUP.radius+.00001);assert.ok(max>=RELIC_PICKUP.radius-.001);v.update(false,undefined,0,true,true);assert.equal(v.ring.visible,true);v.update(true,0,0,true,true);assert.equal(v.ring.visible,false);v.dispose();
 }
});

test('authored and fallback models preserve pickup reaction, pause, speed and reduced motion',async()=>{
 const g=await model();assert.equal(validRelicModel(g.scene),true);const a=new RelicView(CRYSTALS[0]),b=new RelicView(CRYSTALS[1]);a.setModel(g.scene);b.setModel(g.scene);
 const ma=a.root.getObjectByName('surface-relic-core') as Mesh,mb=b.root.getObjectByName('surface-relic-core') as Mesh;assert.equal(ma.geometry,mb.geometry);assert.equal(ma.material,mb.material);
 a.update(false,undefined,3,true,false);const core=a.root.getObjectByName('relic-core')!;assert.equal(a.ring.visible,true);near(core.scale.x,1);
 a.update(true,3,3.2,true,false);near(core.scale.x,.5);assert.equal(a.ring.visible,false);const pose=core.position.toArray();a.update(true,3,3.2,true,false);assert.deepEqual(core.position.toArray(),pose);
 a.update(true,3,3.4,true,false);assert.equal(core.visible,false);a.update(true,3,3,true,true);assert.equal(core.visible,false);a.update(true,undefined,9,true,false);assert.equal(core.visible,false);
 const fallback=new RelicView(CRYSTALS[2]);fallback.update(true,2,2.2,true,false);near(fallback.pose,.5);fallback.update(true,2,2.4,true,false);near(fallback.pose,0);
 const broken=g.scene.clone(true),part=broken.getObjectByName('relic-core')!;part.parent!.remove(part);assert.equal(validRelicModel(broken),false);assert.throws(()=>fallback.setModel(broken));assert.equal(fallback.loaded,false);
 a.dispose();b.dispose();fallback.dispose();
});
