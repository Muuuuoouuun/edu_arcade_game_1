import {Group,Mesh,Object3D} from 'three';
import {heightAt,type SquadMember} from './engine.ts';

/** Visual gait of rigid support soldiers, measured in world distance. */
export const SQUAD_STRIDE=1.2,SQUAD_SETTLE=.16,SQUAD_SHOT=.18;
// The authored muzzle is 1.32 forward and recoils .16 at the instant of firing.
export const SQUAD_MUZZLE={forward:1.32,recoil:.16,height:1.33};
const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
function foot(phase:number){
 const p=((phase%1)+1)%1;
 // During stance the sole moves backwards at the same rate as its carrier.
 return p<.5?{z:.3-1.2*p,lift:0}:{z:-.3+1.2*(p-.5),lift:.20*Math.sin(Math.PI*(p-.5)*2)};
}

/** Reject damaged or partial downloads before replacing the usable fallback. */
export function validSquadModel(model:Object3D){
 for(const name of ['squad-body','squad-left-foot','squad-right-foot','squad-weapon']){
  const part=model.getObjectByName(name);if(!part)return false;let visible=false;
  part.traverse(o=>{if(o instanceof Mesh&&o.geometry.getAttribute('position')?.count>0)visible=true;});
  if(!visible)return false;
 }
 for(const [name,x] of [['squad-left-foot',-.28],['squad-right-foot',.28]] as const){const p=model.getObjectByName(name)!.position;if(Math.abs(p.x-x)>.001||Math.abs(p.y-.3)>.001||Math.abs(p.z)>.001)return false;}
 const mount=model.getObjectByName('squad-weapon')!,weapon=mount.position,socket=mount.getObjectByName('squad-muzzle');
 return !!socket&&socket.parent===mount&&Math.abs(socket.position.x)<.001&&Math.abs(socket.position.y-SQUAD_MUZZLE.height)<.001&&Math.abs(socket.position.z-(SQUAD_MUZZLE.forward-.2))<.001&&Math.abs(weapon.z-.2)<.001&&Math.abs(weapon.x)<.001&&Math.abs(weapon.y)<.001;
}

export class SquadView {
 readonly root:Group;readonly index:number;private legs:Object3D[];private weapon:Object3D;
 constructor(root:Group,index:number){
  this.root=root;this.index=index;
  const left=root.getObjectByName('squad-left-foot'),right=root.getObjectByName('squad-right-foot'),weapon=root.getObjectByName('squad-weapon');
  if(!left||!right||!weapon)throw new Error('Incomplete support soldier');
  this.legs=[left,right];this.weapon=weapon;
 }
 get feet(){return this.legs.map(o=>o.position.toArray());}
 update(unit:SquadMember,time:number,reduced:boolean){
  const age=time-(unit.shotAt??-Infinity),shooting=age>=0&&age<SQUAD_SHOT;
  const heading=shooting?(unit.shotHeading??unit.heading??0):(unit.heading??0);
  const base=heightAt(unit.x,unit.z),phase=(unit.walkDistance??0)/SQUAD_STRIDE+this.index*.17;
  const weight=reduced?0:unit.moving?1:1-smooth((unit.restTime??SQUAD_SETTLE)/SQUAD_SETTLE);
  this.root.position.set(unit.x,base,unit.z);this.root.rotation.y=heading;
  for(let i=0;i<2;i++){
   const leg=this.legs[i],pose=foot(phase+i*.5),x=i===0?-.28:.28,z=pose.z*weight,lift=pose.lift*weight;
   // Sample the sole and both sides of sharp bridge edges; floating-point
   // rounding at an exact edge must not lower the foot through the deck.
   let high=-Infinity;
   for(const dx of [-.17,0,.17])for(const dz of [-.20,0,.20]){
    const lx=x+dx,lz=z+dz,c=Math.cos(heading),s=Math.sin(heading);
    const wx=unit.x+lx*c+lz*s,wz=unit.z-lx*s+lz*c;
    for(const ex of [-.00001,.00001])for(const ez of [-.00001,.00001])high=Math.max(high,heightAt(wx+ex,wz+ez));
   }
   leg.position.set(x,.3+high-base+lift,z);
  }
  // The instant shot owns the effect and damage; recoil is presentation only.
  this.weapon.position.z=.2-(shooting&&!reduced?.16*(1-age/SQUAD_SHOT):0);
 }
}
