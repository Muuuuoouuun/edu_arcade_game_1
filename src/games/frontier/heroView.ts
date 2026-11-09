import{AnimationMixer,LoopOnce,LoopRepeat,type AnimationAction,type AnimationClip,type Group}from'three';
import{HERO_MODEL}from'./heroModel.ts';
import{HERO_ATTACK}from'./heroAttack.ts';
import type{Frontier}from'./engine.ts';
/** Existing editable Kar clips, sampled by simulation state in the shared battlefield scene. */
export class HeroView{
 readonly model:Group;private mixer:AnimationMixer;private walk:AnimationAction;private slam?:AnimationAction;private reset?:AnimationAction;private entries:AnimationAction[]=[];private stops:AnimationAction[]=[];
 constructor(model:Group,walk:AnimationClip){this.model=model;model.scale.setScalar(HERO_MODEL.scale);model.position.y=HERO_MODEL.baseY;model.rotation.y=HERO_MODEL.forwardCorrection;this.mixer=new AnimationMixer(model);this.walk=this.mixer.clipAction(walk).setLoop(LoopRepeat,Infinity).play();}
 setSlam(clip:AnimationClip){this.slam=this.mixer.clipAction(clip).setLoop(LoopOnce,1);this.slam.clampWhenFinished=true;this.slam.setEffectiveWeight(0).play();}
 setReset(clip:AnimationClip){this.reset=this.mixer.clipAction(clip).setLoop(LoopOnce,1);this.reset.clampWhenFinished=true;this.reset.setEffectiveWeight(0).play();}
 setEntries(clips:AnimationClip[]){this.entries=Array.from({length:8},(_,i)=>{const a=this.mixer.clipAction(clips.find(c=>c.name===`kar-entry-${i}`)!).setLoop(LoopOnce,1);a.clampWhenFinished=true;return a.setEffectiveWeight(0).play();});}
 setStops(clips:AnimationClip[]){const ordered=Array.from({length:8},(_,i)=>clips.find(c=>c.name===`kar-stop-${i}`));if(ordered.some(c=>!c))return;this.stops=ordered.map(clip=>{const a=this.mixer.clipAction(clip!).setLoop(LoopOnce,1);a.clampWhenFinished=true;return a.setEffectiveWeight(0).play();});}
 update(hero:Frontier['hero'],reduced:boolean){
  const attack=hero.attack,entry=attack?Math.round(attack.walkTime/.1)%8:0,action=attack?(attack.fromMoving===false?(this.slam??this.entries[entry]):(this.entries[entry]??this.slam)):undefined;
  for(const a of [this.walk,this.slam,this.reset,...this.entries,...this.stops])if(a){a.enabled=true;a.setEffectiveWeight(0);}
  // All entry clips share the authored rebound at .43s. End in the grounded idle pose.
  if(action&&this.reset&&attack!.time>=.43&&!reduced){this.reset.time=this.reset.getClip().duration*Math.min(1,(attack!.time-.43)/(HERO_ATTACK.duration-.43));this.reset.setEffectiveWeight(1);}
  else if(action){action.time=reduced?(attack!.hit?HERO_ATTACK.contact:.19):Math.min(attack!.time,HERO_ATTACK.duration);action.setEffectiveWeight(1);}
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
 }
 dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);}
}
