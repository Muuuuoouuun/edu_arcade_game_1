import{AnimationMixer,LoopOnce,LoopRepeat,type AnimationAction,type AnimationClip,type Group}from'three';
import{HERO_MODEL}from'./heroModel.ts';
import{HERO_ATTACK}from'./heroAttack.ts';
import type{Frontier}from'./engine.ts';
/** Existing editable Kar clips, sampled by simulation state in the shared battlefield scene. */
export class HeroView{
 readonly model:Group;private mixer:AnimationMixer;private walk:AnimationAction;private slam?:AnimationAction;private entries:AnimationAction[]=[];
 constructor(model:Group,walk:AnimationClip){this.model=model;model.scale.setScalar(HERO_MODEL.scale);model.position.y=HERO_MODEL.baseY;model.rotation.y=HERO_MODEL.forwardCorrection;this.mixer=new AnimationMixer(model);this.walk=this.mixer.clipAction(walk).setLoop(LoopRepeat,Infinity).play();}
 setSlam(clip:AnimationClip){this.slam=this.mixer.clipAction(clip).setLoop(LoopOnce,1);this.slam.clampWhenFinished=true;this.slam.setEffectiveWeight(0).play();}
 setEntries(clips:AnimationClip[]){this.entries=Array.from({length:8},(_,i)=>{const a=this.mixer.clipAction(clips.find(c=>c.name===`kar-entry-${i}`)!).setLoop(LoopOnce,1);a.clampWhenFinished=true;return a.setEffectiveWeight(0).play();});}
 update(hero:Frontier['hero'],reduced:boolean){
  const attack=hero.attack,entry=attack?Math.round(attack.walkTime/.1)%8:0,action=attack?(this.entries[entry]??this.slam):undefined;
  for(const a of [this.walk,this.slam,...this.entries])if(a){a.enabled=true;a.setEffectiveWeight(0);}
  if(action){action.time=reduced?(attack!.hit?HERO_ATTACK.contact:.19):Math.min(attack!.time,HERO_ATTACK.duration);action.setEffectiveWeight(1);}
  else{this.walk.time=reduced||!hero.moving?0:(hero.walkDistance/HERO_ATTACK.stride*.8)%.8;this.walk.setEffectiveWeight(1);}
  this.mixer.update(0);
 }
 dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);}
}
