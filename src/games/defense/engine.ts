import { BRANCHES, ENEMIES, HERO_ORDER, STAGE_COUNT, TOWERS, getPaths, getSlots, getStage, getRegion } from './data.ts';
import { DIFFICULTIES, getDifficulty, getWavePlan } from './difficulty.ts';
import type { Difficulty, Branch, DefenseAction, DefenseState, Element, Enemy, EnemyKind, HeroId, Point, Tower, TowerKind, CombatAttack, Projectile, AttackSource, AttackActor, DamageProfile, Effect } from './types.ts';

const regionalLengths = {forest:getPaths(1),snow:getPaths(5)};
const lengthsByRegion = Object.fromEntries(Object.entries(regionalLengths).map(([region,paths]) => [region,paths.map(points => points.slice(1).reduce((sum,p,i) => sum + Math.hypot(p.x-points[i].x,p.y-points[i].y),0))])) as Record<'forest'|'snow',number[]>;
const pathLengths = (stage:number) => lengthsByRegion[getRegion(stage)];
const distance = (a:Point,b:Point) => Math.hypot(a.x-b.x,a.y-b.y);
const terminal = (s:DefenseState) => s.phase === 'won' || s.phase === 'lost';
const copy = (s:DefenseState):DefenseState => ({...s,towers:s.towers.map(t=>({...t})),enemies:s.enemies.map(e=>({...e})),effects:s.effects.map(e=>({...e})),attacks:s.attacks.map(a=>({...a})),projectiles:s.projectiles.map(p=>({...p,position:{...p.position},previous:{...p.previous},velocity:{...p.velocity},to:{...p.to},hitIds:[...p.hitIds]})),heroPosition:{...s.heroPosition},heroTarget:{...s.heroTarget},heroVelocity:{...s.heroVelocity},mercenaryPosition:{...s.mercenaryPosition},pet:s.pet?{...s.pet,position:{...s.pet.position},target:{...s.pet.target}}:null});
export const allowedBranches = (kind:TowerKind):Branch[] => kind === 'crossbow' ? ['pierce','rapid'] : kind === 'magic' ? ['fire','lightning'] : ['crush','water'];
export const upgradeCost = (tower:Tower) => tower.level === 1 ? 80 : tower.level === 2 ? 120 : 0;
export const towerRange = (tower:Tower,stage=1) => (tower.kind === 'crossbow' ? 205 : tower.kind === 'magic' ? 195 : 185) + (getSlots(stage)[tower.slot]?.terrain === 'high' ? 45 : 0) + (tower.level-1)*12;
// Only 8 stages × 4 waves × 3 modes are possible. Forecast arrays stay private
// and read-only here instead of allocating an identical plan on every physics step.
const wavePlans=new Map<string,readonly EnemyKind[]>();
function battlePlan(stage:number,wave:number,difficulty:Difficulty):readonly EnemyKind[] {
  const mode=getDifficulty(difficulty),key=`${stage}:${wave}:${mode}`,known=wavePlans.get(key);
  if(known)return known;
  const plan=getWavePlan(stage,wave,mode);
  if(plan.length)wavePlans.set(key,plan);
  return plan;
}
export const waveSize = (stage:number,wave:number,difficulty:Difficulty='standard') => battlePlan(stage,wave,difficulty).length;

/** Progress is distance in board units, not a normalized fraction. */
export function positionOnPath(path:number,progress:number,stage=1):Point {
  const paths=getPaths(stage),points=paths[path] || paths[0];
  let left = Math.max(0,Number.isFinite(progress) ? progress : 0);
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],length=distance(a,b);
    if(left<=length) return {x:a.x+(b.x-a.x)*left/length,y:a.y+(b.y-a.y)*left/length};
    left-=length;
  }
  return {...points[points.length-1]};
}
export function createDefense(stage:number,hero:HeroId,training=0,difficulty:Difficulty='standard'):DefenseState {
  const id=Math.max(1,Math.min(STAGE_COUNT,Math.trunc(stage)||1)),data=getStage(id);
  const mode=getDifficulty(difficulty),settings=DIFFICULTIES[mode];
  const chosen=HERO_ORDER.includes(hero)?hero:'mage',position=data.region==='snow'?{x:440,y:390}:{x:440,y:355};
  return {stage:id,difficulty:mode,phase:'prep',paused:false,speed:1,time:0,wave:0,coins:(data.region==='snow'?280:240)+settings.startingCoins,hp:20,outpostHp:12,kills:0,leaks:0,enemies:[],towers:[],effects:[],attacks:[],projectiles:[],hero:chosen,heroPosition:position,heroTarget:{...position},heroVelocity:{x:0,y:0},dashCooldown:0,dashTime:0,heroFacing:-1,mercenaryPosition:{x:position.x+38,y:position.y+35},mercenaryFacing:-1,pet:chosen==='druid'?{position:{x:position.x+28,y:position.y-22},target:{x:position.x+28,y:position.y-22},facing:-1}:null,heroCooldown:0,mercenary:null,mercCooldown:0,petCooldown:0,skillCooldown:0,bossCharge:0,freeze:0,bossCycle:8,promotion:null,spawned:0,spawnTimer:0,nextId:1,training:Math.max(0,Math.min(5,Math.trunc(training)||0)),notice:data.region==='snow'?'빙판 위의 적은 빨라져요. 고지대와 화염 타워를 활용하세요.':'빛나는 건설 지점을 선택해 타워를 세우세요.',questProgress:data.questType==='hunt'?0:data.questType==='outpost'?12:20};
}

