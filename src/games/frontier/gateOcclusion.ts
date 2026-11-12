import * as THREE from 'three';

type MaskPatch={
 material:THREE.Material;
 hook:THREE.Material['onBeforeCompile'];
 cacheKey:THREE.Material['customProgramCacheKey'];
 uniform:{value:THREE.Vector4};
 depth:{value:number};
};

/** Reveal the hero through only the pixels of gate or terrain surfaces covering them. */
export class GateOcclusion {
 private ray=new THREE.Raycaster();
 private direction=new THREE.Vector3();
 private sample=new THREE.Vector3();
 private right=new THREE.Vector3();
 private lastRight=new THREE.Vector3(Infinity,Infinity,Infinity);
 private lastEye=new THREE.Vector3(Infinity,Infinity,Infinity);
 private lastTarget=new THREE.Vector3(Infinity,Infinity,Infinity);
 private bounds=new THREE.Box3();
 private boundsDirty=true;
 private patches=new Map<THREE.Material,MaskPatch>();
 private selected=new Set<THREE.Material>();
 private center=new THREE.Vector3();
 private side=new THREE.Vector3();
 private top=new THREE.Vector3();
 private defaultViewport=new THREE.Vector2(844,390);
 private root:THREE.Object3D;
 private depthLimited:boolean;
 private spatial:boolean;
 private proxy?:THREE.Group;
 constructor(root:THREE.Object3D,depthLimited=false,spatial=false){this.root=root;this.depthLimited=depthLimited;this.spatial=spatial;}
 get count(){return this.selected.size;}
 /** An asynchronous asset load can replace fallback children in the same root. */
 invalidate(){this.restore();this.clearProxy();this.boundsDirty=true;this.lastEye.set(Infinity,Infinity,Infinity);this.lastTarget.set(Infinity,Infinity,Infinity);}
 /** Build the static terrain search index during loading rather than on the first edge encounter. */
 prepare(){if(!this.boundsDirty)return;this.root.updateWorldMatrix(true,true);this.bounds.setFromObject(this.root);this.buildProxy();this.boundsDirty=false;}
 private clearProxy(){this.proxy?.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.proxy=undefined;}
 /** Static terrain is one large surface. Partition its indices only; the visible mesh and input stay untouched. */
 private buildProxy(){
  if(!this.spatial)return;
  const meshes:THREE.Mesh[]=[];this.root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
  if(meshes.length!==1)return;
  const mesh=meshes[0],geo=mesh.geometry,pos=geo.getAttribute('position'),index=geo.index;
  if(!pos||Array.isArray(mesh.material)||mesh instanceof THREE.SkinnedMesh||mesh instanceof THREE.InstancedMesh)return;
  const box=new THREE.Box3().setFromObject(mesh),extent=box.getSize(new THREE.Vector3()),world=new Float32Array(pos.count*2),p=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);world[i*2]=p.x;world[i*2+1]=p.z;}
  const bins=new Map<number,number[]>(),size=8,n=index?.count??pos.count;
  const at=(i:number)=>index?index.getX(i):i;
  for(let i=0;i+2<n;i+=3){
   const a=at(i),b=at(i+1),c=at(i+2),x=(world[a*2]+world[b*2]+world[c*2])/3,z=(world[a*2+1]+world[b*2+1]+world[c*2+1])/3;
   const ix=Math.max(0,Math.min(size-1,Math.floor((x-box.min.x)/Math.max(extent.x,1e-6)*size)));
   const iz=Math.max(0,Math.min(size-1,Math.floor((z-box.min.z)/Math.max(extent.z,1e-6)*size))),key=iz*size+ix;
   const bin=bins.get(key)??[];bin.push(a,b,c);bins.set(key,bin);
  }
  const proxy=new THREE.Group();for(const indices of bins.values()){
   const part=new THREE.BufferGeometry();part.setAttribute('position',pos);part.setIndex(indices);
   const bounds=new THREE.Box3();for(const i of indices)bounds.expandByPoint(p.fromBufferAttribute(pos,i));
   part.boundingBox=bounds;part.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
   const piece=new THREE.Mesh(part,mesh.material);piece.matrixAutoUpdate=false;piece.matrix.copy(mesh.matrixWorld);proxy.add(piece);
  }
  proxy.updateMatrixWorld(true);this.proxy=proxy;
 }
 private restore(){
  for(const {material,hook,cacheKey,uniform} of this.patches.values()){
   uniform.value.set(0,0,0,0);material.onBeforeCompile=hook;material.customProgramCacheKey=cacheKey;material.needsUpdate=true;
  }
  this.patches.clear();this.selected.clear();
 }
 private patch(material:THREE.Material){
  const existing=this.patches.get(material);if(existing)return existing;
  const hook=material.onBeforeCompile,cacheKey=material.customProgramCacheKey,key=cacheKey.call(material),uniform={value:new THREE.Vector4()},depth={value:1};
  const patch={material,hook,cacheKey,uniform,depth};this.patches.set(material,patch);
  material.onBeforeCompile=(shader,renderer)=>{
   hook.call(material,shader,renderer);
   const include='#include <clipping_planes_fragment>',main='void main() {';
   // If a future material does not use Three's standard fragment layout,
   // leave its shader intact instead of emitting an undeclared uniform.
   if(!shader.fragmentShader.includes(include)||!shader.fragmentShader.includes(main))return;
   shader.uniforms.arcanaGateMask=uniform;
   shader.uniforms.arcanaGateDepth=depth;
   shader.fragmentShader=shader.fragmentShader.replace(main,'uniform vec4 arcanaGateMask;\nuniform float arcanaGateDepth;\nvoid main() {').replace(include,`${include}
    if (arcanaGateMask.z > 0.0 && arcanaGateMask.w > 0.0 && gl_FragCoord.z < arcanaGateDepth) {
     vec2 arcanaOffset = (gl_FragCoord.xy - arcanaGateMask.xy) / arcanaGateMask.zw;
     float arcanaDistance = length(arcanaOffset);
     if (arcanaDistance < 1.0) {
      float arcanaEdge = smoothstep(0.78, 1.0, arcanaDistance);
      float arcanaNoise = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
      if (arcanaNoise > arcanaEdge) discard;
     }
    }`);
  };
  material.customProgramCacheKey=()=>`${key}|arcana-gate-local-mask-v2`;
  material.needsUpdate=true;return patch;
 }
 update(camera:THREE.Camera|null,target?:THREE.Vector3,viewport:THREE.Vector2=this.defaultViewport){
  if(!camera||!target){this.selected.clear();for(const patch of this.patches.values())patch.uniform.value.set(0,0,0,0);this.lastEye.set(Infinity,Infinity,Infinity);return;}
  this.right.setFromMatrixColumn(camera.matrixWorld,0).normalize();
  const changed=this.lastEye.distanceToSquared(camera.position)>=1e-8||this.lastTarget.distanceToSquared(target)>=1e-8||this.lastRight.distanceToSquared(this.right)>=1e-8||this.boundsDirty;
  if(changed){
   this.lastEye.copy(camera.position);this.lastTarget.copy(target);this.lastRight.copy(this.right);
   this.root.updateWorldMatrix(true,true);
   if(this.boundsDirty)this.prepare();
   const selected=new Set<THREE.Material>();
   for(const [horizontal,vertical] of [[0,0],[-.65,0],[.65,0],[0,.7],[0,-.7]]){
    this.sample.copy(target).addScaledVector(this.right,horizontal);this.sample.y+=vertical;
    this.direction.copy(this.sample).sub(camera.position);const distance=this.direction.length();
    if(distance>.15){
     this.ray.set(camera.position,this.direction.multiplyScalar(1/distance));this.ray.far=distance-.15;
     for(const hit of this.ray.ray.intersectsBox(this.bounds)?this.ray.intersectObject(this.proxy??this.root,true):[]){
      const mesh=hit.object;if(!(mesh instanceof THREE.Mesh))continue;
      const material=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
      if(material)selected.add(material);
     }
    }
   }
   this.selected=selected;
   for(const material of selected)this.patch(material);
  }
  this.center.copy(target).project(camera);
  this.side.copy(target).addScaledVector(this.right,1.15).project(camera);
  this.top.copy(target);this.top.y+=1.65;this.top.project(camera);
  const visible=this.center.z>=-1&&this.center.z<=1;
  const x=(this.center.x+1)*viewport.x*.5,y=(this.center.y+1)*viewport.y*.5;
  const rx=Math.max(5,Math.abs(this.side.x-this.center.x)*viewport.x*.5+2);
  const ry=Math.max(5,Math.abs(this.top.y-this.center.y)*viewport.y*.5+2);
  for(const [material,patch] of this.patches){
   if(visible&&this.selected.has(material)){patch.uniform.value.set(x,y,rx,ry);patch.depth.value=this.depthLimited?THREE.MathUtils.clamp((this.center.z+1)*.5,0,1):1;}
   else patch.uniform.value.set(0,0,0,0);
  }
 }
 dispose(){this.restore();this.clearProxy();}
}
