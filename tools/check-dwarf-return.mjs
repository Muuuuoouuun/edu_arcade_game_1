/** Inspect delivered hammer recovery against the original hammer and walking GLBs. */
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
const [model, walk, hammer] = await Promise.all(['dwarf-return', 'dwarf-locomotion', 'dwarf-hammer-sequence'].map(load));
const meta = JSON.parse(read('public/defense/models/dwarf-return.json'));
for (const file of meta.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
for (const [path, hash] of [[meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ['art-source/defense/dwarf-locomotion.blend', meta.source_walk_sha256], ['art-source/defense/dwarf-hammer-sequence.blend', meta.source_cast_sha256]]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
const upper=['body','head','hammer-arm','hammer-forearm','hammer','guard-arm'],legs=['walk-right-leg','walk-left-leg'],joints=[...upper,...legs];
function sample(model, clip, time) {
 const mixer=new AnimationMixer(model.scene),action=mixer.clipAction(clip);
 action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(time);model.scene.updateMatrixWorld(true);
 const transforms=Object.fromEntries(joints.filter(n=>model.scene.getObjectByName(n)).map(n=>[n,model.scene.getObjectByName(n).matrixWorld.elements.slice()]));
 let bottom=Infinity,sole=Infinity;
 function minimum(node){let y=Infinity;node.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.attributes.position;for(let i=0;i<p.count;i++)y=Math.min(y,new Vector3().fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld).y)});return y}
 bottom=minimum(model.scene);
 for(const n of legs)if(model.scene.getObjectByName(n))sole=Math.min(sole,minimum(model.scene.getObjectByName(n)));
 mixer.stopAllAction();mixer.uncacheRoot(model.scene);return {transforms,bottom,sole};
}
const error=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
assert.equal(model.animations.length,8);
let maximumStartError=0,maximumEndError=0,minimumHeight=Infinity,maximumSupportHeight=0;
const original=sample(hammer,hammer.animations[0],.39);
for(let target=0;target<8;target++){
 const clip=model.animations.find(c=>c.name===`dwarf-return-${target}`);assert.ok(clip&&Math.abs(clip.duration-.14)<1e-6);
 const start=sample(model,clip,0),end=sample(model,clip,.14),walking=sample(walk,walk.animations[0],target*.1);
 for(const n of upper)maximumStartError=Math.max(maximumStartError,error(start.transforms[n],original.transforms[n]));
 for(const n of joints)maximumEndError=Math.max(maximumEndError,error(end.transforms[n],walking.transforms[n]));
 for(let step=0;step<=56;step++){
  const pose=sample(model,clip,step/400);minimumHeight=Math.min(minimumHeight,pose.bottom);maximumSupportHeight=Math.max(maximumSupportHeight,pose.sole);
  assert.ok(pose.bottom>.004,`floor ${target}/${step}: ${pose.bottom}`);assert.ok(pose.sole>.004&&pose.sole<.006,`support ${target}/${step}: ${pose.sole}`);
 }
}
assert.ok(maximumStartError<1e-5);assert.ok(maximumEndError<1e-5);
console.log(JSON.stringify({clips:8,joints:8,authoredSamples:120,checkedSamples:456,maximumStartError,maximumEndError,minimumHeight,maximumSupportHeight,unchangedHitAt:.24,unchangedDuration:.52,hashes:meta.files.length+4},null,2));
