import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gateModelEligible,gatePlacement,loadGateAsset } from './gateAssets.ts';
import { FOREST_GATE } from './forestGateModel.ts';

test('only the forest verdant gate requests the modeled art, without runtime GLB',async()=>{
 for(const theme of ['verdant','unryeong','steel','twilight'] as const)for(const snow of [false,true]){
  const requests:string[]=[];const result=await loadGateAsset(theme,snow,async src=>{requests.push(src);return true;});
  const eligible=theme==='verdant'&&!snow;
  assert.equal(gateModelEligible(theme,snow),eligible);assert.equal(result,eligible?'modeled':'illustrated');
  assert.deepEqual(requests,[eligible?FOREST_GATE.src:`/defense/gates/${theme}.webp`]);assert.ok(!requests.some(src=>src.endsWith('.glb')));
 }
});

test('model failure uses the same themed illustration, and two failures retain the vector gate',async()=>{
 const requests:string[]=[];
 assert.equal(await loadGateAsset('verdant',false,async src=>{requests.push(src);return src!==FOREST_GATE.src;}),'illustrated');
 assert.deepEqual(requests,[FOREST_GATE.src,'/defense/gates/verdant.webp']);
 assert.equal(await loadGateAsset('verdant',false,async()=>false),'fallback');
 assert.equal(await loadGateAsset('steel',false,async()=>false),'fallback');
});

test('battle anchor and depth threshold come from the same camera and scale for both gates',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../../public/defense/models/forest-gate.json',import.meta.url),'utf8'));
 const [x,y]=manifest.camera.ground_anchor;
 assert.ok(Math.abs(FOREST_GATE.x+x*FOREST_GATE.width/512)<.00001);
 assert.ok(Math.abs(FOREST_GATE.y+y*FOREST_GATE.height/512)<.00001);
 for(const outpost of [false,true]){
  const p=gatePlacement(outpost);assert.equal(p.x,outpost?840:830);assert.equal(p.y,outpost?131:318);
  assert.ok(Math.abs(p.sortY-(outpost?manifest.battle.outpost_sort_y:manifest.battle.sort_y))<.00001);
  assert.ok(p.sortY>p.y,'front footing is nearer than the model origin');
  assert.ok(p.sortY<p.y+12,'the gate cannot hide a unit walking in front of its feet');
 }
 for(const file of manifest.files){
  const bytes=readFileSync(new URL('../../../'+file.file,import.meta.url));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
 }
 const source=readFileSync(new URL('../../../'+manifest.source,import.meta.url));assert.equal(createHash('sha256').update(source).digest('hex'),manifest.source_sha256);
 const glb=readFileSync(new URL('../../../public/defense/models/forest-gate.glb',import.meta.url));assert.equal(glb.toString('ascii',0,4),'glTF');assert.equal(glb.readUInt32LE(4),2);
 const model=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));assert.ok(model.meshes.length>=8&&model.meshes.length<=12);assert.ok(!model.animations?.length,'static architecture must not claim a motion clip');
});
