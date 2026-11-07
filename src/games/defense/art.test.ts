import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { CombatAttack, Projectile } from './types.ts';

type Art = typeof import('./art.ts');

test('wolf collapse follows simulation progress, keeps ground and falls back without a complete model set',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'wolf-collapse');
 const base=art.monsterSpriteAsset('frostwolf','hit')!;
 for(const [p,expected] of [[-.1,0],[0,0],[.239,0],[.24,1],[.48,2],[.72,3],[1,3],[NaN,0]]){
  const {asset,frame}=art.monsterDeathSpriteAsset('frostwolf',p)!;
  assert.equal(frame,expected);assert.equal(asset.groundY,base.groundY);assert.equal(asset.displayScale,base.displayScale);
  const [x,y,w,h]=asset.viewBox.split(' ').map(Number);assert.ok(x+w<=asset.width&&y+h<=asset.height);
  assert.equal(art.monsterDeathSpriteAsset('frostwolf',p,true)?.frame,3);
 }
 assert.equal(art.monsterDeathSpriteAsset('wood',.5),null);
 assert.ok(!requests.some(src=>src.endsWith('.glb')));
 for(const missing of ['frost-wolf-atlas.webp','frost-wolf-collapse-atlas.webp']){
  const {art:failed}=await loadWithImageResults(src=>src.endsWith('/'+missing),'collapse-'+missing);
  assert.equal(failed.monsterDeathSpriteAsset('frostwolf',.5),null);
  assert.ok(failed.monsterSpriteAsset('frostwolf','death'));
 }
});

test('wolf trot keeps eight frames on the base pose ground and never mixes a partial model set',async()=>{
 const {art}=await loadWithImageResults(()=>false,'wolf-trot-ready');
 const base=art.monsterSpriteAsset('frostwolf','hit')!;
 const frames=Array.from({length:8},(_,i)=>art.monsterWalkingSpriteAsset('frostwolf',i*5)!);
 assert.equal(new Set(frames.map(f=>f.viewBox)).size,8);
 for(const frame of frames){
  assert.equal(frame.groundY,base.groundY);assert.equal(frame.displayScale,base.displayScale);
  const [x,y,w,h]=frame.viewBox.split(' ').map(Number);assert.ok(x+w<=frame.width&&y+h<=frame.height);
 }
 for(const file of ['frost-wolf-atlas.webp','frost-wolf-trot-atlas.webp']){
  const {art:failed}=await loadWithImageResults(src=>src.endsWith('/'+file),`wolf-trot-missing-${file}`);
  assert.equal(failed.monsterWalkingSpriteAsset('frostwolf',10),null);
  assert.equal(failed.monsterSpriteAsset('frostwolf','hit')?.src,file==='frost-wolf-atlas.webp'?'/defense/monster-models.webp':base.src);
  assert.ok(failed.monsterWalkingSpriteAsset('wood',10),'wolf loading cannot disable wood gait');
 }
});

test('wood gait uses all eight frames at a fixed ground anchor and falls back as a complete set',async()=>{
 const {art}=await loadWithImageResults(()=>false,'wood-gait');
 const base=art.monsterSpriteAsset('wood','hit')!;
 assert.equal(base.groundY,317.61);
 assert.ok(Math.abs(base.displayScale!/6.3-(384/360)/5.6)<1e-12,'wider camera preserves model-to-world scale');
 const frames=Array.from({length:8},(_,i)=>art.monsterWalkingSpriteAsset('wood',i*6.5)!);
 assert.equal(new Set(frames.map(f=>f.viewBox)).size,8);
 for(const frame of frames){
  assert.equal(frame.groundY,base.groundY);assert.equal(frame.displayScale,base.displayScale);
  const [x,y,w,h]=frame.viewBox.split(' ').map(Number);
  assert.ok(x+w<=frame.width&&y+h<=frame.height);
 }
 const {art:missingWalk}=await loadWithImageResults(src=>src.includes('wood-soldier-walk'),'wood-no-walk');
 assert.equal(missingWalk.monsterWalkingSpriteAsset('wood',10),null);
 assert.equal(missingWalk.monsterSpriteAsset('wood','hit')?.src,base.src);
 const {art:missingBase}=await loadWithImageResults(src=>src.endsWith('/wood-soldier-atlas.webp'),'wood-no-base');
 assert.equal(missingBase.monsterWalkingSpriteAsset('wood',10),null);
 assert.equal(missingBase.monsterSpriteAsset('wood','hit')?.src,'/defense/monster-models.webp');
});

async function loadWithImageResults(failed:(src:string)=>boolean, scenario:string) {
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Image'),requests:string[]=[];
 class ImageResult {
  onload:(()=>void)|null=null;
  onerror:(()=>void)|null=null;
  set src(value:string){requests.push(value);queueMicrotask(()=>failed(value)?this.onerror?.():this.onload?.());}
 }
 Object.defineProperty(globalThis,'Image',{value:ImageResult,configurable:true});
 try {
  // Isolate loader state as a fresh page would, without exporting test-only resets.
  const art=await import(new URL(`./art.ts?scenario=${scenario}`,import.meta.url).href) as Art;
  await art.preloadDefenseMotion();
  return {art,requests};
 } finally {
  if(previous)Object.defineProperty(globalThis,'Image',previous);else Reflect.deleteProperty(globalThis,'Image');
 }
}

test('only matching upgraded branches use the loaded battle renders; base art and other specializations remain available',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'available');
 for(const [kind,branch,id,facing] of [
  ['magic','fire','fire-tower',1],['magic','lightning','lightning-tower',1],['crossbow','pierce','piercing-ballista',-1],['crossbow','rapid','rapid-crossbow',-1],['cannon','water','water-cannon',-1],['cannon','crush','crush-cannon',-1],
 ] as const){
  const specialized=art.towerSpriteAsset(kind,branch,2),mastered=art.towerSpriteAsset(kind,branch,3);
  assert.equal(specialized?.src,`/defense/models/${id}-game.webp`);
  assert.equal(mastered?.src,`/defense/models/${id}-lv3-game.webp`,'every baked tower has a dedicated Lv.3 render');
  assert.equal(mastered?.nativeFacing??1,facing,'Lv.3 keeps the facing of its base render');
  assert.equal(mastered?.viewBox,specialized?.viewBox,'Lv.3 shares the Lv.2 crop so the ground anchor is unchanged');
  assert.equal(specialized?.nativeFacing??1,facing);
  assert.equal(art.towerSpriteAsset(kind)?.src,'/defense/tower-models.webp');
  assert.equal(art.towerSpriteAsset(kind,branch,1)?.src,'/defense/tower-models.webp');
 }
 assert.equal(art.towerSpriteAsset('cannon',null,2)?.src,'/defense/tower-models.webp','an unspecialized cannon keeps the atlas');
 assert.equal(art.spriteAsset(4).src,'/defense/tower-models.webp');
 assert.equal(art.spriteAsset(5).src,'/defense/tower-models.webp');
 assert.equal(art.spriteAsset(6).src,'/defense/tower-models.webp');
 assert.equal(requests.some(src=>src.endsWith('.glb')),false,'the battle loader must not fetch realtime models');
});

test('a failed model image falls back to the same specialization without suppressing other loaded models',async()=>{
 const {art}=await loadWithImageResults(src=>src.endsWith('/water-cannon-game.webp'),'partial-failure');
 const water=art.towerSpriteAsset('cannon','water',2),base=art.towerSpriteAsset('cannon');
 assert.equal(water?.src,'/defense/tower-models.webp');
 assert.notEqual(water?.viewBox,base?.viewBox,'the water specialization keeps its own atlas frame');
 assert.equal(art.towerSpriteAsset('magic','fire',2)?.src,'/defense/models/fire-tower-game.webp');
 assert.equal(art.towerSpriteAsset('crossbow','pierce',2)?.src,'/defense/models/piercing-ballista-game.webp');
});

test('a failed Lightning render falls back to the atlas without touching the Fire tower',async()=>{
 const {art}=await loadWithImageResults(src=>src.endsWith('/lightning-tower-game.webp'),'lightning-failure');
 assert.equal(art.towerSpriteAsset('magic','lightning',2)?.src,'/defense/tower-models.webp');
 assert.equal(art.towerSpriteAsset('magic','fire',2)?.src,'/defense/models/fire-tower-game.webp');
});

test('a failed Rapid crossbow render falls back to the atlas without touching the Pierce ballista',async()=>{
 const {art}=await loadWithImageResults(src=>src.endsWith('/rapid-crossbow-game.webp'),'rapid-failure');
 assert.equal(art.towerSpriteAsset('crossbow','rapid',2)?.src,'/defense/tower-models.webp');
 assert.equal(art.towerSpriteAsset('crossbow','pierce',2)?.src,'/defense/models/piercing-ballista-game.webp');
});

test('a failed Lv.3 render keeps the Lv.2 render instead of the atlas',async()=>{
 const {art}=await loadWithImageResults(src=>src.endsWith('/fire-tower-lv3-game.webp'),'lv3-failure');
 assert.equal(art.towerSpriteAsset('magic','fire',3)?.src,'/defense/models/fire-tower-game.webp');
 assert.equal(art.towerSpriteAsset('magic','fire',2)?.src,'/defense/models/fire-tower-game.webp');
});

