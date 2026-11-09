import test from 'node:test';
import assert from 'node:assert/strict';
import { actDefense, allowedBranches, createDefense, damageMultiplier, positionOnPath, petPosition, questSatisfied, questComplete, stepDefense, towerRange, waveSize } from './engine.ts';
import { ENEMIES, PATHS, SLOTS, STAGES, HERO_ORDER, STAGE_COUNT, getStage, getSlots, getPaths, getRegion, stageLabel } from './data.ts';
import { DIFFICULTIES, getWavePlan } from './difficulty.ts';
import type { Difficulty, DefenseAction, DefenseState, Enemy, EnemyKind } from './types.ts';

const enemy = (kind:EnemyKind,id:number,x=400,y=285):Enemy => ({id,kind,x,y,hp:ENEMIES[kind].hp,maxHp:ENEMIES[kind].hp,progress:0,path:0,speed:ENEMIES[kind].speed,wet:0,burn:0,slow:0,hit:0});
function battlefield(stage=1):DefenseState {
  const s=createDefense(stage,'mage');
  return {...s,phase:'wave',wave:1,spawned:waveSize(stage,1),spawnTimer:99,heroCooldown:99};
}
function advance(s:DefenseState,seconds:number) {for(let i=0;i<seconds*10;i++)s=stepDefense(s,.1);return s;}

// This plan uses the same public commands as the UI and never injects coins/damage.
function campaignBattle(stage:number,build=true,hero:'mage'|'barbarian'|'druid'='mage',useSkills=true,strategy:'mixed'|'single-crush'='mixed',delta=.1,difficulty:Difficulty='standard'):DefenseState {
  let s=createDefense(stage,hero,0,difficulty);
  const route:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'hire',hero:'elf'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
  if(getStage(stage).expanded) route.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
  if(strategy==='single-crush')route.splice(0,route.length,{type:'build',slot:2,kind:'cannon'},{type:'upgrade',slot:2,branch:'crush'},{type:'upgrade',slot:2});
  let index=0;
  for(let frame=0;frame<600/delta;frame++) {
    if(build&&index<route.length) {const next=actDefense(s,route[index]);if(next.coins<s.coins){index++;s=next;}}
    if(s.phase==='prep'||s.phase==='intermission') s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion') s=actDefense(s,{type:'promote',choice:'power'});
    if(build&&useSkills&&s.enemies.length>=5&&s.skillCooldown===0) s=actDefense(s,{type:'skill'});
    if(s.phase==='won'||s.phase==='lost')return s;
    s=stepDefense(s,delta);
  }
  throw new Error(`Stage ${stage} never finished`);
}

test('materials reward correct attacks without making other attacks useless',()=>{
  assert.equal(damageMultiplier('wood','fire'),1.5);
  assert.equal(damageMultiplier('sprout','water'),.6);
  assert.equal(damageMultiplier('ice','fire'),1.5);
  assert.equal(damageMultiplier('ice','impact'),1.5);
  assert.equal(damageMultiplier('stone','fire'),.6);
  assert.equal(damageMultiplier('stone','impact'),1.5);
  assert.equal(damageMultiplier('insulator','lightning'),.6);
  assert.equal(damageMultiplier('metal','physical'),1);
  assert.equal(damageMultiplier('boss','fire'),1.5);
});

test('construction, valid branch upgrades and selling conserve money and never mutate the source',()=>{
  const initial=createDefense(1,'mage');
  assert.equal(actDefense(initial,{type:'build',slot:6,kind:'magic'}),initial);
  let s=actDefense(initial,{type:'build',slot:2,kind:'magic'});
  assert.equal(initial.coins,240);assert.equal(initial.towers.length,0);
  assert.equal(s.coins,150);assert.equal(s.towers.length,1);
  assert.equal(actDefense(s,{type:'build',slot:2,kind:'cannon'}),s);
  assert.equal(actDefense(s,{type:'upgrade',slot:2,branch:'water'}),s);
  s=actDefense(s,{type:'upgrade',slot:2,branch:'lightning'});
  assert.equal(s.coins,70);assert.equal(s.towers[0].level,2);
  const insufficient=actDefense(s,{type:'upgrade',slot:2});
  assert.equal(insufficient.coins,70);assert.equal(insufficient.towers[0].level,2);
  s=actDefense(s,{type:'sell',slot:2});
  assert.equal(s.coins,197);assert.equal(s.towers.length,0);
  assert.equal(actDefense(s,{type:'sell',slot:2}),s);
  assert.deepEqual(allowedBranches('cannon'),['crush','water']);
  assert.ok(towerRange({slot:0,kind:'crossbow',branch:null,level:1,cooldown:0})>towerRange({slot:1,kind:'crossbow',branch:null,level:1,cooldown:0}));
});

test('pause freezes combat, controls, timers and money; invalid time cannot advance the simulation',()=>{
  let s=actDefense(createDefense(2,'elf'),{type:'start-wave'});
  s=advance(s,2);
  s=actDefense(s,{type:'pause'});
  assert.equal(stepDefense(s,.1),s);
  assert.equal(actDefense(s,{type:'skill'}),s);
  assert.equal(actDefense(s,{type:'build',slot:0,kind:'crossbow'}),s);
  assert.equal(actDefense(s,{type:'move',point:{x:1,y:1}}),s);
  s=actDefense(s,{type:'resume'});
  assert.ok(stepDefense(s,.1).time>s.time);
  assert.equal(stepDefense(s,NaN),s);assert.equal(stepDefense(s,-1),s);
  assert.equal(stepDefense(s,0),s);
  assert.equal(stepDefense({...s,speed:2},.1).time,stepDefense(s,.1).time,'the caller controls time scaling');
});