export function damageMultiplier(kind:EnemyKind,element:Element):number {
  if((kind==='sprout'||kind==='wood'||kind==='boss') && element==='fire') return 1.5;
  if((kind==='sprout'||kind==='wood'||kind==='boss') && element==='water') return .6;
  if((kind==='ice'||kind==='frostboss')&&(element==='fire'||element==='impact')) return 1.5;
  if(kind==='frostwolf'&&element==='fire') return 1.5;
  if(kind==='frostboss'&&element==='water') return .6;
  if(kind==='stone'&&element==='impact') return 1.5;
  if(kind==='stone'&&element==='fire') return .6;
  if(kind==='insulator'&&element==='lightning') return .6;
  return 1;
}
function effect(s:DefenseState,from:Point,to:Point,element:Element,text?:string,kind:Effect['kind']='impact',extra:Partial<Effect>={}) {
  const life=kind==='death' ? .7 : kind==='skill' ? .85 : kind==='shockwave' ? .5 : kind==='coin' ? .9 : kind==='build' ? .65 : kind==='upgrade' ? .8 : kind==='dash' ? .35 : .4;
  s.effects.push({id:s.nextId++,from:{x:from.x,y:from.y},to:{x:to.x,y:to.y},element,life,age:0,maxLife:life,kind,...(text?{text}:{}),...extra});
  if(s.effects.length>100)s.effects.splice(0,s.effects.length-100);
}
export const enemyMass = (kind:EnemyKind) => ({sprout:.8,wood:1.4,ice:1.8,stone:3.2,metal:2.2,insulator:.8,boss:7,frostwolf:1,frostboss:8})[kind];
function hit(s:DefenseState,e:Enemy,amount:number,element:Element,from:Point,force=0) {
  if(e.hp<=0)return;
  const multiplier=damageMultiplier(e.kind,element);
  e.hp-=amount*multiplier;e.hit=.16;e.recoil=.22;
  if(element==='fire')e.burn=Math.max(e.burn,2.5);
  if(element==='water'){e.wet=5;e.slow=2.7;}
  if(force>0&&(e.knockCooldown||0)<=0){
    e.knockVelocity=Math.min(180,force/enemyMass(e.kind));
    e.knockCooldown=1;
  }
  effect(s,from,e,element,`${multiplier>1?'약점! ':''}${Math.round(amount*multiplier)}`,'impact',{force,targetId:e.id});
}
function reap(s:DefenseState) {
  const dead=s.enemies.filter(e=>e.hp<=0);
  for(const enemy of dead){
    const bounty=enemy.kind==='boss'||enemy.kind==='frostboss'?100:enemy.kind==='frostwolf'?16:enemy.kind==='stone'?19:enemy.kind==='wood'?17:14;
    s.coins+=bounty;s.kills++;
    effect(s,enemy,enemy,'physical',`+${bounty}`,'coin');
    effect(s,enemy,enemy,'physical',undefined,'death',{targetSprite:ENEMIES[enemy.kind].sprite,targetId:enemy.id,targetKind:enemy.kind,targetFacing:enemy.facing||1,force:enemy.knockVelocity||0});
  }
  s.enemies=s.enemies.filter(e=>e.hp>0);
  if(!s.enemies.some(e=>e.kind==='frostboss')){s.bossCharge=0;s.freeze=0;}
  if(getStage(s.stage).questType==='hunt')s.questProgress=s.kills;
}
function orderedTargets(s:DefenseState,from:Point,range:number) {
  const lengths=pathLengths(s.stage);
  return s.enemies.filter(e=>e.hp>0&&distance(from,e)<=range).sort((a,b)=>(lengths[a.path]-a.progress)-(lengths[b.path]-b.progress));
}
function ownerPosition(s:DefenseState,source:AttackSource,slot?:number):Point {
  return source==='hero'?s.heroPosition:source==='mercenary'?s.mercenaryPosition:source==='pet'?s.pet?.position||s.heroPosition:getSlots(s.stage)[slot||0];
}
function queueAttack(s:DefenseState,source:AttackSource,actor:AttackActor,from:Point,range:number,damage:number,element:Element,options:{slot?:number;area?:number;chain?:boolean;pierce?:boolean;force?:number}={}) {
  if(s.attacks.some(a=>a.source===source&&a.sourceSlot===options.slot&&!a.fired))return false;
  const target=orderedTargets(s,from,range)[0];if(!target)return false;
  const melee=actor==='dwarf'||actor==='barbarian'||actor==='wolf';
  const kind:CombatAttack['kind']=melee?(actor==='wolf'?'melee':'slam'):actor==='cannon'?'slam':actor==='crossbow'||actor==='elf'?'shot':'spell';
  const hitAt=actor==='wolf'?.13:actor==='barbarian'?.28:actor==='dwarf'?.24:actor==='cannon'?.28:kind==='shot'?.1:.15;
  const duration=hitAt+(melee?.28:.18);
  const facing=target.x<from.x?-1:1;
  if(source==='hero')s.heroFacing=facing;else if(source==='mercenary')s.mercenaryFacing=facing;else if(source==='pet'&&s.pet)s.pet.facing=facing;
  if(source==='tower'){const tower=s.towers.find(t=>t.slot===options.slot);if(tower)tower.aim={...target};}
  s.attacks.push({id:s.nextId++,source,...(options.slot!==undefined?{sourceSlot:options.slot}:{}),actor,kind,from:{...from},to:{x:target.x,y:target.y},targetId:target.id,range,damage,element,area:options.area||0,force:options.force||0,chain:options.chain||false,pierce:options.pierce||false,splashLimit:source==='tower'?2:Infinity,splashDamage:source==='tower'?.4:.7,elapsed:0,duration,hitAt,fired:false});
  return true;
}
function resolveHit(s:DefenseState,target:Enemy,profile:DamageProfile,from:Point,center:Point=target) {
  hit(s,target,profile.damage,profile.element,from,profile.force);
  if(profile.area>0){
    const neighbors=s.enemies.filter(e=>e.id!==target.id&&e.hp>0&&distance(center,e)<profile.area).sort((a,b)=>distance(center,a)-distance(center,b)).slice(0,profile.splashLimit);
    for(const e of neighbors)hit(s,e,profile.damage*profile.splashDamage,profile.element,target,profile.force*.7);
    effect(s,center,center,profile.element,undefined,'shockwave',{force:profile.area});
  }
  if(profile.chain&&target.kind!=='insulator'&&(target.kind==='metal'||target.wet>0)){
    const next=s.enemies.filter(e=>e.id!==target.id&&e.hp>0&&distance(target,e)<155).sort((a,b)=>distance(target,a)-distance(target,b))[0];
    if(next&&next.kind!=='insulator'){hit(s,next,profile.damage*.85,'lightning',target);effect(s,target,next,'lightning',undefined,'chain');}
  }
}
function launch(s:DefenseState,a:CombatAttack) {
  const from=ownerPosition(s,a.source,a.sourceSlot),target=s.enemies.find(e=>e.id===a.targetId&&e.hp>0);
  a.from={...from};
  if(!target)return; // A completed windup cannot strike a target already defeated.
  a.to={x:target.x,y:target.y};
  if(a.actor==='wolf'||a.actor==='dwarf'||a.actor==='barbarian'){
    if(target&&distance(from,target)<=a.range+22){resolveHit(s,target,a,from);if(a.actor==='wolf')target.slow=Math.max(target.slow,1.6);}
    else effect(s,from,a.to,a.element,undefined,'shockwave',{force:22});
    return;
  }
  const kind:Projectile['kind']=a.actor==='cannon'?'shell':a.kind==='shot'?'arrow':'bolt';
  const speed=kind==='arrow'?650:kind==='bolt'?460:390;
  const dx=a.to.x-from.x,dy=a.to.y-from.y,len=Math.max(1,Math.hypot(dx,dy));
  const duration=kind==='shell'?Math.max(.3,Math.min(.9,len/speed)):len/speed;
  s.projectiles.push({...a,id:s.nextId++,kind,position:{...from},previous:{...from},from:{...from},to:{...a.to},velocity:{x:dx/len*speed,y:dy/len*speed},targetId:target?.id||null,elapsed:0,duration,progress:0,arcHeight:kind==='shell'?55+len*.12:0,height:0,radius:kind==='shell'?9:kind==='arrow'?5:9,speed,hitIds:[],remainingHits:a.pierce?2:1});
  if(a.source==='tower'){const tower=s.towers.find(t=>t.slot===a.sourceSlot);if(tower)tower.recoil=.24;}
}
function advanceAttacks(s:DefenseState,dt:number) {
  for(const a of s.attacks){
    if(a.source==='tower'&&s.freeze>0&&!a.fired)continue;
    a.elapsed+=dt;
    if(!a.fired&&a.elapsed>=a.hitAt){a.fired=true;launch(s,a);}
  }
  s.attacks=s.attacks.filter(a=>a.elapsed<a.duration);
}
function segmentDistance(p:Point,a:Point,b:Point):number {
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
  return distance(p,{x:a.x+dx*t,y:a.y+dy*t});
}
function advanceProjectiles(s:DefenseState,dt:number) {
  const keep:Projectile[]=[];
  for(const p of s.projectiles){
    p.previous={...p.position};p.elapsed+=dt;
    if(p.kind==='shell'){
      p.progress=Math.min(1,p.elapsed/p.duration);p.height=4*p.arcHeight*p.progress*(1-p.progress);
      p.position={x:p.from.x+(p.to.x-p.from.x)*p.progress,y:p.from.y+(p.to.y-p.from.y)*p.progress};
      if(p.progress>=1){
        const target=s.enemies.filter(e=>e.hp>0&&distance(p.to,e)<=p.area).sort((a,b)=>distance(p.to,a)-distance(p.to,b))[0];
        if(target)resolveHit(s,target,p,p.to,p.to);else effect(s,p.to,p.to,p.element,undefined,'shockwave',{force:p.area});
      }else keep.push(p);
      continue;
    }
    const target=p.targetId===null?undefined:s.enemies.find(e=>e.id===p.targetId&&e.hp>0);
    if(target){p.to={x:target.x,y:target.y};const dx=target.x-p.position.x,dy=target.y-p.position.y,len=Math.max(.001,Math.hypot(dx,dy));p.velocity={x:dx/len*p.speed,y:dy/len*p.speed};}
    p.position={x:p.position.x+p.velocity.x*dt,y:p.position.y+p.velocity.y*dt};
    p.progress=Math.min(1,p.elapsed/Math.max(.01,p.duration));
    const collided=s.enemies.filter(e=>e.hp>0&&!p.hitIds.includes(e.id)&&segmentDistance(e,p.previous,p.position)<=p.radius+(e.kind==='boss'||e.kind==='frostboss'?32:16)).sort((a,b)=>distance(a,p.previous)-distance(b,p.previous));
    for(const e of collided){
      resolveHit(s,e,p,p.previous);p.hitIds.push(e.id);p.remainingHits--;p.targetId=null;
      if(p.remainingHits<=0)break;
      p.damage*=.6;
    }
    if(p.remainingHits>0&&p.elapsed<2.5&&p.position.x>-100&&p.position.x<1000&&p.position.y>-100&&p.position.y<700)keep.push(p);
  }
  s.projectiles=keep;
}
function moveTowards(from:Point,to:Point,speed:number,dt:number):Point {
  const len=distance(from,to);if(len<.01)return{...to};const t=Math.min(1,speed*dt/len);return{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};
}
const HERO_SPEED=230, HERO_ACCELERATION=1200, HERO_BRAKING=1800;
const DASH_SPEED=750, DASH_RANGE=200, DASH_COOLDOWN=5;
const clampHero = (p:Point):Point => ({x:Math.max(30,Math.min(850,p.x)),y:Math.max(45,Math.min(555,p.y))});
function advanceHero(s:DefenseState,dt:number,combat:boolean) {
  const previous=s.heroPosition;
  if(combat&&s.dashTime>0){
    s.heroPosition=clampHero(moveTowards(s.heroPosition,s.heroTarget,DASH_SPEED,Math.min(dt,s.dashTime)));
    s.dashTime=Math.max(0,s.dashTime-dt);
    if(s.dashTime<1e-8||distance(s.heroPosition,s.heroTarget)<.01){s.heroPosition={...s.heroTarget};s.dashTime=0;s.heroVelocity={x:0,y:0};}
  }else{
    const dx=s.heroTarget.x-s.heroPosition.x,dy=s.heroTarget.y-s.heroPosition.y,remaining=Math.hypot(dx,dy);
    if(remaining<.01){s.heroPosition={...s.heroTarget};s.heroVelocity={x:0,y:0};}
    else{
      const speed=Math.min(HERO_SPEED,Math.sqrt(2*HERO_BRAKING*remaining));
      const desired={x:dx/remaining*speed,y:dy/remaining*speed},old=s.heroVelocity;
      const braking=Math.hypot(old.x,old.y)>speed||(old.x*dx+old.y*dy)<0;
      const velocity=moveTowards(old,desired,braking?HERO_BRAKING:HERO_ACCELERATION,dt);
      const travel={x:(old.x+velocity.x)*dt*.5,y:(old.y+velocity.y)*dt*.5};
      // Snap only when crossing the destination plane, never oscillate past it.
      if((travel.x*dx+travel.y*dy)/remaining>=remaining){s.heroPosition={...s.heroTarget};s.heroVelocity={x:0,y:0};}
      else{
        const point=clampHero({x:s.heroPosition.x+travel.x,y:s.heroPosition.y+travel.y});
        s.heroVelocity={x:point.x===30||point.x===850?0:velocity.x,y:point.y===45||point.y===555?0:velocity.y};s.heroPosition=point;
      }
    }
  }
  if(Math.abs(s.heroPosition.x-previous.x)>.05)s.heroFacing=s.heroPosition.x<previous.x?-1:1;
}
function stopDash(s:DefenseState) {
  if(s.dashTime>0){s.dashTime=0;s.heroTarget={...s.heroPosition};s.heroVelocity={x:0,y:0};}
}
function advanceActors(s:DefenseState,dt:number,combat:boolean) {
  advanceHero(s,dt,combat);
  const mercTarget={x:Math.min(875,s.heroPosition.x+38),y:Math.min(565,s.heroPosition.y+35)};
  const mercX=s.mercenaryPosition.x;s.mercenaryPosition=moveTowards(s.mercenaryPosition,mercTarget,220,dt);if(Math.abs(s.mercenaryPosition.x-mercX)>.05)s.mercenaryFacing=s.mercenaryPosition.x<mercX?-1:1;
  if(s.hero==='druid'||s.mercenary==='druid'){
    const owner=s.hero==='druid'?s.heroPosition:s.mercenaryPosition;
    s.pet??={position:{x:owner.x+28,y:owner.y-22},target:{...owner},facing:-1};
    const enemy=combat?orderedTargets(s,owner,240)[0]:undefined;
    s.pet.target=enemy?{x:Math.max(20,enemy.x-28),y:Math.min(560,enemy.y+18)}:{x:Math.min(875,owner.x+28),y:Math.max(35,owner.y-22)};
    const petX=s.pet.position.x;s.pet.position=moveTowards(s.pet.position,s.pet.target,280,dt);if(Math.abs(s.pet.position.x-petX)>.05)s.pet.facing=s.pet.position.x<petX?-1:1;
  }else s.pet=null;
}
function advanceEffects(s:DefenseState,dt:number) {
  s.effects=s.effects.map(e=>({...e,life:e.life-dt,age:(e.age||0)+dt})).filter(e=>e.life>0);
  for(const tower of s.towers)tower.recoil=Math.max(0,(tower.recoil||0)-dt);
}

