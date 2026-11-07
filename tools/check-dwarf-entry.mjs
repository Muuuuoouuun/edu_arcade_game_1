/** Verify delivered Bron preparation against original walk/hammer GLBs. */
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
const [entryModel, walk, cast] = await Promise.all(['dwarf-entry', 'dwarf-locomotion', 'dwarf-hammer-sequence'].map(load));
const meta = JSON.parse(read('public/defense/models/dwarf-entry.json'));
for (const file of meta.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
for (const [path, hash] of [[meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ['art-source/defense/dwarf-locomotion.blend', meta.source_walk_sha256], ['art-source/defense/dwarf-hammer-sequence.blend', meta.source_cast_sha256]]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
const upper = ['body','head','hammer-arm','hammer-forearm','hammer','guard-arm'];
const legs = ['walk-right-leg','walk-left-leg'], joints = [...upper,...legs];
function sample(model, clip, time) {
 const mixer = new AnimationMixer(model.scene), action = mixer.clipAction(clip);
 action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.setTime(time); model.scene.updateMatrixWorld(true);
 const transforms = Object.fromEntries(joints.filter(name => model.scene.getObjectByName(name)).map(name => [name, model.scene.getObjectByName(name).matrixWorld.elements.slice()]));
 let bottom = Infinity;
 model.scene.traverse(node => {
  if (!node.isMesh) return;
  const positions = node.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) bottom = Math.min(bottom, new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).y);
 });
 mixer.stopAllAction(); mixer.uncacheRoot(model.scene);
 return { transforms, bottom };
}
const difference = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
assert.equal(entryModel.animations.length, 8);
let minimumHeight = Infinity, maximumStartError = 0, maximumCastError = 0, maximumSupportDrift = 0;
const castSamples = Array.from({ length: 53 }, (_, frame) => sample(cast, cast.animations[0], frame / 100));
for (let entry = 0; entry < 8; entry++) {
 const clip = entryModel.animations.find(animation => animation.name === `dwarf-entry-${entry}`);
 assert.ok(clip && Math.abs(clip.duration - .52) < 1e-6);
 const start = sample(entryModel, clip, 0), original = sample(walk, walk.animations[0], entry * .1), planted = sample(entryModel, clip, .16);
 for (const name of joints) maximumStartError = Math.max(maximumStartError, difference(start.transforms[name], original.transforms[name]));
 const first = meta.entry_checks[entry].first_leg, second = first === legs[0] ? legs[1] : legs[0];
 for (let frame = 0; frame <= 52; frame++) {
  const pose = sample(entryModel, clip, frame / 100); minimumHeight = Math.min(minimumHeight, pose.bottom);
  assert.ok(pose.bottom > .004, `${entry}/${frame}: floor`);
  if (frame < 16) {
   const support = frame <= 8 ? second : first, expected = frame <= 8 ? start : planted;
   maximumSupportDrift = Math.max(maximumSupportDrift, difference(pose.transforms[support], expected.transforms[support]));
  } else {
   for (const name of upper) maximumCastError = Math.max(maximumCastError, difference(pose.transforms[name], castSamples[frame].transforms[name]));
   for (const name of legs) maximumSupportDrift = Math.max(maximumSupportDrift, difference(pose.transforms[name], planted.transforms[name]));
  }
 }
 // Interpolated transforms must retain contact; authored keys alone cannot establish it.
 for (let step = 0; step <= 64; step++) {
  const pose = sample(entryModel, clip, step / 400), support = step <= 32 ? second : first, expected = step <= 32 ? start : planted;
  assert.ok(pose.bottom > .004);maximumSupportDrift = Math.max(maximumSupportDrift, difference(pose.transforms[support], expected.transforms[support]));
 }
}
assert.ok(maximumStartError < 1e-5, `walk ${maximumStartError}`);
assert.ok(maximumCastError < 1e-5, `hammer ${maximumCastError}`);
assert.ok(maximumSupportDrift < 1e-5, `support ${maximumSupportDrift}`);
console.log(JSON.stringify({ clips: 8, joints: joints.length, authoredSamples: 424, interpolatedPreparationSamples: 520, maximumStartError, maximumCastError, maximumSupportDrift, minimumHeight, unchangedHitAt: .24, hashes: meta.files.length + 4 }, null, 2));