test('a failed water cannon Lv.3 render keeps the Lv.2 render and its facing',async()=>{
 const {art}=await loadWithImageResults(src=>src.endsWith('/water-cannon-lv3-game.webp'),'cannon-lv3-failure');
 const lv3=art.towerSpriteAsset('cannon','water',3);
 assert.equal(lv3?.src,'/defense/models/water-cannon-game.webp');
 assert.equal(lv3?.nativeFacing,-1);
});

test('a failed ballista Lv.3 render keeps the Lv.2 render and its facing',async()=>{
 const {art}=await loadWithImageResults(src=>src.endsWith('/piercing-ballista-lv3-game.webp'),'ballista-lv3-failure');
 const lv3=art.towerSpriteAsset('crossbow','pierce',3);
 assert.equal(lv3?.src,'/defense/models/piercing-ballista-game.webp');
 assert.equal(lv3?.nativeFacing,-1);
});

test('failed optional art leaves the original tower sprites usable',async()=>{
 const {art}=await loadWithImageResults(()=>true,'all-failed');
 assert.equal(art.towerSpriteAsset('magic','fire',2),null);
 assert.equal(art.towerSpriteAsset('crossbow','pierce',2),null);
 assert.equal(art.towerSpriteAsset('cannon','water',2),null);
 for(const index of [4,5,6])assert.equal(art.spriteAsset(index).src,'/defense/atlas.png');
});

test('a complete dwarf render set shares its body scale and ground anchor across idle, attacks and portraits',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'dwarf-complete');
 const idle=art.idleSpriteAsset('dwarf');
 assert.equal(idle?.src,'/defense/models/dwarf-idle-game.webp');
 assert.equal(art.spriteAsset(2).src,idle?.src,'camp portrait and battle use the same model');
 assert.notEqual(art.spriteAsset(2).viewBox,idle?.viewBox,'portraits remove the empty action margin without cropping battle poses');
 for(const pose of ['windup','strike','recover'] as const){
  const frame=art.actionSpriteAsset('dwarf',pose);
  assert.equal(frame?.src,`/defense/models/dwarf-${pose}-game.webp`);
  for(const key of ['viewBox','width','height','displayScale','nativeFacing','groundY'] as const)
   assert.equal(frame?.[key],idle?.[key],`${pose} must keep the same ${key}`);
 }
 assert.equal(art.idleSpriteAsset('barbarian'),null);
 assert.equal(art.actionSpriteAsset('barbarian','strike')?.src,'/defense/melee-motion.webp');
 assert.equal(art.spriteAsset(0).src,'/defense/atlas.png');
 assert.equal(requests.filter(src=>/\/dwarf-.*-game\.webp$/.test(src)).length,12);
 assert.equal(requests.some(src=>src.endsWith('.glb')),false,'battle must not request articulated realtime models');
});

test('any missing dwarf pose keeps the whole actor on its existing atlas',async()=>{
 for(const missing of ['idle','windup','strike','recover']){
  const {art}=await loadWithImageResults(src=>src.endsWith(`/dwarf-${missing}-game.webp`),`dwarf-missing-${missing}`);
  assert.equal(art.idleSpriteAsset('dwarf'),null);
  assert.equal(art.spriteAsset(2).src,'/defense/atlas.png');
  for(const pose of ['windup','strike','recover'] as const)
   assert.equal(art.actionSpriteAsset('dwarf',pose)?.src,'/defense/melee-motion.webp',`${missing} failure keeps ${pose} in the same art style`);
  assert.equal(art.towerSpriteAsset('magic','fire',2)?.src,'/defense/models/fire-tower-game.webp');
 }
});

test('dwarf idle art remains usable when every optional image fails',async()=>{
 const {art}=await loadWithImageResults(()=>true,'dwarf-all-failed');
 assert.equal(art.idleSpriteAsset('dwarf'),null);
 assert.equal(art.spriteAsset(2).src,'/defense/atlas.png');
 assert.equal(art.actionSpriteAsset('dwarf','strike'),null);
});

test('a delayed final dwarf frame does not switch the actor prematurely or duplicate preload requests',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Image'),pending=new Map<string,()=>void>();
 class DeferredImage {
  onload:(()=>void)|null=null;
  onerror:(()=>void)|null=null;
  set src(value:string){assert.equal(pending.has(value),false);pending.set(value,()=>this.onload?.());}
 }
 Object.defineProperty(globalThis,'Image',{value:DeferredImage,configurable:true});
 try{
  const art=await import(new URL('./art.ts?scenario=dwarf-pending',import.meta.url).href) as Art;
  const preload=art.preloadDefenseMotion();
  assert.equal(art.preloadDefenseMotion(),preload);
  const last='/defense/models/dwarf-recover-game.webp';
  for(const [src,resolve] of pending)if(src!==last)resolve();
  assert.equal(art.idleSpriteAsset('dwarf'),null);
  assert.equal(art.spriteAsset(2).src,'/defense/atlas.png');
  assert.equal(art.actionSpriteAsset('dwarf','strike')?.src,'/defense/melee-motion.webp');
  assert.ok(pending.has(last));pending.get(last)!();await preload;
  assert.equal(art.idleSpriteAsset('dwarf')?.src,'/defense/models/dwarf-idle-game.webp');
  assert.equal(art.actionSpriteAsset('dwarf','strike')?.src,'/defense/models/dwarf-strike-game.webp');
 }finally{
  if(previous)Object.defineProperty(globalThis,'Image',previous);else Reflect.deleteProperty(globalThis,'Image');
 }
});

test('the insulator slime uses its baked poses with one ground band and falls back to the atlas when the render fails',async()=>{
 const {art}=await loadWithImageResults(()=>false,'slime-ok');
 const poses=(['walk-a','walk-b','hit'] as const).map(pose=>art.monsterSpriteAsset('insulator',pose));
 assert.ok(poses.every(asset=>asset?.src==='/defense/models/insulator-slime-atlas.webp'));
 const boxes=poses.map(asset=>asset!.viewBox.split(' ').map(Number));
 assert.equal(new Set(boxes.map(([,y,w,h])=>`${y},${w},${h}`)).size,1,'every pose shares a crop height and ground band');
 assert.equal(art.monsterSpriteAsset('insulator','death')?.viewBox,poses[2]?.viewBox);
 assert.equal(art.spriteAsset(13).src,'/defense/models/insulator-slime-atlas.webp');
 const {art:failed}=await loadWithImageResults(src=>src.includes('insulator-slime'),'slime-failed');
 assert.equal(failed.monsterSpriteAsset('insulator','walk-a'),null);
 assert.equal(failed.spriteAsset(13).src,'/defense/atlas.png','the original sprite remains');
 assert.equal(failed.monsterSpriteAsset('frostwolf','walk-a')?.src,'/defense/models/frost-wolf-atlas.webp','other monsters are unaffected');
});

test('the stone golem uses its baked poses with one crop band and falls back to the atlas when the render fails',async()=>{
 const {art}=await loadWithImageResults(()=>false,'golem-ok');
 const poses=(['walk-a','walk-b','hit'] as const).map(pose=>art.monsterSpriteAsset('stone',pose));
 assert.ok(poses.every(asset=>asset?.src==='/defense/models/stone-golem-atlas.webp'));
 const boxes=poses.map(asset=>asset!.viewBox.split(' ').map(Number));
 assert.equal(new Set(boxes.map(([,y,w,h])=>`${y},${w},${h}`)).size,1,'every pose shares a crop band so the feet stay on the ground');
 assert.ok(boxes.every(([x,,w],i)=>x>=i*384&&x+w<=(i+1)*384),'each crop stays inside its own 384px atlas cell');
 assert.equal(art.monsterSpriteAsset('stone','death')?.viewBox,poses[2]?.viewBox);
 assert.equal(art.spriteAsset(11).src,'/defense/models/stone-golem-atlas.webp');
 const {art:failed}=await loadWithImageResults(src=>src.includes('stone-golem'),'golem-failed');
 assert.equal(failed.monsterSpriteAsset('stone','walk-a')?.src,'/defense/monster-models.webp','the illustrated golem remains');
});

test('the wood soldier uses its baked poses with one crop band and falls back to the illustrated atlas when the render fails',async()=>{
 const {art}=await loadWithImageResults(()=>false,'wood-ok');
 const poses=(['walk-a','walk-b','hit'] as const).map(pose=>art.monsterSpriteAsset('wood',pose));
 assert.ok(poses.every(asset=>asset?.src==='/defense/models/wood-soldier-atlas.webp'));
 const boxes=poses.map(asset=>asset!.viewBox.split(' ').map(Number));
 assert.equal(new Set(boxes.map(([,y,w,h])=>`${y},${w},${h}`)).size,1,'every pose shares a crop band so the feet stay on the ground');
 assert.ok(boxes.every(([x,,w],i)=>x>=i*384&&x+w<=(i+1)*384),'each crop stays inside its own 384px atlas cell');
 assert.equal(art.spriteAsset(9).src,'/defense/models/wood-soldier-atlas.webp');
 const {art:failed}=await loadWithImageResults(src=>src.includes('wood-soldier'),'wood-failed');
 assert.equal(failed.monsterSpriteAsset('wood','walk-a')?.src,'/defense/monster-models.webp','the illustrated soldier remains');
});

