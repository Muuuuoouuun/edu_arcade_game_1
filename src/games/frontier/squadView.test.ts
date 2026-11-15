import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {actFrontier,createFrontier,heightAt,stepFrontier,type SquadMember} from './engine.ts';
import {SquadView,SQUAD_SHOT,validSquadModel} from './squadView.ts';

function fixture(){
 const root=new Group(),mat=new MeshBasicMaterial();
 for(const [name,x] of [['squad-left-foot',-.28],['squad-right-foot',.28]] as const){const mesh=new Mesh(new BoxGeometry(.34,.6,.4),mat);mesh.name=name;mesh.position.set(x,.3,0);root.add(mesh);}
 const weapon=new Mesh(new BoxGeometry(.25,.25,1.2),mat);weapon.name='squad-weapon';weapon.position.set(.75,1.2,.2);root.add(weapon);
 return {root,view:new SquadView(root,0),left:root.children[0] as Mesh,right:root.children[1] as Mesh,weapon};
}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('support soldiers use their own movement distance and keep a stance foot on the ground',()=>{
 const {root,view,left,right}=fixture(),unit:SquadMember={x:0,z:5,cooldown:0,heading:0,moving:true,walkDistance:.12};
 view.update(unit,0,false);root.updateMatrixWorld(true);const before=left.getWorldPosition(new Vector3());
 unit.z+=.12;unit.walkDistance=.24;view.update(unit,.1,false);root.updateMatrixWorld(true);const after=left.getWorldPosition(new Vector3());near(before.z,after.z);near(left.position.y,.3);assert.ok(right.position.y>.3);
 const snapshot=left.position.clone();view.update(unit,.1,false);assert.deepEqual(left.position,snapshot);
 unit.moving=false;unit.restTime=.16;view.update(unit,.26,false);near(left.position.z,0);near(right.position.z,0);
 unit.moving=true;view.update(unit,.26,true);near(left.position.z,0);near(right.position.z,0);near(left.position.y,.3);near(right.position.y,.3);
});

test('four sole corners remain above slopes and bridge at all eight headings',()=>{
 const {root,view,left,right}=fixture();
 for(const [x,z] of [[0,-7],[5,0],[2.05,2.7]] as const)for(let h=0;h<8;h++)for(let p=0;p<8;p++){
  view.update({x,z,cooldown:0,heading:h*Math.PI/4,moving:true,walkDistance:p*1.2/8},1,false);root.updateMatrixWorld(true);
  for(const leg of [left,right])for(const dx of [-.17,.17])for(const dz of [-.2,.2]){const sole=new Vector3(dx,-.3,dz).applyMatrix4(leg.matrixWorld);assert.ok(sole.y>=heightAt(sole.x,sole.z)-1e-6,`foot below surface at ${x},${z} heading ${h}`);}
 }
});

test('shot pose follows the actual target and expires on simulation time',()=>{
 const {root,view,weapon}=fixture(),unit:SquadMember={x:0,z:0,cooldown:0,heading:.2,shotAt:3,shotHeading:1.4};
 view.update(unit,3,false);near(root.rotation.y,1.4);assert.ok(weapon.position.z<.2);
 view.update(unit,3,true);near(root.rotation.y,1.4);near(weapon.position.z,.2);
 view.update(unit,3+SQUAD_SHOT+.00001,false);near(root.rotation.y,.2);near(weapon.position.z,.2);
});

test('squad movement and shot metadata track simulation while damage and pause stay unchanged',()=>{
 let s=actFrontier(createFrontier('command'),{type:'start'});s.remaining=1;s.spawnIn=50;s.squad=[s.squad[0]];
 s.hero.target={x:-5,z:14};s=stepFrontier(s,.05);const unit=s.squad[0];assert.ok(unit.moving);assert.ok((unit.walkDistance??0)>0);
 near(unit.heading!,Math.atan2(unit.x+16,unit.z-16));
 const enemy={id:900,x:unit.x+2,z:unit.z,hp:100,maxHp:100,cooldown:5,path:1};s.enemies=[enemy];s=stepFrontier(s,.05);const fired=s.squad[0];near(fired.shotAt!,s.time);near(fired.shotHeading!,Math.atan2(enemy.x-fired.x,enemy.z-fired.z));assert.equal(s.enemies[0].hp,91);assert.equal(s.effects.filter(e=>e.kind==='shot').length,1);
 const paused=actFrontier(s,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);
});

test('an initially stationary soldier stays planted and doubled speed doubles movement distance',()=>{
 let s=actFrontier(createFrontier('command'),{type:'start'});s.remaining=1;s.spawnIn=50;s.squad=[{x:-16,z:16.5,cooldown:2}];
 const still=stepFrontier(s,.05),{view,left,right}=fixture();view.update(still.squad[0],still.time,false);near(left.position.z,0);near(right.position.z,0);
 s.hero.target={x:-5,z:14};const normal=stepFrontier(s,.05),fast=stepFrontier(actFrontier(s,{type:'speed'}),.05);
 near(fast.squad[0].walkDistance!,2*normal.squad[0].walkDistance!);
});

test('authored support model shares geometry, follows existing gait and rejects incomplete assets',async()=>{
 const b=readFileSync('public/defense/models/frontier-squad.glb'),g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 assert.equal(validSquadModel(g.scene),true);
 const a=new Group(),c=new Group();a.add(g.scene.clone(true));c.add(g.scene.clone(true));
 const first=a.getObjectByName('surface-squad-weapon') as Mesh,second=c.getObjectByName('surface-squad-weapon') as Mesh;
 assert.equal(first.geometry,second.geometry);assert.equal(first.material,second.material);
 const view=new SquadView(a,0),weapon=a.getObjectByName('squad-weapon')!,leg=a.getObjectByName('squad-left-foot')!;
 view.update({x:0,z:0,cooldown:0,moving:true,walkDistance:.12,heading:0,shotAt:2,shotHeading:1.2},2,false);
 assert.ok(leg.position.z>0);assert.ok(weapon.position.z<.2);near(a.rotation.y,1.2);
 view.update({x:0,z:0,cooldown:0,moving:true,walkDistance:.12,heading:0,shotAt:2,shotHeading:1.2},2,true);
 near(leg.position.z,0);near(weapon.position.z,.2);
 const broken=g.scene.clone(true),brokenLeg=broken.getObjectByName('squad-left-foot')!;brokenLeg.parent!.remove(brokenLeg);
 assert.equal(validSquadModel(broken),false);
 const wrong=g.scene.clone(true);wrong.getObjectByName('squad-weapon')!.position.z+=1;assert.equal(validSquadModel(wrong),false);
 const wrongSocket=g.scene.clone(true);wrongSocket.getObjectByName('squad-muzzle')!.position.y+=1;assert.equal(validSquadModel(wrongSocket),false);
});
