import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {AnimationMixer,Group,LoopRepeat,Vector3,Box3} from 'three';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));const meta=JSON.parse(read('public/defense/models/frontier-ballista.json'));
for(const f of meta.files)assert.equal(createHash('sha256').update(read(f.path)).digest('hex'),f.sha256,f.path);
for(const asset of ['frontier-ballista.glb','frontier-ballista-game.glb']){
const data=read('public/defense/models/'+asset),g=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');const outer=new Group();outer.scale.setScalar(meta.runtime_scale);outer.add(g.scene);
const mixer=new AnimationMixer(g.scene),clip=g.animations.find(c=>c.name==='frontier-ballista-release');assert.ok(clip);assert.ok(Math.abs(clip.duration-.4)<1e-6);mixer.clipAction(clip).setLoop(LoopRepeat,Infinity).play();
const aim=g.scene.getObjectByName('aim-platform'),socket=g.scene.getObjectByName('muzzle-socket'),carriage=g.scene.getObjectByName('recoil-carriage');assert.ok(aim&&socket&&carriage);
let meshes=0,triangles=0;g.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok(o.geometry.attributes.color,'vertex-painted materials must survive export');assert.ok(o.material.vertexColors);}});assert.ok(meshes<=8);assert.ok(triangles<=11000);
const base=g.scene.getObjectByName('surface-piercing-ballista');assert.ok(base);outer.updateMatrixWorld(true);const fixed=base.matrixWorld.clone();let maxBaseError=0,maxSocketError=0,recoil=0;
for(let d=0;d<8;d++){aim.rotation.y=d*Math.PI/4;for(let f=0;f<=48;f++){mixer.setTime(f/120);outer.updateMatrixWorld(true);maxBaseError=Math.max(maxBaseError,...base.matrixWorld.elements.map((v,i)=>Math.abs(v-fixed.elements[i])));recoil=Math.max(recoil,carriage.position.z*-1);const bounds=new Box3().setFromObject(outer);assert.ok(bounds.min.y>=-.001);assert.ok(bounds.max.y<4,'No detached or floating upper assembly');}
 mixer.setTime(.1);outer.updateMatrixWorld(true);const p=socket.getWorldPosition(new Vector3()),expected=new Vector3(Math.sin(d*Math.PI/4)*meta.muzzle_world_offset[2],meta.muzzle_world_offset[1],Math.cos(d*Math.PI/4)*meta.muzzle_world_offset[2]);maxSocketError=Math.max(maxSocketError,p.distanceTo(expected));}
assert.ok(maxBaseError<1e-6);assert.ok(maxSocketError<1e-5);assert.ok(recoil>.15);
// A second shot after the rest pose must still evaluate its animation.
for(const t of [.1,.4,0,.1]){mixer.setTime(t);outer.updateMatrixWorld(true);}assert.ok(Math.abs(carriage.position.z)>.11);
console.log(JSON.stringify({asset,hashes:meta.files.length,meshes,triangles,samples:8*49,maxBaseError,maxSocketError,recoil,repeatShot:true},null,2));

}