test('the ice knight uses its baked poses with one crop band and falls back to the illustrated atlas when the render fails',async()=>{
 const {art}=await loadWithImageResults(()=>false,'ice-ok');
 const poses=(['walk-a','walk-b','hit'] as const).map(pose=>art.monsterSpriteAsset('ice',pose));
 assert.ok(poses.every(asset=>asset?.src==='/defense/models/ice-knight-atlas.webp'));
 const boxes=poses.map(asset=>asset!.viewBox.split(' ').map(Number));
 assert.equal(new Set(boxes.map(([,y,w,h])=>`${y},${w},${h}`)).size,1,'every pose shares a crop band so the feet stay on the ground');
 assert.ok(boxes.every(([x,,w],i)=>x>=i*384&&x+w<=(i+1)*384),'each crop stays inside its own 384px atlas cell');
 assert.equal(art.spriteAsset(10).src,'/defense/models/ice-knight-atlas.webp');
 const {art:failed}=await loadWithImageResults(src=>src.includes('ice-knight'),'ice-failed');
 assert.equal(failed.monsterSpriteAsset('ice','walk-a')?.src,'/defense/monster-models.webp','the illustrated knight remains');
});

test('the metal soldier uses its baked poses with one crop band and keeps the single illustrated frame when the render fails',async()=>{
 const {art}=await loadWithImageResults(()=>false,'metal-ok');
 const poses=(['walk-a','walk-b','hit'] as const).map(pose=>art.monsterSpriteAsset('metal',pose));
 assert.ok(poses.every(asset=>asset?.src==='/defense/models/metal-soldier-atlas.webp'));
 const boxes=poses.map(asset=>asset!.viewBox.split(' ').map(Number));
 assert.equal(new Set(boxes.map(([,y,w,h])=>`${y},${w},${h}`)).size,1,'every pose shares a crop band so the feet stay on the ground');
 assert.ok(boxes.every(([x,,w],i)=>x>=i*384&&x+w<=(i+1)*384),'each crop stays inside its own 384px atlas cell');
 assert.equal(art.spriteAsset(12).src,'/defense/models/metal-soldier-atlas.webp');
 const {art:failed}=await loadWithImageResults(src=>src.includes('metal-soldier'),'metal-failed');
 assert.equal(failed.monsterSpriteAsset('metal','walk-a'),null,'no baked pose means the engine keeps the illustrated frame');
 assert.equal(failed.spriteAsset(12).src,'/defense/atlas.png');
});

test('the frost wolf uses its baked poses with one crop band and falls back to the illustrated atlas when the render fails',async()=>{
 const {art}=await loadWithImageResults(()=>false,'wolf-ok');
 const poses=(['walk-a','walk-b','hit'] as const).map(pose=>art.monsterSpriteAsset('frostwolf',pose));
 assert.ok(poses.every(asset=>asset?.src==='/defense/models/frost-wolf-atlas.webp'));
 const boxes=poses.map(asset=>asset!.viewBox.split(' ').map(Number));
 assert.equal(new Set(boxes.map(([,y,w,h])=>`${y},${w},${h}`)).size,1,'every pose shares a crop band so the paws stay on the ground');
 assert.ok(boxes.every(([x,,w],i)=>x>=i*384&&x+w<=(i+1)*384),'each crop stays inside its own 384px atlas cell');
 const {art:failed}=await loadWithImageResults(src=>src.includes('frost-wolf'),'wolf-failed');
 assert.equal(failed.monsterSpriteAsset('frostwolf','walk-a')?.src,'/defense/monster-models.webp','the illustrated wolf remains');
});

test('every baked monster atlas is requested by the preloader, and the unbaked ones add no extra request',async()=>{
 const {requests}=await loadWithImageResults(()=>false,'monster-preload');
 for(const id of ['insulator-slime','stone-golem','wood-soldier','wood-soldier-walk','ice-knight','frost-wolf','frost-wolf-trot','metal-soldier'])assert.equal(requests.filter(src=>src===`/defense/models/${id}-atlas.webp`).length,1,`${id} atlas is preloaded exactly once`);
 assert.equal(requests.filter(src=>src.endsWith('-atlas.webp')&&!src.includes('/dwarf-attack-')&&!src.includes('/dwarf-locomotion-')&&!src.includes('/dwarf-hammer-')&&!src.includes('/water-action-')&&!src.includes('/water-lv3-action-')&&!src.includes('/ballista-')&&!src.includes('/ian-')&&!src.includes('/riel-')&&!src.includes('/cheongun-')&&!src.includes('/luna-')&&!src.includes('/moonlight-')&&!src.includes('/fire-action-')&&!src.includes('/fire-lv3-action-')).length,9);
});

test('every monster and boss crop stays inside its source sheet in each pose, for baked atlases and their illustrated fallbacks',async()=>{
 const kinds=['wood','ice','stone','metal','frostwolf','insulator','boss','frostboss'] as const,poses=['idle','walk-a','walk-b','hit','charge','death'] as const;
 for(const [scenario,failed] of [['bounds-ok',()=>false],['bounds-fallback',(src:string)=>src.includes('-atlas.webp')]] as const){
  const {art}=await loadWithImageResults(failed,scenario);
  for(const kind of kinds)for(const pose of poses){
   const asset=art.monsterSpriteAsset(kind,pose);
   if(!asset){assert.ok(scenario==='bounds-fallback'&&(kind==='insulator'||kind==='metal'),`${kind}/${pose} has art unless it is an unbacked slime or metal soldier`);continue;}
   const [x,y,w,h]=asset.viewBox.split(' ').map(Number);
   assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=asset.width&&y+h<=asset.height,`${scenario} ${kind}/${pose} ${asset.viewBox} fits ${asset.width}x${asset.height}`);
  }
 }
});

test('walk frames require a complete walk and base set and preserve the shared ground anchor',async()=>{
 const {art}=await loadWithImageResults(()=>false,'walk-ready');
 const idle=art.idleSpriteAsset('dwarf')!;
 for(let i=0;i<8;i++){
  const frame=art.walkingSpriteAsset('dwarf',i*8)!;
  assert.equal(frame.src,`/defense/models/dwarf-walk-${i}-game.webp`);
  for(const key of ['viewBox','width','height','displayScale','groundY','nativeFacing'] as const)assert.equal(frame[key],idle[key]);
 }
 assert.equal(art.walkingSpriteAsset('dwarf',64)?.src,art.walkingSpriteAsset('dwarf',0)?.src);
 assert.equal(art.walkingSpriteAsset('barbarian',8),null);
 for(const missing of ['walk-3','strike']){
  const {art:partial}=await loadWithImageResults(src=>src.endsWith(`/dwarf-${missing}-game.webp`),`walk-missing-${missing}`);
  assert.equal(partial.walkingSpriteAsset('dwarf',8),null);
  if(missing==='walk-3')assert.equal(partial.idleSpriteAsset('dwarf')?.src,idle.src);
 }
});

test('the illustrated monster sheet is requested only when a baked atlas fails to load',async()=>{
 const {requests}=await loadWithImageResults(()=>false,'sheet-skipped');
 assert.equal(requests.includes('/defense/monster-models.webp'),false,'a healthy load skips the fallback sheet');
 const {art,requests:failedRequests}=await loadWithImageResults(src=>src.includes('wood-soldier'),'sheet-fetched');
 assert.equal(failedRequests.filter(src=>src==='/defense/monster-models.webp').length,1);
 assert.equal(art.monsterSpriteAsset('wood','walk-a')?.src,'/defense/monster-models.webp');
});


test('dwarf directional attacks share the idle scale and ground and fall back as one complete set',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'dwarf-directions');
 const from={x:200,y:200};
 for(let i=0;i<8;i++){
  const to={x:200+100*Math.cos(i*Math.PI/4),y:200+100*Math.sin(i*Math.PI/4)};
  for(const [frame,pose] of (['windup','strike','recover'] as const).entries()){
   const sprite=art.directionalActionSpriteAsset('dwarf',pose,from,to)!;
   assert.equal(sprite.src,`/defense/models/dwarf-attack-${i}-atlas.webp`);
   assert.equal(sprite.viewBox,`${frame*384} 0 384 384`);
   assert.equal(sprite.groundY!/384,art.idleSpriteAsset('dwarf')!.groundY!/640);
   assert.ok(Math.abs(sprite.displayScale!/6.8-art.idleSpriteAsset('dwarf')!.displayScale!/5.8)<1e-10,'camera zoom compensation preserves model world size');
  }
 }
 assert.equal(requests.filter(src=>src.includes('/dwarf-attack-')).length,8);
 assert.equal(art.directionalActionSpriteAsset('dwarf','strike',from,from),null);
 assert.equal(art.directionalActionSpriteAsset('barbarian','strike',from,{x:250,y:200}),null);
 for(const failedFile of ['dwarf-attack-6-atlas.webp','dwarf-windup-game.webp']){
  const {art:failed}=await loadWithImageResults(src=>src.endsWith(failedFile),failedFile);
  for(const pose of ['windup','strike','recover'] as const)assert.equal(failed.directionalActionSpriteAsset('dwarf',pose,from,{x:250,y:200}),null);
  assert.ok(failed.actionSpriteAsset('dwarf','strike'),'legacy model or illustration remains available');
 }
});


