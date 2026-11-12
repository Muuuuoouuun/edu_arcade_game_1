/** Verify delivered animation geometry against the existing walk and cast GLBs. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { AnimationMixer, LoopOnce, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function load(name) {
 const data = readFileSync(new URL(`../public/defense/models/${name}.glb`, import.meta.url));
 return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
}
const [stop, walk, cast] = await Promise.all(['ian-stop', 'ian-mage-walk', 'ian-mage'].map(load));
const joints = ['body', 'head', 'staff-arm', 'staff-hand', 'spell-arm', 'cape', 'right-leg', 'left-leg'];
function sample(model, clip, time) {
 const mixer = new AnimationMixer(model.scene), action = mixer.clipAction(clip);
 action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.setTime(time);
 model.scene.updateMatrixWorld(true);
 const transforms = Object.fromEntries(joints.map(name => {
  const node = model.scene.getObjectByName(name);
  return [name, { position: node.position.toArray(), rotation: node.quaternion.toArray(), world: node.getWorldPosition(new Vector3()).toArray() }];
 }));
 let bottom = Infinity;
 for (const name of ['right-leg', 'left-leg']) model.scene.getObjectByName(name).traverse(node => {
  if (!node.isMesh) return;
  const positions = node.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) bottom = Math.min(bottom, new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).y);
 });
 mixer.stopAllAction(); mixer.uncacheRoot(model.scene);
 return { transforms, bottom };
}
function equalVector(actual, expected, message) {
 actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-5, `${message}: ${actual} != ${expected}`));
}
assert.equal(stop.animations.length, 8);
const neutral = sample(cast, cast.animations[0], 0).transforms;
let minimumSoleHeight = Infinity;
for (let entry = 0; entry < 8; entry++) {
 const clip = stop.animations.find(animation => animation.name === `ian-stop-${entry}`);
 assert.ok(clip && Math.abs(clip.duration - .24) < 1e-6);
 const start = sample(stop, clip, 0).transforms, original = sample(walk, walk.animations[0], entry * .1).transforms, end = sample(stop, clip, .24).transforms;
 for (const name of joints) for (const property of ['position', 'rotation']) {
  equalVector(start[name][property], original[name][property], `${entry}/${name}/walk ${property}`);
  equalVector(end[name][property], neutral[name][property], `${entry}/${name}/neutral ${property}`);
 }
 const first = entry < 4 ? 'left-leg' : 'right-leg', second = entry < 4 ? 'right-leg' : 'left-leg';
 for (let frame = 0; frame <= 24; frame++) {
  const pose = sample(stop, clip, frame / 100), support = frame <= 12 ? second : first;
  minimumSoleHeight = Math.min(minimumSoleHeight, pose.bottom);
  assert.ok(pose.bottom > .004, `${entry}/${frame}: sole penetrates floor`);
  equalVector(pose.transforms[support].world, (frame <= 12 ? start : neutral)[support].world, `${entry}/${frame}/support`);
 }
}
console.log(JSON.stringify({ clips: 8, samples: 200, matchesWalkAndNeutral: true, supportStationary: true, minimumSoleHeight }, null, 2));
