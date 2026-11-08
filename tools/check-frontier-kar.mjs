import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {AnimationMixer,Box3,Mesh,Vector3,LoopOnce} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const root=new URL('../',import.meta.url),meta=JSON.parse(readFileSync(new URL('public/defense/models/frontier-kar.json',root)));
for(const f of meta.files){const bytes=readFileSync(new URL(f.path,root));assert.equal(bytes.length,f.bytes,f.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256,f.path);}
async function load(name){const b=readFileSync(new URL(`public/defense/models/${name}.glb`,root));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const compact=await load('frontier-kar-game'),walk=await load('kar-barbarian-walk'),slam=await load('kar-barbarian'),entry=await load('kar-entry'),reset=await load('kar-reset');
const clips=[...walk.animations,...slam.animations,...entry.animations,...reset.animations];assert.equal(clips.length,11);assert.equal(compact.animations.length,11);
let draws=0,tris=0;const materials=new Set();compact.scene.traverse(o=>{if(o instanceof Mesh){draws++;tris+=o.geometry.index.count/3;materials.add(o.material);assert.ok(o.geometry.getAttribute('color'),'all runtime surfaces carry authored paint');}});
assert.equal(draws,meta.runtime.draws);assert.equal(tris,meta.runtime.triangles);assert.ok(draws<=24&&tris<=10000);assert.equal(materials.size,2);
const a=new Box3().setFromObject(walk.scene),b=new Box3().setFromObject(compact.scene);assert.ok(a.min.distanceTo(b.min)<.015&&a.max.distanceTo(b.max)<.015,'rest silhouette bounds preserved');
const joints=['body','head','fur-mantle','beard','war-hammer','left-foot','right-foot','left-upper','left-forearm','right-upper','right-forearm','hammer-contact','upper-grip','lower-grip'];let poses=0,maxError=0,maxSoleError=0;
for(const clip of clips){const next=compact.animations.find(c=>c.name===clip.name);assert.ok(next);assert.equal(next.duration,clip.duration);assert.equal(next.tracks.length,clip.tracks.length);
 for(const track of clip.tracks){const t=next.tracks.find(t=>t.name===track.name);assert.ok(t,track.name);assert.deepEqual(t.times,track.times);assert.deepEqual(t.values,track.values);}
 const original=walk.scene.clone(true),optimized=compact.scene.clone(true),m1=new AnimationMixer(original),m2=new AnimationMixer(optimized);
 m1.clipAction(clip).setLoop(LoopOnce,1).play();m2.clipAction(next).setLoop(LoopOnce,1).play();
 for(let t=0;t<clip.duration;t+=.01){m1.setTime(t);m2.setTime(t);original.updateMatrixWorld(true);optimized.updateMatrixWorld(true);
  for(const name of joints){const x=original.getObjectByName(name),y=optimized.getObjectByName(name);assert.ok(x&&y,name);const error=Math.max(...x.matrixWorld.elements.map((v,i)=>Math.abs(v-y.matrixWorld.elements[i])));maxError=Math.max(error,maxError);assert.ok(error<1e-5,`${clip.name} ${t} ${name}: ${error}`);}
  for(const name of ['left-foot','right-foot']){const before=new Box3().setFromObject(original.getObjectByName(name)),after=new Box3().setFromObject(optimized.getObjectByName(name));const delta=Math.abs(before.min.y-after.min.y);maxSoleError=Math.max(maxSoleError,delta);assert.ok(delta<1e-5,`${clip.name} ${t} ${name} ground: ${delta}`);}
  poses++;
 }
 m1.stopAllAction();m2.stopAllAction();m1.uncacheRoot(original);m2.uncacheRoot(optimized);
}
console.log('PASS frontier Kar',JSON.stringify({files:meta.files.length,draws,triangles:tris,materials:materials.size,clips:clips.length,poses,joints:joints.length,maxMatrixError:maxError,maxSoleError,restBounds:{min:b.min.toArray(),max:b.max.toArray()}}));
