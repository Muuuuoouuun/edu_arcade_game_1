// Cycle 03 (low-input): how much does the ultimate's SHAPE decide a battle?
// Shapes: global (current engine) / ring160 / ring220 around the hero / front6 (six front-most, an auto-aim stand-in).
// Same damage, cooldown and boss interrupt for every shape; only the set of enemies hit changes.
// Run: ./make-exp-copy.sh && node --experimental-strip-types skill-shape.ts > skill-shape.json
import {createDefense,actDefense,stepDefense} from './exp-copy/src/games/defense/engine.ts';
import {STAGES,getPaths} from './exp-copy/src/games/defense/data.ts';
import type {DefenseAction,DefenseState,HeroId,Enemy,Point} from './exp-copy/src/games/defense/types.ts';
const g=globalThis as any;
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const TRAINING=[0,0,2,3,4,5,5,5]; // standard auto entry levels, docs/arcana-rules-20261109/legal-progression.json
const lengthsOf=(stage:number)=>getPaths(stage).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0));
const shapes:Record<string,((s:DefenseState)=>Enemy[])|undefined>={
  global:undefined,
  ring160:s=>s.enemies.filter(e=>dist(e,s.heroPosition)<=160),
  ring220:s=>s.enemies.filter(e=>dist(e,s.heroPosition)<=220),
  front6:s=>{const L=lengthsOf(s.stage);return [...s.enemies].sort((a,b)=>(L[a.path]-a.progress)-(L[b.path]-b.progress)).slice(0,6);},
};
function route(stage:number,lean:boolean):DefenseAction[]{
  let rt:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'hire',hero:'druid'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
  if(STAGES[stage-1].expanded)rt.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<stage).map(s=>s.visitor).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!=='mage'&&visitors.includes(id));
  rt=rt.flatMap<DefenseAction>(a=>a.type==='hire'?hire?[{type:'hire',hero:hire}]:[]:[a]);
  return lean?rt.slice(0,3):rt;
}
function play(stage:number,shape:string,lean:boolean,move:boolean){
  g.__SKILL=shapes[shape];
  let s=createDefense(stage,'mage',lean?0:TRAINING[stage-1],'standard');
  const rt=route(stage,lean),L=lengthsOf(stage);
  let i=0,lastMove=-10,casts=0,hits=0,bossLeak=false;
  for(let t=0;t<60*900;t++){
    if(i<rt.length){const n=actDefense(s,rt[i]);if(n.coins<s.coins){i++;s=n;}}
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if(s.phase==='won'||s.phase==='lost')break;
    if(s.phase==='wave'){
      // Same trigger idea as cycle 02: cast when the shape would catch a crowd, or to interrupt a charge.
      const targets=(shapes[shape]?.(s)??s.enemies).length,threshold=shape==='global'?5:4;
      if(s.skillCooldown===0&&(targets>=threshold||s.bossCharge>0)){const n=actDefense(s,{type:'skill'});if(n!==s){casts++;hits+=targets;}s=n;}
      if(move&&s.time-lastMove>=2.5&&s.enemies.length&&s.dashTime===0){
        lastMove=s.time;const e=[...s.enemies].sort((a,b)=>(L[a.path]-a.progress)/a.speed-(L[b.path]-b.progress)/b.speed)[0];
        const p={x:Math.min(840,e.x+20),y:Math.min(540,e.y+55)};
        if(dist(p,s.heroPosition)>100)s=actDefense(s,{type:s.dashCooldown===0?'dash':'move',point:p});
      }
    }
    const hp=s.hp,out=s.outpostHp;
    s=stepDefense(s,1/60);
    if(hp-s.hp>=8||out-s.outpostHp>=8)bossLeak=true;
  }
  return {phase:s.phase,hp:s.hp,outpost:s.outpostHp,leaks:s.leaks,sec:Math.round(s.time),casts,avgHit:casts?Math.round(10*hits/casts)/10:0,bossLeak};
}
const runs:any[]=[];
for(const [budget,lean] of [['lean',true],['legal',false]] as const)
 for(const [policy,move] of [['skillOnly',false],['active',true]] as const)
  for(const stage of [1,2,3,4,5,6,7,8])for(const shape of Object.keys(shapes))
   runs.push({budget,policy,stage:STAGES[stage-1].label,shape,...play(stage,shape,lean,move)});
console.log(JSON.stringify({baseline:'origin/main via exp-copy',runs},null,1));
