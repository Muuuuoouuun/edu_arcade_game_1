import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {AnimationMixer,LoopOnce,Vector3} from 'three';
const read=p=>readFileSync(new URL('../'+p,import.meta.url)),meta=JSON.parse(read('public/defense/models/frontier-wood-strike.json'));
for(const f of meta.files)assert.equal(createHash('sha256').update(read(f.path)).digest('hex'),f.sha256,f.path);
const parse=async file=>{const d=read('public/defense/models/'+file);return new GLTFLoader().parseAsync(d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength),'');};
for(const file of ['frontier-wood-strike.glb','frontier-wood-strike-game.glb']){
 const gltf=await parse(file),walk=await parse('frontier-wood-game.glb');assert.equal(gltf.animations.length,1);assert.equal(gltf.animations[0].name,'frontier-wood-strike');assert.ok(Math.abs(gltf.animations[0].duration-.6)<1e-6);assert.equal(meta.contact,.28);
 const mixer=new AnimationMixer(gltf.scene),action=mixer.clipAction(gltf.animations[0]).setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
 const walkMixer=new AnimationMixer(walk.scene);walkMixer.clipAction(walk.animations[0]).play();walkMixer.setTime(0);walk.scene.updateMatrixWorld(true);
 let lowest=Infinity,footDrift=0,triangles=0;const soles=new Map(),tips=[];gltf.scene.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
 for(let i=0;i<=120;i++){
  action.enabled=true;mixer.setTime(i*.6/120);gltf.scene.updateMatrixWorld(true);
  for(const name of ['leg-near','leg-far']){const n=gltf.scene.getObjectByName(name);if(i===0)soles.set(name,n.matrixWorld.clone());footDrift=Math.max(footDrift,...n.matrixWorld.elements.map((v,k)=>Math.abs(v-soles.get(name).elements[k])));}
  gltf.scene.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;const p=new Vector3();for(let k=0;k<a.count;k++){p.fromBufferAttribute(a,k).applyMatrix4(o.matrixWorld);lowest=Math.min(lowest,p.y);}});
  if(i===0||i===120)for(const name of ['wood-root','head','arm-near','arm-far','club-grip','leg-near','leg-far','leaf-back']){const a=gltf.scene.getObjectByName(name).matrixWorld,b=walk.scene.getObjectByName(name).matrixWorld;assert.ok(a.elements.every((v,k)=>Math.abs(v-b.elements[k])<1e-5),'rest endpoint '+name);}
 }
 for(const t of [.18,.28]){action.enabled=true;mixer.setTime(t);gltf.scene.updateMatrixWorld(true);tips.push(new Vector3(0,1.8,0).applyMatrix4(gltf.scene.getObjectByName('club-grip').matrixWorld));}
 assert.ok(footDrift<.001,'planted feet drift '+footDrift);assert.ok(lowest>-.002,'floor '+lowest);assert.equal(gltf.scene.getObjectByName('club-grip').parent.name,'arm-near');assert.ok(tips[0].y-tips[1].y>1,'club descends visibly');assert.ok(tips[1].x-tips[0].x>1,'club advances toward native +X');
 assert.equal(triangles,meta[file.includes('-game')?'runtime_game':'runtime'].triangles);
 console.log(JSON.stringify({file,hashes:meta.files.length,samples:121,triangles,footDrift,lowest,tipPrepare:tips[0].toArray(),tipContact:tips[1].toArray(),endpointAndGrip:true}));
}
