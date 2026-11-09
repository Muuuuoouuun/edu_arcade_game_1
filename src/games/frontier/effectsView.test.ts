import test from 'node:test';import assert from 'node:assert/strict';import {Matrix4,Mesh} from 'three';
import {EffectsView,contactChip,boltSplinter,shockwaveSurface} from './effectsView.ts';import {createFrontier,actFrontier,stepFrontier,heightAt,type Frontier} from './engine.ts';
type Fx=Frontier['effects'][number];const fx=(kind:Fx['kind']='hammer',life=.09,id=1):Fx=>({id,kind,life,from:{x:-15,z:-7},to:{x:-15,z:-7}});
test('contact debris appears only when the simulation produces a landed effect; pause and speed share its clock',()=>{
 let s=actFrontier(createFrontier('solo'),{type:'start'});s.enemies=[];s=actFrontier(s,{type:'skill'});const v=new EffectsView();
 for(let i=0;i<5;i++)s=stepFrontier(s,.05);v.update(s.effects,false);assert.equal(v.chips.count,0);
 s=stepFrontier(s,.03);v.update(s.effects,false);assert.equal(v.chips.count,8);const snapshot=Array.from(v.chips.instanceMatrix.array),copy=structuredClone(s);
 const paused=actFrontier(s,{type:'pause'});v.update(stepFrontier(paused,.05).effects,false);assert.deepEqual(Array.from(v.chips.instanceMatrix.array),snapshot);assert.deepEqual(s,copy);
 let fast=actFrontier(s,{type:'speed'});fast=stepFrontier(fast,.04);const normal=stepFrontier(stepFrontier(s,.04),.04);v.update(fast.effects,false);const fastMatrix=Array.from(v.chips.instanceMatrix.array);v.update(normal.effects,false);for(let i=0;i<64;i++)assert.ok(Math.abs(v.chips.instanceMatrix.array[i]-fastMatrix[i])<1e-5);
 for(let i=0;i<5;i++)s=stepFrontier(s,.05);v.update(s.effects,false);assert.equal(v.chips.count,0);v.dispose();
});
test('all effect kinds reuse bounded geometry and materials through expiry and repeated combat',()=>{
 const v=new EffectsView(),kinds:Fx['kind'][]=['hammer','shockwave','club','impact','skill','shot','hit'];v.update(kinds.map(k=>fx(k)),false);
 const meshes=v.root.children.filter(o=>o instanceof Mesh&&o!==v.chips) as Mesh[];const materials=meshes.map(m=>m.material),geometries=new Set(meshes.map(m=>m.geometry));let disposals=0;for(const g of geometries)g.addEventListener('dispose',()=>disposals++);
 for(let i=0;i<500;i++){v.update([],false);v.update(kinds.map((k,j)=>fx(k,.18-(i%17)*.01,i*10+j)),false);assert.equal(v.allocated,7);assert.deepEqual(meshes.map(m=>m.material),materials);}assert.equal(disposals,0);
 v.update(Array.from({length:300},(_,i)=>fx('hammer',.1,i)),false);assert.equal(v.allocated,128);assert.equal(v.chips.count,1024);v.update([],false);assert.equal(v.chips.count,0);assert.ok(meshes.every(m=>!m.visible));v.dispose();assert.equal(disposals,geometries.size);v.dispose();assert.equal(disposals,geometries.size);
});
test('reduced motion keeps contact rings but suppresses airborne chips and ring expansion',()=>{const v=new EffectsView();v.update([fx()],true);assert.equal(v.chips.count,0);const m=v.root.children.find(o=>o instanceof Mesh&&o!==v.chips) as Mesh;const matrix=m.matrix.clone();v.update([fx('hammer',.02)],true);assert.deepEqual(m.matrix,matrix);assert.ok(m.visible);assert.equal((m.material as any).depthTest,true);assert.equal(v.chips.material instanceof Array,false);v.dispose();});
test('debris is deterministic and rises then falls above flat, ramp and bridge surfaces',()=>{for(const to of [{x:-15,z:2},{x:-15,z:-7},{x:6,z:0}])for(const kind of ['hammer','shockwave'] as const){const e={...fx(kind),to};for(let i=0;i<8;i++){const c=contactChip(e,i);assert.deepEqual(c,contactChip(e,i));assert.ok(c.y>=heightAt(c.x,c.z)+.079);assert.ok(c.size>0);}if(kind==='hammer'&&to.z===2){const a=contactChip({...e,life:.18},0),b=contactChip({...e,life:.09},0),c=contactChip({...e,life:.001},0);assert.ok(b.y>a.y&&b.y>c.y);}}});
test('reusing a ray slot for a ground ring resets its matrix and disappearing effects do not persist',()=>{const v=new EffectsView();v.update([{...fx('shot'),to:{x:12,z:20}}],false);v.update([fx('hammer')],false);const m=v.root.children.find(o=>o instanceof Mesh&&o!==v.chips) as Mesh;const other=new EffectsView();other.update([fx('hammer')],false);const n=other.root.children.find(o=>o instanceof Mesh&&o!==other.chips) as Mesh;assert.deepEqual(m.matrix,n.matrix);const chip=new Matrix4();v.chips.getMatrixAt(0,chip);assert.ok(chip.elements.every(Number.isFinite));v.update([fx('hammer',0)],false);assert.equal(v.chips.count,0);assert.equal(m.visible,false);v.dispose();other.dispose();});
test('shockwave follows visible ground and water and never draws a vertical bridge across a terrain break',()=>{
 const view=new EffectsView();
 for(const center of [{x:-15,z:8},{x:-15,z:-7},{x:-15,z:-13},{x:-1,z:0},{x:6,z:0}]){
  view.update([{...fx('shockwave',.09),from:center,to:center}],false);
  const m=view.root.children.find(o=>o instanceof Mesh&&o!==view.chips) as Mesh;
  const a=m.geometry.getAttribute('position'),ix=m.geometry.getIndex()!;
  for(let i=0;i<64;i++){
   let min=Infinity,max=-Infinity;
   for(let j=0;j<4;j++){
    const n=i*4+j,x=a.getX(n),z=a.getZ(n),y=a.getY(n);
    const surface=x>3&&x<9&&Math.abs(z)>2.8?-2.6:heightAt(x,z);
    assert.ok(Math.abs(y-(surface+.09))<1e-5);min=Math.min(min,y);max=Math.max(max,y);
   }
   if(max-min>=.9)assert.equal(ix.getX(i*6),ix.getX(i*6+1),'discontinuity is hidden');
  }
  const snapshot=Array.from(a.array);view.update([{...fx('shockwave',.09),from:center,to:center}],false);assert.deepEqual(Array.from(a.array),snapshot);
 }
 view.update([{...fx('shockwave',.09),to:{x:-15,z:-7}}],true);const m=view.root.children.find(o=>o instanceof Mesh&&o!==view.chips) as Mesh;
 const pos=Array.from(m.geometry.getAttribute('position').array);view.update([{...fx('shockwave',.01),to:{x:-15,z:-7}}],true);assert.deepEqual(Array.from(m.geometry.getAttribute('position').array),pos);view.dispose();
});

