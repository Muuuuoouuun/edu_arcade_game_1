// Cycle 04 (low-input): the 1-3 "old-road join" re-measured with real purchase routes
// (cycle 01 used free injected Lv1 crossbows). One enemy in three (spawn index %3===1) joins
// at path progress 644 (bridge west end) or 462; bosses never join.
// Run: ../01/make-exp-copy.sh && node --experimental-strip-types join-routes.ts > join-routes.json
import {createDefense,actDefense,stepDefense} from '../01/exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths} from '../01/exp-copy/src/games/defense/data.ts';
import type {DefenseAction,HeroId,Point} from '../01/exp-copy/src/games/defense/types.ts';
const g=globalThis as any;
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const TRAINING=[0,0,2,3,4,5,5,5];
// Same purchase ORDER as tools/audit-defense-rules.ts, re-mapped onto three placements.
const order=(a:number,b:number,c:number,d:number,e:number,f:number):DefenseAction[]=>[
  {type:'build',slot:a,kind:'magic'},{type:'build',slot:b,kind:'cannon'},{type:'upgrade',slot:a,branch:'fire'},{type:'build',slot:c,kind:'crossbow'},{type:'upgrade',slot:b,branch:'crush'},{type:'build',slot:d,kind:'crossbow'},{type:'hire',hero:'druid'},{type:'upgrade',slot:a},{type:'build',slot:e,kind:'cannon'},{type:'upgrade',slot:e,branch:'water'},{type:'upgrade',slot:d,branch:'pierce'},{type:'build',slot:f,kind:'magic'},{type:'upgrade',slot:f,branch:'lightning'},{type:'upgrade',slot:b},{type:'upgrade',slot:d}];
const placements:Record<string,DefenseAction[]>={
  audit:order(2,3,0,5,4,1),   // the existing audit route (middle first)
  front:order(0,1,2,3,4,5),   // entrance side first
  back:order(3,4,5,2,0,1),    // bridge / village side first
};
function route(stage:number,name:string,budget:'lean'|'basic'|'legal'):DefenseAction[]{
  let rt=[...placements[name]];
  if(STAGES[stage-1].expanded)rt.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<stage).map(s=>s.visitor).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!=='mage'&&visitors.includes(id));
  rt=rt.flatMap<DefenseAction>(a=>a.type==='hire'?hire?[{type:'hire',hero:hire}]:[]:[a]);
  return budget==='lean'?rt.slice(0,3):budget==='basic'?rt.slice(0,5):rt;
}
function play(stage:number,join:number,place:string,budget:'lean'|'basic'|'legal',active:boolean){
  g.__JOIN=join?(st:number,i:number,kind:string)=>i%3===1&&kind!=='boss'&&kind!=='frostboss'?join:0:undefined;
  let s=createDefense(stage,'mage',budget==='lean'?0:TRAINING[stage-1],'standard');
  const rt=route(stage,place,budget),L=getPaths(stage).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0));
  let i=0,lastMove=-10,bossLeak=false;
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
    const hp=s.hp,out=s.outpostHp;s=stepDefense(s,1/60);if(hp-s.hp>=8||out-s.outpostHp>=8)bossLeak=true;
  }
  return {phase:s.phase,hp:s.hp,outpost:s.outpostHp,leaks:s.leaks,sec:Math.round(s.time),bossLeak};
}
const runs:any[]=[];
for(const stage of [2,3,4])for(const budget of ['lean','basic','legal'] as const)for(const active of [false,true])
 for(const place of Object.keys(placements))for(const join of [0,462,644])
  runs.push({stage:STAGES[stage-1].label,budget,policy:active?'active':'auto',place,join,...play(stage,join,place,budget,active)});
console.log(JSON.stringify({baseline:'origin/main via ../01/exp-copy (__JOIN hook only)',runs},null,1));
