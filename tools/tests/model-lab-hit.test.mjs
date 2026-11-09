import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AnimationMixer, LoopOnce, Quaternion, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createHitClip, hitFlashStrength} from '../../src/model-lab-hit.ts';

for(const id of ['polar-bear','gecko-ranger']) test(`${id} hit clip remains grounded and returns to rest`,async()=>{
 const bytes=await readFile(`public/defense/models/prototypes/${id}.glb`);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const root=gltf.scene, clip=createHitClip(id,root); assert.ok(clip); assert.equal(clip.duration,.48);
 const body=root.getObjectByName('body'), start=body.quaternion.clone();
 const fixed=root.getObjectByName(id==='polar-bear'?'polar-bear-guardian':'gecko-ranger');
 const feet=[]; fixed.traverse(o=>{if(o.isMesh && o.parent===fixed)feet.push(o)}); assert.ok(feet.length);
 root.updateMatrixWorld(true);const before=feet.map(o=>o.getWorldPosition(new Vector3()));
 const mixer=new AnimationMixer(root),action=mixer.clipAction(clip).setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
 mixer.setTime(.09);assert.ok(body.quaternion.angleTo(start)>.1);root.updateMatrixWorld(true);
 feet.forEach((o,i)=>assert.ok(o.getWorldPosition(new Vector3()).distanceTo(before[i])<1e-6));
 for(let t=0;t<=.48;t+=.01){mixer.setTime(t);root.traverse(o=>{const q=o.quaternion;assert.ok([q.x,q.y,q.z,q.w].every(Number.isFinite))})}
 mixer.setTime(.48);assert.ok(body.quaternion.angleTo(start)<1e-6);
 assert.equal(createHitClip('unknown',root),null);
});

test('hit accent is short and bounded',()=>{assert.equal(hitFlashStrength(0),0);assert.equal(hitFlashStrength(.16),0);assert.ok(hitFlashStrength(.08)>.37);assert.equal(hitFlashStrength(1),0)});
