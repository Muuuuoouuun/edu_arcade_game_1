import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Soldier } from './types.ts';
import { advanceShieldMotion, legionShieldWalkFrame, legionShieldWalkAsset, legionShieldDisplayAsset, LEGION_SHIELD_WALK_ATLAS } from './shieldWalk.ts';
import { legionShieldAsset, LEGION_SHIELD_FRAME } from './shieldMotion.ts';
import { SHIELD_WALK_FRAME } from './shieldWalkFrame.ts';
const soldier=(x:number,y=0,id=1):Soldier=>({id,kind:'shield',x,y,hp:100,maxHp:100,home:{x:0,y:0},cooldown:0,skillCooldown:0,hit:0,facing:1});

test('shield gait advances on actual movement only and freezes on repeated frame/pause',()=>{
 let s=advanceShieldMotion(null,0,'wave',[soldier(0)]);
 assert.equal(s.units.get(1)!.moving,false);
 s=advanceShieldMotion(s,.1,'wave',[soldier(3,4)]);
 assert.equal(s.units.get(1)!.distance,5);assert.equal(s.units.get(1)!.moving,true);
 const frozen=advanceShieldMotion(s,.1,'wave',[soldier(3,4)]);
 assert.equal(frozen.units.get(1)!.distance,5);assert.equal(frozen.units.get(1)!.moving,true);
 s=advanceShieldMotion(frozen,.2,'wave',[soldier(3,4)]);
 assert.equal(s.units.get(1)!.distance,5);assert.equal(s.units.get(1)!.moving,false);
 s=advanceShieldMotion(s,.3,'wave',[soldier(6,8)]);
 assert.equal(s.units.get(1)!.distance,10);
});

test('intermission teleport, fresh wave, reset and removed or new units do not add travel',()=>{
 let s=advanceShieldMotion(null,1,'wave',[soldier(0)]);s=advanceShieldMotion(s,2,'wave',[soldier(100)]);
 s=advanceShieldMotion(s,2,'intermission',[soldier(0)]);assert.equal(s.units.get(1)!.distance,0);
 s=advanceShieldMotion(s,2,'wave',[soldier(0),soldier(20,0,2)]);assert.equal(s.units.get(1)!.moving,false);assert.equal(s.units.get(2)!.distance,0);
 s=advanceShieldMotion(s,0,'prep',[soldier(2,0,1)]);assert.equal(s.units.size,1);assert.equal(s.units.get(1)!.distance,0);
});

test('eight walk frames follow measured projected stride; strike and reduced-motion take precedence',()=>{
 const stride=SHIELD_WALK_FRAME.stridePerSize*43;
 for(let i=0;i<8;i++)assert.equal(legionShieldWalkFrame(stride*(i+.1)/8,43),i);
 assert.equal(legionShieldWalkFrame(stride,43),0);
 assert.equal(legionShieldWalkFrame(NaN,43),0);
 const motion={moving:true,distance:stride*.26};
 assert.equal(legionShieldDisplayAsset(null,false,motion,true,43).src,LEGION_SHIELD_WALK_ATLAS);
 assert.deepEqual(legionShieldDisplayAsset(.03,false,motion,true,43),legionShieldAsset(.03,false));
 assert.deepEqual(legionShieldDisplayAsset(null,true,motion,true,43),legionShieldAsset(null,true));
 assert.deepEqual(legionShieldDisplayAsset(null,false,motion,false,43),legionShieldAsset(null,false));
 assert.deepEqual(legionShieldDisplayAsset(null,false,{...motion,moving:false},true,43),legionShieldAsset(null,false));
 assert.equal(legionShieldWalkAsset(0,43).groundY,legionShieldAsset().groundY);
 assert.equal(SHIELD_WALK_FRAME.crop[0]+SHIELD_WALK_FRAME.crop[2]/2,LEGION_SHIELD_FRAME.crop[0]+LEGION_SHIELD_FRAME.crop[2]/2,'walk and bash share the same horizontal model anchor');
 assert.ok(Math.abs(SHIELD_WALK_FRAME.displayScale/Math.max(...SHIELD_WALK_FRAME.crop.slice(2))-LEGION_SHIELD_FRAME.displayScale/Math.max(...LEGION_SHIELD_FRAME.crop.slice(2)))<.00001,'the model retains its scale when actions change');
});

test('editable model, grounded frame crop and delivery hashes agree with walk metadata',()=>{
 const meta=JSON.parse(readFileSync('public/defense/models/legion-shield-walk.json','utf8'));
 assert.equal(meta.clip,'legion-shield-walk');assert.equal(meta.frame.ground_y,SHIELD_WALK_FRAME.groundY);
 assert.deepEqual(meta.frame.crop,SHIELD_WALK_FRAME.crop);
 assert.equal(meta.model_stride,1.36);assert.equal(meta.continuous_checks.samples,81);assert.ok(meta.continuous_checks.max_support_drift<.00001);
 for(const sample of meta.samples){assert.ok(Math.min(...Object.values(sample.feet_min_z as Record<string,number>).map(Math.abs))<.002);}
 assert.equal(createHash('sha256').update(readFileSync(meta.source)).digest('hex'),meta.source_sha256);
 assert.equal(createHash('sha256').update(readFileSync(meta.base_source)).digest('hex'),meta.base_source_sha256);
 for(const file of meta.files)assert.equal(createHash('sha256').update(readFileSync(file.file)).digest('hex'),file.sha256);
 const glb=readFileSync('public/defense/models/legion-shield-walk.glb');
 const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
 assert.ok(gltf.meshes.length>=20&&gltf.animations.some((a:{name:string;channels:unknown[]})=>a.name==='legion-shield-walk'&&a.channels.length>=3));
});
