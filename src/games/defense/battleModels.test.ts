import test from 'node:test';
import assert from 'node:assert/strict';
import { actDefense, createDefense, positionOnPath, stepDefense, waveSize } from './engine.ts';
import { battleActorPoses } from './battleModels.ts';
import type { DefenseState, Enemy, HeroId, Tower } from './types.ts';

const enemy = (id=100):Enemy => ({id,kind:'wood',...positionOnPath(0,410),progress:410,path:0,hp:10000,maxHp:10000,speed:0,wet:0,burn:0,slow:0,hit:0});
function combat(hero:HeroId='barbarian'):DefenseState {
 return {...createDefense(1,hero),phase:'wave',wave:1,spawned:waveSize(1,1),spawnTimer:99,enemies:[enemy()]};
}
function pose(state:DefenseState,key='hero') {
 const found=battleActorPoses(state).find(actor=>actor.key===key);assert.ok(found,`missing ${key}`);return found;
}
function freezeDeep(value:unknown):void {
 if(value&&typeof value==='object'){
  for(const child of Object.values(value))freezeDeep(child);
  Object.freeze(value);
 }
}

test('only supported heroes, wood enemies and unlocked level-two piercing crossbows use models',()=>{
 const initial=createDefense(1,'barbarian');
 const hired=actDefense(initial,{type:'hire',hero:'dwarf'});
 const supported={...hired,enemies:[enemy(),{...enemy(101),kind:'sprout' as const}]};
 assert.deepEqual(battleActorPoses(supported).map(({key,model})=>[key,model]),[['hero','kar'],['merc','bron'],['enemy-100','wood']]);
 for(const hero of ['mage','elf','tao','druid'] as const)assert.equal(battleActorPoses(createDefense(1,hero)).length,0);
 const variants:Tower[]=[
  {slot:2,kind:'crossbow',level:1,branch:null,cooldown:0},
  {slot:2,kind:'crossbow',level:2,branch:'pierce',cooldown:0},
  {slot:2,kind:'crossbow',level:2,branch:'rapid',cooldown:0},
  {slot:2,kind:'crossbow',level:3,branch:'pierce',cooldown:0},
  {slot:2,kind:'magic',level:2,branch:'fire',cooldown:0},
  {slot:6,kind:'crossbow',level:2,branch:'pierce',cooldown:0},
  {slot:999,kind:'crossbow',level:2,branch:'pierce',cooldown:0},
 ];
 for(const [index,tower] of variants.entries()){
  const result=battleActorPoses({...createDefense(1,'mage'),towers:[tower]});
  assert.deepEqual(result.map(actor=>actor.key),index===1?['tower-2']:[],JSON.stringify(tower));
 }
});

test('manual skills start Kar and Bron at impact and recover while engine damage happens only once',()=>{
 for(const [hero,contact,duration] of [['barbarian',.28,.56],['dwarf',10/30,.8]] as const){
  const initial={...combat(hero),heroCooldown:99};
  const cast=actDefense(initial,{type:'skill'}),start=pose(cast);
  assert.ok(cast.enemies[0].hp<initial.enemies[0].hp);
  assert.equal(cast.attacks.length,0);
  assert.equal(start.phase,'skill');assert.equal(start.clipTime,contact);
  let recovering=cast;
  for(let i=0;i<5;i++)recovering=stepDefense(recovering,.05);
  const middle=pose(recovering);
  assert.equal(middle.phase,'skill');assert.ok(middle.clipTime>contact&&middle.clipTime<duration);
  assert.equal(recovering.enemies[0].hp,cast.enemies[0].hp);
  for(let i=0;i<6;i++)recovering=stepDefense(recovering,.05);
  assert.equal(pose(recovering).phase,'idle');assert.equal(pose(recovering).clip,undefined);
 }
});

test('dash faces travel and suppresses the already-fired attack recovery without deleting combat history',()=>{
 let state=stepDefense(combat(),.01);
 for(let i=0;i<40&&!state.attacks.some(attack=>attack.source==='hero'&&attack.fired);i++)state=stepDefense(state,.01);
 const attack=state.attacks.find(attack=>attack.source==='hero'&&attack.fired);assert.ok(attack);
 assert.ok(attack.to.x<state.heroPosition.x,'the completed hit faces left');
 const dashed=actDefense(state,{type:'dash',point:{x:state.heroPosition.x+100,y:state.heroPosition.y}});
 assert.ok(dashed.dashTime>0);assert.ok(dashed.heroVelocity.x>0);
 assert.ok(dashed.attacks.some(retained=>retained.id===attack.id&&retained.fired));
 const actor=pose(dashed);
 assert.equal(actor.phase,'dash');assert.equal(actor.clip,undefined);assert.equal(actor.clipTime,0);
 assert.ok(Math.abs(actor.heading-Math.PI/2)<1e-10);
});

test('a mercenary that reaches the engine-clamped board boundary stops walking',()=>{
 let state=actDefense(createDefense(1,'mage'),{type:'hire',hero:'barbarian'});
 state=actDefense(state,{type:'move',point:{x:850,y:555}});
 for(let i=0;i<240;i++)state=stepDefense(state,.05);
 assert.deepEqual(state.heroPosition,{x:850,y:555});
 assert.deepEqual(state.mercenaryPosition,{x:875,y:565});
 const actor=pose(state,'merc');
 assert.equal(actor.phase,'idle');assert.equal(actor.clip,undefined);
});

test('render projection is immutable, pause holds the same pose, and reduced motion disables all clips',()=>{
 const initial=stepDefense(combat(),.01),snapshot=structuredClone(initial);
 freezeDeep(initial);
 const projected=battleActorPoses(initial);
 assert.deepEqual(initial,snapshot);
 assert.deepEqual(battleActorPoses(initial),projected);
 projected[0].position.x=-999;
 assert.deepEqual(initial,snapshot,'render positions do not alias simulation positions');
 const before=battleActorPoses(initial),paused=actDefense(initial,{type:'pause'});
 assert.deepEqual(battleActorPoses(stepDefense(paused,.1)),before);
 for(const actor of battleActorPoses(initial,1,true)){
  assert.equal(actor.phase,'idle');assert.equal(actor.clip,undefined);
  assert.equal(actor.clipTime,0);assert.equal(actor.hit,0);
 }
 assert.deepEqual(initial,snapshot);
});

test('a frozen piercing tower holds its unlaunched clip while the simulation clock advances',()=>{
 let state={...combat('mage'),heroCooldown:99};
 state=actDefense(state,{type:'build',slot:2,kind:'crossbow'});
 state=actDefense(state,{type:'upgrade',slot:2,branch:'pierce'});
 state=stepDefense(state,.01);
 const before=pose(state,'tower-2');assert.equal(before.phase,'attack');
 const frozen=stepDefense({...state,freeze:1},.05);
 assert.ok(frozen.time>state.time);
 assert.deepEqual(pose(frozen,'tower-2'),before);
});
