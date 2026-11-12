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
const [entryModel, walk, cast] = await Promise.all(['riel-entry', 'riel-archer-walk', 'riel-archer'].map(load));
const meta = JSON.parse(read('public/defense/models/riel-entry.json'));
for (const file of meta.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
for (const [path, hash] of [[meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ['art-source/defense/riel-archer-walk.blend', meta.source_walk_sha256], ['art-source/defense/riel-archer.blend', meta.source_cast_sha256]]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
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
 let linkGap = 0;
 const point = (name, tip = false) => new Vector3(0, tip ? 1 : 0, 0).applyMatrix4(model.scene.getObjectByName(name).matrixWorld);
 for (let i = 0; i < 7; i++) linkGap = Math.max(linkGap, point('bow-limb-' + i, true).distanceTo(point('bow-limb-' + (i + 1))));
 for (const [a, tipA, b, tipB] of [['bow-string-0',false,'bow-limb-0',false],['bow-string-0',true,'bow-string-1',false],['bow-string-1',true,'bow-limb-7',true]]) linkGap = Math.max(linkGap, point(a,tipA).distanceTo(point(b,tipB)));
 const arrowScale = model.scene.getObjectByName('nocked-arrow').scale.toArray();
 mixer.stopAllAction(); mixer.uncacheRoot(model.scene);
 return { transforms, bottom, arrowScale, linkGap };
}
const difference = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
assert.equal(entryModel.animations.length, 8);
let minimumSoleHeight = Infinity, maximumStartError = 0, maximumCastError = 0, maximumSupportDrift = 0, maximumLinkGap = 0, maximumInterpolatedLinkGap = 0;
const castSamples = Array.from({ length: 29 }, (_, frame) => sample(cast, cast.animations[0], frame / 100));
for (let entry = 0; entry < 8; entry++) {
 const clip = entryModel.animations.find(animation => animation.name === `riel-entry-${entry}`);
 assert.ok(clip && Math.abs(clip.duration - .28) < 1e-6);
 const start = sample(entryModel, clip, 0), original = sample(walk, walk.animations[0], entry * .1);
 for (const name of joints) maximumStartError = Math.max(maximumStartError, difference(start.transforms[name], original.transforms[name]));
 const first = meta.entry_checks[entry].first_leg, second = first === 'left-leg' ? 'right-leg' : 'left-leg';
 for (let frame = 0; frame <= 28; frame++) {
  const pose = sample(entryModel, clip, frame / 100); minimumSoleHeight = Math.min(minimumSoleHeight, pose.bottom);
  maximumLinkGap = Math.max(maximumLinkGap, pose.linkGap);
  assert.ok(pose.bottom > .004, `${entry}/${frame}: floor`);
  if (frame < 8) {
   const support = frame <= 4 ? second : first, expected = frame <= 4 ? start : castSamples[frame];
   maximumSupportDrift = Math.max(maximumSupportDrift, difference(pose.transforms[support], expected.transforms[support]));
  } else for (const name of joints) maximumCastError = Math.max(maximumCastError, difference(pose.transforms[name], castSamples[frame].transforms[name]));
  assert.ok(difference(pose.arrowScale, castSamples[frame].arrowScale) < 1e-5, 'nocked arrow release timing');
 }
 // Check interpolated positions between each pair of authored preparation keys.
 for (let step = 0; step <= 32; step++) {const pose=sample(entryModel,clip,step/400);assert.ok(pose.bottom>.004);maximumInterpolatedLinkGap=Math.max(maximumInterpolatedLinkGap,pose.linkGap);}
}
// Bound linear-rotation interpolation error to half a pixel at the full source camera.
const maximumProjectedLinkGap = maximumInterpolatedLinkGap * meta.frame.height / meta.frame.orthographic_scale;
assert.ok(maximumProjectedLinkGap < .5, `interpolated bow gap ${maximumProjectedLinkGap}px`);
assert.ok(maximumLinkGap < 1e-5, `bow linkage ${maximumLinkGap}`);
assert.ok(maximumStartError < 1e-5, `walk ${maximumStartError}`); assert.ok(maximumCastError < 1e-5, `cast ${maximumCastError}`); assert.ok(maximumSupportDrift < 1e-5);
console.log(JSON.stringify({ clips: 8, joints: joints.length, authoredSamples: 232, interpolatedPreparationSamples: 264, maximumStartError, maximumCastError, maximumSupportDrift, maximumLinkGap, maximumInterpolatedLinkGap, maximumProjectedLinkGap, minimumSoleHeight, unchangedRelease: .1, hashes: meta.files.length + 4 }, null, 2));
