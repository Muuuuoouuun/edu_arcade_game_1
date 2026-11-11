import{AnimationMixer,LoopOnce,LoopRepeat,Quaternion,Vector3,type AnimationAction,type AnimationClip,type Group,type Object3D}from'three';
import{HERO_MODEL}from'./heroModel.ts';
import{HERO_ATTACK,walkContactWeight}from'./heroAttack.ts';
import{HeroGrounding}from'./heroGrounding.ts';
import type{Frontier}from'./engine.ts';
/** Existing editable Kar clips, sampled by simulation state in the shared battlefield scene. */
export class HeroView{
 readonly model:Group;private mixer:AnimationMixer;private walk:AnimationAction;private attackWalk:AnimationAction;private slam?:AnimationAction;private dashIdle?:AnimationAction;private reset?:AnimationAction;private entries:AnimationAction[]=[];private stops:AnimationAction[]=[];private grounding:HeroGrounding;private leftFoot?:Object3D;private rightFoot?:Object3D;private lastBrace=0;
 private corrected:{node:Object3D;position:Vector3;rotation:Quaternion;scale:Vector3}[]=[];private correctedCount=0;
 private point=new Vector3();private axis=new Vector3();private direction=new Vector3();private delta=new Quaternion();private readonly up=new Vector3(0,1,0);
 constructor(model:Group,walk:AnimationClip){this.model=model;model.scale.setScalar(HERO_MODEL.scale);model.position.y=HERO_MODEL.baseY;model.rotation.y=HERO_MODEL.forwardCorrection;this.mixer=new AnimationMixer(model);this.walk=this.mixer.clipAction(walk).setLoop(LoopRepeat,Infinity).play();this.attackWalk=this.mixer.clipAction(walk.clone()).setLoop(LoopRepeat,Infinity).setEffectiveWeight(0).play();this.grounding=new HeroGrounding(model);this.leftFoot=model.getObjectByName('left-foot');this.rightFoot=model.getObjectByName('right-foot');}
 setSlam(clip:AnimationClip){this.slam=this.mixer.clipAction(clip).setLoop(LoopOnce,1);this.slam.clampWhenFinished=true;this.slam.setEffectiveWeight(0).play();this.dashIdle=this.mixer.clipAction(clip.clone()).setLoop(LoopOnce,1);this.dashIdle.clampWhenFinished=true;this.dashIdle.setEffectiveWeight(0).play();}
 setReset(clip:AnimationClip){this.reset=this.mixer.clipAction(clip).setLoop(LoopOnce,1);this.reset.clampWhenFinished=true;this.reset.setEffectiveWeight(0).play();}
 setEntries(clips:AnimationClip[]){this.entries=Array.from({length:8},(_,i)=>{const a=this.mixer.clipAction(clips.find(c=>c.name===`kar-entry-${i}`)!).setLoop(LoopOnce,1);a.clampWhenFinished=true;return a.setEffectiveWeight(0).play();});}
 setStops(clips:AnimationClip[]){const ordered=Array.from({length:8},(_,i)=>clips.find(c=>c.name===`kar-stop-${i}`));if(ordered.some(c=>!c))return;this.stops=ordered.map(clip=>{const a=this.mixer.clipAction(clip!).setLoop(LoopOnce,1);a.clampWhenFinished=true;return a.setEffectiveWeight(0).play();});}
 private restoreArms(){for(let i=0;i<this.correctedCount;i++){const a=this.corrected[i];a.node.position.copy(a.position);a.node.quaternion.copy(a.rotation);a.node.scale.copy(a.scale);}this.correctedCount=0;}
 private aim(joint:Object3D,target:Vector3){if(!joint.parent)return;joint.parent.worldToLocal(target);this.direction.copy(target).sub(joint.position);const length=this.direction.length();if(length<1e-6)return;this.direction.multiplyScalar(1/length);this.axis.copy(this.up).applyQuaternion(joint.quaternion);this.delta.setFromUnitVectors(this.axis,this.direction);joint.quaternion.premultiply(this.delta);joint.scale.y=length;joint.updateWorldMatrix(false,true);}
 /** Reconnect the two rigid arm segments to the sampled shoulder and grip. */
 private connectArms(){
  const body=this.model.getObjectByName('body');if(!body)return;this.model.updateWorldMatrix(true,true);
  for(const [i,side] of ['left','right'].entries()){
   const upper=this.model.getObjectByName(side+'-upper'),lower=this.model.getObjectByName(side+'-forearm'),grip=this.model.getObjectByName(i?'lower-grip':'upper-grip');if(!upper?.parent||!lower?.parent||!grip)continue;
   for(const node of [upper,lower]){let saved=this.corrected[this.correctedCount];if(!saved){saved={node,position:new Vector3(),rotation:new Quaternion(),scale:new Vector3()};this.corrected.push(saved);}saved.node=node;saved.position.copy(node.position);saved.rotation.copy(node.quaternion);saved.scale.copy(node.scale);this.correctedCount++;}
   this.point.set(i ? .77 : -.77,1.17,0);body.localToWorld(this.point);upper.parent.worldToLocal(this.point);upper.position.copy(this.point);
   lower.getWorldPosition(this.point);this.aim(upper,this.point);grip.getWorldPosition(this.point);this.aim(lower,this.point);
  }
 }
 update(hero:Frontier['hero'],reduced:boolean,height?:(x:number,z:number)=>number){
  this.restoreArms();
  this.grounding.restore();
  // Some fallback walk clips do not animate foot positions. Remove our last
  // offsets before sampling again so paused/reduced frames cannot accumulate.
  if(this.leftFoot)this.leftFoot.position.z+=.38*this.lastBrace;if(this.rightFoot)this.rightFoot.position.z-=.38*this.lastBrace;
  const attack=hero.attack,entry=attack?Math.round(attack.walkTime/.1)%8:0,action=attack?(attack.fromMoving===false?(this.slam??this.entries[entry]):(this.entries[entry]??this.slam)):undefined;
  const cancelled=!attack&&!reduced?hero.dashMotion?.fromAttack:undefined,cancelEntry=cancelled?Math.round(cancelled.walkTime/.1)%8:0;
  const cancelAction=cancelled?(cancelled.fromMoving===false?(this.slam??this.entries[cancelEntry]):(this.entries[cancelEntry]??this.slam)):undefined;
  const cancelQ=cancelled&&cancelAction&&this.dashIdle?Math.max(0,Math.min(1,hero.dashMotion!.progress/.25)):1;
  const cancelWeight=1-cancelQ*cancelQ*(3-2*cancelQ),cancelEntryQ=cancelled?.fromMoving?Math.max(0,Math.min(1,cancelled.time/.04)):1,cancelEntryBlend=cancelEntryQ*cancelEntryQ*(3-2*cancelEntryQ);
  // Brace between the actual takeoff and landing, joining the prior pose
  // at takeoff and the locomotion sample at landing. Reduced motion keeps it off.
  const brace=hero.dashMotion&&!reduced?Math.sin(Math.PI*Math.max(0,Math.min(1,hero.dashMotion.progress)))*(1-cancelWeight):0;
  const dashWalk=hero.dashMotion&&!reduced?((hero.dashMotion.fromMoving??hero.moving)?1:hero.dashMotion.progress)*(1-brace):1;
  this.model.position.y=HERO_MODEL.baseY-.32*brace;
  const q=attack?.fromMoving&&!reduced?Math.max(0,Math.min(1,attack.time/.04)):1,entryBlend=q*q*(3-2*q);
  for(const a of [this.walk,this.attackWalk,this.slam,this.dashIdle,this.reset,...this.entries,...this.stops])if(a){a.enabled=true;a.setEffectiveWeight(0);}
  // All entry clips share the authored rebound at .43s. End in the grounded idle pose.
  if(action&&this.reset&&attack!.time>=.43&&!reduced){this.reset.time=this.reset.getClip().duration*Math.min(1,(attack!.time-.43)/(HERO_ATTACK.duration-.43));this.reset.setEffectiveWeight(1);}
  else if(action){action.time=reduced?(attack!.hit?HERO_ATTACK.contact:.19):Math.min(attack!.time,HERO_ATTACK.duration);action.setEffectiveWeight(entryBlend);if(entryBlend<1){this.walk.time=attack!.walkTime;this.walk.setEffectiveWeight(1-entryBlend);}}
  else if(cancelWeight&&cancelled&&cancelAction&&this.dashIdle){
   if(this.reset&&cancelled.time>=.43){this.reset.time=this.reset.getClip().duration*Math.min(1,(cancelled.time-.43)/(HERO_ATTACK.duration-.43));this.reset.setEffectiveWeight(cancelWeight);}
   else{cancelAction.time=Math.min(cancelled.time,HERO_ATTACK.duration);cancelAction.setEffectiveWeight(cancelWeight*cancelEntryBlend);if(cancelEntryBlend<1){this.attackWalk.time=cancelled.walkTime;this.attackWalk.setEffectiveWeight(cancelWeight*(1-cancelEntryBlend));}}
   this.walk.time=(hero.walkDistance/HERO_ATTACK.stride*.8)%.8;this.walk.setEffectiveWeight((1-cancelWeight)*dashWalk);this.dashIdle.time=0;this.dashIdle.setEffectiveWeight((1-cancelWeight)*(1-dashWalk));
  }
  else if(hero.dashMotion&&!reduced&&this.slam){this.walk.time=(hero.walkDistance/HERO_ATTACK.stride*.8)%.8;this.walk.setEffectiveWeight(dashWalk);this.slam.time=0;this.slam.setEffectiveWeight(1-dashWalk);}
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
  if(cancelWeight>0&&cancelWeight<1)this.connectArms();
  // Spread the feet fore/aft while the torso and two-handed hammer stay
  // together. Grounding below projects the resulting pose onto the terrain.
  if(brace){if(this.leftFoot)this.leftFoot.position.z-=.38*brace;if(this.rightFoot)this.rightFoot.position.z+=.38*brace;}
  this.lastBrace=brace;
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
  const stride=reduced?[]:cancelWeight&&cancelled?[
   ...(cancelled.fromMoving?[
    {time:cancelled.walkTime,left:(cancelled.walkWeight??1)*(1-cancelEntryBlend)*cancelWeight,right:(cancelled.walkWeight??1)*(1-cancelEntryBlend)*cancelWeight},
    settle(cancelled.time,cancelEntry*.1,.18,(cancelled.walkWeight??1)*cancelEntryBlend*cancelWeight)
   ]:[]),
   ...((hero.moving||hero.dashMotion?.fromMoving)?[{time:this.walk.time,left:weight*dashWalk*(1-cancelWeight),right:weight*dashWalk*(1-cancelWeight)}]:[])
  ]:action&&attack?.fromMoving?[
   {time:attack.walkTime,left:(attack.walkWeight??1)*(1-entryBlend),right:(attack.walkWeight??1)*(1-entryBlend)},
   settle(attack.time,entry*.1,.18,(attack.walkWeight??1)*entryBlend)
  ]:!hero.moving&&hero.settle&&this.stops.length===8?[settle(hero.settle.time,hero.settle.walkTime,.24,hero.settle.walkWeight??1)]:
   !action&&(hero.moving||hero.dashMotion?.fromMoving)?[{time:this.walk.time,left:weight*dashWalk,right:weight*dashWalk}]:[];
  this.grounding.apply(hero.x,hero.z,height,stride,!!hero.dashMotion&&!reduced);
 }
 dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);}
}
