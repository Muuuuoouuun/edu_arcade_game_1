import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Box3,Group,Mesh,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SquadView} from '../src/games/frontier/squadView.ts';
import {squadShotOrigin} from '../src/games/frontier/effectsView.ts';
import {heightAt} from '../src/games/frontier/engine.ts';
const base='public/defense/models/frontier-squad',meta=JSON.parse(readFileSync(base+'.json'));
for(const f of meta.files){const b=readFileSync(f.path);assert.equal(b.length,f.bytes,f.path);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256,f.path);}
const b=readFileSync(base+'.glb'),g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');let meshes=0,tris=0;
g.scene.traverse(o=>{if(o instanceof Mesh){meshes++;tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
assert.equal(meshes,4);assert.equal(tris,meta.runtime.triangles);assert.ok(tris<=1200);assert.equal(g.animations.length,0);
for(const n of ['squad-rig','squad-body','squad-left-foot','squad-right-foot','squad-weapon','squad-muzzle','surface-squad-weapon'])assert.ok(g.scene.getObjectByName(n),n);
const bounds=new Box3().setFromObject(g.scene);assert.ok(Math.abs(bounds.min.y)<.00001);assert.ok(bounds.max.y>2.7&&bounds.max.y<3);
const root=new Group();root.add(g.scene);const view=new SquadView(root,0);let checked=0;
for(const [x,z] of [[0,-7],[5,0],[2.05,2.7]])for(let h=0;h<8;h++)for(let p=0;p<8;p++){
 view.update({x,z,cooldown:0,heading:h*Math.PI/4,moving:true,walkDistance:p*1.2/8},1,false);root.updateMatrixWorld(true);
 for(const name of ['surface-squad-left-foot','surface-squad-right-foot']){const foot=root.getObjectByName(name);const a=foot.geometry.getAttribute('position');for(let i=0;i<a.count;i++){const q=new Vector3().fromBufferAttribute(a,i).applyMatrix4(foot.matrixWorld);assert.ok(q.y>=heightAt(q.x,q.z)-.0001,`${name} intersects ground at ${x},${z} heading ${h} pose ${p}: ${q.toArray()}`);checked++;}}
}
for(const reduced of [false,true])for(let h=0;h<8;h++){
 const angle=h*Math.PI/4,from={x:0,z:-7},to={x:5*Math.sin(angle),z:-7+5*Math.cos(angle)};
 view.update({...from,cooldown:0,heading:angle,shotAt:1,shotHeading:angle},1,reduced);root.updateMatrixWorld(true);
 const p=root.getObjectByName('squad-muzzle').getWorldPosition(new Vector3()),q=squadShotOrigin(from,to,reduced);
 assert.ok(p.distanceTo(new Vector3(q.x,q.y,q.z))<.0001,`shot origin differs from muzzle at heading ${h}, reduced ${reduced}`);
}
console.log('PASS support soldier',{hashes:meta.files.length,meshes,tris,bytes:b.length,checkedGroundVertices:checked,bounds:[bounds.min.toArray(),bounds.max.toArray()]});
