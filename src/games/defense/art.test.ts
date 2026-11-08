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
 assert.equal(art.idleSpriteAsset('barbarian')?.src,'/defense/models/kar-slam-1-atlas.webp');
 assert.equal(art.actionSpriteAsset('barbarian','strike')?.src,'/defense/models/kar-slam-1-atlas.webp');
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
 assert.equal(requests.filter(src=>src.endsWith('-atlas.webp')&&!src.includes('/frost-brace-')&&!src.includes('/frost-fall-')&&!src.includes('/frost-flinch-')&&!src.includes('/dwarf-attack-')&&!src.includes('/dwarf-entry-')&&!src.includes('/dwarf-return-')&&!src.includes('/dwarf-stop-')&&!src.includes('/dwarf-locomotion-')&&!src.includes('/dwarf-hammer-')&&!src.includes('/water-action-')&&!src.includes('/water-lv3-action-')&&!src.includes('/ballista-')&&!src.includes('/ian-')&&!src.includes('/riel-')&&!src.includes('/cheongun-')&&!src.includes('/luna-')&&!src.includes('/moonlight-')&&!src.includes('/kar-')&&!src.includes('/fire-action-')&&!src.includes('/fire-lv3-action-')&&!src.includes('/lightning-action-')&&!src.includes('/lightning-lv3-action-')&&!src.includes('/rapid-action-')&&!src.includes('/rapid-lv3-action-')&&!src.includes('/crush-action-')&&!src.includes('/crush-lv3-action-')).length,17);
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
 assert.equal(art.walkingSpriteAsset('barbarian',8)?.src,'/defense/models/kar-walk-1-atlas.webp');
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
 assert.equal(art.directionalActionSpriteAsset('barbarian','strike',from,{x:250,y:200})?.src,'/defense/models/kar-slam-0-atlas.webp');
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
 assert.equal(art.directionalLocomotionSpriteAsset('barbarian',{x:1,y:0},0)?.src,'/defense/models/kar-walk-0-atlas.webp');
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
 assert.equal(requests.filter(u=>/\/ian-(cast|walk)-/.test(u)).length,16);assert.ok(!requests.some(u=>u.endsWith('.glb')));assert.equal(art.spriteAsset(0).src,'/defense/atlas.png','portraits retain the concept illustration');
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
 assert.equal(requests.filter(u=>/\/riel-(cast|walk)-/.test(u)).length,16);assert.ok(!requests.some(u=>u.endsWith('.glb')));assert.equal(art.spriteAsset(0).src,'/defense/atlas.png','portraits retain the concept illustration');
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
 assert.equal(requests.filter(u=>u.includes('/cheongun-cast-')||u.includes('/cheongun-walk-')).length,16);assert.ok(!requests.some(u=>u.endsWith('.glb')));assert.equal(art.spriteAsset(0).src,'/defense/atlas.png','portraits retain the concept illustration');
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


test('Kar keeps one grounded model through eight attack directions, walks and contact-only hammer trails',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'kar-ready');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/kar-barbarian.json',import.meta.url),'utf8'));
 const times=[0,.05,.12,.22,.28,.36,.45,.52];
 for(let d=0;d<8;d++){
  const heading={x:Math.cos(d*Math.PI/4),y:Math.sin(d*Math.PI/4)},from={x:300,y:200},to={x:from.x+heading.x*90,y:from.y+heading.y*90};
  const idle=art.directionalLocomotionSpriteAsset('barbarian',heading,null)!;
  assert.equal(idle.src,`/defense/models/kar-slam-${d}-atlas.webp`);assert.equal(idle.viewBox,'0 0 256 256');
  for(let f=0;f<8;f++){
   const a={actor:'barbarian',from,to,elapsed:times[f],hitAt:.28,duration:.56} as CombatAttack,original=structuredClone(a);
   const slam=art.hammerSequenceSpriteAsset('barbarian',a)!;assert.equal(slam.viewBox,`${f*256} 0 256 256`);assert.equal(slam.src,idle.src);assert.deepEqual(a,original);
   const walk=art.directionalLocomotionSpriteAsset('barbarian',heading,f*8)!;assert.equal(walk.viewBox,slam.viewBox);assert.equal(walk.src,`/defense/models/kar-walk-${d}-atlas.webp`);
   for(const asset of [walk,slam]){assert.equal(asset.groundY,220);assert.equal(asset.displayScale,idle.displayScale);assert.equal(asset.oriented,true);}
   assert.equal(art.hammerSequenceSpriteAsset('barbarian',a,true)!.viewBox,`${f<4?0:4*256} 0 256 256`);
   for(const size of [84,94,105,117.5]){
    const trail=art.hammerContactTrail(a,size);assert.equal(trail!==null,f===4);
    if(trail)for(let i=0;i<7;i++){const raw=meta.directions.slam[d].contact_trail[i];assert.ok(Math.abs(trail[i].x-(raw[0]-192)/384*idle.displayScale!*size)<.0001);assert.ok(Math.abs(trail[i].y-(raw[1]-330)/384*idle.displayScale!*size)<.0001);}
   }
  }
  for(const elapsed of [.279999,.56,NaN])assert.equal(art.hammerContactTrail({actor:'barbarian',from,to,elapsed,hitAt:.28,duration:.56} as CombatAttack,84),null);
 }
 assert.equal(requests.filter(s=>s.includes('/kar-')).length,16);assert.ok(!requests.some(s=>s.endsWith('.glb')));assert.equal(art.spriteAsset(16).src,'/defense/snow-atlas.png');
 for(const file of meta.files){const bytes=readFileSync(new URL('../../../'+file.file,import.meta.url));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
});

