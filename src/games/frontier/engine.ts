import{BEACON_CAPTURE}from'./beacon.ts';
import{RELIC_PICKUP}from'./relic.ts';
import{WOOD_DEFEAT}from'./woodDefeat.ts';
import{DASH_VISUAL,type DashTrace}from'./dash.ts';
/** Small, isolated 3D training ground. No campaign saves or rewards are written. */
import {HERO_ATTACK,hammerPoint,inHammerReach,walkContactWeight,type HeroAttack} from './heroAttack.ts';
import {WOOD_ATTACK,inWoodStrike,type WoodAttack} from './woodAttack.ts';
import {BALLISTA,angleDelta,turnToward,ballistaMuzzle,type Position3} from './ballista.ts';
export type Tower={pad:number;level:number;cooldown:number;heading:number;actionTime:number|null;targetId:number|null;released:boolean};
export type Bolt={id:number;targetId:number;pad:number;position:Position3;previous:Position3;damage:number;life:number};
export type Mode='defense'|'command'|'solo';
export type Point={x:number;z:number};
export type SquadMember=Point&{cooldown:number;heading?:number;walkDistance?:number;moving?:boolean;restTime?:number;shotAt?:number;shotHeading?:number};
export type Enemy=Point&{id:number;hp:number;cooldown:number;path:number;maxHp?:number;heading?:number;walkDistance?:number;moving?:boolean;restTime?:number;attack?:WoodAttack;hitAt?:number;hitHeading?:number};
export type FallenWood={enemy:Enemy;at:number};
export type Frontier={mode:Mode;phase:'ready'|'playing'|'won'|'lost';paused:boolean;speed:1|2;time:number;wave:number;remaining:number;spawnIn:number;gold:number;coreHp:number;coreHitAt?:number;hero:Point&{hp:number;maxHp:number;target:Point;heading:number;moving:boolean;strike:number;cooldown:number;skill:number;dash:number;dashTrace?:DashTrace;walkDistance:number;walkStartDistance?:number;settle?:{time:number;walkTime:number;walkWeight?:number};attack?:HeroAttack};squad:SquadMember[];enemies:Enemy[];towers:Tower[];bolts:Bolt[];beacon:number;crystals:number[];crystalClaimedAt?:Record<number,number>;fallen?:FallenWood[];kills:number;xp:number;level:number;serial:number;effects:{id:number;from:Point;to:Point;kind:'shot'|'skill'|'hit'|'impact'|'club'|'hammer'|'shockwave';life:number}[];message:string};
export const MODES={defense:{name:'성문 방어',tag:'타워 디펜스',goal:'3개 웨이브를 막고 성문을 지키세요.',control:'빛나는 건설 지점을 눌러 포탑을 배치·강화하세요.',size:40},command:{name:'변경 지휘',tag:'디펜스 + 분대 지휘',goal:'분대로 동쪽 봉화를 점령하고 3개 웨이브를 막으세요.',control:'땅을 눌러 분대 이동 · 가까운 건설 지점에 전초 포탑 배치',size:64},solo:{name:'수정 원정',tag:'영웅 직접 조작',goal:'적 6마리·수정 3개를 확보한 뒤 동쪽 출구로 이동하세요.',control:'WASD / 방향 패드 이동 · 근접 강타 Q · 충격파 E · 돌진 Space (준비 취소)',size:64}} as const;
export const PADS:Point[]=[{x:-21,z:12},{x:-9,z:8},{x:-24,z:-7},{x:-7,z:-16},{x:15,z:5},{x:19,z:-12}];
export const CORE={x:-14,z:21},BEACON={x:19,z:-17},EXIT={x:23,z:-23};
export const CRYSTALS:Point[]=[{x:-20,z:-14},{x:17,z:12},{x:20,z:-16}];
const PATH:Point[]=[{x:-22,z:-26},{x:-12,z:-15},{x:-20,z:-2},CORE];
export const heightAt=(x:number,z:number)=>x>=2&&x<=10&&Math.abs(z)<=2.8?.36:Math.max(0,Math.min(1,(-z-2)/10))*4.6;
export const walkable=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<28&&Math.abs(p.z)<28&&!(p.x>3&&p.x<9&&Math.abs(p.z)>2);
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
function travel(p:Point,target:Point,amount:number):Point{
 let t=target;
 if(p.x<=3&&target.x>3)t=Math.abs(p.z)>.1?{x:2,z:0}:{x:Math.min(10,target.x),z:0};
 else if(p.x>=9&&target.x<9)t=Math.abs(p.z)>.1?{x:10,z:0}:{x:Math.max(2,target.x),z:0};
 else if(p.x>3&&p.x<9)t={x:target.x<=3?2:target.x>=9?10:target.x,z:target.x>3&&target.x<9?target.z:0};
 const d=distance(p,t);if(d<.001)return {...p};const q={x:p.x+(t.x-p.x)*Math.min(1,amount/d),z:p.z+(t.z-p.z)*Math.min(1,amount/d)};
 return walkable(q)?q:{...p};
}
export function createFrontier(mode:Mode):Frontier{return {mode,phase:'ready',paused:false,speed:1,time:0,wave:0,remaining:0,spawnIn:0,gold:180,coreHp:180,hero:{x:-14,z:14,hp:mode==='command'?180:100,maxHp:mode==='command'?180:100,target:{x:-14,z:14},heading:0,moving:false,strike:0,cooldown:0,skill:0,dash:0,walkDistance:0},squad:mode==='command'?[{x:-16,z:16,cooldown:0},{x:-12,z:16,cooldown:0},{x:-14,z:18,cooldown:0}]:[],enemies:[],towers:[],bolts:[],beacon:0,crystals:[],kills:0,xp:0,level:1,serial:1,effects:[],message:MODES[mode].goal};}
function clone(s:Frontier):Frontier{return {...s,hero:{...s.hero,target:{...s.hero.target},settle:s.hero.settle?{...s.hero.settle}:undefined,attack:s.hero.attack?{...s.hero.attack}:undefined},squad:s.squad.map(p=>({...p})),enemies:s.enemies.map(e=>({...e,attack:e.attack?{...e.attack}:undefined})),towers:s.towers.map(t=>({...t})),bolts:s.bolts.map(b=>({...b,position:{...b.position},previous:{...b.previous}})),effects:s.effects.map(e=>({...e})),crystals:[...s.crystals],...(s.crystalClaimedAt?{crystalClaimedAt:{...s.crystalClaimedAt}}:{}),...(s.fallen?{fallen:[...s.fallen]}:{})};}
function effect(s:Frontier,from:Point,to:Point,kind:'shot'|'skill'|'hit'|'impact'|'club'|'hammer'|'shockwave'){s.effects.push({id:s.serial++,from:{x:from.x,z:from.z},to:{x:to.x,z:to.z},kind,life:kind==='skill'?.45:kind==='impact'?.46:.18});}
function reward(s:Frontier){s.kills++;s.gold+=14;s.xp+=30;while(s.xp>=s.level*60){s.xp-=s.level*60;s.level++;s.hero.maxHp+=15;s.hero.hp=Math.min(s.hero.maxHp,s.hero.hp+25);s.message=`레벨 ${s.level} · 공격 +3 · 최대 체력 +15`;}}
function damage(s:Frontier,e:Enemy,n:number,source:Point){if(e.hp<=0)return;e.hp=Math.max(0,e.hp-n);e.hitAt=s.time;e.hitHeading=Math.atan2(e.x-source.x,e.z-source.z);if(e.hp===0){s.fallen??=[];s.fallen.push({enemy:{...e,attack:e.attack?{...e.attack}:undefined},at:s.time});if(s.fallen.length>WOOD_DEFEAT.limit)s.fallen.shift();reward(s);}}
function beginHeroAttack(s:Frontier,kind:'basic'|'skill',targetId:number|null,heading:number){
 const h=s.hero,fromMoving=h.moving,walkTime=h.moving?(h.walkDistance/HERO_ATTACK.stride*.8)%.8:0;h.settle=undefined;h.heading=heading;h.moving=false;h.strike=HERO_ATTACK.duration;
 h.attack={kind,time:0,heading,targetId,damage:kind==='basic'?22+s.level*3:45+s.level*5,hit:false,walkTime,fromMoving,...(fromMoving?{walkWeight:walkContactWeight(h.walkDistance,h.walkStartDistance)}:{})};
 if(kind==='basic')h.cooldown=HERO_ATTACK.interval;else h.skill=6;
}
function strike(s:Frontier){
 if(s.hero.attack||s.hero.cooldown>0)return;
 const e=s.enemies.filter(e=>e.hp>0&&distance(e,s.hero)<HERO_ATTACK.reach).sort((a,b)=>distance(a,s.hero)-distance(b,s.hero))[0];
 if(!e){if(s.mode==='solo')s.message='망치가 닿도록 적 가까이 이동하세요.';return;}
 beginHeroAttack(s,'basic',e.id,Math.atan2(e.x-s.hero.x,e.z-s.hero.z));
}
function cancelHeroAttack(s:Frontier){const a=s.hero.attack;if(a&&!a.hit){if(a.kind==='basic')s.hero.cooldown=0;else s.hero.skill=0;}s.hero.attack=undefined;s.hero.strike=0;}
export type Command={type:'start'|'pause'|'speed'|'attack'|'skill'|'dash'|'interact'}|{type:'move';point:Point}|{type:'build';pad:number};
export function actFrontier(previous:Frontier,a:Command):Frontier{
 if(a.type==='pause')return previous.phase==='playing'?{...previous,paused:!previous.paused}:previous;
 if(a.type==='speed')return previous.phase==='playing'?{...previous,speed:previous.speed===1?2:1}:previous;
 if(previous.paused||previous.phase==='won'||previous.phase==='lost')return previous;
 if(a.type==='build'&&previous.mode==='solo'||a.type==='move'&&previous.mode==='defense'||a.type==='attack'&&previous.mode!=='solo'||a.type==='skill'&&previous.mode==='defense'||a.type==='dash'&&previous.mode!=='solo'||a.type==='interact'&&previous.mode!=='solo')return previous;
 const s=clone(previous);
 if(a.type==='start'&&s.phase==='ready'){
  s.phase='playing';s.wave=1;s.remaining=s.mode==='solo'?0:8;s.spawnIn=.5;
  if(s.mode==='solo')s.enemies=Array.from({length:10},(_,i)=>({id:s.serial++,x:i<5?-22+i*3:13+(i-5)*2,z:i<5?-20+(i%2)*7:-17+(i%3)*10,hp:60,maxHp:60,cooldown:0,path:0}));
  s.message=MODES[s.mode].control;return s;
 }
 if(a.type==='build'&&s.mode!=='solo'){
  const p=PADS[a.pad];if(!p||s.mode==='defense'&&a.pad>3)return previous;
  if(s.mode==='command'&&distance(s.hero,p)>8){s.message='분대를 건설 지점 가까이 이동하세요.';return s;}
  const tower=s.towers.find(t=>t.pad===a.pad),cost=tower?90:60;
  if(s.gold<cost){s.message=`금화 ${cost} 필요`;return s;}if(tower&&tower.level>=3)return previous;
  s.gold-=cost;if(tower)tower.level++;else s.towers.push({pad:a.pad,level:1,cooldown:0,heading:Math.PI,actionTime:null,targetId:null,released:false});s.message=tower?`포탑 ${tower.level}단계 강화`:'포탑 건설 완료';return s;
 }
 if(s.phase!=='playing')return previous;
 if(a.type==='move'&&s.mode!=='defense'&&walkable(a.point)){s.hero.target={...a.point};return s;}
 if(a.type==='attack'&&s.mode==='solo')strike(s);
 if(a.type==='skill'&&s.mode!=='defense'&&s.hero.skill<=0&&!s.hero.attack)beginHeroAttack(s,'skill',null,s.hero.heading);
 if(a.type==='dash'&&s.mode==='solo'&&s.hero.dash<=0){cancelHeroAttack(s);s.hero.settle=undefined;s.hero.moving=false;s.hero.dash=3;const from={x:s.hero.x,z:s.hero.z},target={x:s.hero.x+Math.sin(s.hero.heading)*5,z:s.hero.z+Math.cos(s.hero.heading)*5};for(let i=0;i<20;i++){const p={x:s.hero.x+(target.x-s.hero.x)/(20-i),z:s.hero.z+(target.z-s.hero.z)/(20-i)};if(!walkable(p))break;s.hero.x=p.x;s.hero.z=p.z;}s.hero.target={x:s.hero.x,z:s.hero.z};s.hero.dashTrace=distance(from,s.hero)>1e-6?{from,to:{x:s.hero.x,z:s.hero.z},at:s.time}:undefined;}
 if(a.type==='interact'&&s.mode==='solo'){
  const index=CRYSTALS.findIndex((p,i)=>!s.crystals.includes(i)&&distance(p,s.hero)<RELIC_PICKUP.radius);
  if(index>=0){s.crystals.push(index);s.crystalClaimedAt??={};s.crystalClaimedAt[index]=s.time;s.hero.hp=Math.min(s.hero.maxHp,s.hero.hp+RELIC_PICKUP.heal);s.message=`수정 ${s.crystals.length}/3 · 체력 25 회복`;}
  else if(distance(s.hero,EXIT)<4&&s.crystals.length===3&&s.kills>=6){s.phase='won';s.message='수정 원정 완료';}
  else s.message=s.crystals.length===3&&s.kills>=6?'동쪽 출구의 고리 안에서 상호작용하세요.':'수정 가까이에서 상호작용하세요.';
 }
 s.enemies=s.enemies.filter(e=>e.hp>0);return s;
}
export function stepFrontier(previous:Frontier,elapsed:number,axis:Point={x:0,z:0}):Frontier{
 if(previous.phase!=='playing'||previous.paused||!Number.isFinite(elapsed)||elapsed<=0)return previous;
 const s=clone(previous),dt=Math.min(.05,elapsed)*s.speed;s.time+=dt;
 s.effects=s.effects.map(e=>({...e,life:e.life-dt})).filter(e=>e.life>0);if(s.hero.dashTrace&&s.time-s.hero.dashTrace.at>=DASH_VISUAL.duration)s.hero.dashTrace=undefined;if(s.fallen)s.fallen=s.fallen.filter(f=>s.time-f.at<WOOD_DEFEAT.duration);
 for(const k of ['cooldown','skill','dash','strike'] as const)s.hero[k]=Math.max(0,s.hero[k]-dt);
 if(s.mode!=='defense'){
  const wasMoving=s.hero.moving;
  const old={x:s.hero.x,z:s.hero.z};let next:Point;
  if(s.hero.attack)next=old;
  else if(s.mode==='solo'&&(axis.x||axis.z)){const n=Math.hypot(axis.x,axis.z);next={x:old.x+axis.x/n*7*dt,z:old.z+axis.z/n*7*dt};if(!walkable(next))next=old;s.hero.target={...next};}
  else next=travel(old,s.hero.target,6*dt);
  s.hero.moving=distance(old,next)>.001;if(s.hero.moving){s.hero.heading=Math.atan2(next.x-old.x,next.z-old.z);if(!wasMoving)s.hero.walkStartDistance=s.hero.walkDistance;}s.hero.x=next.x;s.hero.z=next.z;s.hero.walkDistance+=distance(old,next);
  // Presentation state uses simulation time; stopping never delays movement or combat.
  if(s.hero.moving||s.hero.attack)s.hero.settle=undefined;
  else if(wasMoving)s.hero.settle={time:0,walkTime:(s.hero.walkDistance/HERO_ATTACK.stride*.8)%.8,walkWeight:walkContactWeight(s.hero.walkDistance,s.hero.walkStartDistance)};
  else if(s.hero.settle){s.hero.settle.time+=dt;if(s.hero.settle.time>=.24)s.hero.settle=undefined;}
  if(s.mode==='command'){strike(s);if(distance(s.hero,BEACON)<BEACON_CAPTURE.radius&&s.beacon<1){s.beacon=Math.min(1,s.beacon+dt/BEACON_CAPTURE.seconds);if(s.beacon===1){s.gold+=BEACON_CAPTURE.reward;s.message=`동쪽 봉화 확보 · 금화 +${BEACON_CAPTURE.reward}`;}}}
 }
 // The authored hammer commits its facing and feet until recovery; dash can cancel it.
 if(s.hero.attack){const a=s.hero.attack;a.time+=dt;s.hero.heading=a.heading;s.hero.strike=Math.max(0,HERO_ATTACK.duration-a.time);
  if(!a.hit&&a.time+1e-9>=HERO_ATTACK.contact){a.hit=true;const point=hammerPoint(s.hero.x,s.hero.z,a.heading);
   if(a.kind==='basic'){const e=s.enemies.find(e=>e.id===a.targetId&&e.hp>0);if(e&&inHammerReach(s.hero.x,s.hero.z,a.heading,e)){damage(s,e,a.damage,s.hero);effect(s,point,point,'hammer');}}
   else{for(const e of s.enemies)if(distance(e,s.hero)<HERO_ATTACK.skillRadius)damage(s,e,a.damage,s.hero);effect(s,s.hero,s.hero,'shockwave');}
  }
  if(a.time+1e-9>=HERO_ATTACK.duration)s.hero.attack=undefined;
 }
 for(const [i,unit] of s.squad.entries()){
  const target={x:s.hero.x+(i-1)*2,z:s.hero.z+2.5},p=travel(unit,target,6.5*dt),dx=p.x-unit.x,dz=p.z-unit.z,dist=Math.hypot(dx,dz),wasMoving=unit.moving??false;
  unit.moving=dist>.001;if(unit.moving){unit.heading=Math.atan2(dx,dz);unit.walkDistance=(unit.walkDistance??0)+dist;unit.restTime=0;}
  else if(wasMoving)unit.restTime=0;else if(unit.restTime!==undefined)unit.restTime+=dt;
  unit.x=p.x;unit.z=p.z;unit.cooldown-=dt;const enemy=s.enemies.find(e=>e.hp>0&&distance(e,unit)<7);
  if(enemy&&unit.cooldown<=0){unit.shotAt=s.time;unit.shotHeading=Math.atan2(enemy.x-unit.x,enemy.z-unit.z);damage(s,enemy,8+s.level,unit);unit.cooldown=.9;effect(s,unit,enemy,'shot');}
 }
 if(s.mode!=='solo'){
  s.spawnIn-=dt;if(s.remaining>0&&s.spawnIn<=0){const east=s.mode==='command'&&s.wave>1&&s.remaining%2===0;s.enemies.push({...(east?{x:24,z:-25}:PATH[0]),id:s.serial++,hp:50+s.wave*12,maxHp:50+s.wave*12,cooldown:0,path:east?2:1});s.remaining--;s.spawnIn=1.5;}
  if(s.remaining===0&&s.enemies.length===0){if(s.wave<3){s.wave++;s.remaining=6+s.wave*2;s.spawnIn=4;s.gold+=50;s.message=`웨이브 ${s.wave} · 정비 보급 +50`;}else if(s.mode==='defense'||s.beacon===1){s.phase='won';s.message='성문 방어 완료';}}
 }
 // Bolts own their launch position, damage and target identity; upgrades cannot rewrite a shot.
 for(const bolt of s.bolts){
  bolt.life-=dt;const enemy=s.enemies.find(e=>e.id===bolt.targetId&&e.hp>0);
  if(!enemy){bolt.life=0;continue;}
  const to={x:enemy.x,y:heightAt(enemy.x,enemy.z)+1.1,z:enemy.z};const d=Math.hypot(to.x-bolt.position.x,to.y-bolt.position.y,to.z-bolt.position.z);
  bolt.previous={...bolt.position};
  if(d<=BALLISTA.boltSpeed*dt){bolt.position=to;damage(s,enemy,bolt.damage,bolt.previous);effect(s,bolt.previous,enemy,'impact');bolt.life=0;}
  else{const k=BALLISTA.boltSpeed*dt/d;bolt.position={x:bolt.position.x+(to.x-bolt.position.x)*k,y:bolt.position.y+(to.y-bolt.position.y)*k,z:bolt.position.z+(to.z-bolt.position.z)*k};}
 }
 s.bolts=s.bolts.filter(b=>b.life>0);
 for(const tower of s.towers){
  tower.cooldown=Math.max(0,tower.cooldown-dt);const p=PADS[tower.pad];
  if(tower.actionTime!==null){
   tower.actionTime+=dt;
   if(!tower.released&&tower.actionTime+1e-9>=BALLISTA.release){
    tower.released=true;const target=s.enemies.find(e=>e.id===tower.targetId&&e.hp>0);
    if(target&&distance(target,p)<12){const muzzle=ballistaMuzzle(p.x,p.z,heightAt(p.x,p.z),tower.heading);s.bolts.push({id:s.serial++,pad:tower.pad,targetId:target.id,position:muzzle,previous:{...muzzle},damage:23*tower.level,life:BALLISTA.boltLifetime});tower.cooldown=BALLISTA.interval-BALLISTA.release;}
   }
   if(tower.actionTime>=BALLISTA.duration){tower.actionTime=null;tower.targetId=null;}
   continue;
  }
  const target=s.enemies.find(e=>e.hp>0&&distance(e,p)<11);
  if(target){const angle=Math.atan2(target.x-p.x,target.z-p.z);tower.heading=turnToward(tower.heading,angle,BALLISTA.turnRate*dt);
   if(tower.cooldown<=0&&Math.abs(angleDelta(tower.heading,angle))<.08){tower.actionTime=0;tower.targetId=target.id;tower.released=false;}
  }
 }
 for(const e of s.enemies){
  if(e.hp<=0)continue;const oldX=e.x,oldZ=e.z;e.cooldown=Math.max(0,e.cooldown-dt);
  const begin=(target:'hero'|'core')=>{const p=target==='hero'?s.hero:CORE;const d=distance(e,p);const heading=d>.001?Math.atan2(p.x-e.x,p.z-e.z):(e.heading??0);e.heading=heading;e.attack={time:0,target,heading,hit:false,entryDistance:e.walkDistance??0};e.cooldown=WOOD_ATTACK.interval;};
  if(e.attack){
   e.attack.time+=dt;e.heading=e.attack.heading;
   if(!e.attack.hit&&e.attack.time+1e-9>=WOOD_ATTACK.contact){
    e.attack.hit=true;const target=e.attack.target==='hero'?s.hero:CORE;
    if(inWoodStrike(e.x,e.z,e.attack.heading,target)){
     if(e.attack.target==='hero')s.hero.hp=Math.max(0,s.hero.hp-8);else{const before=s.coreHp;s.coreHp=Math.max(0,s.coreHp-10);if(s.coreHp<before)s.coreHitAt=s.time;}
     effect(s,e,target,'club');
    }
   }
   if(e.attack.time+1e-9>=WOOD_ATTACK.duration)e.attack=undefined;
  }else{
   const hunting=s.mode==='solo'||s.mode==='command'&&distance(e,s.hero)<9;
   if(hunting){const d=distance(e,s.hero);if(d<WOOD_ATTACK.reach){if(e.cooldown<=1e-9)begin('hero');}else if(d<18){const p=travel(e,s.hero,2.7*dt);e.x=p.x;e.z=p.z;}}
   else if(e.path===3&&distance(e,CORE)<WOOD_ATTACK.reach){if(e.cooldown<=1e-9)begin('core');}
   else{const target=PATH[e.path]??CORE;const d=distance(e,target),amount=e.path===3?Math.min(2.6*dt,Math.max(0,d-(WOOD_ATTACK.reach-.05))):2.6*dt;const p=travel(e,target,amount);e.x=p.x;e.z=p.z;if(e.path<3&&distance(e,target)<.2)e.path++;}
  }
  const moved=Math.hypot(e.x-oldX,e.z-oldZ);e.moving=moved>1e-7;e.walkDistance=(e.walkDistance??0)+moved;e.restTime=e.moving?0:(e.restTime??0)+dt;if(e.moving)e.heading=Math.atan2(e.x-oldX,e.z-oldZ);
 }
 s.enemies=s.enemies.filter(e=>e.hp>0);
 if(s.coreHp<=0||s.mode!=='defense'&&s.hero.hp<=0){s.phase='lost';s.message=s.hero.hp<=0?'영웅이 쓰러졌습니다':'성문이 무너졌습니다';}
 return s;
}
