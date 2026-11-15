/** Check the real rig/clip, common-camera renders and recorded source hashes. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {AnimationMixer,LoopOnce,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
async function load(n){const b=read(`public/defense/models/${n}.glb`);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const [model,base]=await Promise.all(['riel-ultimate','riel-archer'].map(load));
const meta=JSON.parse(read('public/defense/models/riel-ultimate.json'));
const binary=read('public/defense/models/riel-ultimate.glb');
const gltf=JSON.parse(binary.subarray(20,20+binary.readUInt32LE(12)).toString('utf8').trim());
assert.ok(gltf.meshes?.length>0&&gltf.animations?.length>0,'real mesh and motion are required');
assert.equal(gltf.images?.length??0,0,'no still image is used as a model');
for(const f of meta.files)assert.equal(createHash('sha256').update(read(f.file)).digest('hex'),f.sha256,f.file);
for(const [p,h] of [[meta.generator,meta.generator_sha256],[meta.reference,meta.reference_sha256],['art-source/defense/riel-archer.blend',meta.source_cast_sha256]])assert.equal(createHash('sha256').update(read(p)).digest('hex'),h,p);
assert.equal(meta.directions.length,8);assert.equal(model.animations.length,1);const clip=model.animations[0];assert.equal(clip.name,'riel-ultimate-0');assert.ok(Math.abs(clip.duration-.5)<1e-6);
const names=[...new Set(base.animations[0].tracks.map(t=>t.name.split('.')[0]))];
function sample(g,c,t){const m=new AnimationMixer(g.scene),a=m.clipAction(c);a.setLoop(LoopOnce,1);a.clampWhenFinished=true;a.play();m.setTime(t);g.scene.updateMatrixWorld(true);
 const matrices=Object.fromEntries(names.map(n=>[n,g.scene.getObjectByName(n).matrixWorld.elements.slice()]));let bottom=Infinity,gap=0;
 for(const n of ['right-leg','left-leg'])g.scene.getObjectByName(n).traverse(o=>{if(!o.isMesh)return;const v=o.geometry.attributes.position;for(let i=0;i<v.count;i++)bottom=Math.min(bottom,new Vector3().fromBufferAttribute(v,i).applyMatrix4(o.matrixWorld).y)});
 for(const side of ['bow','draw']){const u=g.scene.getObjectByName(side+'-upper-arm'),f=g.scene.getObjectByName(side+'-forearm'),h=g.scene.getObjectByName(side+'-hand'),tip=n=>new Vector3(0,1,0).applyMatrix4(n.matrixWorld);gap=Math.max(gap,tip(u).distanceTo(f.getWorldPosition(new Vector3())),tip(f).distanceTo(h.getWorldPosition(new Vector3())));}
 const n=name=>g.scene.getObjectByName(name),pos=name=>n(name).getWorldPosition(new Vector3()),tip=name=>new Vector3(0,1,0).applyMatrix4(n(name).matrixWorld);
 const stringGap=Math.max(tip('bow-string-0').distanceTo(pos('bow-string-1')),pos('bow-string-0').distanceTo(pos('bow-limb-0')),tip('bow-string-1').distanceTo(tip('bow-limb-7')));
 const gripGap=pos('bow-hand').distanceTo(pos('bow-grip')),arrowScale=n('nocked-arrow').scale.length();
 const bow=pos('bow-grip');m.stopAllAction();m.uncacheRoot(g.scene);return{matrices,bottom,gap,bow,stringGap,gripGap,arrowScale};}
const first=sample(model,clip,0),last=sample(model,clip,.5),idle=sample(base,base.animations[0],0);let endError=0,maxGap=0,minSole=Infinity;
for(const n of names)for(let i=0;i<16;i++)endError=Math.max(endError,Math.abs(last.matrices[n][i]-idle.matrices[n][i]));
for(let i=0;i<=100;i++){const p=sample(model,clip,i/200);minSole=Math.min(minSole,p.bottom);maxGap=Math.max(maxGap,p.gap);assert.ok(p.stringGap<.001,`string separation ${p.stringGap}`);assert.ok(Math.abs(p.gripGap-idle.gripGap)<.001,`bow grip detached ${p.gripGap}`);for(const n of ['left-leg','right-leg'])assert.ok(p.matrices[n].every((v,j)=>Math.abs(v-first.matrices[n][j])<1e-6));}
assert.ok(endError<1e-5,`end ${endError}`);assert.ok(minSole>.004&&minSole<.006,`sole ${minSole}`);assert.ok(maxGap*384/6.8<.5,`arm gap ${maxGap}`);assert.ok(first.bow.y-idle.bow.y>.25,`bow rise ${first.bow.y-idle.bow.y}`);
assert.ok(sample(model,clip,.06).arrowScale<.01,'released arrow is hidden');assert.ok(sample(model,clip,.45).arrowScale>1,'arrow is reloaded during recovery');
console.log(JSON.stringify({clip:clip.name,duration:clip.duration,samples:101,endError,minSole,maxGap,bowRise:first.bow.y-idle.bow.y,files:meta.files.length},null,2));
