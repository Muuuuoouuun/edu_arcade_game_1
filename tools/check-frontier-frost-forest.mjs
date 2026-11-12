import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Raycaster,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {cameraFrame} from '../src/games/frontier/camera.ts';
import {createFrontier,heightAt} from '../src/games/frontier/engine.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const meta=JSON.parse(read('public/defense/models/frontier-frost-forest.json'));
for(const f of meta.files){const data=read(f.path);assert.equal(data.length,f.bytes,f.path);assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256,f.path);}
const load=async name=>{const b=read(`public/defense/models/${name}.glb`),g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');g.scene.updateMatrixWorld(true);return g.scene;};
const current=await load('frontier-frost-forest'),before=await load('frontier-frost-cliffs');
const sample=(root,x,z)=>new Raycaster(new Vector3(x,30,z),new Vector3(0,-1,0)).intersectObject(root,true)[0]?.point.y;
let count=0,maxDelta=0;
for(let x=-27.9;x<28;x+=1.7)for(let z=-27.9;z<28;z+=1.7){
 if(x>3&&x<9)continue;const a=sample(before,x,z),b=sample(current,x,z);assert.ok(Number.isFinite(a)&&Number.isFinite(b));
 const delta=Math.abs(a-b);assert.ok(delta<.0001,`${x},${z}: ${delta}`);maxDelta=Math.max(maxDelta,delta);count++;
}
for(let x=2.01;x<9.99;x+=.125)assert.ok(Math.abs(sample(current,x,0)-.36)<.001,'bridge height');
const newlyBlocked=[];let oldBlocked=0,viewSamples=0;
for(const [width,height] of [[1440,900],[844,390]])for(const mode of ['solo','command'])for(const zoom of [.7,1,1.5])for(const overview of [false,true])for(const x of [-27,-24,-18,-12,-2,12,20,24,27])for(const z of [-25,-19,-13,-7,0,7,13,19,25]){
 const state=createFrontier(mode);state.hero.x=x;state.hero.z=z;
 const frame=cameraFrame(state,{width,height,zoom,overview,reduced:true});
 const eye=frame.target.clone().add(frame.offset),target=new Vector3(x,heightAt(x,z)+1.5,z),direction=target.clone().sub(eye),distance=direction.length();
 const ray=new Raycaster(eye,direction.normalize(),.01,distance-.15),old=ray.intersectObject(before,true).length>0,now=ray.intersectObject(current,true).length>0;
 viewSamples++;if(old)oldBlocked++;if(now&&!old)newlyBlocked.push({width,mode,zoom,overview,x,z});
}
assert.deepEqual(newlyBlocked,[],'new trees must not hide the hero in sampled cameras');
let surfaces=0,triangles=0;current.traverse(o=>{if(o.isMesh){surfaces++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok(o.geometry.attributes.color);}});
assert.equal(surfaces,1);assert.ok(triangles<=20000,`triangle budget ${triangles}`);assert.equal(meta.tree_count,11);assert.equal(meta.new_meshes,77);
console.log(JSON.stringify({hashes:meta.files.length,groundSamples:count,maxDelta,viewSamples,oldBlocked,newlyBlocked,trees:meta.tree_count,surfaces,triangles},null,2));
