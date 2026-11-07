import test from 'node:test';
import assert from 'node:assert/strict';
import { actDefense, createDefense, positionOnPath, stepDefense, waveSize } from './engine.ts';
import { advanceEnemyGait, advanceLocomotion, advanceMageLocomotion, advancePetLocomotion, petStride, petWalkFrame, enemyWalkFrame, movementFacing, walkFrame } from './locomotion.ts';

test('walking distance measures actual displacement and stops at the destination without mutating prior frames', () => {
  const initial = createDefense(1, 'dwarf');
  let state = actDefense(initial, { type: 'move', point: { x: 600, y: 355 } });
  for (let i = 0; i < 180; i++) state = stepDefense(state, 1 / 60);
  assert.deepEqual(state.heroPosition, { x: 600, y: 355 });
  assert.ok(Math.abs(state.locomotion.hero.distance - 160) < .001);
  assert.equal(state.locomotion.hero.speed, 0);
  assert.equal(initial.locomotion.hero.distance, 0);
  assert.equal(stepDefense(state, 1 / 60), state);
});

test('pause preserves travel and a dash does not advance the walking cycle', () => {
  let state = actDefense(createDefense(1, 'dwarf'), { type: 'start-wave' });
  state = actDefense(state, { type: 'move', point: { x: 550, y: 355 } });
  state = stepDefense(state, .05);
  const paused = actDefense(state, { type: 'pause' });
  assert.equal(stepDefense(paused, .1), paused);
  const travel = state.locomotion.hero.distance;
  state = actDefense(state, { type: 'dash', point: { x: 700, y: 355 } });
  assert.ok(state.dashTime > 0);
  state = stepDefense(state, .05);
  assert.equal(state.locomotion.hero.distance, travel);
  assert.equal(state.locomotion.hero.speed, 0);
});

test('companions settle at clamped follow destinations without walking forever at map edges', () => {
  let state = actDefense(createDefense(1, 'druid'), { type: 'hire', hero: 'dwarf' });
  state = actDefense(state, { type: 'move', point: { x: 850, y: 555 } });
  for (let i = 0; i < 300; i++) state = stepDefense(state, 1 / 60);
  assert.deepEqual(state.mercenaryPosition, { x: 875, y: 565 });
  assert.ok(state.locomotion.mercenary.distance > 0);
  assert.ok(state.locomotion.pet.distance > 0);
  assert.equal(state.locomotion.mercenary.speed, 0);
  assert.equal(state.locomotion.pet.speed, 0);
});

test('walk phase depends on distance rather than sampling rate, and vertical drift keeps facing stable', () => {
  const origin = { x: 0, y: 0 };
  const once = advanceLocomotion({ distance: 0, speed: 0 }, origin, { x: 32, y: 0 }, .1, true);
  let split = { distance: 0, speed: 0 };
  for (let i = 0; i < 4; i++) split = advanceLocomotion(split, { x: i * 8, y: 0 }, { x: (i + 1) * 8, y: 0 }, .025, true);
  assert.deepEqual(split, once);
  assert.equal(walkFrame(split.distance), 4);
  assert.equal(movementFacing(-1, origin, { x: .1, y: 5 }), -1);
  assert.equal(movementFacing(1, origin, { x: -.1, y: 5 }), 1);
  assert.equal(movementFacing(-1, origin, { x: 2, y: 2 }), 1);
  assert.equal(movementFacing(1, origin, { x: -2, y: 2 }), -1);
});

test('enemy gait follows forward travel, never rewinds under an impulse and wraps after one stride', () => {
 assert.deepEqual(advanceEnemyGait(12,100,105,.1,false),{distance:17,speed:50});
 assert.deepEqual(advanceEnemyGait(12,100,95,.1,true),{distance:12,speed:0});
 assert.deepEqual(advanceEnemyGait(12,100,102,.1,true),{distance:12,speed:0},'bracing has priority even when forward movement wins');
 assert.deepEqual(advanceEnemyGait(12,100,100,.1,false),{distance:12,speed:0});
 assert.equal(enemyWalkFrame('wood',52),enemyWalkFrame('wood',0));
 assert.equal(new Set(Array.from({length:8},(_,i)=>enemyWalkFrame('wood',i*6.5))).size,8);
});

