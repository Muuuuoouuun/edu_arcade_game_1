import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, type Object3D } from 'three';

// Short, bounded tint; returns to original colour by 0.16 seconds.
export function hitFlashStrength(time:number):number {
 return time > 0 && time < .16 ? .38 * Math.sin(Math.PI * time / .16) : 0;
}

// Reference: guardian-ranger-hit-reference.png. Feet are separate static nodes;
// animate the upper body and equipment only, keeping the authored GLB untouched.
export function createHitClip(modelId:string, root:Object3D):AnimationClip|null {
 type Angles = [number,number,number];
 const zero:Angles=[0,0,0];
 const poses:Record<string,Record<string,Angles[]>> = {
  'polar-bear': {
   'body':[zero,[-.27,0,-.24],[.09,0,.08],zero],
   'guard-arm':[zero,[.38,0,.38],[-.12,0,-.12],zero],
   'head':[zero,[.18,0,.12],[-.06,0,-.04],zero],
   'hammer-arm':[zero,[-.18,0,-.22],[.06,0,.07],zero],
  },
  'gecko-ranger': {
   'body':[zero,[-.24,0,.26],[.08,0,-.09],zero],
   'head':[zero,[.18,0,-.17],[-.06,0,.06],zero],
   'crossbow-and-gripping-arms':[zero,[.28,0,-.35],[-.09,0,.12],zero],
   'curled-tail':[zero,[-.22,0,-.38],[.12,0,.16],zero],
  },
 };
 const joints=poses[modelId]; if(!joints)return null;
 const times=[0,.09,.25,.48];
 const tracks=Object.entries(joints).map(([name,angles])=>{
  const node=root.getObjectByName(name); if(!node)throw new Error(`Missing hit joint: ${name}`);
  const rest=node.quaternion.clone(), values:number[]=[];
  for(const [x,y,z] of angles){const q=rest.clone().multiply(new Quaternion().setFromEuler(new Euler(x,y,z)));values.push(q.x,q.y,q.z,q.w);}
  return new QuaternionKeyframeTrack(`${node.uuid}.quaternion`,times,values);
 });
 return new AnimationClip(`${modelId}-hit`,.48,tracks);
}
