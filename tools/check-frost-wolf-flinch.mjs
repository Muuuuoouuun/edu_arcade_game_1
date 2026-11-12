/** Validate delivered flinch geometry/animation against its original stride, including between keys. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {AnimationMixer,LoopOnce,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const meta=JSON.parse(read('public/defense/models/frost-wolf-flinch.json'));
for(const [p,h] of [[meta.generator,meta.generator_sha256],[meta.reference,meta.reference_sha256],[meta.base_source,meta.base_source_sha256],...meta.files.map(f=>[f.file,f.sha256])])assert.equal(createHash('sha256').update(read(p)).digest('hex'),h,p);
async function load(name){const b=read(`public/defense/models/${name}.glb`);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const [model,walk]=await Promise.all(['frost-wolf-flinch','frost-wolf-stride'].map(load));
const keys=['near-front','far-front','near-back','far-back'];
function sample(model,clip,time){
 const mixer=new AnimationMixer(model.scene),a=mixer.clipAction(clip);a.setLoop(LoopOnce,1);a.clampWhenFinished=true;a.play();mixer.setTime(time);model.scene.updateMatrixWorld(true);
 const transforms={};model.scene.traverse(n=>{transforms[n.name]=n.matrixWorld.elements.slice()});let lowest=Infinity,tilt=0;const feet={};
 for(const k of keys){const f=model.scene.getObjectByName('foot-'+k);feet[k]=f.getWorldPosition(new Vector3());tilt=Math.max(tilt,new Vector3(0,1,0).transformDirection(f.matrixWorld).angleTo(new Vector3(0,1,0)));const paw=model.scene.getObjectByName('paw-'+k),p=paw.geometry.attributes.position;for(let i=0;i<p.count;i++)lowest=Math.min(lowest,new Vector3().fromBufferAttribute(p,i).applyMatrix4(paw.matrixWorld).y)}
 mixer.stopAllAction();mixer.uncacheRoot(model.scene);return {transforms,feet,lowest,tilt};
}
assert.equal(model.animations.length,8);
let endpointError=0,pawError=0,lowestPaw=Infinity,maxTilt=0;
for(let gait=0;gait<8;gait++){
 const clip=model.animations.find(c=>c.name===`frost-wolf-flinch-${gait}`);assert.ok(clip&&Math.abs(clip.duration-.16)<1e-6);assert.equal(new Set(clip.tracks.map(t=>t.name.split('.')[0])).size,17);
 const original=sample(walk,walk.animations[0],gait*.1);
 for(const t of [0,.16]){const now=sample(model,clip,t);for(const [n,m] of Object.entries(original.transforms)){if(!now.transforms[n])continue;endpointError=Math.max(endpointError,...m.map((v,i)=>Math.abs(v-now.transforms[n][i])))}}
 for(let step=0;step<=64;step++){
  const now=sample(model,clip,step/400);for(const k of keys)pawError=Math.max(pawError,now.feet[k].distanceTo(original.feet[k]));lowestPaw=Math.min(lowestPaw,now.lowest);maxTilt=Math.max(maxTilt,now.tilt);
 }
}
assert.ok(endpointError<1e-5,`endpoint ${endpointError}`);assert.ok(pawError<.001,`paw ${pawError}`);assert.ok(lowestPaw>-.001,`floor ${lowestPaw}`);assert.ok(maxTilt<1e-5,`tilt ${maxTilt}`);
console.log(JSON.stringify({clips:8,joints:17,authoredSamples:264,checkedSamples:520,endpointError,pawError,lowestPaw,maxTilt,hashes:meta.files.length+3,runtime:meta.runtime},null,2));