test('water cannon rotates its complete Lv.2 set and uses only actual recoil to select poses',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'water-action');const from={x:300,y:200};
 for(let i=0;i<8;i++){
  const to={x:300+Math.cos(i*Math.PI/4)*100,y:200+Math.sin(i*Math.PI/4)*100};
  for(const [recoil,pose] of [[0,0],[.24,1],[.1,2]]){
   const rendered=art.waterCannonActionSpriteAsset('cannon','water',2,from,to,recoil)!;
   assert.equal(rendered.direction,i);assert.equal(rendered.pose,pose);
   assert.equal(rendered.asset.src,`/defense/models/water-action-${i}-atlas.webp`);
   assert.ok(Number.isFinite(rendered.muzzle.x)&&Number.isFinite(rendered.muzzle.y));
   assert.equal(rendered.asset.displayScale,art.towerSpriteAsset('cannon','water',2)!.displayScale);
  }
  assert.equal(art.waterCannonActionSpriteAsset('cannon','water',2,from,to,.24,true)?.pose,0);
 }
 assert.equal(requests.filter(src=>src.includes('/water-action-')).length,8);
 const to={x:400,y:200};
 assert.equal(art.waterCannonActionSpriteAsset('cannon','water',1,from,to),null);
 assert.equal(art.waterCannonActionSpriteAsset('cannon','crush',2,from,to),null);
 assert.equal(art.waterCannonActionSpriteAsset('cannon','water',2,from,from),null);
 const {art:failed}=await loadWithImageResults(src=>src.endsWith('water-action-3-atlas.webp'),'water-action-failure');
 assert.equal(failed.waterCannonActionSpriteAsset('cannon','water',2,from,to),null);
 assert.equal(failed.towerSpriteAsset('cannon','water',2)?.src,'/defense/models/water-cannon-game.webp');
});


test('final water cannon preserves eight aim directions, mastery size and the rendered muzzle',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'water-lv3-action');const from={x:300,y:200};
 const metadata=JSON.parse(readFileSync(new URL('../../../public/defense/models/water-cannon-lv3-action.json',import.meta.url),'utf8'));
 for(let direction=0;direction<8;direction++){
  const to={x:from.x+Math.cos(direction*Math.PI/4)*100,y:from.y+Math.sin(direction*Math.PI/4)*100};
  for(const [recoil,pose] of [[0,0],[.24,1],[.1,2]]){
   const render=art.waterCannonActionSpriteAsset('cannon','water',3,from,to,recoil)!;
   assert.equal(render.direction,direction);assert.equal(render.pose,pose);
   assert.equal(render.asset.src,`/defense/models/water-lv3-action-${direction}-atlas.webp`);
   assert.equal(render.asset.displayScale,art.towerSpriteAsset('cannon','water',3)!.displayScale);
   const [mx,my]=metadata.directions[direction].poses[pose].muzzle;
   assert.ok(Math.abs(render.muzzle.x-(mx-320)/576*1.16*1.025*104)<.001);
   assert.ok(Math.abs(render.muzzle.y-(.1+(my-600)/576*1.16*1.025)*104)<.001);
  }
  for(const recoil of [.24,.1,NaN,Infinity,-1])assert.equal(art.waterCannonActionSpriteAsset('cannon','water',3,from,to,recoil,true)?.pose,0);
  const shell={source:'tower',actor:'cannon',element:'water',from,to} as Projectile;
  for(const sourceLevel of [2,3]){
   const muzzle=art.waterCannonActionSpriteAsset('cannon','water',sourceLevel,from,to)!.muzzle;
   assert.deepEqual(art.waterCannonProjectileOffset({...shell,sourceLevel}),{x:muzzle.x,y:39+muzzle.y});
  }
  assert.equal(art.waterCannonProjectileOffset(shell),undefined,'older saves retain their existing trajectory');
 }
 assert.equal(requests.filter(src=>src.includes('/water-lv3-action-')).length,8);
 assert.equal(requests.some(src=>src.endsWith('.glb')),false,'battle must not load workshop geometry');
});

test('a missing water action asset falls back only for its own upgrade level',async()=>{
 const from={x:300,y:200},to={x:400,y:200};
 for(const [level,files] of [[2,['water-action-3-atlas.webp','water-cannon-game.webp']],[3,['water-lv3-action-3-atlas.webp','water-cannon-lv3-game.webp']]] as const){
  for(const file of files){
   const {art}=await loadWithImageResults(src=>src.endsWith(file),`independent-${file}`);
   assert.equal(art.waterCannonActionSpriteAsset('cannon','water',level,from,to),null);
   assert.ok(art.waterCannonActionSpriteAsset('cannon','water',level===2?3:2,from,to),'other upgrade stays articulated');
   assert.ok(art.towerSpriteAsset('cannon','water',level),'authored fallback remains available');
   if(level===3&&file.includes('atlas'))assert.equal(art.towerSpriteAsset('cannon','water',3)?.src,'/defense/models/water-cannon-lv3-game.webp');
  }
 }
});

test('Bron locomotion shares attack projection, never mirrors hands, and falls back as one set',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'dwarf-locomotion');
 for(let direction=0;direction<8;direction++){
  const angle=direction*Math.PI/4,heading={x:Math.cos(angle),y:Math.sin(angle)};
  const attack=art.directionalActionSpriteAsset('dwarf','strike',{x:0,y:0},heading)!;
  const frames=Array.from({length:8},(_,i)=>art.directionalLocomotionSpriteAsset('dwarf',heading,i*8)!);
  assert.equal(new Set(frames.map(f=>f.viewBox)).size,8);
  const rest=art.directionalLocomotionSpriteAsset('dwarf',heading,null)!;
  assert.equal(rest.viewBox,'2048 0 256 256');
  for(const f of [...frames,rest]){
   assert.ok(f.src.endsWith(`dwarf-locomotion-${direction}-atlas.webp`));
   assert.equal(f.oriented,true);assert.equal(f.groundY!/256,attack.groundY!/384);assert.equal(f.displayScale,attack.displayScale);
   const [x,y,w,h]=f.viewBox.split(' ').map(Number);assert.ok(x+w<=f.width&&y+h<=f.height);
  }
 }
 assert.equal(art.directionalLocomotionSpriteAsset('barbarian',{x:1,y:0},0),null);
 assert.equal(art.directionalLocomotionSpriteAsset('dwarf',{x:0,y:0},0),null);
 assert.ok(!requests.some(s=>s.endsWith('.glb')));
 for(const file of ['dwarf-locomotion-3-atlas.webp','dwarf-idle-game.webp']){
  const {art:failed}=await loadWithImageResults(s=>s.endsWith(file),'locomotion-missing-'+file);
  for(let i=0;i<8;i++)assert.equal(failed.directionalLocomotionSpriteAsset('dwarf',{x:Math.cos(i),y:Math.sin(i)},0),null);
  assert.equal(Boolean(failed.walkingSpriteAsset('dwarf',0)),file!=='dwarf-idle-game.webp');
 }
});

test('ballista release and reload keep the fixed base projection and authored socket at both levels',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'ballista-action');const from={x:300,y:200};
 for(const level of [2,3]){
  const id='piercing-ballista'+(level===3?'-lv3':'')+'-action';
  const metadata=JSON.parse(readFileSync(new URL(`../../../public/defense/models/${id}.json`,import.meta.url),'utf8'));
  for(let direction=0;direction<8;direction++){
   const a=direction*Math.PI/4,to={x:from.x+100*Math.cos(a),y:from.y+100*Math.sin(a)};
   for(const [recoil,pose] of [[0,0],[.24,1],[.16001,1],[.16,2],[.08001,2],[.08,3],[.001,3],[-1,0],[NaN,0],[Infinity,0]]){
    const render=art.ballistaActionSpriteAsset('crossbow','pierce',level,from,to,recoil)!;
    assert.equal(render.pose,pose);assert.equal(render.direction,direction);
    assert.equal(render.asset.displayScale,art.towerSpriteAsset('crossbow','pierce',level)!.displayScale);
    const [x,y,w,h]=render.asset.viewBox.split(' ').map(Number);assert.ok(x+w<=render.asset.width&&y+h<=render.asset.height);
    const [mx,my]=metadata.directions[direction].poses[pose].muzzle,scale=1.16*(level===3?1.025:1),size=92+level*4;
    assert.ok(Math.abs(render.muzzle.x-(mx-320)/576*scale*size)<.001);
    assert.ok(Math.abs(render.muzzle.y-(.1+(my-600)/576*scale)*size)<.001);
    assert.equal(art.ballistaActionSpriteAsset('crossbow','pierce',level,from,to,recoil,true)?.pose,0);
   }
   const shot={source:'tower',actor:'crossbow',pierce:true,sourceLevel:level,from,to,launchAim:{...to}} as Projectile;
   const before=structuredClone(shot),offset=art.ballistaProjectileOffset(shot);
   assert.ok(offset);assert.deepEqual(shot,before,'rendering must not mutate simulation');
   assert.deepEqual(art.ballistaProjectileOffset({...shot,to:{x:999,y:999}}),offset,'tracking cannot rotate the recorded launch socket');
   assert.equal(art.ballistaProjectileOffset({...shot,launchAim:undefined}),undefined,'older projectiles preserve their previous screen path');
  }
 }
 assert.equal(art.ballistaActionSpriteAsset('crossbow','rapid',2,from,{x:400,y:200}),null);
 assert.equal(art.ballistaActionSpriteAsset('crossbow','pierce',1,from,{x:400,y:200}),null);
 assert.ok(!requests.some(u=>u.endsWith('.glb')));
});

