import test from 'node:test';import assert from 'node:assert/strict';
import {createFrontier,actFrontier,stepFrontier,walkable,heightAt,BEACON,EXIT,CRYSTALS,CORE,type Frontier} from './engine.ts';
import {walkContactWeight} from './heroAttack.ts';
const run=(s:Frontier,seconds:number)=>{for(let i=0;i<seconds*60;i++)s=stepFrontier(s,1/60);return s;};
test('starting and interrupting a short walk preserve the distance-based visual blend',()=>{
 assert.equal(walkContactWeight(0,0),0);assert.ok(Math.abs(walkContactWeight(.2,0)-.5)<1e-10);assert.equal(walkContactWeight(.4,0),1);
 let s=actFrontier(createFrontier('solo'),{type:'start'});s.enemies=[];s=stepFrontier(s,.01,{x:1,z:0});
 const expected=walkContactWeight(s.hero.walkDistance,s.hero.walkStartDistance);assert.ok(expected>0&&expected<1);
 const attacking=actFrontier(s,{type:'skill'});assert.equal(attacking.hero.attack!.walkWeight,expected);
 const stopping=stepFrontier(s,.01);assert.equal(stopping.hero.settle!.walkWeight,expected);
 const paused=actFrontier(stopping,{type:'pause'});assert.equal(stepFrontier(paused,.05,{x:1,z:0}),paused);
 const restarted=stepFrontier(stopping,.01,{x:1,z:0});assert.equal(restarted.hero.walkStartDistance,s.hero.walkDistance);
});
test('modes gate actions and objectives rather than only changing their names',()=>{
 let td=createFrontier('defense');td=actFrontier(td,{type:'build',pad:0});assert.equal(td.towers.length,1);assert.equal(td.gold,120);td=actFrontier(td,{type:'start'});assert.deepEqual(actFrontier(td,{type:'move',point:BEACON}).hero,td.hero);assert.deepEqual(actFrontier(td,{type:'skill'}).hero,td.hero);assert.equal(td.squad.length,0);
 let solo=actFrontier(createFrontier('solo'),{type:'start'});assert.equal(solo.enemies.length,10);assert.equal(actFrontier(solo,{type:'build',pad:0}),solo);assert.equal(solo.remaining,0);assert.equal(createFrontier('command').squad.length,3);
});
test('command units cross only the physical bridge, capture once and return across it',()=>{
 let s=actFrontier(createFrontier('command'),{type:'start'});s.remaining=0;s.wave=3;s.coreHp=999;s=actFrontier(s,{type:'move',point:BEACON});let crossing=0;const gold=s.gold;
 for(let i=0;i<1800&&s.beacon<1;i++){s=stepFrontier(s,1/60);assert.ok(walkable(s.hero));if(s.hero.x>3&&s.hero.x<9){crossing++;assert.ok(Math.abs(s.hero.z)<=2.5);}}
 assert.ok(crossing>0);assert.equal(s.beacon,1);assert.equal(s.gold,gold+120);s=stepFrontier(s,1/60);assert.equal(s.phase,'won');assert.equal(run(s,2),s);
 s={...s,phase:'playing',wave:1,remaining:1,spawnIn:999};s=actFrontier(s,{type:'move',point:CORE});s=run(s,20);assert.ok(Math.hypot(s.hero.x-CORE.x,s.hero.z-CORE.z)<.2);
});
test('solo movement and dash cannot cross water away from the bridge or leave the island',()=>{
 let s=actFrontier(createFrontier('solo'),{type:'start'});s.enemies=[];s.hero.x=2.5;s.hero.z=12;s.hero.heading=Math.PI/2;s.hero.target={x:2.5,z:12};
 s=actFrontier(s,{type:'dash'});assert.ok(s.hero.x<=3);for(let i=0;i<600;i++)s=stepFrontier(s,1/60,{x:1,z:0});assert.ok(walkable(s.hero));assert.ok(s.hero.x<=3);
 assert.equal(heightAt(6,0),.36);assert.ok(heightAt(-15,-20)>heightAt(-15,20));assert.equal(walkable({x:30,z:0}),false);
});
test('pause, invalid time and terminal states freeze combat and abilities',()=>{
 let s=actFrontier(actFrontier(createFrontier('solo'),{type:'start'}),{type:'pause'});const snapshot=JSON.stringify(s);assert.equal(stepFrontier(s,.05,{x:1,z:1}),s);for(const type of ['attack','skill','dash','interact'] as const)assert.equal(actFrontier(s,{type}),s);assert.equal(JSON.stringify(s),snapshot);s=actFrontier(s,{type:'pause'});for(const t of [0,-1,NaN,Infinity])assert.equal(stepFrontier(s,t),s);
});
test('speed doubles simulation progression and cooldowns without wall-clock effects',()=>{
 const a=actFrontier(createFrontier('solo'),{type:'start'});a.enemies=[];a.hero.skill=5;const b=actFrontier(a,{type:'speed'});const slow=run(a,1),fast=run(b,1);assert.ok(Math.abs(fast.time-slow.time*2)<1e-8);assert.ok(Math.abs(fast.hero.skill-3)<1e-8);assert.equal(a.hero.skill,5);
});
test('solo attacks, cooldowns, XP, health and crystals produce one reward and explicit extraction',()=>{
 let s=actFrontier(createFrontier('solo'),{type:'start'});s.enemies=[{id:99,x:s.hero.x,z:s.hero.z-2,hp:20,cooldown:0,path:0}];s=actFrontier(s,{type:'attack'});s=run(s,.3);assert.equal(s.kills,1);assert.equal(s.xp,30);const gold=s.gold;s=actFrontier(s,{type:'attack'});assert.equal(s.gold,gold);
 s=run(s,.4);s.hero.cooldown=0;s.enemies=[{id:100,x:s.hero.x,z:s.hero.z-2,hp:20,cooldown:0,path:0}];s=actFrontier(s,{type:'attack'});s=run(s,.3);assert.equal(s.level,2);assert.equal(s.hero.maxHp,115);assert.equal(s.xp,0);
 for(const p of CRYSTALS){s.hero.x=p.x;s.hero.z=p.z;s=actFrontier(s,{type:'interact'});}assert.equal(s.crystals.length,3);assert.equal(actFrontier(s,{type:'interact'}).crystals.length,3);s.hero.x=EXIT.x;s.hero.z=EXIT.z;s=actFrontier(s,{type:'interact'});assert.equal(s.phase,'playing');s.kills=6;s=actFrontier(s,{type:'interact'});assert.equal(s.phase,'won');
});
test('tower defense wins only after three waves, loses on the core, and command also needs capture',()=>{
 let s=actFrontier(createFrontier('defense'),{type:'start'});s.wave=3;s.remaining=0;s.enemies=[];assert.equal(stepFrontier(s,.02).phase,'won');const c={...s,mode:'command' as const,beacon:0};assert.equal(stepFrontier(c,.02).phase,'playing');s.enemies=[{id:99,...CORE,hp:10,cooldown:0,path:3}];s.coreHp=5;assert.equal(stepFrontier(s,.02).phase,'playing');assert.equal(run(s,.4).phase,'lost');
});

