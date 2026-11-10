import * as THREE from 'three';

type MaskPatch={
 material:THREE.Material;
 hook:THREE.Material['onBeforeCompile'];
 cacheKey:THREE.Material['customProgramCacheKey'];
 uniform:{value:THREE.Vector4};
};

/** Reveal the hero through only the pixels of gate surfaces covering them. */
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
 constructor(root:THREE.Object3D){this.root=root;}
 get count(){return this.selected.size;}
 /** The asynchronous gate load replaces fallback children in the same root. */
 invalidate(){this.restore();this.boundsDirty=true;this.lastEye.set(Infinity,Infinity,Infinity);this.lastTarget.set(Infinity,Infinity,Infinity);}
 private restore(){
  for(const {material,hook,cacheKey,uniform} of this.patches.values()){
   uniform.value.set(0,0,0,0);material.onBeforeCompile=hook;material.customProgramCacheKey=cacheKey;material.needsUpdate=true;
  }
  this.patches.clear();this.selected.clear();
 }
 private patch(material:THREE.Material){
  const existing=this.patches.get(material);if(existing)return existing;
  const hook=material.onBeforeCompile,cacheKey=material.customProgramCacheKey,key=cacheKey.call(material),uniform={value:new THREE.Vector4()};
  const patch={material,hook,cacheKey,uniform};this.patches.set(material,patch);
  material.onBeforeCompile=(shader,renderer)=>{
   hook.call(material,shader,renderer);
   const include='#include <clipping_planes_fragment>',main='void main() {';
   // If a future material does not use Three's standard fragment layout,
   // leave its shader intact instead of emitting an undeclared uniform.
   if(!shader.fragmentShader.includes(include)||!shader.fragmentShader.includes(main))return;
   shader.uniforms.arcanaGateMask=uniform;
   shader.fragmentShader=shader.fragmentShader.replace(main,'uniform vec4 arcanaGateMask;\nvoid main() {').replace(include,`${include}
    if (arcanaGateMask.z > 0.0 && arcanaGateMask.w > 0.0) {
     vec2 arcanaOffset = (gl_FragCoord.xy - arcanaGateMask.xy) / arcanaGateMask.zw;
     float arcanaDistance = length(arcanaOffset);
     if (arcanaDistance < 1.0) {
      float arcanaEdge = smoothstep(0.78, 1.0, arcanaDistance);
      float arcanaNoise = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
      if (arcanaNoise > arcanaEdge) discard;
     }
    }`);
  };
  material.customProgramCacheKey=()=>`${key}|arcana-gate-local-mask-v1`;
  material.needsUpdate=true;return patch;
 }
 update(camera:THREE.Camera|null,target?:THREE.Vector3,viewport:THREE.Vector2=this.defaultViewport){
  if(!camera||!target){this.selected.clear();for(const patch of this.patches.values())patch.uniform.value.set(0,0,0,0);this.lastEye.set(Infinity,Infinity,Infinity);return;}
  this.right.setFromMatrixColumn(camera.matrixWorld,0).normalize();
  const changed=this.lastEye.distanceToSquared(camera.position)>=1e-8||this.lastTarget.distanceToSquared(target)>=1e-8||this.lastRight.distanceToSquared(this.right)>=1e-8||this.boundsDirty;
  if(changed){
   this.lastEye.copy(camera.position);this.lastTarget.copy(target);this.lastRight.copy(this.right);
   this.root.updateWorldMatrix(true,true);
   if(this.boundsDirty){this.bounds.setFromObject(this.root);this.boundsDirty=false;}
   const selected=new Set<THREE.Material>();
   for(const [horizontal,vertical] of [[0,0],[-.65,0],[.65,0],[0,.7],[0,-.7]]){
    this.sample.copy(target).addScaledVector(this.right,horizontal);this.sample.y+=vertical;
    this.direction.copy(this.sample).sub(camera.position);const distance=this.direction.length();
    if(distance>.15){
     this.ray.set(camera.position,this.direction.multiplyScalar(1/distance));this.ray.far=distance-.15;
     for(const hit of this.ray.ray.intersectsBox(this.bounds)?this.ray.intersectObject(this.root,true):[]){
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
   if(visible&&this.selected.has(material))patch.uniform.value.set(x,y,rx,ry);
   else patch.uniform.value.set(0,0,0,0);
  }
 }
 dispose(){this.restore();}
}
