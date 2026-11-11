import {MathUtils,Matrix4,Mesh,Object3D,Quaternion,Vector3,type Group} from 'three';
import {HERO_MODEL} from './heroModel.ts';
import {HERO_ATTACK} from './heroAttack.ts';

type HeightField=(x:number,z:number)=>number;
type Foot={node:Object3D;sample:Vector3;rotation:Quaternion;sole:Vector3[];all:Vector3[]};

/** Place and gently orient the existing soles on terrain without a separate IK rig. */
export class HeroGrounding {
 private feet:Foot[]=[];
 private applied=false;
 private point=new Vector3();private target=new Vector3();
 private normal=new Vector3();private readonly up=new Vector3(0,1,0);
 private localUp=new Vector3();private upCorrection=new Vector3();private tiltMatrix=new Matrix4();
 private parentRotation=new Quaternion();private localRotation=new Quaternion();private slopeRotation=new Quaternion();private readonly identity=new Quaternion();
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
   this.feet.push({node,sample:node.position.clone(),rotation:node.quaternion.clone(),sole:all.filter(p=>p.y<=bottom+.025),all});
  }
 }
 /** Restore the sampled animation pose before the mixer's next evaluation. */
 restore(){if(this.applied){for(const foot of this.feet){foot.node.matrixAutoUpdate=true;foot.node.position.copy(foot.sample);foot.node.quaternion.copy(foot.rotation);}this.applied=false;}}
 apply(x:number,z:number,height?:HeightField,strides:{time:number;left:number;right:number}[]=[],fullFoot=false){
  for(const foot of this.feet){foot.sample.copy(foot.node.position);foot.rotation.copy(foot.node.quaternion);}
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
   // A leaning dash or a boot straddling the raised bridge deck can make a
   // non-sole vertex lowest relative to the surface. Restrict the extra scan
   // to the crossing neighborhood so ordinary level-ground frames stay cheap.
   let step=false;
   if(!fullFoot&&x>0&&x<12&&Math.abs(z)<5){let low=Infinity,high=-Infinity;
    for(const p of foot.all){this.point.copy(p).applyMatrix4(foot.node.matrixWorld);const h=height(this.point.x,this.point.z);low=Math.min(low,h);high=Math.max(high,h);if(high-low>.2){step=true;break;}}
   }
   const points=fullFoot||step?foot.all:foot.sole;
   for(const p of points){this.point.copy(p).applyMatrix4(foot.node.matrixWorld);flat=Math.min(flat,this.point.y-base);clearance=Math.min(clearance,this.point.y-height(this.point.x,this.point.z));}
   // A planted boot follows a smooth local slope; its authored airborne pose
   // fades back in. Suppress the tilt near cliffs/deck steps instead of treating
   // their discontinuous heights as a physically walkable ramp.
   if(flat<.18){
    foot.node.getWorldPosition(this.target);const r=.25,c=height(this.target.x,this.target.z),xp=height(this.target.x+r,this.target.z),xm=height(this.target.x-r,this.target.z),zp=height(this.target.x,this.target.z+r),zm=height(this.target.x,this.target.z-r);
    const dx=(xp-xm)/(2*r),dz=(zp-zm)/(2*r),bend=Math.max(Math.abs(xp+xm-2*c),Math.abs(zp+zm-2*c)),slope=Math.hypot(dx,dz);
    const weight=(1-MathUtils.smoothstep(Math.max(0,flat),.03,.18))*(1-MathUtils.smoothstep(bend,.015,.11))*(1-MathUtils.smoothstep(slope,.55,.8));
    if(Number.isFinite(weight)&&weight>1e-6&&slope>1e-6){
     this.normal.set(-dx,1,-dz).normalize();this.slopeRotation.setFromUnitVectors(this.up,this.normal).slerp(this.identity,1-weight);
     // The authored foot node includes the entire lower leg. Rotating it as a
     // rigid piece pulls the top away from the torso. Keep its vertical axis
     // fixed and tilt the horizontal sole plane instead (a small shear).
     foot.node.getWorldQuaternion(this.parentRotation);this.localRotation.copy(this.parentRotation).invert().multiply(this.slopeRotation).multiply(this.parentRotation);
     this.localUp.copy(this.up).applyQuaternion(this.parentRotation.invert());
     this.upCorrection.copy(this.localUp).sub(this.point.copy(this.localUp).applyQuaternion(this.localRotation));
     const e=this.tiltMatrix.makeRotationFromQuaternion(this.localRotation).elements,u=this.localUp,v=this.upCorrection;
     e[0]+=v.x*u.x;e[4]+=v.x*u.y;e[8]+=v.x*u.z;e[1]+=v.y*u.x;e[5]+=v.y*u.y;e[9]+=v.y*u.z;e[2]+=v.z*u.x;e[6]+=v.z*u.y;e[10]+=v.z*u.z;
     foot.node.updateMatrix();foot.node.matrix.multiply(this.tiltMatrix);foot.node.matrixAutoUpdate=false;foot.node.updateWorldMatrix(false,true);clearance=Infinity;
     for(const p of points){this.point.copy(p).applyMatrix4(foot.node.matrixWorld);clearance=Math.min(clearance,this.point.y-height(this.point.x,this.point.z));}
    }
   }
   // Preserve the animation's authored lift while making its lowest sole point
   // touch the local slope when the authored foot is planted.
   const lift=Math.max(0,flat)-clearance;
   if(!Number.isFinite(lift))continue;
   foot.node.getWorldPosition(this.target);this.target.y+=lift;
   foot.node.position.copy(foot.node.parent!.worldToLocal(this.target));
   if(!foot.node.matrixAutoUpdate)foot.node.matrix.setPosition(foot.node.position);
   foot.node.updateWorldMatrix(false,true);
  }
 }
}