test('ballista aims only its heading, waits for release and applies damage on physical impact',()=>{
 let s=actFrontier(actFrontier(createFrontier('defense'),{type:'build',pad:0}),{type:'start'});s.remaining=1;s.spawnIn=999;
 const p={x:-21,z:5};s.enemies=[{id:999,...p,hp:200,cooldown:999,path:1}];s.towers[0].heading=Math.PI;
 s=stepFrontier(s,.01);assert.equal(s.towers[0].actionTime,0);assert.equal(s.enemies[0].hp,200);assert.equal(s.bolts.length,0);
 for(let i=0;i<9;i++)s=stepFrontier(s,.01);assert.equal(s.bolts.length,0);assert.equal(s.enemies[0].hp,200);
 s=stepFrontier(s,.01);assert.equal(s.bolts.length,1);assert.equal(s.enemies[0].hp,200);const bolt=s.bolts[0];assert.ok(Math.abs(bolt.position.y-2.6208)<1e-6);assert.ok(Math.abs(bolt.position.z-(12-2.0072))<1e-6);
 const releasedHeading=s.towers[0].heading;s=stepFrontier(s,.02);assert.equal(s.towers[0].heading,releasedHeading);assert.notDeepEqual(s.bolts[0].position,bolt.position);
 for(let i=0;i<40&&s.enemies[0].hp===200;i++)s=stepFrontier(s,.01);assert.equal(s.enemies[0].hp,177);assert.equal(s.enemies[0].hitAt,s.time);assert.ok(Number.isFinite(s.enemies[0].hitHeading));const impact=s.effects.find(e=>e.kind==='impact')!;assert.ok(impact);assert.notDeepEqual(impact.from,impact.to);assert.equal(impact.life,.46);assert.equal(s.bolts.length,0);
});
test('ballista locks target and damage; target death, pause, upgrade and speed do not duplicate shots',()=>{
 let s=actFrontier(actFrontier(createFrontier('defense'),{type:'build',pad:0}),{type:'start'});s.remaining=1;s.spawnIn=999;s.gold=200;
 s.enemies=[{id:999,x:-21,z:5,hp:200,cooldown:999,path:1},{id:1000,x:-22,z:4,hp:200,cooldown:999,path:1}];s.towers[0].heading=Math.PI;
 for(let i=0;i<11;i++)s=stepFrontier(s,.01);assert.equal(s.bolts.length,1);const snapshot=JSON.stringify(s.bolts);
 const paused=actFrontier(s,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);assert.equal(JSON.stringify(paused.bolts),snapshot);
 s=actFrontier(s,{type:'build',pad:0});assert.equal(s.towers[0].level,2);assert.equal(s.bolts[0].damage,23);
 s.enemies=s.enemies.filter(e=>e.id!==999);s=stepFrontier(s,.01);assert.equal(s.bolts.length,0);assert.equal(s.enemies[0].hp,200);
 for(let i=0;i<30;i++)s=stepFrontier(s,.01);assert.equal(s.towers[0].actionTime,null);
 const double=actFrontier(s,{type:'speed'});const once=stepFrontier(double,.02);const twice=stepFrontier(stepFrontier(s,.02),.02);assert.ok(Math.abs(once.towers[0].cooldown-twice.towers[0].cooldown)<1e-8);
});
test('ballista cancels a dead target during preparation and turns by a bounded shortest arc',()=>{
 let s=actFrontier(actFrontier(createFrontier('defense'),{type:'build',pad:0}),{type:'start'});s.remaining=1;s.spawnIn=999;s.towers[0].heading=Math.PI;
 s.enemies=[{id:999,x:-21,z:5,hp:100,cooldown:999,path:1}];s=stepFrontier(s,.01);s.enemies=[];s=run(s,.5);assert.equal(s.bolts.length,0);
 s.towers[0].heading=-Math.PI+.01;s.enemies=[{id:1001,x:-21.5,z:5,hp:100,cooldown:999,path:1}];const old=s.towers[0].heading;s=stepFrontier(s,.01);assert.ok(Math.abs(s.towers[0].heading-old)<=.050001);
});

