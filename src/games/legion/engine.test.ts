import assert from 'node:assert/strict';
import test from 'node:test';
import { actLegion, createLegion, deploymentIssue, inDeployment, stepLegion } from './engine.ts';
import { DEPLOY, MAX_ENEMIES, MONSTER_DEFS, POPULATION_CAP, UNIT_DEFS, WAVE_TOTALS } from './data.ts';
import type { LegionState, Monster, Point, UnitKind } from './types.ts';
import { legionWolfFrame, LEGION_WOLF_SIZE } from './wolfMotion.ts';

const deploy=(s:LegionState,kind:UnitKind,x=1050,y=450)=>actLegion(s,{type:'deploy',kind,point:{x,y}});
function monster(id=1000,overrides:Partial<Monster>={}):Monster {return {id,kind:'sprout',hp:64,maxHp:64,x:1020,y:450,lane:1,progress:960,cooldown:0,hit:0,slow:0,facing:1,...overrides};}
function combat(s:LegionState,enemies:Monster[]):LegionState {return {...s,phase:'wave',wave:1,spawned:WAVE_TOTALS[0],spawnClock:100,enemies};}
function run(s:LegionState,seconds:number){for(let i=0;i<seconds*60;i++)s=stepLegion(s,1/60);return s;}

test('deployment validates the whole footprint, coordinates, funds and unit kinds without mutation',()=>{
  const initial=createLegion(),snapshot=structuredClone(initial);
  for(const point of [{x:NaN,y:450},{x:1000,y:Infinity},{x:DEPLOY.left-1,y:450},{x:1050,y:DEPLOY.top}]){
    assert.equal(actLegion(initial,{type:'deploy',kind:'archer',point}),initial);
  }
  assert.equal(actLegion(initial,{type:'deploy',kind:'__proto__' as UnitKind,point:{x:1000,y:450}}),initial);
  const next=deploy(initial,'shield');
  assert.deepEqual(initial,snapshot);
  assert.equal(next.units.length,3);assert.equal(next.coins,500);
  assert.ok(next.units.every(u=>inDeployment(u.home)));
  assert.equal(deploy(next,'mage'),next,'overlapping footprints rejected');
  const poor={...initial,coins:99};assert.equal(deploy(poor,'shield'),poor);
});

test('reinforcement respects reserved homes after melee soldiers leave their formation',()=>{
  const ready=deploy(createLegion(),'shield',1050,450);
  const moving:LegionState={...ready,phase:'wave',wave:1,units:ready.units.map(u=>({...u,x:950}))};
  const snapshot=structuredClone(moving);
  assert.equal(deploy(moving,'archer',1050,450),moving,'vacated homes remain reserved for return');
  assert.equal(deploy(moving,'archer',950,450),moving,'occupied current positions are also protected');
  const separate=deploy(moving,'archer',1180,450);
  assert.equal(separate.units.length,6);assert.equal(separate.coins,moving.coins-90);
  assert.deepEqual(moving,snapshot);
});

test('population cap is enforced for a whole squad; removal refunds each living soldier once',()=>{
  let s={...createLegion(),coins:10000};
  for(let row=0;row<3;row++)for(let col=0;col<8;col++)s=deploy(s,'beast',930+col*48,260+row*140);
  assert.equal(s.units.length,POPULATION_CAP);
  assert.equal(deploy(s,'beast',1100,650),s);
  const removed=actLegion(s,{type:'remove',id:s.units[0].id});
  assert.equal(removed.coins,s.coins+140);assert.equal(removed.units.length,23);
  assert.equal(actLegion(removed,{type:'remove',id:s.units[0].id}),removed);
  const squad=deploy(createLegion(),'shield');
  let recovered=squad;
  for(const unit of squad.units)recovered=actLegion(recovered,{type:'remove',id:unit.id});
  assert.equal(recovered.coins,599,'rounded individual refunds cannot inflate 100-cost squad');
  const live={...squad,phase:'wave' as const};assert.equal(actLegion(live,{type:'remove',id:live.units[0].id}),live);
});

