import {FrostGateView} from './gateView';
import {ForestDoors} from './forestDoors';
import {GateOcclusion} from './gateOcclusion';
import {FRONTIER_THEMES,type FrontierTheme} from './themes';
import{BeaconView}from'./beaconView';
import{CROSSING,bridgePickSurface,forestFallbackVerge,riverBanks}from'./terrainView';
import {EffectsView,createShockwaveGeometry,projectShockwave} from './effectsView';
import {FrontierCameraRig} from './camera';
import * as THREE from 'three';
import {HeroView} from './heroView';
import {hammerPoint,HERO_ATTACK} from './heroAttack';
import {WoodBatch,woodFallback} from './woodView';
import {WolfView,compactWolf} from './wolfView';
import {BallistaBatch,BallistaView,type BallistaTemplate} from './ballistaView';
import {BoltTrail} from './boltTrail';
import {SquadView,validSquadModel} from './squadView';
import {RelicView,validRelicModel} from './relicView';
import {DashView} from './dashView';
import {RELIC_PICKUP} from './relic';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CORE,PADS,BEACON,EXIT,CRYSTALS,heightAt,distance,type Frontier,type Point,type Mode} from './engine';
export class FrontierScene {
 readonly renderer:THREE.WebGLRenderer;readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(42,1,.1,200);
 private frostGate?:FrostGateView;private forestDoors?:ForestDoors;private gateOcclusion?:GateOcclusion;private terrainOcclusion?:GateOcclusion;private gateTarget=new THREE.Vector3();private gateViewport=new THREE.Vector2();private ray=new THREE.Raycaster();private ground:THREE.Mesh;private pickSurfaces:THREE.Object3D[]=[];private root=new THREE.Group();private hero=new THREE.Group();private units:SquadView[]=[];private squadLoaded=false;private wood:WoodBatch;private wolfLoaded=false;private woodLoaded=false;private woodStrikeLoaded=false;private pads:THREE.Group[]=[];private towers=new Map<number,BallistaView>();private ballista?:BallistaTemplate;private ballistaBatch?:BallistaBatch;private boltShaft:THREE.InstancedMesh;private boltTip:THREE.InstancedMesh;private boltTrail=new BoltTrail();private crystals:RelicView[]=[];private relicLoaded=false;private effects=new EffectsView();private beacon=new BeaconView();private cameraRig=new FrontierCameraRig(this.camera);private heroView?:HeroView;private heroMotion='fallback';private heroGeometry='fallback';private heroAim?:THREE.Mesh;private dashView?:DashView;private disposed=false;private observer:ResizeObserver;private loaded=0;private geometries=new Set<THREE.BufferGeometry>();private materials=new Set<THREE.Material>();
 overview=false;zoom=1;reduced=false;landscape=false;metrics={calls:0,triangles:0,assets:0};
 constructor(readonly host:HTMLElement,readonly mode:Mode,private onPick:(p:Point)=>void,private onStatus:(s:string)=>void,readonly theme:FrontierTheme='forest'){
  this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;if(theme==='frost'){this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;}this.renderer.setClearColor(FRONTIER_THEMES[theme].sky);this.renderer.domElement.dataset.theme=theme;this.renderer.domElement.setAttribute('aria-label','높낮이와 다리가 있는 3D 전장');this.renderer.domElement.setAttribute('role','img');host.append(this.renderer.domElement);
  this.scene.fog=new THREE.Fog(FRONTIER_THEMES[theme].sky,65,135);this.scene.add(new THREE.HemisphereLight('#e7faff',theme==='frost'?'#4d617d':'#465a39',2.1));const sun=new THREE.DirectionalLight('#fff2d4',3);sun.position.set(-25,48,20);sun.castShadow=true;sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:1,far:120});sun.shadow.bias=-.001;sun.shadow.normalBias=.08;this.scene.add(sun);this.scene.add(this.root,this.effects.root);
  const geo=new THREE.PlaneGeometry(64,64,64,64);geo.rotateX(-Math.PI/2);const positions=geo.attributes.position;const colors=[];for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i),h=heightAt(x,z);positions.setY(i,h);const path=x<0&&Math.abs(x-(-16+4*Math.sin(z*.16)))<2.2;const c=new THREE.Color(theme==='frost'?(path?'#7e9cae':'#c7dce9'):(path?'#bda174':((Math.floor(x/4)+Math.floor(z/4))%2?'#6d9566':'#739b69')));colors.push(c.r,c.g,c.b);}geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();this.ground=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));this.ground.receiveShadow=true;this.scene.add(this.ground);this.track(this.ground);this.pickSurfaces.push(this.ground);
  // Actual river trench: terrain vertices along the water drop below its surface.
  for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);if(x>3&&x<9)positions.setY(i,CROSSING.bed);}positions.needsUpdate=true;geo.computeVertexNormals();
  for(const[x,w]of[[-14.5,35],theme==='forest'?[27.5,37]:[20.5,23]])this.box(this.root,x,-4,0,w,5,64,'#6a7055');this.box(this.root,6,CROSSING.bed-.1,0,6,.2,64,'#5c685b');this.box(this.root,6,CROSSING.water-.125,0,5.8,.25,64,'#5cabb5');const banks=riverBanks();this.root.add(banks);this.track(banks);
  // Keep the forest fallback's foreground trees on the same extended slope as
  // the authored terrain, outside the mobile follow camera's hero sightline.
  if(theme==='forest'){
   const surface=forestFallbackVerge();this.root.add(surface);this.track(surface);
  }
  // A physical bridge connects both halves; side rails can occlude feet, never the input ray.
  const bridge=bridgePickSurface();this.root.add(bridge);this.track(bridge);this.pickSurfaces.push(bridge);for(const z of [-2.8,2.8]){this.box(this.root,6,1.25,z,8,.22,.2,'#c5a67c');for(const x of [2.4,5,8,9.6])this.box(this.root,x,.65,z,.22,1.4,.22,'#715a42');}
  for(const x of[3.4,8.6])this.box(this.root,x,-1.5,0,1,2.4,5.1,'#8a927a');for(const z of[-2.3,2.3])this.box(this.root,6,-.2,z,8,.42,.35,'#715a42');
  for(let x=-32;x<=32;x+=4)for(const z of [-32,32])this.box(this.root,x,heightAt(x,z)-1.5,z,4,3.5,2,'#7b806a');
  for(let z=-28;z<32;z+=4)for(const x of [-32,32])this.box(this.root,x,heightAt(x,z)-1.5,z,2,3.5,4,'#7b806a');
  for(let i=0;i<32;i++){const x=i%2===0?-30:theme==='forest'?43:30,z=-27+(i%16)*3.6;if(Math.abs(z)<4)continue;this.tree(x,z,1+(i%3)*.15);}
  if(theme==='frost'){if(mode!=='defense')this.terrainOcclusion=new GateOcclusion(this.root,true,true);this.frostGate=new FrostGateView();this.frostGate.root.position.set(CORE.x,heightAt(CORE.x,CORE.z),CORE.z);this.scene.add(this.frostGate.root);this.loadFrostGate();}else{
  const gate=new THREE.Group();gate.position.set(CORE.x,heightAt(CORE.x,CORE.z),CORE.z);this.box(gate,-2,2.4,0,1.3,5,1.6,'#8a9b8a');this.box(gate,2,2.4,0,1.3,5,1.6,'#8a9b8a');this.box(gate,0,4.6,0,5,1,1.7,'#325a50');this.scene.add(gate);
  this.gateOcclusion=new GateOcclusion(gate);
  this.forestDoors=new ForestDoors();this.forestDoors.root.position.copy(gate.position);this.scene.add(this.forestDoors.root);this.loadForestDoors();
  this.loadModel(FRONTIER_THEMES[theme].gate,gate,7,false).then(g=>{if(!this.disposed){this.gateOcclusion?.invalidate();if(g)this.forestDoors?.align(g.scene.scale.x,g.scene.position.y);}});
  }
  this.hero.add(this.soldier('#cd7e40'));this.scene.add(this.hero);if(mode!=='defense'){this.loadHero();if(mode==='command'){for(let i=0;i<3;i++){const u=this.soldier('#447d88');this.units.push(new SquadView(u,i));this.scene.add(u);}this.loadSquad();}}
  PADS.forEach((p,i)=>{const pad=new THREE.Group();pad.position.set(p.x,heightAt(p.x,p.z)+.08,p.z);const ring=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.8,.18,20),new THREE.MeshStandardMaterial({color:'#d4c18a',emissive:'#574924',emissiveIntensity:.2}));pad.add(ring);this.track(ring);this.pads.push(pad);if(mode!=='solo'&&(mode!=='defense'||i<4))this.scene.add(pad);});
  this.beacon.root.position.set(BEACON.x,heightAt(BEACON.x,BEACON.z),BEACON.z);if(mode==='command'){this.scene.add(this.beacon.root);this.loadBeacon();}
  if(mode==='solo'){this.dashView=new DashView();this.scene.add(this.dashView.root);}
  if(mode==='solo'){CRYSTALS.forEach(p=>{const view=new RelicView(p);this.crystals.push(view);this.scene.add(view.root);});this.loadRelic();}
  if(mode==='solo'){const ring=new THREE.Mesh(new THREE.TorusGeometry(2,.2,8,32),new THREE.MeshStandardMaterial({color:'#e1c56a',emissive:'#725d22'}));ring.rotation.x=Math.PI/2;ring.position.set(EXIT.x,heightAt(EXIT.x,EXIT.z)+.15,EXIT.z);this.scene.add(ring);this.track(ring);}
  this.boltShaft=new THREE.InstancedMesh(new THREE.CylinderGeometry(.055,.055,1,5),new THREE.MeshStandardMaterial({color:'#dcbd6b',metalness:.35}),64);this.boltTip=new THREE.InstancedMesh(new THREE.ConeGeometry(.15,.38,5),new THREE.MeshStandardMaterial({color:'#f1eee2',metalness:.55}),64);this.boltShaft.frustumCulled=this.boltTip.frustumCulled=false;this.boltShaft.count=this.boltTip.count=0;this.scene.add(this.boltShaft,this.boltTip,this.boltTrail.mesh);this.track(this.boltShaft);this.track(this.boltTip);if(mode!=='solo')this.loadBallista();
  this.wood=new WoodBatch(woodFallback(),false);this.scene.add(this.wood.root);this.track(this.wood.root);if(theme==='frost')this.loadWolf();else this.loadWood();
  if(theme==='frost'){
   const snow:Record<string,string>={'6a7055':'425b77','5c685b':'294c6c','5cabb5':'276a8b','a4a58b':'aad3e6','8a927a':'688fa9','7b806a':'769cb7','396e59':'d0e2ec','477c5c':'91cde5','76624b':'598eae'};
   this.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial){const c=snow[o.material.color.getHexString()];if(c)o.material.color.set('#'+c);}});
  }
  this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;this.loadTerrain();
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();this.renderer.domElement.addEventListener('pointerup',this.pick);this.renderer.domElement.addEventListener('wheel',this.wheel,{passive:false});this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
 }
 private track(root:THREE.Object3D){root.traverse(o=>{if(o instanceof THREE.Mesh){this.geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])this.materials.add(m);}});}
 // The temporary squad uses only privately allocated geometry and materials.
 private releaseFallbackSquad(root:THREE.Object3D){root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();this.geometries.delete(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){m.dispose();this.materials.delete(m);}}});}
 private box(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.85}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);this.track(m);return m;}
 private tree(x:number,z:number,scale:number){const g=new THREE.Group();g.position.set(x,heightAt(x,z),z);g.scale.setScalar(scale);this.box(g,0,1.3,0,.55,2.6,.55,'#76624b');for(let i=0;i<2;i++){const m=new THREE.Mesh(new THREE.ConeGeometry(1.8-i*.3,3.2,7),new THREE.MeshStandardMaterial({color:i?'#396e59':'#477c5c'}));m.position.y=3+i*1.3;m.castShadow=true;g.add(m);this.track(m);}this.root.add(g);}
 private soldier(color:string){const g=new THREE.Group();this.box(g,0,1.1,0,.95,1.3,.65,color);const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.47,1),new THREE.MeshStandardMaterial({color:'#e4c19a'}));head.position.y=2;g.add(head);this.track(head);for(const [i,x] of [-.28,.28].entries())this.box(g,x,.3,0,.34,.6,.4,'#444c48').name=i?'squad-right-foot':'squad-left-foot';this.box(g,.75,1.2,.2,.25,.25,1.2,'#d2bc77').name='squad-weapon';g.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=false;});g.add(this.contact());return g;}
 private contact(){const m=new THREE.Mesh(new THREE.CircleGeometry(.65,16),new THREE.MeshBasicMaterial({color:'#15352c',transparent:true,opacity:.22,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.y=.025;this.track(m);return m;}
 private async loadModel(name:string,target:THREE.Group,size:number,hero:boolean,requiredClips:string[]=[],quiet=false){try{const gltf=await new GLTFLoader().loadAsync(`/defense/models/${name}.glb`);if(this.disposed){this.track(gltf.scene);this.release();return;}if(requiredClips.some(name=>!gltf.animations.some(c=>c.name===name))){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});throw Error('Incomplete model motions');}const bounds=new THREE.Box3().setFromObject(gltf.scene),extent=bounds.getSize(new THREE.Vector3()),scale=size/(hero?extent.y:Math.max(extent.x,extent.z));gltf.scene.scale.setScalar(scale);gltf.scene.position.y=-bounds.min.y*scale;gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=!hero;o.receiveShadow=true;}});target.clear();target.add(gltf.scene);if(hero)target.add(this.contact());this.track(gltf.scene);this.loaded++;this.renderer.shadowMap.needsUpdate=true;return gltf;}catch{if(!this.disposed&&!quiet)this.onStatus('일부 모델을 불러오지 못해 기본 입체 모형을 사용합니다.');}}
 private async loadHero(){
  const compact=await this.loadModel('frontier-kar-game',this.hero,3.2,true,['kar-walk','kar-slam',...Array.from({length:8},(_,i)=>`kar-entry-${i}`)],true);
  if(this.disposed)return;
  if(compact){
   const walk=compact.animations.find(c=>c.name==='kar-walk'),slam=compact.animations.find(c=>c.name==='kar-slam'),entries=Array.from({length:8},(_,i)=>compact.animations.find(c=>c.name===`kar-entry-${i}`));
   if(walk&&slam&&entries.every(Boolean)){this.heroView=new HeroView(compact.scene,walk);this.heroView.setSlam(slam);this.heroView.setEntries(compact.animations.filter(c=>c.name.startsWith('kar-entry-')));const reset=compact.animations.find(c=>c.name==='kar-reset-0');if(reset)this.heroView.setReset(reset);this.heroView.setStops(compact.animations.filter(c=>c.name.startsWith('kar-stop-')));this.heroMotion='entry';this.heroGeometry='lod';return;}
  }
  // Keep the authored model and its separate clips available if the compact bundle fails.
  const gltf=await this.loadModel('kar-barbarian-walk',this.hero,3.2,true);if(!gltf||this.disposed)return;this.heroGeometry='source';
  this.heroView=new HeroView(gltf.scene,gltf.animations[0]);this.heroMotion='walk';
  const clips=async(name:string)=>{const g=await new GLTFLoader().loadAsync(`/defense/models/${name}.glb`);g.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});return g.animations;};
  try{const slam=await clips('kar-barbarian');if(this.disposed)return;this.heroView.setSlam(slam[0]);this.heroMotion='slam';}catch{if(!this.disposed)this.onStatus('망치 동작 로딩 실패 · 공격 범위와 판정은 유지됩니다.');}
  try{const reset=await clips('kar-reset');if(this.disposed)return;const clip=reset.find(c=>c.name==='kar-reset-0');if(clip)this.heroView.setReset(clip);}catch{/* Authored slam recovery remains available. */}
  try{const stops=await clips('kar-stop');if(this.disposed)return;this.heroView.setStops(stops);}catch{/* Missing optional stop clips keep the grounded idle. */}
  try{const entries=await clips('kar-entry');if(this.disposed)return;if(!Array.from({length:8},(_,i)=>entries.some(c=>c.name===`kar-entry-${i}`)).every(Boolean))throw Error('Missing entry clips');this.heroView.setEntries(entries);this.heroMotion='entry';}catch{/* The original slam remains available. */}
 }
 private async loadSquad(){
  try{
   const gltf=await new GLTFLoader().loadAsync('/defense/models/frontier-squad.glb');
   if(this.disposed||!validSquadModel(gltf.scene)){
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
    if(this.disposed)return;throw Error('Incomplete support soldier');
   }
   this.track(gltf.scene);
   const next=this.units.map((_,i)=>{const root=new THREE.Group();root.add(gltf.scene.clone(true),this.contact());return new SquadView(root,i);});
   for(const view of this.units){this.scene.remove(view.root);this.releaseFallbackSquad(view.root);}this.units=next;for(const view of next)this.scene.add(view.root);
   this.squadLoaded=true;this.loaded++;
  }catch{if(!this.disposed)this.onStatus('지원병 모델 로딩 실패 · 기본 입체 병사로 계속합니다.');}
 }
 private async loadRelic(){
  try{
   const gltf=await new GLTFLoader().loadAsync('/defense/models/frontier-relic.glb');
   if(this.disposed||!validRelicModel(gltf.scene)){
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
    if(this.disposed)return;throw Error('Incomplete recovery crystal');
   }
   this.track(gltf.scene);for(const crystal of this.crystals)crystal.setModel(gltf.scene);this.relicLoaded=true;this.loaded++;
  }catch{if(!this.disposed)this.onStatus('수정 모델 로딩 실패 · 기본 입체 수정으로 계속합니다.');}
 }
 private async loadWolf(){
  try{
   const model=await new GLTFLoader().loadAsync('/defense/models/frost-wolf-stride.glb');
   if(this.disposed){this.track(model.scene);this.release();return;}
   try{compactWolf(model);}catch(error){model.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});throw error;}
   this.track(model.scene);this.scene.remove(this.wood.root);this.wood.dispose();this.wood=new WoodBatch(model,true,t=>new WolfView(t),2.15);this.scene.add(this.wood.root);this.wolfLoaded=true;this.loaded++;
  }catch{if(!this.disposed){this.onStatus('서리늑대 로딩 실패 · 기존 적 모델로 계속합니다.');this.loadWood();}}
 }
 private async loadWood(){try{const model=await new GLTFLoader().loadAsync('/defense/models/frontier-wood-game.glb');this.track(model.scene);if(this.disposed){this.release();return;}if(!model.animations.some(c=>c.name==='frontier-wood-walk'))throw new Error('Invalid wooden soldier');this.scene.remove(this.wood.root);this.wood.dispose();this.wood=new WoodBatch(model);this.scene.add(this.wood.root);this.woodLoaded=true;this.loaded++;try{const strike=await new GLTFLoader().loadAsync('/defense/models/frontier-wood-strike-game.glb');const clip=strike.animations.find(c=>c.name==='frontier-wood-strike');strike.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});if(this.disposed)return;if(!clip)throw new Error('Invalid wooden strike');this.scene.remove(this.wood.root);this.wood.dispose();this.wood=new WoodBatch({scene:model.scene,animations:[...model.animations,clip]});this.scene.add(this.wood.root);this.woodStrikeLoaded=true;}catch{if(!this.disposed)this.onStatus('몽둥이 동작 로딩 실패 · 공격 예고와 전투는 유지됩니다.');}}catch{if(!this.disposed)this.onStatus('통나무 병사 로딩 실패 · 기본 입체 병사로 계속합니다.');}}
 private async loadBallista(){try{const model=await new GLTFLoader().loadAsync('/defense/models/frontier-ballista-game.glb');this.track(model.scene);if(this.disposed){this.release();return;}if(!model.scene.getObjectByName('aim-platform')||!model.animations.some(c=>c.name==='frontier-ballista-release'))throw new Error('Invalid ballista');this.ballista={scene:model.scene,animations:model.animations};this.ballistaBatch=new BallistaBatch(this.ballista);this.scene.add(this.ballistaBatch.root);this.track(this.ballistaBatch.root);for(const view of this.towers.values())this.scene.remove(view.root);this.towers.clear();this.loaded++;}catch{if(!this.disposed)this.onStatus('발리스타 로딩 실패 · 기본 입체 포탑으로 방어합니다.');}}
 private async loadBeacon(){try{const gltf=await new GLTFLoader().loadAsync('/defense/models/frontier-beacon.glb');if(this.disposed){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});return;}this.beacon.setModel(gltf);this.loaded++;this.renderer.shadowMap.needsUpdate=true;}catch{if(!this.disposed)this.onStatus('봉화 모델 로딩 실패 · 기본 봉화와 점령 진행은 유지됩니다.');}}
 private async loadFrostGate(){try{const gltf=await new GLTFLoader().loadAsync('/defense/models/frontier-frost-gate-impact.glb');if(this.disposed){this.track(gltf.scene);this.release();return;}this.frostGate!.setModel(gltf);this.loaded++;this.renderer.shadowMap.needsUpdate=true;}catch{if(!this.disposed)this.onStatus('성문 동작 로딩 실패 · 기본 성문과 피격 반응은 유지됩니다.');}}
 private async loadForestDoors(){try{const gltf=await new GLTFLoader().loadAsync('/defense/models/frontier-forest-doors.glb');if(this.disposed){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});return;}this.forestDoors!.setModel(gltf);this.loaded++;}catch{if(!this.disposed)this.onStatus('녹음 성문 동작 로딩 실패 · 기본 입체 문과 피격 반응을 사용합니다.');}}
 private async loadTerrain(){
  const names=this.theme==='frost'?[FRONTIER_THEMES.frost.terrain,'frontier-frost-cliffs','frontier-frost']:[FRONTIER_THEMES.forest.terrain];
  for(const [i,name] of names.entries())try{
   const gltf=await new GLTFLoader().loadAsync(`/defense/models/${name}.glb`);this.track(gltf.scene);if(this.disposed){this.release();return;}
   gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});this.terrainOcclusion?.invalidate();this.root.clear();this.root.add(gltf.scene);this.terrainOcclusion?.prepare();this.ground.visible=false;this.loaded++;this.renderer.shadowMap.needsUpdate=true;
   this.renderer.domElement.dataset.terrainModel=name;if(i>0)this.onStatus('서리 숲 모델 로딩 실패 · 이전 서리 지형으로 계속합니다.');return;
  }catch{if(this.disposed)return;}
  this.renderer.domElement.dataset.terrainModel='geometry';this.onStatus('지형 원본 로딩 실패 · 기본 입체 지형으로 계속할 수 있습니다.');
 }

 private resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 private pick=(e:PointerEvent)=>{if(e.button!==0)return;const r=this.renderer.domElement.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);const hit=this.ray.intersectObjects(this.pickSurfaces)[0];if(hit)this.onPick({x:hit.point.x,z:hit.point.z});};
 private wheel=(e:WheelEvent)=>{e.preventDefault();this.zoom=THREE.MathUtils.clamp(this.zoom+e.deltaY*.001,.7,1.5);};
 private contextLost=(e:Event)=>{e.preventDefault();this.onStatus('3D 화면 연결이 끊겼습니다. 새로고침해 다시 시작해 주세요.');};
 render(s:Frontier,dt:number){
  const {landscape:wide}=this.cameraRig.update(s,dt,{width:this.host.clientWidth,height:this.host.clientHeight,zoom:this.zoom,overview:this.overview,reduced:this.reduced});this.landscape=wide;this.hero.visible=s.mode!=='defense';this.hero.position.set(s.hero.x,heightAt(s.hero.x,s.hero.z),s.hero.z);const dashLean=this.heroView&&s.hero.dashMotion&&!this.reduced?.16*Math.sin(Math.PI*s.hero.dashMotion.progress):0;this.hero.rotation.set(dashLean,s.hero.heading,0,'YXZ');this.renderer.domElement.dataset.dashLean=String(dashLean);
  this.heroView?.update(s.hero,this.reduced,heightAt);this.dashView?.update(s.hero.dashTrace,s.time,this.reduced);this.renderer.domElement.dataset.dashSegments=String(this.dashView?.streak.count??0);this.renderer.domElement.dataset.dashChips=String(this.dashView?.chips.count??0);
  this.frostGate?.update(s.time,s.coreHitAt,s.coreHp,s.mode!=='defense',this.reduced);this.renderer.domElement.dataset.gateImpact=JSON.stringify(this.frostGate?{...this.frostGate.state,loaded:this.frostGate.loaded,angles:this.frostGate.angles,hp:s.coreHp,hitAt:s.coreHitAt}:null);
  this.forestDoors?.update(s.time,s.coreHitAt,s.coreHp,s.mode!=='defense',this.reduced);this.gateTarget.set(s.hero.x,heightAt(s.hero.x,s.hero.z)+1.5,s.hero.z);const gateCamera=s.mode!=='defense'?this.camera:null;this.forestDoors?.updateOcclusion(gateCamera&&Math.hypot(s.hero.x-CORE.x,s.hero.z-CORE.z)<8?gateCamera:null,this.gateTarget);this.renderer.getDrawingBufferSize(this.gateViewport);this.gateOcclusion?.update(gateCamera,this.gateTarget,this.gateViewport);const nearTerrainEdge=Math.max(Math.abs(s.hero.x),Math.abs(s.hero.z))>18;this.terrainOcclusion?.update(gateCamera&&nearTerrainEdge?gateCamera:null,this.gateTarget,this.gateViewport);this.renderer.domElement.dataset.terrainFaded=String(this.terrainOcclusion?.count??0);this.renderer.domElement.dataset.gateFaded=String(this.gateOcclusion?.count??0);this.renderer.domElement.dataset.forestDoors=JSON.stringify(this.forestDoors?{...this.forestDoors.state,loaded:this.forestDoors.loaded,faded:this.forestDoors.faded,angles:this.forestDoors.angles,hp:s.coreHp,hitAt:s.coreHitAt}:null);
  if(s.mode!=='defense'&&!this.heroAim){this.heroAim=new THREE.Mesh(createShockwaveGeometry(32),new THREE.MeshBasicMaterial({color:'#ffe4a4',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));this.heroAim.matrixAutoUpdate=false;this.heroAim.frustumCulled=false;this.scene.add(this.heroAim);this.track(this.heroAim);}
  const heroAction=s.hero.attack;if(this.heroAim){this.heroAim.visible=!!heroAction&&!heroAction.hit;
   if(this.heroAim.visible&&heroAction){const p=heroAction.kind==='skill'?s.hero:hammerPoint(s.hero.x,s.hero.z,heroAction.heading),radius=heroAction.kind==='skill'?HERO_ATTACK.skillRadius:HERO_ATTACK.radius;projectShockwave(this.heroAim.geometry,p,1,1.32*radius/HERO_ATTACK.radius,radius);this.heroAim.matrix.identity();}}
  this.renderer.domElement.dataset.heroAimCells=String(this.heroAim?.visible?this.heroAim.geometry.drawRange.count/6:0);
  this.units.forEach((view,i)=>{const p=s.squad[i];if(p)view.update(p,s.time,this.reduced);});
  this.renderer.domElement.dataset.squadModel=this.squadLoaded?'glb':'geometry';this.renderer.domElement.dataset.squadMotion=JSON.stringify(s.squad.map((u,i)=>({x:u.x,z:u.z,heading:u.heading,distance:u.walkDistance??0,moving:u.moving??false,shotAt:u.shotAt,shotHeading:u.shotHeading,feet:this.units[i]?.feet})));
  this.wood.update(s.enemies,this.reduced,this.camera,s.time,s.fallen);this.renderer.domElement.dataset.woodFallen=String(this.wood.fallenCount);
  for(const t of s.towers){let view=this.towers.get(t.pad);if(!view){view=new BallistaView(this.ballista);const p=PADS[t.pad];view.root.position.set(p.x,heightAt(p.x,p.z),p.z);this.towers.set(t.pad,view);this.scene.add(view.root);this.track(view.root);}view.update(t,this.reduced);}
  this.ballistaBatch?.update([...this.towers.values()],this.camera);
  const boltMatrix=new THREE.Object3D();this.boltShaft.count=this.boltTip.count=Math.min(64,s.bolts.length);
  for(const [i,bolt] of s.bolts.slice(0,64).entries()){const dir=new THREE.Vector3(bolt.position.x-bolt.previous.x,bolt.position.y-bolt.previous.y,bolt.position.z-bolt.previous.z);if(dir.lengthSq()<1e-8){const t=s.towers.find(t=>t.pad===bolt.pad);dir.set(Math.sin(t?.heading??0),0,Math.cos(t?.heading??0));}dir.normalize();boltMatrix.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);boltMatrix.position.set(bolt.position.x,bolt.position.y,bolt.position.z).addScaledVector(dir,-.69);boltMatrix.updateMatrix();this.boltShaft.setMatrixAt(i,boltMatrix.matrix);boltMatrix.position.addScaledVector(dir,.5);boltMatrix.updateMatrix();this.boltTip.setMatrixAt(i,boltMatrix.matrix);}
  this.boltShaft.instanceMatrix.needsUpdate=this.boltTip.instanceMatrix.needsUpdate=true;this.boltTrail.update(s.bolts,this.reduced);this.renderer.domElement.dataset.boltTrails=String(this.boltTrail.mesh.count);
  this.pads.forEach((g,i)=>g.visible=!s.towers.some(t=>t.pad===i));this.crystals.forEach((view,i)=>view.update(s.crystals.includes(i),s.crystalClaimedAt?.[i],s.time,s.phase==='playing'&&distance(s.hero,CRYSTALS[i])<RELIC_PICKUP.radius,this.reduced));this.renderer.domElement.dataset.relicModel=this.relicLoaded?'glb':'geometry';this.renderer.domElement.dataset.relics=JSON.stringify(this.crystals.map(v=>({claimed:v.claimed,near:v.near,pose:v.pose,ring:v.ring.visible})));if(s.mode==='command')this.beacon.update(s.beacon,this.reduced);this.renderer.domElement.dataset.beacon=JSON.stringify({progress:s.beacon,pose:this.beacon.pose,model:this.beacon.loaded?'glb':'fallback'});
  this.effects.update(s.effects,this.reduced,this.squadLoaded);
  this.renderer.render(this.scene,this.camera);this.metrics={calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,assets:this.loaded};this.renderer.domElement.dataset.effectSlots=String(this.effects.allocated);this.renderer.domElement.dataset.contactChips=String(this.effects.chips.count);this.renderer.domElement.dataset.impactChips=String(this.effects.impactChipCount);this.renderer.domElement.dataset.impactEffects=JSON.stringify(s.effects.filter(e=>e.kind==='impact'));this.renderer.domElement.dataset.cameraPosition=JSON.stringify(this.camera.position.toArray());this.renderer.domElement.dataset.heroGeometry=this.heroGeometry;this.renderer.domElement.dataset.heroMotion=this.heroMotion;this.renderer.domElement.dataset.heroAction=JSON.stringify(s.hero);this.renderer.domElement.dataset.enemyHp=JSON.stringify(s.enemies.map(e=>({id:e.id,hp:e.hp})));this.renderer.domElement.dataset.heroEffects=JSON.stringify(s.effects.filter(e=>e.kind==='hammer'||e.kind==='shockwave'));this.renderer.domElement.dataset.calls=String(this.metrics.calls);this.renderer.domElement.dataset.triangles=String(this.metrics.triangles);this.renderer.domElement.dataset.assets=String(this.loaded);this.renderer.domElement.dataset.ballista=this.ballista?'glb':'geometry';this.renderer.domElement.dataset.bolts=String(s.bolts.length);this.renderer.domElement.dataset.camera=wide?'landscape':'standard';this.renderer.domElement.dataset.towers=JSON.stringify(s.towers.map(t=>({pad:t.pad,heading:t.heading,age:t.actionTime,level:t.level})));this.renderer.domElement.dataset.woodWarnings=String(this.wood.warningCount);this.renderer.domElement.dataset.woodStrike=this.woodStrikeLoaded?'glb':'fallback';this.renderer.domElement.dataset.wood=this.woodLoaded?'glb':'geometry';this.renderer.domElement.dataset.enemySkin=this.wolfLoaded?'frost-wolf':this.woodLoaded?'wood':'fallback';this.renderer.domElement.dataset.woodDraws=String(this.wood.meshes.length);this.renderer.domElement.dataset.hitMarkers=String(this.wood.markerCount);this.renderer.domElement.dataset.enemyMotion=JSON.stringify(s.enemies.map(e=>({id:e.id,x:e.x,z:e.z,distance:e.walkDistance??0,heading:e.heading??0,moving:e.moving??false,rest:e.restTime??0,attack:e.attack,hitAt:e.hitAt,hitHeading:e.hitHeading})));this.renderer.domElement.dataset.ballistaMeshes=String(this.towers.size);this.renderer.domElement.dataset.ballistaBatches=String(this.ballistaBatch?.meshes.length??0);
 }
 project(p:Point){this.camera.updateMatrixWorld();const q=new THREE.Vector3(p.x,heightAt(p.x,p.z)+.2,p.z).project(this.camera);if(q.z< -1||q.z>1||Math.abs(q.x)>.95||Math.abs(q.y)>.95)return null;return{x:(q.x+1)*this.host.clientWidth/2,y:(1-q.y)*this.host.clientHeight/2};}
 private release(){for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();}
 dispose(){this.disposed=true;this.observer.disconnect();this.renderer.domElement.removeEventListener('pointerup',this.pick);this.renderer.domElement.removeEventListener('wheel',this.wheel);this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);this.frostGate?.dispose();this.forestDoors?.dispose();this.gateOcclusion?.dispose();this.terrainOcclusion?.dispose();this.beacon.dispose();this.dashView?.dispose();for(const crystal of this.crystals)crystal.dispose();this.heroView?.dispose();this.ballistaBatch?.dispose();this.wood.dispose();this.boltShaft.dispose();this.boltTip.dispose();this.boltTrail.dispose();this.effects.dispose();this.release();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
}
