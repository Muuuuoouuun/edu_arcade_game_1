import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,LoopOnce,Vector3} from 'three';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const meta=JSON.parse(read('public/defense/models/stone-golem-death.json'));
for(const f of meta.files){const data=read('public/defense/models/'+f.file);assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256);}
const data=read('public/defense/models/stone-golem-death.glb');
const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const clip=gltf.animations.find(a=>a.name==='stone-golem-death');assert.ok(clip);assert.ok(Math.abs(clip.duration-19/30)<1e-6);
for(const name of ['fracture-torso-upper','fracture-torso-lower','head','arm-near','arm-far'])assert.ok(gltf.scene.getObjectByName(name),name);
const mixer=new AnimationMixer(gltf.scene),action=mixer.clipAction(clip).setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
const v=new Vector3();let minimum=Infinity,meshes=0,triangles=0;gltf.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
for(let i=0;i<=190;i++){
 const time=i/300;mixer.setTime(time);gltf.scene.updateMatrixWorld(true);let floor=Infinity;
 gltf.scene.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let n=0;n<p.count;n++){v.fromBufferAttribute(p,n).applyMatrix4(o.matrixWorld);floor=Math.min(floor,v.y);}});
 assert.ok(Number.isFinite(floor));if(time>=.1)minimum=Math.min(minimum,floor);
}
assert.ok(minimum>-.015,`interpolated floor penetration after initial settling: ${minimum}`);
console.log(JSON.stringify({clip:clip.name,samples:191,meshes,triangles,minimum}));
