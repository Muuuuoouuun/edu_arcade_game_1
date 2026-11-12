/** Deterministic no-reinforcement comparison. Uses the same 1/60 s tick as LegionGame. */
import { actLegion, createLegion, stepLegion } from '../src/games/legion/engine.ts';
import type { LegionState, UnitKind } from '../src/games/legion/types.ts';

type Placement = [UnitKind,number,number];
const archers:Placement[]=[['archer',1100,260],['archer',1100,360],['archer',1100,460],['archer',1100,560],['archer',1100,650]];
const mixed:Placement[]=[['shield',950,335],['shield',950,565],['archer',1120,330],['mage',1120,570],['beast',1035,450]];
const offset=(plan:Placement[],dx:number,dy:number):Placement[]=>plan.map(([kind,x,y])=>[kind,x+dx,y+dy]);
const plans:Record<string,Placement[]>={
  archer5:archers,
  archer4:[['archer',1100,260],['archer',1100,385],['archer',1100,510],['archer',1100,635]],
  archer4_shield1:[['shield',950,450],['archer',1100,260],['archer',1100,385],['archer',1100,510],['archer',1100,635]],
  mixed_front:mixed,
  mixed_back:offset(mixed,150,0),
  mixed_north:offset(mixed,0,-65),
  mixed_south:offset(mixed,0,65),
};
function simulate(plan:Placement[]){
  let state:LegionState=createLegion();
  for(const [kind,x,y] of plan){
    const next=actLegion(state,{type:'deploy',kind,point:{x,y}});
    if(next===state)throw new Error(`invalid audit placement: ${kind} (${x},${y})`);
    state=next;
  }
  const cost=600-state.coins,initial=state.units.length;
  state=actLegion(state,{type:'start'});
  // No recruitment or purchases during or between waves; intermission starts immediately.
  for(let ticks=0;ticks<60*300&&!['won','lost'].includes(state.phase);ticks++){
    state=stepLegion(state,1/60);
    if(state.phase==='intermission')state=actLegion(state,{type:'start'});
  }
  return {cost,initial,result:state.phase,wave:state.wave,kills:state.kills,hp:state.hp,remaining:state.units.length,gold:state.coins,seconds:Math.round(state.time*10)/10};
}
console.log(JSON.stringify({tick:1/60,reinforcements:false,plans:Object.fromEntries(Object.entries(plans).map(([name,plan])=>[name,simulate(plan)]))},null,2));