test('empty armies cannot start; start does not skip waves or run twice',()=>{
  const empty=createLegion();assert.equal(actLegion(empty,{type:'start'}),empty);
  const ready=deploy(empty,'archer'),started=actLegion(ready,{type:'start'});
  assert.equal(started.phase,'wave');assert.equal(started.wave,1);
  assert.equal(actLegion(started,{type:'start'}),started);
  assert.equal(ready.phase,'prep');
});

test('soldiers attack and monsters retaliate automatically with no control action',()=>{
  const initial=combat(deploy(createLegion(),'beast'),[monster(1000,{hp:2000,maxHp:2000})]);
  const next=stepLegion(initial,1/60);
  assert.ok(next.enemies[0].hp<initial.enemies[0].hp);
  assert.ok(next.units[0].hp<initial.units[0].hp);
  assert.ok(next.effects.some(e=>e.kind==='slash'));
  assert.equal(initial.enemies[0].hp,2000);
});

test('wolf stops its distance-driven gait while striking, without delaying combat damage',()=>{
  const ready=deploy(createLegion(),'beast');
  const initial=combat(ready,[monster(1000,{kind:'frostwolf',hp:1000,maxHp:1000})]);
  const after=stepLegion(initial,1/60);
  assert.equal(after.enemies[0].progress,initial.enemies[0].progress);
  assert.equal(legionWolfFrame(after.enemies[0].progress,LEGION_WOLF_SIZE,false),legionWolfFrame(initial.enemies[0].progress,LEGION_WOLF_SIZE,false));
  assert.equal(after.units[0].hp,initial.units[0].hp-MONSTER_DEFS.frostwolf.damage);
  assert.ok(after.effects.some(e=>e.kind==='slash'&&e.from.x===initial.enemies[0].x));
  const recovered=run(after,.2);
  assert.equal(recovered.enemies[0].progress,initial.enemies[0].progress);
  assert.equal(legionWolfFrame(recovered.enemies[0].progress,LEGION_WOLF_SIZE,false),legionWolfFrame(initial.enemies[0].progress,LEGION_WOLF_SIZE,false));
});

test('automatic special attacks affect a group and track fire versus physical death',()=>{
  const ready=deploy(createLegion(),'mage',1150,450);ready.units.forEach(u=>u.skillCooldown=0);
  const next=stepLegion(combat(ready,[monster(1000,{x:1090,y:450,hp:1}),monster(1001,{x:1095,y:465,hp:1})]),1/60);
  assert.equal(next.kills,2);assert.ok(next.effects.some(e=>e.kind==='burst'));
  assert.ok(next.effects.filter(e=>e.kind==='death').every(e=>e.material==='wood'&&e.color==='#f2ab57'));
  const physical=stepLegion(combat(deploy(createLegion(),'beast'),[monster(2000,{hp:1})]),1/60);
  assert.ok(physical.effects.some(e=>e.kind==='death'&&e.material==='wood'&&e.color==='#99704a'));
});

test('each enemy death pays once; a defeated attacker cannot damage its target',()=>{
  const initial=combat(deploy(createLegion(),'beast'),[monster(1000,{hp:1})]);
  const next=stepLegion(initial,1/60);
  assert.equal(next.kills,1);assert.equal(next.coins,initial.coins+MONSTER_DEFS.sprout.bounty+120);
  assert.equal(next.units[0].hp,next.units[0].maxHp);
  const later=run(next,2);assert.equal(later.coins,next.coins);assert.equal(later.kills,1);
  assert.equal(later.effects.length,0);
});

test('all three lanes spawn; population cap delays rather than discards scheduled enemies',()=>{
  let s=actLegion(deploy(createLegion(),'archer'),{type:'start'});s=run(s,1);
  assert.equal(new Set(s.enemies.map(e=>e.lane)).size,3);
  const capped:LegionState={...createLegion(),phase:'wave',wave:4,spawned:80,spawnClock:0,enemies:Array.from({length:80},(_,i)=>monster(1000+i,{x:60,y:450,progress:0,lane:i%3}))};
  const tick=stepLegion(capped,1/60);assert.equal(tick.spawned,80);assert.equal(tick.enemies.length,MAX_ENEMIES);
  const freed=stepLegion({...tick,enemies:tick.enemies.slice(1)},1/60);
  assert.equal(freed.spawned,81);assert.equal(freed.enemies.length,MAX_ENEMIES);
});

