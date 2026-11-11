import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{AnimationClip,Group,Matrix4,Mesh,Vector3,Box3}from'three';import{HeroView}from'./heroView.ts';import{actFrontier,createFrontier,stepFrontier}from'./engine.ts';import{heroRingMatrix}from'./heroEffects.ts';import{heightAt}from'./engine.ts';import{hammerPoint}from'./heroAttack.ts';import{HERO_MODEL}from'./heroModel.ts';
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
test('planted Kar boot soles follow the ramp across all headings without changing the hammer',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);const hero=createFrontier('solo').hero;
 const sole=(name:string)=>{root.updateMatrixWorld(true);const foot=root.getObjectByName(name)!,inverse=new Matrix4().copy(foot.matrixWorld).invert(),points:Vector3[]=[];
  foot.traverse(o=>{if(!(o instanceof Mesh))return;const p=o.geometry.getAttribute('position'),local=new Matrix4().multiplyMatrices(inverse,o.matrixWorld);for(let i=0;i<p.count;i++)points.push(new Vector3().fromBufferAttribute(p,i).applyMatrix4(local));});
  const bottom=Math.min(...points.map(p=>p.y));return points.filter(p=>p.y<=bottom+.025).map(p=>p.applyMatrix4(foot.matrixWorld)).map(p=>p.y-heightAt(p.x,p.z));};
 let previousSpread=0,newSpread=0;
 for(let d=0;d<8;d++)for(const reduced of [false,true]){
  Object.assign(hero,{x:-14,z:-7,heading:d*Math.PI/4,moving:false});root.position.set(hero.x,heightAt(hero.x,hero.z),hero.z);root.rotation.y=hero.heading;
  view.update(hero,reduced);root.updateMatrixWorld(true);const hammer=root.getObjectByName('hammer-contact')!.getWorldPosition(new Vector3());
  for(const name of ['left-foot','right-foot']){const c=sole(name);previousSpread=Math.max(previousSpread,Math.max(...c)-Math.min(...c));}
  view.update(hero,reduced,heightAt);root.updateMatrixWorld(true);assert.ok(root.getObjectByName('hammer-contact')!.getWorldPosition(new Vector3()).distanceTo(hammer)<1e-6);
  for(const name of ['left-foot','right-foot']){const c=sole(name);newSpread=Math.max(newSpread,Math.max(...c)-Math.min(...c));assert.ok(Math.min(...c)>-.0001&&Math.max(...c)<.021,`${name} ${d} ${reduced}: ${Math.min(...c)}, ${Math.max(...c)}`);}
  const pose=matrices(root);view.update(hero,reduced,heightAt);assert.ok(error(pose,matrices(root))<1e-6,'paused frames must not accumulate ankle rotation');
 }
 assert.ok(previousSpread>.23&&newSpread<.021,`${previousSpread} -> ${newSpread}`);view.dispose();
});
test('boot tilt joins flat and sloped ground continuously and avoids sudden bridge-step rotation',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);const hero=createFrontier('solo').hero;
 for(const [x0,x1,z0,z1] of [[-14,-14,-12.5,-11.5],[-14,-14,-2.5,-1.5],[1.5,2.5,0,0],[9.5,10.5,0,0],[6,6,2.3,3.3]])for(let d=0;d<8;d++){
  let previous:Vector3|undefined;for(let i=0;i<=100;i++){
   const x=x0+(x1-x0)*i/100,z=z0+(z1-z0)*i/100;Object.assign(hero,{x,z,heading:d*Math.PI/4,moving:false});root.position.set(x,heightAt(x,z),z);root.rotation.y=hero.heading;view.update(hero,false,heightAt);root.updateMatrixWorld(true);
   const m=root.getObjectByName('left-foot')!.matrixWorld,normal=new Vector3().setFromMatrixColumn(m,2).cross(new Vector3().setFromMatrixColumn(m,0)).normalize();if(previous)assert.ok(normal.angleTo(previous)<.08,`tilt popped at ${x},${z},${d}`);previous=normal;
  }
 }
 view.dispose();
});
test('slope alignment keeps the top of the authored lower leg connected',()=>{
 const make=()=>{const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);return{root,view,hero:createFrontier('solo').hero};};const a=make(),b=make();
 for(let d=0;d<8;d++)for(let phase=0;phase<8;phase++){
  for(const s of [a,b]){Object.assign(s.hero,{x:-14,z:-7,heading:d*Math.PI/4,moving:true,walkDistance:phase*.2});s.root.position.set(-14,heightAt(-14,-7),-7);s.root.rotation.y=s.hero.heading;}
  a.view.update(a.hero,false);b.view.update(b.hero,false,heightAt);a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);
  for(const name of ['left-foot','right-foot']){const top=new Vector3(0,1.3,0),before=a.root.getObjectByName(name)!.localToWorld(top.clone()),after=b.root.getObjectByName(name)!.localToWorld(top.clone());assert.ok(Math.hypot(before.x-after.x,before.z-after.z)<1e-5,`${name}, ${d}, ${phase}`);}
 }
 a.view.dispose();b.view.dispose();
});
test('boots straddling a raised bridge edge do not intersect the deck',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);const hero=createFrontier('solo').hero,p=new Vector3();
 for(const edge of ['west','east','side'] as const)for(let i=0;i<=40;i++)for(let d=0;d<8;d++)for(let phase=0;phase<4;phase++){
  const x=edge==='west'?1+i*.05:edge==='east'?9+i*.05:6,z=edge==='side'?1.8+i*.05:0;
  Object.assign(hero,{x,z,heading:d*Math.PI/4,moving:true,walkDistance:phase*.2});root.position.set(x,heightAt(x,z),z);root.rotation.y=hero.heading;view.update(hero,false,heightAt);root.updateMatrixWorld(true);
  for(const name of ['left-foot','right-foot'])root.getObjectByName(name)!.traverse(o=>{if(o instanceof Mesh){const a=o.geometry.getAttribute('position');for(let j=0;j<a.count;j++){p.fromBufferAttribute(a,j).applyMatrix4(o.matrixWorld);assert.ok(p.y-heightAt(p.x,p.z)>-.0001,`${edge}, ${x}, ${z}, ${d}, ${phase}, ${name}`);}}});
 }
 view.dispose();
});
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