test('missing ballista action images only disable their own level and retain existing fallback',async()=>{
 for(const [level,files] of [[2,['ballista-action-3-atlas.webp','piercing-ballista-game.webp']],[3,['ballista-lv3-action-3-atlas.webp','piercing-ballista-lv3-game.webp']]] as const){
  for(const file of files){const {art}=await loadWithImageResults(s=>s.endsWith(file),'ballista-fail-'+file);const from={x:0,y:0},to={x:100,y:0};
   assert.equal(art.ballistaActionSpriteAsset('crossbow','pierce',level,from,to),null);
   assert.ok(art.ballistaActionSpriteAsset('crossbow','pierce',level===2?3:2,from,to));
   assert.ok(art.towerSpriteAsset('crossbow','pierce',level));
   assert.ok(art.waterCannonActionSpriteAsset('cannon','water',2,from,to));
  }
 }
});


test('hammer sequence shares walking projection and keeps a complete set in every orientation',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'hammer-sequence');
 for(let direction=0;direction<8;direction++){
  const angle=direction*Math.PI/4,heading={x:Math.cos(angle),y:Math.sin(angle)};
  const attack={from:{x:0,y:0},to:{x:heading.x*80,y:heading.y*80},elapsed:0,hitAt:.24,duration:.52} as import('./types.ts').CombatAttack;
  const idle=art.directionalLocomotionSpriteAsset('dwarf',heading,null)!;
  for(const elapsed of [0,.05,.12,.19,.24,.32,.40,.47,.51]){
   const asset=art.hammerSequenceSpriteAsset('dwarf',{...attack,elapsed})!;
   assert.equal(asset.src,`/defense/models/dwarf-hammer-${direction}-atlas.webp`);
   assert.equal(asset.displayScale,idle.displayScale);assert.equal(asset.groundY,idle.groundY);assert.equal(asset.oriented,true);
   const [x,y,w,h]=asset.viewBox.split(' ').map(Number);assert.ok(x+w<=asset.width&&y+h<=asset.height);
  }
  assert.equal(art.hammerSequenceSpriteAsset('dwarf',attack,true)!.viewBox,'0 0 256 256');
  assert.equal(art.hammerSequenceSpriteAsset('dwarf',{...attack,elapsed:.24},true)!.viewBox,'1024 0 256 256');
  assert.equal(art.hammerSequenceSpriteAsset('mage',attack),null);
 }
 assert.equal(requests.filter(s=>s.includes('/dwarf-hammer-')).length,8);assert.ok(!requests.some(s=>s.endsWith('.glb')));
});

test('missing hammer image retains the previous directional attack and gait',async()=>{
 for(const file of ['dwarf-hammer-4-atlas.webp','dwarf-idle-game.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'hammer-failure-'+file);
  const attack={from:{x:0,y:0},to:{x:100,y:0},elapsed:.12,hitAt:.24,duration:.52} as import('./types.ts').CombatAttack;
  assert.equal(art.hammerSequenceSpriteAsset('dwarf',attack),null);
  assert.equal(Boolean(art.directionalActionSpriteAsset('dwarf','windup',attack.from,attack.to)),file!=='dwarf-idle-game.webp');
  assert.equal(Boolean(art.directionalLocomotionSpriteAsset('dwarf',{x:1,y:0},0)),file!=='dwarf-idle-game.webp');
  assert.ok(art.actionSpriteAsset('dwarf','windup'));
 }
});


test('hammer contact ribbon follows the baked head projection only while the contact pose is visible',async()=>{
 const {art}=await loadWithImageResults(()=>false,'hammer-trail');
 const metadata=JSON.parse(readFileSync(new URL('../../../public/defense/models/dwarf-hammer-sequence.json',import.meta.url),'utf8'));
 for(let direction=0;direction<8;direction++){
  const angle=direction*Math.PI/4,attack={actor:'dwarf',from:{x:0,y:0},to:{x:100*Math.cos(angle),y:100*Math.sin(angle)},elapsed:.24,hitAt:.24,duration:.52} as import('./types.ts').CombatAttack;
  for(const size of [84,94,84*1.25,94*1.25]){
   const trail=art.hammerContactTrail(attack,size)!;assert.equal(trail.length,7);
   trail.forEach((point,i)=>{const [x,y]=metadata.directions[direction].contact_trail[i];assert.ok(Math.abs(point.x-(x-192)/384*metadata.frame.display_scale*size)<.0001);assert.ok(Math.abs(point.y-(y-330)/384*metadata.frame.display_scale*size)<.0001)});
  }
  for(const elapsed of [0,.19,.23999,.32,.4,.51])assert.equal(art.hammerContactTrail({...attack,elapsed},84),null);
 }
 const {art:failed}=await loadWithImageResults(s=>s.endsWith('dwarf-hammer-4-atlas.webp'),'hammer-trail-failure');
 assert.equal(failed.hammerContactTrail({actor:'dwarf',from:{x:0,y:0},to:{x:100,y:0},elapsed:.24,hitAt:.24,duration:.52} as import('./types.ts').CombatAttack,84),null);
});


test('Ian uses one complete modeled body and projection for idle, walking and eight cast directions',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'ian-ready');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/ian-mage.json',import.meta.url),'utf8'));
 for(let d=0;d<8;d++){
  const angle=d*Math.PI/4,heading={x:Math.cos(angle),y:Math.sin(angle)},from={x:300,y:200},to={x:from.x+heading.x*80,y:from.y+heading.y*80};
  const idle=art.directionalLocomotionSpriteAsset('mage',heading,null)!;assert.equal(idle.src,`/defense/models/ian-cast-${d}-atlas.webp`);assert.equal(idle.viewBox,'0 0 256 256');
  for(let frame=0;frame<8;frame++){const walk=art.directionalLocomotionSpriteAsset('mage',heading,frame*8)!;assert.equal(walk.viewBox,`${frame*256} 0 256 256`);assert.equal(walk.groundY,idle.groundY);assert.equal(walk.displayScale,idle.displayScale);assert.equal(walk.oriented,true);}
  for(const [pose,index] of [['windup',1],['strike',2],['recover',3]] as const){
   const asset=art.directionalActionSpriteAsset('mage',pose,from,to)!;assert.equal(asset.viewBox,`${index*256} 0 256 256`);assert.equal(asset.groundY,idle.groundY);assert.equal(asset.displayScale,idle.displayScale);
   assert.equal(art.directionalActionSpriteAsset('mage',pose,from,to,true)!.viewBox,`${pose==='strike'?512:0} 0 256 256`);
   for(const size of [84,94,105,117.5]){const socket=art.mageCastSocket(from,to,size,pose)!;const [x,y]=meta.directions.cast[d].poses[index].socket;assert.ok(Math.abs(socket.x-(x-192)/384*meta.frame.display_scale*size)<.0001);assert.ok(Math.abs(socket.y-(y-330)/384*meta.frame.display_scale*size)<.0001);}
  }
  const shot={source:'hero',actor:'mage',sourceSize:84,from,to,launchAim:{...to}} as Projectile,original=structuredClone(shot),offset=art.mageProjectileOffset(shot,1.25)!;
  const socket=art.mageCastSocket(from,to,105)!;assert.deepEqual(offset,{x:socket.x,y:socket.y+27});assert.deepEqual(shot,original);
  assert.deepEqual(art.mageProjectileOffset({...shot,to:{x:999,y:999}},1.25),offset);assert.equal(art.mageProjectileOffset({...shot,launchAim:undefined}),undefined);
 }
 assert.equal(requests.filter(u=>u.includes('/ian-')).length,16);assert.ok(!requests.some(u=>u.endsWith('.glb')));assert.equal(art.spriteAsset(0).src,'/defense/atlas.png','portraits retain the concept illustration');
});

