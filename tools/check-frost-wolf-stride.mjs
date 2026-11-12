/** Verify the delivered GLB, common-camera frames and hashes independently of Blender. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { AnimationMixer, LoopOnce, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const read = path => readFileSync(new URL('../' + path, import.meta.url));
const meta = JSON.parse(read('public/defense/models/frost-wolf-stride.json'));
for (const [path, hash] of [[meta.source, meta.source_sha256], [meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ...meta.files.map(f => [f.file, f.sha256])]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash, path);
const bytes = read('public/defense/models/frost-wolf-stride.glb');
const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
assert.equal(model.animations.length, 1);
const clip = model.animations[0]; assert.equal(clip.name, 'frost-wolf-stride'); assert.ok(Math.abs(clip.duration - .8) < 1e-6);
assert.equal(new Set(clip.tracks.map(t => t.name.split('.')[0])).size, 17);
const mixer = new AnimationMixer(model.scene), action = mixer.clipAction(clip);
action.setLoop(LoopOnce, 1); action.clampWhenFinished = true;
let maxPositionError = 0, maxTilt = 0, lowestPaw = Infinity, peakLift = 0, meshes = 0, triangles = 0;
model.scene.traverse(n => { if (n.isMesh) { meshes++; triangles += (n.geometry.index?.count ?? n.geometry.attributes.position.count) / 3; } });
const snapshot = time => { action.reset().play(); mixer.setTime(time); model.scene.updateMatrixWorld(true); const result = new Map(); model.scene.traverse(n => result.set(n.name, n.matrixWorld.elements.slice())); return result; };
const initial = snapshot(0);
for (const sample of meta.samples) {
 snapshot(sample.cycle * .8);
 for (const [key, foot] of Object.entries(sample.feet)) {
  const node = model.scene.getObjectByName('foot-' + key); assert.ok(node);
  const target = new Vector3(foot.target[0], foot.target[2], -foot.target[1]);
  maxPositionError = Math.max(maxPositionError, node.getWorldPosition(new Vector3()).distanceTo(target));
  maxTilt = Math.max(maxTilt, new Vector3(0, 1, 0).transformDirection(node.matrixWorld).angleTo(new Vector3(0, 1, 0)));
  peakLift = Math.max(peakLift, node.getWorldPosition(new Vector3()).y - meta.foot_center_height);
  const paw = model.scene.getObjectByName('paw-' + key); assert.ok(paw?.isMesh);
  const vertices = paw.geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) lowestPaw = Math.min(lowestPaw, new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(paw.matrixWorld).y);
 }
}
assert.ok(maxPositionError < 1e-5, `position ${maxPositionError}`); assert.ok(maxTilt < 1e-5, `tilt ${maxTilt}`); assert.ok(lowestPaw >= -1e-5); assert.ok(peakLift > .21);
// GLTF uses quaternion interpolation between sampled keys; inspect those intervals too.
let interpolationTilt = 0, interpolationFloor = Infinity;
for (let step = 0; step <= 320; step++) {
 snapshot(step / 400);
 for (const key of Object.keys(meta.samples[0].feet)) {
  const foot = model.scene.getObjectByName('foot-' + key);
  interpolationTilt = Math.max(interpolationTilt, new Vector3(0, 1, 0).transformDirection(foot.matrixWorld).angleTo(new Vector3(0, 1, 0)));
  const paw = model.scene.getObjectByName('paw-' + key), vertices = paw.geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) interpolationFloor = Math.min(interpolationFloor, new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(paw.matrixWorld).y);
 }
}
assert.ok(interpolationTilt < 1e-5); assert.ok(interpolationFloor > -.001);
const final = snapshot(.8); let loopError = 0;
for (const [name, matrix] of initial) loopError = Math.max(loopError, ...matrix.map((v, i) => Math.abs(v - final.get(name)[i])));
assert.ok(loopError < 1e-5);
assert.equal(meta.directions.length, 8); assert.equal(meta.files.filter(f => f.file.endsWith('.webp')).length, 8); assert.equal(meta.files.filter(f => f.file.startsWith('art-source/')).length, 64);
for (const d of meta.directions) { assert.equal(d.poses.length, 8); assert.ok(d.stride_per_display_size > 0); for (const p of d.poses) { const [x, y, right, bottom] = p.bounds; assert.ok(x > 8 && y > 40 && right < 376 && bottom < 344); } }
console.log(JSON.stringify({ clip: clip.name, duration: clip.duration, animatedJoints: 17, meshes, triangles, samples: meta.samples.length, maxPositionError, maxTilt, lowestPaw, peakLift, loopError, interpolationSamples: 321, interpolationTilt, interpolationFloor, filesHashed: meta.files.length + 3 }, null, 2));