test('Kar fails as one complete illustrated set without disabling Bron or the companion',async()=>{
 for(const file of ['kar-slam-5-atlas.webp','kar-walk-2-atlas.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'kar-missing-'+file),a={actor:'barbarian',from:{x:0,y:0},to:{x:100,y:0},elapsed:.28,hitAt:.28,duration:.56} as CombatAttack;
  assert.equal(art.idleSpriteAsset('barbarian'),null);assert.equal(art.walkingSpriteAsset('barbarian',8),null);assert.equal(art.hammerSequenceSpriteAsset('barbarian',a),null);assert.equal(art.hammerContactTrail(a,84),null);
  assert.equal(art.directionalActionSpriteAsset('barbarian','strike',a.from,a.to),null);assert.equal(art.directionalLocomotionSpriteAsset('barbarian',{x:1,y:0},8),null);
  assert.equal(art.actionSpriteAsset('barbarian','strike')?.src,'/defense/melee-motion.webp');assert.ok(art.idleSpriteAsset('dwarf'));assert.ok(art.idleSpriteAsset('wolf'));
 }
});

test('Kar contact survives nominal 30Hz publication at 2x without appearing before damage',async()=>{
 const {art}=await loadWithImageResults(()=>false,'kar-contact-cadence');
 const base={actor:'barbarian',from:{x:0,y:0},to:{x:100,y:0},hitAt:.28,duration:.56} as CombatAttack;
 for(const speed of [1,2])for(let phase=0;phase<60;phase++){
  const seen=new Set<number>();
  for(let elapsed=phase/60*speed/30;elapsed<.56;elapsed+=speed/30){const frame=Number(art.hammerSequenceSpriteAsset('barbarian',{...base,elapsed})!.viewBox.split(' ')[0])/256;seen.add(frame);if(elapsed<.28)assert.ok(frame<4);}
  assert.ok(seen.has(3)&&seen.has(4),`speed${speed}/phase${phase}: ${[...seen]}`);
 }
});

test('lightning conductors keep the authored tip socket and complete six-pose asset set',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'lightning-conductors');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/lightning-tower-action.json',import.meta.url),'utf8'));
 for(const [windup,recoil,pose] of [[0,0,0],[.01,0,1],[.499,0,1],[.5,0,2],[.999,0,2],[0,.24,3],[0,.161,3],[0,.16,4],[0,.081,4],[0,.08,5],[0,.001,5],[NaN,NaN,0]]){
  const render=art.lightningTowerActionSpriteAsset('magic','lightning',2,windup,recoil)!;
  assert.equal(render.pose,pose);assert.equal(render.asset.src,'/defense/models/lightning-action-atlas.webp');
  const [x,y]=meta.poses[pose].socket;assert.ok(Math.abs(render.muzzle.x-(x-320)/576*1.16*100)<.0001);assert.ok(Math.abs(render.muzzle.y-(.1+(y-600)/576*1.16)*100)<.0001);
  const [left,top,w,h]=render.asset.viewBox.split(' ').map(Number);assert.ok(left>=pose*384&&left+w<=(pose+1)*384);assert.equal(top,14.4);assert.equal(h,345.6);
  assert.equal(art.lightningTowerActionSpriteAsset('magic','lightning',2,windup,recoil,true)?.pose,0);
 }
 for(const pose of meta.poses){assert.equal(pose.foundation_drift,0);assert.ok(pose.fixed_meshes>70);assert.deepEqual(pose.socket,meta.poses[0].socket);}
 for(let side=0;side<2;side++)assert.ok(Math.hypot(...meta.poses[2].conductor_centers[side].map((v:number,i:number)=>v-meta.poses[3].conductor_centers[side][i]))>.4);
 assert.equal(meta.hit_at,.15);assert.equal(meta.duration,.39);
 for(const file of meta.files){const bytes=readFileSync(new URL('../../../public/defense/models/'+file.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
 assert.equal(requests.filter(s=>s.includes('/lightning-action-')).length,1);assert.ok(!requests.some(s=>s.endsWith('.glb')));
 assert.equal(art.lightningTowerActionSpriteAsset('magic','lightning',1),null);
 assert.equal(art.lightningTowerActionSpriteAsset('magic','fire',2),null);
});

test('lightning launch socket survives tower upgrade/sale and falls back independently of fire and Lv.3',async()=>{
 const {art}=await loadWithImageResults(()=>false,'lightning-launch');
 const p={source:'tower',actor:'magic',element:'lightning',sourceLevel:2,from:{x:50,y:50},to:{x:100,y:100}} as Projectile;
 const socket=art.lightningTowerActionSpriteAsset('magic','lightning',2)!.muzzle,expected={x:socket.x,y:socket.y+39};
 for(const reduced of [false,true]){assert.deepEqual(art.lightningTowerProjectileOffset(p,reduced),expected);assert.deepEqual(art.lightningTowerProjectileOffset({...p,to:{x:-200,y:0}},reduced),expected);}
 for(const partial of [{sourceLevel:1},{source:'hero' as const},{element:'fire' as const}])assert.equal(art.lightningTowerProjectileOffset({...p,...partial}),undefined);
 for(const file of ['lightning-action-atlas.webp','lightning-tower-game.webp']){
  const {art:failed}=await loadWithImageResults(s=>s.endsWith(file),'lightning-failed-'+file);
  assert.equal(failed.lightningTowerActionSpriteAsset('magic','lightning',2,.8,.24),null);assert.equal(failed.lightningTowerProjectileOffset(p),undefined);
  assert.ok(failed.towerSpriteAsset('magic','lightning',2));assert.equal(failed.towerSpriteAsset('magic','lightning',3)?.src,'/defense/models/lightning-tower-lv3-game.webp');
  assert.ok(failed.fireTowerActionSpriteAsset('magic','fire',2,.8,.24));assert.ok(failed.fireTowerActionSpriteAsset('magic','fire',3,.8,.24));
 }
});

test('lightning charge precedes launch and every pose survives 30Hz publication at 1x and 2x',async()=>{
 const {art}=await loadWithImageResults(()=>false,'lightning-publication');
 for(const level of [2,3])for(const speed of [1,2])for(let phase=0;phase<100;phase++){
  const step=speed/30,seen=new Set<number>();
  for(let t=phase/100*step;t<.39;t+=step){
   const windup=t<.15?t/.15:0,recoil=t>=.15?Math.max(0,.39-t):0;
   const render=art.lightningTowerActionSpriteAsset('magic','lightning',level,windup,recoil)!;seen.add(render.pose);
   if(t<.15)assert.ok(render.pose<3,'release cannot precede engine launch');
   assert.deepEqual(render,art.lightningTowerActionSpriteAsset('magic','lightning',level,windup,recoil),'pause uses frozen simulation state');
  }
  for(const pose of [1,2,3,4,5])assert.ok(seen.has(pose),`speed ${speed}, phase ${phase}, missing ${pose}`);
 }
});

test('ascended lightning uses its own crown poses, fixed spires and correctly scaled discharge tip',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'lightning-crown');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/lightning-tower-lv3-action.json',import.meta.url),'utf8'));
 const size=104,scale=1.16*1.025;
 for(const [windup,recoil,pose] of [[0,0,0],[.01,0,1],[.499,0,1],[.5,0,2],[.999,0,2],[0,.24,3],[0,.161,3],[0,.16,4],[0,.081,4],[0,.08,5],[0,.001,5],[NaN,NaN,0]]){
  const render=art.lightningTowerActionSpriteAsset('magic','lightning',3,windup,recoil)!;
  assert.equal(render.pose,pose);assert.equal(render.asset.src,'/defense/models/lightning-lv3-action-atlas.webp');assert.equal(render.asset.displayScale,scale);
  const [x,y]=meta.poses[pose].socket;assert.ok(Math.abs(render.muzzle.x-(x-320)/576*scale*size)<.0001);assert.ok(Math.abs(render.muzzle.y-(.1+(y-600)/576*scale)*size)<.0001);
  const [left,top,w,h]=render.asset.viewBox.split(' ').map(Number);assert.ok(left>=pose*384&&left+w<=(pose+1)*384);assert.equal(top,14.4);assert.equal(h,345.6);
  assert.equal(art.lightningTowerActionSpriteAsset('magic','lightning',3,windup,recoil,true)?.pose,0);
 }
 assert.equal(meta.level,3);assert.equal(meta.hit_at,.15);assert.equal(meta.duration,.39);
 assert.equal(meta.clearance.sampled_frames,40);assert.equal(meta.clearance.rigid_intersections,0);
 for(const [path,hash] of [[meta.source,meta.source_sha256],[meta.generator,meta.generator_sha256]])assert.equal(createHash('sha256').update(readFileSync(new URL('../../../'+path,import.meta.url))).digest('hex'),hash);
 for(const pose of meta.poses){assert.equal(pose.foundation_drift,0);assert.ok(pose.fixed_meshes>84);assert.deepEqual(pose.socket,meta.poses[0].socket);}
 assert.notDeepEqual(meta.poses[2].crown_rotation,meta.poses[3].crown_rotation);assert.ok(meta.poses[2].crown_center[2]>meta.poses[0].crown_center[2]);
 for(const file of meta.files){const bytes=readFileSync(new URL('../../../public/defense/models/'+file.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
 const p={source:'tower',actor:'magic',element:'lightning',sourceLevel:3,from:{x:50,y:50},to:{x:100,y:100}} as Projectile;
 for(const reduced of [false,true]){const socket=art.lightningTowerActionSpriteAsset('magic','lightning',3,0,.24,reduced)!.muzzle;assert.deepEqual(art.lightningTowerProjectileOffset(p,reduced),{x:socket.x,y:socket.y+39});}
 assert.notDeepEqual(art.lightningTowerProjectileOffset(p),art.lightningTowerProjectileOffset({...p,sourceLevel:2}),'upgrade cannot move an already launched Lv.2 bolt');
 assert.deepEqual(art.lightningTowerProjectileOffset(p),art.lightningTowerProjectileOffset({...p,to:{x:-100,y:800}}),'target tracking cannot move the source');
 assert.equal(requests.filter(s=>s.includes('/lightning-lv3-action-')).length,1);assert.ok(!requests.some(s=>s.endsWith('.glb')));
});

test('each lightning tier fails as a whole without disabling the other tier or fire branch',async()=>{
 for(const [level,files] of [[2,['lightning-action-atlas.webp','lightning-tower-game.webp']],[3,['lightning-lv3-action-atlas.webp','lightning-tower-lv3-game.webp']]] as const){
  for(const file of files){
   const {art}=await loadWithImageResults(s=>s.endsWith(file),'lightning-tier-failure-'+file);
   assert.equal(art.lightningTowerActionSpriteAsset('magic','lightning',level,.8,.24),null);
   assert.ok(art.lightningTowerActionSpriteAsset('magic','lightning',level===2?3:2,.8,.24));
   assert.ok(art.towerSpriteAsset('magic','lightning',level));
   assert.equal(art.lightningTowerProjectileOffset({source:'tower',actor:'magic',element:'lightning',sourceLevel:level} as Projectile),undefined);
   for(const fireLevel of [2,3])assert.ok(art.fireTowerActionSpriteAsset('magic','fire',fireLevel,.8,.24));
  }
 }
});


test('rapid crossbow aims eight ways, keeps the keep grounded, and feeds after launch',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'rapid-crossbow');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/rapid-crossbow-action.json',import.meta.url),'utf8'));
 const from={x:200,y:200},size=100,scale=meta.display_scale;
 for(let direction=0;direction<8;direction++){
  const a=direction*Math.PI/4,to={x:from.x+100*Math.cos(a),y:from.y+100*Math.sin(a)};
  for(const [recoil,pose] of [[0,0],[.24,1],[.16001,1],[.16,2],[.08001,2],[.08,3],[.001,3],[-1,0],[NaN,0],[Infinity,0]]){
   const r=art.rapidCrossbowActionSpriteAsset('crossbow','rapid',2,from,to,recoil)!;
   assert.equal(r.pose,pose);assert.equal(r.direction,direction);assert.equal(r.asset.src,`/defense/models/rapid-action-${direction}-atlas.webp`);
   const [x,y,w,h]=r.asset.viewBox.split(' ').map(Number);assert.ok(x+w<=r.asset.width&&y+h<=r.asset.height);
   const p=meta.directions[direction].poses[pose],[mx,my]=p.muzzle;
   assert.ok(Math.abs(r.muzzle.x-(mx-320)/576*scale*size)<.001);assert.ok(Math.abs(r.muzzle.y-(my-meta.frame.display_ground_y)/576*scale*size)<.001);
   assert.equal(p.foundation_drift,0);assert.ok(p.fixed_meshes>20);
   assert.equal(art.rapidCrossbowActionSpriteAsset('crossbow','rapid',2,from,to,recoil,true)?.pose,0);
  }
  const shot={source:'tower',actor:'crossbow',pierce:false,sourceLevel:2,from,to,launchAim:{...to}} as Projectile;
  const before=structuredClone(shot),offset=art.rapidCrossbowProjectileOffset(shot);assert.ok(offset);assert.deepEqual(shot,before);
  assert.deepEqual(art.rapidCrossbowProjectileOffset({...shot,to:{x:999,y:999}}),offset);
  for(const partial of [{launchAim:undefined},{sourceLevel:1},{pierce:true},{source:'hero' as const}])assert.equal(art.rapidCrossbowProjectileOffset({...shot,...partial}),undefined);
 }
 assert.ok(Math.abs((meta.frame.ground[1]-meta.frame.display_ground_y)/576*scale-(.1+(meta.frame.previous_ground[1]-600)/576*1.16))<1e-10,'same base scale and ground as the previous sprite');
 assert.equal(meta.animation.hit_at,.1);assert.equal(meta.animation.duration_seconds,.34);
 for(const f of meta.files)assert.equal(createHash('sha256').update(readFileSync(new URL('../../../public/defense/models/'+f.file,import.meta.url))).digest('hex'),f.sha256);
 assert.equal(requests.filter(src=>src.includes('/rapid-action-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
 assert.ok(art.rapidCrossbowActionSpriteAsset('crossbow','rapid',3,from,{x:300,y:200}));
 assert.equal(art.rapidCrossbowActionSpriteAsset('crossbow','pierce',2,from,{x:300,y:200}),null);
});

test('rapid feed uses a complete directional set and leaves other branches/upgrades available on failure',async()=>{
 const from={x:0,y:0},to={x:100,y:0};
 for(const file of ['rapid-action-3-atlas.webp','rapid-crossbow-game.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'rapid-failure-'+file);
  for(let d=0;d<8;d++)assert.equal(art.rapidCrossbowActionSpriteAsset('crossbow','rapid',2,from,{x:100*Math.cos(d*Math.PI/4),y:100*Math.sin(d*Math.PI/4)},.24),null);
  assert.ok(art.towerSpriteAsset('crossbow','rapid',2));assert.equal(art.towerSpriteAsset('crossbow','rapid',3)?.src,'/defense/models/rapid-crossbow-lv3-game.webp');
  for(const level of [2,3])assert.ok(art.ballistaActionSpriteAsset('crossbow','pierce',level,from,to,.24));
 }
});

test('rapid release/draw/feed remain visible at 30Hz and either speed without early release',async()=>{
 const {art}=await loadWithImageResults(()=>false,'rapid-publication'),from={x:0,y:0},to={x:100,y:0};
 for(const level of [2,3])for(const speed of [1,2])for(let phase=0;phase<100;phase++){
  const step=speed/30,seen=new Set<number>();
  for(let t=phase/100*step;t<.34;t+=step){
   const recoil=t<.1?0:.34-t,r=art.rapidCrossbowActionSpriteAsset('crossbow','rapid',level,from,to,recoil)!;seen.add(r.pose);
   if(t<.1)assert.equal(r.pose,0);assert.deepEqual(r,art.rapidCrossbowActionSpriteAsset('crossbow','rapid',level,from,to,recoil));
  }
  for(const pose of [0,1,2,3])assert.ok(seen.has(pose),`speed${speed},phase${phase},pose${pose}`);
 }
});

test('crush cannon aims eight ways, keeps its foundation grounded, and recoils behind its discharge point',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'crush-cannon');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/crush-cannon-action.json',import.meta.url),'utf8'));
 const from={x:200,y:200},size=100,scale=meta.display_scale;
 for(let direction=0;direction<8;direction++){
  const a=direction*Math.PI/4,to={x:from.x+100*Math.cos(a),y:from.y+100*Math.sin(a)};
  for(const [recoil,pose] of [[0,0],[.24,1],[.16001,1],[.16,2],[.08001,2],[.08,3],[.001,3],[-1,0],[NaN,0],[Infinity,0]]){
   const r=art.crushCannonActionSpriteAsset('cannon','crush',2,from,to,recoil)!;
   assert.equal(r.pose,pose);assert.equal(r.direction,direction);assert.equal(r.asset.src,`/defense/models/crush-action-${direction}-atlas.webp`);
   const [x,y,w,h]=r.asset.viewBox.split(' ').map(Number);assert.ok(x+w<=r.asset.width&&y+h<=r.asset.height);
   const p=meta.directions[direction].poses[pose],[mx,my]=meta.directions[direction].poses[0].muzzle;
   assert.ok(Math.abs(r.muzzle.x-(mx-320)/576*scale*size)<.001);assert.ok(Math.abs(r.muzzle.y-(.1+(my-600)/576*scale)*size)<.001);
   assert.equal(p.foundation_drift,0);assert.ok(p.fixed_meshes>20);
   assert.equal(art.crushCannonActionSpriteAsset('cannon','crush',2,from,to,recoil,true)?.pose,0);
  }
  const shot={source:'tower',actor:'cannon',pierce:false,element:'impact',sourceLevel:2,from,to,launchAim:{...to}} as Projectile;
  const before=structuredClone(shot),offset=art.crushCannonProjectileOffset(shot);assert.ok(offset);assert.deepEqual(shot,before);
  assert.deepEqual(art.crushCannonProjectileOffset({...shot,to:{x:999,y:999}}),offset);
  for(const partial of [{launchAim:undefined},{sourceLevel:1},{element:'water' as const},{source:'hero' as const}])assert.equal(art.crushCannonProjectileOffset({...shot,...partial}),undefined);
 }
 assert.equal(meta.frame.orthographic_scale,7.5);assert.equal(meta.clearance.surface_crossings,0);assert.equal(meta.clearance.sampled_frames,53);
 for(const key of ['source','generator'])assert.equal(createHash('sha256').update(readFileSync(new URL('../../../'+meta[key],import.meta.url))).digest('hex'),meta[key+'_sha256']);
 assert.equal(meta.animation.hit_at,.28);assert.equal(meta.animation.duration_seconds,.52);
 for(const f of meta.files)assert.equal(createHash('sha256').update(readFileSync(new URL('../../../public/defense/models/'+f.file,import.meta.url))).digest('hex'),f.sha256);
 assert.equal(requests.filter(src=>src.includes('/crush-action-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
 assert.ok(art.crushCannonActionSpriteAsset('cannon','crush',3,from,{x:300,y:200}));
 assert.equal(art.crushCannonActionSpriteAsset('cannon','water',2,from,{x:300,y:200}),null);
});

test('crush recoil uses a complete directional set and leaves other branches/upgrades available on failure',async()=>{
 const from={x:0,y:0},to={x:100,y:0};
 for(const file of ['crush-action-3-atlas.webp','crush-cannon-game.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'crush-failure-'+file);
  for(let d=0;d<8;d++)assert.equal(art.crushCannonActionSpriteAsset('cannon','crush',2,from,{x:100*Math.cos(d*Math.PI/4),y:100*Math.sin(d*Math.PI/4)},.24),null);
  assert.ok(art.towerSpriteAsset('cannon','crush',2));assert.equal(art.towerSpriteAsset('cannon','crush',3)?.src,'/defense/models/crush-cannon-lv3-game.webp');
  for(const level of [2,3])assert.ok(art.waterCannonActionSpriteAsset('cannon','water',level,from,to,.24));
 }
});

test('crush recoil/return/settle remain visible at 30Hz and either speed without early release',async()=>{
 const {art}=await loadWithImageResults(()=>false,'crush-publication'),from={x:0,y:0},to={x:100,y:0};
 for(const level of [2,3])for(const speed of [1,2])for(let phase=0;phase<100;phase++){
  const step=speed/30,seen=new Set<number>();
  for(let t=phase/100*step;t<.52;t+=step){
   const recoil=t<.28?0:.52-t,r=art.crushCannonActionSpriteAsset('cannon','crush',level,from,to,recoil)!;seen.add(r.pose);
   if(t<.28)assert.equal(r.pose,0);assert.deepEqual(r,art.crushCannonActionSpriteAsset('cannon','crush',level,from,to,recoil));
  }
  for(const pose of [0,1,2,3])assert.ok(seen.has(pose),`speed${speed},phase${phase},pose${pose}`);
 }
});


test('Ian stop retains the captured walk then plants each boot with shared ground in all entry phases and directions',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'ian-stop');
 for(let d=0;d<8;d++)for(let entry=0;entry<8;entry++)for(const [elapsed,frame] of [[0,0],[.079,0],[.08,1],[.159,1],[.16,2],[.239,2]]){
  const heading={x:Math.cos(d*Math.PI/4),y:Math.sin(d*Math.PI/4)},motion={distance:entry*8,speed:0,settle:{frame:entry,elapsed,heading}};
  const stop=art.mageStopSpriteAsset('mage',motion)!;assert.equal(stop.frame,frame);assert.equal(stop.entry,entry);
  assert.ok(stop.asset.src.endsWith(`/ian-${frame===0?'walk':'stop'}-${d}-atlas.webp`));
  assert.equal(stop.asset.groundY!/stop.asset.height,220/256);assert.equal(stop.asset.oriented,true);
  const [x,,width]=stop.asset.viewBox.split(' ').map(Number);assert.ok(x+width<=stop.asset.width);
  assert.equal(art.mageStopSpriteAsset('mage',motion,true),null);
  assert.equal(art.mageStopSpriteAsset('elf',motion),null);
  assert.equal(art.mageStopSpriteAsset('mage',{...motion,speed:30}),null);
  assert.equal(art.mageStopSpriteAsset('mage',{...motion,settle:{...motion.settle,elapsed:.24}}),null);
 }
 assert.equal(requests.filter(s=>/ian-stop-\d-atlas/.test(s)).length,8);assert.ok(!requests.some(s=>s.endsWith('.glb')));
});
test('Ian stop uses the existing idle if any directional stop atlas is unavailable',async()=>{
 for(let i=0;i<8;i++){
  const {art}=await loadWithImageResults(s=>s.endsWith(`/ian-stop-${i}-atlas.webp`),'ian-stop-failed-'+i);
  assert.equal(art.mageStopSpriteAsset('mage',{distance:10,speed:0,settle:{frame:1,elapsed:.08,heading:{x:1,y:0}}}),null);
  assert.ok(art.idleSpriteAsset('mage')?.src.includes('/ian-cast-'));
 }
});


test('final rapid crossbow keeps its fixed pennants, three-bolt feed and tier-specific launch socket',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'rapid-lv3');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/rapid-crossbow-lv3-action.json',import.meta.url),'utf8'));
 const from={x:200,y:200},size=104;
 for(let direction=0;direction<8;direction++){
  const angle=direction*Math.PI/4,to={x:from.x+100*Math.cos(angle),y:from.y+100*Math.sin(angle)};
  for(const [recoil,pose]of [[0,0],[.24,1],[.16,2],[.08,3]]){
   const model=art.rapidCrossbowActionSpriteAsset('crossbow','rapid',3,from,to,recoil)!;
   assert.equal(model.pose,pose);assert.equal(model.direction,direction);assert.equal(model.asset.src,`/defense/models/rapid-lv3-action-${direction}-atlas.webp`);
   const entry=meta.directions[direction].poses[pose];assert.equal(entry.foundation_drift,0);
   assert.ok(Math.abs(model.muzzle.x-(entry.muzzle[0]-320)/576*meta.display_scale*size)<.001);
   assert.ok(Math.abs(model.muzzle.y-(entry.muzzle[1]-meta.frame.display_ground_y)/576*meta.display_scale*size)<.001);
   assert.equal(art.rapidCrossbowActionSpriteAsset('crossbow','rapid',3,from,to,recoil,true)?.pose,0);
  }
  const shot={source:'tower',actor:'crossbow',pierce:false,sourceLevel:3,from,to,launchAim:{...to}} as Projectile,original=structuredClone(shot),offset=art.rapidCrossbowProjectileOffset(shot)!;
  const muzzle=art.rapidCrossbowActionSpriteAsset('crossbow','rapid',3,from,to)!.muzzle;
  assert.deepEqual(offset,{x:muzzle.x,y:muzzle.y+39});assert.deepEqual(shot,original);
  assert.deepEqual(art.rapidCrossbowProjectileOffset({...shot,to:{x:0,y:999}}),offset);
  assert.notDeepEqual(art.rapidCrossbowProjectileOffset({...shot,sourceLevel:2}),offset,'launch tier is retained independently of later upgrades');
 }
 assert.equal(meta.level,3);assert.equal(meta.animation.hit_at,.1);assert.equal(meta.animation.duration_seconds,.34);
 assert.equal(meta.display_scale,1.16*1.025);
 for(const file of meta.files)assert.equal(createHash('sha256').update(readFileSync(new URL('../../../public/defense/models/'+file.file,import.meta.url))).digest('hex'),file.sha256);
 assert.equal(requests.filter(src=>src.includes('/rapid-lv3-action-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
});

test('rapid crossbow animation failures stay isolated between upgrade tiers',async()=>{
 const from={x:0,y:0},to={x:100,y:0};
 for(const [file,level]of [['rapid-action-3-atlas.webp',2],['rapid-crossbow-game.webp',2],['rapid-lv3-action-3-atlas.webp',3],['rapid-crossbow-lv3-game.webp',3]] as const){
  const {art}=await loadWithImageResults(src=>src.endsWith(file),'rapid-tiers-'+file);
  assert.equal(art.rapidCrossbowActionSpriteAsset('crossbow','rapid',level,from,to,.24),null);
  assert.ok(art.rapidCrossbowActionSpriteAsset('crossbow','rapid',level===2?3:2,from,to,.24));
  assert.ok(art.towerSpriteAsset('crossbow','rapid',level));assert.ok(art.ballistaActionSpriteAsset('crossbow','pierce',3,from,to,.24));
 }
});

test('final crush cannon preserves launch sockets and grounded siege carriage through recoil',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'crush-cannon-lv3');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/crush-cannon-lv3-action.json',import.meta.url),'utf8'));
 const from={x:200,y:200},size=104,scale=meta.display_scale;
 for(let direction=0;direction<8;direction++){
  const a=direction*Math.PI/4,to={x:from.x+100*Math.cos(a),y:from.y+100*Math.sin(a)};
  for(const [recoil,pose] of [[0,0],[.24,1],[.16001,1],[.16,2],[.08001,2],[.08,3],[.001,3],[-1,0],[NaN,0],[Infinity,0]]){
   const r=art.crushCannonActionSpriteAsset('cannon','crush',3,from,to,recoil)!;
   assert.equal(r.pose,pose);assert.equal(r.direction,direction);assert.equal(r.asset.src,`/defense/models/crush-lv3-action-${direction}-atlas.webp`);
   const [x,y,w,h]=r.asset.viewBox.split(' ').map(Number);assert.ok(x+w<=r.asset.width&&y+h<=r.asset.height);
   const p=meta.directions[direction].poses[pose],[mx,my]=meta.directions[direction].poses[0].muzzle;
   assert.ok(Math.abs(r.muzzle.x-(mx-320)/576*scale*size)<.001);assert.ok(Math.abs(r.muzzle.y-(my-meta.frame.display_ground_y)/576*scale*size)<.001);
   assert.equal(p.foundation_drift,0);assert.ok(p.fixed_meshes>20);
   assert.equal(art.crushCannonActionSpriteAsset('cannon','crush',3,from,to,recoil,true)?.pose,0);
  }
  const shot={source:'tower',actor:'cannon',pierce:false,element:'impact',sourceLevel:3,from,to,launchAim:{...to}} as Projectile;
  const before=structuredClone(shot),offset=art.crushCannonProjectileOffset(shot);assert.ok(offset);assert.deepEqual(shot,before);
  assert.deepEqual(art.crushCannonProjectileOffset({...shot,to:{x:999,y:999}}),offset);
  for(const partial of [{launchAim:undefined},{sourceLevel:1},{element:'water' as const},{source:'hero' as const}])assert.equal(art.crushCannonProjectileOffset({...shot,...partial}),undefined);
 }
 assert.equal(meta.frame.orthographic_scale,8.0);assert.equal(meta.clearance.surface_crossings,0);assert.equal(meta.clearance.sampled_frames,53);
 for(const key of ['source','generator'])assert.equal(createHash('sha256').update(readFileSync(new URL('../../../'+meta[key],import.meta.url))).digest('hex'),meta[key+'_sha256']);
 assert.equal(meta.pennant_clearance.surface_intersections,0);assert.equal(meta.pennant_clearance.frames_per_direction,53);
 assert.ok(Math.abs((meta.frame.ground[1]-meta.frame.display_ground_y)/576*scale-(.1+(meta.frame.previous_ground[1]-600)/576*1.16*1.025))<1e-9);
 assert.equal(meta.animation.hit_at,.28);assert.equal(meta.animation.duration_seconds,.52);
 for(const f of meta.files)assert.equal(createHash('sha256').update(readFileSync(new URL('../../../public/defense/models/'+f.file,import.meta.url))).digest('hex'),f.sha256);
 assert.equal(requests.filter(src=>src.includes('/crush-lv3-action-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
 assert.ok(art.crushCannonActionSpriteAsset('cannon','crush',3,from,{x:300,y:200}));
 assert.equal(art.crushCannonActionSpriteAsset('cannon','water',2,from,{x:300,y:200}),null);
});

test('crush cannon image failures are isolated between final and base tiers',async()=>{
 const from={x:0,y:0},to={x:100,y:0};
 for(const [file,level]of [['crush-action-3-atlas.webp',2],['crush-cannon-game.webp',2],['crush-lv3-action-3-atlas.webp',3],['crush-cannon-lv3-game.webp',3]] as const){
  const {art}=await loadWithImageResults(src=>src.endsWith(file),'crush-tiers-'+file);
  assert.equal(art.crushCannonActionSpriteAsset('cannon','crush',level,from,to,.24),null);
  assert.ok(art.crushCannonActionSpriteAsset('cannon','crush',level===2?3:2,from,to,.24));
  assert.ok(art.towerSpriteAsset('cannon','crush',level));assert.ok(art.waterCannonActionSpriteAsset('cannon','water',3,from,to,.24));
 }
});

test('frost wolf directional gait uses all 64 poses at the generated camera scale',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'frost-stride');
 const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/frost-wolf-stride.json',import.meta.url),'utf8'));
 for(const size of [73,91.25])for(let d=0;d<8;d++)for(let f=0;f<8;f++){
  const heading={x:Math.cos(d*Math.PI/4),y:Math.sin(d*Math.PI/4)},r=art.frostWolfDirectionalWalkAsset(heading,0,size,f/8*size/73)!;
  const {frostWolfStride}=await import('./locomotion.ts');assert.ok(Math.abs(frostWolfStride(heading,size)-meta.directions[d].stride_per_display_size*size)<1e-6);
  assert.equal(r.direction,d);assert.equal(r.frame,f);assert.equal(r.asset.src,`/defense/models/frost-stride-${d}-atlas.webp`);
  assert.equal(r.asset.displayScale,meta.frame.display_scale);assert.equal(r.asset.groundY,meta.delivery_frame.ground[1]);
  const [x,y,w,h]=r.asset.viewBox.split(' ').map(Number);assert.ok(x+w<=r.asset.width&&y+h<=r.asset.height);
 }
 assert.equal(requests.filter(src=>src.includes('/frost-stride-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
});

test('partial frost wolf direction loading preserves the original trot and hit fallback',async()=>{
 for(const file of ['frost-stride-3-atlas.webp','frost-wolf-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(file),'frost-fail-'+file);
  assert.equal(art.frostWolfDirectionalWalkAsset({x:1,y:0},12),null);
  assert.equal(!!art.monsterWalkingSpriteAsset('frostwolf',12),file==='frost-stride-3-atlas.webp');assert.ok(art.monsterSpriteAsset('frostwolf','hit'));
 }
});

test('Riel shot entry preserves each captured walk and joins the original shot before release',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'riel-entry');
 const position={x:200,y:200};
 for(const source of ['hero','mercenary'] as const)for(let direction=0;direction<8;direction++)for(let entry=0;entry<8;entry++){
  const angle=direction*Math.PI/4,to={x:200+100*Math.cos(angle),y:200+100*Math.sin(angle)};
  const attack={actor:'elf',source,walkEntry:entry,from:position,to,elapsed:0,hitAt:.1,duration:.28} as CombatAttack;
  for(const [t,expected] of [[0,'walk'],[.024,'walk'],[.025,'first-foot'],[.054,'first-foot'],[.055,'second-foot'],[.079,'second-foot']] as const){
   const pose=art.rielShotEntrySpriteAsset('elf',{...attack,elapsed:t},position)!;
   assert.equal(pose.entry,entry);assert.equal(pose.frame,expected);assert.equal(pose.direction,direction);
   assert.equal(pose.asset.displayScale,1.2*6.8/5.8);assert.equal(pose.asset.groundY!/pose.asset.height,220/256);
   if(expected==='walk')assert.deepEqual(pose.asset,art.directionalLocomotionSpriteAsset('elf',{x:Math.cos(angle),y:Math.sin(angle)},entry*8));
   else {assert.equal(pose.asset.src,`/defense/models/riel-entry-${direction}-atlas.webp`);const [x,y,w,h]=pose.asset.viewBox.split(' ').map(Number);assert.ok(x+w<=pose.asset.width&&y+h<=pose.asset.height);}
  }
  for(const elapsed of [-1,.08,.099,.1,.28,NaN,Infinity])assert.equal(art.rielShotEntrySpriteAsset('elf',{...attack,elapsed},position),null);
  assert.equal(art.rielShotEntrySpriteAsset('elf',attack,position,true),null);
  for(const walkEntry of [undefined,-1,8,.5,NaN])assert.equal(art.rielShotEntrySpriteAsset('elf',{...attack,walkEntry},position),null);
  assert.ok(art.directionalActionSpriteAsset('elf','strike',position,to));
 }
 assert.equal(requests.filter(src=>src.includes('/riel-entry-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
});

test('Riel transition image failure retains the complete existing shot and walk set',async()=>{
 const position={x:0,y:0},attack={actor:'elf',source:'hero',walkEntry:3,to:{x:100,y:0},elapsed:.04} as CombatAttack;
 for(const missing of ['riel-entry-3-atlas.webp','riel-walk-3-atlas.webp','riel-cast-3-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(missing),'riel-entry-fail-'+missing);
  assert.equal(art.rielShotEntrySpriteAsset('elf',attack,position),null);
  assert.equal(!!art.directionalActionSpriteAsset('elf','windup',position,attack.to),missing.startsWith('riel-entry'));
  assert.equal(!!art.directionalLocomotionSpriteAsset('elf',{x:1,y:0},24),missing.startsWith('riel-entry'));
  assert.ok(art.directionalActionSpriteAsset('mage','windup',position,attack.to));
 }
});

test('Bron plants each captured walk before the unchanged hammer apex and contact',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'dwarf-entry');
 for(const source of ['hero','mercenary'] as const)for(let direction=0;direction<8;direction++)for(let entry=0;entry<8;entry++){
  const angle=direction*Math.PI/4,from={x:200,y:200},to={x:200+100*Math.cos(angle),y:200+100*Math.sin(angle)};
  const attack={actor:'dwarf',source,walkEntry:entry,from,to,elapsed:0,hitAt:.24,duration:.52} as CombatAttack;
  for(const [elapsed,frame] of [[0,'walk'],[.039,'walk'],[.04,'first-foot'],[.099,'first-foot'],[.1,'second-foot'],[.159,'second-foot']] as const){
   const result=art.dwarfHammerEntrySpriteAsset({...attack,elapsed})!;assert.equal(result.entry,entry);assert.equal(result.frame,frame);assert.equal(result.direction,direction);
   assert.equal(result.asset.groundY!/result.asset.height,220/256);assert.equal(result.asset.displayScale,1.2*6.8/5.8);
   if(frame==='walk')assert.deepEqual(result.asset,art.directionalLocomotionSpriteAsset('dwarf',{x:Math.cos(angle),y:Math.sin(angle)},entry*8));
   else {assert.equal(result.asset.src,`/defense/models/dwarf-entry-${direction}-atlas.webp`);assert.equal(result.asset.viewBox,`${(entry*2+(frame==='first-foot'?0:1))*192} 0 192 192`);}
   assert.equal(art.hammerContactTrail({...attack,elapsed},100),null,'no contact ribbon during planting');
  }
  for(const elapsed of [-1,.16,.24,.52,NaN,Infinity])assert.equal(art.dwarfHammerEntrySpriteAsset({...attack,elapsed}),null);
  assert.equal(art.dwarfHammerEntrySpriteAsset(attack,true),null);
  for(const walkEntry of [undefined,-1,8,.5,NaN])assert.equal(art.dwarfHammerEntrySpriteAsset({...attack,walkEntry}),null);
  assert.equal(art.dwarfHammerEntrySpriteAsset({...attack,actor:'elf'}),null);
  const contact={...attack,elapsed:.24};assert.deepEqual(art.hammerSequenceSpriteAsset('dwarf',contact),art.hammerSequenceSpriteAsset('dwarf',{...contact,walkEntry:undefined}));assert.deepEqual(art.hammerContactTrail(contact,100),art.hammerContactTrail({...contact,walkEntry:undefined},100));
  assert.equal(art.dwarfHammerEntrySpriteAsset({...attack,hitAt:.48,duration:.76,elapsed:.2})!.frame,'second-foot','preparation follows simulation hitAt');
 }
 assert.equal(requests.filter(src=>src.includes('/dwarf-entry-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
});

test('Bron optional entry loading failure retains the existing hammer and locomotion',async()=>{
 const attack={actor:'dwarf',source:'hero',walkEntry:3,from:{x:0,y:0},to:{x:100,y:0},elapsed:.06,hitAt:.24,duration:.52} as CombatAttack;
 for(const missing of ['dwarf-entry-3-atlas.webp','dwarf-locomotion-3-atlas.webp','dwarf-hammer-3-atlas.webp','dwarf-idle-game.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(missing),'bron-fail-'+missing);
  assert.equal(art.dwarfHammerEntrySpriteAsset(attack),null);
  if(missing.startsWith('dwarf-entry')){assert.ok(art.hammerSequenceSpriteAsset('dwarf',attack));assert.ok(art.directionalLocomotionSpriteAsset('dwarf',{x:1,y:0},24));}
  assert.ok(art.rielShotEntrySpriteAsset('elf',{...attack,actor:'elf',elapsed:.04,hitAt:.1,duration:.28},{x:0,y:0}),'Riel remains independent');
 }
});

test('Riel shot recovery follows current aligned gait and joins the next walking sprite',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'riel-return');
 for(const source of ['hero','mercenary'] as const)for(let direction=0;direction<8;direction++)for(let walk=0;walk<8;walk++){
  const angle=direction*Math.PI/4,from={x:100,y:100},heading={x:Math.cos(angle),y:Math.sin(angle)},to={x:100+100*heading.x,y:100+100*heading.y};
  const attack={actor:'elf',source,walkEntry:(walk+3)%8,from,to,elapsed:.16,hitAt:.1,duration:.28} as CombatAttack,motion={distance:walk*8,speed:100,heading};
  for(const [elapsed,frame] of [[.16,'hold'],[.174,'hold'],[.175,'release-weight'],[.219,'release-weight'],[.22,'stride-pickup'],[.269,'stride-pickup'],[.27,'walk'],[.279,'walk']] as const){
   const result=art.rielShotReturnSpriteAsset({...attack,elapsed},from,motion)!;assert.equal(result.walk,walk);assert.equal(result.frame,frame);assert.equal(result.direction,direction);
   assert.equal(result.asset.groundY!/result.asset.height,220/256);assert.equal(result.asset.displayScale,1.2*6.8/5.8);
   if(frame==='walk')assert.deepEqual(result.asset,art.directionalLocomotionSpriteAsset('elf',heading,motion.distance));
   else if(frame==='hold')assert.deepEqual(result.asset,art.directionalActionSpriteAsset('elf','strike',from,to));
   else assert.equal(result.asset.viewBox,`${(walk*2+(frame==='release-weight'?0:1))*192} 0 192 192`);
  }
  for(const elapsed of [-1,0,.1,.159,.28,.4,NaN,Infinity])assert.equal(art.rielShotReturnSpriteAsset({...attack,elapsed},from,motion),null);
  assert.equal(art.rielShotReturnSpriteAsset(attack,from,motion,true),null);
  for(const speed of [0,.5,NaN,Infinity])assert.equal(art.rielShotReturnSpriteAsset(attack,from,{...motion,speed}),null);
  assert.equal(art.rielShotReturnSpriteAsset(attack,from,{...motion,heading:{x:-heading.x,y:-heading.y}}),null,'turning shots keep the established pose');
  assert.equal(art.rielShotReturnSpriteAsset(attack,from,{...motion,heading:undefined}),null);
  assert.equal(art.rielShotReturnSpriteAsset({...attack,actor:'dwarf'},from,motion),null);
  const changed=art.rielShotReturnSpriteAsset({...attack,elapsed:.24},from,{...motion,distance:(walk+1)%8*8})!;assert.equal(changed.walk,(walk+1)%8,'gait cannot freeze at attack entry');
 }
 assert.equal(requests.filter(src=>src.includes('/riel-return-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
});

test('Riel return and entry sets fail independently without changing existing release sockets',async()=>{
 const attack={actor:'elf',source:'hero',walkEntry:3,from:{x:0,y:0},to:{x:100,y:0},elapsed:.2,hitAt:.1,duration:.28} as CombatAttack,motion={distance:24,speed:100,heading:{x:1,y:0}};
 for(const missing of ['riel-return-3-atlas.webp','riel-entry-3-atlas.webp','riel-cast-3-atlas.webp','riel-walk-3-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(missing),'riel-return-fail-'+missing),coreFail=missing.includes('cast')||missing.includes('walk');
  assert.equal(!!art.rielShotReturnSpriteAsset(attack,attack.from,motion),missing.includes('entry'));
  assert.equal(!!art.rielShotEntrySpriteAsset('elf',{...attack,elapsed:.04},attack.from),missing.includes('return'));
  assert.equal(!!art.directionalActionSpriteAsset('elf','strike',attack.from,attack.to),!coreFail);
  assert.equal(!!art.elfArrowSocket(attack.from,attack.to,84),!coreFail);
  assert.ok(art.hammerSequenceSpriteAsset('dwarf',{...attack,actor:'dwarf'}));
 }
});

test('aligned Riel return exposes an intermediate pose across fixed-step 1x and 2x publications',async()=>{
 const {art}=await loadWithImageResults(()=>false,'riel-return-cadence');
 const attack={actor:'elf',source:'hero',from:{x:0,y:0},to:{x:100,y:0},hitAt:.1,duration:.28} as CombatAttack;
 // 60Hz simulation: 2/4 ticks are nominal 30Hz at 1x/2x; 6 ticks covers 20Hz at 2x.
 for(const ticksPerPublication of [2,4,6])for(let offset=0;offset<ticksPerPublication;offset++){
  const frames=[];
  for(let tick=offset;tick/60<attack.duration;tick+=ticksPerPublication){const elapsed=tick/60;frames.push(art.rielShotReturnSpriteAsset({...attack,elapsed},attack.from,{speed:230,distance:elapsed*230,heading:{x:1,y:0}})?.frame)}
  assert.ok(frames.some(frame=>frame==='release-weight'||frame==='stride-pickup'),`${ticksPerPublication}/${offset}: ${frames}`);
 }
});

test('Bron recovery joins the current aligned gait while retaining contact and rebound',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'dwarf-return');
 for(const source of ['hero','mercenary'] as const)for(let direction=0;direction<8;direction++)for(let walk=0;walk<8;walk++){
  const angle=direction*Math.PI/4,from={x:100,y:100},heading={x:Math.cos(angle),y:Math.sin(angle)},to={x:100+100*heading.x,y:100+100*heading.y};
  const attack={actor:'dwarf',source,walkEntry:(walk+3)%8,from,to,elapsed:.38,hitAt:.24,duration:.52} as CombatAttack,motion={distance:walk*8,speed:100,heading};
  for(const [elapsed,frame] of [[.38,'hold'],[.399,'hold'],[.4,'weight-release'],[.449,'weight-release'],[.45,'stride-pickup'],[.499,'stride-pickup'],[.5,'walk'],[.519,'walk']] as const){
   const result=art.dwarfHammerReturnSpriteAsset({...attack,elapsed},motion)!;assert.equal(result.walk,walk);assert.equal(result.frame,frame);assert.equal(result.direction,direction);
   assert.equal(result.asset.groundY!/result.asset.height,220/256);assert.equal(result.asset.displayScale,1.2*6.8/5.8);
   if(frame==='walk')assert.deepEqual(result.asset,art.directionalLocomotionSpriteAsset('dwarf',heading,motion.distance));
   else if(frame==='hold')assert.deepEqual(result.asset,art.hammerSequenceSpriteAsset('dwarf',{...attack,elapsed:.39}));
   else assert.equal(result.asset.viewBox,`${(walk*2+(frame==='weight-release'?0:1))*192} 0 192 192`);
   for(const multiplier of [.5,2])assert.deepEqual(art.dwarfHammerReturnSpriteAsset({...attack,elapsed:elapsed*multiplier,hitAt:.24*multiplier,duration:.52*multiplier},motion),result,'uses simulation attack timing');
  }
  for(const elapsed of [-1,0,.24,.30,.379,.52,.6,NaN,Infinity])assert.equal(art.dwarfHammerReturnSpriteAsset({...attack,elapsed},motion),null);
  assert.equal(art.dwarfHammerReturnSpriteAsset(attack,motion,true),null);
  for(const speed of [0,.5,NaN,Infinity])assert.equal(art.dwarfHammerReturnSpriteAsset(attack,{...motion,speed}),null);
  for(const bad of [{distance:NaN},{heading:undefined},{heading:{x:-heading.x,y:-heading.y}}])assert.equal(art.dwarfHammerReturnSpriteAsset(attack,{...motion,...bad}),null);
  assert.equal(art.dwarfHammerReturnSpriteAsset({...attack,actor:'elf'},motion),null);
  const changed=art.dwarfHammerReturnSpriteAsset({...attack,elapsed:.48},{...motion,distance:(walk+1)%8*8})!;assert.equal(changed.walk,(walk+1)%8,'follow gait after attack entry');
 }
 assert.equal(requests.filter(src=>src.includes('/dwarf-return-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
});

test('Bron optional return and entry failures are independent and preserve impact trails',async()=>{
 const attack={actor:'dwarf',source:'hero',walkEntry:3,from:{x:0,y:0},to:{x:100,y:0},elapsed:.43,hitAt:.24,duration:.52} as CombatAttack,motion={distance:24,speed:100,heading:{x:1,y:0}};
 const {art:complete}=await loadWithImageResults(()=>false,'dwarf-return-complete');
 for(const missing of ['dwarf-return-3-atlas.webp','dwarf-entry-3-atlas.webp','dwarf-hammer-3-atlas.webp','dwarf-locomotion-3-atlas.webp','dwarf-idle-game.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(missing),'dwarf-return-fail-'+missing);
  assert.equal(!!art.dwarfHammerReturnSpriteAsset(attack,motion),missing.includes('entry'));
  assert.equal(!!art.dwarfHammerEntrySpriteAsset({...attack,elapsed:.06}),missing.includes('return'));
  if(missing.includes('return')||missing.includes('entry'))for(const elapsed of [.18,.24,.28,.31,.37]){
   assert.deepEqual(art.hammerSequenceSpriteAsset('dwarf',{...attack,elapsed}),complete.hammerSequenceSpriteAsset('dwarf',{...attack,elapsed}));
   assert.deepEqual(art.hammerContactTrail({...attack,elapsed},84),complete.hammerContactTrail({...attack,elapsed},84));
  }
  assert.ok(art.rielShotReturnSpriteAsset({...attack,actor:'elf',elapsed:.2,hitAt:.1,duration:.28},attack.from,motion),'Riel recovery remains independent');
 }
});

test('aligned Bron return remains visible at nominal 1x/2x and 20Hz 2x publications',async()=>{
 const {art}=await loadWithImageResults(()=>false,'dwarf-return-cadence');
 const attack={actor:'dwarf',source:'hero',from:{x:0,y:0},to:{x:100,y:0},hitAt:.24,duration:.52} as CombatAttack;
 for(const ticksPerPublication of [2,4,6])for(let offset=0;offset<ticksPerPublication;offset++){
  const frames=[];
  for(let tick=offset;tick/60<attack.duration;tick+=ticksPerPublication){const elapsed=tick/60;frames.push(art.dwarfHammerReturnSpriteAsset({...attack,elapsed},{speed:230,distance:elapsed*230,heading:{x:1,y:0}})?.frame)}
  assert.ok(frames.some(frame=>frame==='weight-release'||frame==='stride-pickup'),`${ticksPerPublication}/${offset}: ${frames}`);
 }
});

test('frost wolf ordinary hit keeps the current heading, gait, crop and mobile scale',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'frost-flinch');
 for(let d=0;d<8;d++)for(let frame=0;frame<8;frame++)for(const size of [73,91.25]){
  const heading={x:Math.cos(d*Math.PI/4),y:Math.sin(d*Math.PI/4)},cycles=frame/8*size/73;
  const walk=art.frostWolfDirectionalWalkAsset(heading,0,size,cycles)!;
  for(const [hit,phase,sample] of [[.16,'compress',0],[.091,'compress',0],[.09,'release',1],[.021,'release',1]] as const){
   const flinch=art.frostWolfHitAsset(heading,0,hit,size,cycles)!;assert.equal(flinch.direction,d);assert.equal(flinch.frame,frame);assert.equal(flinch.phase,phase);
   assert.equal(flinch.asset.src,`/defense/models/frost-flinch-${d}-atlas.webp`);assert.equal(flinch.asset.viewBox,`${(frame*2+sample)*192+4} 20 184 152`);assert.equal(flinch.asset.oriented,true);
   assert.equal(flinch.asset.displayScale,walk.asset.displayScale);assert.equal(flinch.asset.groundY!/192,walk.asset.groundY!/256);
  }
  for(const hit of [0,.02,-1,.17,NaN,Infinity])assert.equal(art.frostWolfHitAsset(heading,0,hit,size,cycles),null);
  assert.equal(art.frostWolfHitAsset(heading,0,.1,size,cycles,true),null);
  const next=art.frostWolfHitAsset(heading,0,.06,size,(frame+1)%8/8*size/73)!;assert.equal(next.frame,(frame+1)%8,'damage does not freeze the advancing gait');
 }
 for(const heading of [{x:0,y:0},{x:NaN,y:1}])assert.equal(art.frostWolfHitAsset(heading,0,.1),null);
 for(const size of [0,-1,NaN,Infinity])assert.equal(art.frostWolfHitAsset({x:1,y:0},0,.1,size),null);
 assert.equal(requests.filter(p=>p.includes('/frost-flinch-')).length,8);assert.ok(!requests.some(p=>p.endsWith('.glb')));
});

test('frost wolf optional hit failure preserves stride and collapse; base and stride failure keep their fallback',async()=>{
 const heading={x:0,y:1};
 const {art:complete}=await loadWithImageResults(()=>false,'flinch-all');
 for(const missing of ['frost-flinch-3-atlas.webp','frost-stride-3-atlas.webp','frost-wolf-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(missing),'flinch-fail-'+missing);
  assert.equal(art.frostWolfHitAsset(heading,0,.1,73,.375),null);
  if(missing.includes('flinch'))assert.deepEqual(art.frostWolfDirectionalWalkAsset(heading,0,73,.375),complete.frostWolfDirectionalWalkAsset(heading,0,73,.375));
  if(!missing.startsWith('frost-wolf'))assert.deepEqual(art.monsterDeathSpriteAsset('frostwolf',.4),complete.monsterDeathSpriteAsset('frostwolf',.4));
  assert.equal(art.monsterSpriteAsset('frostwolf','hit')?.src,missing==='frost-wolf-atlas.webp'?'/defense/monster-models.webp':'/defense/models/frost-wolf-atlas.webp');
  assert.ok(art.dwarfHammerReturnSpriteAsset({actor:'dwarf',from:{x:0,y:0},to:{x:100,y:0},elapsed:.43,hitAt:.24,duration:.52} as CombatAttack,{distance:24,speed:100,heading:{x:1,y:0}}));
 }
});

test('ordinary wolf hit has a visible modeled response at 1x/2x publication offsets',async()=>{
 const {art}=await loadWithImageResults(()=>false,'flinch-cadence');
 for(const ticks of [2,4,6])for(let offset=0;offset<ticks;offset++){
  const phases=[];for(let step=offset;step/60<.16;step+=ticks)phases.push(art.frostWolfHitAsset({x:1,y:0},step,.16-step/60)?.phase);
  assert.ok(phases.some(Boolean),`${ticks}/${offset}`);
 }
});


test('wolf collapse freezes its saved heading and gait, preserves ground/scale and follows age',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'frost-fall');
 for(let d=0;d<8;d++)for(let gait=0;gait<8;gait++)for(const size of [73,91.25]){
  const heading={x:Math.cos(d*Math.PI/4),y:Math.sin(d*Math.PI/4)},cycles=gait/8*size/73;
  const walk=art.frostWolfDirectionalWalkAsset(heading,0,size,cycles)!;
  for(const [age,frame] of [[0,0],[.059,0],[.06,1],[.239,1],[.24,2],[.419,2],[.42,3],[.69,3]] as const){
   const fall=art.frostWolfFallAsset(heading,0,cycles,age,size)!;assert.equal(fall.direction,d);assert.equal(fall.gait,gait);assert.equal(fall.frame,frame);assert.equal(fall.asset.oriented,true);
   assert.equal(fall.asset.displayScale,walk.asset.displayScale);
   if(frame===0)assert.deepEqual(fall.asset,{...walk.asset,oriented:true});
   else{assert.equal(fall.asset.src,`/defense/models/frost-fall-${d}-atlas.webp`);assert.equal(fall.asset.viewBox,`${gait*192+4} ${(frame-1)*192+20} 184 152`);assert.equal((fall.asset.groundY!-(frame-1)*192)/192,walk.asset.groundY!/256);}
   assert.equal(art.frostWolfFallAsset(heading,0,cycles,age,size,true)!.frame,3);
  }
 }
 assert.equal(requests.filter(p=>p.includes('/frost-fall-')).length,8);
 for(const age of [NaN,Infinity])assert.equal(art.frostWolfFallAsset({x:1,y:0},0,0,age),null);
 assert.equal(art.frostWolfFallAsset({x:0,y:0},0,0,0),null);
 for(const size of [0,-1,NaN])assert.equal(art.frostWolfFallAsset({x:1,y:0},0,0,0,size),null);
});

test('directional collapse is optional and failure retains prior collapse, walking and ordinary hits',async()=>{
 const h={x:0,y:-1};const {art:complete}=await loadWithImageResults(()=>false,'fall-complete');
 for(const file of ['frost-fall-2-atlas.webp','frost-stride-2-atlas.webp','frost-wolf-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(file),'fall-fail-'+file);
  assert.equal(art.frostWolfFallAsset(h,0,.5,.3),null);
  if(file.startsWith('frost-fall')){
   assert.deepEqual(art.monsterDeathSpriteAsset('frostwolf',.5),complete.monsterDeathSpriteAsset('frostwolf',.5));
   assert.deepEqual(art.frostWolfHitAsset(h,0,.1),complete.frostWolfHitAsset(h,0,.1));
   assert.deepEqual(art.frostWolfDirectionalWalkAsset(h,0),complete.frostWolfDirectionalWalkAsset(h,0));
  }
 }
});

test('collapse reaches all three baked phases even at 20Hz publication and 2x speed',async()=>{
 const {art}=await loadWithImageResults(()=>false,'fall-cadence');
 for(const ticks of [2,4,6])for(let offset=0;offset<ticks;offset++){
  const frames=new Set();for(let step=offset;step/60<.7;step+=ticks)frames.add(art.frostWolfFallAsset({x:1,y:0},0,.5,step/60)!.frame);
  for(const frame of [1,2,3])assert.ok(frames.has(frame),`${ticks}/${offset}/${frame}`);
 }
});


test('wolf knockback holds direction and gait through strong, soft and recovery speed bands',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'frost-brace');
 for(let d=0;d<8;d++)for(let gait=0;gait<8;gait++)for(const size of [73,91.25]){
  const heading={x:Math.cos(d*Math.PI/4),y:Math.sin(d*Math.PI/4)},cycles=gait/8*size/73;
  const walk=art.frostWolfDirectionalWalkAsset(heading,0,size,cycles)!;
  for(const [velocity,frame] of [[180,0],[65.01,0],[65,1],[22.01,1],[22,2],[7.01,2]] as const){
   const brace=art.frostWolfBraceAsset(heading,0,cycles,velocity,size)!;
   assert.equal(brace.direction,d);assert.equal(brace.gait,gait);assert.equal(brace.frame,frame);assert.equal(brace.asset.oriented,true);
   assert.equal(brace.asset.src,`/defense/models/frost-brace-${d}-atlas.webp`);assert.equal(brace.asset.viewBox,`${gait*192+4} ${frame*192+20} 184 152`);
   assert.equal(brace.asset.displayScale,walk.asset.displayScale);assert.equal((brace.asset.groundY!-frame*192)/192,walk.asset.groundY!/256);
   const still=art.frostWolfBraceAsset(heading,0,cycles,velocity,size,true)!;assert.equal(still.frame,3);assert.deepEqual(still.asset,{...walk.asset,oriented:true});
  }
 }
 for(const velocity of [-1,0,7,NaN,Infinity])assert.equal(art.frostWolfBraceAsset({x:1,y:0},0,0,velocity),null);
 for(const size of [0,-1,NaN])assert.equal(art.frostWolfBraceAsset({x:1,y:0},0,0,80,size),null);
 assert.equal(art.frostWolfBraceAsset({x:0,y:0},0,0,80),null);assert.equal(art.frostWolfBraceAsset({x:1,y:0},0,NaN,80),null);
 assert.equal(requests.filter(p=>/\/frost-brace-\d+-atlas/.test(p)).length,8);
});

test('optional brace failure retains ordinary flinch, walking and directional collapse',async()=>{
 const h={x:0,y:-1}, {art:complete}=await loadWithImageResults(()=>false,'brace-complete');
 for(const file of ['frost-brace-2-atlas.webp','frost-stride-2-atlas.webp','frost-wolf-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(file),'brace-fail-'+file);assert.equal(art.frostWolfBraceAsset(h,0,.5,80),null);
  if(file.startsWith('frost-brace')){
   assert.deepEqual(art.frostWolfFallAsset(h,0,.5,.3),complete.frostWolfFallAsset(h,0,.5,.3));
   assert.deepEqual(art.frostWolfHitAsset(h,0,.1),complete.frostWolfHitAsset(h,0,.1));
   assert.deepEqual(art.frostWolfDirectionalWalkAsset(h,0),complete.frostWolfDirectionalWalkAsset(h,0));
  }
 }
});

test('decaying strong knockback shows all three brace phases at 1x/2x publication offsets',async()=>{
 const {art}=await loadWithImageResults(()=>false,'brace-cadence');
 for(const ticks of [2,4,6])for(let offset=0;offset<ticks;offset++){
  const frames=new Set();for(let step=offset;step/60<.7;step+=ticks)frames.add(art.frostWolfBraceAsset({x:1,y:0},0,.5,180*Math.exp(-6*step/60))?.frame);
  for(const frame of [0,1,2])assert.ok(frames.has(frame),`${ticks}/${offset}/${frame}`);assert.ok(frames.has(undefined));
 }
});

test('stationary Riel settles after release, reloads on the existing boundary and joins ready',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'riel-reset');const p={x:200,y:200},motion={speed:0,distance:24,heading:{x:1,y:0}};
 for(const source of ['hero','mercenary'] as const)for(let d=0;d<8;d++){
  const to={x:p.x+100*Math.cos(d*Math.PI/4),y:p.y+100*Math.sin(d*Math.PI/4)},a={actor:'elf',source,from:p,to,elapsed:.2,hitAt:.1,duration:.28} as CombatAttack;
  for(const [elapsed,frame] of [[.16,'hold'],[.174,'hold'],[.175,'settle'],[.219,'settle'],[.22,'reload'],[.269,'reload'],[.27,'ready'],[.279,'ready']] as const){
   const r=art.rielShotResetSpriteAsset({...a,elapsed},p,motion)!;assert.equal(r.direction,d);assert.equal(r.frame,frame);assert.equal(r.asset.displayScale,1.2*6.8/5.8);assert.equal(r.asset.groundY!/r.asset.height,220/256);
   if(frame==='hold')assert.deepEqual(r.asset,art.directionalActionSpriteAsset('elf','strike',p,to));
   else if(frame==='ready')assert.deepEqual(r.asset,art.directionalLocomotionSpriteAsset('elf',{x:to.x-p.x,y:to.y-p.y},null));
   else{assert.equal(r.asset.src,`/defense/models/riel-reset-${d}-atlas.webp`);assert.equal(r.asset.viewBox,`${frame==='settle'?0:192} 0 192 192`)}
  }
  for(const elapsed of [-1,.1,.159,.28,NaN,Infinity])assert.equal(art.rielShotResetSpriteAsset({...a,elapsed},p,motion),null);
  for(const speed of [-1,.501,100,NaN,Infinity])assert.equal(art.rielShotResetSpriteAsset(a,p,{...motion,speed}),null);
  assert.ok(art.rielShotResetSpriteAsset(a,p,{...motion,speed:.5}));assert.equal(art.rielShotResetSpriteAsset(a,p,motion,true),null);
  assert.equal(art.rielShotResetSpriteAsset({...a,actor:'dwarf'},p,motion),null);assert.equal(art.rielShotResetSpriteAsset({...a,to:p},p,motion),null);
 }
 assert.equal(requests.filter(s=>s.includes('/riel-reset-')).length,8);
});

test('optional stationary recovery fails independently of Riel moving return and shots',async()=>{
 const p={x:0,y:0},motion={speed:0,distance:24,heading:{x:1,y:0}},a={actor:'elf',from:p,to:{x:100,y:0},elapsed:.2,hitAt:.1,duration:.28} as CombatAttack;
 for(const missing of ['riel-reset-3-atlas.webp','riel-cast-3-atlas.webp','riel-walk-3-atlas.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(missing),'riel-reset-fail-'+missing);assert.equal(art.rielShotResetSpriteAsset(a,p,motion),null);
  if(missing.startsWith('riel-reset')){assert.ok(art.directionalActionSpriteAsset('elf','strike',p,a.to));assert.ok(art.rielShotReturnSpriteAsset(a,p,{...motion,speed:100}));}
 }
 const {art}=await loadWithImageResults(s=>s.includes('/riel-return-'),'riel-return-independent');assert.ok(art.rielShotResetSpriteAsset(a,p,motion));
});

test('stationary recovery has an intermediate pose at nominal 1x/2x and 20Hz publications',async()=>{
 const {art}=await loadWithImageResults(()=>false,'riel-reset-cadence'),p={x:0,y:0},motion={speed:0,distance:0},a={actor:'elf',from:p,to:{x:100,y:0},hitAt:.1,duration:.28} as CombatAttack;
 for(const ticks of [2,4,6])for(let offset=0;offset<ticks;offset++){
  const frames=[];for(let step=offset;step/60<.28;step+=ticks)frames.push(art.rielShotResetSpriteAsset({...a,elapsed:step/60},p,motion)?.frame);
  assert.ok(frames.some(f=>f==='settle'||f==='reload'),`${ticks}/${offset}: ${frames}`);
 }
});


test('braced collapse starts in the visible brace, keeps common ground and ends in the existing fall',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'brace-fall');
 for(let d=0;d<8;d++)for(let gait=0;gait<8;gait++)for(const size of [73,91.25])for(const [velocity,brace] of [[140,0],[65,1],[22,2]]){
  const heading={x:Math.cos(d*Math.PI/4),y:Math.sin(d*Math.PI/4)},cycles=gait/8*size/73;
  const start=art.frostWolfBraceAsset(heading,0,cycles,velocity,size)!;
  for(const [age,frame] of [[0,0],[.059,0],[.06,1],[.239,1],[.24,2],[.419,2],[.42,3],[.69,3]]){
   const result=art.frostWolfBracedFallAsset(heading,0,cycles,velocity,age,size)!;
   assert.equal(result.direction,d);assert.equal(result.gait,gait);assert.equal(result.brace,brace);assert.equal(result.frame,frame);
   assert.equal(result.asset.displayScale,start.asset.displayScale);assert.equal(result.asset.oriented,true);
   if(frame===0)assert.deepEqual(result.asset,start.asset);
   else if(frame===3)assert.deepEqual(result.asset,art.frostWolfFallAsset(heading,0,cycles,age,size)!.asset);
   else{
    assert.equal(result.asset.src,`/defense/models/frost-brace-fall-${d}-atlas.webp`);
    const crop=result.asset.viewBox.split(' ').map(Number);assert.ok(Math.abs(crop[0]-((gait*2+frame-1)*128+8/3))<1e-9);assert.ok(Math.abs(crop[1]-(brace*128+40/3))<1e-9);
    assert.ok(Math.abs((result.asset.groundY!-brace*128)/128-(start.asset.groundY!-brace*192)/192)<1e-9);
   }
   assert.deepEqual(art.frostWolfBracedFallAsset(heading,0,cycles,velocity,age,size,true)!.asset,art.frostWolfFallAsset(heading,0,cycles,age,size,true)!.asset);
  }
 }
 assert.equal(requests.filter(p=>p.includes('/frost-brace-fall-')).length,8);assert.ok(!requests.some(p=>p.endsWith('.glb')));
 for(const velocity of [-1,0,7,NaN,Infinity])assert.equal(art.frostWolfBracedFallAsset({x:1,y:0},0,0,velocity,.2),null);
});

test('optional braced-collapse failure preserves existing fall and live brace independently',async()=>{
 const h={x:0,y:-1},{art:complete}=await loadWithImageResults(()=>false,'brace-fall-complete');
 for(const file of ['frost-brace-fall-2-atlas.webp','frost-brace-2-atlas.webp','frost-fall-2-atlas.webp','frost-stride-2-atlas.webp','frost-wolf-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(file),'brace-fall-fail-'+file);
  assert.equal(art.frostWolfBracedFallAsset(h,0,.5,140,.3),null);
  if(file.startsWith('frost-brace-fall')){
   assert.deepEqual(art.frostWolfFallAsset(h,0,.5,.3),complete.frostWolfFallAsset(h,0,.5,.3));
   assert.deepEqual(art.frostWolfBraceAsset(h,0,.5,140),complete.frostWolfBraceAsset(h,0,.5,140));
  }
 }
});

test('braced collapse publishes both bridge poses at 1x/2x offsets without wall-time drift',async()=>{
 const {art}=await loadWithImageResults(()=>false,'brace-fall-cadence');
 for(const velocity of [140,40,12])for(const ticks of [2,4,6])for(let offset=0;offset<ticks;offset++){
  const frames=new Set();for(let step=offset;step/60<.7;step+=ticks)frames.add(art.frostWolfBracedFallAsset({x:1,y:0},0,.5,velocity,step/60)!.frame);
  for(const frame of [1,2,3])assert.ok(frames.has(frame),`${velocity}/${ticks}/${offset}/${frame}`);
 }
});


test('Riel stops from the saved gait and heading with common scale, ground and simulation age',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'riel-stop');
 for(let direction=0;direction<8;direction++)for(let entry=0;entry<8;entry++){
  const heading={x:Math.cos(direction*Math.PI/4),y:Math.sin(direction*Math.PI/4)},motion={distance:entry*8,speed:0,heading:{x:-heading.x,y:-heading.y},settle:{frame:entry,elapsed:0,heading}};
  for(const [elapsed,frame] of [[0,0],[.079,0],[.08,1],[.159,1],[.16,2],[.239,2]]){
   const result=art.archerStopSpriteAsset('elf',{...motion,settle:{...motion.settle,elapsed}})!;
   assert.equal(result.frame,frame);assert.equal(result.entry,entry);assert.equal(result.asset.oriented,true);
   const walk=art.directionalLocomotionSpriteAsset('elf',heading,entry*8)!;assert.equal(result.asset.displayScale,walk.displayScale);
   if(frame===0)assert.deepEqual(result.asset,walk);else{assert.equal(result.asset.src,`/defense/models/riel-stop-${direction}-atlas.webp`);assert.equal(result.asset.viewBox,`${(entry*2+frame-1)*192} 0 192 192`);assert.equal(result.asset.groundY!/192,walk.groundY!/256);}
  }
  for(const elapsed of [-1,.24,NaN,Infinity])assert.equal(art.archerStopSpriteAsset('elf',{...motion,settle:{...motion.settle,elapsed}}),null);
  for(const speed of [-1,1,NaN,Infinity])assert.equal(art.archerStopSpriteAsset('elf',{...motion,speed}),null);
  for(const frame of [-1,8,.5,NaN])assert.equal(art.archerStopSpriteAsset('elf',{...motion,settle:{...motion.settle,frame}}),null);
  assert.equal(art.archerStopSpriteAsset('elf',motion,true),null);assert.equal(art.archerStopSpriteAsset('mage',motion),null);
 }
 assert.equal(requests.filter(s=>s.includes('/riel-stop-')).length,8);assert.ok(!requests.some(s=>s.endsWith('.glb')));
});

test('Riel stop is optional and preserves firing, reset, moving return and walking on failure',async()=>{
 const h={x:1,y:0},motion={distance:24,speed:0,heading:h,settle:{frame:3,elapsed:.1,heading:h}},p={x:0,y:0};
 const a={actor:'elf',source:'hero',from:p,to:h,elapsed:.2,hitAt:.1,duration:.28} as CombatAttack;
 const {art:complete}=await loadWithImageResults(()=>false,'riel-stop-complete');
 for(const file of ['riel-stop-3-atlas.webp','riel-walk-3-atlas.webp','riel-cast-3-atlas.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'riel-stop-fail-'+file);assert.equal(art.archerStopSpriteAsset('elf',motion),null);
  if(file.includes('stop')){
   assert.deepEqual(art.rielShotResetSpriteAsset(a,p,motion),complete.rielShotResetSpriteAsset(a,p,motion));
   assert.deepEqual(art.rielShotReturnSpriteAsset(a,p,{...motion,speed:100}),complete.rielShotReturnSpriteAsset(a,p,{...motion,speed:100}));
   assert.deepEqual(art.directionalLocomotionSpriteAsset('elf',h,24),complete.directionalLocomotionSpriteAsset('elf',h,24));
  }
 }
});

test('both Riel stop steps are published at 1x/2x with every publication offset',async()=>{
 const {art}=await loadWithImageResults(()=>false,'riel-stop-cadence'),heading={x:1,y:0};
 for(const ticks of [2,4])for(let offset=0;offset<ticks;offset++){
  const frames=new Set();for(let i=offset;i/60<.24;i+=ticks)frames.add(art.archerStopSpriteAsset('elf',{distance:24,speed:0,settle:{frame:3,heading,elapsed:i/60}})?.frame);
  for(const frame of [1,2])assert.ok(frames.has(frame),`${ticks}/${offset}/${frame}`);
 }
});

test('Ian cast entry preserves each captured walk and joins the original shot before release',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'ian-entry');
 const position={x:200,y:200};
 for(const source of ['hero','mercenary'] as const)for(let direction=0;direction<8;direction++)for(let entry=0;entry<8;entry++){
  const angle=direction*Math.PI/4,to={x:200+100*Math.cos(angle),y:200+100*Math.sin(angle)};
  const attack={actor:'mage',source,walkEntry:entry,from:position,to,elapsed:0,hitAt:.15,duration:.33} as CombatAttack;
  for(const [t,expected] of [[0,'walk'],[.024,'walk'],[.025,'first-foot'],[.064,'first-foot'],[.065,'second-foot'],[.099,'second-foot']] as const){
   const pose=art.mageCastEntrySpriteAsset({...attack,elapsed:t},position)!;
   const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/ian-entry.json',import.meta.url),'utf8'));const sample=expected==='walk'?0:expected==='first-foot'?1:2;assert.deepEqual([pose.socket.x,pose.socket.y],meta.directions[direction].sockets[entry][sample]);
   assert.equal(pose.entry,entry);assert.equal(pose.frame,expected);assert.equal(pose.direction,direction);
   assert.equal(pose.asset.displayScale,1.2*6.8/5.8);assert.equal(pose.asset.groundY!/pose.asset.height,220/256);
   if(expected==='walk')assert.deepEqual(pose.asset,art.directionalLocomotionSpriteAsset('mage',{x:Math.cos(angle),y:Math.sin(angle)},entry*8));
   else {assert.equal(pose.asset.src,`/defense/models/ian-entry-${direction}-atlas.webp`);const [x,y,w,h]=pose.asset.viewBox.split(' ').map(Number);assert.ok(x+w<=pose.asset.width&&y+h<=pose.asset.height);}
  }
  for(const elapsed of [-1,.1,.149,.15,.33,NaN,Infinity])assert.equal(art.mageCastEntrySpriteAsset({...attack,elapsed},position),null);
  assert.equal(art.mageCastEntrySpriteAsset(attack,position,true),null);
  for(const walkEntry of [undefined,-1,8,.5,NaN])assert.equal(art.mageCastEntrySpriteAsset({...attack,walkEntry},position),null);
  assert.ok(art.directionalActionSpriteAsset('mage','strike',position,to));
 }
 assert.equal(requests.filter(src=>src.includes('/ian-entry-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
});

test('Ian transition image failure retains the complete existing shot and walk set',async()=>{
 const position={x:0,y:0},attack={actor:'mage',source:'hero',walkEntry:3,to:{x:100,y:0},elapsed:.04} as CombatAttack;
 for(const missing of ['ian-entry-3-atlas.webp','ian-walk-3-atlas.webp','ian-cast-3-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(missing),'ian-entry-fail-'+missing);
  assert.equal(art.mageCastEntrySpriteAsset(attack,position),null);
  assert.equal(!!art.directionalActionSpriteAsset('mage','windup',position,attack.to),missing.startsWith('ian-entry'));
  assert.equal(!!art.directionalLocomotionSpriteAsset('mage',{x:1,y:0},24),missing.startsWith('ian-entry'));
  assert.ok(art.directionalActionSpriteAsset('elf','windup',position,attack.to));
 }
});


test('Ian preparation remains visible at both published simulation cadences and stops before release',async()=>{
 const {art}=await loadWithImageResults(()=>false,'ian-entry-cadence');
 for(const dt of [1/30,2/30]){const seen=new Set();for(let t=0;t<.15;t+=dt){const pose=art.mageCastEntrySpriteAsset({actor:'mage',source:'hero',walkEntry:3,elapsed:t,to:{x:100,y:0}} as CombatAttack,{x:0,y:0});if(pose)seen.add(pose.frame)}assert.ok(seen.has('walk'));assert.ok(seen.has('second-foot'));}
});

test('Ian cast recovery follows current aligned gait and joins the next walking sprite',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'ian-return');
 for(const source of ['hero','mercenary'] as const)for(let direction=0;direction<8;direction++)for(let walk=0;walk<8;walk++){
  const angle=direction*Math.PI/4,from={x:100,y:100},heading={x:Math.cos(angle),y:Math.sin(angle)},to={x:100+100*heading.x,y:100+100*heading.y};
  const attack={actor:'mage',source,walkEntry:(walk+3)%8,from,to,elapsed:.21,hitAt:.15,duration:.33} as CombatAttack,motion={distance:walk*8,speed:100,heading};
  for(const [elapsed,frame] of [[.21,'hold'],[.224,'hold'],[.225,'release-weight'],[.269,'release-weight'],[.27,'stride-pickup'],[.319,'stride-pickup'],[.32,'walk'],[.329,'walk']] as const){
   const result=art.mageCastReturnSpriteAsset({...attack,elapsed},from,motion)!;assert.equal(result.walk,walk);assert.equal(result.frame,frame);assert.equal(result.direction,direction);
   assert.equal(result.asset.groundY!/result.asset.height,220/256);assert.equal(result.asset.displayScale,1.2*6.8/5.8);
   if(frame==='walk')assert.deepEqual(result.asset,art.directionalLocomotionSpriteAsset('mage',heading,motion.distance));
   else if(frame==='hold')assert.deepEqual(result.asset,art.directionalActionSpriteAsset('mage','strike',from,to));
   else assert.equal(result.asset.viewBox,`${(walk*2+(frame==='release-weight'?0:1))*192} 0 192 192`);
  }
  for(const elapsed of [-1,0,.15,.209,.33,.4,NaN,Infinity])assert.equal(art.mageCastReturnSpriteAsset({...attack,elapsed},from,motion),null);
  assert.equal(art.mageCastReturnSpriteAsset(attack,from,motion,true),null);
  for(const speed of [0,.5,NaN,Infinity])assert.equal(art.mageCastReturnSpriteAsset(attack,from,{...motion,speed}),null);
  assert.equal(art.mageCastReturnSpriteAsset(attack,from,{...motion,heading:{x:-heading.x,y:-heading.y}}),null,'turning shots keep the established pose');
  assert.equal(art.mageCastReturnSpriteAsset(attack,from,{...motion,heading:undefined}),null);
  assert.equal(art.mageCastReturnSpriteAsset({...attack,actor:'dwarf'},from,motion),null);
  const changed=art.mageCastReturnSpriteAsset({...attack,elapsed:.29},from,{...motion,distance:(walk+1)%8*8})!;assert.equal(changed.walk,(walk+1)%8,'gait cannot freeze at attack entry');
 }
 assert.equal(requests.filter(src=>src.includes('/ian-return-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
});

test('Ian return and entry sets fail independently without changing existing release sockets',async()=>{
 const attack={actor:'mage',source:'hero',walkEntry:3,from:{x:0,y:0},to:{x:100,y:0},elapsed:.25,hitAt:.15,duration:.33} as CombatAttack,motion={distance:24,speed:100,heading:{x:1,y:0}};
 for(const missing of ['ian-return-3-atlas.webp','ian-entry-3-atlas.webp','ian-cast-3-atlas.webp','ian-walk-3-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(missing),'ian-return-fail-'+missing),coreFail=missing.includes('cast')||missing.includes('walk');
  assert.equal(!!art.mageCastReturnSpriteAsset(attack,attack.from,motion),missing.includes('entry'));
  assert.equal(!!art.mageCastEntrySpriteAsset({...attack,elapsed:.04},attack.from),missing.includes('return'));
  assert.equal(!!art.directionalActionSpriteAsset('mage','strike',attack.from,attack.to),!coreFail);
  assert.equal(!!art.mageCastSocket(attack.from,attack.to,84),!coreFail);
  assert.ok(art.hammerSequenceSpriteAsset('dwarf',{...attack,actor:'dwarf'}));
 }
});

test('aligned Ian return exposes an intermediate pose across fixed-step 1x and 2x publications',async()=>{
 const {art}=await loadWithImageResults(()=>false,'ian-return-cadence');
 const attack={actor:'mage',source:'hero',from:{x:0,y:0},to:{x:100,y:0},hitAt:.15,duration:.33} as CombatAttack;
 // 60Hz simulation: 2/4 ticks are nominal 30Hz at 1x/2x; 6 ticks covers 20Hz at 2x.
 for(const ticksPerPublication of [2,4,6])for(let offset=0;offset<ticksPerPublication;offset++){
  const frames=[];
  for(let tick=offset;tick/60<attack.duration;tick+=ticksPerPublication){const elapsed=tick/60;frames.push(art.mageCastReturnSpriteAsset({...attack,elapsed},attack.from,{speed:230,distance:elapsed*230,heading:{x:1,y:0}})?.frame)}
  assert.ok(frames.some(frame=>frame==='release-weight'||frame==='stride-pickup'),`${ticksPerPublication}/${offset}: ${frames}`);
 }
});

test('stationary Ian absorbs recoil, follows with staff and cape, and joins ready',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'ian-reset');const p={x:200,y:200},motion={speed:0,distance:24,heading:{x:1,y:0}};
 for(const source of ['hero','mercenary'] as const)for(let d=0;d<8;d++){
  const to={x:p.x+100*Math.cos(d*Math.PI/4),y:p.y+100*Math.sin(d*Math.PI/4)},a={actor:'mage',source,from:p,to,elapsed:.25,hitAt:.15,duration:.33} as CombatAttack;
  for(const [elapsed,frame] of [[.21,'hold'],[.224,'hold'],[.225,'recover'],[.269,'recover'],[.27,'settle'],[.319,'settle'],[.32,'ready'],[.329,'ready']] as const){
   const r=art.mageCastResetSpriteAsset({...a,elapsed},p,motion)!;assert.equal(r.direction,d);assert.equal(r.frame,frame);assert.equal(r.asset.displayScale,1.2*6.8/5.8);assert.equal(r.asset.groundY!/r.asset.height,220/256);
   if(frame==='hold')assert.deepEqual(r.asset,art.directionalActionSpriteAsset('mage','strike',p,to));
   else if(frame==='ready')assert.deepEqual(r.asset,art.directionalLocomotionSpriteAsset('mage',{x:to.x-p.x,y:to.y-p.y},null));
   else{assert.equal(r.asset.src,`/defense/models/ian-reset-${d}-atlas.webp`);assert.equal(r.asset.viewBox,`${frame==='recover'?0:192} 0 192 192`)}
  }
  for(const elapsed of [-1,.15,.209,.33,NaN,Infinity])assert.equal(art.mageCastResetSpriteAsset({...a,elapsed},p,motion),null);
  for(const speed of [-1,.501,100,NaN,Infinity])assert.equal(art.mageCastResetSpriteAsset(a,p,{...motion,speed}),null);
  assert.ok(art.mageCastResetSpriteAsset(a,p,{...motion,speed:.5}));assert.equal(art.mageCastResetSpriteAsset(a,p,motion,true),null);
  assert.equal(art.mageCastResetSpriteAsset({...a,actor:'dwarf'},p,motion),null);assert.equal(art.mageCastResetSpriteAsset({...a,to:p},p,motion),null);
 }
 assert.equal(requests.filter(s=>s.includes('/ian-reset-')).length,8);
});

test('optional stationary recovery fails independently of Ian moving return and casts',async()=>{
 const p={x:0,y:0},motion={speed:0,distance:24,heading:{x:1,y:0}},a={actor:'mage',source:'hero',from:p,to:{x:100,y:0},elapsed:.25,hitAt:.15,duration:.33} as CombatAttack;
 for(const missing of ['ian-reset-3-atlas.webp','ian-cast-3-atlas.webp','ian-walk-3-atlas.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(missing),'ian-reset-fail-'+missing);assert.equal(art.mageCastResetSpriteAsset(a,p,motion),null);
  if(missing.startsWith('ian-reset')){assert.ok(art.directionalActionSpriteAsset('mage','strike',p,a.to));assert.ok(art.mageCastReturnSpriteAsset(a,p,{...motion,speed:100}));}
 }
 const {art}=await loadWithImageResults(s=>s.includes('/ian-return-'),'ian-return-independent');assert.ok(art.mageCastResetSpriteAsset(a,p,motion));
});

test('stationary Ian recovery has an intermediate pose at nominal 1x/2x and 20Hz publications',async()=>{
 const {art}=await loadWithImageResults(()=>false,'ian-reset-cadence'),p={x:0,y:0},motion={speed:0,distance:0},a={actor:'mage',source:'hero',from:p,to:{x:100,y:0},hitAt:.15,duration:.33} as CombatAttack;
 for(const ticks of [2,4,6])for(let offset=0;offset<ticks;offset++){
  const frames=[];for(let step=offset;step/60<.33;step+=ticks)frames.push(art.mageCastResetSpriteAsset({...a,elapsed:step/60},p,motion)?.frame);
  assert.ok(frames.some(f=>f==='recover'||f==='settle'),`${ticks}/${offset}: ${frames}`);
 }
});

test('Bron stops from the saved gait and heading with common scale, ground and simulation age',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'dwarf-stop');
 for(let direction=0;direction<8;direction++)for(let entry=0;entry<8;entry++){
  const heading={x:Math.cos(direction*Math.PI/4),y:Math.sin(direction*Math.PI/4)},motion={distance:entry*8,speed:0,heading:{x:-heading.x,y:-heading.y},settle:{frame:entry,elapsed:0,heading}};
  for(const [elapsed,frame] of [[0,0],[.079,0],[.08,1],[.159,1],[.16,2],[.239,2]]){
   const result=art.dwarfStopSpriteAsset('dwarf',{...motion,settle:{...motion.settle,elapsed}})!;
   assert.equal(result.frame,frame);assert.equal(result.entry,entry);assert.equal(result.asset.oriented,true);
   const walk=art.directionalLocomotionSpriteAsset('dwarf',heading,entry*8)!;assert.equal(result.asset.displayScale,walk.displayScale);
   if(frame===0)assert.deepEqual(result.asset,walk);else{assert.equal(result.asset.src,`/defense/models/dwarf-stop-${direction}-atlas.webp`);assert.equal(result.asset.viewBox,`${(entry*2+frame-1)*192} 0 192 192`);assert.equal(result.asset.groundY!/192,walk.groundY!/256);}
  }
  for(const elapsed of [-1,.24,NaN,Infinity])assert.equal(art.dwarfStopSpriteAsset('dwarf',{...motion,settle:{...motion.settle,elapsed}}),null);
  for(const speed of [-1,1,NaN,Infinity])assert.equal(art.dwarfStopSpriteAsset('dwarf',{...motion,speed}),null);
  for(const frame of [-1,8,.5,NaN])assert.equal(art.dwarfStopSpriteAsset('dwarf',{...motion,settle:{...motion.settle,frame}}),null);
  assert.equal(art.dwarfStopSpriteAsset('dwarf',motion,true),null);assert.equal(art.dwarfStopSpriteAsset('mage',motion),null);
 }
 assert.equal(requests.filter(s=>s.includes('/dwarf-stop-')).length,8);assert.ok(!requests.some(s=>s.endsWith('.glb')));
});

test('Bron stop is optional and preserves hammer attacks, moving return and walking on failure',async()=>{
 const h={x:1,y:0},motion={distance:24,speed:0,heading:h,settle:{frame:3,elapsed:.1,heading:h}},p={x:0,y:0};
 const a={actor:'dwarf',source:'hero',from:p,to:h,elapsed:.45,hitAt:.24,duration:.52} as CombatAttack;
 const {art:complete}=await loadWithImageResults(()=>false,'dwarf-stop-complete');
 for(const file of ['dwarf-stop-3-atlas.webp','dwarf-locomotion-3-atlas.webp','dwarf-idle-game.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'dwarf-stop-fail-'+file);assert.equal(art.dwarfStopSpriteAsset('dwarf',motion),null);
  if(file.includes('stop')){
   assert.deepEqual(art.hammerSequenceSpriteAsset('dwarf',a),complete.hammerSequenceSpriteAsset('dwarf',a));
   assert.deepEqual(art.dwarfHammerReturnSpriteAsset(a,{...motion,speed:100}),complete.dwarfHammerReturnSpriteAsset(a,{...motion,speed:100}));
   assert.deepEqual(art.directionalLocomotionSpriteAsset('dwarf',h,24),complete.directionalLocomotionSpriteAsset('dwarf',h,24));
  }
 }
});

test('both Bron stop steps are published at 1x/2x with every publication offset',async()=>{
 const {art}=await loadWithImageResults(()=>false,'dwarf-stop-cadence'),heading={x:1,y:0};
 for(const ticks of [2,4])for(let offset=0;offset<ticks;offset++){
  const frames=new Set();for(let i=offset;i/60<.24;i+=ticks)frames.add(art.dwarfStopSpriteAsset('dwarf',{distance:24,speed:0,settle:{frame:3,heading,elapsed:i/60}})?.frame);
  for(const frame of [1,2])assert.ok(frames.has(frame),`${ticks}/${offset}/${frame}`);
 }
});

test('Cheongun cast entry preserves each captured walk and joins the original shot before release',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'cheongun-entry');
 const position={x:200,y:200};
 for(const source of ['hero','mercenary'] as const)for(let direction=0;direction<8;direction++)for(let entry=0;entry<8;entry++){
  const angle=direction*Math.PI/4,to={x:200+100*Math.cos(angle),y:200+100*Math.sin(angle)};
  const attack={actor:'tao',source,walkEntry:entry,from:position,to,elapsed:0,hitAt:.15,duration:.33} as CombatAttack;
  for(const [t,expected] of [[0,'walk'],[.024,'walk'],[.025,'first-foot'],[.064,'first-foot'],[.065,'second-foot'],[.099,'second-foot']] as const){
   const pose=art.taoCastEntrySpriteAsset({...attack,elapsed:t},position)!;
   const meta=JSON.parse(readFileSync(new URL('../../../public/defense/models/cheongun-entry.json',import.meta.url),'utf8'));const sample=expected==='walk'?0:expected==='first-foot'?1:2;assert.deepEqual([pose.socket.x,pose.socket.y],meta.directions[direction].sockets[entry][sample]);
   assert.equal(pose.entry,entry);assert.equal(pose.frame,expected);assert.equal(pose.direction,direction);
   assert.equal(pose.asset.displayScale,1.2*6.8/5.8);assert.equal(pose.asset.groundY!/pose.asset.height,220/256);
   if(expected==='walk')assert.deepEqual(pose.asset,art.directionalLocomotionSpriteAsset('tao',{x:Math.cos(angle),y:Math.sin(angle)},entry*8));
   else {assert.equal(pose.asset.src,`/defense/models/cheongun-entry-${direction}-atlas.webp`);const [x,y,w,h]=pose.asset.viewBox.split(' ').map(Number);assert.ok(x+w<=pose.asset.width&&y+h<=pose.asset.height);}
  }
  for(const elapsed of [-1,.1,.149,.15,.33,NaN,Infinity])assert.equal(art.taoCastEntrySpriteAsset({...attack,elapsed},position),null);
  assert.equal(art.taoCastEntrySpriteAsset(attack,position,true),null);
  for(const walkEntry of [undefined,-1,8,.5,NaN])assert.equal(art.taoCastEntrySpriteAsset({...attack,walkEntry},position),null);
  assert.ok(art.directionalActionSpriteAsset('tao','strike',position,to));
 }
 assert.equal(requests.filter(src=>src.includes('/cheongun-entry-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
});

test('Cheongun transition image failure retains the complete existing shot and walk set',async()=>{
 const position={x:0,y:0},attack={actor:'tao',source:'hero',walkEntry:3,to:{x:100,y:0},elapsed:.04} as CombatAttack;
 for(const missing of ['cheongun-entry-3-atlas.webp','cheongun-walk-3-atlas.webp','cheongun-cast-3-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(missing),'cheongun-entry-fail-'+missing);
  assert.equal(art.taoCastEntrySpriteAsset(attack,position),null);
  assert.equal(!!art.directionalActionSpriteAsset('tao','windup',position,attack.to),missing.startsWith('cheongun-entry'));
  assert.equal(!!art.directionalLocomotionSpriteAsset('tao',{x:1,y:0},24),missing.startsWith('cheongun-entry'));
  assert.ok(art.directionalActionSpriteAsset('elf','windup',position,attack.to));
 }
});


test('Cheongun preparation remains visible at both published simulation cadences and stops before release',async()=>{
 const {art}=await loadWithImageResults(()=>false,'cheongun-entry-cadence');
 for(const dt of [1/30,2/30]){const seen=new Set();for(let t=0;t<.15;t+=dt){const pose=art.taoCastEntrySpriteAsset({actor:'tao',source:'hero',walkEntry:3,elapsed:t,to:{x:100,y:0}} as CombatAttack,{x:0,y:0});if(pose)seen.add(pose.frame)}assert.ok(seen.has('walk'));assert.ok(seen.has('second-foot'));}
});

test('Cheongun cast recovery follows current aligned gait and joins the next walking sprite',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'cheongun-return');
 for(const source of ['hero','mercenary'] as const)for(let direction=0;direction<8;direction++)for(let walk=0;walk<8;walk++){
  const angle=direction*Math.PI/4,from={x:100,y:100},heading={x:Math.cos(angle),y:Math.sin(angle)},to={x:100+100*heading.x,y:100+100*heading.y};
  const attack={actor:'tao',source,walkEntry:(walk+3)%8,from,to,elapsed:.21,hitAt:.15,duration:.33} as CombatAttack,motion={distance:walk*8,speed:100,heading};
  for(const [elapsed,frame] of [[.21,'hold'],[.224,'hold'],[.225,'release-weight'],[.269,'release-weight'],[.27,'stride-pickup'],[.319,'stride-pickup'],[.32,'walk'],[.329,'walk']] as const){
   const result=art.taoCastReturnSpriteAsset({...attack,elapsed},from,motion)!;assert.equal(result.walk,walk);assert.equal(result.frame,frame);assert.equal(result.direction,direction);
   assert.equal(result.asset.groundY!/result.asset.height,220/256);assert.equal(result.asset.displayScale,1.2*6.8/5.8);
   if(frame==='walk')assert.deepEqual(result.asset,art.directionalLocomotionSpriteAsset('tao',heading,motion.distance));
   else if(frame==='hold')assert.deepEqual(result.asset,art.directionalActionSpriteAsset('tao','strike',from,to));
   else assert.equal(result.asset.viewBox,`${(walk*2+(frame==='release-weight'?0:1))*192} 0 192 192`);
  }
  for(const elapsed of [-1,0,.15,.209,.33,.4,NaN,Infinity])assert.equal(art.taoCastReturnSpriteAsset({...attack,elapsed},from,motion),null);
  assert.equal(art.taoCastReturnSpriteAsset(attack,from,motion,true),null);
  for(const speed of [0,.5,NaN,Infinity])assert.equal(art.taoCastReturnSpriteAsset(attack,from,{...motion,speed}),null);
  assert.equal(art.taoCastReturnSpriteAsset(attack,from,{...motion,heading:{x:-heading.x,y:-heading.y}}),null,'turning shots keep the established pose');
  assert.equal(art.taoCastReturnSpriteAsset(attack,from,{...motion,heading:undefined}),null);
  assert.equal(art.taoCastReturnSpriteAsset({...attack,actor:'dwarf'},from,motion),null);
  const changed=art.taoCastReturnSpriteAsset({...attack,elapsed:.29},from,{...motion,distance:(walk+1)%8*8})!;assert.equal(changed.walk,(walk+1)%8,'gait cannot freeze at attack entry');
 }
 assert.equal(requests.filter(src=>src.includes('/cheongun-return-')).length,8);assert.ok(!requests.some(src=>src.endsWith('.glb')));
});

test('Cheongun return and entry sets fail independently without changing existing release sockets',async()=>{
 const attack={actor:'tao',source:'hero',walkEntry:3,from:{x:0,y:0},to:{x:100,y:0},elapsed:.25,hitAt:.15,duration:.33} as CombatAttack,motion={distance:24,speed:100,heading:{x:1,y:0}};
 for(const missing of ['cheongun-return-3-atlas.webp','cheongun-entry-3-atlas.webp','cheongun-cast-3-atlas.webp','cheongun-walk-3-atlas.webp']){
  const {art}=await loadWithImageResults(src=>src.endsWith(missing),'cheongun-return-fail-'+missing),coreFail=missing.includes('cast')||missing.includes('walk');
  assert.equal(!!art.taoCastReturnSpriteAsset(attack,attack.from,motion),missing.includes('entry'));
  assert.equal(!!art.taoCastEntrySpriteAsset({...attack,elapsed:.04},attack.from),missing.includes('return'));
  assert.equal(!!art.directionalActionSpriteAsset('tao','strike',attack.from,attack.to),!coreFail);
  assert.equal(!!art.taoSealSocket(attack.from,attack.to,84),!coreFail);
  assert.ok(art.hammerSequenceSpriteAsset('dwarf',{...attack,actor:'dwarf'}));
 }
});

test('aligned Cheongun return exposes an intermediate pose across fixed-step 1x and 2x publications',async()=>{
 const {art}=await loadWithImageResults(()=>false,'cheongun-return-cadence');
 const attack={actor:'tao',source:'hero',from:{x:0,y:0},to:{x:100,y:0},hitAt:.15,duration:.33} as CombatAttack;
 // 60Hz simulation: 2/4 ticks are nominal 30Hz at 1x/2x; 6 ticks covers 20Hz at 2x.
 for(const ticksPerPublication of [2,4,6])for(let offset=0;offset<ticksPerPublication;offset++){
  const frames=[];
  for(let tick=offset;tick/60<attack.duration;tick+=ticksPerPublication){const elapsed=tick/60;frames.push(art.taoCastReturnSpriteAsset({...attack,elapsed},attack.from,{speed:230,distance:elapsed*230,heading:{x:1,y:0}})?.frame)}
  assert.ok(frames.some(frame=>frame==='release-weight'||frame==='stride-pickup'),`${ticksPerPublication}/${offset}: ${frames}`);
 }
});

test('stationary Cheongun absorbs recoil, follows with seal hand and robe, and joins ready',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'cheongun-reset');const p={x:200,y:200},motion={speed:0,distance:24,heading:{x:1,y:0}};
 for(const source of ['hero','mercenary'] as const)for(let d=0;d<8;d++){
  const to={x:p.x+100*Math.cos(d*Math.PI/4),y:p.y+100*Math.sin(d*Math.PI/4)},a={actor:'tao',source,from:p,to,elapsed:.25,hitAt:.15,duration:.33} as CombatAttack;
  for(const [elapsed,frame] of [[.21,'hold'],[.224,'hold'],[.225,'recover'],[.269,'recover'],[.27,'settle'],[.319,'settle'],[.32,'ready'],[.329,'ready']] as const){
   const r=art.taoCastResetSpriteAsset({...a,elapsed},p,motion)!;assert.equal(r.direction,d);assert.equal(r.frame,frame);assert.equal(r.asset.displayScale,1.2*6.8/5.8);assert.equal(r.asset.groundY!/r.asset.height,220/256);
   if(frame==='hold')assert.deepEqual(r.asset,art.directionalActionSpriteAsset('tao','strike',p,to));
   else if(frame==='ready')assert.deepEqual(r.asset,art.directionalLocomotionSpriteAsset('tao',{x:to.x-p.x,y:to.y-p.y},null));
   else{assert.equal(r.asset.src,`/defense/models/cheongun-reset-${d}-atlas.webp`);assert.equal(r.asset.viewBox,`${frame==='recover'?0:192} 0 192 192`)}
  }
  for(const elapsed of [-1,.15,.209,.33,NaN,Infinity])assert.equal(art.taoCastResetSpriteAsset({...a,elapsed},p,motion),null);
  for(const speed of [-1,.501,100,NaN,Infinity])assert.equal(art.taoCastResetSpriteAsset(a,p,{...motion,speed}),null);
  assert.ok(art.taoCastResetSpriteAsset(a,p,{...motion,speed:.5}));assert.equal(art.taoCastResetSpriteAsset(a,p,motion,true),null);
  assert.equal(art.taoCastResetSpriteAsset({...a,actor:'dwarf'},p,motion),null);assert.equal(art.taoCastResetSpriteAsset({...a,to:p},p,motion),null);
 }
 assert.equal(requests.filter(s=>s.includes('/cheongun-reset-')).length,8);
});

test('optional stationary recovery fails independently of Cheongun moving return and casts',async()=>{
 const p={x:0,y:0},motion={speed:0,distance:24,heading:{x:1,y:0}},a={actor:'tao',source:'hero',from:p,to:{x:100,y:0},elapsed:.25,hitAt:.15,duration:.33} as CombatAttack;
 for(const missing of ['cheongun-reset-3-atlas.webp','cheongun-cast-3-atlas.webp','cheongun-walk-3-atlas.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(missing),'cheongun-reset-fail-'+missing);assert.equal(art.taoCastResetSpriteAsset(a,p,motion),null);
  if(missing.startsWith('cheongun-reset')){assert.ok(art.directionalActionSpriteAsset('tao','strike',p,a.to));assert.ok(art.taoCastReturnSpriteAsset(a,p,{...motion,speed:100}));}
 }
 const {art}=await loadWithImageResults(s=>s.includes('/cheongun-return-'),'cheongun-return-independent');assert.ok(art.taoCastResetSpriteAsset(a,p,motion));
});

test('stationary Cheongun recovery has an intermediate pose at nominal 1x/2x and 20Hz publications',async()=>{
 const {art}=await loadWithImageResults(()=>false,'cheongun-reset-cadence'),p={x:0,y:0},motion={speed:0,distance:0},a={actor:'tao',source:'hero',from:p,to:{x:100,y:0},hitAt:.15,duration:.33} as CombatAttack;
 for(const ticks of [2,4,6])for(let offset=0;offset<ticks;offset++){
  const frames=[];for(let step=offset;step/60<.33;step+=ticks)frames.push(art.taoCastResetSpriteAsset({...a,elapsed:step/60},p,motion)?.frame);
  assert.ok(frames.some(f=>f==='recover'||f==='settle'),`${ticks}/${offset}: ${frames}`);
 }
});

test('Cheongun stops from the saved gait and heading with common scale, ground and simulation age',async()=>{
 const {art,requests}=await loadWithImageResults(()=>false,'cheongun-stop');
 for(let direction=0;direction<8;direction++)for(let entry=0;entry<8;entry++){
  const heading={x:Math.cos(direction*Math.PI/4),y:Math.sin(direction*Math.PI/4)},motion={distance:entry*8,speed:0,heading:{x:-heading.x,y:-heading.y},settle:{frame:entry,elapsed:0,heading}};
  for(const [elapsed,frame] of [[0,0],[.079,0],[.08,1],[.159,1],[.16,2],[.239,2]]){
   const result=art.taoStopSpriteAsset('tao',{...motion,settle:{...motion.settle,elapsed}})!;
   assert.equal(result.frame,frame);assert.equal(result.entry,entry);assert.equal(result.asset.oriented,true);
   const walk=art.directionalLocomotionSpriteAsset('tao',heading,entry*8)!;assert.equal(result.asset.displayScale,walk.displayScale);
   if(frame===0)assert.deepEqual(result.asset,walk);else{assert.equal(result.asset.src,`/defense/models/cheongun-stop-${direction}-atlas.webp`);assert.equal(result.asset.viewBox,`${(entry*2+frame-1)*192} 0 192 192`);assert.equal(result.asset.groundY!/192,walk.groundY!/256);}
  }
  for(const elapsed of [-1,.24,NaN,Infinity])assert.equal(art.taoStopSpriteAsset('tao',{...motion,settle:{...motion.settle,elapsed}}),null);
  for(const speed of [-1,1,NaN,Infinity])assert.equal(art.taoStopSpriteAsset('tao',{...motion,speed}),null);
  for(const frame of [-1,8,.5,NaN])assert.equal(art.taoStopSpriteAsset('tao',{...motion,settle:{...motion.settle,frame}}),null);
  assert.equal(art.taoStopSpriteAsset('tao',motion,true),null);assert.equal(art.taoStopSpriteAsset('mage',motion),null);
 }
 assert.equal(requests.filter(s=>s.includes('/cheongun-stop-')).length,8);assert.ok(!requests.some(s=>s.endsWith('.glb')));
});

test('Cheongun stop is optional and preserves spell attacks, moving return and walking on failure',async()=>{
 const h={x:1,y:0},motion={distance:24,speed:0,heading:h,settle:{frame:3,elapsed:.1,heading:h}},p={x:0,y:0};
 const a={actor:'tao',source:'hero',from:p,to:h,elapsed:.25,hitAt:.15,duration:.33} as CombatAttack;
 const {art:complete}=await loadWithImageResults(()=>false,'cheongun-stop-complete');
 for(const file of ['cheongun-stop-3-atlas.webp','cheongun-walk-3-atlas.webp','cheongun-cast-3-atlas.webp']){
  const {art}=await loadWithImageResults(s=>s.endsWith(file),'cheongun-stop-fail-'+file);assert.equal(art.taoStopSpriteAsset('tao',motion),null);
  if(file.includes('stop')){
   assert.deepEqual(art.directionalActionSpriteAsset('tao','strike',p,h),complete.directionalActionSpriteAsset('tao','strike',p,h));
   assert.deepEqual(art.taoCastReturnSpriteAsset(a,p,{...motion,speed:100}),complete.taoCastReturnSpriteAsset(a,p,{...motion,speed:100}));
   assert.deepEqual(art.directionalLocomotionSpriteAsset('tao',h,24),complete.directionalLocomotionSpriteAsset('tao',h,24));
  }
 }
 const {art:withoutReturn}=await loadWithImageResults(s=>s.includes('/cheongun-return-'),'cheongun-stop-independent');
 assert.deepEqual(withoutReturn.taoStopSpriteAsset('tao',motion),complete.taoStopSpriteAsset('tao',motion));
});

test('both Cheongun stop steps are published at 1x/2x with every publication offset',async()=>{
 const {art}=await loadWithImageResults(()=>false,'cheongun-stop-cadence'),heading={x:1,y:0};
 for(const ticks of [2,4])for(let offset=0;offset<ticks;offset++){
  const frames=new Set();for(let i=offset;i/60<.24;i+=ticks)frames.add(art.taoStopSpriteAsset('tao',{distance:24,speed:0,settle:{frame:3,heading,elapsed:i/60}})?.frame);
  for(const frame of [1,2])assert.ok(frames.has(frame),`${ticks}/${offset}/${frame}`);
 }
});
