/** Inspect grounded stops against the original walking stances and neutral boots. */
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
const [model, walk] = await Promise.all(['dwarf-stop', 'dwarf-locomotion'].map(load));
const meta = JSON.parse(read('public/defense/models/dwarf-stop.json'));
for (const file of meta.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
for (const [path, hash] of [[meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ['art-source/defense/dwarf-locomotion.blend', meta.source_walk_sha256]]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
const upper=['body','head','hammer-arm','hammer-forearm','hammer','guard-arm'],legs=['walk-right-leg','walk-left-leg'],joints=[...upper,...legs];
function sample(model, clip, time, neutral=false) {
 const mixer=new AnimationMixer(model.scene),action=mixer.clipAction(clip);
 action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(time);if(neutral)for(const [n,x] of [['walk-right-leg',-.43],['walk-left-leg',.43]])model.scene.getObjectByName(n).position.set(x,1.05,0);model.scene.updateMatrixWorld(true);
 const transforms=Object.fromEntries(joints.filter(n=>model.scene.getObjectByName(n)).map(n=>[n,model.scene.getObjectByName(n).matrixWorld.elements.slice()]));
 let bottom=Infinity,sole=Infinity;
 function minimum(node){let y=Infinity;node.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.attributes.position;for(let i=0;i<p.count;i++)y=Math.min(y,new Vector3().fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld).y)});return y}
 bottom=minimum(model.scene);
 for(const n of legs)if(model.scene.getObjectByName(n))sole=Math.min(sole,minimum(model.scene.getObjectByName(n)));
 const rotations=Object.fromEntries(upper.map(n=>[n,model.scene.getObjectByName(n).quaternion.clone()]));mixer.stopAllAction();mixer.uncacheRoot(model.scene);return {transforms,bottom,sole,rotations};
}
const error=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
assert.equal(model.animations.length,8);
let maximumStartError=0,maximumEndError=0,minimumHeight=Infinity,maximumSupportDrift=0;
const neutral=sample(walk,walk.animations[0],0,true),followthrough=[];
for(let entry=0;entry<8;entry++){
 const clip=model.animations.find(c=>c.name===`dwarf-stop-${entry}`);assert.ok(clip&&Math.abs(clip.duration-.24)<1e-6);
 const start=sample(model,clip,0),end=sample(model,clip,.24),original=sample(walk,walk.animations[0],entry*.1);
 for(const n of joints){maximumStartError=Math.max(maximumStartError,error(start.transforms[n],original.transforms[n]));maximumEndError=Math.max(maximumEndError,error(end.transforms[n],neutral.transforms[n]));}
 const first=meta.entry_checks[entry].first_leg,second=first==='walk-left-leg'?'walk-right-leg':'walk-left-leg';
 for(let step=0;step<=96;step++){
  const time=step/400,pose=sample(model,clip,time),support=time<=.12?second:first,expected=time<=.12?start:neutral;
  minimumHeight=Math.min(minimumHeight,pose.bottom);assert.ok(pose.bottom>.004,`floor ${entry}/${step}`);assert.ok(pose.sole>.004&&pose.sole<.006,`support ${entry}/${step}`);
  maximumSupportDrift=Math.max(maximumSupportDrift,error(pose.transforms[support],expected.transforms[support]));
 }
 const late=sample(model,clip,.16),trunk=late.rotations.body.angleTo(neutral.rotations.body),hammer=late.rotations['hammer-arm'].angleTo(neutral.rotations['hammer-arm']);
 assert.ok(trunk<1e-5&&hammer>.01,`hammer follows trunk ${entry}`);followthrough.push({entry,trunk,hammer});
}
assert.ok(maximumStartError<1e-5);assert.ok(maximumEndError<1e-5);assert.ok(maximumSupportDrift<1e-5);
console.log(JSON.stringify({clips:8,joints:8,authoredSamples:200,checkedSamples:776,maximumStartError,maximumEndError,minimumHeight,maximumSupportDrift,followthrough,hashes:meta.files.length+3},null,2));
