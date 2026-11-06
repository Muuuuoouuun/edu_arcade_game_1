import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefense, actDefense, stepDefense, positionOnPath } from './engine.ts';
import { projectileScreenPosition, attackOctant, dwarfHammerFrame, DASH_DAMAGE, distanceToSegment, knockbackPresentation } from './action.ts';
import type { Enemy, Projectile } from './types.ts';

function battle(hp=1000) {
  const state=createDefense(4,'dwarf');
  state.phase='wave';state.wave=1;state.spawned=999;state.heroCooldown=999;
  state.heroPosition={x:60,y:170};state.heroTarget={...state.heroPosition};
  const enemy=(id:number,path:number,progress:number):Enemy=>({id,kind:'sprout',...positionOnPath(path,progress,4),path,progress,hp,maxHp:hp,speed:0,wet:0,burn:0,slow:0,hit:0});
  state.enemies=[enemy(901,0,110),enemy(902,1,100)];
  return state;
}

test('dash sweeps across a target between frames, hits it once, and leaves other lanes untouched',()=>{
  const original=battle();
  let state=actDefense(original,{type:'dash',point:{x:260,y:170}});
  state=stepDefense(state,.1);
  assert.equal(state.enemies[0].hp,1000-DASH_DAMAGE);
  assert.ok((state.enemies[0].knockVelocity??0)>0);
  assert.equal(state.enemies[1].hp,1000);
  for(let i=0;i<3;i++)state=stepDefense(state,.1);
  assert.equal(state.enemies[0].hp,1000-DASH_DAMAGE);
  assert.deepEqual(state.dashHitIds,[901]);
  assert.equal(original.enemies[0].hp,1000);
  assert.deepEqual(original.dashHitIds,[]);
  assert.equal(actDefense(state,{type:'dash',point:{x:60,y:170}}),state,'cooldown cannot be bypassed');
});

test('dash kills award bounty only once, and pausing mid-dash freezes damage and travel',()=>{
  let state=actDefense(battle(30),{type:'dash',point:{x:260,y:170}});
  const coins=state.coins;
  const paused=actDefense(state,{type:'pause'});
  assert.equal(stepDefense(paused,.1),paused);
  state=stepDefense(state,.1);
  assert.equal(state.kills,1);assert.equal(state.coins,coins+14);
  assert.ok(!state.enemies.some(e=>e.id===901));
  for(let i=0;i<4;i++)state=stepDefense(state,.1);
  assert.equal(state.kills,1);assert.equal(state.coins,coins+14);
});

test('swept collision uses the bounded segment rather than its infinite line',()=>{
  const from={x:10,y:10},to={x:100,y:10};
  assert.equal(distanceToSegment({x:55,y:20},from,to),10);
  assert.equal(distanceToSegment({x:150,y:10},from,to),50);
  assert.equal(distanceToSegment({x:4,y:2},{x:4,y:2},{x:4,y:2}),0);
  assert.equal(knockbackPresentation(24).bracing,true);
  assert.equal(knockbackPresentation(150).streak,true);
  assert.equal(knockbackPresentation(0).bracing,false);
});


test('attack octants preserve vertical aim, wrap west and ignore invalid or coincident targets',()=>{
 const from={x:300,y:200};
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4;
  assert.equal(attackOctant(from,{x:from.x+Math.cos(a)*50,y:from.y+Math.sin(a)*50}),i);
 }
 assert.equal(attackOctant(from,{x:300.1,y:100}),6);
 assert.equal(attackOctant(from,{x:200,y:199.9}),4);
 assert.equal(attackOctant(from,from),null);
 assert.equal(attackOctant(from,{x:NaN,y:200}),null);
 assert.equal(attackOctant(from,{x:Infinity,y:200}),null);
});


