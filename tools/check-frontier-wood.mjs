import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {AnimationMixer,LoopRepeat,Vector3} from 'three';
const read=p=>readFileSync(new URL('../'+p,import.meta.url)),meta=JSON.parse(read('public/defense/models/frontier-wood.json'));
for(const file of meta.files)assert.equal(createHash('sha256').update(read(file.path)).digest('hex'),file.sha256,file.path);
const parse=async path=>{const d=read(path);return new GLTFLoader().parseAsync(d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength),'');};
for(const file of ['frontier-wood.glb','frontier-wood-game.glb']){
const original=await parse('public/defense/models/wood-soldier.glb'),game=await parse('public/defense/models/'+file);
const mixers=[original,game].map(g=>{const m=new AnimationMixer(g.scene);m.clipAction(g.animations[0]).setLoop(LoopRepeat,Infinity).play();return m;});assert.equal(game.animations[0].name,meta.clip);assert.equal(game.animations[0].duration,1);
let meshes=0,triangles=0;game.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok(o.material.vertexColors&&o.geometry.attributes.color);}});assert.equal(meshes,8);assert.equal(triangles,meta[file.includes('-game')?'runtime_game':'runtime'].triangles);assert.ok(triangles<4500);
const point=new Vector3();let maxNodeError=0,lowest=Infinity,highestSupport=0;
for(let frame=0;frame<=64;frame++){
 mixers.forEach(m=>m.setTime(frame/64));original.scene.updateMatrixWorld(true);game.scene.updateMatrixWorld(true);
 for(const name of ['wood-root','head','leaf-back','club-grip','leg-near','leg-far','arm-near','arm-far']){const a=original.scene.getObjectByName(name),b=game.scene.getObjectByName(name);assert.ok(a&&b,name);maxNodeError=Math.max(maxNodeError,...a.matrixWorld.elements.map((v,i)=>Math.abs(v-b.matrixWorld.elements[i])));}
 let foot=Infinity;game.scene.traverse(o=>{if(!o.isMesh)return;const v=o.geometry.attributes.position;for(let i=0;i<v.count;i++){point.fromBufferAttribute(v,i).applyMatrix4(o.matrixWorld);lowest=Math.min(lowest,point.y);if(o.name.startsWith('surface-leg-'))foot=Math.min(foot,point.y);}});highestSupport=Math.max(highestSupport,foot);
}
assert.ok(maxNodeError<1e-5,`joint error ${maxNodeError}`);assert.ok(lowest>-.012,`floor penetration ${lowest}`);assert.ok(highestSupport<.012,`floating support ${highestSupport}`);assert.equal(game.scene.getObjectByName('club-grip').parent.name,'arm-near');
console.log(JSON.stringify({file,hashes:meta.files.length,meshes,triangles,samples:65,maxNodeError,lowest,highestSupport,clubAttached:true},null,2));

}
