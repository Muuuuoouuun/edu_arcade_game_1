/** Inspect the shipped siege cannon GLB rather than its generator's expectations. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { AnimationMixer, LoopOnce } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const bytes = readFileSync(new URL('../public/defense/models/crush-cannon-lv3-action.glb', import.meta.url));
const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
assert.equal(model.animations.length, 1);
const clip = model.animations[0];
assert.equal(clip.name, 'crush-cannon-fire'); assert.ok(Math.abs(clip.duration - .52) < 1e-6);
const mixer = new AnimationMixer(model.scene), action = mixer.clipAction(clip);
action.setLoop(LoopOnce, 1); action.clampWhenFinished = true;
const root = model.scene.getObjectByName('crush-cannon-lv3'), barrel = model.scene.getObjectByName('barrel');
assert.ok(root && barrel);
const snapshot = time => {
 action.reset().play(); mixer.setTime(time); model.scene.updateMatrixWorld(true);
 const matrices = new Map(); model.scene.traverse(node => matrices.set(node.name, node.matrixWorld.elements.slice())); return matrices;
};
const initial = snapshot(0), fixed = [];
model.scene.traverse(node => {
 if (!node.isMesh) return;
 for (let parent = node; parent; parent = parent.parent) if (parent === barrel) return;
 fixed.push(node);
});
assert.ok(fixed.length >= 10);
const drift = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
let fixedDrift = 0, peakRecoil = 0;
for (let frame = 0; frame <= 52; frame++) {
 const current = snapshot(frame / 100);
 for (const node of fixed) fixedDrift = Math.max(fixedDrift, drift(initial.get(node.name), current.get(node.name)));
 const recoil = drift(initial.get('barrel'), current.get('barrel'));
 if (frame <= 28) assert.ok(recoil < 1e-6, `early recoil at ${frame}`);
 peakRecoil = Math.max(peakRecoil, recoil);
}
assert.ok(fixedDrift < 1e-6); assert.ok(peakRecoil > .1);
const final = snapshot(.52); let returnDrift = 0;
for (const [name, values] of initial) returnDrift = Math.max(returnDrift, drift(values, final.get(name)));
assert.ok(returnDrift < 1e-5);
for (const time of [.27, .275, .279, .28, .285, .29]) {
 const current = snapshot(time), recoil = drift(initial.get('barrel'), current.get('barrel'));
 if (time <= .28) assert.ok(recoil < 1e-6); else assert.ok(recoil > .01);
}
console.log(JSON.stringify({clip: clip.name, duration: clip.duration, samples: 53, fixedMeshes: fixed.length, fixedDrift, peakRecoil, returnDrift, delayedRecoil: true}, null, 2));
