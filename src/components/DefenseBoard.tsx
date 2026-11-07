import { gateImpact } from '../games/defense/gateImpact';
import { gatePlacement } from '../games/defense/gateAssets';
import { knockbackPresentation } from '../games/defense/action';
import { DefenseTerrain, BridgeFrontRail, useTerrainAsset } from './DefenseTerrain';
import { WALK_STRIDE, enemyStride, enemyWalkFrame } from '../games/defense/locomotion';
import type { Locomotion } from '../games/defense/locomotion';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { ENEMIES, HEROES, TOWERS, getStage, getRegion, getSlots } from '../games/defense/data';
import { actionSpriteAsset, hammerSequenceSpriteAsset, hammerContactTrail, petBiteContact, petBiteSequenceSpriteAsset, mageCastSocket, taoSealSocket, druidCastSocket, directionalActionSpriteAsset, directionalLocomotionSpriteAsset, walkingSpriteAsset, idleSpriteAsset, monsterSpriteAsset, monsterWalkingSpriteAsset, spriteAsset, towerSpriteAsset, fireTowerActionSpriteAsset, ballistaActionSpriteAsset, waterCannonActionSpriteAsset } from '../games/defense/art';
import type { SpriteAsset, ActionPose } from '../games/defense/art';
import type { DefenseThemeId } from '../games/defense/themes';
import { DefenseThemeScenery, ModeledGate, useGateAsset, useGateImpactAsset } from './DefenseThemeScenery';
import { towerRange, positionOnPath } from '../games/defense/engine';
import type { CombatAttack, DefenseState, Effect, Element, Enemy, HeroId, Point, Tower } from '../games/defense/types';
import { AttackTrails, DashTrail, DefenseFxDefs, EffectLayer, FX_COLORS, hitCore, ProjectileLayer } from './DefenseEffects';
import { BoardTapTracker, clientToBoard, resolveBoardTap } from './defenseInput';
import type { ScreenMatrix } from './defenseInput';
import { hpBarScale, unitScale } from './defenseFrame';
import '../defense-board.css';

