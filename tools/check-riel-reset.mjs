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
const [entryModel, cast] = await Promise.all(['riel-reset', 'riel-archer'].map(load));
const meta = JSON.parse(read('public/defense/models/riel-reset.json'));
for (const file of meta.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
for (const [path, hash] of [[meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ['art-source/defense/riel-archer.blend', meta.source_cast_sha256]]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
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
 const armGap=Math.max(point('draw-upper-arm',true).distanceTo(point('draw-forearm')),point('draw-forearm',true).distanceTo(point('draw-hand')));
 const arrowScale = model.scene.getObjectByName('nocked-arrow').scale.toArray();
 mixer.stopAllAction(); mixer.uncacheRoot(model.scene);
 return { transforms, bottom, arrowScale, linkGap, armGap, nockGap:point('draw-hand').distanceTo(point('nocked-arrow')) };
}
const difference = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
assert.equal(entryModel.animations.length, 1);
let minimumSoleHeight=Infinity,maximumStartError=0,maximumEndError=0,maximumLinkGap=0,maximumInterpolatedLinkGap=0,maximumArmGap=0;
// glTF stores float32 times: its discrete release key is just above decimal .1.
const releaseKey=Array.from(cast.animations[0].tracks.find(t=>t.name==='nocked-arrow.scale').times).find(t=>t>=.1-1e-6);
assert.ok(releaseKey!==undefined&&Math.abs(releaseKey-.1)<1e-6);
const released=sample(cast,cast.animations[0],releaseKey);
for(let target=0;target<1;target++){
 const clip=entryModel.animations.find(a=>a.name===`riel-reset-${target}`);assert.ok(clip&&Math.abs(clip.duration-.12)<1e-6);
 const start=sample(entryModel,clip,0),end=sample(entryModel,clip,.12),walking=sample(cast,cast.animations[0],0);
 for(const name of joints){maximumStartError=Math.max(maximumStartError,difference(start.transforms[name],released.transforms[name]));maximumEndError=Math.max(maximumEndError,difference(end.transforms[name],walking.transforms[name]));}
 for(let frame=0;frame<=12;frame++){
  const pose=sample(entryModel,clip,frame/100);minimumSoleHeight=Math.min(minimumSoleHeight,pose.bottom);maximumLinkGap=Math.max(maximumLinkGap,pose.linkGap);
  assert.ok(pose.bottom>.004&&pose.bottom<.006,'planted sole supports without floor penetration');
  for(const leg of ['right-leg','left-leg'])assert.ok(difference(pose.transforms[leg],released.transforms[leg])<1e-6,'both feet stay planted');
  if(frame>=6)assert.ok(pose.nockGap<1e-5,'drawing hand reaches the nock by reload');
  assert.ok(difference(pose.arrowScale,frame<6?released.arrowScale:walking.arrowScale)<1e-5,`reload ${target}/${frame}: ${pose.arrowScale} expected ${frame<6?released.arrowScale:walking.arrowScale}`);
 }
 for(let frame=0;frame<=48;frame++){
  const pose=sample(entryModel,clip,frame/400);assert.ok(pose.bottom>.004&&pose.bottom<.006);maximumInterpolatedLinkGap=Math.max(maximumInterpolatedLinkGap,pose.linkGap);maximumArmGap=Math.max(maximumArmGap,pose.armGap);
 }
}
const maximumProjectedLinkGap=maximumInterpolatedLinkGap*meta.frame.height/meta.frame.orthographic_scale;
assert.ok(maximumArmGap<.002);assert.ok(maximumProjectedLinkGap<.5);assert.ok(maximumLinkGap<1e-5);assert.ok(maximumStartError<1e-5);assert.ok(maximumEndError<1e-5);
console.log(JSON.stringify({clips:1,joints:joints.length,authoredSamples:13,interpolatedSamples:49,maximumStartError,maximumEndError,minimumSoleHeight,maximumArmGap,maximumLinkGap,maximumProjectedLinkGap,reloadAt:.06,battleReloadAt:.22,hashes:meta.files.length+3},null,2));
