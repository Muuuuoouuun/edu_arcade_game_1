import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BATTLE_MODELS, battleActorPoses, battleModelUrl } from './battleModels.ts';
import type { BattleActorPose, BattleModelId } from './battleModels.ts';
import { boardToWorld } from './terrain3d.ts';
import type { DefenseState } from './types.ts';

type Asset = {gltf:GLTF;height:number;ground:number};
type Instance = {
 model:BattleModelId;root:THREE.Group;rig:THREE.Group;content:THREE.Group;
 mixer:THREE.AnimationMixer;actions:Map<string,THREE.AnimationAction>;active?:string;
 aim?:THREE.Object3D;materials:Map<THREE.MeshStandardMaterial,THREE.Color>;
 pose?:BattleActorPose;
};
type Options = {onLoad:()=>void;load?:(id:BattleModelId)=>Promise<GLTF>};

function disposeAsset(gltf:GLTF){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);}});
 for(const geometry of geometries)geometry.dispose();
 for(const material of materials)material.dispose();
}

/** One actor layer in the terrain's existing renderer. No RAF, game timer,
 * combat mutations or network retries live here. Per-model load failures leave
 * the corresponding SVG visible; late loads after unmount release resources. */
export function createBattleActors3D(scene:THREE.Scene,options:Options){
 const root=new THREE.Group();root.name='battle-actors';scene.add(root);
 const loader=new GLTFLoader(),load=options.load??((id:BattleModelId)=>loader.loadAsync(battleModelUrl(id)));
 const assets=new Map<BattleModelId,Asset>(),pending=new Set<BattleModelId>(),failed=new Set<BattleModelId>();
 const instances=new Map<string,Instance>();
 const shadowGeometry=new THREE.CircleGeometry(1,20),ringGeometry=new THREE.RingGeometry(.94,1,32);
 const shadowMaterial=new THREE.MeshBasicMaterial({color:'#183c2c',transparent:true,opacity:.22,depthWrite:false});
 const ringMaterial=new THREE.MeshBasicMaterial({color:'#dff5a7',transparent:true,opacity:.9,depthWrite:false});
 const hitColor=new THREE.Color('#fff0cc');
 let disposed=false;

 function request(id:BattleModelId){
  if(disposed||assets.has(id)||pending.has(id)||failed.has(id))return;
  pending.add(id);
  void Promise.resolve().then(()=>load(id)).then(gltf=>{
   if(disposed){disposeAsset(gltf);return;}
   const spec=BATTLE_MODELS[id],bounds=new THREE.Box3().setFromObject(gltf.scene,true),height=bounds.max.y-bounds.min.y;
   const required=[spec.walk?.name,spec.attack?.name].filter(Boolean);
   if(!Number.isFinite(height)||height<=0||required.some(name=>!gltf.animations.some(clip=>clip.name===name))||
    (spec.aimNode&&!gltf.scene.getObjectByName(spec.aimNode))){disposeAsset(gltf);throw new Error(`Invalid battle model: ${id}`);}
   // Retain authored x/z origin and internal scale. Bounds are sampled once at
   // rest, with precise vertices (rotated wood feet otherwise get a false AABB).
   assets.set(id,{gltf,height,ground:bounds.min.y});pending.delete(id);options.onLoad();
  }).catch(()=>{pending.delete(id);if(!disposed){failed.add(id);options.onLoad();}});
 }

 function remove(key:string){
  const instance=instances.get(key);if(!instance)return;
  instance.mixer.stopAllAction();instance.mixer.uncacheRoot(instance.content);
  instance.materials.forEach((_,material)=>material.dispose());
  instance.root.removeFromParent();instances.delete(key);
 }

 function create(pose:BattleActorPose,asset:Asset):Instance {
  // All shipped assets are rigid-joint GLBs without skins or textures. Sharing
  // their geometry is safe; each instance gets independent animation bindings.
  const content=asset.gltf.scene.clone(true),rig=new THREE.Group(),actor=new THREE.Group();
  rig.add(content);actor.add(rig);actor.name=pose.key;root.add(actor);
  const shadow=new THREE.Mesh(shadowGeometry,shadowMaterial);shadow.name='contact-shadow';shadow.rotation.x=-Math.PI/2;shadow.position.y=.04;actor.add(shadow);
  if(pose.key==='hero'){const ring=new THREE.Mesh(ringGeometry,ringMaterial);ring.name='hero-selection';ring.rotation.x=-Math.PI/2;ring.position.y=.06;actor.add(ring);}
  const materials=new Map<THREE.MeshStandardMaterial,THREE.Color>();
  if(pose.model==='wood'){
   const copies=new Map<THREE.Material,THREE.Material>();
   const copy=(source:THREE.Material)=>{
    let material=copies.get(source);
    if(!material){material=source.clone();copies.set(source,material);if(material instanceof THREE.MeshStandardMaterial)materials.set(material,material.color.clone());}
    return material;
   };
   content.traverse(object=>{if(object instanceof THREE.Mesh)object.material=Array.isArray(object.material)?object.material.map(copy):copy(object.material);});
  }
  const mixer=new THREE.AnimationMixer(content),actions=new Map<string,THREE.AnimationAction>();
  for(const clip of asset.gltf.animations){const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;actions.set(clip.name,action);}
  const spec=BATTLE_MODELS[pose.model];
  return {model:pose.model,root:actor,rig,content,mixer,actions,materials,aim:spec.aimNode?content.getObjectByName(spec.aimNode):undefined};
 }

 function apply(instance:Instance,pose:BattleActorPose,asset:Asset){
  const spec=BATTLE_MODELS[pose.model];
  const clipTime=pose.clipTime;
  if(instance.active!==pose.clip){
   instance.mixer.stopAllAction();instance.active=pose.clip;
   const action=pose.clip?instance.actions.get(pose.clip):undefined;
   if(action){action.reset().play();action.paused=true;}
  }
  if(pose.clip){const action=instance.actions.get(pose.clip);if(action){action.time=Math.max(0,Math.min(clipTime,action.getClip().duration));instance.mixer.update(0);}}
  const scale=spec.height/asset.height*pose.scale;
  instance.root.position.copy(boardToWorld(pose.position,pose.ground));
  instance.rig.scale.setScalar(scale);instance.rig.position.y=-asset.ground*scale;
  instance.rig.rotation.x=pose.phase==='dash'?-.14:0;
  const radius=(spec.footprint??(pose.model==='ballista'?31:pose.model==='wood'?18:23))*pose.scale;
  instance.root.getObjectByName('contact-shadow')?.scale.setScalar(radius);
  instance.root.getObjectByName('hero-selection')?.scale.setScalar(29*pose.scale);
  // Towers rotate only the authored aiming platform, keeping their footing
  // stationary. Character headings include native asset-axis correction.
  if(instance.aim){instance.root.rotation.y=0;instance.aim.rotation.y=pose.heading+spec.forward;}
  else instance.root.rotation.y=spec.fixedBase?0:pose.heading+spec.forward;
  for(const [material,color] of instance.materials){material.color.copy(color).lerp(hitColor,pose.hit*.35);}
  instance.pose={...pose,clipTime};
 }

 return {
  sync(state:DefenseState,unit=1,reduced=false):string[]{
   if(disposed)return [];
   const poses=battleActorPoses(state,unit,reduced),keys=new Set(poses.map(pose=>pose.key));
   for(const key of instances.keys())if(!keys.has(key))remove(key);
   for(const pose of poses){
    const asset=assets.get(pose.model);if(!asset){request(pose.model);remove(pose.key);continue;}
    let instance=instances.get(pose.key);
    if(instance&&instance.model!==pose.model){remove(pose.key);instance=undefined;}
    if(!instance){instance=create(pose,asset);instances.set(pose.key,instance);}
    apply(instance,pose,asset);
   }
   return [...instances.keys()].sort();
  },
  diagnostics(){return [...instances.entries()].map(([key,instance])=>({key,model:instance.model,phase:instance.pose?.phase,clip:instance.active,time:instance.pose?.clipTime,position:instance.root.position.toArray(),heading:instance.pose?.heading}));},
  dispose(){
   if(disposed)return;disposed=true;
   for(const key of instances.keys())remove(key);
   for(const asset of assets.values())disposeAsset(asset.gltf);
   shadowGeometry.dispose();ringGeometry.dispose();shadowMaterial.dispose();ringMaterial.dispose();
   assets.clear();root.removeFromParent();
  },
 };
}
