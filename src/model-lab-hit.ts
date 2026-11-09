import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, type Object3D } from 'three';

// Reference: guardian-ranger-hit-reference.png. Feet are separate static nodes;
// animate the upper body and equipment only, keeping the authored GLB untouched.
export function createHitClip(modelId:string, root:Object3D):AnimationClip|null {
 const poses:Record<string,Record<string,number[]>> = {
  'polar-bear': {'body':[0,-.16,.055,0], 'guard-arm':[0,.25,-.08,0], 'head':[0,.10,-.035,0], 'hammer-arm':[0,-.10,.04,0]},
  'gecko-ranger': {'body':[0,-.14,.045,0], 'head':[0,.12,-.035,0], 'crossbow-and-gripping-arms':[0,.18,-.06,0], 'curled-tail':[0,-.16,.08,0]},
 };
 const joints=poses[modelId]; if(!joints)return null;
 const times=[0,.09,.25,.48];
 const tracks=Object.entries(joints).map(([name,angles])=>{
  const node=root.getObjectByName(name); if(!node)throw new Error(`Missing hit joint: ${name}`);
  const rest=node.quaternion.clone(), values:number[]=[];
  for(const angle of angles){const q=rest.clone().multiply(new Quaternion().setFromEuler(new Euler(angle,0,0)));values.push(q.x,q.y,q.z,q.w);}
  return new QuaternionKeyframeTrack(`${node.uuid}.quaternion`,times,values);
 });
 return new AnimationClip(`${modelId}-hit`,.48,tracks);
}
