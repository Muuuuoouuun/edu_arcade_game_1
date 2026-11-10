import {Group,Mesh} from 'three';
import {heightAt,type SquadMember} from './engine.ts';

/** Visual gait of the existing rigid support soldiers, measured in world distance. */
export const SQUAD_STRIDE=1.2,SQUAD_SETTLE=.16,SQUAD_SHOT=.18;
const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
function foot(phase:number){
 const p=((phase%1)+1)%1;
 // During stance the sole moves backwards at the same rate as its carrier.
 return p<.5?{z:.3-1.2*p,lift:0}:{z:-.3+1.2*(p-.5),lift:.20*Math.sin(Math.PI*(p-.5)*2)};
}

export class SquadView {
 readonly root:Group;readonly index:number;private legs:Mesh[];private weapon:Mesh;
 constructor(root:Group,index:number){
  this.root=root;this.index=index;
  const left=root.getObjectByName('squad-left-foot'),right=root.getObjectByName('squad-right-foot'),weapon=root.getObjectByName('squad-weapon');
  if(!(left instanceof Mesh)||!(right instanceof Mesh)||!(weapon instanceof Mesh))throw new Error('Incomplete support soldier');
  this.legs=[left,right];this.weapon=weapon;
 }
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
