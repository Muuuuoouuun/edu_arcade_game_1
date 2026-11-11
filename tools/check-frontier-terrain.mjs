import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {Raycaster,Vector3,Box3} from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {cameraFrame} from '../src/games/frontier/camera.ts';import {createFrontier,heightAt,walkable} from '../src/games/frontier/engine.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url)),meta=JSON.parse(read('public/defense/models/frontier-terrain.json'));
for(const f of [...meta.files,{file:meta.generator,sha256:meta.generator_sha256}])assert.equal(createHash('sha256').update(read(f.file)).digest('hex'),f.sha256,f.file);
const bytes=read('public/defense/models/frontier-terrain.glb'),g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');g.scene.updateMatrixWorld(true);
const sample=(x,z)=>{const hit=new Raycaster(new Vector3(x,30,z),new Vector3(0,-1,0)).intersectObject(g.scene,true)[0];assert.ok(hit);return hit.point.y;};
const heights={lowland:sample(-5,12),highland:sample(-4,-20),water:sample(6,12),bridge:sample(6,0)};
assert.ok(Math.abs(heights.lowland)<.001);assert.ok(Math.abs(heights.highland-4.6)<.001);assert.ok(Math.abs(heights.bridge-.36)<.001);assert.ok(Math.abs(heights.water+2.6)<.001);assert.ok(heights.bridge-heights.water>2.9);
for(const z of[-24,-12,-7,-3,6,12,24])for(const x of[2.9,3,9,9.1])assert.ok(Math.abs(sample(x,z)-Math.max(0,Math.min(1,(-z-2)/10))*4.6)<.001,`shore ${x},${z}`);
for(let x=2.01;x<9.99;x+=.125)assert.ok(Math.abs(sample(x,0)-.36)<.001,`deck ${x}`);
for(const [start,end,count] of [[-20,2,14],[10,21,7]])for(let i=1;i<count-1;i++)for(const lane of[-1,1]){
 const step=(end-start)/count,x=start+(i+.5+lane*.18)*step,z=lane*.79+.035*Math.sin(i*2.4+lane);
 assert.ok(walkable({x,z}));if(x> -17)assert.ok(Math.abs(sample(x,z)-.012)<.001,`embedded approach ${x},${z}`);
}
for(const x of [-16,-10,-4,0,12,16,20])for(const z of[-.79,.79]){const y=sample(x,z);assert.ok(y>=.002&&y<=.013,`approach top or bedding ${x},${z}: ${y}`);}
// The old road's border stones must not obstruct the new junction.
// The pre-existing winding road has a small 0.104-high ramp at this junction.
for(let x=-19.5;x<1.95;x+=.25)for(const z of[-1.4,0,1.4])assert.ok(sample(x,z)<.12,`approach obstruction at ${x},${z}`);
for(const x of[-10,12])assert.ok(Math.abs(sample(x,2))<.001,`grass alongside approach ${x}`);
// Test the actual follow-camera line of sight to the hero center at representative
// positions; the pre-existing northeastern corner obstruction is tracked separately.
const occluded=[];for(const [width,height] of [[1440,900],[844,390]])for(const x of [-27,-24,-18,-12,-2,12,20,24,27])for(const z of [-25,-19,-13,-7,0,7,13,19,25]){
 const state=createFrontier('solo');state.hero.x=x;state.hero.z=z;
 const frame=cameraFrame(state,{width,height,zoom:1,overview:false,reduced:true}),eye=frame.target.clone().add(frame.offset),target=new Vector3(x,heightAt(x,z)+1.5,z),direction=target.clone().sub(eye),distance=direction.length();
 if(new Raycaster(eye,direction.normalize(),.01,distance-.15).intersectObject(g.scene,true).length)occluded.push({width,x,z});
}
assert.ok(occluded.every(p=>p.width===844&&p.x===27&&p.z===-7),`unexpected hero occlusion: ${JSON.stringify(occluded)}`);
for(const [x,dir]of[[6,-1],[6,1]])for(const z of[-20,12]){const hit=new Raycaster(new Vector3(x,-1,z),new Vector3(dir,0,0)).intersectObject(g.scene,true)[0];assert.ok(hit,'rock face visible from inside the gorge');assert.ok(hit.point.x>3&&hit.point.x<9,'rock stays inside blocked river');}
assert.equal(meta.river_water_y,-2.6);assert.equal(meta.river_bed_y,-4.5);
assert.deepEqual(meta.bridge_approaches,{west_x:[-20,2],east_x:[10,21],width:3.2,stone_count:42,maximum_top:.012});
assert.equal(meta.forest_tree_count,28);assert.equal(meta.forest_crown_meshes,56);assert.equal(meta.meadow_palette_colors,4);assert.deepEqual(meta.forest_outer_verge_x,[32,41]);
let meshes=0,triangles=0;g.scene.traverse(o=>{if(o.isMesh){meshes++;assert.ok(o.geometry.getAttribute('color'));assert.ok(o.material.vertexColors);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});let internalPlankVertices=0;g.scene.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;for(let i=0;i<p.count;i++)if(p.getX(i)>2.001&&p.getX(i)<9.999&&Math.abs(p.getZ(i))===Math.fround(2.8)&&p.getY(i)>=-.041&&p.getY(i)<=.361&&Math.abs(n.getX(i))>.9)internalPlankVertices++;});assert.equal(internalPlankVertices,0,'touching plank faces must not cast internal seam shadows');
const size=new Box3().setFromObject(g.scene).getSize(new Vector3());assert.ok(size.x>=64&&size.z>=64);assert.ok(meshes===1&&triangles<=14000,'bounded terrain material/triangle budget');console.log(JSON.stringify({hashes:meta.files.length+1,editableObjects:meta.editable_objects,meshes,triangles,size:size.toArray(),heights,occluded},null,2));
