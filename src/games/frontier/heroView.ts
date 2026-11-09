import{AnimationMixer,LoopOnce,LoopRepeat,type AnimationAction,type AnimationClip,type Group}from'three';
import{HERO_MODEL}from'./heroModel.ts';
import{HERO_ATTACK,walkContactWeight}from'./heroAttack.ts';
import{HeroGrounding}from'./heroGrounding.ts';
import type{Frontier}from'./engine.ts';
/** Existing editable Kar clips, sampled by simulation state in the shared battlefield scene. */
export class HeroView{
 readonly model:Group;private mixer:AnimationMixer;private walk:AnimationAction;private slam?:AnimationAction;private reset?:AnimationAction;private entries:AnimationAction[]=[];private stops:AnimationAction[]=[];private grounding:HeroGrounding;
 constructor(model:Group,walk:AnimationClip){this.model=model;model.scale.setScalar(HERO_MODEL.scale);model.position.y=HERO_MODEL.baseY;model.rotation.y=HERO_MODEL.forwardCorrection;this.mixer=new AnimationMixer(model);this.walk=this.mixer.clipAction(walk).setLoop(LoopRepeat,Infinity).play();this.grounding=new HeroGrounding(model);}
 setSlam(clip:AnimationClip){this.slam=this.mixer.clipAction(clip).setLoop(LoopOnce,1);this.slam.clampWhenFinished=true;this.slam.setEffectiveWeight(0).play();}
 setReset(clip:AnimationClip){this.reset=this.mixer.clipAction(clip).setLoop(LoopOnce,1);this.reset.clampWhenFinished=true;this.reset.setEffectiveWeight(0).play();}
 setEntries(clips:AnimationClip[]){this.entries=Array.from({length:8},(_,i)=>{const a=this.mixer.clipAction(clips.find(c=>c.name===`kar-entry-${i}`)!).setLoop(LoopOnce,1);a.clampWhenFinished=true;return a.setEffectiveWeight(0).play();});}
 setStops(clips:AnimationClip[]){const ordered=Array.from({length:8},(_,i)=>clips.find(c=>c.name===`kar-stop-${i}`));if(ordered.some(c=>!c))return;this.stops=ordered.map(clip=>{const a=this.mixer.clipAction(clip!).setLoop(LoopOnce,1);a.clampWhenFinished=true;return a.setEffectiveWeight(0).play();});}
 update(hero:Frontier['hero'],reduced:boolean,height?:(x:number,z:number)=>number){
  this.grounding.restore();
  const attack=hero.attack,entry=attack?Math.round(attack.walkTime/.1)%8:0,action=attack?(attack.fromMoving===false?(this.slam??this.entries[entry]):(this.entries[entry]??this.slam)):undefined;
  const q=attack?.fromMoving&&!reduced?Math.max(0,Math.min(1,attack.time/.04)):1,entryBlend=q*q*(3-2*q);
  for(const a of [this.walk,this.slam,this.reset,...this.entries,...this.stops])if(a){a.enabled=true;a.setEffectiveWeight(0);}
  // All entry clips share the authored rebound at .43s. End in the grounded idle pose.
  if(action&&this.reset&&attack!.time>=.43&&!reduced){this.reset.time=this.reset.getClip().duration*Math.min(1,(attack!.time-.43)/(HERO_ATTACK.duration-.43));this.reset.setEffectiveWeight(1);}
  else if(action){action.time=reduced?(attack!.hit?HERO_ATTACK.contact:.19):Math.min(attack!.time,HERO_ATTACK.duration);action.setEffectiveWeight(entryBlend);if(entryBlend<1){this.walk.time=attack!.walkTime;this.walk.setEffectiveWeight(1-entryBlend);}}
  else if(!hero.moving&&hero.settle&&this.stops.length===8&&!reduced){
   const {time,walkTime}=hero.settle,stop=this.stops[Math.round(walkTime/.1)%8];
   // Start from the exact last continuous walk sample, then enter the nearest authored plant.
   const q=Math.max(0,Math.min(1,time/.04)),blend=q*q*(3-2*q);
   this.walk.time=walkTime;this.walk.setEffectiveWeight(1-blend);
   stop.time=Math.min(time,stop.getClip().duration);stop.setEffectiveWeight(blend);
  }
  else if(!hero.moving&&this.slam){this.slam.time=0;this.slam.setEffectiveWeight(1);}
  else{this.walk.time=reduced||!hero.moving?0:(hero.walkDistance/HERO_ATTACK.stride*.8)%.8;this.walk.setEffectiveWeight(1);}
  this.mixer.update(0);
  // Carry the walk correction into the authored plant/stop and let it settle
  // before contact, avoiding a one-frame jump when movement is interrupted.
  const fade=(time:number,duration:number)=>{const q=Math.max(0,Math.min(1,time/duration));return 1-q*q*(3-2*q);};
  const settle=(time:number,phase:number,duration:number,weight:number)=>{
   // The authored transitions first place the swing boot, then move the
   // supporting boot. Keep the latter fixed until its own lift begins.
   const first=Math.round(phase/.1)%8<4?'right':'left',half=duration/2;
   return {time:phase,left:weight*fade(time-(first==='left'?0:half),half),right:weight*fade(time-(first==='right'?0:half),half)};
  };
  const weight=walkContactWeight(hero.walkDistance,hero.walkStartDistance);
  const stride=reduced?[]:action&&attack?.fromMoving?[
   {time:attack.walkTime,left:(attack.walkWeight??1)*(1-entryBlend),right:(attack.walkWeight??1)*(1-entryBlend)},
   settle(attack.time,entry*.1,.18,(attack.walkWeight??1)*entryBlend)
  ]:!hero.moving&&hero.settle&&this.stops.length===8?[settle(hero.settle.time,hero.settle.walkTime,.24,hero.settle.walkWeight??1)]:
   !action&&hero.moving?[{time:this.walk.time,left:weight,right:weight}]:[];
  this.grounding.apply(hero.x,hero.z,height,stride);
 }
 dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);}
}