test('waves require defeated or escaped enemies; promotion is a deliberate mid-battle choice',()=>{
  const base=battlefield();base.wave=2;base.spawned=waveSize(1,2);
  let s=stepDefense(base,.1);
  assert.equal(s.phase,'promotion');assert.equal(s.coins,285);
  assert.equal(actDefense(s,{type:'start-wave'}),s);
  s=actDefense(s,{type:'promote',choice:'control'});
  assert.equal(s.phase,'intermission');assert.equal(s.promotion,'control');
  s=actDefense(s,{type:'start-wave'});
  assert.equal(s.wave,3);assert.equal(s.phase,'wave');assert.equal(s.spawned,0);
  assert.equal(actDefense(s,{type:'start-wave'}),s);
});

test('lightning arcs through metal and wet bodies, while insulation blocks the chain',()=>{
  function shoot(kind:EnemyKind,wet:number,secondKind:EnemyKind='wood') {
    const s=battlefield();s.towers=[{slot:2,kind:'magic',branch:'lightning',level:2,cooldown:0}];
    const a=enemy(kind,1),b=enemy(secondKind,2);
    // Position on the path within range of slot2. Freeze speed so the distance stays fixed.
    a.progress=410;a.speed=0;a.wet=wet;b.progress=370;b.speed=0;
    Object.assign(a,positionOnPath(0,a.progress));Object.assign(b,positionOnPath(0,b.progress));
    s.enemies=[a,b];return advance(s,.7);
  }
  const metal=shoot('metal',0);
  assert.ok(metal.enemies[1].hp<ENEMIES.wood.hp);
  const dry=shoot('wood',0);
  assert.equal(dry.enemies[1].hp,ENEMIES.wood.hp);
  const wet=shoot('wood',5);
  assert.ok(wet.enemies[1].hp<ENEMIES.wood.hp);
  const insulated=shoot('insulator',5);
  assert.equal(insulated.enemies[1].hp,ENEMIES.wood.hp);
  const targetInsulated=shoot('metal',0,'insulator');
  assert.equal(targetInsulated.enemies[1].hp,ENEMIES.insulator.hp);
});

test('water attacks slow and wet a group and rain supplies a natural conductive state',()=>{
  const s=battlefield();s.towers=[{slot:2,kind:'cannon',branch:'water',level:2,cooldown:0}];
  const a=enemy('stone',1),b=enemy('wood',2);a.progress=410;b.progress=370;a.speed=0;b.speed=0;
  Object.assign(a,positionOnPath(0,a.progress));Object.assign(b,positionOnPath(0,b.progress));s.enemies=[a,b];
  const next=advance(s,1);
  assert.ok(next.enemies.every(e=>e.wet>0&&e.slow>0));
  const rain=battlefield(2);rain.enemies=[enemy('metal',1)];
  assert.ok(stepDefense(rain,.1).enemies[0].wet>0);
});

test('kills pay once, main leaks cause loss, and losing the expanded village only fails its quest',()=>{
  const kill=battlefield();const dead=enemy('sprout',1);dead.hp=0;kill.enemies=[dead];
  const paid=stepDefense(kill,.1);
  assert.equal(paid.kills,1);assert.equal(paid.coins,240+14+45);
  const settled=advance(paid,2);assert.equal(settled.coins,paid.coins);assert.equal(settled.kills,paid.kills);assert.equal(settled.effects.length,0);
  const leak=battlefield();leak.hp=1;const escaped=enemy('wood',1);escaped.progress=10000;leak.enemies=[escaped];
  assert.equal(stepDefense(leak,.1).phase,'lost');
  const expanded=battlefield(4);expanded.outpostHp=1;expanded.wave=4;expanded.spawned=waveSize(4,4);
  const side=enemy('sprout',1);side.path=1;side.progress=10000;expanded.enemies=[side];
  const result=stepDefense(expanded,.1);
  assert.equal(result.phase,'won');assert.equal(result.hp,20);assert.equal(result.outpostHp,0);assert.equal(questComplete(result),false);
});

test('skills require live combat, respect cooldown, and the control promotion slows survivors',()=>{
  const prep=createDefense(1,'mage');assert.equal(actDefense(prep,{type:'skill'}),prep);
  const s=battlefield();s.enemies=[enemy('boss',1)];s.promotion='control';
  const cast=actDefense(s,{type:'skill'});
  assert.equal(cast.skillCooldown,20);assert.ok(cast.enemies[0].hp<s.enemies[0].hp);assert.equal(cast.enemies[0].slow,4);
  assert.equal(actDefense(cast,{type:'skill'}),cast);
  assert.ok(stepDefense(cast,.1).skillCooldown<20);
  const moved=actDefense(s,{type:'move',point:{x:-99,y:100000}});
  assert.deepEqual(moved.heroTarget,{x:30,y:555});assert.deepEqual(moved.heroPosition,s.heroPosition);
  assert.equal(actDefense(s,{type:'move',point:{x:NaN,y:20}}),s);
});

