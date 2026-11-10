// Cycle 12 (low-input): the "last chance at the gate" with v1 P0 (boss breach = loss).
// Variants on boss stages 1-4 and 2-4:
//   p0        : boss reaching the end empties the village (via __BREACH)
//   hold      : p0 + the boss stops for 2 s once it passes 95% of its road ("pounding the gate")
//   holdSkill : hold + the ultimate is recharged once at that moment (a player-visible last chance)
// Also logs a 'pace warning' (boss past 40% of its road with HP share > road share left) and how many
// seconds before the escape it would fire. Policies reuse cycle 06; with a last chance active, skill-using policies fire the ultimate at the gate.
// Uses ../02/exp-copy (__BREACH only) plus a post-step layer for the hold.
// Run: ../02/make-exp-copy.sh && node --experimental-strip-types gate-last-chance.ts > gate-last-chance.json
import {createDefense,actDefense,stepDefense,positionOnPath} from '../02/exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths} from '../02/exp-copy/src/games/defense/data.ts';
import type {DefenseAction,DefenseState,Difficulty,HeroId,Point} from '../02/exp-copy/src/games/defense/types.ts';
const g=globalThis as any;
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const TRAINING:Record<Difficulty,Record<number,number>>={relaxed:{4:3,8:5},standard:{4:3,8:5},veteran:{4:4,8:5}};
type Budget='lean'|'basic';type Policy='auto'|'skillOnly'|'active';type Variant='current'|'p0'|'hold'|'holdSkill';
function route(stage:number,budget:Budget):DefenseAction[]{
  let rt:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'}];
  return budget==='lean'?rt.slice(0,3):rt;
}
function play(stage:number,mode:Difficulty,budget:Budget,policy:Policy,variant:Variant){
  let escapedAt:number|null=null;
  g.__BREACH=(s:any,e:any)=>{if(e.kind==='boss'||e.kind==='frostboss'){escapedAt=Math.round(100*e.hp/e.maxHp);return variant==='current'?null:{hp:999};}return null;};
  let s:DefenseState=createDefense(stage,'mage',budget==='lean'?0:TRAINING[mode][stage],mode);
  const rt=route(stage,budget),L=getPaths(stage).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0)),gate=L[0]*.95;
  let i=0,lastMove=-10,stand=0,used=false,gateSkill=false,paceAt:number|null=null,escapeAt:number|null=null;
  for(let t=0;t<60*900;t++){
    if(i<rt.length){const n=actDefense(s,rt[i]);if(n.coins<s.coins){i++;s=n;}}
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if(s.phase==='won'||s.phase==='lost')break;
    if(policy!=='auto'&&s.phase==='wave'){
      if(s.skillCooldown===0&&(s.enemies.length>=5||s.bossCharge>0||stand>0)){const n=actDefense(s,{type:'skill'});if(n!==s&&stand>0)gateSkill=true;s=n;}
      if(policy==='active'&&s.time-lastMove>=2.5&&s.enemies.length&&s.dashTime===0){
        lastMove=s.time;const e=[...s.enemies].sort((a,b)=>(L[a.path]-a.progress)/a.speed-(L[b.path]-b.progress)/b.speed)[0];
        const p={x:Math.min(840,e.x+20),y:Math.min(540,e.y+55)};
        if(dist(p,s.heroPosition)>100)s=actDefense(s,{type:s.dashCooldown===0?'dash':'move',point:p});
      }
    }
    const hpBefore=s.hp;s=stepDefense(s,1/60);
    if(hpBefore-s.hp>=8&&escapeAt===null)escapeAt=s.time;
    // Pace warning: once the boss has walked 40% of its road, warn when its HP share exceeds the road share left.
    {const b=s.enemies.find(e=>e.kind==='boss'||e.kind==='frostboss');if(b&&paceAt===null){const walked=b.progress/L[0];if(walked>=.4&&b.hp/b.maxHp>1-walked)paceAt=s.time;}}
    if(variant!=='hold'&&variant!=='holdSkill')continue;
    const boss=s.enemies.find(e=>e.kind==='boss'||e.kind==='frostboss');
    if(boss&&!used&&boss.progress>=gate){used=true;stand=2;if(variant==='holdSkill')s.skillCooldown=0;}
    if(boss&&stand>0){boss.progress=Math.min(boss.progress,gate);Object.assign(boss,positionOnPath(boss.path,boss.progress,stage));stand=Math.max(0,stand-1/60);}
    if(!boss)stand=0;
  }
  return {phase:s.phase,hp:s.hp,outpost:s.outpostHp,leaks:s.leaks,sec:Math.round(s.time),bossEscapedWithHpPct:escapedAt,gateReached:used,gateSkill,paceWarnAt:paceAt===null?null:Math.round(paceAt),warnLeadSec:paceAt!==null&&escapeAt!==null?Math.round(escapeAt-paceAt):null};
}
const runs:any[]=[];
for(const stage of [4,8])for(const mode of ['relaxed','standard','veteran'] as const)for(const budget of ['lean','basic'] as const)for(const policy of ['auto','skillOnly','active'] as const)for(const variant of ['current','p0','hold','holdSkill'] as const)
  runs.push({stage:STAGES[stage-1].label,mode,budget,policy,variant,...play(stage,mode,budget,policy,variant)});
console.log(JSON.stringify({baseline:'origin/main via ../02/exp-copy (__BREACH only)',runs},null,1));
