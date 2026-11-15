import { getSlots, getStage } from './data.ts';
import { positionOnPath } from './engine.ts';
import { sampleAttackAnimation } from './animationTiming.ts';
import type { AttackClipTiming } from './animationTiming.ts';
import type { DefenseState, Point } from './types.ts';

export type BattleModelId = 'kar' | 'bron' | 'ballista' | 'wood' | 'ian' | 'base-crossbow' | 'base-cannon' | 'base-magic';
export type BattleModelSpec = {
 file: string;
 height: number;
 forward: number;
 walk?: {name: string; duration: number; stride: number};
 attack?: AttackClipTiming & {name: string};
 aimNode?: string;
 fixedBase?: boolean;
 footprint?: number;
};

/** Authored contacts are documented in docs/arcana-battle-models-20261112.md.
 * The engine owns damage; these values only sample a pose. Height is fixed in
 * world units, never recomputed from a swinging weapon or camera-facing box. */
export const BATTLE_MODELS: Record<BattleModelId, BattleModelSpec> = {
 kar: {file:'kar.glb',height:112,forward:Math.PI,walk:{name:'kar-walk',duration:.8,stride:70},attack:{name:'kar-slam',duration:.56,contact:.28}},
 bron: {file:'bron.glb',height:106,forward:Math.PI,attack:{name:'dwarf-hammer-attack',duration:.8,contact:10/30}},
 ballista: {file:'ballista.glb',height:70,forward:0,aimNode:'aim-platform',attack:{name:'frontier-ballista-release',duration:.4,contact:.1}},
 wood: {file:'wood.glb',height:79,forward:-Math.PI/2,walk:{name:'frontier-wood-walk',duration:1,stride:44}},
 ian: {file:'ian.glb',height:108,forward:Math.PI,walk:{name:'ian-walk',duration:.8,stride:64},attack:{name:'ian-cast',duration:.33,contact:.15}},
 'base-crossbow': {file:'base-crossbow.glb',height:70,forward:0,footprint:31,aimNode:'aim-platform',attack:{name:'base-crossbow-release',duration:.4,contact:.1}},
 'base-cannon': {file:'base-cannon.glb',height:65,forward:0,footprint:31,aimNode:'aim-platform',attack:{name:'base-cannon-fire',duration:.52,contact:.28}},
 'base-magic': {file:'base-magic.glb',height:90,forward:0,footprint:31,fixedBase:true,attack:{name:'base-magic-release',duration:.39,contact:.15}},
};
export const battleModelUrl = (id:BattleModelId) => `/defense/models/battle/${BATTLE_MODELS[id].file}`;
export type BattleActorPose = {
 key:string; model:BattleModelId; position:Point; ground:number; scale:number;
 heading:number; clip?:string; clipTime:number; phase:'idle'|'walk'|'attack'|'skill'|'dash';
 hit:number;
};

/** This is visual height only: it does not alter navigation or targeting. */
export function battleGroundHeight(stage:number, point:Point):number {
 const definition=getStage(stage);
 if(definition.region==='forest'&&point.x>=648&&point.x<=737&&
  [430,...(definition.expanded?[235]:[])].some(y=>Math.abs(point.y-y)<=25))return 6.5;
 if(getSlots(stage).some(slot=>slot.unlock<=stage&&slot.terrain==='high'&&Math.hypot(slot.x-point.x,slot.y-point.y)<=32))return 3.1;
 return .5;
}

// Same board-to-world depth conversion as the orthographic terrain camera.
const groundSin=Math.sin(Math.PI/3);
export function battleHeading(from:Point,to:Point,facing:-1|1=1):number {
 const dx=to.x-from.x,dz=(to.y-from.y)/groundSin;
 return Math.hypot(dx,dz)>.01?Math.atan2(dx,dz):facing*Math.PI/2;
}

/** Pure render projection. It never advances the simulation, deals damage,
 * chooses targets, unlocks content or mutates a save. Unsupported units stay
 * in the SVG renderer, including the other crossbow upgrade appearances. */
