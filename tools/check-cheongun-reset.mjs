/** Inspect the stationary recovery against the original cast and ready poses. */
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
const [resetModel, cast] = await Promise.all(['cheongun-reset', 'cheongun-tao'].map(load));
const meta = JSON.parse(read('public/defense/models/cheongun-reset.json'));
for (const file of meta.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
for (const [path, hash] of [[meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ['art-source/defense/cheongun-tao.blend', meta.source_cast_sha256]]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
const joints = [...new Set(cast.animations[0].tracks.map(t => t.name.split('.')[0]))];
function sample(model, clip, time) {
 const mixer = new AnimationMixer(model.scene), action = mixer.clipAction(clip);
 action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.setTime(time); model.scene.updateMatrixWorld(true);
 const transforms = Object.fromEntries(joints.map(name => [name, model.scene.getObjectByName(name).matrixWorld.elements.slice()]));
 let bottom = Infinity;
 for (const name of ['right-leg', 'left-leg']) model.scene.getObjectByName(name).traverse(node => {
  if (!node.isMesh) return;
  const positions = node.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) bottom = Math.min(bottom, new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).y);
 });
 let armGap=0;for(const side of ['seal','brush']){const upper=model.scene.getObjectByName(side+'-upper-arm'),fore=model.scene.getObjectByName(side+'-forearm'),hand=model.scene.getObjectByName(side+'-hand');const tip=n=>new Vector3(0,1,0).applyMatrix4(n.matrixWorld);armGap=Math.max(armGap,tip(upper).distanceTo(fore.getWorldPosition(new Vector3())),tip(fore).distanceTo(hand.getWorldPosition(new Vector3())));}
 const palm=model.scene.getObjectByName('seal-hand').position.clone();
 const rotations=Object.fromEntries(['body','seal-hand','back-robe'].map(n=>[n,model.scene.getObjectByName(n).quaternion.clone()]));
 mixer.stopAllAction(); mixer.uncacheRoot(model.scene);
 return { transforms, bottom, rotations, palm, armGap };
}
const difference = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
assert.equal(resetModel.animations.length, 1);
let minimumSoleHeight=Infinity,maximumStartError=0,maximumEndError=0,maximumArmGap=0;
const released=sample(cast,cast.animations[0],.15);
const followthrough=[];
for(let target=0;target<1;target++){
 const clip=resetModel.animations.find(a=>a.name===`cheongun-reset-${target}`);assert.ok(clip&&Math.abs(clip.duration-.12)<1e-6);
 const start=sample(resetModel,clip,0),end=sample(resetModel,clip,.12),ready=sample(cast,cast.animations[0],0);
 const early=sample(resetModel,clip,.04),progress={};for(const n of ['body','seal-hand','back-robe'])progress[n]=n==='seal-hand'?start.palm.distanceTo(early.palm)/start.palm.distanceTo(end.palm):start.rotations[n].angleTo(early.rotations[n])/start.rotations[n].angleTo(end.rotations[n]);
 assert.ok(progress['seal-hand']<progress.body&&progress['back-robe']<progress.body,`followthrough ${target}`);followthrough.push({target,...progress});
 for(const name of joints){maximumStartError=Math.max(maximumStartError,difference(start.transforms[name],released.transforms[name]));maximumEndError=Math.max(maximumEndError,difference(end.transforms[name],ready.transforms[name]));}
 for(let frame=0;frame<=12;frame++){
  const pose=sample(resetModel,clip,frame/100);minimumSoleHeight=Math.min(minimumSoleHeight,pose.bottom);
  assert.ok(pose.bottom>.004&&pose.bottom<.006,'both soles remain supported');
  for(const n of ['right-leg','left-leg'])assert.ok(difference(pose.transforms[n],start.transforms[n])<1e-7,'planted '+n);

 }
 for(let frame=0;frame<=48;frame++){
  const pose=sample(resetModel,clip,frame/400);maximumArmGap=Math.max(maximumArmGap,pose.armGap);assert.ok(pose.bottom>.004&&pose.bottom<.006);for(const n of ['right-leg','left-leg'])assert.ok(difference(pose.transforms[n],start.transforms[n])<1e-7);
 }
}
assert.ok(maximumArmGap*384/6.8<.5,`arm gap ${maximumArmGap}`);
assert.ok(maximumStartError<1e-5);assert.ok(maximumEndError<1e-5);
console.log(JSON.stringify({clips:1,joints:joints.length,authoredSamples:13,interpolatedSamples:49,maximumStartError,maximumEndError,minimumSoleHeight,maximumArmGap,followthrough,unchangedBattleRelease:.15,hashes:meta.files.length+3},null,2));