test('enemy feet slow with movement, pause with battle and face the road while knocked backwards', () => {
 const initial=createDefense(1,'mage');
 const state={...initial,phase:'wave' as const,wave:1,spawned:waveSize(1,1),spawnTimer:99,heroCooldown:99,
  enemies:[{id:1,kind:'wood' as const,...positionOnPath(0,70),hp:155,maxHp:155,progress:70,path:0,speed:28,wet:0,burn:0,slow:0,hit:0,walkDistance:12,facing:1 as const}]};
 const normal=stepDefense(state,.1),slow=stepDefense({...state,enemies:state.enemies.map(e=>({...e,slow:2}))},.1);
 assert.ok(Math.abs((slow.enemies[0].walkDistance!-12)/(normal.enemies[0].walkDistance!-12)-.55)<.0001);
 assert.equal(state.enemies[0].walkDistance,12,'previous state stays immutable');
 const paused=actDefense(normal,{type:'pause'});assert.equal(stepDefense(paused,.1),paused);
 const knocked=stepDefense({...state,enemies:state.enemies.map(e=>({...e,knockVelocity:150}))},.1).enemies[0];
 assert.ok(knocked.progress<70);assert.equal(knocked.facing,1);assert.equal(knocked.walkDistance,12);assert.equal(knocked.walkSpeed,0);
 const split=stepDefense(stepDefense(state,.05),.05);
 assert.ok(Math.abs(split.enemies[0].walkDistance!-normal.enemies[0].walkDistance!)<1e-9,'render cadence cannot change travelled distance');
});

test('direction follows actual travel and persists at a stop without changing the prior state',()=>{
 const previous={distance:12,speed:0,heading:{x:1,y:0}};
 const north=advanceLocomotion(previous,{x:20,y:20},{x:20,y:12},.1,true);
 assert.deepEqual(north.heading,{x:0,y:-1});
 const stop=advanceLocomotion(north,{x:20,y:12},{x:20,y:12},.1,false);
 assert.deepEqual(stop.heading,north.heading);assert.equal(stop.speed,0);
 assert.deepEqual(previous,{distance:12,speed:0,heading:{x:1,y:0}});
});

test('Bron keeps the last attack direction after recovery while stationary and changes it on travel',()=>{
 const initial=createDefense(1,'dwarf');
 const position={x:440,y:355};
 let state={...initial,phase:'wave' as const,wave:1,spawned:waveSize(1,1),spawnTimer:99,
  enemies:[{id:1,kind:'wood' as const,x:440,y:325,hp:1000,maxHp:1000,progress:0,path:0,speed:0,wet:0,burn:0,slow:0,hit:0}],heroPosition:position,heroTarget:position};
 // Enemy movement follows its path before targeting. Put the hero directly below that path point.
 state.heroPosition={x:90,y:210};state.heroTarget={...state.heroPosition};
 state.enemies[0]={...state.enemies[0],...positionOnPath(0,90),progress:90};
 const attacked=stepDefense(state,.01);
 assert.ok(attacked.attacks.some(a=>a.source==='hero'));
 assert.ok(attacked.locomotion.hero.heading!.y<-.9);
 assert.equal(initial.locomotion.hero.heading,undefined);
 let retargeted={...attacked,enemies:attacked.enemies.map(e=>({...e,progress:170}))};
 for(let i=0;i<3;i++)retargeted=stepDefense(retargeted,.1);
 const finalAttack=retargeted.attacks.find(a=>a.source==='hero')!;
 assert.ok(finalAttack.fired);
 const heading=retargeted.locomotion.hero.heading!,dx=finalAttack.to.x-finalAttack.from.x,dy=finalAttack.to.y-finalAttack.from.y;
 assert.ok(Math.abs(heading.x-dx/Math.hypot(dx,dy))<1e-8,'release updates the final direction when the target moved');
 const prior=JSON.stringify(attacked.locomotion);
 let recovered:typeof attacked={...retargeted,enemies:[],heroCooldown:99};
 for(let i=0;i<60;i++)recovered=stepDefense(recovered,.02);
 assert.deepEqual(recovered.locomotion.hero.heading,retargeted.locomotion.hero.heading);
 assert.equal(JSON.stringify(attacked.locomotion),prior);
 const moved=stepDefense(actDefense(recovered,{type:'move',point:{x:200,y:210}}),.1);
 assert.ok(moved.locomotion.hero.heading!.x>.9);
});

