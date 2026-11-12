// Cycle 05 (low-input): a TELEGRAPHED local tower freeze on the PR #104 elite candidate "frost tracker".
// Cycle 02 found a weak, untelegraphed local slow invisible. This tests the opposite end:
//   - the first frost wolf of waves 3 and 4 in each snow stage becomes a tracker (HP x1.5, same speed);
//   - when a built tower is within 100, it starts a 1.5 s "frost breath" on the nearest one;
//   - if the hero comes within 120 during the breath, it is cancelled (4 s before it can try again);
//   - otherwise that one tower is frozen for 3 s (6 s before the next breath).
// Implemented as a post-step layer over an unmodified engine copy (../02/exp-copy, hooks unused).
// Run: ../02/make-exp-copy.sh && node --experimental-strip-types frost-tracker.ts > frost-tracker.json
import {createDefense,actDefense,stepDefense} from '../02/exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths,getSlots} from '../02/exp-copy/src/games/defense/data.ts';
import type {DefenseAction,DefenseState,HeroId,Point} from '../02/exp-copy/src/games/defense/types.ts';
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const TRAINING=[0,0,2,3,4,5,5,5];
function route(stage:number,budget:'lean'|'basic'|'legal'):DefenseAction[]{
  let rt:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'hire',hero:'druid'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
  if(STAGES[stage-1].expanded)rt.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<stage).map(s=>s.visitor).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!=='mage'&&visitors.includes(id));
  rt=rt.flatMap<DefenseAction>(a=>a.type==='hire'?hire?[{type:'hire',hero:hire}]:[]:[a]);
  return budget==='lean'?rt.slice(0,3):budget==='basic'?rt.slice(0,5):rt;
}
type Tracker={id:number;breath:number;slot:number;cool:number};
function play(stage:number,budget:'lean'|'basic'|'legal',policy:'auto'|'active'|'aware',trackers:boolean){
  let s:DefenseState=createDefense(stage,'mage',budget==='lean'?0:TRAINING[stage-1],'standard');
  const rt=route(stage,budget),L=getPaths(stage).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0)),slots=getSlots(stage);
  const tr=new Map<number,Tracker>(),frozen=new Map<number,number>(),marked=new Set<number>();
  let i=0,lastMove=-10,freezes=0,cancels=0,frozenSec=0;
  for(let t=0;t<60*900;t++){
    if(i<rt.length){const n=actDefense(s,rt[i]);if(n.coins<s.coins){i++;s=n;}}
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if(s.phase==='won'||s.phase==='lost')break;
    if(policy!=='auto'&&s.phase==='wave'){
      if(s.skillCooldown===0&&(s.enemies.length>=5||s.bossCharge>0))s=actDefense(s,{type:'skill'});
      const breathing=policy==='aware'?s.enemies.find(e=>tr.get(e.id)?.breath):undefined;
      if((breathing||s.time-lastMove>=2.5)&&s.enemies.length&&s.dashTime===0){
        lastMove=s.time;
        const e=breathing||[...s.enemies].sort((a,b)=>(L[a.path]-a.progress)/a.speed-(L[b.path]-b.progress)/b.speed)[0];
        const p={x:Math.min(840,e.x+20),y:Math.min(540,e.y+55)};
        if(dist(p,s.heroPosition)>(breathing?60:100))s=actDefense(s,{type:s.dashCooldown===0?'dash':'move',point:p});
      }
    }
    s=stepDefense(s,1/60);
    if(!trackers||s.phase!=='wave')continue;
    const dt=1/60;
    // Mark the first frost wolf of waves 3-4 as a tracker (HP x1.5).
    if(s.wave>=3&&!marked.has(s.wave)){const w=s.enemies.find(e=>e.kind==='frostwolf'&&!tr.has(e.id));if(w){marked.add(s.wave);w.hp*=1.5;w.maxHp*=1.5;tr.set(w.id,{id:w.id,breath:0,slot:-1,cool:0});}}
    for(const [id,x] of tr){
      const e=s.enemies.find(o=>o.id===id);if(!e){tr.delete(id);continue;}
      x.cool=Math.max(0,x.cool-dt);
      if(x.breath>0){
        if(dist(s.heroPosition,e)<=120){x.breath=0;x.cool=4;cancels++;continue;}
        x.breath-=dt;if(x.breath<=0){x.breath=0;x.cool=6;frozen.set(x.slot,3);freezes++;}
      }else if(x.cool===0){
        const near=s.towers.map(tw=>({tw,d:dist(slots[tw.slot],e)})).filter(o=>o.d<=100&&!frozen.get(o.tw.slot)).sort((a,b)=>a.d-b.d)[0];
        if(near){x.breath=1.5;x.slot=near.tw.slot;}
      }
    }
    for(const [slot,left] of frozen){
      const tw=s.towers.find(o=>o.slot===slot);
      if(tw)tw.cooldown=Math.max(tw.cooldown,left);frozenSec+=dt;
      if(left-dt<=0)frozen.delete(slot);else frozen.set(slot,left-dt);
    }
  }
  return {phase:s.phase,hp:s.hp,outpost:s.outpostHp,leaks:s.leaks,sec:Math.round(s.time),freezes,cancels,towerFrozenSec:Math.round(frozenSec)};
}
const runs:any[]=[];
for(const stage of [5,6,7,8])for(const budget of ['lean','basic','legal'] as const)for(const policy of ['auto','active','aware'] as const)for(const trackers of [false,true])
  runs.push({stage:STAGES[stage-1].label,budget,policy,trackers,...play(stage,budget,policy,trackers)});
console.log(JSON.stringify({baseline:'origin/main via ../02/exp-copy (no hooks used)',runs},null,1));
