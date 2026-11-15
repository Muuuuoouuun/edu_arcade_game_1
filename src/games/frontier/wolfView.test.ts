import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{Box3,InstancedMesh,Matrix4,Mesh,PerspectiveCamera,Quaternion,Vector3}from'three';
import{compactWolf,WolfView,WOLF_STRIDE,wolfBitePose}from'./wolfView.ts';import{WoodBatch}from'./woodView.ts';import{actFrontier,createFrontier,heightAt,stepFrontier,type Enemy}from'./engine.ts';import{WOOD_ATTACK}from'./woodAttack.ts';import{shockwaveSurface}from'./effectsView.ts';
const read=async()=>{const b=readFileSync(new URL('../../../public/defense/models/frost-wolf-stride.glb',import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const enemy=(i=0):Enemy=>({id:i,x:-14,z:-7,hp:40,maxHp:40,cooldown:0,path:0,heading:0,moving:true,walkDistance:0});
const matrices=(v:WolfView)=>v.surfaces.map(m=>m.matrixWorld.clone());
test('wolf compaction preserves the authored bounds and animation while batching by joint',async()=>{
 const g=await read(),before=new Box3().setFromObject(g.scene,true);let old=0;g.scene.traverse(o=>{if(o instanceof Mesh)old++});compactWolf(g);const after=new Box3().setFromObject(g.scene,true),meshes:Mesh[]=[];g.scene.traverse(o=>{if(o instanceof Mesh)meshes.push(o)});
 assert.equal(old,66);assert.equal(meshes.length,17);assert.ok(before.min.distanceTo(after.min)<1e-5&&before.max.distanceTo(after.max)<1e-5);assert.equal(new Set(meshes.map(m=>m.material)).size,1);assert.equal(g.animations[0].name,'frost-wolf-stride');assert.ok(meshes.every(m=>!!m.geometry.attributes.color));
});
test('incomplete wolf rigs are rejected for the existing enemy fallback',async()=>{const g=await read(),foot=g.scene.getObjectByName('foot-far-back')!;foot.parent!.remove(foot);assert.throws(()=>compactWolf(g),/Incomplete wolf model/);});
test('wolf four paws follow travel and ground on flat land, ramp and bridge without accumulated offsets',async()=>{
 const g=compactWolf(await read()),v=new WolfView(g),p=new Vector3();let feet=0;
 for(const [x,z]of[[-14,14],[-14,-7],[6,0],[6,2.7]])for(let d=0;d<8;d++)for(let phase=0;phase<8;phase++){
  const e={...enemy(),x,z,heading:d*Math.PI/4,walkDistance:WOLF_STRIDE*phase/8};v.update(e,false);const a=matrices(v);v.update(e,false);for(let i=0;i<a.length;i++)assert.ok(a[i].elements.every((x,j)=>Math.abs(x-v.surfaces[i].matrixWorld.elements[j])<1e-6),'repeated simulation state drifts');
  for(const mesh of v.surfaces.filter(m=>m.name.startsWith('wolf-surface-foot-'))){feet++;const attr=mesh.geometry.attributes.position;for(let i=0;i<attr.count;i++){p.fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld);assert.ok(p.y-shockwaveSurface(p.x,p.z)>-.0001,`foot below ground at ${x},${z},${d},${phase}`);}}
 }
 assert.equal(feet,4*8*8*4);v.dispose();
});
test('wolves have independent distance-sampled gait, stable reduced motion and contact-timed bite',async()=>{
 const g=compactWolf(await read()),v=new WolfView(g),e=enemy();v.update(e,false);const start=matrices(v);v.update({...e,walkDistance:WOLF_STRIDE*.25},false);assert.ok(v.surfaces.some((m,i)=>m.matrixWorld.elements.some((x,j)=>Math.abs(x-start[i].elements[j])>.01)),'walk phase must change');
 v.update(e,true);const reduced=matrices(v);v.update({...e,walkDistance:123},true);assert.ok(v.surfaces.every((m,i)=>m.matrixWorld.elements.every((x,j)=>Math.abs(x-reduced[i].elements[j])<1e-6)));
 const attack={target:'hero' as const,heading:0,hit:false,entryDistance:0,time:0};v.update({...e,attack:{...attack,time:WOOD_ATTACK.contact,hit:true}},false);const contact=v.model.getObjectByName('head')!.getWorldPosition(new Vector3());v.update({...e,attack:{...attack,time:WOOD_ATTACK.duration,hit:true}},false);const recovered=v.model.getObjectByName('head')!.getWorldPosition(new Vector3());assert.ok(contact.z>recovered.z+.30);v.update({...e,attack:{...attack,time:WOOD_ATTACK.contact,hit:true}},true);assert.equal(v.model.position.z,0);v.dispose();
});
test('bite opens before contact, closes at impact and returns to the starting pose',async()=>{
 const g=compactWolf(await read()),v=new WolfView(g),e=enemy(),attack={target:'hero' as const,heading:0,hit:false,entryDistance:0,time:0};
 assert.ok(Object.values(wolfBitePose(0)).every(x=>x===0));assert.deepEqual(wolfBitePose(WOOD_ATTACK.duration),wolfBitePose(0));
 v.update({...e,moving:false,attack},false);const neutral=v.model.getObjectByName('jaw')!.rotation.z;
 v.update({...e,moving:false,attack:{...attack,time:.14}},false);const open=v.model.getObjectByName('jaw')!.rotation.z;
 v.update({...e,moving:false,attack:{...attack,time:WOOD_ATTACK.contact,hit:true}},false);const closed=v.model.getObjectByName('jaw')!.rotation.z;
 assert.ok(open<neutral-.3,'jaw visibly opens during the windup');assert.ok(closed>open+.3,'jaw closes at actual damage contact');v.dispose();
});
test('bite keeps the sampled stance connected and paws on visible terrain at eight headings',async()=>{
 const g=compactWolf(await read()),a=new WolfView(g),b=new WolfView(g),p=new Vector3(),names=['foot-near-front','foot-far-front','foot-near-back','foot-far-back'];let maxDrift=0;
 for(const [x,z] of [[-14,14],[-14,-7],[6,0],[6,2.7]])for(let d=0;d<8;d++)for(let phase=0;phase<8;phase++){
  const e={...enemy(),x,z,heading:d*Math.PI/4,walkDistance:WOLF_STRIDE*phase/8},attack={target:'hero' as const,heading:e.heading,hit:false,entryDistance:e.walkDistance,time:0};
  a.update(e,false);b.update({...e,moving:false,attack},false);for(let i=0;i<a.surfaces.length;i++)assert.ok(a.surfaces[i].matrixWorld.elements.every((x,j)=>Math.abs(x-b.surfaces[i].matrixWorld.elements[j])<1e-5),'walking-to-bite entry popped');
  let anchor:Vector3[]=[];for(let i=0;i<=30;i++){
   const time=i*.02;b.update({...e,moving:false,attack:{...attack,time,hit:time>=WOOD_ATTACK.contact}},false);const points=names.map(n=>b.model.getObjectByName(n)!.getWorldPosition(new Vector3()));if(i===9)anchor=points;
   if(i>=9)for(let j=0;j<4;j++)maxDrift=Math.max(maxDrift,points[j].distanceTo(anchor[j]));
   for(const m of b.surfaces.filter(m=>m.name.startsWith('wolf-surface-foot-'))){const vertices=m.geometry.attributes.position;for(let j=0;j<vertices.count;j++){p.fromBufferAttribute(vertices,j).applyMatrix4(m.matrixWorld);assert.ok(p.y-shockwaveSurface(p.x,p.z)>-.0001,'paw crossed the visible surface');}}
  }
 }
 assert.ok(maxDrift<.04,`planted paw drift ${maxDrift}`);a.dispose();b.dispose();
});
test('bite has no knee flip at 5ms intervals across terrain, direction and gait phase',async()=>{
 const g=compactWolf(await read()),v=new WolfView(g),names=['leg-near-front','leg-far-front','leg-near-back','leg-far-back','knee-near-front','knee-far-front','knee-near-back','knee-far-back'];let largest=0;
 for(const [x,z] of [[-14,14],[-14,-7],[6,0],[6,2.7]])for(let d=0;d<8;d++)for(let phase=0;phase<8;phase++){
  const e={...enemy(),x,z,heading:d*Math.PI/4,walkDistance:WOLF_STRIDE*phase/8},attack={target:'hero' as const,heading:e.heading,hit:false,entryDistance:e.walkDistance,time:0};let previous:Quaternion[]|undefined;
  for(let i=0;i<=120;i++){const time=i*.005;v.update({...e,moving:false,attack:{...attack,time,hit:time>=WOOD_ATTACK.contact}},false);const q=names.map(n=>v.model.getObjectByName(n)!.getWorldQuaternion(new Quaternion()));if(previous)for(let j=0;j<q.length;j++)largest=Math.max(largest,q[j].angleTo(previous[j]));previous=q;}
 }
 assert.ok(largest<.05,`knee changed ${largest} radians in 5ms`);v.dispose();
});
test('bite follows simulation pause and speed without moving damage contact',async()=>{
 const g=compactWolf(await read()),v=new WolfView(g);let s=actFrontier(createFrontier('solo'),{type:'start'});s.enemies=[{...enemy(1),x:s.hero.x,z:s.hero.z-1.6,moving:false}];
 s=stepFrontier(s,.001);assert.ok(s.enemies[0].attack);for(let i=0;i<3;i++)s=stepFrontier(s,.04);assert.equal(s.hero.hp,100);
 const paused=actFrontier(s,{type:'pause'});v.update(paused.enemies[0],false,paused.time);const snapshot=matrices(v);const still=stepFrontier(paused,.05);assert.equal(still,paused);v.update(still.enemies[0],false,still.time);assert.ok(v.surfaces.every((m,i)=>m.matrixWorld.elements.every((x,j)=>Math.abs(x-snapshot[i].elements[j])<1e-6)));
 const normal=stepFrontier(stepFrontier(s,.04),.04),fast=stepFrontier(actFrontier(s,{type:'speed'}),.04);v.update(normal.enemies[0],false,normal.time);const reference=matrices(v);v.update(fast.enemies[0],false,fast.time);assert.ok(v.surfaces.every((m,i)=>m.matrixWorld.elements.every((x,j)=>Math.abs(x-reference[i].elements[j])<1e-5)));assert.equal(normal.hero.hp,fast.hero.hp);
 while(!s.enemies[0].attack!.hit)s=stepFrontier(s,.04);assert.equal(s.hero.hp,92);v.dispose();
});
test('stopped wolves settle every gait phase before the attack and never accumulate corrections',async()=>{
 const g=compactWolf(await read()),v=new WolfView(g),e=enemy();let settled:ReturnType<typeof matrices>|undefined;
 for(let phase=0;phase<8;phase++){
  v.update({...e,walkDistance:WOLF_STRIDE*phase/8,moving:false,restTime:.2},false);const current=matrices(v);settled??=current;
  for(let i=0;i<current.length;i++)assert.ok(current[i].elements.every((x,j)=>Math.abs(x-settled![i].elements[j])<1e-5));
 }
 v.dispose();
});
test('wolf hit recoil and defeated pose follow simulation time and keep the body above ground',async()=>{
 const g=compactWolf(await read()),v=new WolfView(g),e={...enemy(),x:-14,z:-7,hitAt:1,hitHeading:0},p=new Vector3();v.update(e,false,1);const start=v.root.quaternion.clone();v.update(e,false,1.1);assert.ok(v.root.quaternion.angleTo(start)>.01);v.update(e,true,1.1);assert.ok(v.root.quaternion.angleTo(start)<1e-6);
 for(const age of [0,.1,.3,.5]){v.update(e,false,1+age,age);for(const m of v.surfaces){const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld);assert.ok(p.y-heightAt(p.x,p.z)>-.0001,'defeated wolf below terrain');}}}v.dispose();
});
test('a single shared instance batch gives wolves independent poses, hit cues, warnings and cleanup',async()=>{
 const g=compactWolf(await read()),batch=new WoodBatch(g,true,t=>new WolfView(t),2.15),camera=new PerspectiveCamera(60,1,.1,100);camera.position.set(-14,12,8);camera.lookAt(-14,0,-7);camera.updateMatrixWorld();camera.updateProjectionMatrix();
 const a=enemy(1),b={...enemy(2),x:-12,walkDistance:WOLF_STRIDE*.25,heading:Math.PI/2};batch.update([a,b],false,camera,1);assert.equal(batch.meshes.length,17);assert.equal(batch.views.size,2);assert.notDeepEqual(batch.views.get(1)!.surfaces[0].matrixWorld.elements,batch.views.get(2)!.surfaces[0].matrixWorld.elements);assert.equal(batch.meshes[0].count,2);
 const attacking={...a,attack:{target:'hero' as const,heading:0,hit:false,entryDistance:0,time:.1}};batch.update([attacking],false,camera,1);assert.equal(batch.warningCount,1);batch.update([{...attacking,attack:{...attacking.attack,hit:true},hitAt:1}],false,camera,1.05);assert.equal(batch.warningCount,0);assert.equal(batch.markerCount,1);const m=new Matrix4();(batch.root.getObjectByName('wood-hit-marker') as InstancedMesh).getMatrixAt(0,m);assert.ok(Math.abs(m.elements[13]-(heightAt(a.x,a.z)+2.15))<1e-5);batch.update([],false,camera);assert.equal(batch.views.size,0);batch.dispose();
});
test('the bite lowers the torso over planted paws and recovers without changing the contact clock',async()=>{
 const g=compactWolf(await read()),idle=new WolfView(g),bite=new WolfView(g),names=['foot-near-front','foot-far-front','foot-near-back','foot-far-back'];let largestFootDrift=0;
 for(const [x,z]of[[-14,14],[-14,-7],[6,0],[6,2.7]])for(let direction=0;direction<8;direction++){
  const e={...enemy(),x,z,heading:direction*Math.PI/4,moving:false,restTime:.2},attack={target:'hero' as const,heading:e.heading,hit:false,entryDistance:0,time:.18};
  idle.update(e,false);bite.update({...e,attack},false);const neutral=idle.model.getObjectByName('wolf-root')!.getWorldPosition(new Vector3()),crouched=bite.model.getObjectByName('wolf-root')!.getWorldPosition(new Vector3());
  assert.ok(neutral.y-crouched.y>.08&&neutral.y-crouched.y<.1,'the torso compresses visibly');
  for(const name of names){const a=idle.model.getObjectByName(name)!.getWorldPosition(new Vector3()),b=bite.model.getObjectByName(name)!.getWorldPosition(new Vector3());largestFootDrift=Math.max(largestFootDrift,a.distanceTo(b));}
  for(const surface of bite.surfaces){surface.updateMatrix();const expected=new Matrix4().multiplyMatrices(surface.parent!.matrixWorld,surface.matrix);assert.ok(surface.matrixWorld.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-6),`${surface.name} follows its articulated joint`);}
  const once=matrices(bite);bite.update({...e,attack},false);assert.ok(bite.surfaces.every((m,i)=>m.matrixWorld.elements.every((x,j)=>Math.abs(x-once[i].elements[j])<1e-6)),'paused pose does not accumulate');
  bite.update({...e,attack:{...attack,time:WOOD_ATTACK.duration,hit:true}},false);const recovered=bite.model.getObjectByName('wolf-root')!.getWorldPosition(new Vector3());assert.ok(recovered.distanceTo(neutral)<1e-6,'body returns to grounded idle');
  bite.update({...e,attack},true);const reduced=bite.model.getObjectByName('wolf-root')!.getWorldPosition(new Vector3());assert.ok(reduced.distanceTo(neutral)<1e-6,'reduced motion omits torso movement');
 }
 assert.ok(largestFootDrift<.002,`planted paw pivots drifted ${largestFootDrift}`);idle.dispose();bite.dispose();
});
test('simultaneous bites keep independent body compression in the shared instance batch',async()=>{
 const g=compactWolf(await read()),batch=new WoodBatch(g,true,t=>new WolfView(t),2.15),camera=new PerspectiveCamera(60,1,.1,100);camera.position.set(-14,12,28);camera.lookAt(-14,0,14);camera.updateMatrixWorld();camera.updateProjectionMatrix();
 const base={...enemy(),x:-14,z:14,moving:false},attack={target:'hero' as const,heading:0,hit:false,entryDistance:0,time:.18},a={...base,id:1,attack},b={...base,id:2,attack:{...attack,time:.6,hit:true}};
 batch.update([a,b],false,camera,0);const first=batch.views.get(1)!,second=batch.views.get(2)!,y1=first.root.getObjectByName('wolf-root')!.getWorldPosition(new Vector3()).y,y2=second.root.getObjectByName('wolf-root')!.getWorldPosition(new Vector3()).y;
 assert.ok(y2-y1>.08,'only the winding wolf compresses');assert.equal(batch.meshes[0].count,2);
 batch.update([b,a],false,camera,0);assert.ok(Math.abs(batch.views.get(1)!.root.getObjectByName('wolf-root')!.getWorldPosition(new Vector3()).y-y1)<1e-6);batch.dispose();
});
test('an incompatible limb keeps the prior grounded body pose instead of moving unsupported paws',async()=>{
 const g=compactWolf(await read()),knee=g.scene.getObjectByName('knee-far-front')!;knee.name='unsupported-knee';g.animations[0].tracks=g.animations[0].tracks.filter(track=>!track.name.startsWith('knee-far-front.'));
 const v=new WolfView(g),e={...enemy(),moving:false,attack:{target:'hero' as const,heading:0,hit:false,entryDistance:0,time:.18}};
 v.update(e,false);assert.ok(v.model.getObjectByName('wolf-root')!.position.length()<1e-8);v.dispose();
});
test('taking a hit during the bite preserves grounded paws without cancelling the visual attack',async()=>{
 const g=compactWolf(await read()),v=new WolfView(g),point=new Vector3();
 for(const [x,z]of[[-14,14],[-14,-7],[6,2.7]])for(let d=0;d<8;d++)for(const age of [0,.08,.16]){
  const heading=d*Math.PI/4,e={...enemy(),x,z,heading,moving:false,hitAt:1,hitHeading:heading,attack:{target:'hero' as const,heading,hit:false,entryDistance:0,time:.18}};v.update(e,false,1+age);
  for(const mesh of v.surfaces.filter(m=>m.name.startsWith('wolf-surface-foot-'))){const vertices=mesh.geometry.attributes.position;for(let i=0;i<vertices.count;i++){point.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);assert.ok(point.y-shockwaveSurface(point.x,point.z)>-.0001,'paw penetrated the ground during recoil');}}
  const body=v.model.getObjectByName('wolf-root')!;assert.ok(body.position.y<-.17,'the attack pose remains active');
 }
 v.dispose();
});
test('defeat during a bite starts from the compressed body and releases it into the fall',async()=>{
 const g=compactWolf(await read()),v=new WolfView(g),body=v.model.getObjectByName('wolf-root')!,point=new Vector3();let largestStep=0;
 for(let d=0;d<8;d++)for(const time of [.1,.18,.28,.4]){
  const heading=d*Math.PI/4,e={...enemy(),x:-14,z:14,heading,moving:false,hitHeading:heading,attack:{target:'hero' as const,heading,hit:time>=WOOD_ATTACK.contact,entryDistance:0,time}};
  v.update(e,false,1);const alive=body.getWorldPosition(new Vector3());v.update(e,false,1,0);let prior=body.getWorldPosition(new Vector3());assert.ok(prior.distanceTo(alive)<1e-5,'defeat begins from the current compressed pose');
  for(let i=1;i<=40;i++){const age=i*.005;v.update(e,false,1+age,age);const next=body.getWorldPosition(new Vector3());largestStep=Math.max(largestStep,next.distanceTo(prior));prior=next;
   for(const mesh of v.surfaces.filter(m=>m.name.startsWith('wolf-surface-foot-'))){const a=mesh.geometry.attributes.position;for(let j=0;j<a.count;j++){point.fromBufferAttribute(a,j).applyMatrix4(mesh.matrixWorld);assert.ok(point.y-shockwaveSurface(point.x,point.z)>-.0001);}}
  }
 }
 assert.ok(largestStep<.04,`fall jumped ${largestStep} units in 5ms`);v.dispose();
});
