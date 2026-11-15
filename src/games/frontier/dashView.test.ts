import test from 'node:test';import assert from 'node:assert/strict';import{Matrix4,Vector3,type Material}from'three';
import{actFrontier,createFrontier,stepFrontier,heightAt,walkable}from'./engine.ts';import{DASH_MOTION,DASH_VISUAL}from'./dash.ts';import{DashView}from'./dashView.ts';
function setup(x:number,z:number,heading:number){const s=actFrontier(createFrontier('solo'),{type:'start'});s.enemies=[];s.hero.x=x;s.hero.z=z;s.hero.target={x,z};s.hero.heading=heading;return s;}
const close=(a:number,b:number,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function finish(s:ReturnType<typeof setup>){for(let i=0;i<4;i++)s=stepFrontier(s,.05);return s;}
test('dash moves through the actual collision-checked path over simulation time',()=>{
 const start=setup(-10,5,Math.PI/2),dash=actFrontier(start,{type:'dash'});close(dash.hero.x,-10);assert.equal(dash.hero.dashTrace,undefined);assert.equal(dash.hero.dash,3);assert.equal(start.hero.dashMotion,undefined);assert.ok(dash.hero.dashMotion);close(dash.hero.dashMotion!.to.x,-5);
 const quarter=stepFrontier(dash,.05);close(quarter.hero.x,-8.75);close(quarter.hero.dashMotion!.progress,.25);close(quarter.hero.dashTrace!.to.x,quarter.hero.x);assert.equal(dash.hero.dashMotion!.progress,0);
 const paused=actFrontier(quarter,{type:'pause'});assert.equal(stepFrontier(paused,.05),paused);for(const type of ['attack','skill','interact'] as const)assert.equal(actFrontier(quarter,{type}),quarter);
 const fast=stepFrontier(actFrontier(dash,{type:'speed'}),.05),normal=stepFrontier(quarter,.05);close(fast.hero.x,normal.hero.x);close(fast.hero.dashMotion!.progress,.5);
 const landed=finish(dash);close(landed.hero.x,-5);close(landed.hero.z,5);assert.equal(landed.hero.dashMotion,undefined);close(landed.hero.dashTrace!.to.x,-5);assert.ok(landed.hero.dash>2.7);let done=landed;for(let i=0;i<4;i++)done=stepFrontier(done,.05);assert.equal(done.hero.dashTrace,undefined);
});
test('blocked and shortened paths never cross water; queued ground input resumes after landing',()=>{
 const blocked=actFrontier(setup(2.99,5,Math.PI/2),{type:'dash'});close(blocked.hero.x,2.99);assert.equal(blocked.hero.dashMotion,undefined);assert.equal(blocked.hero.dashTrace,undefined);assert.equal(blocked.hero.dash,3);
 const graze=actFrontier(setup(2.9,2.12,3*Math.PI/4),{type:'dash'});assert.equal(graze.hero.dashMotion,undefined,'a segment may cross a corner even when both samples are walkable');close(graze.hero.x,2.9);
 let short=actFrontier(setup(2.4,5,Math.PI/2),{type:'dash'});assert.ok(short.hero.dashMotion!.to.x<3);close(short.hero.dashMotion!.duration,.02);short=stepFrontier(short,.01);close(short.hero.x,2.65);assert.ok(walkable(short.hero));short=stepFrontier(short,.01);close(short.hero.x,2.9);assert.equal(short.hero.dashMotion,undefined);
 let bridge=actFrontier(setup(2,0,Math.PI/2),{type:'dash'});for(let i=0;i<4;i++){bridge=stepFrontier(bridge,.05);assert.ok(walkable(bridge.hero));}close(bridge.hero.x,7);
 let queued=actFrontier(setup(-10,5,Math.PI/2),{type:'dash'});queued=actFrontier(queued,{type:'move',point:{x:-5,z:10}});queued=finish(queued);close(queued.hero.x,-5);close(queued.hero.z,5);queued=stepFrontier(queued,.05);assert.ok(queued.hero.z>5);
});
test('world-space dash effect stays on valid terrain and disappears without motion when requested',()=>{
 const view=new DashView(),matrix=new Matrix4(),p=new Vector3(),ends=[new Vector3(0,0,-.5),new Vector3(0,0,.5)];
 for(const [x,z,h]of [[-10,5,Math.PI/2],[-15,-6,0],[3.5,0,Math.PI/2],[2.4,5,Math.PI/2],[-15,-20,Math.PI]] as const){const state=finish(actFrontier(setup(x,z,h),{type:'dash'})),trace=state.hero.dashTrace!;assert.ok(trace);view.update(trace,0,false);assert.ok(view.streak.count>0&&view.streak.count<=DASH_VISUAL.segments);assert.ok(view.chips.count<=DASH_VISUAL.chips);
  const dx=trace.to.x-trace.from.x,dz=trace.to.z-trace.from.z,l2=dx*dx+dz*dz;
  for(let i=0;i<view.streak.count;i++){view.streak.getMatrixAt(i,matrix);for(const end of ends){p.copy(end).applyMatrix4(matrix);assert.ok(walkable(p),'no trail over blocked terrain');const u=((p.x-trace.from.x)*dx+(p.z-trace.from.z)*dz)/l2;assert.ok(u>=-1e-5&&u<=1+1e-5,'no trail beyond actual travel');assert.ok(Math.abs(p.y-heightAt(p.x,p.z)-.14)<.13,'slope surface');}}
  view.streak.getMatrixAt(0,matrix);const frozen=matrix.clone();view.update(trace,0,false);view.streak.getMatrixAt(0,matrix);assert.deepEqual(matrix.elements,frozen.elements);view.update(trace,.18,false);assert.ok((view.streak.material as {opacity:number}).opacity<.9);view.update(trace,.18,true);assert.equal(view.streak.count,0);assert.equal(view.chips.count,0);view.update(trace,DASH_VISUAL.duration,false);assert.equal(view.root.visible,false);
 }
 view.update(undefined,0,false);assert.equal(view.root.visible,false);view.dispose();
});
test('all eight travel directions reuse bounded resources and release them on teardown',()=>{
 const view=new DashView(),geometry=view.streak.geometry,material=view.streak.material as Material,chipGeometry=view.chips.geometry,chipMaterial=view.chips.material as Material;let disposed=0;for(const item of [geometry,material,chipGeometry,chipMaterial])item.addEventListener('dispose',()=>disposed++);
 for(let i=0;i<8;i++){const angle=i*Math.PI/4,state=finish(actFrontier(setup(-15,5,angle),{type:'dash'}));assert.ok(state.hero.dashTrace);for(let j=0;j<20;j++){view.update(state.hero.dashTrace,j*.01,false);assert.ok(view.streak.count<=DASH_VISUAL.segments);assert.ok(view.chips.count<=DASH_VISUAL.chips);assert.equal(view.streak.geometry,geometry);assert.equal(view.chips.geometry,chipGeometry);}}
 view.dispose();assert.equal(disposed,4);assert.equal(DASH_MOTION.duration,.2);
});

test('directional steering is held until landing and then resumes without overshoot',()=>{let s=actFrontier(setup(-10,5,Math.PI/2),{type:'dash'});for(let i=0;i<4;i++){s=stepFrontier(s,.05,{x:-1,z:0});assert.ok(s.hero.x>=-10&&s.hero.x<=-5);close(s.hero.z,5);}close(s.hero.x,-5);assert.equal(s.hero.dashMotion,undefined);s=stepFrontier(s,.05,{x:-1,z:0});assert.ok(s.hero.x< -5);});

test('continuous movement cannot graze through either bank at bridge corners',()=>{
 for(const x of [2.8,2.9,3,3.1,8.9,9,9.1,9.2])for(const z of [-2.15,-2.05,-2,-1.9,1.9,2,2.05,2.15])for(let d=0;d<16;d++){
  if(!walkable({x,z}))continue;let s=actFrontier(setup(x,z,d*Math.PI/8),{type:'dash'});for(let tick=0;tick<40;tick++){s=stepFrontier(s,.005);assert.ok(walkable(s.hero),`crossed bank at ${x},${z}, direction ${d}, tick ${tick}`);}
 }
});
