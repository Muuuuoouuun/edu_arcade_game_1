// Cycle 15 (low-input): tune the boss "pace warning" from cycle 12.
// Warn once when the boss has walked at least START of its road and  hpShare > K * roadShareLeft.
// Cycle 12 used START .40, K 1.0: only 11 of 17 escapes were warned 10 s or more ahead (65%, target 70%).
// One run per condition records the first warning time of every (START, K) pair at once - the warning is display only.
// Unmodified engine copy (../02/exp-copy, hooks unset).
// Run: ../02/make-exp-copy.sh && node --experimental-strip-types pace-warning.ts > pace-warning.json
import {createDefense,actDefense,stepDefense} from '../02/exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths} from '../02/exp-copy/src/games/defense/data.ts';
import type {DefenseAction,DefenseState,Difficulty,HeroId,Point} from '../02/exp-copy/src/games/defense/types.ts';
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const TRAINING:Record<Difficulty,Record<number,number>>={relaxed:{4:3,8:5},standard:{4:3,8:5},veteran:{4:4,8:5}};
type Budget='lean'|'basic'|'legal';type Policy='auto'|'skillOnly'|'active';
const STARTS=[.2,.3,.4],KS=[.8,.9,1.0];
function route(stage:number,budget:Budget):DefenseAction[]{
  let rt:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'},{type:'hire',hero:'druid'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<stage).map(s=>s.visitor).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!=='mage'&&visitors.includes(id));
  rt=rt.flatMap<DefenseAction>(a=>a.type==='hire'?hire?[{type:'hire',hero:hire}]:[]:[a]);
  return budget==='lean'?rt.slice(0,3):budget==='basic'?rt.slice(0,5):rt;
}
function play(stage:number,mode:Difficulty,budget:Budget,policy:Policy){
  let s:DefenseState=createDefense(stage,'mage',budget==='lean'?0:TRAINING[mode][stage],mode);
  const rt=route(stage,budget),L=getPaths(stage).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0));
  let i=0,lastMove=-10,escapeAt:number|null=null,escapeHp:number|null=null,bossSeenAt:number|null=null,bossGoneAt:number|null=null;
  const warn:Record<string,number|null>={};for(const a of STARTS)for(const k of KS)warn[`${a}/${k}`]=null;
  for(let t=0;t<60*900;t++){
    if(i<rt.length){const n=actDefense(s,rt[i]);if(n.coins<s.coins){i++;s=n;}}
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if(s.phase==='won'||s.phase==='lost')break;
    if(policy!=='auto'&&s.phase==='wave'){
      if(s.skillCooldown===0&&(s.enemies.length>=5||s.bossCharge>0))s=actDefense(s,{type:'skill'});
      if(policy==='active'&&s.time-lastMove>=2.5&&s.enemies.length&&s.dashTime===0){
        lastMove=s.time;const e=[...s.enemies].sort((a,b)=>(L[a.path]-a.progress)/a.speed-(L[b.path]-b.progress)/b.speed)[0];
        const p={x:Math.min(840,e.x+20),y:Math.min(540,e.y+55)};
        if(dist(p,s.heroPosition)>100)s=actDefense(s,{type:s.dashCooldown===0?'dash':'move',point:p});
      }
    }
    const before=s;s=stepDefense(s,1/60);
    const pb=before.enemies.find(e=>e.kind==='boss'||e.kind==='frostboss');
    const b=s.enemies.find(e=>e.kind==='boss'||e.kind==='frostboss');
    // escaped = the boss left the field in a step without a kill being counted (also catches a breach when the village had < 8 HP)
    if(pb&&!b&&escapeAt===null&&s.kills===before.kills){escapeAt=s.time;escapeHp=Math.round(100*pb.hp/pb.maxHp);}
    if(b){
      if(bossSeenAt===null)bossSeenAt=s.time;
      const walked=b.progress/L[0],hpShare=b.hp/b.maxHp;
      for(const a of STARTS)for(const k of KS){const key=`${a}/${k}`;if(warn[key]===null&&walked>=a&&hpShare>k*(1-walked))warn[key]=s.time;}
    }else if(pb&&bossGoneAt===null)bossGoneAt=s.time;
  }
  const escaped=escapeAt!==null;
  return {phase:s.phase,hp:s.hp,bossEscaped:escaped,bossHpPctAtEscape:escapeHp,bossOnFieldSec:bossSeenAt!==null?Math.round(((escapeAt??bossGoneAt??s.time)-bossSeenAt)):null,
    lead:Object.fromEntries(Object.entries(warn).map(([k,v])=>[k,v===null?null:Math.round((escaped?escapeAt!:(bossGoneAt??s.time))-v)]))};
}
const runs:any[]=[];
for(const stage of [4,8])for(const mode of ['relaxed','standard','veteran'] as const)for(const budget of ['lean','basic','legal'] as const)for(const policy of ['auto','skillOnly','active'] as const)
  runs.push({stage:STAGES[stage-1].label,mode,budget,policy,...play(stage,mode,budget,policy)});
// aggregate per (START, K)
const table=[] as any[];
for(const a of STARTS)for(const k of KS){
  const key=`${a}/${k}`;const esc=runs.filter(r=>r.bossEscaped),kill=runs.filter(r=>!r.bossEscaped&&r.bossOnFieldSec!==null&&r.phase==='won');
  const leads=esc.map(r=>r.lead[key]).filter((v:number|null)=>v!==null) as number[];leads.sort((x,y)=>x-y);
  table.push({start:a,k,escapes:esc.length,warned:leads.length,warned10s:leads.filter(v=>v>=10).length,medianLeadSec:leads.length?leads[Math.floor(leads.length/2)]:null,
    bossKilledWins:kill.length,falseAlarms:kill.filter(r=>r.lead[key]!==null).length});
}
console.log(JSON.stringify({baseline:'origin/main via ../02/exp-copy (no hooks set)',table,runs},null,1));