export function battleActorPoses(state:DefenseState,unit=1,reduced=false):BattleActorPose[] {
 const actors:BattleActorPose[]=[];
 for(const source of ['hero','mercenary'] as const){
  const hero=source==='hero'?state.hero:state.mercenary;
  const model=hero==='barbarian'?'kar':hero==='dwarf'?'bron':hero==='mage'?'ian':null;
  if(!model)continue;
  const position=source==='hero'?state.heroPosition:state.mercenaryPosition;
  const facing=source==='hero'?state.heroFacing:state.mercenaryFacing;
  const motion=state.locomotion[source],heading=motion.heading??{x:facing,y:0};
  const target={x:position.x+heading.x,y:position.y+heading.y};
  const moving=motion.speed>.5;
  const spec=BATTLE_MODELS[model],attack=spec.attack?sampleAttackAnimation(state,{source},spec.attack):null;
  const dashing=source==='hero'&&state.dashTime>0;
  const skill=source==='hero'?state.effects.filter(effect=>effect.kind==='skill').at(-1):undefined;
  const skillAge=skill?.age??Infinity,casting=skillAge<.5;
  const direction=dashing?{x:position.x+state.heroVelocity.x,y:position.y+state.heroVelocity.y}:attack?.target??target;
  const walk=moving&&!reduced?spec.walk:undefined;
  // Skills deal damage immediately in the engine, so begin at the authored
  // impact pose and recover. A dash takes precedence over a fired attack's
  // retained recovery; keeping that attack must not face the model backwards.
  const clip=reduced||dashing?undefined:casting||attack?spec.attack!.name:walk?.name;
  const clipTime=reduced||dashing?0:casting?spec.attack!.contact+(spec.attack!.duration-spec.attack!.contact)*Math.min(1,skillAge/.5):attack?.clipTime??(walk?(motion.distance/(walk.stride*unit)%1)*walk.duration:0);
  actors.push({key:source==='hero'?'hero':'merc',model,position:{...position},ground:battleGroundHeight(state.stage,position),
   scale:unit*(source==='hero'&&state.promotion?94/84:1),heading:battleHeading(position,direction,facing),
   clip,clipTime,phase:reduced?'idle':dashing?'dash':casting?'skill':attack?'attack':walk?'walk':'idle',hit:0});
 }
 for(const tower of state.towers){
  const model:BattleModelId|null=tower.level===1&&tower.branch===null?`base-${tower.kind}`:tower.kind==='crossbow'&&tower.branch==='pierce'&&tower.level===2?'ballista':null;
  if(!model)continue;
  const position=getSlots(state.stage).find(slot=>slot.id===tower.slot&&slot.unlock<=state.stage);
  if(!position)continue;
  const spec=BATTLE_MODELS[model],attack=sampleAttackAnimation(state,{source:'tower',slot:tower.slot},spec.attack!);
  actors.push({key:`tower-${tower.slot}`,model,position:{x:position.x,y:position.y},ground:battleGroundHeight(state.stage,position),scale:1,
   heading:battleHeading(position,attack?.target??tower.aim??{x:position.x+1,y:position.y}),
   clip:!reduced&&attack?spec.attack!.name:undefined,clipTime:!reduced&&attack?attack.clipTime:0,phase:!reduced&&attack?'attack':'idle',hit:0});
 }
 for(const enemy of state.enemies){
  if(enemy.kind!=='wood')continue;
  const next=positionOnPath(enemy.path,enemy.progress+3,state.stage),walk=BATTLE_MODELS.wood.walk!;
  actors.push({key:`enemy-${enemy.id}`,model:'wood',position:{x:enemy.x,y:enemy.y},ground:battleGroundHeight(state.stage,enemy),scale:unit,
   heading:battleHeading(enemy,next,enemy.facing??1),clip:reduced?undefined:walk.name,
   clipTime:reduced?0:(((enemy.walkDistance??enemy.progress)/(walk.stride*unit)+enemy.id*.17)%1)*walk.duration,phase:reduced||(enemy.walkSpeed??enemy.speed)<=.1?'idle':'walk',hit:reduced?0:Math.max(0,Math.min(1,(enemy.recoil??enemy.hit)/.2))});
 }
 return actors;
}