const clamp = (v:number) => Math.max(0,Math.min(1,v));
const distance = (a:Point,b:Point) => Math.hypot(a.x-b.x,a.y-b.y);
const terrainLabel={plain:'평지',high:'고지대 · 사거리 증가',water:'물길 인접 · 전기 연계에 유리',ice:'빙판 인접 · 적 이동 가속 구간'};
export function DefenseSprite({ index, className = '', style, art:override }: {index:number;className?:string;style?:CSSProperties;art?:SpriteAsset|null}) {
 const art=override??spriteAsset(index);
 const [x,y,width,height]=art.viewBox.split(' ').map(Number);
 return <svg aria-hidden="true" className={`def-sprite ${className}`} style={style} viewBox={art.viewBox}><svg x={x} y={y} width={width} height={height} viewBox={art.viewBox} overflow="hidden"><image href={art.src} width={art.width} height={art.height}/></svg></svg>;
}
function useReducedMotion(){
 const [reduced,setReduced]=useState(()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 return reduced;
}
const SpriteFrame=memo(function SpriteFrame({src,viewBox,sourceWidth,sourceHeight,width,height,bottom}:{src:string;viewBox:string;sourceWidth:number;sourceHeight:number;width:number;height:number;bottom:number}){
 return <svg x={-width/2} y={bottom-height} width={width} height={height} viewBox={viewBox} preserveAspectRatio="xMidYMax meet" overflow="hidden"><image href={src} width={sourceWidth} height={sourceHeight}/></svg>;
});
const Sprite=memo(function Sprite({index,x=0,y=0,size=70,flip=false,art:override,pose='',shadow=true,shadowScale=1}:{index:number;x?:number;y?:number;size?:number;flip?:boolean;art?:SpriteAsset|null;pose?:string;shadow?:boolean;shadowScale?:number}){
 const art=override??spriteAsset(index);
 const artSize=size*(art.displayScale??1);
 const [,frameY,frameWidth,frameHeight]=art.viewBox.split(' ').map(Number);
 // Crop the frame itself: a square viewport leaves atlas rows visible in letterbox space.
 const width=artSize*Math.min(1,frameWidth/frameHeight),height=artSize*Math.min(1,frameHeight/frameWidth);
 // Baked action frames share a projected ground point, including overhead poses.
 const bottom=art.groundY===undefined?size*.1:height*(1-(art.groundY-frameY)/frameHeight);
 return <g transform={`translate(${x},${y})`}>
  {shadow?<g className="def-contact-shadow"><ellipse cx={-size*.07} cy={size*.025} rx={size*.38*shadowScale} ry={size*.12*shadowScale} fill="url(#def-ground-shadow)"/><ellipse cy="0" rx={size*.2*shadowScale} ry={size*.045*shadowScale} fill="#142b28" opacity=".23"/></g>:null}
  <g transform={`${pose} scale(${flip?-1:1},1)`} className="def-sprite-body"><SpriteFrame src={art.src} sourceWidth={art.width} sourceHeight={art.height} viewBox={art.viewBox} width={width} height={height} bottom={bottom}/></g>
 </g>;
});
function attackPhase(a:CombatAttack):ActionPose {return a.elapsed<a.hitAt?'windup':a.elapsed<a.hitAt+.12?'strike':'recover';}
function Actor({unit=1,actor,position,facing,motion,velocity,dashTime=0,attack,skill,time,reduced,promoted=false,leader=false}:{unit?:number;actor:HeroId|'wolf';position:Point;facing:-1|1;motion:Locomotion;velocity?:Point;dashTime?:number;attack?:CombatAttack;skill?:Effect;time:number;reduced:boolean;promoted?:boolean;leader?:boolean}){
 const wolf=actor==='wolf',index=wolf?18:HEROES[actor].sprite,size=(wolf?73:promoted?94:84)*unit;
 const dashing=dashTime>0,moving=motion.speed>.5,speed=dashing&&velocity?Math.hypot(velocity.x,velocity.y):motion.speed,pace=clamp(speed/230);
 const skillAge=skill?.age??Infinity,casting=skillAge<.5;
 const phase=casting?(skillAge<.18?'strike':'recover'):dashing?null:attack?attackPhase(attack):null;
 const orientedRest=!phase&&(!dashing||actor==='mage'||actor==='elf'||actor==='tao'||actor==='druid'||actor==='barbarian')?directionalLocomotionSpriteAsset(actor,motion.heading??{x:facing,y:0},moving&&!dashing&&!reduced?motion.distance:null,size,motion.gaitCycles):null;
 const walking=!phase&&!dashing&&moving&&!reduced?orientedRest??walkingSpriteAsset(actor,motion.distance):null;
 const hammer=attack&&phase&&!casting&&!dashing?hammerSequenceSpriteAsset(actor,attack,reduced):null;
 const skillDirection=(actor==='mage'||actor==='elf'||actor==='tao'||actor==='druid'||actor==='barbarian')&&casting&&phase?directionalActionSpriteAsset(actor,phase,position,{x:position.x+(motion.heading?.x??facing),y:position.y+(motion.heading?.y??0)},reduced):null;
 const directional=(wolf&&attack&&!casting&&!dashing?petBiteSequenceSpriteAsset(attack,position,reduced):null)??hammer??skillDirection??(attack&&phase&&!casting&&!dashing?directionalActionSpriteAsset(actor,phase,actor==='mage'||actor==='elf'||actor==='tao'||actor==='druid'||actor==='barbarian'||wolf?position:attack.from,attack.to,reduced):null);
 const castSocket=(actor==='mage'||actor==='tao'||actor==='druid')&&attack&&directional?(actor==='mage'?mageCastSocket:actor==='tao'?taoSealSocket:druidCastSocket)(position,attack.to,size,reduced&&phase!=='strike'?'idle':phase??'idle'):null;
 const bite=wolf&&attack&&directional?petBiteContact(attack,size,position,reduced):null;
 const hammerTrail=hammer&&!reduced&&attack?hammerContactTrail(attack,size):null;
 const art=directional??(phase?actionSpriteAsset(actor,phase):walking??orientedRest??idleSpriteAsset(actor));
 const aim=!dashing&&attack&&Math.abs(attack.to.x-attack.from.x)>.5?(attack.to.x>attack.from.x?1:-1):facing;
 let bob=0,lean=0,offset=0,sx=1,sy=1;
 if(!reduced){
  if(dashing){lean=(velocity?.x??aim*speed)/Math.max(1,speed)*14;bob=-2;sx=1.045;sy=.955;}
  else if(casting&&!((actor==='mage'||actor==='elf'||actor==='tao'||actor==='druid'||actor==='barbarian')&&directional)){
   const power=1-clamp(skillAge/.5),melee=actor==='barbarian'||actor==='dwarf';
   offset=aim*power*(melee?14:5);lean=aim*power*(melee?12:-5);bob=-Math.sin(clamp(skillAge/.5)*Math.PI)*(melee?3:5);sx=1+power*.04;sy=1-power*.04;
  }else if(attack&&!directional){
   if(phase==='windup'){const p=clamp(attack.elapsed/Math.max(.05,attack.hitAt));offset=-4*p*aim;lean=-7*p*aim;sx=1-.035*p;sy=1+.025*p;}
   else if(phase==='strike'){const p=clamp((attack.elapsed-attack.hitAt)/.12);offset=(attack.kind==='melee'||attack.kind==='slam'?10:4)*(1-p*.45)*aim;lean=9*(1-p*.4)*aim;bob=-Math.sin(p*Math.PI)*3;sx=1.04;sy=.97;}
   else{const p=clamp((attack.elapsed-attack.hitAt-.12)/Math.max(.05,attack.duration-attack.hitAt-.12));offset=4*(1-p)*aim;lean=4*(1-p)*aim;}
  }else if(moving&&!walking&&!directional){const stride=Math.sin(motion.distance/WALK_STRIDE*Math.PI*2);bob=-Math.abs(stride)*(wolf?3.8:3)*pace;lean=(velocity?velocity.x/230:facing*.6)*6+stride*1.5*pace;sx=1+Math.abs(stride)*.025*pace;sy=1-Math.abs(stride)*.018*pace;}
  else if(!walking&&!directional&&!orientedRest)sy=1+Math.sin(time*2.3+index)*.008;
 }
 return <g className={`def-motion-actor ${wolf?'def-pet':leader?'def-hero':'def-merc'} ${casting?'def-skill-cast':''} ${dashing?'def-dashing':''}`} transform={`translate(${position.x},${position.y})`} data-actor={actor} data-walk-distance={motion.distance.toFixed(2)} data-gait-cycles={motion.gaitCycles} data-walk-frame={walking?.viewBox} data-motion-asset={art?.src} data-heading={motion.heading?`${motion.heading.x.toFixed(3)},${motion.heading.y.toFixed(3)}`:undefined} data-kar-frame={actor==='barbarian'&&art?.src.includes('/kar-')?Number(art.viewBox.split(' ')[0])/256:undefined} data-pet-frame={wolf&&art?.src.includes('/moonlight-')?Number(art.viewBox.split(' ')[0])/256:undefined} data-druid-frame={actor==='druid'&&art?.src.includes('/luna-')?Number(art.viewBox.split(' ')[0])/256:undefined} data-tao-frame={actor==='tao'&&art?.src.includes('/cheongun-')?Number(art.viewBox.split(' ')[0])/256:undefined} data-elf-frame={actor==='elf'&&art?.src.includes('/riel-')?Number(art.viewBox.split(' ')[0])/256:undefined} data-mage-frame={actor==='mage'&&art?.src.includes('/ian-')?Number(art.viewBox.split(' ')[0])/256:undefined} data-hammer-frame={hammer?Number(hammer.viewBox.split(' ')[0])/256:undefined} data-attack-phase={phase??(dashing?'dash':moving?'walk':'idle')} data-skill-phase={casting?phase:undefined} data-facing={aim} data-dashing={leader?dashing:undefined} data-velocity={leader?`${Math.round(velocity?.x??0)},${Math.round(velocity?.y??0)}`:undefined}>
  {leader?<ellipse cy="1" rx="30" ry="12" fill="#d3f8a129" stroke="#e3f6a5" strokeWidth="1.8" opacity=".85"/>:wolf?<ellipse cy="1" rx="23" ry="8" fill="#c9f3ff25" stroke="#cfeddd" strokeWidth="1"/>:null}
  {moving&&!dashing&&!reduced?<g opacity={.2*pace}><ellipse cx={-facing*17} cy="3" rx="10" ry="3" fill="#f2dec4"/><ellipse cx={-facing*28} cy="5" rx="5" ry="2" fill="#f2dec4"/></g>:null}
  {casting?<ellipse cy="-4" rx={32+(reduced?0:skillAge*26)} ry="12" fill="none" stroke={actor==='druid'?'#c4ef96':actor==='mage'?'#ffc585':'#d5f5ff'} strokeWidth="2" opacity={1-skillAge*1.7}/>:null}
  <Sprite index={index} size={size} flip={!directional&&!art?.oriented&&((aim<0)!==(art?.nativeFacing===-1))} art={art} pose={`translate(${offset},${bob}) rotate(${lean}) scale(${sx},${sy})`} shadowScale={1+bob*.02}/>
  {bite&&attack?<g data-pet-bite="contact" transform={`translate(${bite.x},${bite.y}) rotate(${Math.atan2(attack.to.y-position.y,attack.to.x-position.x)*180/Math.PI})`} opacity={1-(attack.elapsed-attack.hitAt)/.12}><path d="M2-4 6-7M4 0H9M2 4 6 7" fill="none" stroke="#eef6cc" strokeWidth={1.6*unit} strokeLinecap="round"/></g>:null}
  {hammerTrail&&attack?<path data-hammer-trail="modeled" d={hammerTrail.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ')} fill="none" stroke={actor==='barbarian'?'#ffe2a0':'#d6edf7'} strokeWidth={(actor==='barbarian'?3.5:2.5)*unit} strokeLinecap="round" strokeLinejoin="round" opacity={.55*(1-clamp((attack.elapsed-attack.hitAt)/((attack.duration-attack.hitAt)*(actor==='barbarian'?.25:.22))))}/>:null}
  {castSocket&&attack&&phase==='windup'?<circle data-cast-socket={actor} cx={castSocket.x} cy={castSocket.y} r={5+4*clamp(attack.elapsed/attack.hitAt)} fill={`url(#${actor==='tao'?'def-spark-core':actor==='druid'?'def-green-core':'def-fire-core'})`} opacity=".55"/>:null}
  {attack&&phase==='windup'&&attack.kind==='spell'&&!castSocket?<g transform="translate(0,-43)" opacity={.35+.35*clamp(attack.elapsed/Math.max(.05,attack.hitAt))}><circle cx={aim*24} cy="-5" r={7+clamp(attack.elapsed/Math.max(.05,attack.hitAt))*9} fill={`url(#${attack.element==='fire'?'def-fire-core':attack.actor==='druid'?'def-green-core':attack.element==='water'||attack.element==='lightning'?hitCore(attack.element):'def-blue-core'})`}/></g>:null}
  {promoted?<text y={-size*.92} fill="#ffe3a2" fontSize="18" textAnchor="middle" className="def-world-label">✦</text>:null}
  {wolf?<text y="20" textAnchor="middle" className="def-pet-label">달빛 늑대</text>:null}
 </g>;
}
function EnemyUnit({unit=1,hpScale=1,enemy:e,state:s,reduced,onActivate,onKey}:{unit?:number;hpScale?:number;enemy:Enemy;state:DefenseState;reduced:boolean;onActivate:()=>void;onKey:(e:KeyboardEvent<SVGGElement>)=>void}){
 const size=(e.kind==='frostboss'?135:e.kind==='boss'?115:e.kind==='sprout'?54:e.kind==='frostwolf'?73:68)*unit;
 const boss=e.kind==='boss'||e.kind==='frostboss';
 const facing=e.facing??(positionOnPath(e.path,e.progress+4,s.stage).x>=e.x?1:-1);
 const charging=e.kind==='frostboss'&&s.bossCharge>0,enraged=e.kind==='boss'&&e.hp<e.maxHp*.5;
 const hit=clamp((e.recoil??e.hit)/.2),knock=(e.knockVelocity??0)>7;
 const reaction=knockbackPresentation(e.knockVelocity??0);
 const travel=e.walkDistance??e.progress,phaseDistance=travel+e.id*7,moving=(e.walkSpeed??e.speed)>.1;
 const gait=enemyWalkFrame(e.kind,phaseDistance);
 const motionPose=charging?'charge':e.hit>.02||knock?'hit':enraged?'charge':boss?'idle':reduced||gait<4?'walk-a':'walk-b';
 const walking=!reduced&&!charging&&!knock&&e.hit<=.02?monsterWalkingSpriteAsset(e.kind,phaseDistance):null;
 const art=walking??monsterSpriteAsset(e.kind,motionPose);
 const stride=Math.sin(phaseDistance/enemyStride(e.kind)*Math.PI*2);
 // Authored gait already contains weight transfer; don't bounce the entire model again.
 const bob=reduced||charging||knock||walking||!moving?0:-Math.abs(stride)*(boss?1.5:e.kind==='sprout'?3.1:2.3);
 const lean=reduced?0:knock?-12*facing*clamp((e.knockVelocity??0)/110):walking||!moving?0:stride*1.8+facing*1.3;
 const shake=reduced?0:Math.sin((1-hit)*Math.PI*3)*hit*3;
 const hpArt=boss?monsterSpriteAsset(e.kind,'charge')??art:art;
 const [,,hpWidth,hpHeight]=hpArt?.viewBox.split(' ').map(Number)??[0,0,1,1];
 const modelHeight=hpArt?size*(hpArt.displayScale??1)*Math.min(1,hpHeight/hpWidth):size;
 // Reserve room for a boss's raised arms so the health bar stays fixed through its cast.
 const hpY=-Math.max(size*.91,modelHeight-size*.1)-8;
 const hpW=(boss?68:44)*hpScale,hpH=(boss?7:5.5)*hpScale;
 return <g className={`def-monster ${e.hit>0?'def-hit':''} ${knock?'def-knocked':''} ${boss?'def-boss-model':''}`} transform={`translate(${e.x},${e.y})`} data-enemy={e.kind} data-monster-pose={walking?`walk-${gait}`:motionPose} data-walk-distance={travel.toFixed(2)} data-facing={facing} data-boss-state={charging?'casting':enraged?'enraged':undefined} data-progress={e.progress.toFixed(2)} data-knockback={(e.knockVelocity??0).toFixed(1)} role="button" tabIndex={0} aria-label={`${ENEMIES[e.kind].name} 위치로 이동, 체력 ${Math.ceil(e.hp)}, ${ENEMIES[e.kind].elementHint}`} onKeyDown={onKey} onClick={ev=>{ev.stopPropagation();onActivate();}}>
  <title>{ENEMIES[e.kind].name} · {ENEMIES[e.kind].elementHint}</title>
  {charging?<g opacity=".75"><ellipse rx={35+(2.5-s.bossCharge)*10} ry={12+(2.5-s.bossCharge)*4} fill="#91d9ff16" stroke="#bcf2ff" strokeWidth="2"/><g transform={`scale(1,.38) rotate(${reduced?0:s.time*34})`}><path d="M-48 0 24-42 24 42ZM48 0-24-42-24 42Z" fill="none" stroke="#daf6ff" strokeWidth="1.2" opacity=".6"/></g><circle cy="-52" r={22+(2.5-s.bossCharge)*9} fill="url(#def-blue-core)" opacity=".38"/></g>:null}
  {e.slow>0?<ellipse cy="2" rx={size*.36} ry="8" fill="#91d6ff36" stroke="#d3f6ff66" strokeWidth="1"/>:null}
  {!reduced&&reaction.streak?<path d={`M${-facing*21} 3h${-facing*20*reaction.strength}m${facing*5} 4h${-facing*12*reaction.strength}`} stroke="#eadbc6" strokeWidth="3" strokeLinecap="round" opacity={.65*reaction.strength}/>:null}
  {!reduced&&reaction.bracing?<g opacity={Math.min(1,hit+.15)} data-impact-reaction="brace"><ellipse cy="3" rx={size*.3} ry="5" fill="#bbaa8b" opacity=".4"/><path d={`M${-size*.3} 2l-5-4M${size*.3} 2l5-4`} stroke="#d9c7a2" strokeWidth="2" strokeLinecap="round"/></g>:null}
  <Sprite index={ENEMIES[e.kind].sprite} size={size} flip={facing<0} art={art} pose={`translate(${shake},${bob}) rotate(${lean}) scale(${reduced?1:1+hit*.07},${reduced?1:1-hit*.06-(reaction.bracing?.04:0)})`} shadowScale={1+bob*.025}/>
  {e.burn>0?<g opacity=".75"><circle cy="-24" r={reduced?14:18+Math.sin(s.time*11+e.id)*2} fill="url(#def-fire-core)"/>{!reduced?<path d="M-10-22q-7-11-3-18q1 10 8 13M6-27q-1-12 5-16q-4 12 0 17" fill="none" stroke="#ffc05d" strokeWidth="2" strokeLinecap="round"/>:null}</g>:null}
  {e.wet>0?<path d="M22-46q-10 13 0 13q10 0 0-13" fill="#84e4ff" stroke="#d8fbff" strokeWidth=".9"/>:null}
  <rect x={-hpW/2} y={hpY} width={hpW} height={hpH} rx={hpH/2} fill="#102418" stroke="#0a1610cc" strokeWidth={1.2*hpScale}/><rect x={-hpW/2} y={hpY} width={hpW*clamp(e.hp/e.maxHp)} height={hpH} rx={hpH/2} fill={e.kind==='frostboss'?'#91d8f5':e.kind==='boss'?'#d176ed':'#e7ab69'}/>
 </g>;
}
function TowerUnit({tower:t,position:p,state:s,reduced}:{tower:Tower;position:Point;state:DefenseState;reduced:boolean}){
 const attack=s.attacks.find(a=>a.source==='tower'&&a.sourceSlot===t.slot),aim=t.aim??attack?.to??{x:p.x+1,y:p.y};
 const length=Math.max(1,distance(p,aim)),dx=(aim.x-p.x)/length,dy=(aim.y-p.y)/length,angle=Math.atan2(dy,dx)*180/Math.PI;
 const recoil=clamp((t.recoil??0)/.24),phase=attack?attackPhase(attack):null,windup=phase==='windup'&&attack?clamp(attack.elapsed/attack.hitAt):0;
 const element:Element=t.branch==='fire'?'fire':t.branch==='lightning'?'lightning':t.branch==='water'?'water':t.kind==='cannon'?'impact':t.kind==='magic'?'fire':'physical';
 const color=FX_COLORS[element],core=element==='water'||element==='lightning'||t.branch==='fire'?hitCore(element):'def-blue-core';
 const placement=s.effects.filter(e=>e.sourceSlot===t.slot&&(e.kind==='build'||e.kind==='upgrade')).at(-1);
 const progress=placement?clamp((placement.age??0)/(placement.maxLife??.8)):1,ease=1-Math.pow(1-progress,3),building=placement?.kind==='build';
 const lift=reduced?0:building?(1-ease)*12:0,scale=reduced?1:building?.86+.14*ease:1;
 const rock=reduced?0:dx*(windup*1.7-recoil*(t.kind==='cannon'?3.5:1.8));
 const fireAction=fireTowerActionSpriteAsset(t.kind,t.branch,t.level,windup,t.recoil??0,reduced);
 const articulated=fireAction??ballistaActionSpriteAsset(t.kind,t.branch,t.level,p,aim,t.recoil??0,reduced)??waterCannonActionSpriteAsset(t.kind,t.branch,t.level,p,aim,t.recoil??0,reduced);
 const shot=recoil>.02,flash=recoil>.48,muzzle=articulated?.muzzle??{x:dx*23,y:-55+dy*13};
 const art=articulated?.asset??towerSpriteAsset(t.kind,t.branch,t.level);
 return <g className={`def-tower def-tower-${t.kind} ${s.freeze>0?'def-tower-frozen':''}`} transform={`translate(${p.x},${p.y+12})`} data-action-frame={articulated?.pose} data-aim-octant={articulated?.direction} data-tower={t.kind} data-branch={t.branch??'base'} data-level={t.level} data-recoil={recoil.toFixed(2)} data-tower-phase={phase??'idle'}>
  <ellipse cy="4" rx="38" ry="12" fill="url(#def-ground-shadow)"/>
  <path d="M-30 1Q0-13 30 1V6Q0 19-30 6Z" fill="#42584c" stroke="#253d36" strokeWidth="1" opacity=".9"/><ellipse cy="1" rx="30" ry="9" fill="#7b8c70" stroke="#bac6a1" strokeWidth="1"/>
  {t.level===3?<g className="def-tower-mastery"><ellipse cy="3" rx="33" ry="11" fill="none" stroke="#e5cc86" strokeWidth="1.6"/>{[-1,0,1].map(i=><path key={i} d="m0-3 3 3-3 3-3-3Z" transform={`translate(${i*19},${10-Math.abs(i)*2})`} fill={color} stroke="#765b36" strokeWidth=".7"/>)}</g>:null}
  {t.kind==='magic'?<ellipse cy="-1" rx="28" ry="10" fill={t.branch==='fire'?'#f5ac4720':'#7fcfea20'} stroke={color} strokeOpacity=".25" strokeWidth="1"/>:null}
  <Sprite index={TOWERS[t.kind].sprite} size={92+t.level*4} art={art} flip={!articulated&&((dx<0)!==(art?.nativeFacing===-1))} pose={articulated?`translate(0,${-lift}) scale(${scale},${scale})`:`translate(${reduced?0:-dx*recoil*(t.kind==='cannon'?6:3)},${-lift+(reduced?0:recoil*1.8)}) rotate(${rock}) scale(${scale},${scale*(reduced?1:1-recoil*.025)})`} shadow={false}/>
  {t.kind==='magic'?<g className="def-magic-core" transform={`translate(${fireAction?.muzzle.x??0},${(fireAction?.muzzle.y??-67)-lift})`}>
   <circle r={12+windup*12} fill={`url(#${core})`} opacity={.18+windup*.48+(flash?.3:0)}/>
   <g transform={`scale(1,.45) rotate(${reduced?0:s.time*(t.branch==='lightning'?42:23)+t.slot*31})`} opacity={.38+windup*.35}><path d="M-16 0A16 16 0 0 1 9-13M16 0A16 16 0 0 1-9 13" fill="none" stroke={t.branch==='fire'?'#ffcf88':t.branch==='lightning'?'#ffe872':'#b8efff'} strokeWidth="2"/><circle cx="16" r="2.2" fill={color}/><circle cx="-16" r="2.2" fill={color}/></g>
   {windup>0&&t.branch==='lightning'?<path d={`M-13 6-6 ${-5-windup*8} 0 2 8 ${-10-windup*5} 14 4`} fill="none" stroke="#fff6b0" strokeWidth="1.5" opacity={windup}/>:null}
  </g>:null}
  {windup>0&&t.kind==='crossbow'&&!articulated?<g transform={`translate(${muzzle.x-dx*windup*5},${muzzle.y-dy*windup*5}) rotate(${angle})`} opacity={.45+windup*.5}><path d="M-12 0H10m-9-5 5 5-5 5" fill="none" stroke="#f0dab0" strokeWidth="1.5"/><path d={`M-4-13 ${-5-windup*5} 0-4 13`} fill="none" stroke="#c2b793" strokeWidth="1"/></g>:null}
  {windup>0&&t.kind==='cannon'?<circle cx={muzzle.x} cy={muzzle.y} r={5+windup*4} fill={`url(#${t.branch==='water'?'def-water-core':'def-fire-core'})`} opacity={windup*.6}/>:null}
  {flash?<g transform={`translate(${muzzle.x},${muzzle.y}) rotate(${angle})`} opacity={recoil}>
   <circle r={reduced?8:t.kind==='cannon'?23:15} fill={`url(#${element==='fire'||element==='impact'?'def-fire-core':element==='water'||element==='lightning'?hitCore(element):'def-blue-core'})`}/>
   {!reduced?<path d={t.kind==='crossbow'?'M-2-3 20 0-22 3Z':'m0-4 22-5-9 9 9 9-22-5-7-4Z'} fill={element==='water'?'#d9fcff':'#fff3c3'} opacity=".85"/>:null}
  </g>:null}
  {shot&&!reduced&&t.kind==='cannon'?<g transform={`translate(${muzzle.x+dx*(1-recoil)*14},${muzzle.y-10*(1-recoil)})`} opacity={recoil*.3}><ellipse rx={7+(1-recoil)*10} ry={5+(1-recoil)*7} fill={t.branch==='water'?'#caedee':'#dfd6bd'}/><ellipse cx={-dx*10} cy="-5" rx={5+(1-recoil)*5} ry="5" fill={t.branch==='water'?'#e5faff':'#f1e9d9'}/></g>:null}
  {placement?.kind==='upgrade'?<ellipse cy="-1" rx={32+(reduced?0:progress*18)} ry={11+(reduced?0:progress*5)} fill="none" stroke={color} strokeWidth="2" opacity={(1-progress)*.85}/>:null}
  <text y="25" textAnchor="middle" className="def-tower-level">Lv.{t.level}</text>
 </g>;
}
export const DefenseBoard=memo(function DefenseBoard({state:s,selectedSlot,onSelect,onMove,aimingDash=false,onSelectCandidates,onCancelAim,themeId='verdant'}:{state:DefenseState;selectedSlot:number|null;onSelect:(id:number)=>void;onMove:(p:Point)=>void;aimingDash?:boolean;onSelectCandidates?:(ids:number[])=>void;onCancelAim?:()=>void;themeId?:DefenseThemeId}){
 const stage=getStage(s.stage),snow=getRegion(s.stage)==='snow',slots=getSlots(s.stage),availableSlots=slots.filter(slot=>slot.unlock<=s.stage);
 const gateAsset=useGateAsset(themeId,snow),gateMotionReady=useGateImpactAsset(gateAsset==='modeled');
 const reduced=useReducedMotion(),terrainAsset=useTerrainAsset(s.stage),[unit,setUnit]=useState(1),[hpScale,setHpScale]=useState(1);
 const mapRef=useRef<SVGSVGElement>(null),boardRef=useRef<HTMLDivElement>(null),tapRef=useRef(new BoardTapTracker());
 const movingAllowed=!s.paused&&['prep','wave','intermission'].includes(s.phase),enemyKinds=[...new Set(s.enemies.map(e=>e.kind))];
 const controls=useRef({allowed:movingAllowed,aimingDash,onMove,onSelect,onSelectCandidates,onCancelAim,slots:availableSlots});
 controls.current={allowed:movingAllowed,aimingDash,onMove,onSelect,onSelectCandidates,onCancelAim,slots:availableSlots};
 const slot=slots.find(p=>p.id===selectedSlot),selectedTower=s.towers.find(t=>t.slot===selectedSlot);
 const readMatrix=useCallback(():ScreenMatrix|null=>{
  const matrix=mapRef.current?.getScreenCTM();
  return matrix?{a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d,e:matrix.e,f:matrix.f}:null;
 },[]);
 const cancelInput=useCallback((force=false)=>{
  const pending=tapRef.current.reset();
  if(force||pending||controls.current.aimingDash)controls.current.onCancelAim?.();
 },[]);
 useEffect(()=>{cancelInput();},[cancelInput,s.stage,s.phase,s.paused]);
 // Measure before first paint so narrow boards never flash one frame of unscaled units.
 useLayoutEffect(()=>{if(mapRef.current){const w=mapRef.current.getBoundingClientRect().width;setUnit(unitScale(w));setHpScale(hpBarScale(w));}},[]);
 useEffect(()=>{
  const cancel=()=>cancelInput(),hide=()=>{if(document.hidden)cancel();};
  window.addEventListener('resize',cancel);window.addEventListener('orientationchange',cancel);window.addEventListener('blur',cancel);
  window.visualViewport?.addEventListener('resize',cancel);document.addEventListener('visibilitychange',hide);
  let size=mapRef.current?.getBoundingClientRect();
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{
   const next=mapRef.current?.getBoundingClientRect();
   if(size&&next&&(Math.abs(size.width-next.width)>.01||Math.abs(size.height-next.height)>.01))cancel();
   size=next;
   if(next){setUnit(unitScale(next.width));setHpScale(hpBarScale(next.width));}
  });
  if(mapRef.current){observer?.observe(mapRef.current);{const w=mapRef.current.getBoundingClientRect().width;setUnit(unitScale(w));setHpScale(hpBarScale(w));}}
  return()=>{observer?.disconnect();window.removeEventListener('resize',cancel);window.removeEventListener('orientationchange',cancel);window.removeEventListener('blur',cancel);window.visualViewport?.removeEventListener('resize',cancel);document.removeEventListener('visibilitychange',hide);tapRef.current.reset();};
 },[cancelInput]);
 const isBattleTarget=(target:EventTarget|null)=>target instanceof Element&&(mapRef.current?.contains(target)||Boolean(target.closest('.def-build-pad')));
 const pointerDown=(event:React.PointerEvent<HTMLDivElement>)=>{
  if(!controls.current.allowed||event.button!==0||!isBattleTarget(event.target))return;
  const point={x:event.clientX,y:event.clientY},matrix=readMatrix();
  if(!matrix||!clientToBoard(point,matrix))return;
  if(tapRef.current.begin(event.pointerId,point,matrix,event.isPrimary)==='cancel'){controls.current.onCancelAim?.();return;}
  try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* A cancelled platform pointer may already be gone. */}
 };
 const pointerMove=(event:React.PointerEvent<HTMLDivElement>)=>{
  if(tapRef.current.move(event.pointerId,{x:event.clientX,y:event.clientY}))controls.current.onCancelAim?.();
 };
 const pointerUp=(event:React.PointerEvent<HTMLDivElement>)=>{
  const matrix=readMatrix(),end=tapRef.current.end(event.pointerId,{x:event.clientX,y:event.clientY},matrix);
  if(end.kind==='cancel'){controls.current.onCancelAim?.();return;}
  if(end.kind!=='tap'||!controls.current.allowed)return;
  const command=resolveBoardTap(end.point,matrix,controls.current.slots,controls.current.aimingDash);
  if(!command)return;
  event.preventDefault();event.stopPropagation();
  if(command.kind==='move')controls.current.onMove(command.point);
  else if(command.kind==='select')controls.current.onSelect(command.id);
  else controls.current.onSelectCandidates?.(command.ids);
 };
 const preventPointerClick=(event:React.MouseEvent<HTMLDivElement>)=>{
  const native=event.nativeEvent,pointerClick=event.detail>0||('pointerType' in native&&Boolean(native.pointerType));
  if(pointerClick&&isBattleTarget(event.target)){event.preventDefault();event.stopPropagation();}
 };
 const activateSlot=(id:number)=>{
  const current=controls.current;if(!current.allowed)return;
  const target=current.slots.find(slot=>slot.id===id);if(!target)return;
  if(current.aimingDash)current.onMove({x:target.x,y:target.y});else current.onSelect(id);
 };
 const activateEnemy=(point:Point)=>{if(controls.current.allowed)controls.current.onMove({x:point.x,y:point.y});};
 const moveWithKeys=(event:KeyboardEvent<SVGSVGElement>)=>{
  if(!controls.current.allowed||event.target!==event.currentTarget)return;
  const direction=({ArrowLeft:[-60,0],ArrowRight:[60,0],ArrowUp:[0,-60],ArrowDown:[0,60]} as Record<string,[number,number]>)[event.key];
  if(!direction)return;event.preventDefault();
  controls.current.onMove({x:Math.max(35,Math.min(850,s.heroTarget.x+direction[0])),y:Math.max(55,Math.min(555,s.heroTarget.y+direction[1]))});
 };
 const handleEnemyKey=(event:KeyboardEvent<SVGGElement>,enemy:Enemy)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();activateEnemy(enemy);}};
 const activeEffects=s.effects;
 const breach=activeEffects.filter(e=>e.kind==='breach').at(-1);
 const dashEffect=activeEffects.filter(e=>e.kind==='dash').at(-1);
 const actorMotion=(actor:'hero'|'mercenary'|'pet')=>s.phase==='won'||s.phase==='lost'?{...s.locomotion[actor],speed:0}:s.locomotion[actor];
 const units:{id:string;y:number;render:ReactNode}[]=[];
 if(gateAsset==='modeled'){
  const village=gateMotionReady?gateImpact(activeEffects,false,reduced):null,outpost=gateMotionReady?gateImpact(activeEffects,true,reduced):null;
  units.push({id:'village-gate',y:gatePlacement().sortY,render:<ModeledGate impactFrame={village?.frame} impactId={village?.id}/>});
  if(stage.expanded)units.push({id:'outpost-gate',y:gatePlacement(true).sortY,render:<ModeledGate outpost fallen={s.outpostHp<=0} impactFrame={outpost?.frame} impactId={outpost?.id}/>});
 }
 if(terrainAsset&&!snow)for(const y of [430,...(stage.expanded?[235]:[])])units.push({id:`bridge-front-${y}`,y:y+25,render:<BridgeFrontRail y={y} asset={terrainAsset}/>});
 for(const t of s.towers){const p=slots.find(slot=>slot.id===t.slot);if(p)units.push({id:`tower-${t.slot}`,y:p.y,render:<TowerUnit tower={t} position={p} state={s} reduced={reduced}/>});}
 for(const e of s.enemies)units.push({id:`enemy-${e.id}`,y:e.y,render:<EnemyUnit unit={unit} hpScale={hpScale} enemy={e} state={s} reduced={reduced} onActivate={()=>activateEnemy(e)} onKey={ev=>handleEnemyKey(ev,e)}/>});
 if(s.mercenary)units.push({id:'merc',y:s.mercenaryPosition.y,render:<Actor unit={unit} actor={s.mercenary} position={s.mercenaryPosition} facing={s.mercenaryFacing} motion={actorMotion('mercenary')} attack={s.attacks.find(a=>a.source==='mercenary')} time={s.time} reduced={reduced}/>});
 if(s.pet)units.push({id:'pet',y:s.pet.position.y,render:<Actor unit={unit} actor="wolf" position={s.pet.position} facing={s.pet.facing} motion={actorMotion('pet')} attack={s.attacks.find(a=>a.source==='pet')} time={s.time} reduced={reduced}/>});
 units.push({id:'hero',y:s.heroPosition.y,render:<Actor unit={unit} actor={s.hero} position={s.heroPosition} facing={s.heroFacing} motion={actorMotion('hero')} velocity={s.heroVelocity} dashTime={s.dashTime} attack={s.attacks.find(a=>a.source==='hero')} time={s.time} reduced={reduced} promoted={Boolean(s.promotion)} skill={s.effects.filter(e=>e.kind==='skill').at(-1)} leader/>});
 const weatherTime=reduced?0:s.time;
 return <div ref={boardRef} onPointerDownCapture={pointerDown} onPointerMoveCapture={pointerMove} onPointerUpCapture={pointerUp} onPointerCancelCapture={()=>cancelInput(true)} onLostPointerCapture={event=>{if(tapRef.current.has(event.pointerId))cancelInput(true);}} onClickCapture={preventPointerClick} className={`def-board ${snow?'def-snow':''} ${stage.climate==='rain'?'def-rain':''} ${stage.climate==='blizzard'?'def-blizzard':''} ${s.paused?'def-paused':''} ${reduced?'def-reduced-motion':''} ${s.freeze>0?'def-frozen':''}`} data-testid="defense-board" data-theme={themeId} data-enemies={s.enemies.length} data-game-time={s.time.toFixed(3)}>
  <svg ref={mapRef} className="def-map" viewBox="0 0 900 600" tabIndex={0} aria-label={`${snow?'서리산맥':'청록의 숲'} 전장. 땅을 누르면 영웅이 이동합니다. 전장에 초점을 두고 방향키로도 이동할 수 있어요. 건설 지점을 선택해 타워를 세우세요.`} onKeyDown={moveWithKeys}>
   <DefenseTerrain stageId={s.stage} asset={terrainAsset}/><DefenseFxDefs/>
   {slot&&slot.unlock<=s.stage?<circle cx={slot.x} cy={slot.y} r={selectedTower?towerRange(selectedTower,s.stage):145} fill="#e6f5b91a" stroke="#f5e7a5" strokeWidth="2" strokeDasharray="7 6" pointerEvents="none"/>:null}
   <DefenseThemeScenery assetMode={gateAsset} themeId={themeId} snow={snow} expanded={stage.expanded} outpostFallen={s.outpostHp<=0}/>
   <EffectLayer effects={activeEffects} reduced={reduced} unit={unit} layer="ground"/>
   <DashTrail effect={dashEffect} position={s.heroPosition} remaining={s.dashTime} reduced={reduced}/>
   {!dashEffect&&distance(s.heroPosition,s.heroTarget)>5?<g className="def-move-destination" pointerEvents="none"><path d={`M${s.heroPosition.x} ${s.heroPosition.y}L${s.heroTarget.x} ${s.heroTarget.y}`} stroke="#e2f4bb" strokeDasharray="4 8" strokeWidth="1.5" opacity=".4"/><ellipse cx={s.heroTarget.x} cy={s.heroTarget.y} rx="16" ry="7" fill="none" stroke="#f1ffba" strokeWidth="2"/><path d={`M${s.heroTarget.x-6} ${s.heroTarget.y}h12M${s.heroTarget.x} ${s.heroTarget.y-4}v8`} stroke="#f1ffba" strokeWidth="1.4"/></g>:null}
   {units.sort((a,b)=>a.y-b.y).map(unit=><g key={unit.id}>{unit.render}</g>)}
   <AttackTrails attacks={s.attacks} reduced={reduced}/><ProjectileLayer projectiles={s.projectiles} reduced={reduced} unit={unit}/><EffectLayer effects={activeEffects} reduced={reduced} unit={unit}/>
  </svg>
  {breach&&!reduced?<div className="def-breach-flash" style={{opacity:Math.max(0,1-(breach.age??0)/(breach.maxLife??.6))*Math.min(1,.45+(breach.force??1)*.12)}} aria-hidden="true"/>:null}
  <div className="def-town-label" style={{right:'1.5%',top:'var(--town-label-top,74%)'}}>마을 <b>{s.hp}</b></div>{stage.expanded?<div className={`def-town-label ${s.outpostHp<=0?'fallen':''}`} style={{right:'1.5%',top:'11%'}}>구조 <b>{s.outpostHp}</b></div>:null}
  {availableSlots.map(p=>{const tower=s.towers.find(t=>t.slot===p.id);return <button key={p.id} className={`def-build-pad ${tower?'occupied':''} ${selectedSlot===p.id?'selected':''}`} style={{left:`${p.x/9}%`,top:`${p.y/6}%`}} onClick={event=>{event.stopPropagation();activateSlot(p.id);}} aria-label={`${p.id+1}번 건설 지점 · ${terrainLabel[p.terrain]}${tower?` · ${TOWERS[tower.kind].name} 레벨 ${tower.level}`:''}`} aria-pressed={selectedSlot===p.id} disabled={!movingAllowed}>{tower?<span className="def-pad-selected">{selectedSlot===p.id?'선택':''}</span>:<><span aria-hidden="true">+</span><small>{p.terrain==='high'?'고지':p.terrain==='water'?'물가':p.terrain==='ice'?'빙판':p.id+1}</small></>}</button>})}
  {stage.climate==='rain'?<div className="def-weather-rain" style={{backgroundPosition:`${-weatherTime*50}px ${weatherTime*185}px`}} aria-hidden="true"/>:null}
  {snow?<div className="def-weather-snow" style={{backgroundPosition:`${-weatherTime*10}px ${weatherTime*28}px,${-weatherTime*7}px ${42+weatherTime*19}px`}} aria-hidden="true"/>:null}
  {s.bossCharge>0&&s.phase==='wave'?<div className="def-boss-warning"><strong role="status">눈보라 충전 · 필살기로 끊으세요</strong><div className="def-charge-track" aria-hidden="true"><i style={{width:`${Math.min(100,s.bossCharge/2.5*100)}%`}}/></div><span>{s.bossCharge.toFixed(1)}초 남음</span></div>:s.freeze>0&&s.phase==='wave'?<div className="def-boss-warning frozen"><strong role="status">타워가 얼었어요!</strong><span>{s.freeze.toFixed(1)}초 후 해제 · 영웅과 펫은 계속 싸워요</span></div>:null}
  <div className="def-threat-list" aria-label="현재 등장한 적">{enemyKinds.slice(0,4).map(kind=><span key={kind} title={ENEMIES[kind].elementHint}>{ENEMIES[kind].name}</span>)}</div>
 </div>;
});
