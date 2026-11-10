import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import {GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import {Matrix4,Mesh,PerspectiveCamera,Vector3}from'three';
import {WoodBatch,WoodView,woodFallback,WOOD_STRIDE}from'./woodView.ts';import{shockwaveSurface}from'./effectsView.ts';import{WOOD_ATTACK}from'./woodAttack.ts';import{actFrontier,createFrontier,stepFrontier,CORE,heightAt,type Enemy}from'./engine.ts';
const data=readFileSync(new URL('../../../public/defense/models/frontier-wood-game.glb',import.meta.url));const template=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const camera=new PerspectiveCamera(60,1,.1,200);camera.position.set(0,30,50);camera.lookAt(0,0,0);
const enemy=(id:number):Enemy=>({id,x:(id%5)*2,z:Math.floor(id/5)*2,hp:40,maxHp:62,cooldown:0,path:0,walkDistance:id*.113,heading:id*.4,moving:true,restTime:0});
test('combat health bars stay hidden when the enemy batch grows',()=>{
 const batch=new WoodBatch(template);assert.equal(batch.root.getObjectByName('wood-health')?.visible,false);
 batch.update(Array.from({length:30},(_,i)=>enemy(i)),false,camera);
 assert.equal(batch.root.getObjectByName('wood-health')?.visible,false);assert.equal(batch.meshes[0].count,30);batch.dispose();
});
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
test('motion follows actual travel and simulation pause/speed, then stops at the gate and prepares a delayed strike',()=>{
 let s=actFrontier(createFrontier('defense'),{type:'start'});s.spawnIn=999;s.remaining=1;s.enemies=[{...enemy(1),x:-22,z:-26,path:1,walkDistance:0}];const a=stepFrontier(s,.02),b=stepFrontier({...s,speed:2},.02);assert.ok(Math.abs(b.enemies[0].walkDistance!-2*a.enemies[0].walkDistance!)<1e-8);assert.ok(Math.abs(a.enemies[0].heading!-Math.atan2(10,11))<1e-8);assert.equal(s.enemies[0].walkDistance,0);const paused=actFrontier(a,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);
 s.enemies=[{...enemy(1),...CORE,path:3,walkDistance:7,cooldown:0}];const stopped=stepFrontier(s,.05);assert.equal(stopped.enemies[0].walkDistance,7);assert.equal(stopped.enemies[0].moving,false);assert.equal(stopped.enemies[0].restTime,.05);assert.equal(stopped.coreHp,180);assert.equal(stopped.enemies[0].attack?.time,0);
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

const strikeData=readFileSync(new URL('../../../public/defense/models/frontier-wood-strike-game.glb',import.meta.url));
const strikeTemplate=await new GLTFLoader().parseAsync(strikeData.buffer.slice(strikeData.byteOffset,strikeData.byteOffset+strikeData.byteLength),'');
const combined={scene:template.scene,animations:[...template.animations,...strikeTemplate.animations]};
test('attack enters from the current step, lowers the club, settles exactly and stays frozen/reduced at meaningful poses',()=>{
 const view=new WoodView(combined),e={...enemy(2),x:-15,z:8},attack={time:0,target:'hero' as const,heading:0,hit:false,entryDistance:e.walkDistance!};view.update(e,false);const walking=view.surfaces.map(m=>m.matrixWorld.clone());view.update({...e,moving:false,attack},false);view.surfaces.forEach((m,j)=>assert.ok(m.matrixWorld.elements.every((v,k)=>Math.abs(v-walking[j].elements[k])<1e-6),'no attack entry pop'));
 const grip=view.model.getObjectByName('club-grip')!,tip=new Vector3(0,1.8,0);view.update({...e,moving:false,attack:{...attack,time:.18}},false);const prep=tip.clone().applyMatrix4(grip.matrixWorld);view.update({...e,moving:false,attack:{...attack,time:.28,hit:true}},false);const hit=tip.clone().applyMatrix4(grip.matrixWorld);assert.ok(prep.y-hit.y>.5);
 for(const time of [0,.05,.1,.18,.28,.34,.46,.6]){const state={...e,moving:false,attack:{...attack,time,hit:time>=.28}};view.update(state,false);const frozen=view.surfaces.map(m=>m.matrixWorld.clone());for(let i=0;i<5;i++)view.update(state,false);view.surfaces.forEach((m,j)=>assert.deepEqual(m.matrixWorld.elements,frozen[j].elements));}
 view.update({...e,moving:false,attack:{...attack,time:.6,hit:true}},false);const end=view.surfaces.map(m=>m.matrixWorld.clone());view.update({...e,moving:false,restTime:1},false);view.surfaces.forEach((m,j)=>assert.ok(m.matrixWorld.elements.every((v,k)=>Math.abs(v-end[j].elements[k])<1e-5),'returns to rest'));
 view.update({...e,attack:{...attack,time:.02}},true);const reduced=view.surfaces.map(m=>m.matrixWorld.clone());view.update({...e,attack:{...attack,time:.24}},true);view.surfaces.forEach((m,j)=>assert.deepEqual(m.matrixWorld.elements,reduced[j].elements));view.dispose();
});
test('attack warning follows committed heading and disappears at contact, including fallback',()=>{
 for(const authored of [true,false]){const batch=new WoodBatch(authored?combined:woodFallback(),authored);const e={...enemy(1),attack:{time:.18,target:'hero' as const,heading:Math.PI/2,hit:false,entryDistance:0}};batch.update([e],false,camera);const warning=batch.root.getObjectByName('wood-attack-warning') as Mesh;assert.equal(batch.warningCount,1);assert.ok(warning.visible);const a=warning.geometry.getAttribute('position');let far=-Infinity;for(let i=0;i<warning.geometry.drawRange.count/6*4;i++){far=Math.max(far,a.getX(i));assert.ok(Math.abs(a.getY(i)-shockwaveSurface(a.getX(i),a.getZ(i))-.06)<1e-5);}assert.ok(far>e.x+2);batch.update([{...e,attack:{...e.attack,hit:true,time:.28}}],false,camera);assert.equal(batch.warningCount,0);assert.equal(warning.geometry.drawRange.count,0);assert.equal(warning.visible,false);assert.equal(batch.meshes.length,authored?8:4);batch.dispose();}
});
test('warning follows ramp, bridge and river surfaces without vertical walls or bridged shore corners',()=>{
 const batch=new WoodBatch(combined);for(const [x,z,heading] of [[-15,-6,Math.PI],[2.5,3.1,Math.PI/2],[2.95,3.1,Math.atan2(1.35,-1.1)],[6,0,0],[2,3.1,Math.PI/2],[2,3.1,3*Math.PI/4],[10,3.1,5*Math.PI/4]]){const e={...enemy(1),x,z,attack:{time:.1,target:'hero' as const,heading,hit:false,entryDistance:0}};batch.update([e],false,camera);const warning=batch.root.getObjectByName('wood-attack-warning') as Mesh,a=warning.geometry.getAttribute('position'),end=warning.geometry.drawRange.count/6*4;assert.ok(end>0);for(let n=0;n<end;n+=4){let lo=Infinity,hi=-Infinity,cx=0,cy=0,cz=0;for(let i=0;i<4;i++){const px=a.getX(n+i),pz=a.getZ(n+i),y=a.getY(n+i);assert.ok(Math.abs(y-shockwaveSurface(px,pz)-.06)<1e-5);lo=Math.min(lo,y);hi=Math.max(hi,y);cx+=px/4;cy+=y/4;cz+=pz/4;}assert.ok(hi-lo<.90001,'no vertical wall');assert.ok(Math.abs(cy-shockwaveSurface(cx,cz)-.06)<.9,'cell center does not cross a hidden shore');for(const [u,v] of [[0,1],[0,2],[1,3],[2,3]]){const mx=(a.getX(n+u)+a.getX(n+v))/2,mz=(a.getZ(n+u)+a.getZ(n+v))/2,my=(a.getY(n+u)+a.getY(n+v))/2;assert.ok(Math.abs(my-shockwaveSurface(mx,mz)-.06)<.9,'cell edge does not cross a hidden shore');}}}batch.dispose();
});
test('projected warning keeps the committed attack reach and angle in every direction',()=>{
 const batch=new WoodBatch(woodFallback(),false);for(let direction=0;direction<8;direction++){
  const heading=direction*Math.PI/4,e={...enemy(1),x:-15,z:8,attack:{time:.1,target:'hero' as const,heading,hit:false,entryDistance:0}};batch.update([e],true,camera);
  const warning=batch.root.getObjectByName('wood-attack-warning') as Mesh,a=warning.geometry.getAttribute('position'),count=warning.geometry.drawRange.count/6*4;assert.ok(count>0);
  for(let i=0;i<count;i++){const dx=a.getX(i)-e.x,dz=a.getZ(i)-e.z,d=Math.hypot(dx,dz);assert.ok(d>=.55-1e-5&&d<=WOOD_ATTACK.hitReach+1e-5);assert.ok((dx*Math.sin(heading)+dz*Math.cos(heading))/d>=Math.cos(WOOD_ATTACK.halfArc)-1e-5);}
 }batch.dispose();
});
test('shared warning buffer grows with concurrent attacks and drops stale or culled sectors',()=>{
 const batch=new WoodBatch(woodFallback(),false),warning=()=>batch.root.getObjectByName('wood-attack-warning') as Mesh;const enemies=Array.from({length:30},(_,i)=>({...enemy(i),attack:{time:.1,target:'hero' as const,heading:i*Math.PI/4,hit:false,entryDistance:0}}));batch.update(enemies,false,camera);assert.equal(batch.warningCount,30);assert.ok(warning().geometry.drawRange.count>=30*24*6);const g=warning().geometry,position=g.getAttribute('position') as import('three').BufferAttribute,version=position.version;batch.update(enemies,true,camera);assert.equal(warning().geometry,g,'reuse after growth');assert.equal(position.version,version,'stationary warnings do not upload every frame');const changed=[...enemies];changed[0]={...changed[0],attack:{...changed[0].attack,heading:changed[0].attack.heading+.1}};batch.update(changed,false,camera);assert.ok(position.version>version,'changed heading updates the warning');batch.update([{...enemies[0],x:1000}],false,camera);assert.equal(batch.warningCount,0);assert.equal(warning().geometry.drawRange.count,0);batch.dispose();
});
test('attack blending and planted contact keep both soles above ramp and bridge surfaces at every heading',()=>{const view=new WoodView(combined),point=new Vector3();for(const [x,z]of [[-15,-6],[6,0],[2.1,0]])for(let heading=0;heading<8;heading++)for(const time of [0,.05,.1,.18,.28,.34,.46,.6]){view.update({...enemy(3),x,z,heading:heading*Math.PI/4,moving:false,attack:{time,target:'hero',heading:heading*Math.PI/4,hit:time>=.28,entryDistance:.7}},false);let support=Infinity;for(const mesh of view.surfaces){if(!mesh.name.startsWith('surface-leg-'))continue;const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){point.fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld);support=Math.min(support,point.y-heightAt(point.x,point.z));}}assert.ok(support>=-1e-6,'sole must not enter terrain');assert.ok(support<.06,'one supporting foot remains grounded');}view.dispose();});
test('hit recoil follows the source direction, returns to gait, and preserves foot contact on slope and bridge',()=>{
 const view=new WoodView(combined),point=new Vector3();
 for(const [x,z] of [[-15,-6],[6,0],[-15,8]])for(let h=0;h<8;h++)for(const moving of [false,true]){
  const e={...enemy(3),x,z,heading:h*Math.PI/4,moving,restTime:.3,hitAt:2,hitHeading:h*Math.PI/4};
  view.update(e,false,2);const baseline=view.surfaces.map(m=>m.matrixWorld.clone());
  view.update(e,false,2.08);const leaned=view.surfaces.map(m=>m.matrixWorld.clone());assert.ok(leaned.some((m,i)=>m.elements.some((v,k)=>Math.abs(v-baseline[i].elements[k])>1e-3)));
  let support=Infinity;for(const mesh of view.surfaces){if(!mesh.name.startsWith('surface-leg-'))continue;const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){point.fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld);support=Math.min(support,point.y-heightAt(point.x,point.z));}}assert.ok(support>=-1e-6);assert.ok(support<.06);
  for(let i=0;i<3;i++){view.update(e,false,2.08);view.surfaces.forEach((m,j)=>assert.deepEqual(m.matrixWorld.elements,leaned[j].elements));}
  view.update(e,true,2.08);const reduced=view.root.quaternion.clone();view.update({...e,hitAt:undefined},true,2.08);assert.ok(view.root.quaternion.angleTo(reduced)<1e-7);
  view.update(e,false,2.25);view.surfaces.forEach((m,j)=>assert.ok(m.matrixWorld.elements.every((v,k)=>Math.abs(v-baseline[j].elements[k])<1e-5)));
 }
 view.dispose();
});

