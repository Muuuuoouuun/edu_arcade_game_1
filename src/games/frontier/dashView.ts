import {BoxGeometry,Group,InstancedMesh,MeshBasicMaterial,Object3D,OctahedronGeometry,Vector3} from 'three';
import {heightAt,walkable} from './engine.ts';
import {DASH_VISUAL,type DashTrace} from './dash.ts';

/** Bounded, shared 3D wind and ground chips; never a separate WebGL renderer. */
export class DashView {
 readonly root=new Group();readonly streak:InstancedMesh;readonly chips:InstancedMesh;
 private readonly pose=new Object3D();private readonly a=new Vector3();private readonly b=new Vector3();private readonly forward=new Vector3(0,0,1);
 constructor(){
  this.streak=new InstancedMesh(new BoxGeometry(1,1,1),new MeshBasicMaterial({color:'#4ad6b5',transparent:true,opacity:.9,depthWrite:false}),DASH_VISUAL.segments);
  this.chips=new InstancedMesh(new OctahedronGeometry(1,0),new MeshBasicMaterial({color:'#e3d2a3',transparent:true,opacity:.9,depthWrite:false}),DASH_VISUAL.chips);
  this.streak.count=this.chips.count=0;this.streak.frustumCulled=this.chips.frustumCulled=false;this.root.add(this.streak,this.chips);
 }
 update(trace:DashTrace|undefined,now:number,reduced:boolean){
  this.streak.count=this.chips.count=0;const age=trace?now-trace.at:Infinity;
  if(!trace||reduced||age<0||age>=DASH_VISUAL.duration){this.root.visible=false;return;}
  const dx=trace.to.x-trace.from.x,dz=trace.to.z-trace.from.z,d=Math.hypot(dx,dz);if(d<1e-6){this.root.visible=false;return;}
  this.root.visible=true;const t=age/DASH_VISUAL.duration,p=this.pose;
  const streakMaterial=this.streak.material as MeshBasicMaterial,chipMaterial=this.chips.material as MeshBasicMaterial;streakMaterial.opacity=.9*(1-t);chipMaterial.opacity=.9*(1-t);
  const steps=DASH_VISUAL.segments/2;
  for(let i=0;i<steps;i++)for(const side of [-1.35,1.35]){
   const u=i/steps,v=(i+1)/steps,ox=-dz/d*side,oz=dx/d*side;
   this.a.set(trace.from.x+dx*u+ox,0,trace.from.z+dz*u+oz);this.b.set(trace.from.x+dx*v+ox,0,trace.from.z+dz*v+oz);
   // The wind may sit next to the route, but never draw across a blocked bank.
   if(!walkable(this.a)||!walkable(this.b))continue;
   this.a.y=heightAt(this.a.x,this.a.z)+.14;this.b.y=heightAt(this.b.x,this.b.z)+.14;
   if(Math.abs(this.a.y-this.b.y)>.9)continue;
   p.position.copy(this.a).add(this.b).multiplyScalar(.5);this.b.sub(this.a);const len=this.b.length();p.quaternion.setFromUnitVectors(this.forward,this.b.normalize());p.scale.set(.045+.26*Math.sin(Math.PI*(u+v)*.5),.065,len*.96);p.updateMatrix();this.streak.setMatrixAt(this.streak.count++,p.matrix);
  }
  for(let i=0;i<DASH_VISUAL.chips;i++){
   const u=.1+i*.14,side=((i%3)-1)*1.05*(.5+t),x=trace.from.x+dx*u-dz/d*side,z=trace.from.z+dz*u+dx/d*side;if(!walkable({x,z}))continue;
   const lift=.10+.7*4*t*(1-t),size=(.22+(i%3)*.04)*(1-t*.55);p.position.set(x,heightAt(x,z)+lift,z);p.rotation.set(i+t*5,i*.6+t*3,i*.3);p.scale.set(size,size*.7,size);p.updateMatrix();this.chips.setMatrixAt(this.chips.count++,p.matrix);
  }
  this.streak.instanceMatrix.needsUpdate=this.chips.instanceMatrix.needsUpdate=true;
 }
 dispose(){for(const mesh of [this.streak,this.chips]){mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();mesh.dispose();}this.root.clear();}
}