test('stage four uses two entrances and the boss accelerates below half health',()=>{
  let s=actDefense(createDefense(4,'dwarf'),{type:'start-wave'});s=advance(s,5);
  assert.deepEqual(new Set(s.enemies.map(e=>e.path)),new Set([0,1]));
  const full=battlefield(4);const boss=enemy('boss',1);boss.progress=100;boss.x=100;boss.y=170;full.enemies=[boss];
  const wounded={...full,enemies:[{...boss,hp:1000}]};
  assert.ok(stepDefense(wounded,.1).enemies[0].progress>stepDefense(full,.1).enemies[0].progress);
  assert.equal(STAGES.length,8);assert.equal(SLOTS.filter(s=>s.unlock===4).length,2);
  assert.deepEqual(positionOnPath(0,100000),PATHS[0].at(-1));
});

test('all eight full battles can be won through ordinary build, upgrade, recruitment and skill commands',()=>{
  for(let stage=1;stage<=STAGE_COUNT;stage++) {
    const s=campaignBattle(stage);
    console.log(`balance: stage ${stage}, ${Math.round(s.time)}s, hp ${s.hp}, outpost ${s.outpostHp}, kills ${s.kills}`);
    assert.equal(s.phase,'won',`stage ${stage}`);assert.equal(s.wave,4);assert.ok(s.hp>=15);assert.equal(questComplete(s),true);
    assert.ok(s.kills>40);assert.ok(s.towers.length>=4);assert.ok(s.coins>=0);assert.ok(s.time>60&&s.time<240);
    const completed=s;assert.equal(actDefense(s,{type:'skill'}),completed);
    const settled=advance(completed,2);assert.equal(settled.coins,completed.coins);assert.equal(settled.hp,completed.hp);assert.equal(settled.kills,completed.kills);assert.equal(stepDefense(settled,.1),settled);
  }
});

test('neglecting construction and skills really loses the village in every stage',()=>{
  for(let stage=1;stage<=STAGE_COUNT;stage++){const s=campaignBattle(stage,false);assert.equal(s.phase,'lost',`stage ${stage}`);assert.equal(s.hp,0);}
});


test('regional stage data preserves forest paths and exposes snow expansion and reachable quest goals',()=>{
  assert.equal(STAGE_COUNT,8);assert.equal(HERO_ORDER.length,6);
  assert.equal(getPaths(1),PATHS);assert.equal(getSlots(1),SLOTS);
  assert.notEqual(getPaths(5),PATHS);assert.equal(getRegion(5),'snow');assert.equal(stageLabel(8),'2-4');
  assert.equal(getSlots(5).filter(slot=>slot.unlock<=5).length,6);
  assert.equal(getSlots(8).filter(slot=>slot.unlock<=8).length,8);
  assert.equal(getStage(5).visitor,'barbarian');assert.equal(getStage(7).visitor,'druid');
  const hunt=createDefense(6,'mage');assert.equal(questSatisfied(hunt),false);
  assert.equal(questSatisfied({...hunt,questProgress:60}),true);
  assert.equal(questComplete({...hunt,questProgress:60}),false);
  assert.equal(questComplete({...hunt,phase:'won',questProgress:60}),true);
  assert.ok([1,2,3,4].reduce((n,w)=>n+waveSize(6,w),0)>=getStage(6).questGoal);
  assert.equal(createDefense(8,'mage').coins,280);
  assert.equal(actDefense(createDefense(5,'mage'),{type:'build',slot:6,kind:'magic'}).towers.length,0);
  assert.equal(actDefense(createDefense(8,'mage'),{type:'build',slot:6,kind:'magic'}).towers.length,1);
});

test('snow ice accelerates enemies without applying river wetness; high ground uses the selected region',()=>{
  const s=battlefield(5),e=enemy('frostwolf',1);e.progress=500;Object.assign(e,positionOnPath(0,e.progress,5));s.enemies=[e];
  const next=stepDefense(s,.1);
  assert.ok(Math.abs(next.enemies[0].progress-e.progress-e.speed*.1*1.25)<.0001);
  assert.equal(next.enemies[0].wet,0);
  const t={slot:3,kind:'cannon' as const,branch:null,level:1,cooldown:0};
  assert.equal(towerRange(t,5)-towerRange(t,1),45);
  const normal=battlefield(5),dry=enemy('ice',2);dry.progress=100;Object.assign(dry,positionOnPath(0,100,5));normal.enemies=[dry];
  assert.ok(Math.abs(stepDefense(normal,.1).enemies[0].progress-100-dry.speed*.1)<.0001);
});

test('druid and hired druid summon a real wolf attack that slows enemies independently',()=>{
  for(const mercenary of [false,true]){
    const s=battlefield(5);s.hero=mercenary?'mage':'druid';s.mercenary=mercenary?'druid':null;s.mercCooldown=99;
    const e=enemy('stone',1);e.progress=500;e.speed=0;Object.assign(e,positionOnPath(0,500,5));s.enemies=[e];
    const moving=stepDefense(s,.1);assert.notEqual(petPosition(moving),null);assert.equal(moving.enemies[0].hp,e.hp);
    let next=moving;for(let i=0;i<20&&next.enemies[0].hp===e.hp;i++)next=stepDefense(next,.05);
    assert.ok(next.enemies[0].hp<e.hp);assert.ok(next.enemies[0].slow>0);assert.ok(next.petCooldown>0);
    assert.ok(next.effects.some(effect=>effect.kind==='impact'));assert.notDeepEqual(petPosition(next),petPosition(moving));
    const paused=actDefense(next,{type:'pause'});assert.equal(stepDefense(paused,.1),paused);
  }
  assert.equal(petPosition(createDefense(5,'mage')),null);
});