test('companion stride integrates actual travel across turns without rephasing old travel',()=>{
 const east={x:1,y:0},south={x:0,y:1},start={distance:0,speed:0};
 const a=advancePetLocomotion(start,{x:0,y:0},{x:petStride(east)/4,y:0},.1);
 assert.ok(Math.abs(a.gaitCycles!-.25)<1e-9);assert.equal(petWalkFrame(east,a.distance,73,a.gaitCycles),2);
 const b=advancePetLocomotion(a,{x:10,y:10},{x:10,y:10+petStride(south)/4},.1);
 assert.ok(Math.abs(b.gaitCycles!-.5)<1e-9);assert.equal(petWalkFrame(south,b.distance,73,b.gaitCycles),4);
 let split:ReturnType<typeof advancePetLocomotion>=start;
 for(let i=0;i<8;i++)split=advancePetLocomotion(split,{x:i*petStride(east)/8,y:0},{x:(i+1)*petStride(east)/8,y:0},.0125);
 const once=advancePetLocomotion(start,{x:0,y:0},{x:petStride(east),y:0},.1);
 assert.ok(Math.abs(split.gaitCycles!-once.gaitCycles!)<1e-9);assert.equal(petWalkFrame(east,split.distance,73,split.gaitCycles),0);
 const stop=advancePetLocomotion(b,{x:10,y:10},{x:10,y:10},.1);assert.equal(stop.gaitCycles,b.gaitCycles);assert.equal(stop.speed,0);assert.deepEqual(start,{distance:0,speed:0});
 for(const size of [73,91.25])for(let d=0;d<8;d++){
  const heading={x:Math.cos(d*Math.PI/4),y:Math.sin(d*Math.PI/4)},stride=petStride(heading,size);
  for(let frame=0;frame<8;frame++){assert.equal(petWalkFrame(heading,stride*frame/8,size),frame);assert.equal(petWalkFrame(heading,0,size,frame/8*size/73),frame);}
 }
 assert.equal(petWalkFrame(east,NaN),0);assert.equal(petWalkFrame(east,1,0),0);assert.equal(petWalkFrame({x:0,y:0},10),0);
});

test('companion gait freezes with the battle and follows equal travel at either simulation speed',()=>{
 const initial=actDefense(createDefense(1,'druid'),{type:'move',point:{x:800,y:355}});
 let once=initial,twice=actDefense(initial,{type:'speed'});
 for(let i=0;i<10;i++)once=stepDefense(once,1/60);
 // The UI applies 2x by issuing two fixed steps per publication.
 for(let i=0;i<5;i++)for(let step=0;step<2;step++)twice=stepDefense(twice,1/60);
 assert.ok(Math.abs(once.locomotion.pet.distance-twice.locomotion.pet.distance)<1e-7);
 assert.ok(Math.abs(once.locomotion.pet.gaitCycles!-twice.locomotion.pet.gaitCycles!)<1e-7);
 const paused=actDefense(once,{type:'pause'});assert.equal(stepDefense(paused,.1),paused);assert.equal(initial.locomotion.pet.gaitCycles,undefined);
});


test('Ian settles from every last simulated walk phase, preserves support heading, and yields to movement or dash',()=>{
 const point={x:80,y:90};
 for(let frame=0;frame<8;frame++){
  const prior={distance:frame*8+1,speed:120,heading:{x:0,y:-1}};
  const stopped=advanceMageLocomotion(prior,point,point,.02,false);
  assert.deepEqual(stopped.settle,{frame,elapsed:0,heading:prior.heading});assert.equal(stopped.distance,prior.distance);
  const midway=advanceMageLocomotion(stopped,point,point,.08,false);assert.equal(midway.settle?.elapsed,.08);
  assert.equal(advanceMageLocomotion(midway,point,point,.16,false).settle,undefined);
  assert.equal(advanceMageLocomotion(midway,point,{x:81,y:90},.02,true).settle,undefined);
  assert.equal(advanceMageLocomotion(midway,point,point,.02,false,true).settle,undefined);
  assert.equal(stopped.settle?.elapsed,0,'immutable prior state');
 }
});

test('Ian stop finishes in preparation and combat, freezes on pause, and resets with a fresh run',()=>{
 for(const combat of [false,true]){
  let state=createDefense(1,'mage');if(combat)state=actDefense(state,{type:'start-wave'});
  state=actDefense(state,{type:'move',point:{x:480,y:355}});
  for(let i=0;i<300&&!state.locomotion.hero.settle;i++)state=stepDefense(state,1/60);
  assert.ok(state.locomotion.hero.settle,`stop triggered ${combat}`);
  const position={...state.heroPosition},paused=actDefense(state,{type:'pause'});
  assert.equal(stepDefense(paused,.1),paused);
  for(let i=0;i<20;i++)state=stepDefense(state,1/60);
  assert.equal(state.locomotion.hero.settle,undefined);assert.deepEqual(state.heroPosition,position);
  assert.equal(createDefense(1,'mage').locomotion.hero.settle,undefined);
 }
});