test('leaks hurt the village; boss escape loses immediately; terminal effects expire without rewards or simulation',()=>{
  const leaked=stepLegion(combat(createLegion(),[monster(1000,{progress:99999})]),1/60);
  assert.equal(leaked.hp,19);assert.equal(leaked.kills,0);
  const lost=stepLegion({...combat(createLegion(),[monster(1000,{kind:'boss',progress:99999,hp:2600,maxHp:2600})]),wave:4,spawned:96},1/60);
  assert.equal(lost.phase,'lost');assert.equal(lost.hp,0);
  const later=run(lost,2);assert.equal(later.effects.length,0);assert.equal(later.time,lost.time);assert.equal(later.coins,lost.coins);assert.equal(later.kills,lost.kills);
  assert.equal(deploy(later,'archer'),later);assert.equal(stepLegion(later,1/60),later);
});

test('preparation and intermission age effects without consuming battle time or running combat',()=>{
  const empty=createLegion();assert.equal(stepLegion(empty,.05),empty);
  const deployed=deploy(empty,'archer');const next=stepLegion(deployed,.05);
  assert.equal(next.time,deployed.time);assert.equal(next.coins,deployed.coins);
  assert.equal(next.effects[0].age,.05);assert.equal(deployed.effects[0].age,0);
  const quiet=run(next,2);assert.equal(quiet.effects.length,0);assert.equal(quiet.time,0);
  const between:LegionState={...deployed,phase:'intermission',time:30,wave:1};
  const later=run(between,2);assert.equal(later.time,30);assert.equal(later.wave,1);assert.deepEqual(later.units,between.units);
});

test('nonfinite/negative time is rejected and oversized steps cannot jump the simulation',()=>{
  const s=actLegion(deploy(createLegion(),'archer'),{type:'start'});
  for(const dt of [NaN,Infinity,-1,0])assert.equal(stepLegion(s,dt),s);
  const next=stepLegion(s,100);assert.equal(next.time,.05);
  assert.ok(next.effects.length<=96);
});

const plan:[UnitKind,number,number][]=[['shield',970,350],['archer',1140,450],['mage',1230,445],['beast',1040,450],['shield',970,535],['archer',1140,320],['mage',1240,580],['beast',1050,590],['archer',1140,610],['beast',1010,260],['archer',1220,265]];
function fill(s:LegionState){for(const [kind,x,y] of plan)s=deploy(s,kind,x,y);return s;}
test('four-wave deterministic campaign is winnable by mixed formation and between-wave reinforcement',()=>{
  let s=actLegion(fill(createLegion()),{type:'start'}),peak=0,previousWave=0;
  const kinds=new Set(s.units.map(u=>u.kind));assert.equal(kinds.size,4);
  for(let i=0;i<60*240&&s.phase!=='won'&&s.phase!=='lost';i++){
    s=stepLegion(s,1/60);peak=Math.max(peak,s.enemies.length);
    assert.ok(s.effects.length<=96);assert.ok(s.units.length<=POPULATION_CAP);assert.ok(s.enemies.length<=MAX_ENEMIES);
    if(s.phase==='intermission'){
      assert.equal(s.wave,previousWave+1);previousWave=s.wave;
      assert.ok(s.units.every(u=>u.x===u.home.x&&u.y===u.home.y));
      s=actLegion(fill(s),{type:'start'});
    }
  }
  assert.equal(s.phase,'won');assert.equal(s.wave,4);assert.equal(s.kills,WAVE_TOTALS.reduce((a,b)=>a+b,0));assert.equal(s.hp,20);
  assert.ok(peak>=60,'large late-wave swarm is actually simulated');
});

test('a single unsupported mage cannot win the first horde',()=>{
  let s=actLegion(deploy(createLegion(),'mage',1270,450),{type:'start'});
  s=run(s,90);assert.equal(s.phase,'lost');assert.equal(s.hp,0);
});
