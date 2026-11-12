import {BufferAttribute,BufferGeometry,DynamicDrawUsage,Float32BufferAttribute} from 'three';
import {shockwaveSurface} from './effectsView.ts';
import {WOOD_ATTACK} from './woodAttack.ts';
import type {Enemy} from './engine.ts';

const SEGMENTS=24,ANGLE_SPLITS=2,RADIUS_SPLITS=4,MAX_PER_ENEMY=SEGMENTS*ANGLE_SPLITS*RADIUS_SPLITS,INNER=.55;
/** One reusable world-space buffer for all visible committed enemy attack warnings. */
export function createWoodWarningGeometry(capacity:number){
 const quads=capacity*MAX_PER_ENEMY,vertices=quads*4,g=new BufferGeometry();
 g.userData.warningCapacity=capacity;
 g.setAttribute('position',new Float32BufferAttribute(new Float32Array(vertices*3),3).setUsage(DynamicDrawUsage));
 const indices=vertices>65535?new Uint32Array(quads*6):new Uint16Array(quads*6);
 for(let i=0;i<quads;i++){const v=i*4,n=i*6;indices[n]=v;indices[n+1]=v+1;indices[n+2]=v+2;indices[n+3]=v+1;indices[n+4]=v+3;indices[n+5]=v+2;}
 g.setIndex(new BufferAttribute(indices,1));g.setDrawRange(0,0);return g;
}
/** Conform warnings to the visible ground; refine discontinuities without drawing vertical walls. */
export function projectWoodWarnings(g:BufferGeometry,enemies:readonly Enemy[]){
 const positions=g.getAttribute('position') as Float32BufferAttribute;let count=0;
 if(enemies.length>(g.userData.warningCapacity as number))throw Error('Wood warning capacity exceeded');
 for(const e of enemies){const attack=e.attack;if(!attack||attack.hit)continue;
  const quad=(a0:number,a1:number,r0:number,r1:number,split:boolean)=>{
   const c0=Math.sin(a0),s0=Math.cos(a0),c1=Math.sin(a1),s1=Math.cos(a1);
   const x0=e.x+c0*r0,z0=e.z+s0*r0,x1=e.x+c0*r1,z1=e.z+s0*r1;
   const x2=e.x+c1*r0,z2=e.z+s1*r0,x3=e.x+c1*r1,z3=e.z+s1*r1;
   const y0=shockwaveSurface(x0,z0)+.06,y1=shockwaveSurface(x1,z1)+.06,y2=shockwaveSurface(x2,z2)+.06,y3=shockwaveSurface(x3,z3)+.06;
   // A concave shoreline can pass through the cell even when all four corners agree.
   const y4=shockwaveSurface((x0+x1)*.5,(z0+z1)*.5)+.06,y5=shockwaveSurface((x0+x2)*.5,(z0+z2)*.5)+.06;
   const y6=shockwaveSurface((x1+x3)*.5,(z1+z3)*.5)+.06,y7=shockwaveSurface((x2+x3)*.5,(z2+z3)*.5)+.06;
   const ym=shockwaveSurface((x0+x1+x2+x3)*.25,(z0+z1+z2+z3)*.25)+.06;
   const valid=Math.max(Math.abs(x0),Math.abs(z0),Math.abs(x1),Math.abs(z1),Math.abs(x2),Math.abs(z2),Math.abs(x3),Math.abs(z3))<=32;
   if(valid&&Math.max(y0,y1,y2,y3,y4,y5,y6,y7,ym)-Math.min(y0,y1,y2,y3,y4,y5,y6,y7,ym)<.9){const n=count++*4;positions.setXYZ(n,x0,y0,z0);positions.setXYZ(n+1,x1,y1,z1);positions.setXYZ(n+2,x2,y2,z2);positions.setXYZ(n+3,x3,y3,z3);return;}
   if(split)for(let u=0;u<ANGLE_SPLITS;u++)for(let v=0;v<RADIUS_SPLITS;v++){
    const t0=u/ANGLE_SPLITS,t1=(u+1)/ANGLE_SPLITS,q0=v/RADIUS_SPLITS,q1=(v+1)/RADIUS_SPLITS;
    quad(a0+(a1-a0)*t0,a0+(a1-a0)*t1,r0+(r1-r0)*q0,r0+(r1-r0)*q1,false);
   }
  };
  for(let i=0;i<SEGMENTS;i++){const a=attack.heading-WOOD_ATTACK.halfArc+i*2*WOOD_ATTACK.halfArc/SEGMENTS,b=attack.heading-WOOD_ATTACK.halfArc+(i+1)*2*WOOD_ATTACK.halfArc/SEGMENTS;quad(a,b,INNER,WOOD_ATTACK.hitReach,true);}
 }
 g.setDrawRange(0,count*6);if(count){positions.clearUpdateRanges();positions.addUpdateRange(0,count*4*3);positions.needsUpdate=true;}
}
