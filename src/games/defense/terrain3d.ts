import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getPaths, getSlots, getStage } from './data.ts';
import type { Point } from './types.ts';

/** Ground projection shares the battle board's 900 × 600 coordinate space. */
export const TERRAIN_ELEVATION = Math.PI / 3;
export const TERRAIN_SIN = Math.sin(TERRAIN_ELEVATION);
export const boardToWorld = (point:Point,height=0) => new THREE.Vector3(point.x,height,point.y/TERRAIN_SIN);
export function createTerrainCamera(aspect=1.5):THREE.OrthographicCamera {
 const halfHeight=300,halfWidth=halfHeight*aspect;
 const camera=new THREE.OrthographicCamera(-halfWidth,halfWidth,halfHeight,-halfHeight,.1,4000);
 const target=boardToWorld({x:450,y:300});
 const distance=1000;
 camera.position.set(target.x,distance*Math.sin(TERRAIN_ELEVATION),target.z+distance*Math.cos(TERRAIN_ELEVATION));
 camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
 return camera;
}

function segmentDistance(p:Point,a:Point,b:Point){
 const dx=b.x-a.x,dy=b.y-a.y,denom=dx*dx+dy*dy;
 const t=denom?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/denom)):0;
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
/** Decorative geometry stays clear of paths, build pads and the starting hero. */
export function terrainDecor(stageId:number):Point[]{
 const stage=getStage(stageId),paths=getPaths(stageId).slice(0,stage.expanded?2:1),slots=getSlots(stageId).filter(slot=>slot.unlock<=stageId);
 const protectedPoints:Point[]=[...slots,{x:440,y:stage.region==='snow'?390:355},{x:850,y:318},{x:852,y:131}];
 let seed=stage.region==='snow'?0x45fa17:0x6af432;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const points:Point[]=[];
 for(let tries=0;tries<500&&points.length<34;tries++){
  const p={x:25+rand()*850,y:20+rand()*560};
  if(stage.region==='forest'&&p.x>620&&p.x<760)continue;
  if(protectedPoints.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<85))continue;
  if(paths.some(path=>path.slice(1).some((b,i)=>segmentDistance(p,path[i],b)<64)))continue;
  if(points.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<45))continue;
  points.push(p);
 }
 return points;
}

