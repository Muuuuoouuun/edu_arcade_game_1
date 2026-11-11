import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,GreaterDepth,Group,Mesh,MeshBasicMaterial,PerspectiveCamera} from 'three';
import {BiteReveal,selectBiteThreat} from './biteReveal.ts';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {actFrontier,createFrontier,heightAt,type Enemy} from './engine.ts';
import {cameraFrame} from './camera.ts';
import {HeroView} from './heroView.ts';
import {compactWolf,WolfView} from './wolfView.ts';
import type {EnemyVisual} from './woodView.ts';

const enemy=(id:number,time:number,hit=false,target:'hero'|'core'='hero'):Enemy=>({id,x:0,z:0,hp:40,cooldown:0,path:0,attack:{target,time,hit,heading:0,entryDistance:0}});
function setup(){
 const template=new Group(),root=new Group(),jaw=new Group();jaw.name='jaw';jaw.position.z=-3;root.add(jaw);
 const surfaces:Mesh[]=[];
 for(const name of ['wolf-surface-head','wolf-surface-jaw']){
  const mesh=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial());mesh.name=name;template.add(mesh);
  const surface=mesh.clone();jaw.add(surface);surfaces.push(surface);
 }
 root.updateMatrixWorld(true);
 const hero=new Group(),body=new Mesh(new BoxGeometry(2,2,2),new MeshBasicMaterial());hero.add(body);hero.updateMatrixWorld(true);
 const camera=new PerspectiveCamera(42,1,.1,100);camera.position.set(0,0,5);camera.lookAt(0,0,-3);camera.updateMatrixWorld(true);
 const view:EnemyVisual={root,surfaces,update(){},dispose(){}};
 return {template,view,hero,body,camera};
}

test('only living hero bites compete; imminent attacks outrank recoveries deterministically',()=>{
 const core=enemy(1,.9,false,'core'),recovery=enemy(2,.55,true),early=enemy(3,.1),late=enemy(4,.26),dead={...enemy(5,.27),hp:0};
 const list=[core,recovery,early,late,dead];const snapshot=JSON.stringify(list);
 assert.equal(selectBiteThreat(list),late);assert.equal(JSON.stringify(list),snapshot);
 assert.equal(selectBiteThreat([core,recovery]),recovery);assert.equal(selectBiteThreat([core,dead]),undefined);
 assert.equal(selectBiteThreat([early,{...early,id:7}]),early,'ties keep stable order');
});

test('only occluded animated geometry is revealed, without modifying the hero or shared geometry',()=>{
 const {template,view,hero,body,camera}=setup(),reveal=new BiteReveal(template),target=enemy(1,.14);
 const heroMaterial=body.material,heroOpacity=body.material.opacity;
 reveal.update(camera,hero,target,view);assert.equal(reveal.visible,true);assert.equal(reveal.root.children.length,2);
 for(const part of reveal.root.children){
  assert.ok(part instanceof Mesh);const material=part.material as MeshBasicMaterial;
  assert.equal(material.depthFunc,GreaterDepth);assert.equal(material.depthWrite,false);assert.ok(material.transparent&&material.opacity<1);
  const source=view.surfaces.find(mesh=>mesh.name===part.name)!;
  assert.equal(part.geometry,source.geometry);assert.deepEqual(part.matrix.elements,source.matrixWorld.elements);
 }
 assert.equal(body.material,heroMaterial);assert.equal(body.material.opacity,heroOpacity);
 const paused=reveal.root.children.map(part=>part.matrix.clone());reveal.update(camera,hero,target,view);
 reveal.root.children.forEach((part,i)=>assert.deepEqual(part.matrix.elements,paused[i].elements,'identical simulation state must not drift'));
 hero.position.x=5;reveal.update(camera,hero,target,view);assert.equal(reveal.visible,false,'no overlap means no reveal');
 hero.position.x=0;reveal.update(camera,hero,target,view);assert.equal(reveal.visible,true);
 reveal.update(camera,hero,undefined,undefined);assert.equal(reveal.visible,false,'walk and nonhero attacks remain unchanged');
 reveal.update(null,hero,target,view);assert.equal(reveal.visible,false);
 let geometryDisposed=0,materialDisposed=0;
 for(const mesh of view.surfaces)mesh.geometry.addEventListener('dispose',()=>geometryDisposed++);
 ((reveal.root.children[0] as Mesh).material as MeshBasicMaterial).addEventListener('dispose',()=>materialDisposed++);
 reveal.dispose();reveal.dispose();assert.equal(geometryDisposed,0);assert.equal(materialDisposed,1);assert.equal(reveal.root.children.length,0);
 reveal.update(camera,hero,target,view);assert.equal(reveal.visible,false);
});

test('missing wolf pieces fail closed rather than affecting another model',()=>{
 const {template,view,hero,camera}=setup();template.remove(template.getObjectByName('wolf-surface-jaw')!);
 const reveal=new BiteReveal(template);reveal.update(camera,hero,enemy(1,.14),view);assert.equal(reveal.visible,false);reveal.dispose();
});

const load=async(name:string)=>{const b=readFileSync(`public/defense/models/${name}.glb`);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
test('the authored hero and wolf pose reveal the blocked bite at eight headings on desktop and landscape mobile',async()=>{
 const [kar,wolf]=await Promise.all([load('frontier-kar-game'),load('frost-wolf-stride')]);compactWolf(wolf);
 const hero=new Group();hero.add(kar.scene);const heroView=new HeroView(kar.scene,kar.animations.find(c=>c.name==='kar-walk')!);
 const visual=new WolfView(wolf),reveal=new BiteReveal(wolf.scene);let checked=0;
 for(const [width,height] of [[1440,900],[844,390]]){
  const state=actFrontier(createFrontier('solo'),{type:'start'});hero.position.set(state.hero.x,heightAt(state.hero.x,state.hero.z),state.hero.z);hero.rotation.y=state.hero.heading;heroView.update(state.hero,false,heightAt);hero.updateMatrixWorld(true);
  const frame=cameraFrame(state,{width,height,zoom:.7,overview:false,reduced:false});const camera=new PerspectiveCamera(42,width/height,.1,200);
  camera.position.copy(frame.target).add(frame.offset);camera.lookAt(frame.target);camera.updateMatrixWorld(true);
  for(let d=0;d<8;d++){
   const heading=d*Math.PI/4,e={...enemy(d,.14),x:state.hero.x-Math.sin(heading)*1.6,z:state.hero.z-Math.cos(heading)*1.6,heading};e.attack!.heading=heading;
   visual.update(e,false,state.time);reveal.update(camera,hero,e,visual);assert.ok(reveal.visible,`${width}x${height}, direction ${d}`);checked++;
  }
 }
 assert.equal(checked,16);reveal.dispose();visual.dispose();heroView.dispose();
});
