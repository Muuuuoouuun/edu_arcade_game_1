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
const [entryModel, cast, walk] = await Promise.all(['kar-stop', 'kar-barbarian', 'kar-barbarian-walk'].map(load));
const meta = JSON.parse(read('public/defense/models/kar-stop.json'));
for (const file of meta.files) assert.equal(createHash('sha256').update(read(file.file)).digest('hex'), file.sha256, file.file);
for (const [path, hash] of [[meta.generator, meta.generator_sha256], [meta.reference, meta.reference_sha256], ['art-source/defense/kar-barbarian.blend', meta.source_cast_sha256], ['art-source/defense/kar-barbarian-walk.blend',meta.source_walk_sha256]]) assert.equal(createHash('sha256').update(read(path)).digest('hex'), hash);
const joints = [...new Set(cast.animations[0].tracks.map(t => t.name.split('.')[0]))];
function sample(model, clip, time) {
 const mixer = new AnimationMixer(model.scene), action = mixer.clipAction(clip);
 action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.setTime(time); model.scene.updateMatrixWorld(true);
 const transforms = Object.fromEntries(joints.map(name => [name, model.scene.getObjectByName(name).matrixWorld.elements.slice()]));
 let bottom = Infinity;
 for (const name of ['right-foot', 'left-foot']) model.scene.getObjectByName(name).traverse(node => {
  if (!node.isMesh) return;
  const positions = node.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) bottom = Math.min(bottom, new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).y);
 });
 let meshBottom=Infinity;
 model.scene.traverse(node=>{if(!node.isMesh)return;const positions=node.geometry.attributes.position;for(let i=0;i<positions.count;i++)meshBottom=Math.min(meshBottom,new Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld).y)});
 let gripError=0;
 for(const [i,side] of ['left','right'].entries()){
  const upper=model.scene.getObjectByName(side+'-upper'),fore=model.scene.getObjectByName(side+'-forearm'),grip=model.scene.getObjectByName(i===0?'upper-grip':'lower-grip'),body=model.scene.getObjectByName('body');
  const shoulder=new Vector3(i===0?-.77:.77,1.17,0).applyMatrix4(body.matrixWorld);
  gripError=Math.max(gripError,shoulder.distanceTo(new Vector3().setFromMatrixPosition(upper.matrixWorld)),new Vector3(0,1,0).applyMatrix4(upper.matrixWorld).distanceTo(new Vector3().setFromMatrixPosition(fore.matrixWorld)),new Vector3(0,1,0).applyMatrix4(fore.matrixWorld).distanceTo(new Vector3().setFromMatrixPosition(grip.matrixWorld)));
 }
 mixer.stopAllAction(); mixer.uncacheRoot(model.scene);
 return { transforms, bottom, meshBottom, gripError };
}
const difference = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
assert.equal(entryModel.animations.length,8);
let minimumSoleHeight=Infinity,minimumMeshHeight=Infinity,maximumStartError=0,maximumEndError=0,maximumGripError=0,maximumSupportDrift=0,maximumBodySettleError=0,minimumFurTailMotion=Infinity,minimumHammerTailMotion=Infinity,minimumBeardTailMotion=Infinity;
const neutral=sample(cast,cast.animations[0],0);
for(let entry=0;entry<8;entry++){
 const clip=entryModel.animations.find(c=>c.name===`kar-stop-${entry}`);assert.ok(clip&&Math.abs(clip.duration-.24)<1e-6);
 const start=sample(entryModel,clip,0),original=sample(walk,walk.animations[0],entry*.1),end=sample(entryModel,clip,.24);
 for(const name of joints){maximumStartError=Math.max(maximumStartError,difference(start.transforms[name],original.transforms[name]));maximumEndError=Math.max(maximumEndError,difference(end.transforms[name],neutral.transforms[name]));}
 const late=sample(entryModel,clip,.16);
 maximumBodySettleError=Math.max(maximumBodySettleError,difference(late.transforms.body,neutral.transforms.body));
 minimumFurTailMotion=Math.min(minimumFurTailMotion,difference(late.transforms['fur-mantle'],neutral.transforms['fur-mantle']));
 minimumHammerTailMotion=Math.min(minimumHammerTailMotion,difference(late.transforms['war-hammer'],neutral.transforms['war-hammer']));
 minimumBeardTailMotion=Math.min(minimumBeardTailMotion,difference(late.transforms.beard,neutral.transforms.beard));
 const first=meta.entry_checks[entry].first_leg,second=first==='left-foot'?'right-foot':'left-foot';
 const mid=sample(entryModel,clip,.08),baseX=(start.transforms.body[12]+neutral.transforms.body[12])/2;
 assert.ok((mid.transforms.body[12]-baseX)*start.transforms[second][12]>0,'weight shifts toward the support boot');
 for(let frame=0;frame<=96;frame++){
  const time=frame/400,pose=sample(entryModel,clip,time),support=time<=.12?second:first,expected=time<=.12?start:neutral;
  minimumMeshHeight=Math.min(minimumMeshHeight,pose.meshBottom);assert.ok(pose.meshBottom>=0,'all geometry stays above the floor');
  minimumSoleHeight=Math.min(minimumSoleHeight,pose.bottom);assert.ok(pose.bottom>.009&&pose.bottom<.011,'one sole remains planted');
  maximumSupportDrift=Math.max(maximumSupportDrift,difference(pose.transforms[support],expected.transforms[support]));
  maximumGripError=Math.max(maximumGripError,pose.gripError);
 }
}
assert.ok(maximumBodySettleError<1e-5);assert.ok(minimumFurTailMotion>1e-4);assert.ok(minimumHammerTailMotion>1e-4);assert.ok(minimumBeardTailMotion>1e-4);
assert.ok(maximumSupportDrift<1e-5);assert.ok(maximumStartError<1e-5);assert.ok(maximumEndError<1e-5);assert.ok(maximumGripError*384/6.8<.5);
console.log(JSON.stringify({clips:8,joints:joints.length,authoredSamples:200,interpolatedSamples:776,maximumStartError,maximumEndError,minimumSoleHeight,minimumMeshHeight,maximumSupportDrift,maximumGripError,maximumBodySettleError,minimumFurTailMotion,minimumHammerTailMotion,minimumBeardTailMotion,projectedGripGap:maximumGripError*384/6.8,hashes:meta.files.length+4},null,2));