function heroStats(hero:HeroId) {
  return hero==='elf'?{range:280,power:26,interval:.64,element:'physical' as Element}:
    hero==='dwarf'?{range:155,power:55,interval:1.3,element:'impact' as Element}:
    hero==='tao'?{range:220,power:29,interval:.85,element:'lightning' as Element}:
    hero==='barbarian'?{range:140,power:66,interval:1.3,element:'impact' as Element}:
    hero==='druid'?{range:195,power:16,interval:.95,element:'physical' as Element}:
    {range:170,power:22,interval:1.1,element:'fire' as Element};
}
/** Actual persistent position, shared with the renderer; never snaps to a target. */
export function petPosition(s:DefenseState):Point|null {return s.pet?.position||null;}

export type TacticalAction = Extract<DefenseAction,{type:'build'|'upgrade'|'hire'|'sell'}>;
export function isTacticalAction(action:DefenseAction):action is TacticalAction {
  return action.type==='build'||action.type==='upgrade'||action.type==='hire'||action.type==='sell';
}

export function actDefense(state:DefenseState,action:DefenseAction):DefenseState {
  if(terminal(state)) return state;
  if(action.type==='pause') return state.paused?state:{...state,paused:true};
  if(action.type==='resume') return state.paused?{...state,paused:false}:state;
  if(state.paused) return state;
  if(action.type==='speed') return {...state,speed:state.speed===1?2:1};
  return applyDefenseAction(state,action);
}

