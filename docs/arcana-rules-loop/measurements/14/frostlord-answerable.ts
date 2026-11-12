// Cycle 14 (low-input): cycle 11's options B and C for the Frost Lord charge on 2-4.
//   base : engine as is (next charge 9 s after a freeze or an interrupt; the ultimate recharges in 20 s)
//   B14 / B18 : the next charge comes 14 s / 18 s later instead of 9 s
//   C8 / C12  : a starting charge pulls the ultimate cooldown forward by 8 s / 12 s
// Post-step layer over an unmodified engine copy (../02/exp-copy, hooks unset).
// Run: ../02/make-exp-copy.sh && node --experimental-strip-types frostlord-answerable.ts > frostlord-answerable.json
import {createDefense,actDefense,stepDefense} from '../02/exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths} from '../02/exp-copy/src/games/defense/data.ts';
import type {DefenseAction,DefenseState,HeroId,Point} from '../02/exp-copy/src/games/defense/types.ts';
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const STAGE=8,TRAINING=5;
type Budget='lean'|'basic'|'legal';type Policy='skillOnly'|'active'|'holdSkill';
type Variant={name:string;cycle?:number;pull?:number;off?:boolean;stuck?:boolean};
// off   : the charge never starts (bossCycle pinned high) - the boss simply walks. This is the correct 'ability off'.
// stuck : cycle 11's faulty 'off' layer (bossCharge and freeze zeroed after every step), kept to show the artefact.
const VARIANTS:Variant[]=[{name:'base'},{name:'off',off:true},{name:'stuck',stuck:true},{name:'B14',cycle:14},{name:'B18',cycle:18},{name:'C8',pull:8},{name:'C12',pull:12}];
function route(budget:Budget):DefenseAction[]{
  let rt:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'hire',hero:'druid'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
  rt.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<STAGE).map(s=>s.visitor).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!=='mage'&&visitors.includes(id));
  rt=rt.flatMap<DefenseAction>(a=>a.type==='hire'?hire?[{type:'hire',hero:hire}]:[]:[a]);
  return budget==='lean'?rt.slice(0,3):budget==='basic'?rt.slice(0,5):rt;
}
function play(budget:Budget,policy:Policy,v:Variant){
  let s:DefenseState=createDefense(STAGE,'mage',budget==='lean'?0:TRAINING,'standard');
  const rt=route(budget),L=getPaths(STAGE).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0));
  let i=0,lastMove=-10,charges=0,freezes=0,interrupts=0,bossEscaped=false,skills=0,stoppedSec=0,escapeHpPct:number|null=null,bossKilledAt:number|null=null;
  for(let t=0;t<60*900;t++){
    if(i<rt.length){const n=actDefense(s,rt[i]);if(n.coins<s.coins){i++;s=n;}}
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if(s.phase==='won'||s.phase==='lost')break;
    if(s.phase==='wave'){
      const hold=policy==='holdSkill'&&s.wave===4&&s.enemies.some(e=>e.kind==='frostboss');
      if(s.skillCooldown===0&&((!hold&&s.enemies.length>=5)||s.bossCharge>0)){
        const c=s.bossCharge>0;const n=actDefense(s,{type:'skill'});
        if(n!==s){skills++;if(c){interrupts++;if(v.cycle)n.bossCycle=v.cycle;}}
        s=n;
      }
      if(policy==='active'&&s.time-lastMove>=2.5&&s.enemies.length&&s.dashTime===0){
        lastMove=s.time;const e=[...s.enemies].sort((a,b)=>(L[a.path]-a.progress)/a.speed-(L[b.path]-b.progress)/b.speed)[0];
        const p={x:Math.min(840,e.x+20),y:Math.min(540,e.y+55)};
        if(dist(p,s.heroPosition)>100)s=actDefense(s,{type:s.dashCooldown===0?'dash':'move',point:p});
      }
    }
    const before=s;s=stepDefense(s,1/60);
    if(before.hp-s.hp>=8||before.outpostHp-s.outpostHp>=8){bossEscaped=true;const pb=before.enemies.find(e=>e.kind==='frostboss');if(pb)escapeHpPct=Math.round(100*pb.hp/pb.maxHp);}
    {const pb=before.enemies.find(e=>e.kind==='frostboss');if(pb&&!s.enemies.some(e=>e.kind==='frostboss')&&!bossEscaped)bossKilledAt=Math.round(s.time);}
    const boss=s.enemies.find(e=>e.kind==='frostboss');
    if(boss){const pb=before.enemies.find(e=>e.id===boss.id);if(pb&&boss.progress<=pb.progress+1e-9&&(boss.knockVelocity||0)===0)stoppedSec+=1/60;}
    if(v.off){s.bossCycle=99;s.bossCharge=0;continue;}
    if(v.stuck){s.bossCharge=0;s.freeze=0;continue;}
    if(before.bossCharge===0&&s.bossCharge>0){charges++;if(v.pull)s.skillCooldown=Math.max(0,s.skillCooldown-v.pull);}
    if(before.freeze===0&&s.freeze>0){freezes++;if(v.cycle)s.bossCycle=v.cycle;}
  }
  return {phase:s.phase,hp:s.hp,outpost:s.outpostHp,leaks:s.leaks,sec:Math.round(s.time),bossEscaped,bossHpPctAtEscape:escapeHpPct,bossStoppedSec:Math.round(stoppedSec),charges,freezes,interrupts,skills};
}
const runs:any[]=[];
for(const budget of ['lean','basic','legal'] as const)for(const policy of ['skillOnly','active','holdSkill'] as const)for(const v of VARIANTS)
  runs.push({stage:'2-4',budget,policy,variant:v.name,...play(budget,policy,v)});
console.log(JSON.stringify({baseline:'origin/main via ../02/exp-copy (no hooks set)',runs},null,1));