test('frost boss telegraphs then freezes towers, and manual skills interrupt the charge',()=>{
  function fight(){
    const s=battlefield(8),boss=enemy('frostboss',1);boss.progress=500;boss.speed=0;Object.assign(boss,positionOnPath(0,500,8));s.enemies=[boss];s.bossCycle=.05;s.towers=[{slot:2,kind:'crossbow',level:1,branch:null,cooldown:10}];return s;
  }
  const charging=stepDefense(fight(),.1);assert.equal(charging.bossCharge,2.5);
  assert.equal(charging.freeze,0);assert.match(charging.notice,/충전/);
  const frozen=advance(charging,2.6);assert.ok(frozen.freeze>1.8);
  const frozenTower=frozen.towers[0].cooldown;
  const waiting=stepDefense(frozen,.1);assert.equal(waiting.towers[0].cooldown,frozenTower);
  const resumed=advance(frozen,2.2);assert.equal(resumed.freeze,0);assert.ok(resumed.towers[0].cooldown<frozenTower);
  const interrupted=actDefense(charging,{type:'skill'});assert.equal(interrupted.bossCharge,0);assert.equal(interrupted.skillCooldown,20);assert.match(interrupted.notice,/충전 차단/);
  assert.equal(advance(interrupted,3).freeze,0);
  const paused=actDefense(charging,{type:'pause'});assert.equal(stepDefense(paused,.1),paused);
});

test('barbarian and druid can finish snow battles without permanent training',()=>{
  for(const hero of ['barbarian','druid'] as const){
    const s=campaignBattle(8,true,hero);assert.equal(s.phase,'won');assert.equal(s.training,0);assert.ok(s.hp>0);assert.ok(s.kills>60);
  }
});


test('a single maxed cannon remains forgiving early but cannot replace a growing army',()=>{
  for(const stage of [1,2]){
    const result=campaignBattle(stage,true,'mage',false,'single-crush');
    assert.equal(result.phase,'won');assert.ok(result.hp>=15);
  }
  for(const stage of [3,5,6]){
    const result=campaignBattle(stage,true,'mage',false,'single-crush');
    assert.ok(result.hp<20,`stage ${stage} should require more investment for a perfect defense`);
  }
  for(const stage of [7,8])assert.equal(campaignBattle(stage,true,'mage',false,'single-crush').phase,'lost');
  for(let stage=1;stage<=STAGE_COUNT;stage++)assert.equal(campaignBattle(stage,true,'mage',false).phase,'won',`mixed stage ${stage} does not require perfect skill timing`);
});

test('a cannon blast damages its main target and only the two closest additional bodies',()=>{
  const s=battlefield();s.towers=[{slot:2,kind:'cannon',branch:'crush',level:2,cooldown:0}];
  s.enemies=Array.from({length:5},(_,i)=>{
    const e=enemy('metal',i+1);e.progress=500-i*10;e.speed=0;Object.assign(e,positionOnPath(0,e.progress));return e;
  });
  const result=advance(s,1);
  const damage=result.enemies.map((e,i)=>s.enemies[i].hp-e.hp);
  assert.equal(damage.filter(n=>n>0).length,3);
  assert.ok(Math.abs(damage[1]/damage[0]-.4)<1e-8);
  assert.equal(damage[3],0);assert.equal(damage[4],0);
});

test('frost boss starts its six-second charge cycle after entering the battlefield',()=>{
  const s=battlefield(8);const boss=enemy('frostboss',1);boss.progress=100;boss.speed=0;Object.assign(boss,positionOnPath(0,100,8));s.enemies=[boss];s.bossCycle=6;
  const entrance=advance(s,10);assert.equal(entrance.bossCharge,0);assert.equal(entrance.freeze,0);assert.equal(entrance.bossCycle,6);
  entrance.enemies[0].progress=221;Object.assign(entrance.enemies[0],positionOnPath(0,221,8));
  const engaged=advance(entrance,5.9);assert.equal(engaged.bossCharge,0);
  const warning=advance(engaged,.2);assert.ok(warning.bossCharge>0);assert.equal(warning.freeze,0);
});


function positionedEnemy(kind:EnemyKind,id:number,progress:number,stage=1):Enemy {
  return {...enemy(kind,id),progress,speed:0,...positionOnPath(0,progress,stage)};
}
function until(s:DefenseState,condition:(state:DefenseState)=>boolean,seconds=3):DefenseState {
  for(let i=0;i<seconds*50&&!condition(s);i++)s=stepDefense(s,.02);
  assert.ok(condition(s),'expected combat event within the simulation window');return s;
}
function rangedBattle(kind:'crossbow'|'magic'|'cannon'='crossbow'):DefenseState {
  const s=battlefield();s.nextId=100;s.towers=[{slot:2,kind,branch:null,level:1,cooldown:0}];s.enemies=[positionedEnemy('metal',1,410)];return s;
}

