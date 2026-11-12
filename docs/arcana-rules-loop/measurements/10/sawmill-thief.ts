// Cycle 10 (low-input): "thieves raiding the sawmill" on 1-2 (cycle 07 design).
// Every second sprout is a thief. A thief reaching path progress 462 (the sawmill store, (410,285))
// steals 15 battle coins and leaves the road there: no village HP loss, no kill, no bounty.
// Post-step layer over an unmodified engine copy (../01/exp-copy, hooks unset).
// Same purchase order mapped onto three placements (cycle 04). Also 1-1 with thieves as a control.
// Run: ../01/make-exp-copy.sh && node --experimental-strip-types sawmill-thief.ts > sawmill-thief.json
import {createDefense,actDefense,stepDefense} from '../01/exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths} from '../01/exp-copy/src/games/defense/data.ts';
import type {DefenseAction,DefenseState,HeroId,Point} from '../01/exp-copy/src/games/defense/types.ts';
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const TRAINING=[0,0,2,3,4,5,5,5];
const STORE=462,STEAL=15;
const PLACEMENTS:Record<string,number[]>={audit:[2,3,0,5,4,1],front:[0,1,2,3,4,5],back:[3,4,5,2,0,1]};
function route(stage:number,[a,b,c,d,e,f]:number[],budget:'lean'|'basic'|'legal'):DefenseAction[]{
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<stage).map(s=>s.visitor).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!=='mage'&&visitors.includes(id));
  const rt:DefenseAction[]=[{type:'build',slot:a,kind:'magic'},{type:'build',slot:b,kind:'cannon'},{type:'upgrade',slot:a,branch:'fire'},{type:'build',slot:c,kind:'crossbow'},{type:'upgrade',slot:b,branch:'crush'},{type:'build',slot:d,kind:'crossbow'},...(hire?[{type:'hire',hero:hire} as DefenseAction]:[]),{type:'upgrade',slot:a},{type:'build',slot:e,kind:'cannon'},{type:'upgrade',slot:e,branch:'water'},{type:'upgrade',slot:d,branch:'pierce'},{type:'build',slot:f,kind:'magic'},{type:'upgrade',slot:f,branch:'lightning'},{type:'upgrade',slot:b},{type:'upgrade',slot:d}];
  return budget==='lean'?rt.slice(0,3):budget==='basic'?rt.slice(0,5):rt;
}
function play(stage:number,place:string,budget:'lean'|'basic'|'legal',active:boolean,thieves:boolean){
  let s:DefenseState=createDefense(stage,'mage',budget==='lean'?0:TRAINING[stage-1],'standard');
  const rt=route(stage,PLACEMENTS[place],budget),L=getPaths(stage).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0));
  const thief=new Set<number>(),seen=new Set<number>();let sproutCount=0,stolen=0,coinsStolen=0,i=0,lastMove=-10,bought=0;
  for(let t=0;t<60*900;t++){
    if(i<rt.length){const n=actDefense(s,rt[i]);if(n.coins<s.coins){i++;bought++;s=n;}}
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
    if(!thieves||s.phase!=='wave')continue;
    for(const e of s.enemies)if(!seen.has(e.id)){seen.add(e.id);if(e.kind==='sprout'){if(sproutCount%2===0)thief.add(e.id);sproutCount++;}}
    const robbers=s.enemies.filter(e=>thief.has(e.id)&&e.path===0&&e.progress>=STORE);
    if(robbers.length){for(const r of robbers){stolen++;const take=Math.min(STEAL,s.coins);coinsStolen+=take;s.coins-=take;}s.enemies=s.enemies.filter(e=>!robbers.includes(e));}
  }
  return {phase:s.phase,hp:s.hp,leaks:s.leaks,sec:Math.round(s.time),thieves:thief.size,stolen,coinsStolen,purchases:bought,endCoins:s.coins};
}
const runs:any[]=[];
for(const stage of [1,2])for(const thieves of [false,true])for(const budget of ['lean','basic','legal'] as const)for(const active of [false,true])for(const place of Object.keys(PLACEMENTS))
  runs.push({stage:STAGES[stage-1].label,thieves,budget,policy:active?'active':'auto',place,...play(stage,place,budget,active,thieves)});
console.log(JSON.stringify({baseline:'origin/main via ../01/exp-copy (hooks unset)',runs},null,1));
