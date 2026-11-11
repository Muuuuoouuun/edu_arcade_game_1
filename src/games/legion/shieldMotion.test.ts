import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { actLegion, createLegion, stepLegion } from './engine.ts';
import { WAVE_TOTALS } from './data.ts';
import { LEGION_SHIELD_ATLAS, LEGION_SHIELD_FRAME, legionShieldAsset, legionShieldFrame } from './shieldMotion.ts';
import type { Monster } from './types.ts';

test('shield contact begins at the actual hit, then recoils and rests on simulation time',()=>{
  assert.equal(legionShieldFrame(null,false),0);
  assert.equal(legionShieldFrame(0,false),1);
  assert.equal(legionShieldFrame(.099,false),1);
  assert.equal(legionShieldFrame(.10,false),2);
  assert.equal(legionShieldFrame(.22,false),0);
  for(const time of [0,.1,.3,NaN])assert.equal(legionShieldFrame(time,true),0);
  assert.equal(legionShieldAsset(0).src,LEGION_SHIELD_ATLAS);
  assert.equal(legionShieldAsset(0).groundY,legionShieldAsset().groundY);
});

test('shield animation follows its own damage event even when several soldiers strike together',()=>{
  const deployed=actLegion(createLegion(),{type:'deploy',kind:'shield',point:{x:1050,y:450}});
  const enemy:Monster={id:999,kind:'sprout',hp:1000,maxHp:1000,x:1020,y:450,lane:1,progress:960,cooldown:0,hit:0,slow:0,facing:1};
  const state={...deployed,phase:'wave' as const,wave:1,spawned:WAVE_TOTALS[0],spawnClock:100,enemies:[enemy]};
  const hit=stepLegion(state,1/60);
  assert.ok(hit.enemies[0].hp<enemy.hp,'damage still happens in the same step');
  const attacks=hit.effects.filter(e=>e.kind==='slash'&&e.sourceId!==undefined);
  assert.deepEqual(new Set(attacks.map(e=>e.sourceId)),new Set(deployed.units.map(u=>u.id)));
  assert.ok(attacks.every(e=>legionShieldFrame(e.age,false)===1));
  let next=hit;for(let i=0;i<7;i++)next=stepLegion(next,1/60);
  assert.ok(next.effects.filter(e=>e.sourceId!==undefined).every(e=>legionShieldFrame(e.age,false)===2));
  assert.ok(attacks.every(e=>e.age===0),'earlier paused state is immutable');
});

test('editable 3D source, animated GLB and runtime crop match the generated metadata',()=>{
  const root=new URL('../../../',import.meta.url);
  const read=(path:string)=>readFileSync(new URL(path,root));
  const metadata=JSON.parse(read('public/defense/models/legion-shield.json').toString());
  assert.deepEqual(metadata.frame.crop,[...LEGION_SHIELD_FRAME.crop]);
  assert.equal(metadata.frame.ground[1],LEGION_SHIELD_FRAME.groundY);
  assert.equal(metadata.frame.display_scale,LEGION_SHIELD_FRAME.displayScale);
  assert.equal(read(metadata.source).subarray(0,7).toString(),'BLENDER');
  for(const file of metadata.files){const content=read(`public/defense/models/${file.file}`);assert.equal(createHash('sha256').update(content).digest('hex'),file.sha256);}
  const glb=read('public/defense/models/legion-shield.glb');
  const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
  const clip=gltf.animations.find((animation:{name:string})=>animation.name==='legion-shield-bash');
  assert.ok(gltf.meshes.length>=20&&clip.channels.length>=3,'real meshes and articulated clip');
});