test('ranged attacks wind up, fly through real positions and damage only upon collision',()=>{
  for(const kind of ['crossbow','magic'] as const){
    const start=rangedBattle(kind),windup=stepDefense(start,.02);
    assert.equal(windup.attacks.length,1);assert.equal(windup.projectiles.length,0);assert.equal(windup.enemies[0].hp,start.enemies[0].hp);
    const airborne=until(windup,s=>s.projectiles.length>0);
    assert.equal(airborne.enemies[0].hp,start.enemies[0].hp);
    assert.deepEqual(airborne.projectiles[0].position,airborne.projectiles[0].from);
    const flying=stepDefense(airborne,.02);assert.notDeepEqual(flying.projectiles[0].position,airborne.projectiles[0].position);
    assert.equal(flying.enemies[0].hp,start.enemies[0].hp);
    const impact=until(flying,s=>s.enemies[0].hp<start.enemies[0].hp);
    assert.equal(impact.projectiles.length,0);assert.ok(impact.effects.some(e=>e.kind==='impact'&&/\d/.test(e.text||'')));
    assert.equal(start.enemies[0].hp,ENEMIES.metal.hp,'the input state is immutable');
  }
});

test('cannon shells rise and land at their aimed point, with a real opportunity to miss',()=>{
  const start=rangedBattle('cannon');
  const launched=until(start,s=>s.projectiles.length===1);launched.towers[0].cooldown=99;
  const rising=stepDefense(launched,.1);assert.equal(rising.projectiles[0].kind,'shell');assert.ok(rising.projectiles[0].height>0);
  assert.ok(rising.projectiles[0].progress>0&&rising.projectiles[0].progress<1);assert.equal(rising.enemies[0].hp,start.enemies[0].hp);
  const impact=until(rising,s=>s.projectiles.length===0);assert.ok(impact.enemies[0].hp<start.enemies[0].hp);
  const evaded={...rising,enemies:[positionedEnemy('metal',1,900)]};
  const miss=until(evaded,s=>s.projectiles.length===0);assert.equal(miss.enemies[0].hp,ENEMIES.metal.hp);
  assert.ok(miss.effects.some(e=>e.kind==='shockwave'));assert.ok(!miss.effects.some(e=>e.kind==='impact'));
});

test('melee has distinct windup, contact and recovery; dead targets cannot be hit after windup',()=>{
  for(const hero of ['dwarf','barbarian'] as const){
    const s=battlefield();s.hero=hero;s.heroCooldown=0;s.nextId=100;s.enemies=[positionedEnemy('stone',1,410)];
    const windup=stepDefense(s,.02);assert.equal(windup.attacks[0].source,'hero');assert.equal(windup.attacks[0].actor,hero);
    const before=stepDefense(windup,.1);assert.equal(before.enemies[0].hp,s.enemies[0].hp);assert.equal(before.attacks[0].fired,false);
    const contact=until(before,next=>next.attacks.some(a=>a.fired));assert.ok(contact.enemies[0].hp<s.enemies[0].hp);
    assert.ok(contact.attacks[0].duration-contact.attacks[0].elapsed>=.15);assert.equal(contact.projectiles.length,0);
    const recovery=stepDefense(contact,.1);assert.equal(recovery.enemies[0].hp,contact.enemies[0].hp);assert.ok(recovery.attacks[0].elapsed>recovery.attacks[0].hitAt);
    const killed={...before,enemies:[{...before.enemies[0],hp:0},positionedEnemy('metal',2,900)]};
    const cancelled=advance(killed,.4);assert.equal(cancelled.enemies[0].hp,ENEMIES.metal.hp);assert.equal(cancelled.projectiles.length,0);
    assert.ok(!cancelled.effects.some(e=>e.kind==='impact'));
  }
});

test('movement walks to the requested destination in prep, intermission and combat; followers never teleport',()=>{
  for(const phase of ['prep','intermission','wave'] as const){
    let s=createDefense(5,'druid');s=actDefense(s,{type:'hire',hero:'dwarf'});s.phase=phase;
    if(phase==='wave'){s.wave=1;s.spawned=waveSize(5,1);s.enemies=[positionedEnemy('metal',1,900,5)];}
    const requested=actDefense(s,{type:'move',point:{x:100,y:500}});assert.deepEqual(requested.heroPosition,s.heroPosition);
    const walking=stepDefense(requested,.1);const travel=Math.hypot(walking.heroPosition.x-s.heroPosition.x,walking.heroPosition.y-s.heroPosition.y);
    assert.ok(travel>0&&travel<=23.001);assert.notDeepEqual(walking.heroPosition,walking.heroTarget);
    assert.ok(Math.hypot(walking.mercenaryPosition.x-s.mercenaryPosition.x,walking.mercenaryPosition.y-s.mercenaryPosition.y)<=22.001);
    assert.ok(Math.hypot(walking.pet!.position.x-s.pet!.position.x,walking.pet!.position.y-s.pet!.position.y)<=28.001);
    const paused=actDefense(walking,{type:'pause'});assert.equal(advance(paused,2),paused);
    const arrived=advance(actDefense(paused,{type:'resume'}),3);assert.deepEqual(arrived.heroPosition,{x:100,y:500});
    assert.deepEqual(arrived.mercenaryPosition,{x:138,y:535});assert.deepEqual(petPosition(arrived),{x:128,y:478});
  }
});