test('recoil tips the model away from the source for each world direction without moving its root',()=>{
 const view=new WoodView(combined);for(let i=0;i<8;i++){const h=i*Math.PI/4,e={...enemy(8),x:-15,z:4,moving:false,restTime:.3,hitAt:0,hitHeading:h};view.update(e,false,.08);const up=new Vector3(0,1,0).applyQuaternion(view.root.quaternion);assert.ok(up.x*Math.sin(h)+up.z*Math.cos(h)>.1);assert.deepEqual(view.root.position.toArray(),[-15,heightAt(-15,4),4]);}view.dispose();
});

test('fallback hit recoil stays above terrain without per-frame drift',()=>{const view=new WoodView(woodFallback(),false),p=new Vector3();for(const [x,z] of [[-15,-6],[-15,8]])for(let i=0;i<8;i++){const e={...enemy(1),x,z,hitAt:1,hitHeading:i*Math.PI/4};view.update(e,false,1.08);const before=view.root.matrixWorld.clone();for(const mesh of view.surfaces){const a=mesh.geometry.attributes.position;for(let j=0;j<a.count;j++){p.fromBufferAttribute(a,j).applyMatrix4(mesh.matrixWorld);assert.ok(p.y-heightAt(p.x,p.z)>=-1e-6);}}view.update(e,false,1.08);assert.deepEqual(view.root.matrixWorld.elements,before.elements);}view.dispose();});
test('hit marker belongs only to recently damaged visible enemies, follows simulation time and supports reduced motion',()=>{
 for(const authored of [true,false]){
  const batch=new WoodBatch(authored?combined:woodFallback(),authored),find=()=>batch.root.getObjectByName('wood-hit-marker') as import('three').InstancedMesh;
  const e={...enemy(1),x:0,z:4,hitAt:1,hitHeading:0},other={...enemy(2),x:2,z:4,hitAt:undefined};
  batch.update([e,other],false,camera,.99);assert.equal(find().count,0);
  batch.update([e,other],false,camera,1);assert.equal(find().count,1);const marker=find();assert.equal((marker.material as import('three').MeshBasicMaterial).transparent,true);assert.equal((marker.material as import('three').MeshBasicMaterial).forceSinglePass,true);assert.equal((marker.material as import('three').MeshBasicMaterial).depthTest,true);assert.equal((marker.material as import('three').MeshBasicMaterial).depthWrite,false);
  const frame=new Matrix4();marker.getMatrixAt(0,frame);const pos=new Vector3().setFromMatrixPosition(frame);assert.ok(Math.abs(pos.y-(heightAt(e.x,e.z)+4.15))<1e-6);
  batch.update([e,other],false,camera,1.1);const paused=new Matrix4();find().getMatrixAt(0,paused);batch.update([e,other],false,camera,1.1);const repeated=new Matrix4();find().getMatrixAt(0,repeated);assert.deepEqual(paused.elements,repeated.elements);
  batch.update([e,other],true,camera,1.01);const reduced=new Matrix4();find().getMatrixAt(0,reduced);batch.update([e,other],true,camera,1.2);const reducedLater=new Matrix4();find().getMatrixAt(0,reducedLater);assert.deepEqual(reduced.elements,reducedLater.elements);
  batch.update([e,other],false,camera,1.33);assert.equal(find().count,0);batch.update([{...e,x:1000}],false,camera,1.1);assert.equal(find().count,0);
  batch.update(Array.from({length:30},(_,i)=>({...enemy(i),x:i%5,z:4,hitAt:1})),false,camera,1.1);assert.equal(find().count,30);assert.equal(batch.meshes.length,authored?8:4);
  batch.update([{...e,hp:0}],false,camera,1.1);assert.equal(find().count,0);batch.dispose();
 }
});
