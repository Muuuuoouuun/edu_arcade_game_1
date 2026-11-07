/** Inspect the delivered GLB, including the discrete three-bolt release and feed sweep. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { AnimationMixer, LoopOnce } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const bytes = readFileSync(new URL('../public/defense/models/rapid-crossbow-lv3-action.glb', import.meta.url));
const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
assert.equal(model.animations.length, 1);
const clip = model.animations[0];
assert.equal(clip.name, 'rapid-feed-release'); assert.ok(Math.abs(clip.duration - .34) < 1e-6);
const mixer = new AnimationMixer(model.scene), action = mixer.clipAction(clip);
action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
const root = model.scene.getObjectByName('rapid-crossbow-lv3');
const moving = ['bow-left', 'bow-right', 'string-left', 'string-right', 'loaded-bolt', 'magazine-feed', 'magazine-lever', 'rewind-left', 'rewind-right', 'volley-shuttle'];
const snapshot = time => {
 action.reset().play(); mixer.setTime(time); model.scene.updateMatrixWorld(true);
 const matrices = new Map(); model.scene.traverse(node => matrices.set(node.name, node.matrixWorld.elements.slice())); return matrices;
};
const initial = snapshot(0), fixed = root.children.filter(node => node.isMesh), changed = new Set();
assert.ok(fixed.length >= 5);
const drift = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
let foundationDrift = 0;
for (let frame = 0; frame <= 34; frame++) {
 const current = snapshot(frame / 100);
 for (const node of fixed) foundationDrift = Math.max(foundationDrift, drift(initial.get(node.name), current.get(node.name)));
 for (const name of moving) if (drift(initial.get(name), current.get(name)) > 1e-5) changed.add(name);
}
assert.ok(foundationDrift < 1e-6);
for (const name of moving) assert.ok(changed.has(name), `${name} must animate`);
const final = snapshot(.34); let returnDrift = 0;
for (const [name, values] of initial) returnDrift = Math.max(returnDrift, drift(values, final.get(name)));
assert.ok(returnDrift < 1e-5);
for (const time of [0, .09, .099, .1001, .14, .18, .259, .2601, .30, .34]) {
 snapshot(time);
 const scale = model.scene.getObjectByName('loaded-bolt').scale.x, expected = time >= .1 && time < .26 ? .001 : 1;
 assert.ok(Math.abs(scale - expected) < 1e-5, `discrete loaded volley at ${time}: ${scale}`);
}
console.log(JSON.stringify({ clip: clip.name, duration: clip.duration, samples: 35, movingJoints: [...changed], fixedMeshes: fixed.length, foundationDrift, returnDrift, discreteVolleyRelease: true }, null, 2));