test('the planted sole stays fixed on a ramp through both half-strides',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!),hero=createFrontier('solo').hero;hero.moving=true;root.updateMatrixWorld(true);
 const soles=new Map<string,Vector3>();for(const name of ['left-foot','right-foot']){
  const foot=root.getObjectByName(name)!,inverse=new Matrix4().copy(foot.matrixWorld).invert(),vertices:Vector3[]=[];
  foot.traverse(o=>{if(o instanceof Mesh){const a=o.geometry.getAttribute('position'),local=new Matrix4().multiplyMatrices(inverse,o.matrixWorld);for(let i=0;i<a.count;i++)vertices.push(new Vector3().fromBufferAttribute(a,i).applyMatrix4(local));}});
  const bottom=Math.min(...vertices.map(p=>p.y)),points=vertices.filter(p=>p.y<=bottom+.025);soles.set(name,points.reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(1/points.length));
 }
 for(let d=0;d<8;d++)for(const [start,end,name] of [[0,.5,'left-foot'],[.5,1,'right-foot']] as const){let anchor:Vector3|undefined;
  for(let i=0;i<=16;i++){
   const distance=(start+(end-start)*i/16)*1.6;hero.heading=d*Math.PI/4;hero.walkDistance=distance;hero.x=-14+Math.sin(hero.heading)*distance;hero.z=-7+Math.cos(hero.heading)*distance;
   root.position.set(hero.x,heightAt(hero.x,hero.z),hero.z);root.rotation.y=hero.heading;view.update(hero,false,heightAt);root.updateMatrixWorld(true);
   const p=soles.get(name)!.clone().applyMatrix4(root.getObjectByName(name)!.matrixWorld);anchor??=p.clone();assert.ok(p.distanceTo(anchor)<.0001,`${name}, ${d}, ${i}: ${p.distanceTo(anchor)}`);
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

test('dash brace is bounded, reversible, deterministic and keeps both hands on the hammer',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);const hero=createFrontier('solo').hero;hero.moving=true;hero.walkDistance=.35;
 for(let direction=0;direction<8;direction++)for(let phase=0;phase<16;phase++){
  hero.walkDistance=phase*.1;root.rotation.y=direction*Math.PI/4;hero.dashMotion=undefined;view.update(hero,false,()=>0);const walking=matrices(root);
  for(const progress of [0,.1,.25,.5,.75,.9,1]){hero.dashMotion={from:{x:0,z:0},to:{x:0,z:5},at:0,progress,duration:.2};view.update(hero,false,()=>0);root.updateMatrixWorld(true);const pose=matrices(root);view.update(hero,false,()=>0);assert.ok(error(pose,matrices(root))<1e-6,'paused frame is deterministic');
   if(progress===0||progress===1)assert.ok(error(walking,pose)<1e-6,'brace joins continuous walking at both ends');
   for(const [i,side] of ['left','right'].entries()){const arm=root.getObjectByName(side+'-forearm')!,grip=root.getObjectByName(i===0?'upper-grip':'lower-grip')!;const drift=new Vector3(0,1,0).applyMatrix4(arm.matrixWorld).distanceTo(grip.getWorldPosition(new Vector3()));assert.ok(drift<.02,`grip drift ${side} ${progress}: ${drift}`);}
  }
  hero.dashMotion={from:{x:0,z:0},to:{x:0,z:5},at:0,progress:.5,duration:.2};view.update(hero,true,()=>0);const reduced=matrices(root);hero.dashMotion=undefined;view.update(hero,true,()=>0);assert.ok(error(reduced,matrices(root))<1e-6,'reduced motion uses the unchanged pose');
 }
 view.dispose();
});


