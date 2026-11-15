/** Inspect delivered hammer recovery against the original hammer and walking GLBs. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { AnimationMixer, LoopOnce, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const read = path => readFileSync(new URL('../' + path, import.meta.url));
async function load(name) {
 const data = read(`public/defense/models/${name}.glb`);
 return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
}
const [model, hammer] = await Promise.all(['kar-reset', 'kar-barbarian'].map(load));
const meta = JSON.parse(read('public/defense/models/kar-reset.json'));
for (const file of meta.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
for (const [path, hash] of [[meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ['art-source/defense/kar-barbarian.blend', meta.source_cast_sha256]]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
const upper=['body','head','fur-mantle','beard','war-hammer','left-upper','left-forearm','right-upper','right-forearm'],legs=['right-foot','left-foot'],joints=[...upper,...legs];
function sample(model, clip, time) {
 const mixer=new AnimationMixer(model.scene),action=mixer.clipAction(clip);
 action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(time);model.scene.updateMatrixWorld(true);
 const transforms=Object.fromEntries(joints.filter(n=>model.scene.getObjectByName(n)).map(n=>[n,model.scene.getObjectByName(n).matrixWorld.elements.slice()]));
 let bottom=Infinity,sole=Infinity,gripError=0;
 for(const [i,side] of ['left','right'].entries()){
  const upper=model.scene.getObjectByName(side+'-upper'),fore=model.scene.getObjectByName(side+'-forearm'),grip=model.scene.getObjectByName(i===0?'upper-grip':'lower-grip'),body=model.scene.getObjectByName('body');
  const shoulder=new Vector3(i===0?-.77:.77,1.17,0).applyMatrix4(body.matrixWorld);
  gripError=Math.max(gripError,shoulder.distanceTo(new Vector3().setFromMatrixPosition(upper.matrixWorld)),new Vector3(0,1,0).applyMatrix4(upper.matrixWorld).distanceTo(new Vector3().setFromMatrixPosition(fore.matrixWorld)),new Vector3(0,1,0).applyMatrix4(fore.matrixWorld).distanceTo(new Vector3().setFromMatrixPosition(grip.matrixWorld)));
 }


 function minimum(node){let y=Infinity;node.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.attributes.position;for(let i=0;i<p.count;i++)y=Math.min(y,new Vector3().fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld).y)});return y}
 bottom=minimum(model.scene);
 for(const n of legs)if(model.scene.getObjectByName(n))sole=Math.min(sole,minimum(model.scene.getObjectByName(n)));
 mixer.stopAllAction();mixer.uncacheRoot(model.scene);return {transforms,bottom,sole,gripError};
}
const error=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
assert.equal(model.animations.length,1);
let maximumStartError=0,maximumEndError=0,minimumHeight=Infinity,maximumSupportHeight=0,maximumGripError=0;
const original=sample(hammer,hammer.animations[0],.43);
for(let target=0;target<1;target++){
 const clip=model.animations.find(c=>c.name===`kar-reset-${target}`);assert.ok(clip&&Math.abs(clip.duration-.14)<1e-6);
 const start=sample(model,clip,0),end=sample(model,clip,.14),walking=sample(hammer,hammer.animations[0],0);
 for(const n of joints)maximumStartError=Math.max(maximumStartError,error(start.transforms[n],original.transforms[n]));
 for(const n of joints)maximumEndError=Math.max(maximumEndError,error(end.transforms[n],walking.transforms[n]));
 const settled=sample(model,clip,.10);
 assert.ok(error(settled.transforms.body,walking.transforms.body)<1e-5, 'torso settles before equipment');
 assert.ok(error(settled.transforms['war-hammer'],walking.transforms['war-hammer'])>.001, 'hammer retains follow-through');
 assert.ok(error(settled.transforms['fur-mantle'],walking.transforms['fur-mantle'])>.001,'fur follows torso');
 assert.ok(error(settled.transforms['beard'],walking.transforms['beard'])>.001,'beard follows torso');
 for(let step=0;step<=56;step++){
  const pose=sample(model,clip,step/400);minimumHeight=Math.min(minimumHeight,pose.bottom);maximumGripError=Math.max(maximumGripError,pose.gripError);maximumSupportHeight=Math.max(maximumSupportHeight,pose.sole);
  for(const foot of legs)assert.ok(error(pose.transforms[foot],start.transforms[foot])<1e-7, 'fixed foot '+foot);
  assert.ok(pose.bottom>.009,`floor ${target}/${step}: ${pose.bottom}`);assert.ok(pose.sole>.009&&pose.sole<.011,`support ${target}/${step}: ${pose.sole}`);
 }
}
assert.ok(maximumStartError<1e-5);assert.ok(maximumEndError<1e-5);
assert.ok(maximumGripError*384/6.8<.5, `grip projected gap ${maximumGripError*384/6.8}`);
console.log(JSON.stringify({clips:1,joints:11,authoredSamples:15,checkedSamples:57,maximumStartError,maximumEndError,minimumHeight,maximumSupportHeight,maximumGripError,projectedGripGap:maximumGripError*384/6.8,unchangedHitAt:.28,unchangedDuration:.56,hashes:meta.files.length+3},null,2));