test('muzzle presentation starts at the barrel and converges to the unchanged landing point',()=>{
 const p={position:{x:100,y:200},velocity:{x:150,y:60},height:0,arcHeight:80,duration:.6,progress:0} as Projectile;
 const offset={x:20,y:-35};
 const start=projectileScreenPosition(p,offset);assert.equal(start.x,120);assert.equal(start.y,138);
 const middle=projectileScreenPosition({...p,position:{x:145,y:218},progress:.5,height:80},offset);
 assert.equal(middle.x,155);assert.equal(middle.y,93.5);
 const landed={...p,position:{x:190,y:236},progress:1};
 assert.equal(projectileScreenPosition(landed,offset).x,190);
 assert.equal(projectileScreenPosition(landed,offset).y,209);
 assert.deepEqual(p.position,{x:100,y:200});
 assert.equal(projectileScreenPosition(p).y,173,'other projectiles keep the existing presentation');
});

test('ballista launch origin fades to the unchanged collision path',()=>{
 const from={x:300,y:200},to={x:450,y:240};
 const p={from,to,position:from,progress:0,duration:.4,arcHeight:0,height:0,velocity:{x:375,y:100}} as Projectile;
 const offset={x:12,y:-20};
 assert.deepEqual(projectileScreenPosition(p,offset),{x:312,y:153,angle:Math.atan2(150,345)*180/Math.PI});
 const landed={...p,position:to,progress:1};
 assert.equal(projectileScreenPosition(landed,offset).x,projectileScreenPosition(landed).x);
 assert.equal(projectileScreenPosition(landed,offset).y,projectileScreenPosition(landed).y);
 assert.equal(projectileScreenPosition(landed,offset).angle,projectileScreenPosition(landed).angle,'a piercing arrow must point along its actual velocity once the launch offset has faded');
 assert.equal(projectileScreenPosition({...landed,progress:1.2},offset).angle,projectileScreenPosition(landed).angle);
});


test('grounded hammer loads before contact and settles to neutral on simulation time',()=>{
 const attack={elapsed:0,hitAt:.24,duration:.52};
 const samples=[[0,0],[.02,0],[.05,1],[.12,2],[.19,3],[.23999,3],[.24,4],[.28,4],[.32,5],[.40,6],[.47,7],[.51,0],[.52,0]];
 for(const [elapsed,frame] of samples){
  assert.equal(dwarfHammerFrame({...attack,elapsed}),frame,`${elapsed}s`);
  assert.equal(dwarfHammerFrame({...attack,elapsed:elapsed*2,hitAt:.48,duration:1.04}),frame,'phase mapping follows authored hitAt/duration');
 }
 for(let t=0;t<.24;t+=.002){assert.ok(dwarfHammerFrame({...attack,elapsed:t})<4);assert.equal(dwarfHammerFrame({...attack,elapsed:t},true),0);}
 assert.equal(dwarfHammerFrame({...attack,elapsed:.24},true),4,'reduced motion retains the contact cue');
 assert.equal(dwarfHammerFrame({...attack,elapsed:.51},true),0);
 for(const bad of [NaN,Infinity,-1])assert.equal(dwarfHammerFrame({...attack,elapsed:bad}),0);
 assert.equal(dwarfHammerFrame({...attack,hitAt:0}),0);
 assert.equal(dwarfHammerFrame({...attack,duration:.2}),0);
});

test('hammer pose freezes with pause and advances with simulation speed without changing damage',()=>{
 let state=battle();state.heroCooldown=0;
 state=stepDefense(state,.02);const attack=state.attacks.find(a=>a.source==='hero')!;assert.ok(attack);
 const paused=actDefense(state,{type:'pause'});assert.equal(stepDefense(paused,.2),paused);
 assert.equal(dwarfHammerFrame(paused.attacks[0]),dwarfHammerFrame(attack));
 const accelerated=actDefense(state,{type:'speed'});
 // The browser accumulates elapsed * speed before stepping; the engine takes simulation time.
 const fast=stepDefense(accelerated,.04*accelerated.speed),normal=stepDefense(state,.08);
 assert.equal(fast.attacks[0].elapsed,normal.attacks[0].elapsed);
 assert.equal(dwarfHammerFrame(fast.attacks[0]),dwarfHammerFrame(normal.attacks[0]));
 let hit=state;for(let i=0;i<13;i++)hit=stepDefense(hit,.02);
 assert.ok(hit.enemies.some(e=>e.hp<1000));assert.ok(hit.attacks[0].fired);
 assert.ok(dwarfHammerFrame(hit.attacks[0])>=4);
});
