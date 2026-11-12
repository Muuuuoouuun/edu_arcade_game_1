import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Box3, LoopOnce, Mesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HERO_ATTACK } from './heroMotion.ts';

for (const [hero, name] of [['ranger','gecko-ranger'],['bron','dwarf-guardian'],['bear','polar-bear']] as const) {
 test(`${hero}: shared delivery has embedded atlases, valid UVs, three clips and grounded two-foot locomotion`, async () => {
  const bytes = await readFile(new URL(`./models/${name}.glb`,import.meta.url));
  const size=bytes.readUInt32LE(12), doc=JSON.parse(bytes.subarray(20,20+size).toString());
  assert.equal(doc.materials.length,1);
  const mat=doc.materials[0];assert.ok(mat.pbrMetallicRoughness.baseColorTexture);assert.ok(mat.normalTexture);assert.ok(mat.pbrMetallicRoughness.metallicRoughnessTexture);
  assert.equal(doc.images.length,3);assert.ok(doc.images.every((i:{bufferView?:number;uri?:string})=>i.bufferView!==undefined&&!i.uri));
  assert.deepEqual(doc.animations.map((a:{name:string})=>a.name).sort(),[HERO_ATTACK[hero],`${hero}-idle`,`${hero}-walk`].sort());
  for(const n of doc.nodes.filter((n:{name?:string})=>n.name?.startsWith('leg-')))assert.equal(n.translation[2],0,'default feet must return to neutral stance');
  // Node cannot decode images. Strip only image bindings in a temporary copy; geometry/animations remain exact.
  doc.materials=[{name:'validation'}];delete doc.images;delete doc.textures;delete doc.samplers;
  const encoded=Buffer.from(JSON.stringify(doc)),padding=Buffer.alloc((4-encoded.length%4)%4,32),json=Buffer.concat([encoded,padding]),tail=bytes.subarray(20+size);
  const head=Buffer.alloc(20);head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(20+json.length+tail.length,8);head.writeUInt32LE(json.length,12);head.writeUInt32LE(0x4e4f534a,16);
  const data=Buffer.concat([head,json,tail]);const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  let count=0;gltf.scene.traverse(o=>{if(o instanceof Mesh){const uv=o.geometry.getAttribute('uv');assert.ok(uv);for(const x of uv.array)assert.ok(Number.isFinite(x)&&x>=0&&x<=1);count++;}});assert.ok(count>0);
  const mixer=new AnimationMixer(gltf.scene),clip=gltf.animations.find(c=>c.name===`${hero}-walk`)!;
  assert.ok(Math.abs(clip.duration-1)<.001);
  const action=mixer.clipAction(clip).setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
  const feet=['leg-left','leg-right'].map(n=>gltf.scene.getObjectByName(n)!);assert.ok(feet.every(Boolean));
  let lifted=false;
  for(let f=0;f<=30;f++){
   mixer.setTime(f/30);gltf.scene.updateMatrixWorld(true);
   const bottoms=feet.map(o=>new Box3().setFromObject(o).min.y);
   assert.ok(Math.min(...bottoms)>-.005,`foot below ground at frame ${f}: ${bottoms}`);
   assert.ok(Math.min(...bottoms)<.025,`no support foot at frame ${f}: ${bottoms}`);
   if(Math.max(...bottoms)>.10)lifted=true;
  }
  assert.ok(lifted,'one foot must visibly lift during swing');
  if(hero==='bear')assert.ok(doc.nodes.some((n:{extras?:{rushHideForThrow?:boolean}})=>n.extras?.rushHideForThrow),'snowball delivery can hide the source hammer');
 });
}