test('impact actually pushes enemies backwards, heavy bodies resist, and friction plus immunity prevent stun locking',()=>{
  const s=battlefield();s.hero='barbarian';s.nextId=100;
  s.enemies=(['sprout','stone','boss'] as const).map((kind,i)=>({...positionedEnemy(kind,i+1,410),hp:10000,maxHp:10000}));
  const struck=actDefense(s,{type:'skill'});assert.ok(struck.enemies[0].knockVelocity!>struck.enemies[1].knockVelocity!);assert.ok(struck.enemies[1].knockVelocity!>struck.enemies[2].knockVelocity!);
  const recoiling=stepDefense(struck,.1);assert.ok(recoiling.enemies.every(e=>e.progress<410));
  assert.ok(410-recoiling.enemies[0].progress>410-recoiling.enemies[1].progress);assert.ok(410-recoiling.enemies[1].progress>410-recoiling.enemies[2].progress);
  const repeat=actDefense({...recoiling,skillCooldown:0},{type:'skill'});
  assert.deepEqual(repeat.enemies.map(e=>e.knockVelocity),recoiling.enemies.map(e=>e.knockVelocity),'immune bodies take damage but cannot stack impulses');
  const settled=advance(repeat,1.5);assert.ok(settled.enemies.every(e=>e.knockVelocity===0&&e.knockCooldown===0));
  const fresh=actDefense({...settled,skillCooldown:0},{type:'skill'});assert.ok(fresh.enemies.every(e=>e.knockVelocity!>0));
  const moving={...settled,enemies:settled.enemies.map(e=>({...e,speed:48}))};let pressured=moving;
  for(let i=0;i<100;i++){pressured=actDefense({...pressured,skillCooldown:0},{type:'skill'});pressured=stepDefense(pressured,.1);if(pressured.enemies.length<3)break;}
  // Use a long-lived heavy target to show repeated attacks still allow forward travel.
  assert.ok(pressured.enemies.some(e=>e.kind==='boss'&&e.progress>moving.enemies[2].progress));
});

test('pause freezes projectiles, windups and followers; tower freeze pauses only unlaunched tower attacks',()=>{
  let s=rangedBattle();s.hero='druid';s.pet={position:{x:440,y:355},target:{x:440,y:355},facing:-1};
  s.enemies.push(positionedEnemy('frostboss',2,100));s=until(s,next=>next.projectiles.length>0);
  const paused=actDefense(s,{type:'pause'});assert.equal(advance(paused,2),paused);
  const flying=stepDefense({...s,freeze:1},.02);assert.notDeepEqual(flying.projectiles[0].position,s.projectiles[0].position);
  const setup=rangedBattle();setup.enemies.push(positionedEnemy('frostboss',2,100));
  const pending=stepDefense(setup,.02);const frozen=stepDefense({...pending,freeze:1},.1);
  assert.equal(frozen.attacks[0].elapsed,pending.attacks[0].elapsed);assert.equal(frozen.towers[0].cooldown,pending.towers[0].cooldown);
});

test('airborne arrows can hit another real body after their target dies, or miss without ghost damage',()=>{
  const launch=until(rangedBattle(),s=>s.projectiles.length>0);launch.towers[0].cooldown=99;
  const corpse={...launch.enemies[0],hp:0},bystander=positionedEnemy('metal',2,415),distant=positionedEnemy('metal',3,900);
  const intercepted=until({...launch,enemies:[corpse,bystander,distant]},s=>s.projectiles.length===0);
  assert.ok(intercepted.enemies.find(e=>e.id===2)!.hp<ENEMIES.metal.hp);assert.equal(intercepted.enemies.find(e=>e.id===3)!.hp,ENEMIES.metal.hp);
  const miss=advance({...launch,enemies:[corpse,distant]},3);assert.equal(miss.enemies[0].hp,ENEMIES.metal.hp);assert.equal(miss.kills,1);assert.equal(miss.projectiles.length,0);
  assert.equal(advance(miss,1).coins,miss.coins,'a missed shot cannot pay for an already dead target again');
});

test('wave completion clears remaining projectiles and windups without duplicate rewards',()=>{
  const airborne=until(rangedBattle(),s=>s.projectiles.length>0);airborne.enemies[0].hp=0;
  const finished=stepDefense(airborne,.02);assert.equal(finished.phase,'intermission');assert.equal(finished.projectiles.length,0);assert.equal(finished.attacks.length,0);
  assert.equal(finished.kills,1);assert.equal(finished.coins,240+14+45);
  const rest=advance(finished,3);assert.equal(rest.kills,1);assert.equal(rest.coins,finished.coins);
  for(const phase of ['won','lost'] as const){
    const ended={...airborne,phase,effects:finished.effects};
    const fading=stepDefense(ended,.1);
    assert.ok(fading.time>ended.time);assert.ok(fading.effects[0].age!>ended.effects[0].age!);assert.ok(fading.effects[0].life<ended.effects[0].life);
    assert.equal(fading.coins,ended.coins);assert.equal(fading.hp,ended.hp);assert.equal(fading.outpostHp,ended.outpostHp);assert.equal(fading.kills,ended.kills);
    assert.equal(fading.enemies,ended.enemies);assert.equal(fading.projectiles,ended.projectiles);assert.equal(fading.attacks,ended.attacks);assert.equal(fading.heroPosition,ended.heroPosition);
    const paused={...ended,paused:true};assert.equal(stepDefense(paused,.1),paused);assert.equal(stepDefense(ended,NaN),ended);assert.equal(stepDefense(ended,-1),ended);
    const settled=advance(ended,2);assert.equal(settled.effects.length,0);assert.equal(stepDefense(settled,.1),settled);assert.equal(settled.coins,ended.coins);
  }
});