test('actual dash command starts at the prior walking or standing pose',()=>{
 for(const moving of [false,true]){
  const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);let s=actFrontier(createFrontier('solo'),{type:'start'});
  if(moving)for(let i=0;i<6;i++)s=stepFrontier(s,.05,{x:1,z:0});
  root.position.set(s.hero.x,0,s.hero.z);root.rotation.y=s.hero.heading;view.update(s.hero,false,()=>0);const before=matrices(root);
  s=actFrontier(s,{type:'dash'});assert.equal(s.hero.dashMotion?.fromMoving,moving);view.update(s.hero,false,()=>0);assert.ok(error(before,matrices(root))<1e-6,`dash start from ${moving?'walk':'idle'} must not pop`);view.dispose();
 }
});

test('blended dash brace keeps both boots above the actual terrain in every heading',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);const hero=createFrontier('solo').hero,p=new Vector3();hero.moving=true;
 for(const [x,z] of [[-14,14],[-14,-7],[6,0]])for(let d=0;d<8;d++)for(let phase=0;phase<4;phase++)for(const progress of [.1,.25,.5,.75,.9]){
  Object.assign(hero,{x,z,heading:d*Math.PI/4,walkDistance:phase*.4,dashMotion:{from:{x,z},to:{x:x+1,z},at:0,progress,duration:.2,fromMoving:true}});root.position.set(x,heightAt(x,z),z);root.rotation.set(.16*Math.sin(Math.PI*progress),hero.heading,0,'YXZ');view.update(hero,false,heightAt);root.updateMatrixWorld(true);
  let lowest=Infinity;for(const name of ['left-foot','right-foot'])root.getObjectByName(name)!.traverse(o=>{if(o instanceof Mesh){const v=o.geometry.getAttribute('position');for(let i=0;i<v.count;i++){p.fromBufferAttribute(v,i).applyMatrix4(o.matrixWorld);const clearance=p.y-heightAt(p.x,p.z);lowest=Math.min(lowest,clearance);assert.ok(clearance>-.0001,`${name}, heading ${d}, phase ${phase}, progress ${progress}`);}}});
  assert.ok(lowest<.0001,'at least one boot touches the ground during the brace');
  for(const [i,side] of ['left','right'].entries()){const arm=root.getObjectByName(side+'-forearm')!,grip=root.getObjectByName(i===0?'upper-grip':'lower-grip')!;assert.ok(new Vector3(0,1,0).applyMatrix4(arm.matrixWorld).distanceTo(grip.getWorldPosition(new Vector3()))<.02);}
 }
 view.dispose();
});

test('dash cancelling an attack starts at its actual hammer and foot pose',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);view.setReset(compact.animations.find(c=>c.name==='kar-reset-0')!);view.setEntries(compact.animations.filter(c=>c.name.startsWith('kar-entry-')));
 for(const [x,z] of [[-14,14],[-14,-7],[6,0]])for(const moving of [false,true])for(let phase=0;phase<8;phase++)for(const time of [0,.02,.12,.19,.27,.28,.34,.43,.49,.55]){
  const s=actFrontier(createFrontier('solo'),{type:'start'}),h=s.hero;h.x=x;h.z=z;h.walkDistance=phase*.2;h.heading=phase*Math.PI/4;h.attack={kind:'skill',time,heading:h.heading,hit:time>=.28,targetId:null,damage:50,walkTime:phase*.1,fromMoving:moving,walkWeight:1};h.moving=false;root.position.set(x,heightAt(x,z),z);root.rotation.y=h.heading;
  view.update(h,false,heightAt);const before=matrices(root);const after=actFrontier(s,{type:'dash'});view.update(after.hero,false,heightAt);assert.ok(error(before,matrices(root))<1e-5,`pose snapped: ${x},${z}, moving=${moving}, phase=${phase}, time=${time}`);
 }
 view.dispose();
});