test('bolt fragments follow incoming momentum, gravity and ground without affecting reduced-motion or pooled lifetime',()=>{
 const effect={...fx('impact',.46),from:{x:-20,z:4},to:{x:-15,z:4}},view=new EffectsView();
 for(let i=0;i<8;i++){const start=boltSplinter(effect,i),mid=boltSplinter({...effect,life:.26},i),end=boltSplinter({...effect,life:.001},i);assert.ok(Math.abs(start.x-effect.to.x)<1e-8);assert.ok(mid.x>start.x&&end.x>mid.x,'incoming direction');assert.ok(mid.y>start.y&&end.y<mid.y,'gravity');assert.ok(end.y>=heightAt(end.x,end.z)+.059);}
 const reverse={...effect,from:{x:-10,z:4}};assert.ok(boltSplinter({...reverse,life:.26},0).x<reverse.to.x);
 const stationary={...effect,from:effect.to};assert.ok(Object.values(boltSplinter(stationary,0)).every(Number.isFinite));
 view.update([effect],false);assert.equal(view.impactChipCount,8);const snapshot=Array.from(view.chips.instanceMatrix.array);view.update([effect],false);assert.deepEqual(Array.from(view.chips.instanceMatrix.array),snapshot);
 view.update([effect],true);assert.equal(view.impactChipCount,0);view.update([],false);assert.equal(view.chips.count,0);assert.equal(view.impactChipCount,0);view.dispose();
});
test('bolt splinters respect paused simulation and 2x effect lifetime without changing damage',()=>{
 let s=actFrontier(createFrontier('defense'),{type:'start'});s.remaining=1;s.spawnIn=999;s.enemies=[{id:99,x:-15,z:4,hp:80,maxHp:80,cooldown:99,path:3}];s.bolts=[{id:7,pad:0,targetId:99,position:{x:-15,y:1.1,z:3.8},previous:{x:-15,y:1.1,z:3.7},damage:23,life:1}];
 s=stepFrontier(s,.01);assert.equal(s.enemies[0].hp,57);assert.equal(s.effects.find(e=>e.kind==='impact')?.life,.46);
 const paused=actFrontier(s,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);const view=new EffectsView();view.update(paused.effects,false);const before=Array.from(view.chips.instanceMatrix.array);view.update(stepFrontier(paused,.05).effects,false);assert.deepEqual(Array.from(view.chips.instanceMatrix.array),before);
 const normal=stepFrontier(stepFrontier(s,.04),.04),fast=stepFrontier(actFrontier(s,{type:'speed'}),.04);view.update(normal.effects,false);const pose=Array.from(view.chips.instanceMatrix.array);view.update(fast.effects,false);for(let i=0;i<pose.length;i++)assert.ok(Math.abs(pose[i]-view.chips.instanceMatrix.array[i])<1e-5);assert.equal(fast.enemies[0].hp,57);view.dispose();
});

test('ballistic splinters never sink below ramps, bridge or river surface',()=>{for(const to of [{x:-15,z:-6},{x:6,z:0},{x:3,z:6}])for(const life of [.46,.36,.26,.16,.06,.001])for(let i=0;i<8;i++){const c=boltSplinter({...fx('impact',life),from:{x:to.x-2,z:to.z},to},i);assert.ok(c.y>=shockwaveSurface(c.x,c.z)+.059,'visible surface clearance');}});
