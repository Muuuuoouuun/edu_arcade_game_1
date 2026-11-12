// Geometry/asset contract: safe town footprint, one surface, grounded base, and reproducible delivery.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const meta=JSON.parse(readFileSync(path.join(root,'public/defense/models/rush-town.json'),'utf8'));
for(const file of meta.files){
  const raw=readFileSync(path.join(root,file.path));
  assert.equal(raw.length,file.bytes,file.path+' byte count');
  assert.equal(createHash('sha256').update(raw).digest('hex'),file.sha256,file.path+' hash');
}
assert.equal(readFileSync(path.join(root,'art-source/defense/rush-town.blend')).subarray(0,7).toString(),'BLENDER');
const raw=readFileSync(path.join(root,'src/rush/models/forest-town.glb'));
assert.equal(raw.subarray(0,4).toString(),'glTF');
const jsonLength=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonLength).toString());
const binStart=28+jsonLength;
assert.equal(doc.meshes.length,1);assert.equal(doc.materials.length,1);
assert.equal(doc.meshes[0].primitives.length,1);assert.equal(doc.animations,undefined);
assert.equal(doc.textures,undefined);assert.equal(doc.images,undefined);
assert.equal(doc.nodes.length,1);assert.equal(doc.nodes[0].translation,undefined);
assert.equal(doc.nodes[0].rotation,undefined);assert.equal(doc.nodes[0].scale,undefined);
const prim=doc.meshes[0].primitives[0],position=doc.accessors[prim.attributes.POSITION];
assert.notEqual(prim.attributes.COLOR_0,undefined);assert.equal(position.componentType,5126);
const view=doc.bufferViews[position.bufferView];
let radius=0,minY=Infinity,maxY=-Infinity;
for(let i=0;i<position.count;i++){
  const offset=binStart+(view.byteOffset||0)+(position.byteOffset||0)+i*(view.byteStride||12);
  const x=raw.readFloatLE(offset),y=raw.readFloatLE(offset+4),z=raw.readFloatLE(offset+8);
  assert.ok(Number.isFinite(x+y+z));radius=Math.max(radius,Math.hypot(x,z));minY=Math.min(minY,y);maxY=Math.max(maxY,y);
}
assert.ok(radius<=2.60001,'visual geometry stays inside town radius');
assert.ok(Math.abs(minY)<1e-5,'base touches gameplay ground');
assert.ok(maxY<=5.85,'new silhouette does not exceed old town height');
const triangles=doc.accessors[prim.indices].count/3;
assert.ok(triangles<=4500);assert.equal(triangles,meta.runtime.triangles);
const png=readFileSync(path.join(root,'public/defense/models/rush-town.png'));
assert.equal(png.readUInt32BE(16),640);assert.equal(png.readUInt32BE(20),640);
console.log(JSON.stringify({result:'pass',triangles,radius,minY,maxY,editableMeshes:meta.editable_meshes,hashedFiles:meta.files.length}));
