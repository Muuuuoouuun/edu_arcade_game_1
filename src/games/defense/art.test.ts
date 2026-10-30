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
  ['magic','fire','fire-tower',1],['crossbow','pierce','piercing-ballista',-1],['cannon','water','water-cannon',-1],
 ] as const){
  const specialized=art.towerSpriteAsset(kind,branch,2),mastered=art.towerSpriteAsset(kind,branch,3);
  assert.equal(specialized?.src,`/defense/models/${id}-game.webp`);
  assert.equal(mastered?.src,specialized?.src);
  assert.equal(specialized?.nativeFacing??1,facing);
  assert.equal(art.towerSpriteAsset(kind)?.src,'/defense/tower-models.png');
  assert.equal(art.towerSpriteAsset(kind,branch,1)?.src,'/defense/tower-models.png');
 }
 for(const [kind,branch] of [['magic','lightning'],['crossbow','rapid'],['cannon','crush']] as const)
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

test('failed optional art leaves the original tower sprites usable',async()=>{
 const {art}=await loadWithImageResults(()=>true,'all-failed');
 assert.equal(art.towerSpriteAsset('magic','fire',2),null);
 assert.equal(art.towerSpriteAsset('crossbow','pierce',2),null);
 assert.equal(art.towerSpriteAsset('cannon','water',2),null);
 for(const index of [4,5,6])assert.equal(art.spriteAsset(index).src,'/defense/atlas.png');
});
