import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{AnimationClip,Group,Mesh,Vector3,Box3}from'three';import{HeroView}from'./heroView.ts';import{actFrontier,createFrontier}from'./engine.ts';import{heroRingMatrix}from'./heroEffects.ts';import{heightAt}from'./engine.ts';import{hammerPoint}from'./heroAttack.ts';import{HERO_MODEL}from'./heroModel.ts';
const parse=async(name:string)=>{const b=readFileSync(new URL(`../../../public/defense/models/${name}.glb`,import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const walk=await parse('kar-barbarian-walk'),slam=await parse('kar-barbarian'),entry=await parse('kar-entry'),reset=await parse('kar-reset');
const setup=()=>{const model=walk.scene.clone(true),view=new HeroView(model,walk.animations[0]);view.setSlam(slam.animations[0]);view.setEntries(entry.animations);const root=new Group();root.add(model);let s=actFrontier(createFrontier('solo'),{type:'start'});s=actFrontier(s,{type:'skill'});return{view,root,s};};
test('existing hammer socket faces committed direction and matches gameplay contact in eight headings',()=>{const{view,root,s}=setup();for(let i=0;i<8;i++){s.hero.heading=i*Math.PI/4;s.hero.attack!.heading=s.hero.heading;s.hero.attack!.time=.28;s.hero.attack!.hit=true;root.rotation.y=s.hero.heading;root.position.set(s.hero.x,0,s.hero.z);view.update(s.hero,false);root.updateMatrixWorld(true);const socket=root.getObjectByName('hammer-contact')!.getWorldPosition(new Vector3()),p=hammerPoint(s.hero.x,s.hero.z,s.hero.heading);assert.ok(Math.hypot(socket.x-p.x,socket.z-p.z)<1e-5);assert.ok(Math.abs(socket.y-HERO_MODEL.socket[1])<1e-5);}view.dispose();});
test('entry from 32 walk samples keeps grips connected and reaches the same contact',()=>{const{view,root,s}=setup();for(let phase=0;phase<32;phase++){s.hero.attack!.fromMoving=true;s.hero.attack!.walkTime=phase*.025;for(const t of [0,.01,.02,.03,.04,.06,.14,.19,.28,.4,.56]){s.hero.attack!.time=t;view.update(s.hero,false);root.updateMatrixWorld(true);for(const [i,side]of ['left','right'].entries()){const arm=root.getObjectByName(side+'-forearm')!,grip=root.getObjectByName(i===0?'upper-grip':'lower-grip')!;assert.ok(new Vector3(0,1,0).applyMatrix4(arm.matrixWorld).distanceTo(grip.getWorldPosition(new Vector3()))<.002);}}}view.dispose();});
test('repeated paused/reduced samples stay stable and recovery does not disable the next attack',()=>{const{view,root,s}=setup();const socket=()=>{root.updateMatrixWorld(true);return root.getObjectByName('hammer-contact')!.getWorldPosition(new Vector3()).toArray();};s.hero.attack!.time=.1;view.update(s.hero,true);const first=socket();s.hero.attack!.time=.2;view.update(s.hero,true);assert.deepEqual(socket(),first);s.hero.attack!.time=.28;s.hero.attack!.hit=true;view.update(s.hero,true);assert.notDeepEqual(socket(),first);s.hero.attack!.time=.56;view.update(s.hero,false);s.hero.attack!.time=.19;s.hero.attack!.hit=false;view.update(s.hero,false);const next=socket();view.update(s.hero,false);assert.deepEqual(socket(),next);assert.ok(next[1]>2);view.dispose();});
test('walking-only asset remains stable when optional attack clips fail',()=>{const view=new HeroView(walk.scene.clone(true),walk.animations[0]),s=actFrontier(actFrontier(createFrontier('solo'),{type:'start'}),{type:'skill'});view.update(s.hero,false);assert.ok(view.model.getObjectByName('hammer-contact'));view.dispose();});

test('attack rings follow the local ramp instead of cutting horizontally through it',()=>{for(const p of [{x:-15,z:-6},{x:6,z:0}]){const matrix=heroRingMatrix(p);for(let i=0;i<32;i++){const angle=i*Math.PI/16,v=new Vector3(Math.cos(angle)*1.4,Math.sin(angle)*1.4,0).applyMatrix4(matrix);assert.ok(Math.abs(v.y-heightAt(v.x,v.z)-.07)<1e-5);}}});

const matrices=(root:Group)=>{root.updateMatrixWorld(true);return ['body','war-hammer','left-foot','right-foot','left-upper','left-forearm','right-upper','right-forearm','upper-grip','lower-grip'].map(n=>[...root.getObjectByName(n)!.matrixWorld.elements]);};
const error=(a:number[][],b:number[][])=>Math.max(...a.flatMap((m,i)=>m.map((v,j)=>Math.abs(v-b[i][j]))));
test('grounded idle joins stationary attack and authored recovery without moving either foot',()=>{
 const {view,root,s}=setup();view.setReset(reset.animations[0]);const attack=s.hero.attack!;attack.fromMoving=false;s.hero.attack=undefined;view.update(s.hero,false);const idle=matrices(root);
 s.hero.attack=attack;attack.time=0;view.update(s.hero,false);assert.ok(error(idle,matrices(root))<1e-6);
 for(let direction=0;direction<8;direction++){root.rotation.y=direction*Math.PI/4;attack.time=.43;view.update(s.hero,false);const start=matrices(root),feet=start.slice(2,4);
 for(const time of [.43,.45,.48,.51,.54,.56]){attack.time=time;view.update(s.hero,false);const pose=matrices(root);assert.ok(error(feet,pose.slice(2,4))<1e-6);for(const [i,side]of ['left','right'].entries()){const arm=root.getObjectByName(side+'-forearm')!,grip=root.getObjectByName(i===0?'upper-grip':'lower-grip')!;assert.ok(new Vector3(0,1,0).applyMatrix4(arm.matrixWorld).distanceTo(grip.getWorldPosition(new Vector3()))<.006);}}
 const finish=matrices(root);s.hero.attack=undefined;view.update(s.hero,false);assert.ok(error(finish,matrices(root))<1e-6);s.hero.attack=attack;}
 view.dispose();
});
test('recovery starts at the shared rebound for all eight moving entries and preserves contact',()=>{const a=setup(),b=setup();a.view.setReset(reset.animations[0]);for(let phase=0;phase<8;phase++)for(const time of [.19,.28,.43]){for(const x of [a,b]){x.s.hero.attack!.fromMoving=true;x.s.hero.attack!.walkTime=phase*.1;x.s.hero.attack!.time=time;x.view.update(x.s.hero,false);}assert.ok(error(matrices(a.root),matrices(b.root))<1e-6);}a.view.dispose();b.view.dispose();});
test('recovery sampling freezes on pause, reduced motion keeps contact readable and rest resumes grounded',()=>{const{view,root,s}=setup();view.setReset(reset.animations[0]);s.hero.attack!.time=.49;view.update(s.hero,false);const frozen=matrices(root);for(let i=0;i<10;i++)view.update(s.hero,false);assert.deepEqual(matrices(root),frozen);s.hero.attack!.hit=true;view.update(s.hero,true);const contact=matrices(root);s.hero.attack!.time=.55;view.update(s.hero,true);assert.deepEqual(matrices(root),contact);s.hero.attack=undefined;view.update(s.hero,true);assert.notDeepEqual(matrices(root),contact);view.dispose();});

test('entry-only loading fallback still animates a stationary attack when the optional slam file fails',()=>{const view=new HeroView(walk.scene.clone(true),walk.animations[0]);view.setEntries(entry.animations);view.setReset(reset.animations[0]);const root=new Group();root.add(view.model);const s=actFrontier(actFrontier(createFrontier('solo'),{type:'start'}),{type:'skill'});s.hero.attack!.time=.19;view.update(s.hero,false);root.updateMatrixWorld(true);const reference=setup();reference.s.hero.attack!.fromMoving=true;reference.s.hero.attack!.time=.19;reference.view.update(reference.s.hero,false);assert.ok(error(matrices(root),matrices(reference.root))<1e-6);reference.view.dispose();view.dispose();});

const stop=await parse('kar-stop');
test('continuous last walk joins stop exactly, settles to grounded idle and retains both grips',()=>{
 const {view,root,s}=setup();view.setStops(stop.animations);s.hero.attack=undefined;
 for(let phase=0;phase<32;phase++){
  const walkTime=phase*.025;s.hero.moving=true;s.hero.walkDistance=walkTime/.8*1.6;view.update(s.hero,false);const before=matrices(root);
  s.hero.moving=false;s.hero.settle={walkTime,time:0};view.update(s.hero,false);assert.ok(error(before,matrices(root))<1e-6,'no first-frame foot/body pop');
  for(const time of [.01,.02,.03,.04,.08,.12,.16,.20,.24]){s.hero.settle.time=time;view.update(s.hero,false);root.updateMatrixWorld(true);
   for(const side of ['left','right'])assert.ok(new Box3().setFromObject(root.getObjectByName(side+'-foot')!).min.y>-.00001,'sole never penetrates the flat ground');
   for(const[i,side]of ['left','right'].entries()){const arm=root.getObjectByName(side+'-forearm')!,grip=root.getObjectByName(i===0?'upper-grip':'lower-grip')!;assert.ok(new Vector3(0,1,0).applyMatrix4(arm.matrixWorld).distanceTo(grip.getWorldPosition(new Vector3()))<.006);}
  }
  const end=matrices(root);s.hero.settle=undefined;view.update(s.hero,false);assert.ok(error(end,matrices(root))<1e-6,'no idle end pop');
 }
 view.dispose();
});
test('stop pose is simulation sampled, reduced motion holds idle, resume and attack take priority',()=>{
 const a=setup(),b=setup();a.view.setStops(stop.animations);a.s.hero.attack=undefined;a.s.hero.settle={time:.12,walkTime:.2};a.view.update(a.s.hero,false);const frozen=matrices(a.root);a.view.update(a.s.hero,false);assert.deepEqual(matrices(a.root),frozen);
 b.s.hero.attack=undefined;a.view.update(a.s.hero,true);b.view.update(b.s.hero,true);assert.ok(error(matrices(a.root),matrices(b.root))<1e-6);
 a.s.hero.moving=b.s.hero.moving=true;a.s.hero.walkDistance=b.s.hero.walkDistance=.7;a.view.update(a.s.hero,false);b.view.update(b.s.hero,false);assert.ok(error(matrices(a.root),matrices(b.root))<1e-6);
 for(const x of [a,b]){x.s.hero.attack={kind:'basic',time:.19,heading:0,hit:false,targetId:1,damage:25,walkTime:.2,fromMoving:false};x.view.update(x.s.hero,false);}assert.ok(error(matrices(a.root),matrices(b.root))<1e-6);a.view.dispose();b.view.dispose();
});
test('missing or incomplete stop clips preserve existing grounded idle',()=>{const a=setup(),b=setup();a.view.setStops(stop.animations.slice(0,7));for(const x of[a,b]){x.s.hero.attack=undefined;x.s.hero.settle={time:.12,walkTime:.2};x.view.update(x.s.hero,false);}assert.ok(error(matrices(a.root),matrices(b.root))<1e-6);a.view.dispose();b.view.dispose();});

const compact=await parse('frontier-kar-game');
test('Kar soles clear the actual ramp in every heading and walk phase without moving the hammer or body',()=>{
 const make=()=>{const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);return{root,view,hero:createFrontier('solo').hero};};
 const a=make(),b=make(),point=new Vector3();
 for(let direction=0;direction<8;direction++)for(let phase=0;phase<16;phase++){
  for(const x of [a,b]){Object.assign(x.hero,{x:-14,z:-7,heading:direction*Math.PI/4,moving:true,walkDistance:phase*.1});x.root.position.set(-14,heightAt(-14,-7),-7);x.root.rotation.y=x.hero.heading;}
  a.view.update(a.hero,false,heightAt);b.view.update(b.hero,false);a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);
  for(const name of ['body','war-hammer','hammer-contact'])assert.ok(a.root.getObjectByName(name)!.getWorldPosition(new Vector3()).distanceTo(b.root.getObjectByName(name)!.getWorldPosition(new Vector3()))<1e-6);
  for(const name of ['left-foot','right-foot']){let clearance=Infinity;a.root.getObjectByName(name)!.traverse(o=>{if(o instanceof Mesh){const v=o.geometry.getAttribute('position');for(let i=0;i<v.count;i++){point.fromBufferAttribute(v,i).applyMatrix4(o.matrixWorld);clearance=Math.min(clearance,point.y-heightAt(point.x,point.z));}}});assert.ok(clearance>-.00001,`${name}: ${clearance}`);}
  const once=matrices(a.root);a.view.update(a.hero,false,heightAt);assert.ok(error(once,matrices(a.root))<1e-6,'repeated simulation sample must not accumulate');
 }
 a.view.dispose();b.view.dispose();
});
test('flat ground, bridge deck and a model without foot nodes remain safe',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!),hero=createFrontier('solo').hero;
 for(const [x,z] of [[-14,14],[6,0]]){hero.x=x;hero.z=z;hero.moving=true;hero.walkDistance=.35;root.position.set(x,heightAt(x,z),z);view.update(hero,false);const original=matrices(root);view.update(hero,false,heightAt);assert.ok(error(original,matrices(root))<1e-6,'flat ground keeps authored poses');}
 view.dispose();const fallback=new HeroView(new Group(),new AnimationClip('empty',1,[]));assert.doesNotThrow(()=>fallback.update(hero,true,heightAt));fallback.dispose();
});
test('slope correction keeps the hammer contact and feet grounded during attack and reduced motion',()=>{
 const make=()=>{const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);view.setReset(compact.animations.find(c=>c.name==='kar-reset-0')!);const s=actFrontier(actFrontier(createFrontier('solo'),{type:'start'}),{type:'skill'});return{root,view,hero:s.hero};};
 const a=make(),b=make(),p=new Vector3();for(const reduced of [false,true])for(const time of [0,.19,.28,.43,.56]){
  for(const x of [a,b]){x.hero.x=-14;x.hero.z=-7;x.hero.attack!.time=time;x.hero.attack!.hit=time>=.28;x.root.position.set(-14,heightAt(-14,-7),-7);x.view.update(x.hero,reduced,x===a?heightAt:undefined);x.root.updateMatrixWorld(true);}
  assert.ok(a.root.getObjectByName('hammer-contact')!.getWorldPosition(new Vector3()).distanceTo(b.root.getObjectByName('hammer-contact')!.getWorldPosition(new Vector3()))<1e-6);
  for(const name of ['left-foot','right-foot'])a.root.getObjectByName(name)!.traverse(o=>{if(o instanceof Mesh){const v=o.geometry.getAttribute('position');for(let i=0;i<v.count;i++){p.fromBufferAttribute(v,i).applyMatrix4(o.matrixWorld);assert.ok(p.y-heightAt(p.x,p.z)>-.00001);}}});
 }
 a.view.dispose();b.view.dispose();
});

