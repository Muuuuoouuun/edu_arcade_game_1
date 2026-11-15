/** Inspect delivered transition clips against the original walk and cast GLBs. */
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
const [entryModel, walk, cast] = await Promise.all(['luna-entry', 'luna-druid-walk', 'luna-druid'].map(load));
const meta = JSON.parse(read('public/defense/models/luna-entry.json'));
for (const file of meta.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
for (const [path, hash] of [[meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ['art-source/defense/luna-druid-walk.blend', meta.source_walk_sha256], ['art-source/defense/luna-druid.blend', meta.source_cast_sha256]]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
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
 const socket=model.scene.getObjectByName('cast-socket').getWorldPosition(new Vector3()).toArray();
 let armGap=0;
 for(const side of ['staff','spell']){const upper=model.scene.getObjectByName(side+'-upper-arm'),fore=model.scene.getObjectByName(side+'-forearm'),hand=model.scene.getObjectByName(side+'-hand');const tip=n=>new Vector3(0,1,0).applyMatrix4(n.matrixWorld);armGap=Math.max(armGap,tip(upper).distanceTo(fore.getWorldPosition(new Vector3())),tip(fore).distanceTo(hand.getWorldPosition(new Vector3())));}
 mixer.stopAllAction(); mixer.uncacheRoot(model.scene);
 return { transforms, bottom, socket, armGap };
}
const difference = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
assert.equal(entryModel.animations.length, 8);
let minimumSoleHeight = Infinity, maximumStartError = 0, maximumCastError = 0, maximumSupportDrift = 0, maximumSocketError = 0, maximumArmGap = 0;
const castSamples = Array.from({ length: 34 }, (_, frame) => sample(cast, cast.animations[0], frame / 100));
for (let entry = 0; entry < 8; entry++) {
 const clip = entryModel.animations.find(animation => animation.name === `luna-entry-${entry}`);
 assert.ok(clip && Math.abs(clip.duration - .33) < 1e-6);
 const start = sample(entryModel, clip, 0), original = sample(walk, walk.animations[0], entry * .1);
 for (const name of joints) maximumStartError = Math.max(maximumStartError, difference(start.transforms[name], original.transforms[name]));
 const first = meta.entry_checks[entry].first_leg, second = first === 'left-leg' ? 'right-leg' : 'left-leg';
 for (let frame = 0; frame <= 33; frame++) {
  const pose = sample(entryModel, clip, frame / 100); minimumSoleHeight = Math.min(minimumSoleHeight, pose.bottom);
  assert.ok(pose.bottom > .004, `${entry}/${frame}: floor`);
  if (frame < 10) {
   const support = frame <= 5 ? second : first, expected = frame <= 5 ? start : castSamples[frame];
   maximumSupportDrift = Math.max(maximumSupportDrift, difference(pose.transforms[support], expected.transforms[support]));
  } else for (const name of joints) maximumCastError = Math.max(maximumCastError, difference(pose.transforms[name], castSamples[frame].transforms[name]));
  if(frame>=10)maximumSocketError=Math.max(maximumSocketError,difference(pose.socket,castSamples[frame].socket));
 }
 // Check interpolated positions between each pair of authored preparation keys.
 for (let step = 0; step <= 132; step++) {const pose=sample(entryModel,clip,step/400);maximumArmGap=Math.max(maximumArmGap,pose.armGap);assert.ok(pose.bottom>.004);const support=step<=20?second:first;if(step<=40){const expected=step<=20?start:castSamples[10];maximumSupportDrift=Math.max(maximumSupportDrift,difference(pose.transforms[support],expected.transforms[support]));}}
}
assert.ok(maximumArmGap*384/6.8<.5,`arm link gap ${maximumArmGap}`);
assert.ok(maximumSocketError<1e-5,`emerald socket after .10 ${maximumSocketError}`);
assert.ok(maximumStartError < 1e-5, `walk ${maximumStartError}`); assert.ok(maximumCastError < 1e-5, `cast ${maximumCastError}`); assert.ok(maximumSupportDrift < 1e-5);
console.log(JSON.stringify({ clips: 8, joints: joints.length, authoredSamples: 272, interpolatedSamples: 1064, maximumStartError, maximumCastError, maximumSupportDrift, maximumSocketError, maximumArmGap, minimumSoleHeight, unchangedRelease: .15, hashes: meta.files.length + 4 }, null, 2));
