// Cycle 01 map audit. Reads a scratch copy of origin/main; never edits the repo.
import {createDefense,stepDefense,actDefense,waveSize,towerRange} from '../../../../src/games/defense/engine.ts';
import {STAGES,getPaths,getSlots,ENEMIES} from '../../../../src/games/defense/data.ts';
import {getWavePlan,DIFFICULTIES} from '../../../../src/games/defense/difficulty.ts';
import type {Point,DefenseState,Tower} from '../../../../src/games/defense/types.ts';

const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
function sample(path:Point[],step=1):Point[]{const out:Point[]=[];for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],L=dist(a,b);for(let t=0;t<L;t+=step)out.push({x:a.x+(b.x-a.x)*t/L,y:a.y+(b.y-a.y)*t/L});}return out;}
const r=(n:number,d=1)=>Math.round(n*10**d)/10**d;

const geometry:any[]=[];
for(const stage of STAGES){
  const paths=getPaths(stage.id).slice(0,stage.expanded?2:1),slots=getSlots(stage.id).filter(s=>s.unlock<=stage.id);
  const lanes=paths.map((p,lane)=>{
    const pts=sample(p);
    const zone=(q:Point)=>stage.region==='forest'?(q.x>650&&q.x<735):(q.x>=300&&q.x<=520);
    const zoneShare=pts.filter(zone).length/pts.length;
    // Traverse time by kind on standard (no slow, no knockback).
    const mult=(q:Point)=>stage.region==='forest'?(zone(q)?.8:1):(zone(q)?1.25:1);
    const kinds=[...new Set([...getWavePlan(stage.id,1),...getWavePlan(stage.id,4)])];
    const traverse=Object.fromEntries(kinds.map(k=>[k,r(pts.reduce((t,q)=>t+1/(ENEMIES[k].speed*mult(q)),0))]));
    // Coverage depth with Lv1 crossbow range (205, high +45), all unlocked slots.
    const depth=pts.map(q=>slots.filter(s=>dist(s,q)<=205+(s.terrain==='high'?45:0)).length);
    const hist=[0,1,2,3].map(n=>r(100*depth.filter(d=>n===3?d>=3:d===n).length/pts.length,0));
    const perSlot=Object.fromEntries(slots.map(s=>[`${s.id}:${s.terrain}`,r(100*pts.filter(q=>dist(s,q)<=205+(s.terrain==='high'?45:0)).length/pts.length,0)]));
    return {lane,length:Math.round(pts.length),zoneSharePct:r(zoneShare*100,0),traverseSec:traverse,coverageDepthPct:{none:hist[0],one:hist[1],two:hist[2],threePlus:hist[3]},slotCoveragePct:perSlot};
  });
  geometry.push({stage:stage.label,region:stage.region,climate:stage.climate,expanded:stage.expanded,slots:slots.length,lanes});
}

// Wave pressure: count and total HP per wave (standard), same formula as engine spawn.
const pressure=STAGES.map(stage=>({stage:stage.label,waves:[1,2,3,4].map(w=>{
  const plan=getWavePlan(stage.id,w,'standard');
  const scale=(stage.region==='snow'?1.1+stage.order*.12:.75+stage.id*.15)*(1+(w-1)*.16);
  const hp=plan.reduce((n,k)=>n+Math.round(ENEMIES[k].hp*scale),0);
  const kinds:Record<string,number>={};for(const k of plan)kinds[k]=(kinds[k]||0)+1;
  return {count:plan.length,totalHp:hp,kinds};
})}));

// Slot utilisation: every unlocked slot gets an injected Lv1 crossbow (measurement only), hero idle.
function utilisation(stageId:number){
  let s:DefenseState=createDefense(stageId,'mage',0,'standard');
  s={...s,towers:getSlots(stageId).filter(x=>x.unlock<=stageId).map(x=>({slot:x.id,kind:'crossbow',level:1,branch:null,cooldown:0} as Tower))};
  const shots:Record<number,Set<number>>={};let combat=0;
  for(let tick=0;tick<60*900;tick++){
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if(s.phase==='won'||s.phase==='lost')break;
    if(s.phase==='wave')combat+=1/60;
    for(const a of s.attacks)if(a.source==='tower'&&a.sourceSlot!==undefined)(shots[a.sourceSlot]??=new Set()).add(a.id);
    s=stepDefense(s,1/60);
  }
  const busy=Object.fromEntries(Object.entries(shots).map(([slot,set])=>[slot,r(100*set.size*.7/combat,0)]));
  return {stage:STAGES[stageId-1].label,phase:s.phase,hp:s.hp,outpost:s.outpostHp,leaks:s.leaks,combatSec:Math.round(combat),busyPct:busy};
}
const util=STAGES.map(st=>utilisation(st.id));
console.log(JSON.stringify({geometry,pressure,util},null,1));
