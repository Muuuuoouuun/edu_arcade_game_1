import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,LoopRepeat,Vector3} from 'three';
import {enemyStride} from '../src/games/defense/locomotion.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const meta=JSON.parse(read('public/defense/models/stone-golem-walk.json'));
for(const f of meta.files){const d=read('public/defense/models/'+f.file);assert.equal(createHash('sha256').update(d).digest('hex'),f.sha256);}
const data=read('public/defense/models/stone-golem-walk.glb');const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const clip=gltf.animations.find(a=>a.name==='stone-golem-walk');assert.ok(clip);assert.equal(clip.duration,1);
const mixer=new AnimationMixer(gltf.scene);mixer.clipAction(clip).setLoop(LoopRepeat,Infinity).play();
const v=new Vector3();let minimum=Infinity,highestSupport=-Infinity,meshes=0,triangles=0;
gltf.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
for(let i=0;i<=128;i++){
 mixer.setTime(i/128);gltf.scene.updateMatrixWorld(true);let near=Infinity,far=Infinity;
 gltf.scene.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let n=0;n<p.count;n++){
  v.fromBufferAttribute(p,n).applyMatrix4(o.matrixWorld);minimum=Math.min(minimum,v.y);
  if(o.name==='foot-near')near=Math.min(near,v.y);if(o.name==='foot-far')far=Math.min(far,v.y);
 }});
 assert.ok(Number.isFinite(near)&&Number.isFinite(far),'both feet exist');highestSupport=Math.max(highestSupport,Math.min(near,far));
}
assert.ok(minimum>-.015,`interpolated floor penetration ${minimum}`);
assert.ok(highestSupport<.015,`at least one foot supports the body ${highestSupport}`);
// Measure the support foot in the SAME orthographic camera and atlas scale as battle.
// The rendered 8-frame atlas holds each pose until the next frame; account for the
// body's forward travel during that hold instead of claiming continuous foot lock.
const size=meta.stride_reference_size, stride=enemyStride('stone',size);
assert.equal(stride,meta.stride_world);
const yaw=meta.camera.rotation_euler[2], pxScale=size*384/260/meta.frame.orthographic_scale;
function supportRange(name,firstFrame,cycleLength){
 const xs=[];
 for(let i=firstFrame;i<firstFrame+4;i++){
  mixer.setTime(i/8);gltf.scene.updateMatrixWorld(true);
  const foot=gltf.scene.getObjectByName(name);assert.ok(foot,`${name} exists`);
  const p=foot.getWorldPosition(new Vector3());
  const local=(p.x*Math.cos(yaw)-p.z*Math.sin(yaw))*pxScale;
  xs.push(local+i*cycleLength/8,local+(i+1)*cycleLength/8);
 }
 return Math.max(...xs)-Math.min(...xs);
}
const measured=['foot-far','foot-near'].map((name,i)=>supportRange(name,i*4,stride));
const previous=['foot-far','foot-near'].map((name,i)=>supportRange(name,i*4,64));
assert.ok(measured.every(v=>v<6),`quantized support drift ${measured}`);
assert.ok(previous.every((v,i)=>v>measured[i]*2),`support drift did not improve: ${previous} -> ${measured}`);
// Mirroring a sprite for leftward travel negates both terms; drift magnitude is identical.
console.log(JSON.stringify({clip:clip.name,samples:129,meshes,triangles,minimum,highestSupport,stride,size,supportDrift:measured,previousDrift:previous}));
