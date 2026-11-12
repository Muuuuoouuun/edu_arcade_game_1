// Cycle 11 (low-input): how much does the only boss "tower attack" (Frost Lord: 2.5 s charge ->
// all towers frozen 2 s, interruptible by any ultimate) weigh on 2-4? Ability ON = engine as is;
// OFF = a post-step layer clears bossCharge/freeze every step (the boss then simply walks).
// Uses ../02/exp-copy with no hooks set. Counts charges started, freezes landed and interrupts.
// Run: ../02/make-exp-copy.sh && node --experimental-strip-types frostlord-freeze.ts > frostlord-freeze.json
import {createDefense,actDefense,stepDefense} from '../02/exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths} from '../02/exp-copy/src/games/defense/data.ts';
import type {DefenseAction,DefenseState,HeroId,Point} from '../02/exp-copy/src/games/defense/types.ts';
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const STAGE=8,TRAINING=5;
type Budget='lean'|'basic'|'legal';type Policy='auto'|'skillOnly'|'active'|'holdSkill';
function route(budget:Budget):DefenseAction[]{
  let rt:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'hire',hero:'druid'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
  rt.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<STAGE).map(s=>s.visitor).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!=='mage'&&visitors.includes(id));
  rt=rt.flatMap<DefenseAction>(a=>a.type==='hire'?hire?[{type:'hire',hero:hire}]:[]:[a]);
  return budget==='lean'?rt.slice(0,3):budget==='basic'?rt.slice(0,5):rt;
}
function play(budget:Budget,policy:Policy,ability:boolean){
  let s:DefenseState=createDefense(STAGE,'mage',budget==='lean'?0:TRAINING,'standard');
  const rt=route(budget),L=getPaths(STAGE).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0));
  let i=0,lastMove=-10,charges=0,freezes=0,interrupts=0,bossEscaped=false;
  for(let t=0;t<60*900;t++){
    if(i<rt.length){const n=actDefense(s,rt[i]);if(n.coins<s.coins){i++;s=n;}}
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if(s.phase==='won'||s.phase==='lost')break;
    if(policy!=='auto'&&s.phase==='wave'){
      // holdSkill: during wave 4 keep the ultimate for the charge only (a player who waits for the telegraph).
      const hold=policy==='holdSkill'&&s.wave===4&&s.enemies.some(e=>e.kind==='frostboss');
      if(s.skillCooldown===0&&((!hold&&s.enemies.length>=5)||s.bossCharge>0)){const c=s.bossCharge>0;const n=actDefense(s,{type:'skill'});if(n!==s&&c)interrupts++;s=n;}
      if(policy!=='skillOnly'&&s.time-lastMove>=2.5&&s.enemies.length&&s.dashTime===0){
        lastMove=s.time;const e=[...s.enemies].sort((a,b)=>(L[a.path]-a.progress)/a.speed-(L[b.path]-b.progress)/b.speed)[0];
        const p={x:Math.min(840,e.x+20),y:Math.min(540,e.y+55)};
        if(dist(p,s.heroPosition)>100)s=actDefense(s,{type:s.dashCooldown===0?'dash':'move',point:p});
      }
    }
    const before=s;s=stepDefense(s,1/60);
    // A boss breach costs 8 HP in one step (main lane); a skill kill happens inside actDefense, so detect the escape instead.
    if(before.hp-s.hp>=8||before.outpostHp-s.outpostHp>=8)bossEscaped=true;
    if(!ability){s.bossCharge=0;s.freeze=0;continue;}
    if(before.bossCharge===0&&s.bossCharge>0)charges++;
    if(before.freeze===0&&s.freeze>0)freezes++;
  }
  return {phase:s.phase,hp:s.hp,outpost:s.outpostHp,leaks:s.leaks,sec:Math.round(s.time),bossEscaped,charges,freezes,interrupts};
}
const runs:any[]=[];
for(const budget of ['lean','basic','legal'] as const)for(const policy of ['auto','skillOnly','active','holdSkill'] as const)for(const ability of [true,false])
  runs.push({stage:'2-4',budget,policy,ability:ability?'on':'off',...play(budget,policy,ability)});
console.log(JSON.stringify({baseline:'origin/main via ../02/exp-copy (no hooks set)',runs},null,1));
