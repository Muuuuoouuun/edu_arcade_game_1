/** Verify delivered Kar preparation against original walk/hammer GLBs. */
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
const [entryModel, walk, cast] = await Promise.all(['kar-entry', 'kar-barbarian-walk', 'kar-barbarian'].map(load));
const meta = JSON.parse(read('public/defense/models/kar-entry.json'));
for (const file of meta.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
for (const [path, hash] of [[meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ['art-source/defense/kar-barbarian-walk.blend', meta.source_walk_sha256], ['art-source/defense/kar-barbarian.blend', meta.source_cast_sha256]]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
const upper = ['body','head','fur-mantle','beard','war-hammer','left-upper','left-forearm','right-upper','right-forearm'];
const legs = ['right-foot','left-foot'], joints = [...upper,...legs];
function sample(model, clip, time) {
 const mixer = new AnimationMixer(model.scene), action = mixer.clipAction(clip);
 action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.setTime(time); model.scene.updateMatrixWorld(true);
 const transforms = Object.fromEntries(joints.filter(name => model.scene.getObjectByName(name)).map(name => [name, model.scene.getObjectByName(name).matrixWorld.elements.slice()]));
 let bottom = Infinity, gripError=0;
 for(const [i,side] of ['left','right'].entries()){
  const upper=model.scene.getObjectByName(side+'-upper'),fore=model.scene.getObjectByName(side+'-forearm'),grip=model.scene.getObjectByName(i===0?'upper-grip':'lower-grip'),body=model.scene.getObjectByName('body');
  const shoulder=new Vector3(i===0?-.77:.77,1.17,0).applyMatrix4(body.matrixWorld);
  gripError=Math.max(gripError,shoulder.distanceTo(new Vector3().setFromMatrixPosition(upper.matrixWorld)),new Vector3(0,1,0).applyMatrix4(upper.matrixWorld).distanceTo(new Vector3().setFromMatrixPosition(fore.matrixWorld)),new Vector3(0,1,0).applyMatrix4(fore.matrixWorld).distanceTo(new Vector3().setFromMatrixPosition(grip.matrixWorld)));
 }

 model.scene.traverse(node => {
  if (!node.isMesh) return;
  const positions = node.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) bottom = Math.min(bottom, new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).y);
 });
 mixer.stopAllAction(); mixer.uncacheRoot(model.scene);
 return { transforms, bottom, gripError };
}
const difference = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
assert.equal(entryModel.animations.length, 8);
let minimumHeight = Infinity, maximumStartError = 0, maximumCastError = 0, maximumSupportDrift = 0, maximumGripError = 0;
const castSamples = Array.from({ length: 57 }, (_, frame) => sample(cast, cast.animations[0], frame / 100));
for (let entry = 0; entry < 8; entry++) {
 const clip = entryModel.animations.find(animation => animation.name === `kar-entry-${entry}`);
 assert.ok(clip && Math.abs(clip.duration - .56) < 1e-6);
 const start = sample(entryModel, clip, 0), original = sample(walk, walk.animations[0], entry * .1), planted = sample(entryModel, clip, .18);
 for (const name of joints) maximumStartError = Math.max(maximumStartError, difference(start.transforms[name], original.transforms[name]));
 const first = meta.entry_checks[entry].first_leg, second = first === legs[0] ? legs[1] : legs[0];
 for (let frame = 0; frame <= 56; frame++) {
  const pose = sample(entryModel, clip, frame / 100); minimumHeight = Math.min(minimumHeight, pose.bottom);maximumGripError=Math.max(maximumGripError,pose.gripError);
  assert.ok(pose.bottom > .004, `${entry}/${frame}: floor`);
  if (frame < 18) {
   const support = frame <= 9 ? second : first, expected = frame <= 9 ? start : planted;
   maximumSupportDrift = Math.max(maximumSupportDrift, difference(pose.transforms[support], expected.transforms[support]));
  } else {
   for (const name of upper) maximumCastError = Math.max(maximumCastError, difference(pose.transforms[name], castSamples[frame].transforms[name]));
   for (const name of legs) maximumSupportDrift = Math.max(maximumSupportDrift, difference(pose.transforms[name], planted.transforms[name]));
  }
 }
 // Interpolated transforms must retain contact; authored keys alone cannot establish it.
 for (let step = 0; step <= 72; step++) {
  const pose = sample(entryModel, clip, step / 400), support = step <= 36 ? second : first, expected = step <= 36 ? start : planted;
  maximumGripError=Math.max(maximumGripError,pose.gripError);assert.ok(pose.bottom > .004);maximumSupportDrift = Math.max(maximumSupportDrift, difference(pose.transforms[support], expected.transforms[support]));
 }
}
assert.ok(maximumStartError < 1e-5, `walk ${maximumStartError}`);
assert.ok(maximumCastError < 1e-5, `hammer ${maximumCastError}`);
assert.ok(maximumSupportDrift < 1e-5, `support ${maximumSupportDrift}`);
assert.ok(maximumGripError*384/6.8 < .5, `grip projected gap ${maximumGripError*384/6.8}`);
console.log(JSON.stringify({ clips: 8, joints: joints.length, authoredSamples: 456, interpolatedPreparationSamples: 584, maximumStartError, maximumCastError, maximumSupportDrift, minimumHeight, maximumGripError, projectedGripGap:maximumGripError*384/6.8, unchangedHitAt: .28, hashes: meta.files.length + 4 }, null, 2));
