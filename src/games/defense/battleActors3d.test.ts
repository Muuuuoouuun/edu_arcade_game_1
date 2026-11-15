import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createBattleActors3D } from './battleActors3d.ts';
import { actDefense, createDefense, positionOnPath, stepDefense, waveSize } from './engine.ts';
import type { BattleModelId } from './battleModels.ts';
import type { DefenseState, Enemy, HeroId } from './types.ts';

async function readModel(id:BattleModelId):Promise<GLTF> {
 const buffer=await readFile(new URL(`../../../public/defense/models/battle/${id}.glb`,import.meta.url));
 const data=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
 return new GLTFLoader().parseAsync(data,'');
}
const wood=(id=100,progress=410):Enemy=>({id,kind:'wood',...positionOnPath(0,progress),progress,path:0,hp:10000,maxHp:10000,speed:0,wet:0,burn:0,slow:0,hit:0});
function combat(hero:HeroId):DefenseState {
 return {...createDefense(1,hero),phase:'wave',wave:1,spawned:waveSize(1,1),spawnTimer:99,enemies:[wood()]};
}
function transforms(root:THREE.Object3D) {
 const result:unknown[]=[];
 root.traverse(node=>result.push([node.name,node.position.toArray(),node.quaternion.toArray(),node.scale.toArray()]));
 return result;
}
function actorRoot(scene:THREE.Scene,key:string) {
 const root=scene.getObjectByName('battle-actors')?.children.find(child=>child.name===key);assert.ok(root,`missing ${key}`);return root;
}
function resources(gltf:GLTF) {
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
 const disposed={geometries:0,materials:0};
 geometries.forEach(geometry=>geometry.addEventListener('dispose',()=>disposed.geometries++));
 materials.forEach(material=>material.addEventListener('dispose',()=>disposed.materials++));
 return {geometries,materials,disposed};
}
async function loadedLayer(state:DefenseState,ids:BattleModelId[]) {
 const assets=new Map(await Promise.all(ids.map(async id=>[id,await readModel(id)] as const)));
 const scene=new THREE.Scene();
 const layer=createBattleActors3D(scene,{onLoad:()=>{},load:async id=>{const asset=assets.get(id);assert.ok(asset,`unexpected asset ${id}`);return asset;}});
 layer.sync(state);await setImmediate();layer.sync(state);
 return {scene,layer,assets};
}

test('shipped GLBs play their real named attack clips at the engine hit and restore their rest pose',async()=>{
 const cases=[['barbarian','kar','kar-slam',.28],['dwarf','bron','dwarf-hammer-attack',10/30],['mage','ian','ian-cast',.15],['elf','ballista','frontier-ballista-release',.1],['elf','base-crossbow','base-crossbow-release',.1],['elf','base-cannon','base-cannon-fire',.28],['elf','base-magic','base-magic-release',.15]] as const;
 for(const [hero,model,name,contact] of cases){
  let state=combat(hero);
  const tower=model==='ballista'||model.startsWith('base-');
  if(tower){
   state.heroCooldown=99;state=actDefense(state,{type:'build',slot:2,kind:model==='base-cannon'?'cannon':model==='base-magic'?'magic':'crossbow'});
   if(model==='ballista')state=actDefense(state,{type:'upgrade',slot:2,branch:'pierce'});
  }
  state=stepDefense(state,.01);
  const attack=state.attacks.find(attack=>attack.source===(tower?'tower':'hero'));assert.ok(attack,`${model} must attack`);
  const key=tower?'tower-2':'hero';
  const rest={...state,enemies:[],attacks:[]};
  const {scene,layer,assets}=await loadedLayer(rest,[model]);
  try{
   const asset=assets.get(model)!;assert.ok(asset.animations.some(clip=>clip.name===name));
   const root=actorRoot(scene,key),before=transforms(root.children[0]);
   layer.sync({...state,enemies:[],attacks:[{...attack,elapsed:attack.hitAt,fired:true}]});
   const diagnostic=layer.diagnostics().find(actor=>actor.key===key);assert.ok(diagnostic);
   assert.equal(diagnostic.clip,name);assert.ok(Math.abs(diagnostic.time!-contact)<1e-10);
   // Base ballistic clips intentionally keep their loaded pose through hitAt,
   // then show release/recoil in the next authored frame.
   if(model==='base-crossbow'||model==='base-cannon')layer.sync({...state,enemies:[],attacks:[{...attack,elapsed:attack.hitAt+.02,fired:true}]});
   assert.notDeepEqual(transforms(root.children[0]),before,`${model} changes actual mesh joints`);
   if(model==='ballista'){
    const bolt=root.getObjectByName('loaded-bolt');assert.ok(bolt);
    assert.ok(bolt.scale.length()<.01,'the authored release hides the loaded bolt');
   }
   layer.sync(rest);assert.deepEqual(transforms(root.children[0]),before);
  }finally{layer.dispose();}
 }
});

