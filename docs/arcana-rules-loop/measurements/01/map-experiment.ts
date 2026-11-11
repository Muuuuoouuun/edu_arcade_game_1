// Cycle 01 experiment: does a mid-path join point make back build slots matter?
// Runs on an experiment copy whose engine reads optional globalThis hooks. Not a repo change.
import {createDefense,stepDefense,actDefense} from './exp-copy/src/games/defense/engine.ts';
import {getSlots,STAGES} from './exp-copy/src/games/defense/data.ts';
import type {DefenseState,Tower,TowerKind} from './exp-copy/src/games/defense/types.ts';
const g=globalThis as any;
const r=(n:number)=>Math.round(n);
function run(stageId:number,build:number[],kind:TowerKind='crossbow',difficulty:'standard'|'veteran'='standard'){
  let s:DefenseState=createDefense(stageId,'mage',0,difficulty);
  s={...s,towers:build.map(slot=>({slot,kind,level:1,branch:null,cooldown:0} as Tower))};
  const shots:Record<number,Set<number>>={};let combat=0;
  for(let t=0;t<60*900;t++){
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if(s.phase==='won'||s.phase==='lost')break;
    if(s.phase==='wave')combat+=1/60;
    for(const a of s.attacks)if(a.source==='tower'&&a.sourceSlot!==undefined)(shots[a.sourceSlot]??=new Set()).add(a.id);
    s=stepDefense(s,1/60);
  }
  return {phase:s.phase,hp:s.hp,leaks:s.leaks,sec:r(combat),busy:Object.fromEntries(Object.entries(shots).map(([k,v])=>[k,r(100*v.size*.7/combat)]))};
}
const cases:any[]=[];
const builds:Record<string,number[]>={front3:[0,1,2],back3:[3,4,5],all6:[0,1,2,3,4,5]};
const variants:Record<string,any>={
  base:{join:undefined,icy:undefined},
  join462:{join:(stage:number,i:number)=>i%3===1?462:0},
  join644:{join:(stage:number,i:number)=>i%3===1?644:0},
  frost1_3:{icy:(stage:number,e:any)=>stage===3&&e.path===0&&e.y>270&&e.y<300&&e.x>=230&&e.x<=410},
};
for(const stage of [1,2,3])for(const [vname,v] of Object.entries(variants)){
  if(vname==='frost1_3'&&stage!==3)continue;
  g.__JOIN=v.join;g.__ICY=v.icy;
  for(const [bname,b] of Object.entries(builds))cases.push({stage:STAGES[stage-1].label,variant:vname,build:bname,...run(stage,b)});
}
for(const c of cases)console.log(JSON.stringify(c));
