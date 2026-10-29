import {createDefense,actDefense,stepDefense} from '../src/games/defense/engine.ts';
import {getStage,getPaths} from '../src/games/defense/data.ts';
import type {DefenseAction,Difficulty} from '../src/games/defense/types.ts';
/** Deterministic comparison using only normal public battle commands.
 * Stage 1: mage, training 0, no locked hire. Replays 4/8: barbarian, training 1.
 * none: no towers/skills; basic: three towers with two branch upgrades;
 * auto: complete mixed army, automatic attacks; active: same army plus skills
 * and a movement decision every 2.5 seconds, using dash when ready.
 * All modes make the same power promotion choice. There is no injected damage,
 * currency, enemy health or victory state; this models prompt, ideal UI input.
 * Run with Node 22: node --experimental-strip-types tools/balance-defense.ts
 */
function play(stage:number,mode:Difficulty,strategy:'none'|'basic'|'auto'|'active'){
 let s=createDefense(stage,stage===1?'mage':'barbarian',stage===1?0:1,mode);
 let route:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'hire',hero:'druid'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
 if(getStage(stage).expanded)route.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
 if(stage===1)route=route.filter(a=>a.type!=='hire');if(strategy==='none')route=[];if(strategy==='basic')route=route.slice(0,5);
 const lengths=getPaths(stage).map(path=>path.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-path[i].x,p.y-path[i].y),0));
 let index=0,lastMove=-10,dashes=0,skills=0;
 for(let tick=0;tick<36000;tick++){
  if(index<route.length){const next=actDefense(s,route[index]);if(next.coins<s.coins){index++;s=next;}}
  if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
  if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
  if(strategy==='active'&&s.phase==='wave'){
   if(s.skillCooldown===0&&(s.enemies.length>=5||s.bossCharge>0)){const n=actDefense(s,{type:'skill'});if(n!==s)skills++;s=n;}
   if(s.time-lastMove>=2.5&&s.enemies.length&&s.dashTime===0){
    lastMove=s.time;const enemy=[...s.enemies].sort((a,b)=>(lengths[a.path]-a.progress)/a.speed-(lengths[b.path]-b.progress)/b.speed)[0];
    const point={x:Math.min(840,enemy.x+20),y:Math.min(540,enemy.y+55)},dist=Math.hypot(point.x-s.heroPosition.x,point.y-s.heroPosition.y);
    if(dist>100){const n=actDefense(s,{type:s.dashCooldown===0?'dash':'move',point});if(n!==s&&n.dashTime>0)dashes++;s=n;}
   }
  }
  if(s.phase==='won'||s.phase==='lost')return {stage,mode,strategy,phase:s.phase,hp:s.hp,outpost:s.outpostHp,kills:s.kills,seconds:Math.round(s.time),dashes,skills,towers:s.towers.length};
  s=stepDefense(s,1/60);
 }
 throw Error('did not finish');
}
const results:ReturnType<typeof play>[]=[];
for(const stage of [1,4,8])for(const mode of ['relaxed','standard','veteran'] as const)for(const strategy of ['none','basic','auto','active'] as const)results.push(play(stage,mode,strategy));
console.log(JSON.stringify(results,null,2));
