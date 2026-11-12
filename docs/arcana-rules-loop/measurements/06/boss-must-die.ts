// Cycle 06 (low-input): v1 P0 "the regional boss must fall" on an engine copy.
// __BREACH hook (../02/exp-copy): a boss reaching the end costs the whole village (instant loss)
// in the P0 variant; the current rule (HP -8) otherwise. Either way we record the boss's
// remaining HP fraction at the moment it escaped, to size any tuning.
// Run: ../02/make-exp-copy.sh && node --experimental-strip-types boss-must-die.ts > boss-must-die.json
import {createDefense,actDefense,stepDefense} from '../02/exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths} from '../02/exp-copy/src/games/defense/data.ts';
import type {DefenseAction,Difficulty,HeroId,Point} from '../02/exp-copy/src/games/defense/types.ts';
const g=globalThis as any;
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
// Entry training per difficulty for stages 4 and 8 (docs/arcana-rules-20261109/legal-progression.json).
const TRAINING:Record<Difficulty,Record<number,number>>={relaxed:{4:3,8:5},standard:{4:3,8:5},veteran:{4:4,8:5}};
type Budget='lean'|'basic'|'legal';type Policy='auto'|'skillOnly'|'active';
function route(stage:number,budget:Budget):DefenseAction[]{
  let rt:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'hire',hero:'druid'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
  rt.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<stage).map(s=>s.visitor).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!=='mage'&&visitors.includes(id));
  rt=rt.flatMap<DefenseAction>(a=>a.type==='hire'?hire?[{type:'hire',hero:hire}]:[]:[a]);
  return budget==='lean'?rt.slice(0,3):budget==='basic'?rt.slice(0,5):rt;
}
function play(stage:number,mode:Difficulty,budget:Budget,policy:Policy,p0:boolean){
  let escapedAt:number|null=null;
  g.__BREACH=(s:any,e:any)=>{if(e.kind==='boss'||e.kind==='frostboss'){escapedAt=Math.round(100*e.hp/e.maxHp);return p0?{hp:999}:null;}return null;};
  let s=createDefense(stage,'mage',budget==='lean'?0:TRAINING[mode][stage],mode);
  const rt=route(stage,budget),L=getPaths(stage).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0));
  let i=0,lastMove=-10;
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
    s=stepDefense(s,1/60);
  }
  return {phase:s.phase,hp:s.hp,outpost:s.outpostHp,leaks:s.leaks,kills:s.kills,sec:Math.round(s.time),bossEscapedWithHpPct:escapedAt};
}
const runs:any[]=[];
for(const stage of [4,8])for(const mode of ['relaxed','standard','veteran'] as const)for(const budget of ['lean','basic','legal'] as const)for(const policy of ['auto','skillOnly','active'] as const)for(const p0 of [false,true])
  runs.push({stage:STAGES[stage-1].label,mode,budget,policy,rule:p0?'P0':'current',...play(stage,mode,budget,policy,p0)});
console.log(JSON.stringify({baseline:'origin/main via ../02/exp-copy (__BREACH only)',runs},null,1));