test('hero stop clock follows pause/speed and is cleared by resume, attack and dash',()=>{
 let s=actFrontier(createFrontier('solo'),{type:'start'});s.enemies=[];
 s=stepFrontier(s,.03,{x:1,z:0});const distance=s.hero.walkDistance,position={x:s.hero.x,z:s.hero.z};
 const walking=s;s=stepFrontier(s,.01);assert.equal(s.hero.settle?.time,0);assert.ok(Math.abs(s.hero.settle!.walkTime-distance/1.6*.8)<1e-8);assert.equal(walking.hero.settle,undefined);
 assert.equal(s.hero.x,position.x);assert.equal(s.hero.z,position.z);
 const stopped=s;s=stepFrontier(s,.03);assert.equal(stopped.hero.settle!.time,0);assert.equal(s.hero.settle!.time,.03);
 const paused=actFrontier(s,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);
 const fast=stepFrontier(actFrontier(s,{type:'speed'}),.03);assert.ok(Math.abs(fast.hero.settle!.time-.09)<1e-8);
 assert.equal(stepFrontier(s,.01,{x:1,z:0}).hero.settle,undefined);
 assert.equal(actFrontier(s,{type:'skill'}).hero.settle,undefined);
 const dashed=actFrontier(s,{type:'dash'});assert.equal(dashed.hero.settle,undefined);assert.equal(stepFrontier(dashed,.01).hero.settle,undefined);
 for(let i=0;i<8;i++)s=stepFrontier(s,.03);assert.equal(s.hero.settle,undefined);
});

test('a lethal ballista impact records one fall at the actual target with the incoming direction',()=>{
 let s=actFrontier(createFrontier('defense'),{type:'start'});s.remaining=1;s.spawnIn=999;s.enemies=[{id:77,x:-20,z:5,hp:20,maxHp:60,cooldown:999,path:0}];s.bolts=[{id:100,pad:0,targetId:77,position:{x:-21,y:1.1,z:5},previous:{x:-22,y:1.1,z:5},damage:23,life:1}];s=stepFrontier(s,.05);assert.equal(s.enemies.length,0);assert.equal(s.kills,1);assert.equal(s.fallen?.length,1);assert.ok(s.effects.some(e=>e.kind==='impact'));assert.ok(Math.abs(s.fallen![0].enemy.hitHeading!-Math.PI/2)<1e-6);const gold=s.gold;s=stepFrontier(s,.05);assert.equal(s.kills,1);assert.equal(s.gold,gold);
});