test('hero and mercenary clones have independent joints and never animate the cached GLTF',async()=>{
 for(const [hero,model] of [['barbarian','kar'],['dwarf','bron'],['mage','ian']] as const){
  const active=stepDefense(combat(hero),.01),attack=active.attacks.find(attack=>attack.source==='hero');assert.ok(attack);
  // Hiring currently disallows duplicates; exercise shared-asset isolation directly.
  const state={...createDefense(1,hero),mercenary:hero};
  const {scene,layer,assets}=await loadedLayer(state,[model]);
  try{
   const heroRoot=actorRoot(scene,'hero'),mercRoot=actorRoot(scene,'merc');
   const beforeHero=transforms(heroRoot),beforeMerc=transforms(mercRoot),beforeSource=transforms(assets.get(model)!.scene);
   layer.sync({...state,attacks:[{...attack,elapsed:attack.hitAt,fired:true}]});
   assert.notDeepEqual(transforms(heroRoot),beforeHero);
   assert.deepEqual(transforms(mercRoot),beforeMerc);
   assert.deepEqual(transforms(assets.get(model)!.scene),beforeSource);
   layer.sync(state);assert.deepEqual(transforms(heroRoot),beforeHero);
  }finally{layer.dispose();}
 }
});

test('wood gait follows path distance, hit colors stay local, and removing one clone keeps shared geometry alive',async()=>{
 const state={...createDefense(1,'elf'),enemies:[wood(1),wood(2,430)]};
 const {scene,layer,assets}=await loadedLayer(state,['wood']);
 try{
  const meshes=(key:string)=>{const found:THREE.Mesh[]=[];actorRoot(scene,key).traverse(node=>{if(node instanceof THREE.Mesh)found.push(node);});return found;};
  const first=meshes('enemy-1')[0],second=meshes('enemy-2')[0];
  const firstMaterial=first.material as THREE.MeshStandardMaterial,secondMaterial=second.material as THREE.MeshStandardMaterial;
  assert.equal(first.geometry,second.geometry);assert.notEqual(firstMaterial,secondMaterial);
  const secondColor=secondMaterial.color.clone(),before=layer.diagnostics();
  layer.sync({...state,time:state.time+10});assert.deepEqual(layer.diagnostics(),before,'wall-clock changes cannot advance a stationary enemy');
  const moved={...state,enemies:[{...wood(1,420),recoil:.2},state.enemies[1]]};layer.sync(moved);
  assert.notEqual(layer.diagnostics()[0].time,before[0].time);
  assert.notEqual(firstMaterial.color.getHex(),secondColor.getHex());assert.equal(secondMaterial.color.getHex(),secondColor.getHex());
  const tracked=resources(assets.get('wood')!);let cloneDisposed=0;
  firstMaterial.addEventListener('dispose',()=>cloneDisposed++);
  assert.deepEqual(layer.sync({...moved,enemies:[moved.enemies[1]]}),['enemy-2']);
  assert.equal(cloneDisposed,1);assert.equal(tracked.disposed.geometries,0);
  assert.equal(tracked.disposed.materials,0);
 }finally{layer.dispose();}
});

test('starter tower aiming keeps all foundations fixed and does not replace the magic ring animation',async()=>{
 const state={...createDefense(1,'elf'),towers:([
  {slot:1,kind:'crossbow'},{slot:2,kind:'cannon'},{slot:3,kind:'magic'},
 ] as const).map(tower=>({...tower,branch:null,level:1,cooldown:0,aim:{x:550,y:100}}))};
 const {scene,layer}=await loadedLayer(state,['base-crossbow','base-cannon','base-magic']);
 try{
  const before=state.towers.map(tower=>({root:actorRoot(scene,`tower-${tower.slot}`),rotation:actorRoot(scene,`tower-${tower.slot}`).quaternion.clone()}));
  const cannon=before[1].root.getObjectByName('aim-platform')!;const aim=cannon.quaternion.clone();
  const magicRing=before[2].root.getObjectByName('focus-ring')!;const ring=magicRing.quaternion.clone();
  layer.sync({...state,towers:state.towers.map(tower=>({...tower,aim:{x:100,y:500}}))});
  for(const {root,rotation} of before)assert.ok(root.quaternion.equals(rotation));
  assert.ok(!cannon.quaternion.equals(aim));assert.ok(magicRing.quaternion.equals(ring));
 }finally{layer.dispose();}
});