test('cancelled attack blends to the dash brace without losing grips or penetrating slopes',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);view.setReset(compact.animations.find(c=>c.name==='kar-reset-0')!);view.setEntries(compact.animations.filter(c=>c.name.startsWith('kar-entry-')));const p=new Vector3();
 for(const [x,z] of [[-14,14],[-14,-7],[6,0]])for(const moving of [false,true])for(let d=0;d<8;d++)for(const time of [.02,.12,.19,.27,.28,.34,.43,.49,.55])for(const progress of [0,.05,.1,.15,.2,.25]){
  const s=actFrontier(createFrontier('solo'),{type:'start'}),h=s.hero;Object.assign(h,{x,z,heading:d*Math.PI/4,walkDistance:d*.2,moving:false,attack:{kind:'skill',time,heading:d*Math.PI/4,hit:time>=.28,targetId:null,damage:50,walkTime:d*.1,fromMoving:moving,walkWeight:1}});let dashed=actFrontier(s,{type:'dash'});if(!dashed.hero.dashMotion)continue;dashed.hero.dashMotion.progress=progress;root.position.set(x,heightAt(x,z),z);root.rotation.set(.16*Math.sin(Math.PI*progress),h.heading,0,'YXZ');view.update(dashed.hero,false,heightAt);root.updateMatrixWorld(true);
  for(const name of ['left-foot','right-foot'])root.getObjectByName(name)!.traverse(o=>{if(o instanceof Mesh){const v=o.geometry.getAttribute('position');for(let i=0;i<v.count;i++){p.fromBufferAttribute(v,i).applyMatrix4(o.matrixWorld);assert.ok(p.y-heightAt(p.x,p.z)>-.0001,`${name} penetrates, ${d} ${time} ${progress}`);}}});
  for(const [i,side] of ['left','right'].entries()){const upper=root.getObjectByName(side+'-upper')!,arm=root.getObjectByName(side+'-forearm')!,grip=root.getObjectByName(i===0?'upper-grip':'lower-grip')!,drift=new Vector3(0,1,0).applyMatrix4(arm.matrixWorld).distanceTo(grip.getWorldPosition(new Vector3()));assert.ok(drift<.01,`${side} grip drift ${drift}, ${d} ${time} ${progress}`);assert.ok(new Vector3(0,1,0).applyMatrix4(upper.matrixWorld).distanceTo(arm.getWorldPosition(new Vector3()))<.01,`${side} elbow disconnected`);}
  const pose=matrices(root);view.update(dashed.hero,false,heightAt);assert.ok(error(pose,matrices(root))<1e-6,'paused sample must not accumulate');
 }
 view.dispose();
});

test('cancel pose completes within a quarter dash and reduced motion or missing clips remain safe',()=>{
 const make=(full:boolean)=>{const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);if(full){view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);view.setReset(compact.animations.find(c=>c.name==='kar-reset-0')!);view.setEntries(compact.animations.filter(c=>c.name.startsWith('kar-entry-')));}return{root,view};};
 for(const full of [false,true])for(const reduced of [false,true])for(const progress of [.1,.25,.5]){
  const a=make(full),b=make(full),s=actFrontier(createFrontier('solo'),{type:'start'});s.hero.attack={kind:'skill',time:.19,heading:0,hit:false,targetId:null,damage:50,walkTime:.2,fromMoving:true};s.hero.moving=false;const cancelled=actFrontier(s,{type:'dash'}).hero;cancelled.dashMotion!.progress=progress;const plain={...cancelled,dashMotion:{...cancelled.dashMotion!,fromAttack:undefined}};
  a.view.update(cancelled,reduced,()=>0);b.view.update(plain,reduced,()=>0);if(reduced||!full||progress>=.25)assert.ok(error(matrices(a.root),matrices(b.root))<1e-6,`cancel transition should be complete or disabled: ${full} ${reduced} ${progress}`);else assert.ok(error(matrices(a.root),matrices(b.root))>.001,'transition retains the cancelled pose');a.view.dispose();b.view.dispose();
 }
});

test('cancel transition has no endpoint jump when arm correction turns on or off',()=>{
 const model=compact.scene.clone(true),root=new Group();root.add(model);const view=new HeroView(model,compact.animations.find(c=>c.name==='kar-walk')!);view.setSlam(compact.animations.find(c=>c.name==='kar-slam')!);view.setReset(compact.animations.find(c=>c.name==='kar-reset-0')!);view.setEntries(compact.animations.filter(c=>c.name.startsWith('kar-entry-')));
 for(const moving of [false,true])for(let phase=0;phase<8;phase++)for(const time of [.02,.12,.19,.27,.28,.34,.43,.49,.55]){
  const s=actFrontier(createFrontier('solo'),{type:'start'});s.hero.attack={kind:'skill',time,heading:0,hit:time>=.28,targetId:null,damage:50,walkTime:phase*.1,fromMoving:moving,walkWeight:1};const h=actFrontier(s,{type:'dash'}).hero;h.moving=true;
  for(const endpoint of [0,.25]){h.dashMotion!.progress=endpoint;view.update(h,false,()=>0);const a=matrices(root);h.dashMotion!.progress=endpoint===0?.000001:.249999;view.update(h,false,()=>0);assert.ok(error(a,matrices(root))<.01,`transition jumped near ${endpoint}: ${moving}, ${phase}, ${time}`);}
 }
 view.dispose();
});