test('a missing Ian cast or walk image falls back as a whole without disabling other models',async()=>{
 for(const file of ['ian-cast-4-atlas.webp','ian-walk-7-atlas.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'ian-fail-'+file);
  assert.equal(art.idleSpriteAsset('mage'),null);assert.equal(art.walkingSpriteAsset('mage',20),null);
  assert.equal(art.directionalActionSpriteAsset('mage','strike',{x:0,y:0},{x:80,y:0}),null);
  assert.equal(art.actionSpriteAsset('mage','strike')?.src,'/defense/ranged-motion.webp');assert.ok(art.idleSpriteAsset('dwarf'));
  assert.equal(art.mageCastSocket({x:0,y:0},{x:80,y:0},84),null);
 }
});

test('Riel uses one complete modeled body and projection for idle, walking and eight cast directions',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'riel-ready');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/riel-archer.json',import.meta.url),'utf8'));
 for(let d=0;d<8;d++){
  const angle=d*Math.PI/4,heading={x:Math.cos(angle),y:Math.sin(angle)},from={x:300,y:200},to={x:from.x+heading.x*80,y:from.y+heading.y*80};
  const idle=art.directionalLocomotionSpriteAsset('elf',heading,null)!;assert.equal(idle.src,`/defense/models/riel-cast-${d}-atlas.webp`);assert.equal(idle.viewBox,'0 0 256 256');
  for(let frame=0;frame<8;frame++){const walk=art.directionalLocomotionSpriteAsset('elf',heading,frame*8)!;assert.equal(walk.viewBox,`${frame*256} 0 256 256`);assert.equal(walk.groundY,idle.groundY);assert.equal(walk.displayScale,idle.displayScale);assert.equal(walk.oriented,true);}
  for(const [pose,index] of [['windup',1],['strike',2],['recover',3]] as const){
   const asset=art.directionalActionSpriteAsset('elf',pose,from,to)!;assert.equal(asset.viewBox,`${index*256} 0 256 256`);assert.equal(asset.groundY,idle.groundY);assert.equal(asset.displayScale,idle.displayScale);
   assert.equal(art.directionalActionSpriteAsset('elf',pose,from,to,true)!.viewBox,`${pose==='strike'?512:0} 0 256 256`);
   for(const size of [84,94,105,117.5]){const socket=art.elfArrowSocket(from,to,size,pose)!;const [x,y]=meta.directions.cast[d].poses[index].socket;assert.ok(Math.abs(socket.x-(x-192)/384*meta.frame.display_scale*size)<.0001);assert.ok(Math.abs(socket.y-(y-330)/384*meta.frame.display_scale*size)<.0001);}
  }
  const shot={source:'hero',actor:'elf',sourceSize:84,from,to,launchAim:{...to}} as Projectile,original=structuredClone(shot),offset=art.elfProjectileOffset(shot,1.25)!;
  const socket=art.elfArrowSocket(from,to,105)!;assert.deepEqual(offset,{x:socket.x,y:socket.y+27});assert.deepEqual(shot,original);
  assert.deepEqual(art.elfProjectileOffset({...shot,to:{x:999,y:999}},1.25),offset);assert.equal(art.elfProjectileOffset({...shot,launchAim:undefined}),undefined);
 }
 assert.equal(requests.filter(u=>u.includes('/riel-')).length,16);assert.ok(!requests.some(u=>u.endsWith('.glb')));assert.equal(art.spriteAsset(0).src,'/defense/atlas.png','portraits retain the concept illustration');
});

test('a missing Riel cast or walk image falls back as a whole without disabling other models',async()=>{
 for(const file of ['riel-cast-4-atlas.webp','riel-walk-7-atlas.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'riel-fail-'+file);
  assert.equal(art.idleSpriteAsset('elf'),null);assert.equal(art.walkingSpriteAsset('elf',20),null);
  assert.equal(art.directionalActionSpriteAsset('elf','strike',{x:0,y:0},{x:80,y:0}),null);
  assert.equal(art.actionSpriteAsset('elf','strike')?.src,'/defense/ranged-motion.webp');assert.ok(art.idleSpriteAsset('dwarf'));
  assert.equal(art.elfArrowSocket({x:0,y:0},{x:80,y:0},84),null);
 }
});

test('Cheongun uses one complete modeled body and projection for idle, walking and eight cast directions',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'cheongun-ready');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/cheongun-tao.json',import.meta.url),'utf8'));
 for(let d=0;d<8;d++){
  const angle=d*Math.PI/4,heading={x:Math.cos(angle),y:Math.sin(angle)},from={x:300,y:200},to={x:from.x+heading.x*80,y:from.y+heading.y*80};
  const idle=art.directionalLocomotionSpriteAsset('tao',heading,null)!;assert.equal(idle.src,`/defense/models/cheongun-cast-${d}-atlas.webp`);assert.equal(idle.viewBox,'0 0 256 256');
  for(let frame=0;frame<8;frame++){const walk=art.directionalLocomotionSpriteAsset('tao',heading,frame*8)!;assert.equal(walk.viewBox,`${frame*256} 0 256 256`);assert.equal(walk.groundY,idle.groundY);assert.equal(walk.displayScale,idle.displayScale);assert.equal(walk.oriented,true);}
  for(const [pose,index] of [['windup',1],['strike',2],['recover',3]] as const){
   const asset=art.directionalActionSpriteAsset('tao',pose,from,to)!;assert.equal(asset.viewBox,`${index*256} 0 256 256`);assert.equal(asset.groundY,idle.groundY);assert.equal(asset.displayScale,idle.displayScale);
   assert.equal(art.directionalActionSpriteAsset('tao',pose,from,to,true)!.viewBox,`${pose==='strike'?512:0} 0 256 256`);
   for(const size of [84,94,105,117.5]){const socket=art.taoSealSocket(from,to,size,pose)!;const [x,y]=meta.directions.cast[d].poses[index].socket;assert.ok(Math.abs(socket.x-(x-192)/384*meta.frame.display_scale*size)<.0001);assert.ok(Math.abs(socket.y-(y-330)/384*meta.frame.display_scale*size)<.0001);}
  }
  const shot={source:'hero',actor:'tao',sourceSize:84,from,to,launchAim:{...to}} as Projectile,original=structuredClone(shot),offset=art.taoProjectileOffset(shot,1.25)!;
  const socket=art.taoSealSocket(from,to,105)!;assert.deepEqual(offset,{x:socket.x,y:socket.y+27});assert.deepEqual(shot,original);
  assert.deepEqual(art.taoProjectileOffset({...shot,to:{x:999,y:999}},1.25),offset);assert.equal(art.taoProjectileOffset({...shot,launchAim:undefined}),undefined);
 }
 assert.equal(requests.filter(u=>u.includes('/cheongun-')).length,16);assert.ok(!requests.some(u=>u.endsWith('.glb')));assert.equal(art.spriteAsset(0).src,'/defense/atlas.png','portraits retain the concept illustration');
});

test('a missing Cheongun cast or walk image falls back as a whole without disabling other models',async()=>{
 for(const file of ['cheongun-cast-4-atlas.webp','cheongun-walk-7-atlas.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'cheongun-fail-'+file);
  assert.equal(art.idleSpriteAsset('tao'),null);assert.equal(art.walkingSpriteAsset('tao',20),null);
  assert.equal(art.directionalActionSpriteAsset('tao','strike',{x:0,y:0},{x:80,y:0}),null);
  assert.equal(art.actionSpriteAsset('tao','strike')?.src,'/defense/ranged-motion.webp');assert.ok(art.idleSpriteAsset('dwarf'));
  assert.equal(art.taoSealSocket({x:0,y:0},{x:80,y:0},84),null);
 }
});

test('Luna uses one complete modeled body and projection for idle, walking and eight cast directions',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'luna-ready');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/luna-druid.json',import.meta.url),'utf8'));
 for(let d=0;d<8;d++){
  const angle=d*Math.PI/4,heading={x:Math.cos(angle),y:Math.sin(angle)},from={x:300,y:200},to={x:from.x+heading.x*80,y:from.y+heading.y*80};
  const idle=art.directionalLocomotionSpriteAsset('druid',heading,null)!;assert.equal(idle.src,`/defense/models/luna-cast-${d}-atlas.webp`);assert.equal(idle.viewBox,'0 0 256 256');
  for(let frame=0;frame<8;frame++){const walk=art.directionalLocomotionSpriteAsset('druid',heading,frame*8)!;assert.equal(walk.viewBox,`${frame*256} 0 256 256`);assert.equal(walk.groundY,idle.groundY);assert.equal(walk.displayScale,idle.displayScale);assert.equal(walk.oriented,true);}
  for(const [pose,index] of [['windup',1],['strike',2],['recover',3]] as const){
   const asset=art.directionalActionSpriteAsset('druid',pose,from,to)!;assert.equal(asset.viewBox,`${index*256} 0 256 256`);assert.equal(asset.groundY,idle.groundY);assert.equal(asset.displayScale,idle.displayScale);
   assert.equal(art.directionalActionSpriteAsset('druid',pose,from,to,true)!.viewBox,`${pose==='strike'?512:0} 0 256 256`);
   for(const size of [84,94,105,117.5]){const socket=art.druidCastSocket(from,to,size,pose)!;const [x,y]=meta.directions.cast[d].poses[index].socket;assert.ok(Math.abs(socket.x-(x-192)/384*meta.frame.display_scale*size)<.0001);assert.ok(Math.abs(socket.y-(y-330)/384*meta.frame.display_scale*size)<.0001);}
  }
  const shot={source:'hero',actor:'druid',sourceSize:84,from,to,launchAim:{...to}} as Projectile,original=structuredClone(shot),offset=art.druidProjectileOffset(shot,1.25)!;
  const socket=art.druidCastSocket(from,to,105)!;assert.deepEqual(offset,{x:socket.x,y:socket.y+27});assert.deepEqual(shot,original);
  assert.deepEqual(art.druidProjectileOffset({...shot,to:{x:999,y:999}},1.25),offset);assert.equal(art.druidProjectileOffset({...shot,launchAim:undefined}),undefined);
 }
 assert.equal(requests.filter(u=>u.includes('/luna-')).length,16);assert.ok(!requests.some(u=>u.endsWith('.glb')));assert.equal(art.spriteAsset(17).src,'/defense/snow-atlas.png','portraits retain the concept illustration');
});

