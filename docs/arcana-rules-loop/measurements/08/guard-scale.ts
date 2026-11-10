// Cycle 08 (low-input): smallest visible scale of a guard aura on the PR #104 elite candidate
// "ancient-wood guard" (wood-based, cracked wooden shield). Forest stages 1-1..1-4.
// Per wave (from wave 2) the first K wood soldiers become guards; every OTHER enemy within R of a
// living guard takes damage x(1-C). Guards themselves are unchanged. Uses ../02/exp-copy (__DMG hook only).
// Run: ../02/make-exp-copy.sh && node --experimental-strip-types guard-scale.ts > guard-scale.json
import {createDefense,actDefense,stepDefense} from '../02/exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths} from '../02/exp-copy/src/games/defense/data.ts';
import type {DefenseAction,DefenseState,Enemy,HeroId,Point} from '../02/exp-copy/src/games/defense/types.ts';
const g=globalThis as any;
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const TRAINING=[0,0,2,3,4,5,5,5];
type Budget='lean'|'basic'|'legal';
function route(stage:number,budget:Budget):DefenseAction[]{
  let rt:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'hire',hero:'druid'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
  if(STAGES[stage-1].expanded)rt.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<stage).map(s=>s.visitor).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!=='mage'&&visitors.includes(id));
  rt=rt.flatMap<DefenseAction>(a=>a.type==='hire'?hire?[{type:'hire',hero:hire}]:[]:[a]);
  return budget==='lean'?rt.slice(0,3):budget==='basic'?rt.slice(0,5):rt;
}
type Guard={k:number;r:number;c:number}|null;
function play(stage:number,budget:Budget,active:boolean,guard:Guard){
  const guards=new Set<number>(),perWave=new Map<number,number>(),seen=new Set<number>();
  g.__DMG=guard?(s:DefenseState,e:Enemy)=>!guards.has(e.id)&&s.enemies.some(o=>guards.has(o.id)&&o.hp>0&&dist(o,e)<guard.r)?1-guard.c:1:undefined;
  let s=createDefense(stage,'mage',budget==='lean'?0:TRAINING[stage-1],'standard');
  const rt=route(stage,budget),L=getPaths(stage).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0));
  let i=0,lastMove=-10,guardsMade=0;
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
    if(guard&&s.phase==='wave'&&s.wave>=2)for(const e of s.enemies){
      if(seen.has(e.id))continue;seen.add(e.id);
      if(e.kind==='wood'&&(perWave.get(s.wave)||0)<guard.k){guards.add(e.id);perWave.set(s.wave,(perWave.get(s.wave)||0)+1);guardsMade++;}
    }
  }
  return {phase:s.phase,hp:s.hp,outpost:s.outpostHp,leaks:s.leaks,sec:Math.round(s.time),guardsMade};
}
const variants:[string,Guard][]=[['base',null]];
for(const k of [1,2,99])for(const r of [70,110])for(const c of [.35,.5])variants.push([`k${k===99?'all':k}-r${r}-c${Math.round(c*100)}`,{k,r,c}]);
const runs:any[]=[];
for(const stage of [1,2,3,4])for(const [budget,active] of [['lean',false],['lean',true],['basic',false],['legal',false]] as const)
 for(const [name,gd] of variants)runs.push({stage:STAGES[stage-1].label,budget,policy:active?'active':'auto',variant:name,...play(stage,budget,active,gd)});
console.log(JSON.stringify({baseline:'origin/main via ../02/exp-copy (__DMG only)',runs},null,1));
