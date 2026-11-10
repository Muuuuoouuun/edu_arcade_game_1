import {createDefense,actDefense,stepDefense,waveSize,positionOnPath} from '../src/games/defense/engine.ts';
import {getStage,getPaths,ENEMIES} from '../src/games/defense/data.ts';
import {createCampaign,completeRun,trainCampaign} from '../src/games/defense/campaign.ts';
import type {DefenseAction,Difficulty,HeroId} from '../src/games/defense/types.ts';
/** Reproducible rules audit: earned progression only, no locked hires or injected gold.
 * Run with Node22: node --experimental-strip-types tools/audit-defense-rules.ts */
function play(stage:number,mode:Difficulty,strategy:'none'|'basic'|'auto'|'active',hero:HeroId,training:number,visitors:HeroId[]){
 let s=createDefense(stage,hero,training,mode);
 let route:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'hire',hero:'druid'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
 if(getStage(stage).expanded)route.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
 const hire = (['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!==hero&&visitors.includes(id));
 route = route.flatMap<DefenseAction>(a=>a.type==='hire' ? hire ? [{type:'hire' as const,hero:hire}] : [] : [a]);if(strategy==='none')route=[];if(strategy==='basic')route=route.slice(0,5);
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
  if(s.phase==='won'||s.phase==='lost')return {state:s,summary:{stage,mode,strategy,hero,training,hire:s.mercenary,phase:s.phase,hp:s.hp,outpost:s.outpostHp,kills:s.kills,seconds:Math.round(s.time),dashes,skills,towers:s.towers.length}};
  s=stepDefense(s,1/60);
 }
 throw Error('did not finish');
}
const results = [];
for(const difficulty of ['relaxed','standard','veteran'] as const)for(const strategy of ['auto','active'] as const){
 let campaign=createCampaign();const stages=[];
 for(let stage=1;stage<=8;stage++){
  // A simple legal policy, not an optimal player: keep starter mage; hire only earned companions.
  const result=play(stage,difficulty,strategy,'mage',campaign.training,campaign.visitors);
  const reward=completeRun(campaign,`audit-${difficulty}-${strategy}-${stage}`,result.state);
  campaign=reward.campaign;
  while(true){const next=trainCampaign(campaign);if(next===campaign)break;campaign=next;}
  stages.push({...result.summary,goldEarned:reward.goldEarned,questReward:reward.questReward,nextTraining:campaign.training,goldRemaining:campaign.gold});
  if(result.state.phase!=='won')break;
 }
 results.push({difficulty,strategy,stages,cleared:campaign.cleared.length});
}
// Isolated boundary states, not a natural-play result: verify the current boss escape contract.
const bossEscapeCases = ([4,8] as const).map(stage=>{
 const state=createDefense(stage,'mage');
 const kind=stage===4?'boss':'frostboss';
 const path=getPaths(stage)[0];
 const length=path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.y-path[i].y),0);
 const enemy=ENEMIES[kind];
 state.phase='wave';state.wave=4;state.spawned=waveSize(stage,4);state.nextId=2;
 state.enemies=[{id:1,kind,hp:enemy.hp,maxHp:enemy.hp,progress:length+1,path:0,speed:enemy.speed,...positionOnPath(0,length+1,stage),wet:0,burn:0,slow:0,hit:0,knockVelocity:0,knockCooldown:0,recoil:0,facing:1}];
 const after=stepDefense(state,1/60);
 return {stage,boss:kind,phase:after.phase,hp:after.hp,kills:after.kills,remainingEnemies:after.enemies.length};
});
console.log(JSON.stringify({bossEscapeCases,method:'Six deterministic legal progression policies. Starter mage throughout; only earned hires; automatic affordable training; instant choices and active input idealized. Not human win rates or a tuning recommendation.',results},null,2));