test('a missing Luna cast or walk image falls back as a whole without disabling other models',async()=>{
 for(const file of ['luna-cast-4-atlas.webp','luna-walk-7-atlas.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'luna-fail-'+file);
  assert.equal(art.idleSpriteAsset('druid'),null);assert.equal(art.walkingSpriteAsset('druid',20),null);
  assert.equal(art.directionalActionSpriteAsset('druid','strike',{x:0,y:0},{x:80,y:0}),null);
  assert.equal(art.actionSpriteAsset('druid','strike')?.src,'/defense/ranged-motion.webp');assert.ok(art.idleSpriteAsset('dwarf'));
  assert.equal(art.druidCastSocket({x:0,y:0},{x:80,y:0},84),null);
 }
});

test('the companion wolf keeps one body across eight bite directions and grounded walk poses',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'pet-wolf-ready');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/moonlight-wolf.json',import.meta.url),'utf8'));
 const luna=JSON.parse(readFileSync(new URL('../../../public/defense/models/luna-druid.json',import.meta.url),'utf8'));
 for(let d=0;d<8;d++){
  const angle=d*Math.PI/4,heading={x:Math.cos(angle),y:Math.sin(angle)},from={x:300,y:200},to={x:from.x+heading.x*65,y:from.y+heading.y*65};
  const idle=art.directionalLocomotionSpriteAsset('wolf',heading,null)!;assert.equal(idle.src,`/defense/models/moonlight-bite-${d}-atlas.webp`);assert.equal(idle.viewBox,'0 0 256 256');
  for(let f=0;f<8;f++){const walk=art.directionalLocomotionSpriteAsset('wolf',heading,f/8*meta.gait.stride_per_size[d]*73)!;assert.equal(walk.src,`/defense/models/moonlight-walk-${d}-atlas.webp`);assert.equal(walk.viewBox,`${f*256} 0 256 256`);assert.equal(walk.groundY,idle.groundY);assert.equal(walk.displayScale,idle.displayScale);assert.equal(walk.oriented,true);}
  for(const [pose,index] of [['windup',2],['strike',4],['recover',6]] as const){
   const asset=art.directionalActionSpriteAsset('wolf',pose,from,to)!;assert.equal(asset.viewBox,`${index*256} 0 256 256`);assert.equal(asset.displayScale,idle.displayScale);
   assert.equal(art.directionalActionSpriteAsset('wolf',pose,from,to,true)!.viewBox,`${pose==='strike'?1024:0} 0 256 256`);
   for(const size of [73,91.25]){const p=art.petBiteSocket(from,to,size,pose)!;const [x,y]=meta.directions.bite[d].poses[index].socket;assert.ok(Math.abs(p.x-(x-192)/384*meta.frame.display_scale*size)<.0001);assert.ok(Math.abs(p.y-(y-330)/384*meta.frame.display_scale*size)<.0001);}
  }
  const bounds=meta.directions.bite[d].poses[0].bounds,lunaBounds=luna.directions.cast[d].poses[0].bounds;
  const ratio=(bounds[3]-bounds[1])*73/((lunaBounds[3]-lunaBounds[1])*84);assert.ok(ratio>.4&&ratio<.85,`direction ${d} companion/owner height ${ratio}`);
 }
 assert.equal(requests.filter(u=>u.includes('/moonlight-')).length,16);assert.ok(!requests.some(u=>u.endsWith('.glb')));
 assert.equal(art.spriteAsset(18).src,'/defense/snow-atlas.png','portrait retains the original companion concept');
 assert.equal(art.monsterSpriteAsset('frostwolf','idle')!.src,'/defense/models/frost-wolf-atlas.webp','enemy model is independent');
});

test('the modeled bite cue exists only at contact and follows the current mouth position',async()=>{
 const {art}=await loadWithImageResults(()=>false,'pet-contact');
 const a={actor:'wolf',source:'pet',from:{x:200,y:200},to:{x:280,y:200},elapsed:.13,hitAt:.13,duration:.41} as CombatAttack;
 for(const elapsed of [-1,0,.129,.25,.41,NaN])assert.equal(art.petBiteContact({...a,elapsed},73),null);
 for(const elapsed of [.13,.18])assert.deepEqual(art.petBiteContact({...a,elapsed},73),art.petBiteSocket(a.from,a.to,73));
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/moonlight-wolf.json',import.meta.url),'utf8'));
 const rebound=art.petBiteContact({...a,elapsed:.21},73)!;const [x,y]=meta.directions.bite[0].poses[5].socket;assert.ok(Math.abs(rebound.x-(x-192)/384*meta.frame.display_scale*73)<.0001);assert.ok(Math.abs(rebound.y-(y-330)/384*meta.frame.display_scale*73)<.0001);assert.notDeepEqual(rebound,art.petBiteContact(a,73));
 assert.deepEqual(art.petBiteContact({...a,elapsed:.21},73,a.from,true),art.petBiteSocket(a.from,a.to,73));
 const moved={x:275,y:150};assert.deepEqual(art.petBiteContact(a,91.25,moved),art.petBiteSocket(moved,a.to,91.25));assert.notDeepEqual(art.petBiteContact(a,73,moved),art.petBiteContact(a,73));
 assert.equal(art.petBiteContact({...a,actor:'dwarf'},73),null);assert.equal(art.petBiteContact({...a,duration:.1},73),null);
 for(const size of [0,-1,NaN])assert.equal(art.petBiteContact(a,size),null);
});

test('a missing companion bite or walk atlas uses one illustrated set without changing enemies or the owner',async()=>{
 for(const name of ['moonlight-bite-4-atlas.webp','moonlight-walk-7-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(name),'pet-failed-'+name);
  assert.equal(art.idleSpriteAsset('wolf'),null);assert.equal(art.walkingSpriteAsset('wolf',20),null);assert.equal(art.directionalActionSpriteAsset('wolf','strike',{x:0,y:0},{x:60,y:0}),null);
  assert.equal(art.actionSpriteAsset('wolf','strike')!.src,'/defense/melee-motion.webp');assert.ok(art.idleSpriteAsset('druid'));assert.ok(art.monsterWalkingSpriteAsset('frostwolf',10));
  assert.equal(art.petBiteContact({actor:'wolf',elapsed:.13,hitAt:.13,duration:.41,from:{x:0,y:0},to:{x:60,y:0}} as CombatAttack,73),null);
 }
});


test('wood club source, animated GLB and both battle atlases form one verified delivery',()=>{
 const read=(p:string)=>readFileSync(new URL('../../../'+p,import.meta.url));
 const m=JSON.parse(read('public/defense/models/wood-soldier.json').toString());
 assert.equal(createHash('sha256').update(read(m.source)).digest('hex'),m.source_sha256);
 for(const f of m.files){const data=read('public/defense/models/'+f.file);assert.equal(data.length,f.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256);}
 assert.equal(m.walk.frames,8);assert.equal(m.frame.ground[1],317.61);assert.equal(m.display_scale,1.2);
 const buffer=read('public/defense/models/wood-soldier.glb'),g=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());
 assert.ok(!g.images?.length,'the workshop uses actual geometry');assert.equal(g.animations.length,1);assert.equal(g.animations[0].name,m.walk.clip);
 const grip=g.nodes.findIndex((n:{name:string})=>n.name==='club-grip'),arm=g.nodes.find((n:{name:string})=>n.name==='arm-near');
 assert.ok(grip>=0&&arm.children.includes(grip),'club stays attached at the carrying hand');
 assert.ok(g.animations[0].channels.some((c:{target:{node:number}})=>c.target.node===grip),'wrist follow-through is present in the GLB');
 assert.ok(m.bounds.every((p:{bbox:number[]})=>p.bbox[0]>0&&p.bbox[1]>8&&p.bbox[2]<384&&p.bbox[3]<372),'all authored poses stay within the runtime crop');
});


test('the eight-stage bite sequence and sockets use the same direction, pose and ground contract',async()=>{
 const {art}=await loadWithImageResults(()=>false,'pet-bite-sequence');
 const m=JSON.parse(readFileSync(new URL('../../../public/defense/models/moonlight-wolf.json',import.meta.url),'utf8'));
 for(let d=0;d<8;d++)for(const [elapsed,f] of [[0,0],[.04,1],[.08,2],[.11,3],[.13,4],[.21,5],[.30,6],[.37,7],[.40,0]]){
  const from={x:30,y:50},to={x:from.x+Math.cos(d*Math.PI/4)*60,y:from.y+Math.sin(d*Math.PI/4)*60},a={actor:'wolf',from,to,elapsed,hitAt:.13,duration:.41} as CombatAttack,original=structuredClone(a);
  const asset=art.petBiteSequenceSpriteAsset(a)!;assert.equal(asset.viewBox,`${f*256} 0 256 256`);assert.equal(asset.width,2048);assert.equal(asset.groundY,220);assert.equal(asset.src,`/defense/models/moonlight-bite-${d}-atlas.webp`);assert.deepEqual(a,original);
  assert.equal(art.petBiteSequenceSpriteAsset(a,from,true)!.viewBox,`${elapsed>=.13&&elapsed<.25?1024:0} 0 256 256`);
  if(elapsed>=.13&&elapsed<.25){const point=art.petBiteContact(a,73)!,[x,y]=m.directions.bite[d].poses[f].socket;assert.ok(Math.abs(point.x-(x-192)/384*asset.displayScale!*73)<.0001);assert.ok(Math.abs(point.y-(y-330)/384*asset.displayScale!*73)<.0001);}
 }
 assert.equal(art.petBiteSequenceSpriteAsset({actor:'mage',from:{x:0,y:0},to:{x:60,y:0}} as CombatAttack),null);
 assert.equal(art.petBiteSequenceSpriteAsset({actor:'wolf',from:{x:0,y:0},to:{x:0,y:0}} as CombatAttack),null);
});