test('the UI fixed 60 Hz loop preserves opening balance and the complete snow boss battle',()=>{
  for(const stage of [1,8]){
    const result=campaignBattle(stage,true,stage===8?'druid':'mage',false,'mixed',1/60);
    assert.equal(result.phase,'won');assert.ok(result.hp>=15);assert.ok(result.outpostHp>0);
    assert.equal(result.projectiles.length,0);assert.equal(result.attacks.length,0);
  }
});


function advanceExact(s:DefenseState,seconds:number,dt=1/60):DefenseState {
  let left=seconds;while(left>1e-10){const slice=Math.min(left,dt);s=stepDefense(s,slice);left-=slice;}return s;
}

test('ordinary movement accelerates, brakes and reaches its target without overshoot',()=>{
  const origin=createDefense(1,'mage');
  let s=actDefense(origin,{type:'move',point:{x:700,y:355}});
  const first=stepDefense(s,.05),second=stepDefense(first,.05);
  assert.ok(first.heroVelocity.x>0&&first.heroVelocity.x<230);assert.ok(second.heroVelocity.x>first.heroVelocity.x);
  assert.ok(first.heroPosition.x-origin.heroPosition.x<230*.05,'the first step accelerates instead of instantly reaching full speed');
  let reachedCruise=false,braked=false,lastX=s.heroPosition.x;
  for(let i=0;i<150;i++){
    s=stepDefense(s,1/60);assert.ok(s.heroPosition.x>=lastX&&s.heroPosition.x<=700);lastX=s.heroPosition.x;
    if(s.heroVelocity.x>=229)reachedCruise=true;
    if(reachedCruise&&s.heroPosition.x<700&&s.heroVelocity.x<200)braked=true;
  }
  assert.ok(reachedCruise);assert.ok(braked);assert.deepEqual(s.heroPosition,{x:700,y:355});assert.deepEqual(s.heroVelocity,{x:0,y:0});
  const moving=advanceExact(actDefense(origin,{type:'move',point:{x:750,y:355}}),.4);
  const reversed=actDefense(moving,{type:'move',point:{x:200,y:355}}),turning=stepDefense(reversed,.02);
  assert.ok(turning.heroVelocity.x<moving.heroVelocity.x);assert.ok(turning.heroVelocity.x>0,'reversal first brakes existing momentum');
  const arrived=advanceExact(turning,3);assert.deepEqual(arrived.heroPosition,{x:200,y:355});assert.deepEqual(arrived.heroVelocity,{x:0,y:0});
});

test('aimed dash travels at speed with a capped destination, costs cooldown and causes no damage',()=>{
  const s=battlefield();s.enemies=[positionedEnemy('metal',1,900)];
  const dash=actDefense(s,{type:'dash',point:{x:10000,y:355}});
  assert.deepEqual(dash.heroPosition,s.heroPosition);assert.deepEqual(dash.heroTarget,{x:640,y:355});assert.equal(dash.heroVelocity.x,750);
  assert.equal(dash.dashCooldown,5);assert.ok(Math.abs(dash.dashTime-200/750)<1e-10);
  const fx=dash.effects.find(e=>e.kind==='dash')!;assert.deepEqual(fx.from,s.heroPosition);assert.deepEqual(fx.to,dash.heroTarget);assert.equal(fx.maxLife,.35);assert.equal(fx.force,200);
  const flying=stepDefense(dash,.1);assert.deepEqual(flying.heroPosition,{x:515,y:355});assert.ok(flying.dashTime>0);assert.ok(Math.abs(flying.dashCooldown-4.9)<1e-9);
  const paused=actDefense(flying,{type:'pause'});assert.equal(advanceExact(paused,1),paused);
  assert.equal(actDefense(flying,{type:'dash',point:{x:200,y:355}}),flying);
  assert.equal(actDefense(flying,{type:'move',point:{x:30,y:45}}),flying,'ordinary clicks cannot extend or turn an active dash');
  const landed=advanceExact(flying,.2);assert.deepEqual(landed.heroPosition,{x:640,y:355});assert.equal(landed.dashTime,0);assert.deepEqual(landed.heroVelocity,{x:0,y:0});assert.equal(landed.enemies[0].hp,s.enemies[0].hp);
  const coarse=advanceExact(dash,.2,.1),fine=advanceExact(dash,.2,1/60);assert.ok(Math.abs(coarse.heroPosition.x-fine.heroPosition.x)<1e-9);assert.ok(Math.abs(coarse.dashCooldown-fine.dashCooldown)<1e-9);
  const ready=advanceExact(landed,4.8);assert.equal(ready.dashCooldown,0);assert.notEqual(actDefense(ready,{type:'dash',point:{x:400,y:355}}),ready);
});

