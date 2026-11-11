import {AlwaysStencilFunc,KeepStencilOp,Material,Mesh,Object3D,ReplaceStencilOp} from 'three';

// Reserve one bit for the currently visible hero. Other stencil bits stay untouched.
export const HERO_STENCIL_BIT=1;
type StencilState=Pick<Material,'stencilWrite'|'stencilWriteMask'|'stencilFunc'|'stencilRef'|'stencilFuncMask'|'stencilFail'|'stencilZFail'|'stencilZPass'>;

/** Mark visible opaque hero fragments after other opaque scenery has written depth. */
export class HeroStencilMask{
 private children:Object3D[]=[];private materials=new Map<Material,StencilState>();private orders=new Map<Mesh,number>();
 sync(hero:Object3D,enabled:boolean){
  if(!enabled){this.restore();return;}
  if(this.children.length===hero.children.length&&this.children.every((child,i)=>hero.children[i]===child))return;
  this.restore();this.children=[...hero.children];
  hero.traverse(node=>{
   if(!(node instanceof Mesh))return;
   const materials=(Array.isArray(node.material)?node.material:[node.material]).filter(m=>m.visible&&!m.transparent&&m.depthWrite&&m.colorWrite);
   if(!materials.length)return;
   this.orders.set(node,node.renderOrder);node.renderOrder=Math.max(1,node.renderOrder);
   for(const material of materials){
    if(this.materials.has(material))continue;
    this.materials.set(material,{stencilWrite:material.stencilWrite,stencilWriteMask:material.stencilWriteMask,stencilFunc:material.stencilFunc,stencilRef:material.stencilRef,stencilFuncMask:material.stencilFuncMask,stencilFail:material.stencilFail,stencilZFail:material.stencilZFail,stencilZPass:material.stencilZPass});
    material.stencilWrite=true;material.stencilWriteMask=HERO_STENCIL_BIT;material.stencilFunc=AlwaysStencilFunc;material.stencilRef=HERO_STENCIL_BIT;material.stencilFuncMask=HERO_STENCIL_BIT;material.stencilFail=KeepStencilOp;material.stencilZFail=KeepStencilOp;material.stencilZPass=ReplaceStencilOp;
   }
  });
 }
 restore(){for(const [material,state]of this.materials)Object.assign(material,state);for(const [mesh,order]of this.orders)mesh.renderOrder=order;this.materials.clear();this.orders.clear();this.children=[];}
 dispose(){this.restore();}
}
