import assert from 'node:assert/strict';
import test from 'node:test';
import {Color,Matrix4,Mesh,Vector3} from 'three';
import {actFrontier,createFrontier,EXIT,heightAt,SOLO_EXIT,soloExitReady,stepFrontier} from './engine.ts';
import {EXIT_MARKER,SoloExitView} from './exitView.ts';
const closeColor=(actual:Color,hex:string)=>{const expected=new Color(hex);assert.ok(Math.abs(actual.r-expected.r)<1e-6&&Math.abs(actual.g-expected.g)<1e-6&&Math.abs(actual.b-expected.b)<1e-6);};

test('exit readiness and the real interaction have one shared boundary',()=>{
 for(let crystals=0;crystals<=3;crystals++)for(let kills=0;kills<=7;kills++){
  const base=createFrontier('solo'),s={...base,phase:'playing' as const,kills,crystals:Array.from({length:crystals},(_,i)=>i),hero:{...base.hero,x:EXIT.x,z:EXIT.z}};
  const expected=crystals===3&&kills>=6;
  assert.equal(soloExitReady(s),expected);
  assert.equal(actFrontier(s,{type:'interact'}).phase,expected?'won':'playing');
  assert.equal(s.phase,'playing','visual check and interaction do not mutate the previous state');
 }
 const base=createFrontier('solo');
 assert.equal(soloExitReady({...base,crystals:[0,1,2,3],kills:6}),false,'preserve exact crystal requirement');
 const away={...base,phase:'playing' as const,kills:6,crystals:[0,1,2],hero:{...base.hero,x:EXIT.x-SOLO_EXIT.radius,z:EXIT.z}};
 assert.equal(actFrontier(away,{type:'interact'}).phase,'playing','the interaction radius remains strict');
});

test('3D exit marks each objective and keeps readiness tied to the engine',()=>{
 const view=new SoloExitView(),state=createFrontier('solo');
 assert.equal(view.root.position.y,heightAt(EXIT_MARKER.x,EXIT_MARKER.z));
 assert.ok(Math.hypot(EXIT_MARKER.x-EXIT.x,EXIT_MARKER.z-EXIT.z)+EXIT_MARKER.outerRadius<SOLO_EXIT.radius,'every point on the visible plinth is inside the interaction radius');
 const color=new Color(),matrix=new Matrix4(),position=new Vector3();
 for(let n=0;n<=3;n++)for(let k=0;k<=6;k++){
  const next={...state,crystals:Array.from({length:n},(_,i)=>i),kills:k};view.update(next,false);
  assert.equal(view.ready,soloExitReady(next));
  for(let i=0;i<3;i++){view.crystals.getColorAt(i,color);closeColor(color,i<n?'#56dfd1':'#697e7b');view.crystals.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);assert.equal(position.y,i<n?Math.fround(2.55):Math.fround(2.4));}
  for(let i=0;i<6;i++){view.marks.getColorAt(i,color);closeColor(color,i<k?'#f0c86e':'#68746f');view.marks.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);assert.equal(position.y,i<k?Math.fround(1.725):Math.fround(1.575));}
 }
 view.update({...state,crystals:[0,1,2],kills:5},false);assert.equal(view.ready,false);
 view.update({...state,crystals:[0,1],kills:6},false);assert.equal(view.ready,false);
 view.dispose();
});

test('pause, speed, reduced motion and cleanup follow the simulation',()=>{
 const view=new SoloExitView(),base=createFrontier('solo');
 let state={...base,phase:'playing' as const,crystals:[0,1,2],kills:6};
 view.update(state,false);const start=view.ring.material.emissiveIntensity;
 const paused=stepFrontier({...state,paused:true},.05);view.update(paused,false);assert.equal(view.ring.material.emissiveIntensity,start);
 state=stepFrontier(state,.05) as typeof state;view.update(state,false);const normal=view.ring.material.emissiveIntensity;
 const fast=stepFrontier({...state,speed:2},.05);view.update(fast,false);assert.notEqual(view.ring.material.emissiveIntensity,normal);
 view.update({...state,time:1},true);const reduced=view.ring.material.emissiveIntensity;
 view.update({...state,time:2},true);assert.equal(view.ring.material.emissiveIntensity,reduced);
 const disposed:string[]=[];view.root.traverse(object=>{if(object instanceof Mesh){object.geometry.addEventListener('dispose',()=>disposed.push('geometry'));(object.material as {addEventListener:(type:'dispose',fn:()=>void)=>void}).addEventListener('dispose',()=>disposed.push('material'));}});
 view.dispose();assert.equal(disposed.filter(x=>x==='geometry').length,6);assert.equal(disposed.filter(x=>x==='material').length,6);assert.equal(view.root.children.length,0);
});