test('fire core charges before release, keeps a fixed crop, and projects its actual socket',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'fire-action');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/fire-tower-action.json',import.meta.url),'utf8'));
 for(const [windup,recoil,expected] of [[0,0,0],[.01,0,1],[.599,0,1],[.6,0,2],[.999,0,2],[0,.24,3],[0,.181,3],[0,.18,4],[0,.101,4],[0,.10,5],[0,.001,5],[NaN,NaN,0]]){
  const rendered=art.fireTowerActionSpriteAsset('magic','fire',2,windup,recoil)!;
  assert.equal(rendered.pose,expected);
  const [x,y]=meta.poses[expected].socket;
  assert.ok(Math.abs(rendered.muzzle.x-(x-320)/576*116)<.0001);
  assert.ok(Math.abs(rendered.muzzle.y-(10+(y-600)/576*116))<.0001);
  const [left,top,w,h]=rendered.asset.viewBox.split(' ').map(Number);
  assert.ok(left>=expected*384&&left+w<=(expected+1)*384);assert.equal(top,14.4);assert.equal(h,345.6);
  assert.equal(art.fireTowerActionSpriteAsset('magic','fire',2,windup,recoil,true)?.pose,0);
 }
 for(const pose of meta.poses){assert.equal(pose.foundation_drift,0);assert.ok(pose.fixed_meshes>40);}
 assert.equal(art.fireTowerActionSpriteAsset('magic','fire',1,0,.24),null);
 assert.equal(art.fireTowerActionSpriteAsset('magic','lightning',2,0,.24),null);
 assert.equal(requests.filter(s=>s.includes('/fire-action-')).length,1);
 assert.ok(!requests.some(s=>s.endsWith('.glb')));
 for(const file of meta.files){const bytes=readFileSync(new URL('../../../public/defense/models/'+file.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
});

test('fire projectile keeps its launch socket through tower upgrade or removal, and degrades as a set',async()=>{
 const {art}=await loadWithImageResults(()=>false,'fire-projectile');
 // Presentation depends only on the released projectile snapshot, never a live tower lookup.
 const p={source:'tower',actor:'magic',element:'fire',sourceLevel:2,from:{x:100,y:100},to:{x:200,y:200}} as Projectile;
 for(const reduced of [false,true]){
  const socket=art.fireTowerActionSpriteAsset('magic','fire',2,0,.24,reduced)!.muzzle;
  const expected={x:socket.x,y:socket.y+39};assert.deepEqual(art.fireTowerProjectileOffset(p,reduced),expected);
  assert.deepEqual(art.fireTowerProjectileOffset({...p,to:{x:-200,y:0}},reduced),expected);
 }
 assert.equal(art.fireTowerProjectileOffset({...p,sourceLevel:1}),undefined);
 assert.equal(art.fireTowerProjectileOffset({...p,element:'lightning'}),undefined);
 assert.equal(art.fireTowerProjectileOffset({...p,source:'hero'}),undefined);
 for(const file of ['fire-action-atlas.webp','fire-tower-game.webp']){
  const {art:failed}=await loadWithImageResults(s=>s.endsWith(file),'fire-failed-'+file);
  assert.equal(failed.fireTowerActionSpriteAsset('magic','fire',2,.8,.24),null);
  assert.equal(failed.fireTowerProjectileOffset(p),undefined);
  assert.ok(failed.towerSpriteAsset('magic','fire',2));
  assert.ok(failed.towerSpriteAsset('magic','fire',3)?.src.includes('lv3'));
 }
});

test('ascended fire tower uses its own camera sockets and preserves both upgrade sets',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'fire-lv3-action');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/fire-tower-lv3-action.json',import.meta.url),'utf8'));
 const size=104,scale=1.16*1.025;
 for(const [windup,recoil,pose] of [[0,0,0],[.01,0,1],[.499,0,1],[.5,0,2],[.999,0,2],[0,.24,3],[0,.161,3],[0,.16,4],[0,.081,4],[0,.08,5],[0,.001,5],[NaN,NaN,0]]){
  const render=art.fireTowerActionSpriteAsset('magic','fire',3,windup,recoil)!;
  assert.equal(render.pose,pose);assert.equal(render.asset.src,'/defense/models/fire-lv3-action-atlas.webp');assert.equal(render.asset.displayScale,scale);
  const [x,y]=meta.poses[pose].socket;assert.ok(Math.abs(render.muzzle.x-(x-320)/576*scale*size)<.0001);assert.ok(Math.abs(render.muzzle.y-(.1+(y-600)/576*scale)*size)<.0001);
  const [left,top,w,h]=render.asset.viewBox.split(' ').map(Number);assert.ok(left>=pose*384&&left+w<=(pose+1)*384);assert.equal(top,14.4);assert.equal(h,345.6);
  assert.equal(art.fireTowerActionSpriteAsset('magic','fire',3,windup,recoil,true)?.pose,0);
 }
 for(const pose of meta.poses){assert.equal(pose.foundation_drift,0);assert.ok(pose.fixed_meshes>76);assert.ok(pose.bounds[1]>32);}
 assert.equal(meta.level,3);assert.equal(meta.hit_at,.15);
 for(const file of meta.files){const bytes=readFileSync(new URL('../../../public/defense/models/'+file.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
 assert.equal(requests.filter(s=>s.includes('/fire-lv3-action-')).length,1);assert.ok(!requests.some(s=>s.endsWith('.glb')));
 const p={source:'tower',actor:'magic',element:'fire',sourceLevel:3,from:{x:50,y:50},to:{x:100,y:100}} as Projectile;
 for(const reduced of [false,true]){const socket=art.fireTowerActionSpriteAsset('magic','fire',3,0,.24,reduced)!.muzzle;assert.deepEqual(art.fireTowerProjectileOffset(p,reduced),{x:socket.x,y:socket.y+39});}
 assert.notDeepEqual(art.fireTowerProjectileOffset(p),art.fireTowerProjectileOffset({...p,sourceLevel:2}));
});

test('a fire upgrade asset failure never replaces another upgrade with a partial action set',async()=>{
 for(const [level,files] of [[2,['fire-action-atlas.webp','fire-tower-game.webp']],[3,['fire-lv3-action-atlas.webp','fire-tower-lv3-game.webp']]] as const){
  for(const file of files){
   const {art}=await loadWithImageResults(s=>s.endsWith(file),'fire-upgrade-failure-'+file);
   assert.equal(art.fireTowerActionSpriteAsset('magic','fire',level,.8,.24),null);
   assert.ok(art.fireTowerActionSpriteAsset('magic','fire',level===2?3:2,.8,.24));
   assert.ok(art.towerSpriteAsset('magic','fire',level));
   assert.equal(art.fireTowerProjectileOffset({source:'tower',actor:'magic',element:'fire',sourceLevel:level} as Projectile),undefined);
  }
 }
});

test('each ascended charge and recoil pose survives nominal 30Hz publication at either speed',async()=>{
 const {art}=await loadWithImageResults(()=>false,'fire-lv3-publication');
 // Sweep publication phase relative to launch. A pose shorter than 1/30*speed
 // can disappear entirely; no extra engine time or wall-clock hold is introduced.
 for(const speed of [1,2])for(let phase=0;phase<100;phase++){
  const step=speed/30,seen=new Set<number>();
  for(let t=phase/100*step;t<.39;t+=step){
   const windup=t<.15?t/.15:0,recoil=t>=.15?Math.max(0,.39-t):0;
   const render=art.fireTowerActionSpriteAsset('magic','fire',3,windup,recoil)!;seen.add(render.pose);
   if(t<.15)assert.ok(render.pose<3,'never display release before the engine launches');
   assert.deepEqual(render,art.fireTowerActionSpriteAsset('magic','fire',3,windup,recoil),'paused inputs are stable');
  }
  for(const pose of [1,2,3,4,5])assert.ok(seen.has(pose),`speed ${speed}, phase ${phase}, missing ${pose}`);
 }
});

test('authored companion contact paws cancel projected travel in every direction and display size',async()=>{
 const {art}=await loadWithImageResults(()=>false,'pet-grounded-stride');
 const m=JSON.parse(readFileSync(new URL('../../../public/defense/models/moonlight-wolf.json',import.meta.url),'utf8'));
 for(let d=0;d<8;d++)for(const size of [73,91.25]){
  const a=d*Math.PI/4,heading={x:Math.cos(a),y:Math.sin(a)},stride=m.gait.stride_per_size[d]*size,poses=m.directions.walk[d].poses;
  for(const [start,paws] of [[0,[0,3]],[4,[1,2]]] as const)for(const paw of paws){
   const origin=poses[start].paws[paw];
   for(let f=start;f<=start+2;f++){
    const [x,y]=poses[f].paws[paw],travel=(f-start)/8*stride,scale=m.frame.display_scale*size/384;
    assert.ok(Math.hypot((x-origin[0])*scale+heading.x*travel,(y-origin[1])*scale+heading.y*travel)<.0001,`direction${d}/size${size}/frame${f}/paw${paw}`);
    assert.ok(Math.abs(poses[f].paw_heights[paw])<1e-6);
   }
  }
  for(let f=0;f<8;f++){
   const walk=art.directionalLocomotionSpriteAsset('wolf',heading,stride*f/8,size)!;
   assert.equal(walk.viewBox,`${f*256} 0 256 256`);assert.equal(walk.groundY,220);
   const accumulated=art.directionalLocomotionSpriteAsset('wolf',heading,99999,size,f/8*size/73)!;assert.equal(accumulated.viewBox,walk.viewBox);
  }
 }
});
