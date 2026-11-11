import {Camera,EqualStencilFunc,GreaterDepth,Group,KeepStencilOp,Mesh,MeshBasicMaterial,Object3D,Raycaster,Vector3} from 'three';
import type {Enemy} from './engine.ts';
import type {EnemyVisual} from './woodView.ts';
import {HERO_STENCIL_BIT} from './heroStencil.ts';

/** The earliest uncommitted bite takes priority; a recovery never hides a new warning. */
export function selectBiteThreat(enemies:readonly Enemy[]){
 let chosen:Enemy|undefined;
 for(const enemy of enemies){
  const attack=enemy.attack;
  if(enemy.hp<=0||!attack||attack.target!=='hero')continue;
  if(!chosen||(!attack.hit&&chosen.attack!.hit)||(attack.hit===chosen.attack!.hit&&attack.time>chosen.attack!.time))chosen=enemy;
 }
 return chosen;
}

/** Reveal occluded fragments of the animated wolf head in the existing battlefield. */
export class BiteReveal{
 readonly root=new Group();
 private material=new MeshBasicMaterial({color:'#a7e7f0',transparent:true,opacity:.72,depthTest:true,depthWrite:false,depthFunc:GreaterDepth,fog:false,stencilWrite:true,stencilWriteMask:0,stencilFunc:EqualStencilFunc,stencilRef:HERO_STENCIL_BIT,stencilFuncMask:HERO_STENCIL_BIT,stencilFail:KeepStencilOp,stencilZFail:KeepStencilOp,stencilZPass:KeepStencilOp});
 private parts:{name:string;mesh:Mesh}[]=[];
 private ray=new Raycaster();private mouth=new Vector3();private dir=new Vector3();private disposed=false;
 constructor(template:Object3D){
  for(const name of ['wolf-surface-head','wolf-surface-jaw']){
   const source=template.getObjectByName(name);
   if(!(source instanceof Mesh))continue;
   // Geometry belongs to the shared wolf model; only this material is ours.
   const mesh=new Mesh(source.geometry,this.material);mesh.name=name;
   mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;mesh.renderOrder=1000;
   this.root.add(mesh);this.parts.push({name,mesh});
  }
  this.root.visible=false;
 }
 get visible(){return this.root.visible;}
 update(camera:Camera|null,hero:Object3D,enemy:Enemy|undefined,view:EnemyVisual|undefined){
  this.root.visible=false;
  if(this.disposed||!camera||!enemy||!view||this.parts.length!==2)return;
  const jaw=view.root.getObjectByName('jaw');if(!jaw)return;
  jaw.localToWorld(this.mouth.set(.32,0,0));
  this.dir.copy(this.mouth).sub(camera.position);const distance=this.dir.length();if(distance<.1)return;
  hero.updateWorldMatrix(true,true);this.ray.set(camera.position,this.dir.multiplyScalar(1/distance));this.ray.far=distance-.03;
  if(!this.ray.intersectObject(hero,true).length)return;
  for(const part of this.parts){
   const surface=view.surfaces.find(mesh=>mesh.name===part.name);if(!surface)return;
   part.mesh.matrix.copy(surface.matrixWorld);part.mesh.matrixWorldNeedsUpdate=true;
  }
  this.root.visible=true;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.root.visible=false;this.material.dispose();this.root.clear();}
}
