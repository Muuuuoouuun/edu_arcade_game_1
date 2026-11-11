import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{Box3,InstancedMesh,Matrix4,Mesh,PerspectiveCamera,Vector3}from'three';
import{compactWolf,WolfView,WOLF_STRIDE}from'./wolfView.ts';import{WoodBatch}from'./woodView.ts';import{heightAt,type Enemy}from'./engine.ts';import{WOOD_ATTACK}from'./woodAttack.ts';import{shockwaveSurface}from'./effectsView.ts';
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
 const attack={target:'hero' as const,heading:0,hit:false,entryDistance:0,time:0};v.update({...e,attack},false);const before=v.model.position.z;v.update({...e,attack:{...attack,time:WOOD_ATTACK.contact,hit:true}},false);assert.ok(v.model.position.z>before+.4);v.update({...e,attack:{...attack,time:WOOD_ATTACK.duration,hit:true}},false);assert.ok(Math.abs(v.model.position.z-before)<1e-6);v.update({...e,attack:{...attack,time:WOOD_ATTACK.contact,hit:true}},true);assert.equal(v.model.position.z,0);v.dispose();
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