test('Kar planted boot stays in world space through both half-strides in all headings',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);
 const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!),hero=createFrontier('solo').hero;
 hero.moving=true;
 for(let direction=0;direction<8;direction++)for(const [first,last,foot] of [[0,.5,'left-foot'],[.5,1,'right-foot']] as const){
  const heading=direction*Math.PI/4;hero.heading=heading;root.rotation.y=heading;let anchor:Vector3|undefined;
  for(let i=0;i<=16;i++){
   const distance=(first+(last-first)*i/16)*1.6;hero.walkDistance=distance;
   hero.x=Math.sin(heading)*distance;hero.z=Math.cos(heading)*distance;root.position.set(hero.x,0,hero.z);
   view.update(hero,false,()=>0);root.updateMatrixWorld(true);
   const p=root.getObjectByName(foot)!.getWorldPosition(new Vector3());anchor??=p.clone();
   assert.ok(Math.hypot(p.x-anchor.x,p.z-anchor.z)<.0001,`${foot}, heading ${direction}, phase ${i}: ${p.distanceTo(anchor)}`);
  }
 }
 view.dispose();
});

test('moving attack retains the corrected initial stance and releases it before hammer contact',()=>{
 const a=setup(),b=setup();
 for(let phase=0;phase<32;phase++){
  const h=a.s.hero;h.attack=undefined;h.moving=true;h.walkDistance=phase*.025/.8*1.6;
  a.view.update(h,false);const walk=matrices(a.root);
  h.moving=false;h.attack={kind:'basic',time:0,heading:0,hit:false,targetId:1,damage:25,walkTime:phase*.025,fromMoving:true};
  a.view.update(h,false);assert.ok(error(walk,matrices(a.root))<1e-5,'attack starts at the actual walking stance');
  h.attack.time=.28;h.attack.hit=true;b.s.hero.attack!.time=.28;b.s.hero.attack!.fromMoving=false;
  a.view.update(h,false);b.view.update(b.s.hero,false);
  assert.ok(error(matrices(a.root),matrices(b.root))<1e-5,'correction has settled by contact');
 }
 a.view.dispose();b.view.dispose();
});

