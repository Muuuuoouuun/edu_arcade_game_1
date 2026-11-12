import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getPaths, getSlots, getStage } from './data.ts';
import { BRIDGE_FRONT, hasModeledBridge, loadTerrainAsset, terrainAssetPlan } from './terrainAssets.ts';

test('baked terrain paths and high-ground positions match the combat layout in both regions',()=>{
 const layout=JSON.parse(readFileSync(new URL('../../../art-source/defense/terrain-layout.json',import.meta.url),'utf8'));
 const manifest=JSON.parse(readFileSync(new URL('../../../public/defense/terrain/manifest.json',import.meta.url),'utf8'));
 assert.equal(layout.variants.length,4);assert.equal(manifest.variants.length,4);
 for(const entry of layout.variants){
  const stage=getStage(entry.stage);
  const paths=getPaths(entry.stage).slice(0,stage.expanded?2:1);
  assert.deepEqual(entry.paths,paths,'re-bake terrain when enemy routes change');
  assert.deepEqual(entry.highSlots,getSlots(entry.stage).filter(s=>s.unlock<=entry.stage&&s.terrain==='high'));
  const baked=manifest.variants.find((v:{id:string})=>v.id===entry.id);
  assert.ok(baked);
  assert.deepEqual(baked.path_anchors.map((a:{logical:number[]})=>a.logical),paths.flat().map(p=>[p.x,p.y]));
  for(const anchor of baked.path_anchors)for(let i=0;i<2;i++)assert.ok(Math.abs(anchor.logical[i]-anchor.projected[i])<.01,'camera must preserve logical path coordinates');
  const data=readFileSync(new URL(`../../../public/defense/terrain/${baked.file}`,import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'),baked.sha256);
 }
});

test('forest bridge layers keep the same camera and combat anchors in both layouts',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../../public/defense/terrain/bridge-manifest.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.variants.map((v:{id:string})=>v.id),['forest-single','forest-expanded']);
 for(const [i,stage] of [1,4].entries()){
  const variant=manifest.variants[i];
  assert.deepEqual(variant.path_anchors.map((a:{logical:number[]})=>a.logical),getPaths(stage).slice(0,i+1).flat().map(p=>[p.x,p.y]));
  for(const anchor of variant.path_anchors)for(let n=0;n<2;n++)assert.ok(Math.abs(anchor.logical[n]-anchor.projected[n])<.01);
  const data=readFileSync(new URL(`../../../public/defense/terrain/${variant.file}`,import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'),variant.sha256);
 }
 const bridge=manifest.bridge;
 assert.deepEqual(bridge.camera.render,[1800,1200]);assert.equal(bridge.camera.orthographic_scale,900);
 assert.deepEqual(bridge.placement,{x:BRIDGE_FRONT.x,y_offset:BRIDGE_FRONT.yOffset,width:BRIDGE_FRONT.width,height:BRIDGE_FRONT.height,sort_y_offset:BRIDGE_FRONT.sortYOffset});
 for(const file of bridge.files){
  const data=readFileSync(new URL(`../../../public/${file.file}`,import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256);
 }
});


test('bridge cutouts appear only with a complete layer set; failures preserve the old crossing',async()=>{
 for(const stage of [1,4]){
  const plan=terrainAssetPlan(stage);const requests:string[]=[];
  assert.equal(await loadTerrainAsset(stage,async src=>{requests.push(src);return true}),plan.preferred);
  assert.deepEqual(requests.sort(),[plan.preferred,BRIDGE_FRONT.src].sort());
  for(const failed of [plan.preferred,BRIDGE_FRONT.src]){
   const result=await loadTerrainAsset(stage,async src=>src!==failed);
   assert.equal(result,plan.fallback);assert.equal(hasModeledBridge(result),false);
  }
  assert.equal(await loadTerrainAsset(stage,async()=>false),null,'vector terrain remains the final fallback');
 }
 for(const stage of [5,8]){
  const requests:string[]=[];const plan=terrainAssetPlan(stage);
  assert.equal(await loadTerrainAsset(stage,async src=>{requests.push(src);return true}),plan.fallback);
  assert.deepEqual(requests,[plan.fallback],'snow does not request forest geometry');
 }
});

test('a delayed front layer never publishes the new cutout early',async()=>{
 let finish!:(value:boolean)=>void;let published=false;
 const promise=loadTerrainAsset(1,src=>src===BRIDGE_FRONT.src?new Promise(resolve=>{finish=resolve}):Promise.resolve(true)).then(result=>{published=true;return result});
 await Promise.resolve();await Promise.resolve();assert.equal(published,false);
 finish(true);assert.equal(await promise,terrainAssetPlan(1).preferred);
});
