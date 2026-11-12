import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh } from 'three';
import { batchTerrain, boardToWorld, createTerrainCamera, createTerrainScene, disposeTerrain, terrainDecor } from './terrain3d.ts';
import { getPaths, getSlots, getStage } from './data.ts';

test('orthographic ground projection exactly matches existing battle and touch coordinates',()=>{
 const camera=createTerrainCamera();
 for(const point of [{x:0,y:0},{x:900,y:0},{x:0,y:600},{x:900,y:600},{x:450,y:300},...getSlots(1),...getSlots(8)]){
  const projected=boardToWorld(point).project(camera);
  const x=(projected.x+1)*450,y=(1-projected.y)*300;
  assert.ok(Math.abs(x-point.x)<1e-7,`x ${point.x}: ${x}`);
  assert.ok(Math.abs(y-point.y)<1e-7,`y ${point.y}: ${y}`);
 }
});
function distance(p:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number}){
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
test('scenery placement is deterministic and does not cover paths or build locations',()=>{
 for(const stage of [1,4,5,8]){
  const items=terrainDecor(stage),paths=getPaths(stage).slice(0,getStage(stage).expanded?2:1),slots=getSlots(stage).filter(s=>s.unlock<=stage);
  assert.deepEqual(items,terrainDecor(stage));assert.ok(items.length>=10);
  for(const p of items){
   for(const slot of slots)assert.ok(Math.hypot(p.x-slot.x,p.y-slot.y)>=85);
   for(const path of paths)for(let i=1;i<path.length;i++)assert.ok(distance(p,path[i-1],path[i])>=64);
  }
 }
});
test('forest, snow and camp create genuine 3D geometry',()=>{
 for(const [stage,mode] of [[1,'battle'],[8,'battle'],[1,'camp']] as const){
  const scene=createTerrainScene(stage,mode);let meshes=0;scene.traverse(o=>{if(o.type==='Mesh')meshes++;});
  assert.ok(meshes>30,`${mode} ${stage}: ${meshes}`);disposeTerrain(scene);
 }
});

test('static batching preserves triangles and world bounds while reducing combat draws',()=>{
 for(const stage of [1,4,5,8]){
  const scene=createTerrainScene(stage),bounds=new Box3().setFromObject(scene,true);
  const count=()=>{let meshes=0,triangles=0;scene.traverse(object=>{if(object instanceof Mesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}});return {meshes,triangles};};
  const before=count();batchTerrain(scene);const after=count(),actual=new Box3().setFromObject(scene,true);
  assert.equal(after.triangles,before.triangles);
  assert.ok(after.meshes<before.meshes/3,`${stage}: ${before.meshes} -> ${after.meshes}`);
  assert.ok(bounds.min.distanceTo(actual.min)<1e-4);assert.ok(bounds.max.distanceTo(actual.max)<1e-4);
  disposeTerrain(scene);
 }
});
