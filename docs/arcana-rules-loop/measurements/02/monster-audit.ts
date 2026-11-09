// Cycle 02 monster audit. Part A reads origin/main data only. Part B runs a copy of the
// engine (./exp-copy from make-exp-copy.sh) with optional hooks for monster-role experiments.
// Run: ./make-exp-copy.sh && node --experimental-strip-types monster-audit.ts > monster-audit.json
//      LEAN=1 node --experimental-strip-types monster-audit.ts > monster-audit-lean.json
import {createDefense,actDefense,stepDefense} from './exp-copy/src/games/defense/engine.ts';
import {STAGES,ENEMIES,getSlots,getPaths} from './exp-copy/src/games/defense/data.ts';
import {getWavePlan,DIFFICULTIES} from './exp-copy/src/games/defense/difficulty.ts';
import type {DefenseAction,DefenseState,HeroId,EnemyKind,Enemy,Point} from './exp-copy/src/games/defense/types.ts';
const g=globalThis as any;
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const r=(n:number,d=0)=>Math.round(n*10**d)/10**d;

// ---------- Part A: numbers and HP curve (standard) ----------
function waveData(stageId:number,wave:number,mode:'standard'|'veteran'='standard'){
  const st=STAGES[stageId-1],plan=getWavePlan(stageId,wave,mode),set=DIFFICULTIES[mode];
  const scale=(st.region==='snow'?1.1+st.order*.12:.75+stageId*.15)*(1+(wave-1)*.16)*set.enemyHp;
  const hp=plan.reduce((n,k)=>n+Math.round(ENEMIES[k].hp*scale),0);
  let span=.4;
  for(let i=1;i<plan.length;i++){const gap=Math.max(.85,1.45-st.order*.09-wave*.05)*set.spawnInterval;const surge=wave>1&&wave<4&&i>=Math.ceil(plan.length*2/3);span+=surge?Math.max(.55,gap*.7):gap;}
  const baseAvg=plan.reduce((n,k)=>n+ENEMIES[k].hp,0)/plan.length;
  const kinds:Record<string,number>={};for(const k of plan)kinds[k]=(kinds[k]||0)+1;
  return {count:plan.length,scale:r(scale,3),baseAvgHp:r(baseAvg,1),totalHp:hp,spawnSpanSec:r(span,1),hpPerSec:r(hp/span),kinds};
}
const numbers=STAGES.map(st=>({stage:st.label,waves:[1,2,3,4].map(w=>waveData(st.id,w))}));
// Decompose wave-4 jumps between consecutive stages into count × scale × composition.
const jumps=STAGES.slice(1).map((st,i)=>{
  const a=numbers[i].waves[3],b=numbers[i+1].waves[3];
  return {from:numbers[i].stage,to:st.label,totalHpRatio:r(b.totalHp/a.totalHp,2),count:r(b.count/a.count,2),scale:r(b.scale/a.scale,2),composition:r(b.baseAvgHp/a.baseAvgHp,2)};
});