test('frost wolf stride keeps contact cadence through turns, mobile scaling and knockback',async()=>{
 const {frostWolfStride,frostWolfWalkFrame,advanceFrostWolfGait}=await import('./locomotion.ts');
 const east={x:1,y:0},south={x:0,y:1},origin={x:0,y:0};
 const a=advanceFrostWolfGait(0,undefined,origin,east,frostWolfStride(east)/4);
 const b=advanceFrostWolfGait(a.walkCycles,a.walkHeading,origin,south,frostWolfStride(south)/4);
 assert.ok(Math.abs(b.walkCycles-.5)<1e-9);assert.deepEqual(b.walkHeading,south);
 assert.equal(frostWolfWalkFrame(south,0,73,b.walkCycles),4);
 assert.deepEqual(advanceFrostWolfGait(b.walkCycles,b.walkHeading,origin,{x:-5,y:0},0),b,'impulses preserve gait and heading');
 let cycles=0;for(let i=0;i<8;i++)cycles=advanceFrostWolfGait(cycles,east,origin,east,frostWolfStride(east)/8).walkCycles;
 assert.ok(Math.abs(cycles-1)<1e-9);
 for(const size of [73,91.25])for(let d=0;d<8;d++){
  const heading={x:Math.cos(d*Math.PI/4),y:Math.sin(d*Math.PI/4)},stride=frostWolfStride(heading,size);
  for(let frame=0;frame<8;frame++){assert.equal(frostWolfWalkFrame(heading,stride*frame/8,size),frame);assert.equal(frostWolfWalkFrame(heading,0,size,frame/8*size/73),frame);}
 }
 assert.equal(frostWolfWalkFrame(east,NaN),0);assert.equal(frostWolfWalkFrame(east,1,0),0);assert.equal(frostWolfWalkFrame(origin,1),0);
});

test('frost wolf engine gait is immutable, slows with travel and pauses with simulation',()=>{
 const initial=createDefense(5,'mage'),progress=60,enemy={id:1,kind:'frostwolf' as const,...positionOnPath(0,progress,5),hp:1000,maxHp:1000,progress,path:0,speed:62,wet:0,burn:0,slow:0,hit:0,walkDistance:12,walkCycles:.4,walkHeading:{x:1,y:0},facing:1 as const};
 const state={...initial,phase:'wave' as const,wave:1,spawned:waveSize(5,1),spawnTimer:99,heroCooldown:99,enemies:[enemy]};
 const normal=stepDefense(state,.1),slow=stepDefense({...state,enemies:[{...enemy,slow:2}]},.1);
 assert.ok(Math.abs((slow.enemies[0].walkCycles!-.4)/(normal.enemies[0].walkCycles!-.4)-.55)<1e-6);
 assert.equal(enemy.walkCycles,.4);assert.deepEqual(enemy.walkHeading,{x:1,y:0});
 const knocked=stepDefense({...state,enemies:[{...enemy,knockVelocity:150}]},.1).enemies[0];assert.equal(knocked.walkCycles,.4);assert.deepEqual(knocked.walkHeading,enemy.walkHeading);
 const paused=actDefense(normal,{type:'pause'});assert.equal(stepDefense(paused,.1),paused);
 const split=stepDefense(stepDefense(state,.05),.05);assert.ok(Math.abs(split.enemies[0].walkCycles!-normal.enemies[0].walkCycles!)<1e-8);
});