test('Ian combined asset keeps the source cast mesh and binds the walk clip by original joint names',async()=>{
 const combined=await readModel('ian');
 assert.deepEqual(combined.animations.map(clip=>clip.name),['ian-cast','ian-walk']);
 let state=actDefense(createDefense(1,'mage'),{type:'move',point:{x:440,y:120}});
 for(let i=0;i<6;i++)state=stepDefense(state,.05);
 const {scene,layer}=await loadedLayer(state,['ian']);
 const other=await loadedLayer(createDefense(1,'mage'),['ian']);
 try{
  // Skipping intermediate render frames must produce the same engine pose.
  other.layer.sync(state);
  assert.deepEqual(transforms(actorRoot(scene,'hero')),transforms(actorRoot(other.scene,'hero')));
  assert.equal(layer.diagnostics()[0].clip,'ian-walk');
  assert.ok(actorRoot(scene,'hero').getObjectByName('left-leg'));
  assert.ok(actorRoot(scene,'hero').getObjectByName('staff-hand'));
  const legs=actorRoot(scene,'hero').getObjectByName('left-leg')!;
  assert.notEqual(legs.position.z,0);
  layer.sync(state,1,true);assert.equal(layer.diagnostics()[0].clip,undefined);
  assert.equal(legs.position.z,0,'reduced motion restores the cast mesh rest pose, not the walk export bind pose');
 }finally{layer.dispose();other.layer.dispose();}
});

test('individual rejected or invalid loads retain sprite fallback while a valid model remains usable',async()=>{
 const state={...createDefense(1,'barbarian'),mercenary:'dwarf' as const,enemies:[wood()]};
 const kar=await readModel('kar'),invalid=await readModel('wood');invalid.animations=[];
 const tracked=resources(invalid),attempts=new Map<BattleModelId,number>(),scene=new THREE.Scene();let notifications=0;
 const layer=createBattleActors3D(scene,{onLoad:()=>notifications++,load:async id=>{
  attempts.set(id,(attempts.get(id)??0)+1);
  if(id==='kar')return kar;if(id==='wood')return invalid;throw new Error('test loader unavailable');
 }});
 try{
  assert.deepEqual(layer.sync(state),[]);await setImmediate();
  assert.deepEqual(layer.sync(state),['hero']);await setImmediate();
  assert.deepEqual(layer.sync(state),['hero']);
  assert.deepEqual([...attempts.values()],[1,1,1]);assert.equal(notifications,3);
  assert.equal(tracked.disposed.geometries,tracked.geometries.size);
  assert.equal(tracked.disposed.materials,tracked.materials.size);
 }finally{layer.dispose();}
});

test('a load completing after disposal releases every resource without resurrecting actors or notifying React',async()=>{
 const gltf=await readModel('kar'),tracked=resources(gltf),scene=new THREE.Scene();
 let resolveLoad!:(gltf:GLTF)=>void,notifications=0;
 const deferred=new Promise<GLTF>(resolve=>{resolveLoad=resolve;});
 const layer=createBattleActors3D(scene,{onLoad:()=>notifications++,load:()=>deferred});
 const state=createDefense(1,'barbarian');layer.sync(state);await setImmediate();
 layer.dispose();layer.dispose();resolveLoad(gltf);await setImmediate();
 assert.equal(notifications,0);assert.equal(scene.children.length,0);assert.deepEqual(layer.sync(state),[]);
 assert.equal(tracked.disposed.geometries,tracked.geometries.size);
 assert.equal(tracked.disposed.materials,tracked.materials.size);
});

test('native forward axes point at gameplay targets and the ballista rotates its platform without turning its footing',async()=>{
 const state={...createDefense(1,'barbarian'),heroFacing:1 as const,mercenary:'dwarf' as const,
  towers:[{slot:2,kind:'crossbow' as const,branch:'pierce' as const,level:2,cooldown:0,aim:{x:480,y:305}}],enemies:[wood(0,0)]};
 const {scene,layer}=await loadedLayer(state,['kar','bron','ballista','wood']);
 try{
  scene.updateMatrixWorld(true);
  const forward=(root:THREE.Object3D,axis:THREE.Vector3)=>axis.applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).normalize();
  assert.ok(forward(actorRoot(scene,'hero'),new THREE.Vector3(0,0,-1)).distanceTo(new THREE.Vector3(1,0,0))<1e-7);
  assert.ok(forward(actorRoot(scene,'merc'),new THREE.Vector3(0,0,-1)).distanceTo(new THREE.Vector3(-1,0,0))<1e-7);
  const tower=actorRoot(scene,'tower-2'),aim=tower.getObjectByName('aim-platform');assert.ok(aim);
  const baseRotation=tower.quaternion.clone(),beforeAim=aim.quaternion.clone();
  const towerDirection=new THREE.Vector3(100,0,100/Math.sin(Math.PI/3)).normalize();
  assert.ok(forward(aim,new THREE.Vector3(0,0,1)).distanceTo(towerDirection)<1e-7);
  const next=positionOnPath(0,3),enemy=state.enemies[0];
  const woodDirection=new THREE.Vector3(next.x-enemy.x,0,(next.y-enemy.y)/Math.sin(Math.PI/3)).normalize();
  assert.ok(forward(actorRoot(scene,'enemy-0'),new THREE.Vector3(1,0,0)).distanceTo(woodDirection)<1e-7);
  layer.sync({...state,towers:[{...state.towers[0],aim:{x:280,y:205}}]});
  assert.ok(tower.quaternion.equals(baseRotation));assert.ok(!aim.quaternion.equals(beforeAim));
 }finally{layer.dispose();}
});
