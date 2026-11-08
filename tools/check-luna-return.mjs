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
const [entryModel, walk, cast] = await Promise.all(['luna-return', 'luna-druid-walk', 'luna-druid'].map(load));
const meta = JSON.parse(read('public/defense/models/luna-return.json'));
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
 let armGap=0;for(const side of ['staff','spell']){const upper=model.scene.getObjectByName(side+'-upper-arm'),fore=model.scene.getObjectByName(side+'-forearm'),hand=model.scene.getObjectByName(side+'-hand');const tip=n=>new Vector3(0,1,0).applyMatrix4(n.matrixWorld);armGap=Math.max(armGap,tip(upper).distanceTo(fore.getWorldPosition(new Vector3())),tip(fore).distanceTo(hand.getWorldPosition(new Vector3())));}
 const palm=model.scene.getObjectByName('staff-hand').position.clone();
 const rotations=Object.fromEntries(['body','staff-hand','leaf-cape','living-staff'].map(n=>[n,model.scene.getObjectByName(n).quaternion.clone()]));
 mixer.stopAllAction(); mixer.uncacheRoot(model.scene);
 return { transforms, bottom, rotations, palm, armGap };
}
const difference = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
assert.equal(entryModel.animations.length, 8);
let minimumSoleHeight=Infinity,maximumStartError=0,maximumEndError=0,maximumArmGap=0;
const released=sample(cast,cast.animations[0],.15);
const followthrough=[];
for(let target=0;target<8;target++){
 const clip=entryModel.animations.find(a=>a.name===`luna-return-${target}`);assert.ok(clip&&Math.abs(clip.duration-.12)<1e-6);
 const start=sample(entryModel,clip,0),end=sample(entryModel,clip,.12),walking=sample(walk,walk.animations[0],target*.1);
 const early=sample(entryModel,clip,.04),progress={};for(const n of ['body','staff-hand','leaf-cape','living-staff'])progress[n]=n==='staff-hand'?start.palm.distanceTo(early.palm)/start.palm.distanceTo(end.palm):start.rotations[n].angleTo(early.rotations[n])/start.rotations[n].angleTo(end.rotations[n]);
 assert.ok(progress['staff-hand']<progress.body&&progress['leaf-cape']<progress.body&&progress['living-staff']<progress.body,`followthrough ${target}`);followthrough.push({target,...progress});
 for(const name of joints){maximumStartError=Math.max(maximumStartError,difference(start.transforms[name],released.transforms[name]));maximumEndError=Math.max(maximumEndError,difference(end.transforms[name],walking.transforms[name]));}
 for(let frame=0;frame<=12;frame++){
  const pose=sample(entryModel,clip,frame/100);minimumSoleHeight=Math.min(minimumSoleHeight,pose.bottom);
  assert.ok(pose.bottom>.004&&pose.bottom<.006,'at least one sole supports without floor penetration');

 }
 for(let frame=0;frame<=48;frame++){
  const pose=sample(entryModel,clip,frame/400);maximumArmGap=Math.max(maximumArmGap,pose.armGap);assert.ok(pose.bottom>.004&&pose.bottom<.006);
 }
}
assert.ok(maximumArmGap*384/6.8<.5,`arm gap ${maximumArmGap}`);
assert.ok(maximumStartError<1e-5);assert.ok(maximumEndError<1e-5);
console.log(JSON.stringify({clips:8,joints:joints.length,authoredSamples:104,interpolatedSamples:392,maximumStartError,maximumEndError,minimumSoleHeight,maximumArmGap,followthrough,unchangedBattleRelease:.15,hashes:meta.files.length+4},null,2));
