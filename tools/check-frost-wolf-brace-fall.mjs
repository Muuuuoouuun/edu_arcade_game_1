/** Validate the shipped mesh/animation, including interpolated paw contact and death endpoints. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {AnimationMixer,LoopOnce,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const meta=JSON.parse(read('public/defense/models/frost-wolf-brace-fall.json'));
for(const [p,h] of [[meta.generator,meta.generator_sha256],[meta.reference,meta.reference_sha256],[meta.base_source,meta.base_source_sha256],...meta.files.map(f=>[f.file,f.sha256])])assert.equal(createHash('sha256').update(read(p)).digest('hex'),h,p);
async function load(name){const b=read(`public/defense/models/${name}.glb`);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const [model,walk,fall]=await Promise.all(['frost-wolf-brace-fall','frost-wolf-brace','frost-wolf-fall'].map(load));
const keys=['near-front','far-front','near-back','far-back'];
function sample(model,clip,time){
 const mixer=new AnimationMixer(model.scene),a=mixer.clipAction(clip);a.setLoop(LoopOnce,1);a.clampWhenFinished=true;a.play();mixer.setTime(time);model.scene.updateMatrixWorld(true);
 const transforms={};let lowest=Infinity,tilt=0;const feet={};
 model.scene.traverse(n=>{if(n.isMesh){transforms[n.name]=n.matrixWorld.elements.slice();const p=n.geometry.attributes.position;for(let i=0;i<p.count;i++)lowest=Math.min(lowest,new Vector3().fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld).y)}});
 for(const k of keys){const f=model.scene.getObjectByName('foot-'+k);feet[k]=f.getWorldPosition(new Vector3());tilt=Math.max(tilt,new Vector3(0,1,0).transformDirection(f.matrixWorld).angleTo(new Vector3(0,1,0)))}
 mixer.stopAllAction();mixer.uncacheRoot(model.scene);return {transforms,feet,lowest,tilt};
}
const smooth=t=>{const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v)};
assert.equal(model.animations.length,24);let startError=0,endError=0,pawError=0,lowestVertex=Infinity,maxTilt=0;
const end=sample(fall,fall.animations[0],.6);
for(let gait=0;gait<24;gait++){
 const clip=model.animations.find(c=>c.name===`frost-wolf-brace-fall-${gait}`);assert.ok(clip&&Math.abs(clip.duration-.6)<1e-6);assert.equal(new Set(clip.tracks.map(t=>t.name.split('.')[0])).size,25);
 const original=sample(walk,walk.animations[gait%8],[.10,.30,.46][Math.floor(gait/8)]),start=sample(model,clip,0),finish=sample(model,clip,.6);
 assert.equal(Object.keys(start.transforms).length,66);
 for(const [n,m] of Object.entries(original.transforms)){assert.ok(start.transforms[n],n);startError=Math.max(startError,...m.map((v,i)=>Math.abs(v-start.transforms[n][i])))}
 for(const [n,m] of Object.entries(end.transforms))endError=Math.max(endError,...m.map((v,i)=>Math.abs(v-finish.transforms[n][i])));
 for(let step=0;step<=120;step++){
  const t=step/200,now=sample(model,clip,t),drop=smooth((t-.14)/.28),settle=smooth(t/.14);
  for(const k of keys){const v=original.feet[k],hip=walk.scene.getObjectByName('leg-'+k).position;const expected=new Vector3(v.x+(hip.x+.2-v.x)*drop,v.y+(.16-v.y)*settle,v.z);pawError=Math.max(pawError,now.feet[k].distanceTo(expected))}
  lowestVertex=Math.min(lowestVertex,now.lowest);maxTilt=Math.max(maxTilt,now.tilt);
 }
}
assert.ok(startError<1e-5,`start ${startError}`);assert.ok(endError<1e-5,`end ${endError}`);assert.ok(pawError<.001,`paw ${pawError}`);assert.ok(lowestVertex>-.001,`floor ${lowestVertex}`);assert.ok(maxTilt<1e-5,`tilt ${maxTilt}`);
console.log(JSON.stringify({clips:24,animatedNodes:25,authoredSamples:1464,checkedSamples:2904,startError,endError,pawError,lowestVertex,maxTilt,hashes:meta.files.length+3,runtime:meta.runtime},null,2));
