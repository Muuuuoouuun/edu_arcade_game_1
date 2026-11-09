// Cycle 01 experiment (snow): blizzard sight rule on 2-3 and a snowbank segment on 2-2.
// Needs ./exp-copy from make-exp-copy.sh. Towers are injected (measurement only), hero idle.
import {createDefense,stepDefense,actDefense} from './exp-copy/src/games/defense/engine.ts';
import {STAGES} from './exp-copy/src/games/defense/data.ts';
import type {DefenseState,Tower,TowerKind} from './exp-copy/src/games/defense/types.ts';
const g=globalThis as any;
function run(stageId:number,build:number[],kind:TowerKind='crossbow'){
  let s:DefenseState=createDefense(stageId,'mage',0,'standard');
  s={...s,towers:build.map(slot=>({slot,kind,level:1,branch:null,cooldown:0} as Tower))};
  let combat=0;
  for(let t=0;t<60*900;t++){
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if(s.phase==='won'||s.phase==='lost')break;
    if(s.phase==='wave')combat+=1/60;
    s=stepDefense(s,1/60);
  }
  return {phase:s.phase,hp:s.hp,leaks:s.leaks,sec:Math.round(combat)};
}
const builds:Record<string,number[]>={front3:[0,1,2],high3:[0,3,5],all6:[0,1,2,3,4,5]};
const variants:Record<string,{stage:number,range?:any,speed?:any}>={
  '2-3 base':{stage:7},
  '2-3 blizzard range-30 (non-high)':{stage:7,range:(stage:number,slot:any)=>slot?.terrain==='high'?0:-30},
  '2-3 blizzard range-30 + enemies x0.9':{stage:7,range:(stage:number,slot:any)=>slot?.terrain==='high'?0:-30,speed:()=>.9},
  '2-2 base':{stage:6},
  '2-2 snowbank x0.8 bottom road':{stage:6,speed:(stage:number,e:any)=>e.path===0&&e.y>440&&e.x>=620&&e.x<=790?.8:1},
};
for(const [name,v] of Object.entries(variants)){
  g.__RANGE=v.range;g.__SPEED=v.speed;
  for(const [b,slots] of Object.entries(builds))console.log(JSON.stringify({case:name,stage:STAGES[v.stage-1].label,build:b,...run(v.stage,slots)}));
}
