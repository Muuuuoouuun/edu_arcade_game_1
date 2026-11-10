// Cycle 07 (low-input): an "opposite-direction" map rule. Cycle 04 found the bridge-side build
// already best, so a join point only narrows the answer. Here 1-2's rain floods the bridge-side
// lowland slots: lock slot 4 (water), or slots 3+4. Same purchase order as the audit tool,
// mapped onto three placements; a locked slot is skipped and later slots move up.
// The engine copy is unmodified except the optional __JOIN hook (used only for the 1-3 + join comparison);
// locking only removes slots from the route.
// Run: ../01/make-exp-copy.sh && node --experimental-strip-types slot-lock.ts > slot-lock.json
import {createDefense,actDefense,stepDefense} from '../01/exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths} from '../01/exp-copy/src/games/defense/data.ts';
import type {DefenseAction,HeroId,Point} from '../01/exp-copy/src/games/defense/types.ts';
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const TRAINING=[0,0,2,3,4,5,5,5];
const PLACEMENTS:Record<string,number[]>={audit:[2,3,0,5,4,1],front:[0,1,2,3,4,5],back:[3,4,5,2,0,1]};
function route(stage:number,slots:number[],budget:'lean'|'basic'|'legal'):DefenseAction[]{
  const [a,b,c,d,e,f]=slots;const out:DefenseAction[]=[];
  const add=(slot:number|undefined,x:Omit<any,'slot'>)=>{if(slot!==undefined)out.push({...x,slot} as DefenseAction);};
  add(a,{type:'build',kind:'magic'});add(b,{type:'build',kind:'cannon'});add(a,{type:'upgrade',branch:'fire'});add(c,{type:'build',kind:'crossbow'});add(b,{type:'upgrade',branch:'crush'});add(d,{type:'build',kind:'crossbow'});
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<stage).map(s=>s.visitor).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!=='mage'&&visitors.includes(id));
  if(hire)out.push({type:'hire',hero:hire});
  add(a,{type:'upgrade'});add(e,{type:'build',kind:'cannon'});add(e,{type:'upgrade',branch:'water'});add(d,{type:'upgrade',branch:'pierce'});add(f,{type:'build',kind:'magic'});add(f,{type:'upgrade',branch:'lightning'});add(b,{type:'upgrade'});add(d,{type:'upgrade'});
  return budget==='lean'?out.slice(0,3):budget==='basic'?out.slice(0,5):out;
}
function play(stage:number,slots:number[],budget:'lean'|'basic'|'legal',active:boolean){
  let s=createDefense(stage,'mage',budget==='lean'?0:TRAINING[stage-1],'standard');
  const rt=route(stage,slots,budget),L=getPaths(stage).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0));
  let i=0,lastMove=-10;
  for(let t=0;t<60*900;t++){
    if(i<rt.length){const n=actDefense(s,rt[i]);if(n.coins<s.coins){i++;s=n;}}
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if(s.phase==='won'||s.phase==='lost')break;
    if(active&&s.phase==='wave'){
      if(s.skillCooldown===0&&(s.enemies.length>=5||s.bossCharge>0))s=actDefense(s,{type:'skill'});
      if(s.time-lastMove>=2.5&&s.enemies.length&&s.dashTime===0){
        lastMove=s.time;const e=[...s.enemies].sort((a,b)=>(L[a.path]-a.progress)/a.speed-(L[b.path]-b.progress)/b.speed)[0];
        const p={x:Math.min(840,e.x+20),y:Math.min(540,e.y+55)};
        if(dist(p,s.heroPosition)>100)s=actDefense(s,{type:s.dashCooldown===0?'dash':'move',point:p});
      }
    }
    s=stepDefense(s,1/60);
  }
  return {phase:s.phase,hp:s.hp,leaks:s.leaks,sec:Math.round(s.time),built:rt.filter(a=>a.type==='build').map(a=>(a as any).slot)};
}
const locks:Record<string,number[]>={none:[],lock4:[4],lock34:[3,4]};
const g=globalThis as any;
const runs:any[]=[];
// 1-1/1-2: lock only. 1-3: lock only, and lock + the cycle-04 bridge join (644) for comparison.
for(const [stage,join] of [[1,0],[2,0],[3,0],[3,644]] as const)for(const [lname,locked] of Object.entries(locks))for(const budget of ['lean','basic','legal'] as const)for(const active of [false,true])
 for(const [pname,order] of Object.entries(PLACEMENTS)){
  const slots=order.filter(x=>!locked.includes(x));
  g.__JOIN=join?(st:number,i:number,kind:string)=>i%3===1&&kind!=='boss'&&kind!=='frostboss'?join:0:undefined;
  runs.push({stage:STAGES[stage-1].label,join,lock:lname,budget,policy:active?'active':'auto',place:pname,...play(stage,slots,budget,active)});
 }
console.log(JSON.stringify({baseline:'origin/main via ../01/exp-copy (no hooks set)',runs},null,1));