/** Explicit paused purchase path. Session and campaign permissions live in tactics.ts. */
export function actTacticalDefense(state:DefenseState,action:TacticalAction):DefenseState {
  if(!state.paused||!['prep','wave','intermission'].includes(state.phase)||!isTacticalAction(action))return state;
  return applyDefenseAction(state,action);
}

// Both command paths use exactly the same prices, validation and mutations.
// Tactical purchases never resume the state or execute a simulation step.
function applyDefenseAction(state:DefenseState,action:DefenseAction):DefenseState {
  const s=copy(state);
  if(action.type==='start-wave') {
    if(s.phase!=='prep'&&s.phase!=='intermission') return state;
    s.phase='wave';s.wave++;s.spawned=0;s.spawnTimer=.4;s.effects=[];s.notice=getStage(s.stage).expanded&&s.wave===4?`${s.stage===8?'서리군주':'고목왕'}가 다가옵니다. 두 거점을 지켜주세요!`:`웨이브 ${s.wave} 시작!`;
  } else if(action.type==='build') {
    const slot=getSlots(s.stage).find(p=>p.id===action.slot),kind=TOWERS[action.kind];
    if(!slot||slot.unlock>s.stage||!kind||s.towers.some(t=>t.slot===action.slot)||s.phase==='promotion') return state;
    if(s.coins<kind.cost) return {...state,notice:'전투 코인이 부족해요. 적을 처치하면 모을 수 있어요.'};
    s.coins-=kind.cost;s.towers.push({slot:action.slot,kind:action.kind,level:1,branch:null,cooldown:0});s.notice=`${kind.name} 건설 완료!`;
    effect(s,slot,slot,action.kind==='magic'?'fire':action.kind==='cannon'?'impact':'physical',undefined,'build',{sourceSlot:slot.id,targetSprite:kind.sprite});
  } else if(action.type==='upgrade') {
    const tower=s.towers.find(t=>t.slot===action.slot);
    if(!tower||tower.level>=3||s.phase==='promotion') return state;
    if(tower.level===1&&(!action.branch||!allowedBranches(tower.kind).includes(action.branch))) return state;
    const cost=upgradeCost(tower);
    if(s.coins<cost) return {...state,notice:'강화할 전투 코인이 부족해요.'};
    s.coins-=cost;tower.level++;if(tower.level===2) tower.branch=action.branch!;
    s.notice=`${tower.branch?BRANCHES[tower.branch].name:TOWERS[tower.kind].name} ${tower.level}단계!`;
    const slot=getSlots(s.stage)[tower.slot];
    effect(s,slot,slot,tower.branch?BRANCHES[tower.branch].element:'physical',undefined,'upgrade',{sourceSlot:tower.slot,targetSprite:TOWERS[tower.kind].sprite});
  } else if(action.type==='sell') {
    const tower=s.towers.find(t=>t.slot===action.slot);if(!tower||s.phase==='promotion') return state;
    const invested=TOWERS[tower.kind].cost+(tower.level>=2?80:0)+(tower.level>=3?120:0);
    s.coins+=Math.floor(invested*.75);s.towers=s.towers.filter(t=>t!==tower);s.attacks=s.attacks.filter(a=>a.source!=='tower'||a.sourceSlot!==tower.slot||a.fired);s.notice='투자한 전투 코인의 75%를 돌려받았어요.';
  } else if(action.type==='hire') {
    if(s.mercenary||action.hero===s.hero||!HERO_ORDER.includes(action.hero)||s.phase==='promotion') return state;
    if(s.coins<120) return {...state,notice:'용병 고용에는 전투 코인 120이 필요해요.'};
    s.coins-=120;s.mercenary=action.hero;s.mercCooldown=0;s.mercenaryPosition={x:s.heroPosition.x+38,y:s.heroPosition.y+35};if(action.hero==='druid'&&!s.pet)s.pet={position:{x:s.mercenaryPosition.x+28,y:s.mercenaryPosition.y-22},target:{...s.mercenaryPosition},facing:-1};s.notice='용병 합류! 영웅 옆에서 함께 싸워요.';
  } else if(action.type==='move') {
    if(!Number.isFinite(action.point.x)||!Number.isFinite(action.point.y)||s.phase==='promotion'||s.dashTime>0) return state;
    s.heroTarget=clampHero(action.point);s.attacks=s.attacks.filter(a=>a.source!=='hero'||a.fired);
  } else if(action.type==='dash') {
    if(s.phase!=='wave'||s.dashCooldown>0||!Number.isFinite(action.point.x)||!Number.isFinite(action.point.y))return state;
    const aim=clampHero(action.point),dx=aim.x-s.heroPosition.x,dy=aim.y-s.heroPosition.y,len=Math.hypot(dx,dy);
    if(len<1)return state;
    const travel=Math.min(DASH_RANGE,len);
    s.heroTarget={x:s.heroPosition.x+dx/len*travel,y:s.heroPosition.y+dy/len*travel};
    s.heroVelocity={x:dx/len*DASH_SPEED,y:dy/len*DASH_SPEED};s.dashTime=travel/DASH_SPEED;s.dashCooldown=DASH_COOLDOWN;
    if(Math.abs(dx)>.01)s.heroFacing=dx<0?-1:1;
    s.attacks=s.attacks.filter(a=>a.source!=='hero'||a.fired);
    effect(s,s.heroPosition,s.heroTarget,'physical',undefined,'dash',{force:travel});
    s.notice='질주! 빠르게 방어 위치를 바꿨어요.';
  } else if(action.type==='promote') {
    if(s.phase!=='promotion'||s.promotion||!['power','control'].includes(action.choice)) return state;
    s.promotion=action.choice;s.phase='intermission';s.notice=action.choice==='power'?'전직 완료! 공격력과 필살기가 강해졌어요.':'전직 완료! 사거리 증가 · 필살기에 둔화 효과!';
  } else if(action.type==='skill') {
    if(s.phase!=='wave'||s.skillCooldown>0||s.enemies.length===0) return state;
    const stats=heroStats(s.hero);const boost=(1+s.training*.08)*(s.promotion==='power'?1.4:1);
    const interrupt=s.bossCharge>0&&s.enemies.some(e=>e.kind==='frostboss');
    if(interrupt){s.bossCharge=0;s.bossCycle=9;effect(s,s.heroPosition,s.enemies.find(e=>e.kind==='frostboss')!,'lightning','차단!','interrupt');}
    // Manual skills remain usable during a tower freeze and can interrupt its telegraph.
    const skillPower=s.hero==='barbarian'?165:s.hero==='druid'?90:115;
    effect(s,s.heroPosition,s.heroPosition,stats.element,undefined,'skill',{force:260});
    for(const e of s.enemies) {
      hit(s,e,skillPower*boost,stats.element,s.heroPosition,s.hero==='barbarian'?220:s.hero==='dwarf'?170:0);
      if(s.promotion==='control'||s.hero==='tao'||s.hero==='druid') e.slow=s.hero==='druid'?5:4;
    }
    s.skillCooldown=20;s.notice=interrupt?'충전 차단! 서리군주의 눈보라를 막았어요.':'필살기 발동!';reap(s);
  }
  return s;
}
export function questSatisfied(s:DefenseState):boolean {
  const stage=getStage(s.stage);
  return stage.questType==='hunt'?s.questProgress>=stage.questGoal:stage.questType==='outpost'?s.outpostHp>=stage.questGoal:s.hp>=stage.questGoal;
}
export function questComplete(s:DefenseState):boolean {return s.phase==='won'&&questSatisfied(s);}

