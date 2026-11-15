import test from 'node:test';
import assert from 'node:assert/strict';
import { actDefense, createDefense, positionOnPath, stepDefense, waveSize } from './engine.ts';
import { ENEMIES } from './data.ts';
import type { CombatAttack, DefenseState, Enemy } from './types.ts';
import { sampleAttackAnimation } from './animationTiming.ts';
import { advanceClock, createClock, stopAt } from '../../components/battleClock.ts';

const clip={duration:1.2,contact:.4};
const enemy=(id:number,progress:number):Enemy=>({id,kind:'metal',...positionOnPath(0,progress,1),hp:ENEMIES.metal.hp,maxHp:ENEMIES.metal.hp,progress,path:0,speed:0,wet:0,burn:0,slow:0,hit:0});
function combat(hero:'mage'|'barbarian'='barbarian'):DefenseState {
 const s=createDefense(1,hero);return {...s,phase:'wave',wave:1,spawned:waveSize(1,1),spawnTimer:99,enemies:[enemy(1,410)],heroCooldown:0};
}
const hero={source:'hero'} as const;
function sample(s:DefenseState){const result=sampleAttackAnimation(s,hero,clip);assert.ok(result);return result;}

test('authoritative launch maps to the authored contact and the rest of the clip ends with the engine attack',()=>{
 const initial=stepDefense(combat(),.01),attack=initial.attacks.find(a=>a.source==='hero');assert.ok(attack);
 const at=(elapsed:number,fired:boolean)=>({...initial,attacks:[{...attack,elapsed,fired}]});
 assert.equal(sample(at(0,false)).clipTime,0);
 assert.ok(Math.abs(sample(at(attack.hitAt/2,false)).clipTime-clip.contact/2)<1e-10);
 assert.equal(sample(at(attack.hitAt,true)).clipTime,clip.contact);
 assert.equal(sample(at(attack.duration,true)).clipTime,clip.duration);
 assert.equal(sample(at(attack.hitAt,true)).phase,'recovery');
});

test('actual pause and cancel use the combat snapshot rather than an independent animation clock',()=>{
 const initial=stepDefense(combat(),.01),before=sample(initial);
 const paused=actDefense(initial,{type:'pause'}),after=stepDefense(paused,.1);
 assert.deepEqual(sample(after),before);
 const moved=actDefense(initial,{type:'move',point:{x:800,y:500}});
 assert.equal(sampleAttackAnimation(moved,hero,clip),null);
});

test('hit-stop advances no simulation steps, so the same combat snapshot keeps the same pose',()=>{
 const initial=stepDefense(combat(),.01),before=sample(initial);
 const stopped=stopAt(createClock(0),0,.2),{steps}=advanceClock(stopped,.1,2);
 assert.equal(steps,0);
 let current=initial;for(let i=0;i<steps;i++)current=stepDefense(current,1/60);
 assert.deepEqual(sample(current),before);
});

test('a frozen unlaunched tower holds its pose while the simulation runs',()=>{
 let s=combat('mage');s.heroCooldown=99;s=actDefense(s,{type:'build',slot:2,kind:'crossbow'});
 s.enemies=[enemy(1,410)];s=stepDefense(s,.01);
 const owner={source:'tower',slot:2} as const,before=sampleAttackAnimation(s,owner,clip);assert.ok(before);
 const frozen=stepDefense({...s,freeze:1},.05),after=sampleAttackAnimation(frozen,owner,clip);
 assert.ok(frozen.time>s.time);assert.deepEqual(after,before);
});

test('engine retargeting is reflected by identity and current tower aim, without inventing a hit',()=>{
 let s=combat('mage');s.heroCooldown=99;s=actDefense(s,{type:'build',slot:2,kind:'crossbow'});s.enemies=[enemy(1,410),enemy(2,430)];
 const start=stepDefense(s,.01),before=sampleAttackAnimation(start,{source:'tower',slot:2},clip);assert.ok(before);
 const alive=start.enemies.filter(e=>e.id!==before.targetId);let current={...start,enemies:alive};
 for(let i=0;i<20&&!current.projectiles.length;i++)current=stepDefense(current,.01);
 const after=sampleAttackAnimation(current,{source:'tower',slot:2},clip);assert.ok(after);
 assert.equal(after.attackId,before.attackId);assert.equal(after.targetId,alive[0].id);assert.deepEqual(after.target,current.towers[0].aim);
 assert.equal(after.phase,'recovery');assert.equal(current.projectiles.length,1);
});

test('the latest attack wins overlap, owners are isolated, invalid calibration is rejected',()=>{
 const s=stepDefense(combat(),.01),a=s.attacks[0];assert.ok(a);
 const newer:CombatAttack={...a,id:a.id+1,elapsed:0,fired:false};
 const mixed={...s,attacks:[{...a,fired:true},newer,{...newer,id:newer.id+1,source:'tower' as const,sourceSlot:1}]};
 assert.equal(sample(mixed).attackId,newer.id);
 assert.equal(sampleAttackAnimation(mixed,{source:'tower',slot:2},clip),null);
 assert.equal(sampleAttackAnimation(mixed,hero,{duration:1,contact:1}),null);
 assert.equal(sampleAttackAnimation(mixed,hero,{duration:1,contact:NaN}),null);
});
