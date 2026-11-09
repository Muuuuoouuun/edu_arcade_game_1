import {BufferGeometry,Float32BufferAttribute,CylinderGeometry,DoubleSide,Group,InstancedMesh,Mesh,MeshBasicMaterial,MeshStandardMaterial,Object3D,OctahedronGeometry,RingGeometry,TorusGeometry,Vector3} from 'three';
import {heightAt,type Frontier} from './engine.ts';
import {heroRingMatrix} from './heroEffects.ts';
import {CROSSING} from './terrainView.ts';
type Effect=Frontier['effects'][number];
const LIMIT=128,CHIPS=8,SEGMENTS=64;
/** Project the expanding ring onto the visible surface; skip steep breaks rather than draw vertical streaks. */
export function shockwaveSurface(x:number,z:number){
 if(x>CROSSING.left&&x<CROSSING.right&&Math.abs(z)>2.8)return CROSSING.water;
 return heightAt(x,z);
}
export function createShockwaveGeometry(){
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(new Float32Array(SEGMENTS*4*3),3));g.setIndex(Array.from({length:SEGMENTS},(_,i)=>[4*i,4*i+1,4*i+2,4*i+1,4*i+3,4*i+2]).flat());return g;
}
export function projectShockwave(g:BufferGeometry,center:{x:number;z:number},scale:number){
 const a=g.getAttribute('position'),indices=g.getIndex()!;
 for(let i=0;i<SEGMENTS;i++){
  let lo=Infinity,hi=-Infinity,valid=true;
  for(let end=0;end<2;end++)for(let side=0;side<2;side++){
   const angle=(i+end)*2*Math.PI/SEGMENTS,r=(side?8:7.6)*scale,x=center.x+Math.cos(angle)*r,z=center.z+Math.sin(angle)*r;
   const y=shockwaveSurface(x,z)+.09;lo=Math.min(lo,y);hi=Math.max(hi,y);valid&&=Math.abs(x)<=32&&Math.abs(z)<=32;
   a.setXYZ(i*4+end*2+side,x,y,z);
  }
  // Do not bridge water/land and deck discontinuities with spurious walls.
  const base=i*4,visible=valid&&hi-lo<.9;
  indices.setX(i*6,base);indices.setX(i*6+1,visible?base+1:base);indices.setX(i*6+2,visible?base+2:base);
  indices.setX(i*6+3,visible?base+1:base);indices.setX(i*6+4,visible?base+3:base);indices.setX(i*6+5,visible?base+2:base);
 }
 a.needsUpdate=true;indices.needsUpdate=true;
}
/** Cosmetic debris is sampled from simulation age; no wall clock, random state or damage. */
export function contactChip(fx:Effect,index:number){
 const t=Math.max(0,Math.min(1,1-fx.life/.18)),shock=fx.kind==='shockwave';
 const angle=index*Math.PI*2/CHIPS+(fx.id%19)*.37;
 const r=shock?.5+6.8*t:.2+2.1*t;
 const x=fx.to.x+Math.cos(angle)*r,z=fx.to.z+Math.sin(angle)*r;
 const y=Math.max(heightAt(x,z)+.08,heightAt(fx.to.x,fx.to.z)+.12+4.4*t*(1-t));
 return{x,y,z,angle:angle+t*4,size:(.24+(index%3)*.045)*(1-t*.65)};
}
/** Stylized ballistic fragments: contact origin, incoming horizontal momentum and gravity. */
export function boltSplinter(fx:Effect,index:number){
 const age=Math.max(0,Math.min(.46,.46-fx.life));let dx=fx.to.x-fx.from.x,dz=fx.to.z-fx.from.z;const len=Math.hypot(dx,dz);
 if(len>1e-6){dx/=len;dz/=len;}else{const a=(fx.id%16)*Math.PI/8;dx=Math.cos(a);dz=Math.sin(a);}
 const forward=4.5+(index%3)*.8,side=((index%4)-1.5)*1.25;
 const x=fx.to.x+(dx*forward-dz*side)*age,z=fx.to.z+(dz*forward+dx*side)*age;
 const start=heightAt(fx.to.x,fx.to.z)+1.1,ground=shockwaveSurface(x,z)+.06;
 const y=Math.max(ground,start+(4.5+(index%3)*.45)*age-19*age*age);
 return{x,y,z,angle:Math.atan2(dx,dz)+age*(5+index),size:.32+(index%3)*.045};
}
/** One bounded pool in the existing battlefield; GPU resources survive between impacts. */
export class EffectsView{
 readonly root=new Group();readonly chips:InstancedMesh;impactChipCount=0;
 private slots:Mesh<BufferGeometry,MeshBasicMaterial>[]=[];private projected=new Map<number,BufferGeometry>();
 private shapes:Record<Effect['kind'],BufferGeometry>;
 private pose=new Object3D();private a=new Vector3();private b=new Vector3();private up=new Vector3(0,1,0);
 private disposed=false;
 constructor(){
  const ray=new CylinderGeometry(.06,.06,1,5);
  this.shapes={hammer:new RingGeometry(.3,.65,32),shockwave:new RingGeometry(7.6,8,32),club:new RingGeometry(.28,.48,16),impact:new OctahedronGeometry(.5,0),skill:new TorusGeometry(8,.10,4,36),shot:ray,hit:ray};
  this.chips=new InstancedMesh(new OctahedronGeometry(1,0),new MeshStandardMaterial({color:'#8f7552',roughness:1}),LIMIT*CHIPS);
  this.chips.count=0;this.chips.frustumCulled=false;this.chips.receiveShadow=true;this.root.add(this.chips);
 }
 get allocated(){return this.slots.length;}
 update(effects:Effect[],reduced:boolean){
  if(this.disposed)return;
  for(const m of this.slots)m.visible=false;this.chips.count=0;this.impactChipCount=0;let used=0;
  for(const fx of effects.slice(-LIMIT)){
   if(fx.life<=0)continue;
   let m=this.slots[used++];if(!m){m=new Mesh(this.shapes[fx.kind],new MeshBasicMaterial({transparent:true,depthWrite:false,side:DoubleSide}));m.matrixAutoUpdate=false;this.slots.push(m);this.root.add(m);}
   m.visible=true;m.frustumCulled=true;m.geometry=this.shapes[fx.kind];m.material.opacity=Math.max(0,Math.min(1,fx.life/.18));
   const p=this.pose;p.position.set(0,0,0);p.rotation.set(0,0,0);p.scale.set(1,1,1);
   this.a.set(fx.from.x,heightAt(fx.from.x,fx.from.z)+1.7,fx.from.z);this.b.set(fx.to.x,heightAt(fx.to.x,fx.to.z)+1.5,fx.to.z);
   if(fx.kind==='hammer'||fx.kind==='shockwave'){
    const shock=fx.kind==='shockwave';m.material.color.set(shock?'#72f4d1':'#ffce72');
    if(shock){let g=this.projected.get(used-1);if(!g){g=createShockwaveGeometry();this.projected.set(used-1,g);}projectShockwave(g,fx.to,reduced?1:.85+(1-fx.life/.18)*.15);m.geometry=g;m.matrix.identity();m.frustumCulled=false;}
    else m.matrix.copy(heroRingMatrix(fx.to,reduced?1:1+(1-fx.life/.18)*1.15,.09));
    if(!reduced)for(let i=0;i<CHIPS;i++){const c=contactChip(fx,i);p.position.set(c.x,c.y,c.z);p.rotation.set(c.angle,c.angle*.7,0);p.scale.set(c.size,c.size*.65,c.size);p.updateMatrix();this.chips.setMatrixAt(this.chips.count++,p.matrix);}
    continue;
   }
   if(fx.kind==='club'){m.material.color.set('#dfb36c');p.rotation.x=-Math.PI/2;p.position.set(fx.to.x,heightAt(fx.to.x,fx.to.z)+.08,fx.to.z);p.scale.setScalar(reduced?1:1+(1-fx.life/.18)*2);}
   else if(fx.kind==='impact'){
    const age=Math.max(0,.46-fx.life);m.material.color.set('#ffdf8a');m.material.opacity=Math.max(0,1-age/.18);m.visible=m.material.opacity>0;p.position.set(fx.to.x,heightAt(fx.to.x,fx.to.z)+1.1,fx.to.z);p.scale.setScalar(reduced?1:1+Math.min(1,age/.18)*1.4);
    if(!reduced)for(let i=0;i<CHIPS;i++){const c=boltSplinter(fx,i);p.position.set(c.x,c.y,c.z);p.rotation.set(c.angle,c.angle*.7,c.angle*.3);p.scale.set(c.size*.65,c.size*1.8,c.size*.65);p.updateMatrix();this.chips.setMatrixAt(this.chips.count++,p.matrix);this.impactChipCount++;}
    // Restore the flash transform after the instanced fragments.
    p.position.set(fx.to.x,heightAt(fx.to.x,fx.to.z)+1.1,fx.to.z);p.rotation.set(0,0,0);p.scale.setScalar(reduced?1:1+Math.min(1,age/.18)*1.4);
   }
   else if(fx.kind==='skill'){m.material.color.set('#72f4d1');m.material.opacity=.65;p.rotation.x=Math.PI/2;p.position.copy(this.a);p.position.y-=1.4;}
   else{m.material.color.set(fx.kind==='hit'?'#ff867d':'#ffe79b');m.material.opacity=1;p.position.copy(this.a).add(this.b).multiplyScalar(.5);this.b.sub(this.a);p.scale.y=Math.max(.1,this.b.length());if(this.b.lengthSq()>1e-8)p.quaternion.setFromUnitVectors(this.up,this.b.normalize());}
   p.updateMatrix();m.matrix.copy(p.matrix);
  }
  this.chips.visible=this.chips.count>0;this.chips.instanceMatrix.needsUpdate=this.chips.count>0;
 }
 dispose(){if(this.disposed)return;this.disposed=true;for(const g of new Set(Object.values(this.shapes)))g.dispose();for(const g of this.projected.values())g.dispose();for(const m of this.slots)m.material.dispose();this.chips.geometry.dispose();(this.chips.material as MeshStandardMaterial).dispose();this.chips.dispose();this.root.clear();}
}
