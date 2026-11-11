import {Matrix4,Mesh,Object3D,Vector3,type Group} from 'three';
import {HERO_MODEL} from './heroModel.ts';
import {HERO_ATTACK} from './heroAttack.ts';

type HeightField=(x:number,z:number)=>number;
type Foot={node:Object3D;sample:Vector3;sole:Vector3[];all:Vector3[]};

/** Vertical sole placement over the existing height field; no extra renderer or IK rig. */
export class HeroGrounding {
 private feet:Foot[]=[];
 private applied=false;
 private point=new Vector3();private target=new Vector3();
 private model:Group;
 constructor(model:Group){
  this.model=model;
  model.updateWorldMatrix(true,true);
  for(const name of ['left-foot','right-foot']){
   const node=model.getObjectByName(name);if(!node?.parent)continue;
   const inverse=new Matrix4().copy(node.matrixWorld).invert(),matrix=new Matrix4();
   const vertices=new Map<string,Vector3>();
   node.traverse(o=>{if(!(o instanceof Mesh))return;const a=o.geometry.getAttribute('position');if(!a)return;
    matrix.multiplyMatrices(inverse,o.matrixWorld);
    for(let i=0;i<a.count;i++){const p=new Vector3().fromBufferAttribute(a,i).applyMatrix4(matrix);vertices.set(`${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`,p);}
   });
   const all=[...vertices.values()];if(!all.length)continue;
   const bottom=Math.min(...all.map(p=>p.y));
   // Keep the usual sole sample plus all foot vertices for a leaning dash.
   this.feet.push({node,sample:node.position.clone(),sole:all.filter(p=>p.y<=bottom+.025),all});
  }
 }
 /** Restore the sampled animation pose before the mixer's next evaluation. */
 restore(){if(this.applied){for(const foot of this.feet)foot.node.position.copy(foot.sample);this.applied=false;}}
 apply(x:number,z:number,height?:HeightField,strides:{time:number;left:number;right:number}[]=[],fullFoot=false){
  for(const foot of this.feet)foot.sample.copy(foot.node.position);
  this.applied=true;
  for(const stride of strides){
   // The source walk advances each boot .44 model units per planted half-cycle.
   // Extend the same authored, linear stance to match the simulated 1.6-unit
   // cycle. The correction travels with the model, so every heading works.
   const phase=((stride.time/.8)%1+1)%1;
   const triangle=phase<.5?1-4*phase:-3+4*phase;
   const extra=Math.max(0,HERO_ATTACK.stride/(4*HERO_MODEL.scale)-.22);
   for(const foot of this.feet){const left=foot.node.name==='left-foot';foot.node.position.z+=(left?-1:1)*triangle*extra*(left?stride.left:stride.right);}
  }
  if(!height)return;
  this.model.updateWorldMatrix(true,true);
  const base=height(x,z);
  for(const foot of this.feet){
   let flat=Infinity,clearance=Infinity;
   // A leaning dash can make the toe/heel rather than the flat sole lowest.
   for(const p of fullFoot?foot.all:foot.sole){this.point.copy(p).applyMatrix4(foot.node.matrixWorld);
    flat=Math.min(flat,this.point.y-base);clearance=Math.min(clearance,this.point.y-height(this.point.x,this.point.z));
   }
   // Preserve the animation's authored lift while making its lowest sole point
   // touch the local slope when the authored foot is planted.
   const lift=Math.max(0,flat)-clearance;
   if(!Number.isFinite(lift))continue;
   foot.node.getWorldPosition(this.target);this.target.y+=lift;
   foot.node.position.copy(foot.node.parent!.worldToLocal(this.target));
   foot.node.updateWorldMatrix(false,true);
  }
 }
}