function material(color:THREE.ColorRepresentation,roughness=1){return new THREE.MeshStandardMaterial({color,roughness});}
function addBox(scene:THREE.Object3D,p:Point,width:number,depth:number,height:number,base:number,mat:THREE.Material){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth/TERRAIN_SIN),mat);
 mesh.position.copy(boardToWorld(p,base+height/2));scene.add(mesh);return mesh;
}
function addDisk(scene:THREE.Object3D,p:Point,radius:number,height:number,mat:THREE.Material){
 const mesh=new THREE.Mesh(new THREE.CircleGeometry(radius,16),mat);mesh.rotation.x=-Math.PI/2;
 mesh.scale.set(1,1/TERRAIN_SIN,1);mesh.position.copy(boardToWorld(p,height));scene.add(mesh);
}
function addOval(scene:THREE.Object3D,p:Point,rx:number,ry:number,height:number,mat:THREE.Material){
 const mesh=new THREE.Mesh(new THREE.CircleGeometry(1,16),mat);mesh.rotation.x=-Math.PI/2;
 mesh.scale.set(rx,ry/TERRAIN_SIN,1);mesh.position.copy(boardToWorld(p,height));scene.add(mesh);
}
function roadQuad(scene:THREE.Object3D,a:Point,b:Point,width:number,height:number,mat:THREE.Material){
 const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)return;
 const ox=-dy/length*width/2,oy=dx/length*width/2;
 const vertices=[boardToWorld({x:a.x+ox,y:a.y+oy},height),boardToWorld({x:a.x-ox,y:a.y-oy},height),boardToWorld({x:b.x+ox,y:b.y+oy},height),boardToWorld({x:b.x-ox,y:b.y-oy},height)];
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flatMap(v=>[v.x,v.y,v.z]),3));geo.setIndex([0,2,1,2,3,1]);geo.computeVertexNormals();scene.add(new THREE.Mesh(geo,mat));
}
function road(scene:THREE.Object3D,points:Point[],snow:boolean){
 const edge=material(snow?'#729ca6':'#886e45'),base=material(snow?'#d6e3dd':'#d5b780'),ice=material('#8ecbd7',.5);
 for(const m of [edge,base,ice])m.side=THREE.DoubleSide;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];roadQuad(scene,a,b,52,.2,edge);addDisk(scene,a,26,.21,edge);addDisk(scene,b,26,.21,edge);
  // Partition at the exact x boundaries used by the enemy speed rule.
  const cuts=[0,1];if(snow&&a.x!==b.x)for(const boundary of [300,520]){const t=(boundary-a.x)/(b.x-a.x);if(t>0&&t<1)cuts.push(t);}cuts.sort((x,y)=>x-y);
  for(let j=1;j<cuts.length;j++){
   const p=(t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});const from=p(cuts[j-1]),to=p(cuts[j]);
   const mid=(from.x+to.x)/2,isIce=snow&&mid>=300&&mid<=520;
   roadQuad(scene,from,to,45,.35,isIce?ice:base);
  }
  for(const p of [a,b])addDisk(scene,p,22.5,.36,snow&&p.x>=300&&p.x<=520?ice:base);
 }
}
function bridge(scene:THREE.Object3D,y:number){
 const frame=material('#704b31'),plank=material('#bb8955');
 addBox(scene,{x:692.5,y},92,54,4,.5,frame);
 for(let x=653;x<735;x+=10)addBox(scene,{x,y},8,46,2,4.5,plank);
}
type Flora = {trunk:THREE.Material;leaf:THREE.Material;leafAlt:THREE.Material;light:THREE.Material;rock:THREE.Material;trunkGeo:THREE.CylinderGeometry;leafGeo:THREE.IcosahedronGeometry;rockGeo:THREE.IcosahedronGeometry};
function addTree(scene:THREE.Object3D,p:Point,snow:boolean,index:number,flora:Flora){
 const group=new THREE.Group();group.position.copy(boardToWorld(p));scene.add(group);
 group.name='decorative-tree';
 const stem=new THREE.Mesh(flora.trunkGeo,flora.trunk);stem.position.y=10;group.add(stem);
 // Chunky overlapping foliage has distinct shaded top and sides at game scale.
 for(const [x,y,z,scale] of [[-10,23,0,15],[10,25,2,16],[0,35,-3,18]] as const){
  const crown=new THREE.Mesh(flora.leafGeo,index%3===0?flora.leafAlt:flora.leaf);crown.position.set(x,y,z);crown.scale.setScalar(scale);group.add(crown);
 }
 const highlight=new THREE.Mesh(flora.leafGeo,flora.light);highlight.position.set(-3,45,-3);highlight.scale.set(snow?13:8,snow?5:6,snow?13:8);group.add(highlight);
 if(index%3===0){const rock=new THREE.Mesh(flora.rockGeo,flora.rock);rock.position.set(21,4,10);rock.scale.set(10,7,8);group.add(rock);}
}
function addPatch(scene:THREE.Object3D,p:Point,rx:number,ry:number,mat:THREE.Material,seed:number){
 const vertices=[...boardToWorld(p,.03).toArray()],indices:number[]=[];
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6,variation=1+.12*Math.sin(i*3.7+seed);
  const q=boardToWorld({x:p.x+Math.cos(a)*rx*variation,y:p.y+Math.sin(a)*ry*variation},.03);
  vertices.push(q.x,q.y,q.z);
 }
 for(let i=0;i<12;i++)indices.push(0,1+i,1+(i+1)%12);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 scene.add(new THREE.Mesh(geometry,mat));
}

