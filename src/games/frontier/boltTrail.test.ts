import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BALLISTA } from './ballista.ts';
import { BoltTrail, boltTrailPose } from './boltTrail.ts';
import { actFrontier, createFrontier, stepFrontier, type Bolt } from './engine.ts';

const bolt=(life:number):Bolt=>({id:1,pad:0,targetId:2,position:{x:2.56,y:2,z:0},previous:{x:2,y:2,z:0},damage:23,life});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('bolt wake follows the actual 3D direction and starts only after the tail leaves its socket',()=>{
 assert.equal(boltTrailPose(bolt(BALLISTA.boltLifetime)),null);
 assert.equal(boltTrailPose({...bolt(1.99),previous:{...bolt(1.99).position}}),null);
 assert.equal(boltTrailPose(bolt(1.97)),null);
 const wake=boltTrailPose(bolt(1.92))!;
 close(wake.length,1.37);close(wake.center.x-wake.length/2,0);close(wake.center.x+wake.length/2,2.56-1.19);
 assert.deepEqual(wake.direction,{x:1,y:0,z:0});
 const diagonal=boltTrailPose({...bolt(1.8),previous:{x:1.56,y:1,z:-1}})!;
 close(Math.hypot(diagonal.direction.x,diagonal.direction.y,diagonal.direction.z),1);
 assert.ok(diagonal.direction.y>0&&diagonal.direction.z>0);close(diagonal.length,2.4);
 assert.equal(boltTrailPose(bolt(1.8),true),null);
 assert.equal(boltTrailPose({...bolt(1.8),life:NaN}),null);
});

test('wake uses one bounded batch, hides in reduced motion and releases GPU resources',()=>{
 const view=new BoltTrail(),material=view.mesh.material as THREE.MeshBasicMaterial;
 assert.equal(material.depthTest,true);assert.equal(material.depthWrite,false);assert.equal(material.transparent,true);
 view.update(Array.from({length:80},(_,id)=>({...bolt(1.8),id})),false);assert.equal(view.mesh.count,64);
 const matrix=new THREE.Matrix4();view.mesh.getMatrixAt(0,matrix);const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(position,rotation,scale);
 close(scale.y,2.4);const direction=new THREE.Vector3(0,1,0).applyQuaternion(rotation);close(direction.x,1);close(direction.y,0);
 view.update([...Array.from({length:64},()=>bolt(2)),bolt(1.8)],false);assert.equal(view.mesh.count,0,'do not show a wake for a capped-out bolt');
 view.update([bolt(1.8)],true);assert.equal(view.mesh.count,0);view.update([],false);assert.equal(view.mesh.count,0);
 let geometries=0,materials=0;view.mesh.geometry.addEventListener('dispose',()=>geometries++);material.addEventListener('dispose',()=>materials++);view.dispose();assert.equal(geometries,1);assert.equal(materials,1);
});

test('pause freezes and speed advances the wake with the existing projectile and damage timing',()=>{
 let state=actFrontier(actFrontier(createFrontier('defense'),{type:'build',pad:0}),{type:'start'});state.remaining=1;state.spawnIn=999;state.towers[0].heading=Math.PI;state.enemies=[{id:999,x:-21,z:5,hp:200,cooldown:999,path:1}];
 for(let i=0;i<18;i++)state=stepFrontier(state,.01);assert.equal(state.bolts.length,1);assert.equal(state.enemies[0].hp,200);
 const before=JSON.stringify(state),wake=boltTrailPose(state.bolts[0]);assert.ok(wake);assert.equal(JSON.stringify(state),before,'visual query must not mutate battle');
 const paused=actFrontier(state,{type:'pause'});assert.deepEqual(boltTrailPose(stepFrontier(paused,.05).bolts[0]),wake);
 const fast=actFrontier(state,{type:'speed'}),one=stepFrontier(fast,.01),two=stepFrontier(stepFrontier(state,.01),.01);
 close(one.bolts[0].life,two.bolts[0].life);assert.ok(Math.abs(one.bolts[0].position.z-two.bolts[0].position.z)<.001,'homing integration stays close at either time step');
 for(let i=0;i<40&&state.enemies[0].hp===200;i++)state=stepFrontier(state,.01);
 assert.equal(state.enemies[0].hp,177);assert.equal(state.bolts.length,0);
});