// ---------- Part B: simulated runs with monster-role variants ----------
const VISITOR:Record<number,HeroId|null>=Object.fromEntries(STAGES.map(s=>[s.id,s.visitor]));
const TRAINING=[0,0,2,3,4,5,5,5]; // standard auto policy entry levels (docs/arcana-rules-20261109/legal-progression.json)
type Policy='basic'|'auto'|'active'|'aware'|'skillOnly'|'moveOnly';
// LEAN=1 env: three purchases and training 0 for every policy (a tight budget where pressure shows).
const LEAN=process.env.LEAN==='1';
type Variant={name:string;stages:number[];dmg?:any;speed?:any;breach?:any;post?:(s:DefenseState,dt:number)=>void;aware?:(e:Enemy)=>boolean};
function route(stage:number,hero:HeroId,policy:Policy):DefenseAction[]{
  let rt:DefenseAction[]=[{type:'build',slot:2,kind:'magic'},{type:'build',slot:3,kind:'cannon'},{type:'upgrade',slot:2,branch:'fire'},{type:'build',slot:0,kind:'crossbow'},{type:'upgrade',slot:3,branch:'crush'},{type:'build',slot:5,kind:'crossbow'},{type:'hire',hero:'druid'},{type:'upgrade',slot:2},{type:'build',slot:4,kind:'cannon'},{type:'upgrade',slot:4,branch:'water'},{type:'upgrade',slot:5,branch:'pierce'},{type:'build',slot:1,kind:'magic'},{type:'upgrade',slot:1,branch:'lightning'},{type:'upgrade',slot:3},{type:'upgrade',slot:5}];
  if(STAGES[stage-1].expanded)rt.splice(6,0,{type:'build',slot:6,kind:'magic'},{type:'upgrade',slot:6,branch:'lightning'},{type:'build',slot:7,kind:'cannon'},{type:'upgrade',slot:7,branch:'water'});
  const visitors:HeroId[]=['mage',...STAGES.filter(s=>s.id<stage).map(s=>VISITOR[s.id]).filter((v):v is HeroId=>!!v)];
  const hire=(['druid','tao','elf','dwarf','barbarian','mage'] as HeroId[]).find(id=>id!==hero&&visitors.includes(id));
  rt=rt.flatMap<DefenseAction>(a=>a.type==='hire'?hire?[{type:'hire',hero:hire}]:[]:[a]);
  return LEAN?rt.slice(0,3):policy==='basic'?rt.slice(0,5):rt;
}
function play(stage:number,policy:Policy,v:Variant){
  g.__DMG=v.dmg;g.__SPEED=v.speed;g.__BREACH=v.breach;
  let s=createDefense(stage,'mage',LEAN?0:TRAINING[stage-1],'standard');
  const rt=route(stage,'mage',policy),lengths=getPaths(stage).map(p=>p.slice(1).reduce((n,q,i)=>n+dist(q,p[i]),0));
  let i=0,lastMove=-10,maxOn=0,coinsLost=0;
  for(let tick=0;tick<60*900;tick++){
    if(i<rt.length){const n=actDefense(s,rt[i]);if(n.coins<s.coins){i++;s=n;}}
    if(s.phase==='prep'||s.phase==='intermission')s=actDefense(s,{type:'start-wave'});
    if(s.phase==='promotion')s=actDefense(s,{type:'promote',choice:'power'});
    if((policy==='active'||policy==='aware'||policy==='skillOnly'||policy==='moveOnly')&&s.phase==='wave'){
      if(policy!=='moveOnly'&&s.skillCooldown===0&&(s.enemies.length>=5||s.bossCharge>0))s=actDefense(s,{type:'skill'});
      if(policy!=='skillOnly'&&s.time-lastMove>=2.5&&s.enemies.length&&s.dashTime===0){
        lastMove=s.time;
        const pool=policy==='aware'&&v.aware?s.enemies.filter(v.aware):[];
        const list=pool.length?pool:s.enemies;
        const enemy=[...list].sort((a,b)=>(lengths[a.path]-a.progress)/a.speed-(lengths[b.path]-b.progress)/b.speed)[0];
        const point={x:Math.min(840,enemy.x+20),y:Math.min(540,enemy.y+55)};
        if(dist(point,s.heroPosition)>100)s=actDefense(s,{type:s.dashCooldown===0?'dash':'move',point});
      }
    }
    if(s.phase==='won'||s.phase==='lost')break;
    maxOn=Math.max(maxOn,s.enemies.length);
    const before=s.coins;
    s=stepDefense(s,1/60);
    if(s.coins<before)coinsLost+=before-s.coins;
    if(s.phase==='wave'&&v.post)v.post(s,1/60);
  }
  return {phase:s.phase,hp:s.hp,outpost:s.outpostHp,leaks:s.leaks,kills:s.kills,sec:r(s.time),maxOnScreen:maxOn,coinsStolen:coinsLost};
}
const forest=[1,2,3,4],snow=[5,6,7,8];
const near=(s:DefenseState,e:Enemy,kind:EnemyKind,radius:number)=>s.enemies.some(o=>o!==e&&o.kind===kind&&o.hp>0&&dist(o,e)<radius);
const variants:Variant[]=[
  {name:'base',stages:[1,2,3,4,5,6,7,8]},
  // Guard: a stone armourer shields every other enemy within 70 (-35% damage taken). Not itself.
  {name:'guard',stages:[3,4,6,7,8],dmg:(s:DefenseState,e:Enemy)=>e.kind!=='stone'&&near(s,e,'stone',70)?.65:1,aware:e=>e.kind==='stone'},
  // Healer: a wood soldier regrows sprouts within 90 by 6% max HP per second.
  {name:'healer',stages:forest,post:(s,dt)=>{for(const w of s.enemies)if(w.kind==='wood')for(const e of s.enemies)if(e.kind==='sprout'&&e.hp>0&&dist(w,e)<90)e.hp=Math.min(e.maxHp,e.hp+.06*e.maxHp*dt);},aware:e=>e.kind==='wood'},
  // Elite guard (PR #104 candidate 'ancient-wood guard'): only the first wood/stone of waves 3-4 becomes a guard.
  {name:'guardElite',stages:[3,4,6,7,8],dmg:(s:DefenseState,e:Enemy)=>{const ids:Set<number>=(s as any).__guards||new Set();return !ids.has(e.id)&&s.enemies.some(o=>ids.has(o.id)&&o.hp>0&&dist(o,e)<70)?.65:1;},
   post:(s)=>{const st=s as any;st.__guards??=new Set<number>();st.__guardWave??=0;if(s.wave>=3&&st.__guardWave<s.wave){const c=s.enemies.find(e=>e.kind==='wood'||e.kind==='stone');if(c){st.__guards.add(c.id);st.__guardWave=s.wave;}}},
  },
  // Wolf ice: the engine's +25% ice bonus becomes wolf +50%, everyone else +10% (factor relative to engine).
  {name:'wolfIce',stages:snow,speed:(stage:number,e:Enemy)=>e.x>=300&&e.x<=520?(e.kind==='frostwolf'?1.5/1.25:1.1/1.25):1},
  // Pack: a frost wolf runs 25% faster while another wolf is within 70.
  {name:'pack',stages:snow,speed:(stage:number,e:Enemy,s:DefenseState)=>e.kind==='frostwolf'&&near(s,e,'frostwolf',70)?1.25:1},
  // Thief: a sprout that breaches steals 20 battle coins instead of village HP.
  {name:'thief',stages:forest,breach:(s:DefenseState,e:Enemy)=>e.kind==='sprout'?{hp:0,coins:20}:null},
  // Tower interference without tower HP: every 4th frost wolf (id%4==0) is a frost tracker;
  // towers within 90 of it reload at half speed (fire interval x2) while it is near.
  {name:'chill',stages:snow,post:(s,dt)=>{const slots=getSlots(s.stage);for(const t of s.towers)if(t.cooldown>0&&s.enemies.some(e=>e.kind==='frostwolf'&&e.id%4===0&&dist(e,slots[t.slot])<90))t.cooldown+=dt*.5;}},
];
const runs:any[]=[];
for(const v of variants)for(const stage of v.stages)for(const policy of (LEAN?['auto','active','skillOnly','moveOnly',...(v.aware?['aware']:[])]:['basic','auto','active',...(v.aware?['aware']:[])]) as Policy[])
  runs.push({variant:v.name,stage:STAGES[stage-1].label,policy,...play(stage,policy,v)});
console.log(JSON.stringify({baseline:'origin/main via exp-copy',lean:LEAN,numbers,jumps,runs},null,1));
