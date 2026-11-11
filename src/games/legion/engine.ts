import { DEPLOY, LANES, MAX_ENEMIES, MONSTER_DEFS, POPULATION_CAP, UNIT_DEFS, WAVE_COUNT, WAVE_TOTALS } from './data.ts';
import type { LegionAction, LegionEffect, LegionState, Monster, MonsterKind, Point, Soldier, UnitKind } from './types.ts';

const dist = (a:Point,b:Point) => Math.hypot(a.x-b.x,a.y-b.y);
const copy = (s:LegionState):LegionState => ({...s,units:s.units.map(u=>({...u,home:{...u.home}})),enemies:s.enemies.map(e=>({...e})),effects:s.effects.map(e=>({...e,from:{...e.from},to:{...e.to}}))});
const pathLengths=LANES.map(points=>points.slice(1).map((p,i)=>dist(points[i],p)));
const laneLengths=pathLengths.map(parts=>parts.reduce((a,b)=>a+b,0));
function along(lane:number,progress:number):Point {
  const points=LANES[lane];
  for(let i=0;i<points.length-1;i++){
    const length=pathLengths[lane][i];
    if(progress<=length){const t=Math.max(0,progress)/length;return {x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t};}
    progress-=length;
  }
  return {...points[points.length-1]};
}
function move(actor:Point,to:Point,speed:number,dt:number){const d=dist(actor,to);if(d<.01)return;const amount=Math.min(1,speed*dt/d);actor.x+=(to.x-actor.x)*amount;actor.y+=(to.y-actor.y)*amount;}
function effect(s:LegionState,kind:LegionEffect['kind'],from:Point,to:Point,color:string,material?:LegionEffect['material'],sourceId?:number){
  s.effects.push({id:s.nextId++,kind,from:{x:from.x,y:from.y},to:{x:to.x,y:to.y},age:0,duration:kind==='death'?.7:kind==='breach'?.55:kind==='summon'?.55:.32,color,material,...(sourceId===undefined?{}:{sourceId})});
  if(s.effects.length>96)s.effects.splice(0,s.effects.length-96);
}
export function createLegion():LegionState {
  return {phase:'prep',time:0,wave:0,coins:600,hp:20,kills:0,spawned:0,spawnClock:0,nextId:1,units:[],enemies:[],effects:[],notice:'병종을 선택하고 빛나는 배치 구역을 눌러 부대를 소환하세요.'};
}
export function inDeployment(point:Point){return Number.isFinite(point?.x)&&Number.isFinite(point?.y)&&point.x>=DEPLOY.left&&point.x<=DEPLOY.right&&point.y>=DEPLOY.top&&point.y<=DEPLOY.bottom;}
/** Returns a reason for UI validation; state and economy are only mutated by actLegion. */
export function deploymentIssue(s:LegionState,kind:UnitKind,point:Point):string|null {
  const def=Object.hasOwn(UNIT_DEFS,kind)?UNIT_DEFS[kind]:null;
  if(!def||!['prep','intermission','wave'].includes(s.phase))return '지금은 소환할 수 없어요.';
  if(!inDeployment(point))return '빛나는 배치 구역 안에 놓아 주세요.';
  if(s.coins<def.cost)return '소환 골드가 부족해요.';
  if(s.units.length+def.count>POPULATION_CAP)return '병력 상한에 도달했어요.';
  const positions=formation(kind,point);
  if(positions.some(p=>!inDeployment(p)))return '부대가 들어갈 수 있도록 구역 안쪽을 선택해 주세요.';
  if(positions.some(p=>s.units.some(u=>dist(u,p)<24||dist(u.home,p)<24)))return '다른 부대와 원래 배치 자리에서 조금 떨어진 곳에 놓아 주세요.';
  return null;
}
function formation(kind:UnitKind,point:Point):Point[]{const count=UNIT_DEFS[kind].count;return Array.from({length:count},(_,i)=>({x:point.x,y:point.y+(i-(count-1)/2)*32}));}
export function actLegion(s:LegionState,action:LegionAction):LegionState {
  if(s.phase==='won'||s.phase==='lost')return s;
  if(action.type==='deploy'){
    if(deploymentIssue(s,action.kind,action.point))return s;
    const next=copy(s),def=UNIT_DEFS[action.kind];next.coins-=def.cost;
    for(const p of formation(action.kind,action.point)){
      next.units.push({...p,id:next.nextId++,kind:action.kind,hp:def.hp,maxHp:def.hp,home:{...p},cooldown:0,skillCooldown:1.8,hit:0,facing:-1});
      effect(next,'summon',p,p,'#64ebdf');
    }
    next.notice=`${def.name} ${def.count}${action.kind==='beast'?'체':'명'} 합류 · 이동·공격·스킬은 자동입니다.`;return next;
  }
  if(action.type==='remove'){
    if(s.phase!=='prep'&&s.phase!=='intermission')return s;
    const unit=s.units.find(u=>u.id===action.id);if(!unit)return s;
    const next=copy(s),refund=Math.floor(UNIT_DEFS[unit.kind].cost/UNIT_DEFS[unit.kind].count);
    next.units=next.units.filter(u=>u.id!==unit.id);next.coins+=refund;next.notice=`${UNIT_DEFS[unit.kind].name} 회수 · ${refund} 골드 반환`;return next;
  }
  if(action.type==='start'&&(s.phase==='prep'||s.phase==='intermission')&&s.units.length>0&&s.wave<WAVE_COUNT){
    const next=copy(s);next.phase='wave';next.wave++;next.spawned=0;next.spawnClock=0;next.effects=[];next.notice=`제${next.wave} 습격 · ${WAVE_TOTALS[next.wave-1]}마리가 세 진입로로 다가옵니다.`;return next;
  }
  return s;
}
function kindFor(wave:number,index:number):MonsterKind {
  if(wave===4&&index===WAVE_TOTALS[3]-1)return 'boss';
  if(wave>=2&&index%11===0)return 'stone';
  if(wave>=2&&index%7===0)return 'metal';
  if(index%5===0)return 'frostwolf';
  return index%3===0?'wood':'sprout';
}
function spawn(s:LegionState){
  const kind=kindFor(s.wave,s.spawned),lane=s.spawned%3,def=MONSTER_DEFS[kind],point=along(lane,0),boost=1+(s.wave-1)*.13;
  s.enemies.push({...point,id:s.nextId++,kind,hp:Math.round(def.hp*boost),maxHp:Math.round(def.hp*boost),lane,progress:0,cooldown:.5,hit:0,slow:0,facing:1});s.spawned++;
}
function damageEnemy(enemy:Monster,damage:number,cause:Monster['lastHit']='physical'){if(enemy.hp<=0)return;enemy.hp=Math.max(0,enemy.hp-damage);enemy.hit=.13;enemy.lastHit=cause;}
function nearest<T extends Point & {hp:number}>(at:Point,items:T[],range:number):T|undefined {
  let chosen:T|undefined,best=range;
  for(const item of items){if(item.hp<=0)continue;const d=dist(at,item);if(d<best){chosen=item;best=d;}}
  return chosen;
}
function attack(s:LegionState,unit:Soldier,target:Monster){
  const def=UNIT_DEFS[unit.kind],skill=unit.skillCooldown<=0;
  unit.cooldown=def.cooldown;unit.facing=target.x<unit.x?-1:1;
  if(skill){
    unit.skillCooldown=unit.kind==='archer'?5.5:unit.kind==='mage'?6:unit.kind==='beast'?4.8:5;
    if(unit.kind==='mage'){
      const targets=s.enemies.filter(e=>e.hp>0&&dist(e,target)<105).slice(0,8);
      for(const enemy of targets)damageEnemy(enemy,def.damage*1.7,'fire');
      effect(s,'burst',unit,target,'#ffb45e');
    }else if(unit.kind==='archer'){
      const targets=s.enemies.filter(e=>e.hp>0&&dist(e,unit)<=def.range).sort((a,b)=>dist(a,target)-dist(b,target)).slice(0,3);
      for(const enemy of targets){damageEnemy(enemy,def.damage*1.25);effect(s,'shot',unit,enemy,'#d1f68b');}
    }else if(unit.kind==='beast'){
      for(const enemy of s.enemies.filter(e=>e.hp>0&&dist(e,unit)<110).slice(0,7)){damageEnemy(enemy,def.damage*1.3,'impact');enemy.slow=2;}
      effect(s,'burst',unit,unit,'#ffe18c');
    }else{damageEnemy(target,def.damage*2,'impact');target.slow=1.5;effect(s,'slash',unit,target,'#ffe8a9',undefined,unit.id);}
  }else{
    damageEnemy(target,def.damage*(unit.kind==='mage'&&(target.kind==='wood'||target.kind==='sprout')?1.2:1),unit.kind==='mage'?'fire':unit.kind==='shield'||unit.kind==='beast'?'impact':'physical');
    effect(s,unit.kind==='shield'||unit.kind==='beast'?'slash':'shot',unit,target,unit.kind==='mage'?'#7fe6ff':unit.kind==='archer'?'#dcf69e':'#ffe6ab',undefined,unit.id);
  }
}
function dead(s:LegionState){
  for(const enemy of s.enemies){if(enemy.hp>0)continue;s.kills++;s.coins+=MONSTER_DEFS[enemy.kind].bounty;
    const material=enemy.kind==='stone'?'stone':enemy.kind==='metal'?'metal':enemy.kind==='frostwolf'?'frost':'wood';
    effect(s,'death',enemy,enemy,material==='wood'?(enemy.lastHit==='fire'?'#f2ab57':'#99704a'):material==='frost'?'#96dffc':material==='metal'?'#b6c5d4':'#c4ad88',material);
  }
  s.enemies=s.enemies.filter(e=>e.hp>0);
  for(const unit of s.units)if(unit.hp<=0)effect(s,'death',unit,unit,'#7de8da','magic');
  s.units=s.units.filter(u=>u.hp>0);
}
/** Pure bounded simulation step. Caller controls pause/speed and uses fixed 1/60 ticks. */
export function stepLegion(s:LegionState,deltaSeconds:number):LegionState {
  if(!Number.isFinite(deltaSeconds)||deltaSeconds<=0)return s;
  const dt=Math.min(deltaSeconds,.05);
  if(s.phase==='won'||s.phase==='lost'){if(s.effects.length===0)return s;return {...s,effects:s.effects.map(e=>({...e,age:e.age+dt})).filter(e=>e.age<e.duration)};}
  if(s.phase!=='wave'&&s.effects.length===0)return s;
  const next=copy(s);
  next.effects=next.effects.map(e=>({...e,age:e.age+dt})).filter(e=>e.age<e.duration);
  if(next.phase!=='wave')return next;
  next.time+=dt;
  next.spawnClock-=dt;
  // Cap limits simultaneous population, never consumes/skips scheduled spawns.
  while(next.spawnClock<=0&&next.spawned<WAVE_TOTALS[next.wave-1]&&next.enemies.length<MAX_ENEMIES){spawn(next);next.spawnClock+=Math.max(.14,.29-next.wave*.025);}
  if(next.enemies.length>=MAX_ENEMIES)next.spawnClock=Math.max(0,next.spawnClock);
  for(const u of next.units){
    u.cooldown=Math.max(0,u.cooldown-dt);u.skillCooldown=Math.max(0,u.skillCooldown-dt);u.hit=Math.max(0,u.hit-dt);
    const def=UNIT_DEFS[u.kind],melee=u.kind==='shield'||u.kind==='beast';
    const target=nearest(u,next.enemies,melee?280:def.range);
    if(target){u.facing=target.x<u.x?-1:1;
      if(dist(u,target)<=def.range){if(u.cooldown===0)attack(next,u,target);}
      else if(melee&&dist(u.home,target)<330)move(u,target,def.speed,dt);
      else move(u,u.home,def.speed*.6,dt);
    }else move(u,u.home,def.speed*.7,dt);
  }
  dead(next);
  for(const e of next.enemies){
    e.cooldown=Math.max(0,e.cooldown-dt);e.hit=Math.max(0,e.hit-dt);e.slow=Math.max(0,e.slow-dt);
    const target=nearest(e,next.units,e.kind==='boss'?76:48),def=MONSTER_DEFS[e.kind];
    if(target){e.facing=target.x<e.x?-1:1;if(e.cooldown===0){e.cooldown=def.cooldown;target.hp=Math.max(0,target.hp-def.damage*(1+(next.wave-1)*.1));target.hit=.12;effect(next,'slash',e,target,'#ff8875');}}
    else{const boost=e.kind==='boss'&&e.hp<e.maxHp/2?1.4:1;e.progress+=def.speed*dt*(e.slow>0?.6:1)*boost;Object.assign(e,along(e.lane,e.progress));e.facing=1;}
    if(e.progress>=laneLengths[e.lane]){next.hp=Math.max(0,next.hp-(e.kind==='boss'?20:1));effect(next,'breach',e,e,'#ffb46d');e.progress=Infinity;}
  }
  next.enemies=next.enemies.filter(e=>Number.isFinite(e.progress));
  dead(next);
  if(next.hp<=0){next.phase='lost';next.notice='방어선이 무너졌어요. 전열과 후열을 나눠 다시 배치해 보세요.';return next;}
  if(next.spawned===WAVE_TOTALS[next.wave-1]&&next.enemies.length===0){
    next.phase=next.wave===WAVE_COUNT?'won':'intermission';
    if(next.phase==='won'){next.notice='세 진입로를 모두 지켰어요! 군단 방어 성공.';return next;}
    next.coins+=120;
    for(const u of next.units){u.hp=Math.min(u.maxHp,u.hp+u.maxHp*.35);u.x=u.home.x;u.y=u.home.y;u.cooldown=0;u.skillCooldown=1.8;}
    next.notice='습격 방어 완료 · 보급 120 골드 · 생존 병력 회복. 부대를 보충하고 다음 습격을 시작하세요.';
  }
  return next;
}
