import test from 'node:test';import assert from 'node:assert/strict';import{Matrix4,Vector3,type Material}from'three';
import{actFrontier,createFrontier,stepFrontier,heightAt,walkable}from'./engine.ts';import{DASH_VISUAL}from'./dash.ts';import{DashView}from'./dashView.ts';
function setup(x:number,z:number,heading:number){const s=actFrontier(createFrontier('solo'),{type:'start'});s.enemies=[];s.hero.x=x;s.hero.z=z;s.hero.target={x,z};s.hero.heading=heading;return s;}
const close=(a:number,b:number,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('dash records only the actual validated distance and keeps gameplay, cancellation and timing',()=>{
 const start=setup(-10,5,Math.PI/2),dash=actFrontier(start,{type:'dash'});close(dash.hero.x,-5);close(dash.hero.z,5);assert.deepEqual(dash.hero.dashTrace,{from:{x:-10,z:5},to:{x:-5,z:5},at:0});assert.equal(start.hero.dashTrace,undefined);assert.equal(dash.hero.dash,3);
 const blocked=actFrontier(setup(2.99,5,Math.PI/2),{type:'dash'});close(blocked.hero.x,2.99);assert.equal(blocked.hero.dashTrace,undefined);assert.equal(blocked.hero.dash,3);
 const short=actFrontier(setup(2.4,5,Math.PI/2),{type:'dash'});assert.ok(short.hero.x<3&&short.hero.x>2.4);assert.equal(short.hero.dashTrace?.to.x,short.hero.x);
 const paused=actFrontier(dash,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);const fast=stepFrontier(actFrontier(dash,{type:'speed'}),.05);close(fast.time,.1);assert.ok(fast.hero.dashTrace);let done=dash;for(let i=0;i<8;i++)done=stepFrontier(done,.05);assert.equal(done.hero.dashTrace,undefined);
});
test('world-space dash effect stays on valid terrain and disappears without motion when requested',()=>{
 const view=new DashView(),matrix=new Matrix4(),p=new Vector3(),ends=[new Vector3(0,0,-.5),new Vector3(0,0,.5)];
 for(const [x,z,h]of [[-10,5,Math.PI/2],[-15,-6,0],[3.5,0,Math.PI/2],[2.4,5,Math.PI/2],[-15,-20,Math.PI]] as const){const state=actFrontier(setup(x,z,h),{type:'dash'}),trace=state.hero.dashTrace!;assert.ok(trace);view.update(trace,0,false);assert.ok(view.streak.count>0&&view.streak.count<=DASH_VISUAL.segments);assert.ok(view.chips.count<=DASH_VISUAL.chips);
  const dx=trace.to.x-trace.from.x,dz=trace.to.z-trace.from.z,l2=dx*dx+dz*dz;
  for(let i=0;i<view.streak.count;i++){view.streak.getMatrixAt(i,matrix);for(const end of ends){p.copy(end).applyMatrix4(matrix);assert.ok(walkable(p),'no trail over blocked terrain');const u=((p.x-trace.from.x)*dx+(p.z-trace.from.z)*dz)/l2;assert.ok(u>=-1e-5&&u<=1+1e-5,'no trail beyond actual travel');assert.ok(Math.abs(p.y-heightAt(p.x,p.z)-.14)<.13,'slope surface');}}
  view.streak.getMatrixAt(0,matrix);const frozen=matrix.clone();view.update(trace,0,false);view.streak.getMatrixAt(0,matrix);assert.deepEqual(matrix.elements,frozen.elements);view.update(trace,.18,false);assert.ok((view.streak.material as {opacity:number}).opacity<.9);view.update(trace,.18,true);assert.equal(view.streak.count,0);assert.equal(view.chips.count,0);view.update(trace,DASH_VISUAL.duration,false);assert.equal(view.root.visible,false);
 }
 view.update(undefined,0,false);assert.equal(view.root.visible,false);view.dispose();
});

test('all eight travel directions reuse bounded resources and release them on teardown',()=>{
 const view=new DashView(),geometry=view.streak.geometry,material=view.streak.material as Material,chipGeometry=view.chips.geometry,chipMaterial=view.chips.material as Material;let disposed=0;for(const item of [geometry,material,chipGeometry,chipMaterial])item.addEventListener('dispose',()=>disposed++);
 for(let i=0;i<8;i++){const angle=i*Math.PI/4,state=actFrontier(setup(-15,5,angle),{type:'dash'});assert.ok(state.hero.dashTrace);for(let j=0;j<20;j++){view.update(state.hero.dashTrace,j*.01,false);assert.ok(view.streak.count<=DASH_VISUAL.segments);assert.ok(view.chips.count<=DASH_VISUAL.chips);assert.equal(view.streak.geometry,geometry);assert.equal(view.chips.geometry,chipGeometry);}}
 view.dispose();assert.equal(disposed,4);
});
