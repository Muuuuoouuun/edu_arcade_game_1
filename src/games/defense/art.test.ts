import test from 'node:test';
import assert from 'node:assert/strict';

type Art = typeof import('./art.ts');

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
  ['magic','fire','fire-tower',1],['magic','lightning','lightning-tower',1],['crossbow','pierce','piercing-ballista',-1],['cannon','water','water-cannon',-1],
 ] as const){
  const specialized=art.towerSpriteAsset(kind,branch,2),mastered=art.towerSpriteAsset(kind,branch,3);
  assert.equal(specialized?.src,`/defense/models/${id}-game.webp`);
  assert.equal(mastered?.src,`/defense/models/${id}-lv3-game.webp`,'every baked tower has a dedicated Lv.3 render');
  assert.equal(mastered?.nativeFacing??1,facing,'Lv.3 keeps the facing of its base render');
  assert.equal(mastered?.viewBox,specialized?.viewBox,'Lv.3 shares the Lv.2 crop so the ground anchor is unchanged');
  assert.equal(specialized?.nativeFacing??1,facing);
  assert.equal(art.towerSpriteAsset(kind)?.src,'/defense/tower-models.png');
  assert.equal(art.towerSpriteAsset(kind,branch,1)?.src,'/defense/tower-models.png');
 }
 for(const [kind,branch] of [['crossbow','rapid'],['cannon','crush']] as const)
  assert.equal(art.towerSpriteAsset(kind,branch,2)?.src,'/defense/tower-models.png');
 assert.equal(art.spriteAsset(4).src,'/defense/tower-models.png');
 assert.equal(art.spriteAsset(5).src,'/defense/tower-models.png');
 assert.equal(art.spriteAsset(6).src,'/defense/tower-models.png');
 assert.equal(requests.some(src=>src.endsWith('.glb')),false,'the battle loader must not fetch realtime models');
});

test('a failed model image falls back to the same specialization without suppressing other loaded models',async()=>{
 const {art}=await loadWithImageResults(src=>src.endsWith('/water-cannon-game.webp'),'partial-failure');
 const water=art.towerSpriteAsset('cannon','water',2),base=art.towerSpriteAsset('cannon');
 assert.equal(water?.src,'/defense/tower-models.png');
 assert.notEqual(water?.viewBox,base?.viewBox,'the water specialization keeps its own atlas frame');
 assert.equal(art.towerSpriteAsset('magic','fire',2)?.src,'/defense/models/fire-tower-game.webp');
 assert.equal(art.towerSpriteAsset('crossbow','pierce',2)?.src,'/defense/models/piercing-ballista-game.webp');
});

test('a failed Lightning render falls back to the atlas without touching the Fire tower',async()=>{
 const {art}=await loadWithImageResults(src=>src.endsWith('/lightning-tower-game.webp'),'lightning-failure');
 assert.equal(art.towerSpriteAsset('magic','lightning',2)?.src,'/defense/tower-models.png');
 assert.equal(art.towerSpriteAsset('magic','fire',2)?.src,'/defense/models/fire-tower-game.webp');
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
 assert.equal(art.idleSpriteAsset('mage'),null);
 assert.equal(art.idleSpriteAsset('wolf'),null);
 assert.equal(art.actionSpriteAsset('barbarian','strike')?.src,'/defense/melee-motion.png');
 assert.equal(art.actionSpriteAsset('mage','strike')?.src,'/defense/ranged-motion.png');
 assert.equal(art.spriteAsset(0).src,'/defense/atlas.png');
 assert.equal(requests.filter(src=>/\/dwarf-.*-game\.webp$/.test(src)).length,4);
 assert.equal(requests.some(src=>src.endsWith('.glb')),false,'battle must not request articulated realtime models');
});

test('any missing dwarf pose keeps the whole actor on its existing atlas',async()=>{
 for(const missing of ['idle','windup','strike','recover']){
  const {art}=await loadWithImageResults(src=>src.endsWith(`/dwarf-${missing}-game.webp`),`dwarf-missing-${missing}`);
  assert.equal(art.idleSpriteAsset('dwarf'),null);
  assert.equal(art.spriteAsset(2).src,'/defense/atlas.png');
  for(const pose of ['windup','strike','recover'] as const)
   assert.equal(art.actionSpriteAsset('dwarf',pose)?.src,'/defense/melee-motion.png',`${missing} failure keeps ${pose} in the same art style`);
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
  assert.equal(art.actionSpriteAsset('dwarf','strike')?.src,'/defense/melee-motion.png');
  assert.ok(pending.has(last));pending.get(last)!();await preload;
  assert.equal(art.idleSpriteAsset('dwarf')?.src,'/defense/models/dwarf-idle-game.webp');
  assert.equal(art.actionSpriteAsset('dwarf','strike')?.src,'/defense/models/dwarf-strike-game.webp');
 }finally{
  if(previous)Object.defineProperty(globalThis,'Image',previous);else Reflect.deleteProperty(globalThis,'Image');
 }
});