test('Riel captures moving hero and mercenary gait once without delaying or duplicating the shot',()=>{
 for(const source of ['hero','mercenary'] as const)for(let entry=0;entry<8;entry++){
  let s=createDefense(1,source==='hero'?'elf':'dwarf');s.phase='wave';s.wave=1;s.spawned=999;s.heroPosition={x:100,y:170};s.heroTarget={x:400,y:170};
  if(source==='mercenary'){s.mercenary='elf';s.mercenaryPosition={x:70,y:205};s.heroCooldown=99;}
  s.locomotion[source]={distance:entry*8,speed:100};s.enemies=[{id:900,kind:'wood',...positionOnPath(0,220,1),progress:220,path:0,speed:0,hp:1000,maxHp:1000,wet:0,burn:0,slow:0,hit:0}];
  const queued=stepDefense(s,1/60),attack=queued.attacks.find(a=>a.source===source)!;
  assert.equal(attack.walkEntry,walkFrame(queued.locomotion[source].distance));assert.equal(attack.elapsed,0);assert.equal(attack.hitAt,.1);assert.equal(attack.duration,.28);
  assert.equal(s.attacks.length,0);if(source==='hero')assert.equal(actDefense(queued,{type:'move',point:{x:450,y:170}}).attacks.filter(a=>a.source==='hero').length,0,'a new move command still cancels an unreleased shot');const paused=actDefense(queued,{type:'pause'});assert.equal(stepDefense(paused,.05),paused);
  const preparing=stepDefense(queued,.05);assert.equal(preparing.attacks.find(a=>a.id===attack.id)!.walkEntry,attack.walkEntry);assert.equal(preparing.projectiles.filter(p=>p.actor==='elf').length,0);
  const release=stepDefense(preparing,.05);assert.equal(release.projectiles.filter(p=>p.actor==='elf').length,1);assert.equal(release.enemies[0].hp,1000,'release precedes projectile collision');
  assert.ok(release.heroPosition.x>queued.heroPosition.x,'visual planting cannot lock commanded movement');
 }
 const idle=createDefense(1,'elf');idle.phase='wave';idle.spawned=999;idle.wave=1;idle.heroPosition={x:100,y:170};idle.heroTarget={...idle.heroPosition};idle.enemies=[{id:900,kind:'wood',...positionOnPath(0,220,1),progress:220,path:0,speed:0,hp:1000,maxHp:1000,wet:0,burn:0,slow:0,hit:0}];
 assert.equal(stepDefense(idle,.01).attacks[0].walkEntry,undefined,'stationary shots retain the original pose');
});

test('Bron captures moving stance once and preserves the hammer damage time',()=>{
 for(const source of ['hero','mercenary'] as const)for(let entry=0;entry<8;entry++){
  const s=createDefense(1,source==='hero'?'dwarf':'elf');s.phase='wave';s.wave=1;s.spawned=999;s.heroPosition={x:100,y:170};s.heroTarget={x:200,y:170};
  if(source==='mercenary'){s.mercenary='dwarf';s.mercenaryPosition={x:100,y:170};s.heroCooldown=99;}
  s.locomotion[source]={distance:entry*8,speed:100};s.enemies=[{id:900,kind:'wood',...positionOnPath(0,120,1),progress:120,path:0,speed:0,hp:1000,maxHp:1000,wet:0,burn:0,slow:0,hit:0}];
  const queued=stepDefense(s,1/60),attack=queued.attacks.find(a=>a.source===source)!;
  assert.ok(attack);assert.equal(attack.walkEntry,walkFrame(queued.locomotion[source].distance));assert.equal(attack.hitAt,.24);assert.equal(attack.duration,.52);assert.equal(s.attacks.length,0);
  const paused=actDefense(queued,{type:'pause'});assert.equal(stepDefense(paused,.1),paused);
  if(source==='hero')assert.equal(actDefense(queued,{type:'move',point:{x:150,y:170}}).attacks.filter(a=>a.source==='hero').length,0,'new input still cancels an unfired attack');
  let preparing=stepDefense(queued,.1);preparing=stepDefense(preparing,.1);preparing=stepDefense(preparing,.039);
  assert.equal(preparing.enemies[0].hp,1000);assert.equal(preparing.attacks.find(a=>a.id===attack.id)!.walkEntry,attack.walkEntry);
  const contact=stepDefense(preparing,.002);assert.ok(contact.enemies[0].hp<1000);assert.equal(contact.attacks.find(a=>a.id===attack.id)!.fired,true);
  assert.equal(stepDefense(contact,.01).enemies[0].hp,contact.enemies[0].hp,'same swing hits once');
 }
 const s=createDefense(1,'dwarf');s.phase='wave';s.wave=1;s.spawned=999;s.heroPosition={x:100,y:170};s.heroTarget={...s.heroPosition};s.enemies=[{id:900,kind:'wood',...positionOnPath(0,120,1),progress:120,path:0,speed:0,hp:1000,maxHp:1000,wet:0,burn:0,slow:0,hit:0}];
 assert.equal(stepDefense(s,.01).attacks[0].walkEntry,undefined);
});
