import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gateImpact,GATE_IMPACT_ATLAS } from './gateImpact.ts';
import type { Effect } from './types.ts';
const breach=(id:number,age:number,targetGate:'village'|'outpost'='village'):Effect=>({id,kind:'breach',from:{x:900,y:300},to:{x:900,y:300},element:'physical',age,life:.6-age,maxLife:.6,targetGate,force:1});
test('gate joints follow simulation age and recover without shifting the ground',()=>{
 for(const [age,frame] of [[0,1],[.119,1],[.12,2],[.289,2],[.29,3],[.459,3],[.46,0],[.599,0]])assert.equal(gateImpact([breach(1,age)])?.frame,frame);
 for(const age of [-.1,.6,1,NaN])assert.equal(gateImpact([breach(1,age)]),null);
 assert.equal(gateImpact([{...breach(1,.2),age:undefined}])?.frame,2);
 assert.equal(gateImpact([breach(1,.1)],false,true),null);
});
test('a breach animates only its target gate and restarts one response for a new breach',()=>{
 const effects=[breach(1,.3),breach(3,.05,'outpost'),breach(2,.2)];
 assert.deepEqual(gateImpact(effects),{id:2,frame:2});assert.deepEqual(gateImpact(effects,true),{id:3,frame:1});
 assert.equal(gateImpact([breach(1,.1)],true),null);assert.equal(gateImpact([{...breach(1,.1),kind:'impact'}]),null);
 assert.equal(gateImpact([{...breach(1,.1),targetGate:undefined}]),null,'unscoped legacy effects keep the static gate');
});
test('the impact clip and four poses retain the static gate camera and original source',()=>{
 const read=(p:string)=>readFileSync(new URL('../../../'+p,import.meta.url));
 const manifest=JSON.parse(read('public/defense/models/forest-gate-impact.json').toString()),base=JSON.parse(read('public/defense/models/forest-gate.json').toString());
 assert.deepEqual(manifest.camera,base.camera);assert.deepEqual(manifest.battle,base.battle);assert.equal(manifest.base_source_sha256,base.source_sha256);assert.equal(manifest.duration,.6);assert.deepEqual(manifest.frames,[1,3,7,12]);
 assert.equal(manifest.samples.length,19);assert.equal(manifest.animated_joints.length,5);assert.ok(manifest.fixed_parts>50);
 assert.equal(createHash('sha256').update(read(base.source)).digest('hex'),manifest.base_source_sha256);
 assert.equal(createHash('sha256').update(read(manifest.source)).digest('hex'),manifest.source_sha256);
 for(const file of manifest.files)assert.equal(createHash('sha256').update(read(file.path)).digest('hex'),file.sha256);
 assert.equal(GATE_IMPACT_ATLAS.width,4*512);assert.equal(GATE_IMPACT_ATLAS.height,512);
 const bytes=read('public/defense/models/forest-gate-impact.glb'),glb=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 assert.equal(glb.meshes.length,manifest.runtime_meshes);assert.equal(glb.animations.length,1);assert.equal(glb.animations[0].name,'forest-gate-impact');
 for(const channel of glb.animations[0].channels)assert.ok(glb.nodes[channel.target.node].name.startsWith('Impact / '),'masonry must not inherit a moving track');
});
