import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getPaths, getSlots, getStage } from './data.ts';

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