test('the supporting boot stays planted while the other settles into attack or stop',()=>{
 const {view,root,s}=setup();view.setStops(stop.animations);
 for(let phase=0;phase<8;phase++)for(const mode of ['attack','stop'] as const){
  const h=s.hero,time=phase*.1,support=phase<4?'left-foot':'right-foot';
  h.attack=undefined;h.settle=undefined;h.moving=true;h.walkDistance=time/.8*1.6;view.update(h,false);
  root.updateMatrixWorld(true);const anchor=root.getObjectByName(support)!.getWorldPosition(new Vector3());h.moving=false;
  for(const t of [0,.02,.04,.06,.08]){
   if(mode==='attack')h.attack={kind:'basic',time:t,heading:0,hit:false,targetId:1,damage:25,walkTime:time,fromMoving:true};
   else h.settle={time:t,walkTime:time};
   view.update(h,false);root.updateMatrixWorld(true);const p=root.getObjectByName(support)!.getWorldPosition(new Vector3());
   assert.ok(p.distanceTo(anchor)<.0001,`${mode}, phase ${phase}, ${support}: ${p.distanceTo(anchor)}`);
  }
 }
 view.dispose();
});

test('leaning dash preserves boot clearance on flat ground, a ramp and the bridge',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!),hero=createFrontier('solo').hero,p=new Vector3();hero.moving=true;
 for(const [x,z] of [[-14,14],[-14,-7],[6,0]])for(let d=0;d<8;d++)for(const progress of [.25,.5,.75]){hero.x=x;hero.z=z;hero.heading=d*Math.PI/4;hero.walkDistance=progress*5;hero.dashMotion={from:{x,z},to:{x:x+1,z},at:0,progress,duration:.2};root.position.set(x,heightAt(x,z),z);root.rotation.set(.16*Math.sin(Math.PI*progress),hero.heading,0,'YXZ');view.update(hero,false,heightAt);root.updateMatrixWorld(true);
  for(const name of ['left-foot','right-foot'])root.getObjectByName(name)!.traverse(o=>{if(o instanceof Mesh){const v=o.geometry.getAttribute('position');for(let i=0;i<v.count;i++){p.fromBufferAttribute(v,i).applyMatrix4(o.matrixWorld);assert.ok(p.y-heightAt(p.x,p.z)>-.0001,`${name} penetrates terrain`);}}});
  const once=matrices(root);view.update(hero,false,heightAt);assert.ok(error(once,matrices(root))<1e-6,'paused sample does not accumulate');
 }
 view.dispose();
});