export function stepDefense(state:DefenseState,dt:number):DefenseState {
  if(state.paused||state.phase==='promotion'||!Number.isFinite(dt)||dt<=0)return state;
  // A finished battle only settles its final visual effects. Combat, rewards,
  // positions and pending projectiles remain frozen while the result is revealed.
  if(terminal(state)){
    if(state.effects.length===0)return state;
    const delta=Math.min(.1,dt);
    return {...state,time:state.time+delta,effects:state.effects.map(e=>({...e,life:e.life-delta,age:(e.age||0)+delta})).filter(e=>e.life>0)};
  }
  const combat=state.phase==='wave';
  const mercTarget={x:Math.min(875,state.heroPosition.x+38),y:Math.min(565,state.heroPosition.y+35)};
  if(!combat&&distance(state.heroPosition,state.heroTarget)<.01&&Math.hypot(state.heroVelocity.x,state.heroVelocity.y)<.01&&(!state.mercenary||distance(state.mercenaryPosition,mercTarget)<.01)&&(!state.pet||distance(state.pet.position,state.pet.target)<.01)&&state.effects.length===0)return state;
  const s=copy(state),delta=Math.min(.1,dt),stage=getStage(s.stage),lengths=pathLengths(s.stage),settings=DIFFICULTIES[getDifficulty(s.difficulty)];
  const plan=battlePlan(s.stage,s.wave,s.difficulty);
  s.time+=delta;advanceEffects(s,delta);advanceActors(s,delta,combat);
  if(!combat)return s;
  s.skillCooldown=Math.max(0,s.skillCooldown-delta);s.dashCooldown=Math.max(0,s.dashCooldown-delta);s.spawnTimer-=delta;
  if(s.spawned<plan.length&&s.spawnTimer<=0){
    const kind=plan[s.spawned],base=ENEMIES[kind];
    const path=stage.expanded&&s.spawned%3===0&&kind!=='boss'&&kind!=='frostboss'?1:0;
    const hp=Math.round(base.hp*(stage.region==='snow'?1.1+stage.order*.12:.75+s.stage*.15)*(1+(s.wave-1)*.16)*settings.enemyHp);
    s.enemies.push({id:s.nextId++,kind,hp,maxHp:hp,progress:0,path,speed:base.speed*settings.enemySpeed,...positionOnPath(path,0,s.stage),wet:0,burn:0,slow:0,hit:0,knockVelocity:0,knockCooldown:0,recoil:0,facing:1});
    s.spawned++;s.spawnTimer+=Math.max(.85,1.45-stage.order*.09-s.wave*.05)*settings.spawnInterval;
    if(kind==='boss')s.notice='고목왕: 체력이 절반이 되면 돌진해요!';
    if(kind==='frostboss'){s.bossCycle=6;s.notice='서리군주 등장! 충전할 때 필살기로 눈보라를 끊으세요.';}
  }
  s.freeze=Math.max(0,s.freeze-delta);
  const frostboss=s.enemies.find(e=>e.kind==='frostboss'&&e.hp>0);
  // Charge begins after entering range; a boss at the entrance cannot freeze remote towers.
  if(frostboss&&(frostboss.progress>=220||s.bossCharge>0)){
    if(s.bossCharge>0){
      s.bossCharge=Math.max(0,s.bossCharge-delta);
      if(s.bossCharge===0){s.freeze=2;s.bossCycle=9;s.notice='눈보라! 타워가 2초 동안 얼어붙었어요. 영웅과 영물은 계속 싸워요.';for(const t of s.towers)effect(s,frostboss,getSlots(s.stage)[t.slot],'water','동결!','freeze');}
    }else{s.bossCycle-=delta;if(s.bossCycle<=0){s.bossCharge=2.5;s.notice='눈보라 충전! 지금 필살기를 써서 막아주세요!';}}
  }
  for(const e of s.enemies){
    if(e.burn>0)e.hp-=4*damageMultiplier(e.kind,'fire')*delta;
    e.burn=Math.max(0,e.burn-delta);e.wet=Math.max(0,e.wet-delta);e.slow=Math.max(0,e.slow-delta);e.hit=Math.max(0,e.hit-delta);
    e.recoil=Math.max(0,(e.recoil||0)-delta);e.knockCooldown=Math.max(0,(e.knockCooldown||0)-delta);
    const water=stage.region==='forest'&&e.x>650&&e.x<735,icy=stage.region==='snow'&&e.x>=300&&e.x<=520;
    if(water||stage.climate==='rain')e.wet=Math.max(e.wet,2);
    const charge=e.kind==='boss'&&e.hp<e.maxHp*.5?1.55:1;
    const forward=e.speed*delta*(e.slow>0?.55:1)*(water?.8:1)*(icy?1.25:1)*charge*(e.kind==='frostboss'&&s.bossCharge>0?0:1);
    // An impulse moves distance backwards along the road. Friction and a one-second
    // immunity window prevent stacks of cannons from pinning a body indefinitely.
    const friction=Math.exp(-6*delta),retreat=(e.knockVelocity||0)*(1-friction)/6;
    e.progress=Math.max(0,e.progress+forward-retreat);
    e.knockVelocity=(e.knockVelocity||0)*friction;if(e.knockVelocity<.1)e.knockVelocity=0;
    const point=positionOnPath(e.path,e.progress,s.stage);if(Math.abs(point.x-e.x)>.01)e.facing=point.x<e.x?-1:1;e.x=point.x;e.y=point.y;
  }
  // Already airborne projectiles keep moving during a tower freeze. Newly released
  // shots start their flight next step, so damage cannot happen at shot creation.
  advanceProjectiles(s,delta);advanceAttacks(s,delta);reap(s);
  const damageBoost=1+s.training*.08;
  for(const tower of s.towers){
    if(s.freeze>0)continue;
    tower.cooldown=Math.max(0,tower.cooldown-delta);if(tower.cooldown>0)continue;
    const from=getSlots(s.stage)[tower.slot],branch=tower.branch;
    const power=(tower.kind==='crossbow'?22:tower.kind==='magic'?35:48)*(1+(tower.level-1)*.45)*damageBoost*(branch==='pierce'?1.3:1);
    const element:Element=branch?BRANCHES[branch].element:tower.kind==='magic'?'fire':tower.kind==='cannon'?'impact':'physical';
    const area=tower.kind==='cannon'?(branch==='water'?105:76):0;
    if(queueAttack(s,'tower',tower.kind,from,towerRange(tower,s.stage),power,element,{slot:tower.slot,area,chain:branch==='lightning',pierce:branch==='pierce',force:tower.kind==='cannon'?110:0}))tower.cooldown=(tower.kind==='crossbow'?.7:tower.kind==='magic'?.95:1.5)*(branch==='rapid'?.52:1);
  }
  s.heroCooldown=Math.max(0,s.heroCooldown-delta);
  const stats=heroStats(s.hero),heroMelee=s.hero==='barbarian'||s.hero==='dwarf';
  if(s.heroCooldown===0&&s.dashTime===0&&queueAttack(s,'hero',s.hero,s.heroPosition,stats.range+(s.promotion==='control'?65:0),stats.power*damageBoost*(s.promotion==='power'?1.4:1),stats.element,{area:s.hero==='barbarian'?75:s.hero==='dwarf'?50:0,chain:s.hero==='tao',force:heroMelee?(s.hero==='barbarian'?190:150):0}))s.heroCooldown=stats.interval;
  s.mercCooldown=Math.max(0,s.mercCooldown-delta);
  if(s.mercenary&&s.mercCooldown===0){
    const merc=heroStats(s.mercenary);
    if(queueAttack(s,'mercenary',s.mercenary,s.mercenaryPosition,merc.range,merc.power*.8*damageBoost,merc.element,{area:s.mercenary==='barbarian'?75:s.mercenary==='dwarf'?50:0,chain:s.mercenary==='tao',force:s.mercenary==='barbarian'?190:s.mercenary==='dwarf'?150:0}))s.mercCooldown=merc.interval;
  }
  s.petCooldown=Math.max(0,s.petCooldown-delta);
  if(s.pet&&s.petCooldown===0&&queueAttack(s,'pet','wolf',s.pet.position,90,24*damageBoost*(s.hero==='druid'?1:.8)*(s.hero==='druid'&&s.promotion==='power'?1.4:1),'physical'))s.petCooldown=.8;
  const escaped=s.enemies.filter(e=>e.progress>=lengths[e.path]);
  for(const e of escaped){
    const loss=e.kind==='boss'||e.kind==='frostboss'?8:1;
    if(e.path===1)s.outpostHp=Math.max(0,s.outpostHp-loss);else s.hp=Math.max(0,s.hp-loss);
    s.leaks++;effect(s,e,e,'physical','돌파!');
  }
  s.enemies=s.enemies.filter(e=>e.progress<lengths[e.path]);
  s.questProgress=stage.questType==='hunt'?s.kills:stage.questType==='outpost'?s.outpostHp:s.hp;
  if(s.hp<=0){stopDash(s);s.phase='lost';s.attacks=[];s.projectiles=[];s.notice='마을이 무너졌어요. 배치를 바꾸고 다시 도전해요.';return s;}
  if(s.spawned>=plan.length&&s.enemies.length===0){
    stopDash(s);
    s.coins+=45;s.skillCooldown=0;s.attacks=[];s.projectiles=[];s.bossCharge=0;s.freeze=0;
    if(s.wave>=4){s.phase='won';s.notice='방어 성공! 수비대의 소문이 퍼지고 있어요.';}
    else if(s.wave===2&&!s.promotion){s.phase='promotion';s.notice='전직할 시간! 수비대의 힘을 선택하세요.';}
    else{s.phase='intermission';s.notice='웨이브 방어 성공! 전투 코인 +45 · 필살기 충전';}
  }
  return s;
}