test('dash rejects invalid, paused and noncombat commands and clamps short edge dashes',()=>{
  for(const phase of ['prep','intermission','promotion','won','lost'] as const){const s={...createDefense(1,'mage'),phase};assert.equal(actDefense(s,{type:'dash',point:{x:800,y:300}}),s);}
  const s=battlefield();s.enemies=[positionedEnemy('metal',1,900)];
  assert.equal(actDefense(s,{type:'dash',point:{x:NaN,y:300}}),s);assert.equal(actDefense(s,{type:'dash',point:{x:400,y:Infinity}}),s);assert.equal(actDefense(s,{type:'dash',point:s.heroPosition}),s);
  const paused={...s,paused:true};assert.equal(actDefense(paused,{type:'dash',point:{x:800,y:300}}),paused);
  const edge={...s,heroPosition:{x:840,y:50},heroTarget:{x:840,y:50}};
  const short=actDefense(edge,{type:'dash',point:{x:99999,y:-99999}});assert.deepEqual(short.heroTarget,{x:850,y:45});
  const arrived=stepDefense(short,.1);assert.deepEqual(arrived.heroPosition,{x:850,y:45});assert.equal(arrived.dashTime,0);assert.deepEqual(arrived.heroVelocity,{x:0,y:0});
  const attacking={...s,hero:'barbarian' as const,heroCooldown:0,enemies:[positionedEnemy('stone',1,410)]};
  const windup=stepDefense(attacking,.02);assert.ok(windup.attacks.some(a=>a.source==='hero'&&!a.fired));
  const cancelled=actDefense(windup,{type:'dash',point:{x:600,y:355}});assert.ok(!cancelled.attacks.some(a=>a.source==='hero'&&!a.fired));
});

test('ending a wave stops an unfinished dash without resetting its cooldown or moving in a modal',()=>{
  for(const wave of [1,2,4]){
    const s=battlefield();s.wave=wave;s.spawned=waveSize(1,wave);s.enemies=[{...positionedEnemy('metal',1,900),hp:0}];
    const started=actDefense(s,{type:'dash',point:{x:800,y:355}}),ended=stepDefense(started,.02);
    assert.equal(ended.phase,wave===1?'intermission':wave===2?'promotion':'won');assert.equal(ended.dashTime,0);assert.deepEqual(ended.heroVelocity,{x:0,y:0});assert.deepEqual(ended.heroTarget,ended.heroPosition);
    assert.ok(ended.heroPosition.x<started.heroTarget.x);assert.ok(ended.dashCooldown>4.9);
    const waiting=advanceExact(ended,1);assert.equal(waiting.dashCooldown,ended.dashCooldown);assert.deepEqual(waiting.heroPosition,ended.heroPosition);
    if(wave===1){const next=actDefense(waiting,{type:'start-wave'});assert.equal(next.dashCooldown,ended.dashCooldown);}
  }
});

test('cannon flight is a symmetric parabola with its apex halfway through flight',()=>{
  const launched=until(rangedBattle('cannon'),s=>s.projectiles.length>0),shell=launched.projectiles[0];
  const quarter=advanceExact(launched,shell.duration*.25),apex=advanceExact(launched,shell.duration*.5),falling=advanceExact(launched,shell.duration*.75);
  assert.ok(Math.abs(quarter.projectiles[0].height-shell.arcHeight*.75)<1e-8);assert.ok(Math.abs(apex.projectiles[0].height-shell.arcHeight)<1e-8);
  assert.ok(Math.abs(quarter.projectiles[0].height-falling.projectiles[0].height)<1e-8);
  assert.ok(Math.abs(apex.projectiles[0].position.x-(shell.from.x+shell.to.x)/2)<1e-8);
  assert.equal(apex.enemies[0].hp,launched.enemies[0].hp,'flight height never applies damage before landing');
});

test('knockback integrates friction consistently across coarse and fine simulation steps',()=>{
  const s=battlefield();s.enemies=[{...positionedEnemy('stone',1,500),knockVelocity:120,knockCooldown:1}];
  const coarse=advanceExact(s,.6,.1),fine=advanceExact(s,.6,1/60);
  const expected=500-120*(1-Math.exp(-6*.6))/6;
  assert.ok(Math.abs(coarse.enemies[0].progress-expected)<1e-8);assert.ok(Math.abs(fine.enemies[0].progress-expected)<1e-8);
  assert.ok(Math.abs(coarse.enemies[0].knockVelocity!-fine.enemies[0].knockVelocity!)<1e-8);
});

test('difficulty forecasts match actual spawn counts, order, timing, health and speed',()=>{
  for(const stage of [1,4,8])for(const mode of ['relaxed','standard','veteran'] as const)for(const wave of [1,2,3,4]){
    const config=DIFFICULTIES[mode],plan=getWavePlan(stage,wave,mode),data=getStage(stage);
    let s=createDefense(stage,'mage',0,mode);assert.equal(s.coins,(stage>=5?280:240)+config.startingCoins);assert.equal(s.difficulty,mode);
    s.wave=wave-1;s.heroCooldown=999;s=actDefense(s,{type:'start-wave'});
    const actual:EnemyKind[]=[],times:number[]=[];
    for(let i=0;i<500&&s.spawned<plan.length;i++){
      const before=s.spawned;s=stepDefense(s,.1);
      if(s.spawned>before){
        const spawned=s.enemies.at(-1)!;actual.push(spawned.kind);times.push(s.time);
        assert.equal(spawned.maxHp,Math.round(ENEMIES[spawned.kind].hp*(stage>=5?1.1+data.order*.12:.75+stage*.15)*(1+(wave-1)*.16)*config.enemyHp));
        assert.equal(spawned.speed,ENEMIES[spawned.kind].speed*config.enemySpeed);
        if(spawned.kind==='boss'||spawned.kind==='frostboss')assert.equal(spawned.path,0);
      }
    }
    assert.deepEqual(actual,plan,`${stage}/${wave}/${mode}`);assert.equal(waveSize(stage,wave,mode),actual.length);
    const spacing=Math.max(.85,1.45-data.order*.09-wave*.05)*config.spawnInterval;
    for(let i=1;i<times.length;i++)assert.ok(Math.abs(times[i]-times[i-1]-spacing)<.100001);
  }
});