/** A genuine 3D environment; interactive entities remain on the aligned SVG layer. */
export function createTerrainScene(stageId:number,mode:'battle'|'camp'='battle'):THREE.Scene {
 const stage=getStage(stageId),snow=mode==='battle'&&stage.region==='snow';
 const scene=new THREE.Scene();scene.background=new THREE.Color(snow?'#a8c8d0':'#80aa65');
 scene.add(new THREE.HemisphereLight(snow?0xe8faff:0xfff4d2,snow?0x647b82:0x496843,1.4));
 const key=new THREE.DirectionalLight(0xfff1d3,1.6);key.position.set(-350,900,200);scene.add(key);
 addBox(scene,{x:450,y:300},900,600,8,-8,material(snow?'#b8d5d6':'#80ae5e'));
 // Shallow solid planes and low-poly shapes are meshes, not background bitmaps.
 const patch=material(snow?'#c7dfdb':'#8fba6b');patch.side=THREE.DoubleSide;
 for(const [i,[x,y,rx,ry]] of ([[115,95,66,38],[375,120,85,42],[575,220,57,32],[180,485,75,38],[760,515,63,38],[570,540,54,29]] as const).entries())addPatch(scene,{x,y},rx,ry,patch,i);
 if(mode==='battle'){
  if(!snow){
   addBox(scene,{x:692.5,y:300},85,600,.10,.03,material('#6eb6c0',.48));
   const ripple=material('#94d1d0',.55);
   for(let i=0;i<9;i++)addBox(scene,{x:678+(i%3)*13,y:35+i*67},24+(i%2)*10,2,.12,.15,ripple);
  }
  for(const path of getPaths(stageId).slice(0,stage.expanded?2:1))road(scene,path,snow);
  if(!snow){bridge(scene,430);if(stage.expanded)bridge(scene,235);}
  const high=material(snow?'#98b9bb':'#7c9d68');
  for(const slot of getSlots(stageId).filter(s=>s.unlock<=stageId&&s.terrain==='high')){
   const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(32,36,3,10),high);pedestal.scale.z=1/TERRAIN_SIN;pedestal.position.copy(boardToWorld(slot,1.5));scene.add(pedestal);
  }
 }else{
  const clearing=material('#c3c986');addDisk(scene,{x:450,y:300},185,.06,clearing);
  const path=[{x:140,y:470},{x:330,y:360},{x:450,y:300},{x:690,y:390},{x:840,y:480}];road(scene,path,false);
 }
 const decor=terrainDecor(mode==='camp'?1:stageId);
 const flora:Flora={trunk:material(snow?'#655b50':'#705038'),leaf:material(snow?'#6d999b':'#4a8048'),leafAlt:material(snow?'#86afb0':'#5b9151'),light:material(snow?'#e5efea':'#8cba6d'),rock:material(snow?'#a4bec0':'#878879'),trunkGeo:new THREE.CylinderGeometry(5,8,20,7),leafGeo:new THREE.IcosahedronGeometry(1,1),rockGeo:new THREE.IcosahedronGeometry(1,0)};
 const shadow=new THREE.MeshBasicMaterial({color:snow?'#648e91':'#466c3f',transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide});
 for(let i=0;i<decor.length;i++){addOval(scene,decor[i],25,10,.07,shadow);addTree(scene,decor[i],snow,i,flora);}
 return scene;
}

/** Bake static scenery by material before animated actors are added. This keeps
 * hundreds of tiny tree/road draws from being repeated for every combat frame.
 * Geometry remains in world space with the same material and depth behavior. */
export function batchTerrain(scene:THREE.Scene){
 scene.updateMatrixWorld(true);
 const groups=new Map<string,{material:THREE.Material;meshes:THREE.Mesh[];parts:THREE.BufferGeometry[]}>();
 const originals=new Set<THREE.BufferGeometry>();
 scene.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||Array.isArray(object.material))return;
  const source=object.geometry,geometry=source.index?source.toNonIndexed():source.clone();
  geometry.applyMatrix4(object.matrixWorld);
  const attributes=Object.keys(geometry.attributes).sort().map(name=>`${name}:${geometry.getAttribute(name).itemSize}`).join(',');
  const key=`${object.material.uuid}/${attributes}`;
  let group=groups.get(key);if(!group){group={material:object.material,meshes:[],parts:[]};groups.set(key,group);}
  group.meshes.push(object);group.parts.push(geometry);originals.add(source);
 });
 for(const group of groups.values()){
  const merged=mergeGeometries(group.parts,false);
  if(merged){const mesh=new THREE.Mesh(merged,group.material);mesh.name='batched-terrain';scene.add(mesh);for(const old of group.meshes)old.removeFromParent();}
  for(const part of group.parts)part.dispose();
 }
 const retained=new Set<THREE.BufferGeometry>();scene.traverse(object=>{if(object instanceof THREE.Mesh)retained.add(object.geometry);});
 for(const geometry of originals)if(!retained.has(geometry))geometry.dispose();
}

export function disposeTerrain(scene:THREE.Scene){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 scene.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);}});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
