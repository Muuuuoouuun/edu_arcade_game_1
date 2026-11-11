import test from 'node:test';import assert from 'node:assert/strict';import {actFrontier,createFrontier,stepFrontier,CORE,type Frontier} from './engine.ts';import {WOOD_ATTACK} from './woodAttack.ts';
const advance=(s:Frontier,t:number,dt=.01)=>{for(let i=0;i<Math.round(t/dt);i++)s=stepFrontier(s,dt);return s;};
function fight(mode:'solo'|'defense'='solo'){const s=actFrontier(createFrontier(mode),{type:'start'});s.spawnIn=999;s.remaining=1;s.hero.x=-14;s.hero.z=19.4;s.hero.target={x:-14,z:19.4};s.enemies=[{id:90,x:-14,z:mode==='solo'?17.7:19.3,hp:200,maxHp:200,cooldown:0,path:3,heading:0,walkDistance:.4}];return s;}
test('wood strike telegraphs, contacts once at 0.28s, recovers and repeats at one second',()=>{
 let s=stepFrontier(fight(),.01);assert.equal(s.hero.hp,100);assert.equal(s.enemies[0].attack?.time,0);const original=JSON.stringify(s);
 const prep=advance(s,.27);assert.equal(prep.hero.hp,100);assert.equal(prep.effects.length,0);const hit=stepFrontier(prep,.01);assert.equal(hit.hero.hp,92);assert.equal(hit.effects.filter(e=>e.kind==='club').length,1);assert.equal(JSON.stringify(s),original,'cloned attack state');
 s=advance(hit,.32);assert.equal(s.enemies[0].attack,undefined);assert.equal(s.hero.hp,92);s=advance(s,.4);assert.ok(s.enemies[0].attack);assert.ok(s.enemies[0].attack!.time<.02);assert.equal(s.hero.hp,92);s=advance(s,.28);assert.equal(s.hero.hp,84);
});
test('moving out of the committed cone or dashing away avoids contact; attack does not chase or retarget',()=>{
 for(const dodge of ['range','behind','dash'] as const){let s=stepFrontier(fight(),.01),enemy={x:s.enemies[0].x,z:s.enemies[0].z},heading=s.enemies[0].heading;
  if(dodge==='dash'){s.hero.heading=Math.PI/2;s=actFrontier(s,{type:'dash'});}else{s.hero.z=dodge==='range'?23:16.2;s.hero.target={x:s.hero.x,z:s.hero.z};}
  s=advance(s,.3);assert.equal(s.hero.hp,100);assert.equal(s.enemies[0].x,enemy.x);assert.equal(s.enemies[0].z,enemy.z);assert.equal(s.enemies[0].heading,heading);assert.equal(s.enemies[0].attack?.hit,true);assert.equal(s.effects.filter(e=>e.kind==='club').length,0);
 }
});
test('death before contact cancels damage; independent attackers never multiply a hit',()=>{
 let s=fight();s.enemies.push({...s.enemies[0],id:91,cooldown:.15});s=stepFrontier(s,.01);s.enemies[0].hp=0;s=advance(s,.3);assert.equal(s.hero.hp,100);assert.equal(s.enemies.length,1);s=advance(s,.15);assert.equal(s.hero.hp,92);s=advance(s,.3);assert.equal(s.hero.hp,92);
});
test('pause, speed and coarse crossing preserve one contact and terminal core loss',()=>{
 let s=stepFrontier(fight('defense'),.01);const paused=actFrontier(s,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);assert.equal(s.coreHp,180);
 const slow=advance(s,.3,.05),fast=advance({...s,speed:2},.15,.05);assert.equal(slow.coreHp,170);assert.equal(fast.coreHp,170);assert.ok(Math.abs(slow.enemies[0].attack!.time-fast.enemies[0].attack!.time)<1e-9);
 s={...s,coreHp:5};assert.equal(advance(s,.25).phase,'playing');assert.equal(advance(s,.3).phase,'lost');
});
test('core attackers plant outside the gate before preparing and do not switch to an approaching hero mid-strike',()=>{
 let s=fight('defense');s.enemies[0].z=18;s=advance(s,1);assert.ok(Math.hypot(s.enemies[0].x-CORE.x,s.enemies[0].z-CORE.z)>1.6);assert.ok(s.enemies[0].attack);assert.equal(s.enemies[0].moving,false);
 const command={...s,mode:'command' as const};command.hero.x=s.enemies[0].x;command.hero.z=s.enemies[0].z;command.hero.cooldown=999;command.hero.target={x:command.hero.x,z:command.hero.z};command.squad=[];const hit=advance(command,.3);assert.equal(hit.hero.hp,100);assert.equal(hit.coreHp,170);
});

test('a moving dash avoids contact only after the hero physically leaves the committed strike',()=>{
 function starting(){let s=stepFrontier(fight(),.01);s.hero.heading=Math.PI/2;return s;}
 let early=starting();early.enemies[0].attack!.time=.27;early=actFrontier(early,{type:'dash'});early=stepFrontier(early,.01);assert.equal(early.hero.hp,92,'no automatic invulnerability during the early path');assert.ok(early.hero.x>-14&&early.hero.x<-13);
 let timely=starting();timely.enemies[0].attack!.time=.15;timely=actFrontier(timely,{type:'dash'});timely=advance(timely,.13);assert.equal(timely.hero.hp,100,'an actually cleared strike misses');assert.ok(timely.hero.x>-11);
});
