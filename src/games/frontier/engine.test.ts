import test from 'node:test';import assert from 'node:assert/strict';
import {createFrontier,actFrontier,stepFrontier,walkable,heightAt,BEACON,EXIT,CRYSTALS,CORE,type Frontier} from './engine.ts';
const run=(s:Frontier,seconds:number)=>{for(let i=0;i<seconds*60;i++)s=stepFrontier(s,1/60);return s;};
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
 let s=actFrontier(createFrontier('solo'),{type:'start'});s.enemies=[{id:99,x:s.hero.x,z:s.hero.z-2,hp:20,cooldown:0,path:0}];s=actFrontier(s,{type:'attack'});assert.equal(s.kills,1);assert.equal(s.xp,30);const gold=s.gold;s=actFrontier(s,{type:'attack'});assert.equal(s.gold,gold);
 s.hero.cooldown=0;s.enemies=[{id:100,x:s.hero.x,z:s.hero.z-2,hp:20,cooldown:0,path:0}];s=actFrontier(s,{type:'attack'});assert.equal(s.level,2);assert.equal(s.hero.maxHp,115);assert.equal(s.xp,0);
 for(const p of CRYSTALS){s.hero.x=p.x;s.hero.z=p.z;s=actFrontier(s,{type:'interact'});}assert.equal(s.crystals.length,3);assert.equal(actFrontier(s,{type:'interact'}).crystals.length,3);s.hero.x=EXIT.x;s.hero.z=EXIT.z;s=actFrontier(s,{type:'interact'});assert.equal(s.phase,'playing');s.kills=6;s=actFrontier(s,{type:'interact'});assert.equal(s.phase,'won');
});
test('tower defense wins only after three waves, loses on the core, and command also needs capture',()=>{
 let s=actFrontier(createFrontier('defense'),{type:'start'});s.wave=3;s.remaining=0;s.enemies=[];assert.equal(stepFrontier(s,.02).phase,'won');const c={...s,mode:'command' as const,beacon:0};assert.equal(stepFrontier(c,.02).phase,'playing');s.enemies=[{id:99,...CORE,hp:10,cooldown:0,path:3}];s.coreHp=5;assert.equal(stepFrontier(s,.02).phase,'lost');
});
