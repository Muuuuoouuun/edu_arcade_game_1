import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {Raycaster,Vector3,Box3} from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url)),meta=JSON.parse(read('public/defense/models/frontier-terrain.json'));
for(const f of [...meta.files,{file:meta.generator,sha256:meta.generator_sha256}])assert.equal(createHash('sha256').update(read(f.file)).digest('hex'),f.sha256,f.file);
const bytes=read('public/defense/models/frontier-terrain.glb'),g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');g.scene.updateMatrixWorld(true);
const sample=(x,z)=>{const hit=new Raycaster(new Vector3(x,30,z),new Vector3(0,-1,0)).intersectObject(g.scene,true)[0];assert.ok(hit);return hit.point.y;};
const heights={lowland:sample(-5,12),highland:sample(-4,-20),water:sample(6,12),bridge:sample(6,0)};
assert.ok(Math.abs(heights.lowland)<.001);assert.ok(Math.abs(heights.highland-4.6)<.001);assert.ok(Math.abs(heights.bridge-.36)<.001);assert.ok(heights.bridge-heights.water>.9);
let meshes=0,triangles=0;g.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});const size=new Box3().setFromObject(g.scene).getSize(new Vector3());assert.ok(size.x>=64&&size.z>=64);console.log(JSON.stringify({hashes:meta.files.length+1,editableObjects:meta.editable_objects,meshes,triangles,size:size.toArray(),heights},null,2));
