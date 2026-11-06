import { AmbientLight, AnimationMixer, Box3, DirectionalLight, GridHelper, Group, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, PCFShadowMap, PerspectiveCamera, PlaneGeometry, Scene, ShadowMaterial, SRGBColorSpace, Vector3, WebGLRenderer, ACESFilmicToneMapping, type AnimationAction, type Object3D, type Material } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';
import './model-lab.css';

const models = [
 {id:'fire-tower',name:'화염 수정탑',kind:'ELEMENTAL TOWER',detail:'돌 · 청동 · 발광 수정',description:'층층이 쌓은 석재 위에 청동 발톱이 수정을 지탱합니다. 마력 코어가 회전하며 불꽃을 모읍니다.',source:'towers.blend',command:'npm run models:build',action:'▶ 발사 동작'},
 {id:'piercing-ballista',asset:'piercing-ballista-action',clip:'ballista-release',name:'관통 발리스타',kind:'SIEGE WEAPON',detail:'오크 · 황동 · 강철',description:'석재 기초를 고정한 채 상부가 조준합니다. 활대와 시위가 풀리며 관통탄을 발사하고, 시위를 다시 당겨 다음 탄을 장전합니다.',source:'piercing-ballista-action.blend',command:'npm run models:ballista-action',action:'▶ 시위 발사'},
 {id:'piercing-ballista-lv3',asset:'piercing-ballista-lv3-action',clip:'ballista-release',name:'관통 발리스타 · 최종 강화',kind:'SIEGE WEAPON',detail:'금장 활대 · 부채꼴 관통탄 · 고정 기초',description:'금장 활대와 세 갈래 장전탄이 상부와 함께 조준합니다. 시위 이완과 재장전 사이에도 깃발·기초는 고정됩니다.',source:'piercing-ballista-lv3-action.blend',command:'npm run models:ballista-action-lv3',action:'▶ 시위 발사'},
 {id:'water-cannon',asset:'water-cannon-action',clip:'water-cannon-fire',name:'물폭탄포',kind:'HYDRAULIC TOWER',detail:'황동 · 유리 · 물',description:'원형 기초 위에서 물탱크·배관·포신이 함께 조준합니다. 발사할 때 포신만 뒤로 밀리고 천천히 복귀합니다.',source:'water-cannon-action.blend',command:'npm run models:water-action',action:'▶ 발사 동작'},
 {id:'water-cannon-lv3',asset:'water-cannon-lv3-action',clip:'water-cannon-fire',name:'물폭탄포 · 최종 강화',kind:'HYDRAULIC TOWER',detail:'황동 · 유리 · 물',description:'수정 왕관·금빛 궤도 링이 수조와 함께 조준합니다. 깃발과 받침대는 고정되고, 금장 포신만 뒤로 밀렸다가 복귀합니다.',source:'water-cannon-lv3-action.blend',command:'npm run models:water-action-lv3',action:'▶ 발사 동작'},
 {id:'dwarf-guardian',name:'브론 · 드워프 공병',kind:'DWARF GUARDIAN',detail:'강철 · 청동 · 가죽',description:'두꺼운 갑옷과 땋은 수염, 묵직한 망치로 드워프 공병의 실루엣을 만들었습니다. 망치를 들어 강타하고 원래 자세로 돌아옵니다.',source:'dwarf.blend',command:'npm run models:dwarf',action:'▶ 망치 강타',clip:'dwarf-hammer-attack'},
 {id:'dwarf-locomotion',name:'브론 · 방향 보행',kind:'DWARF LOCOMOTION',detail:'발 접지 · 무거운 망치 · 방향 보행',description:'두 발의 지지와 회수를 엇갈리며 걷습니다. 전투에서는 같은 원본을 여덟 방향으로 렌더해 망치와 방패의 손을 유지합니다.',source:'dwarf-locomotion.blend',command:'npm run models:dwarf-locomotion',action:'▶ 보행 재생',clip:'dwarf-walk',loop:true},
 {id:'wood-soldier',name:'나무 병사 · 통나무 파수꾼',kind:'LIVING LOG SOLDIER',detail:'통나무 · 나이테 · 뿌리 관절',description:'밝은 나이테 단면과 가지 뿔로 재료를 구분합니다. 발 접지와 팔의 엇갈림, 잎의 후속 움직임을 한 주기의 보행으로 확인하세요.',source:'wood-soldier.blend',command:'npm run models:wood',action:'▶ 보행 재생',clip:'wood-soldier-walk',loop:true},
 {id:'frost-wolf',name:'서리늑대 · 은서리 야수',kind:'SILVERFROST WOLF',detail:'회백색 털 · 짙은 발 · 청백색 눈',description:'은서리 늑대 컨셉의 낮은 몸과 긴 다리를 전투 크기에 맞췄습니다. 대각선으로 짝을 이루는 발의 접지와 목·꼬리의 후속 움직임을 확인하세요.',source:'frost-wolf.blend',command:'npm run models:wolf',action:'▶ 보행 재생',clip:'frost-wolf-trot',loop:true},
 {id:'frost-wolf-collapse',name:'서리늑대 · 쓰러짐',kind:'SILVERFROST WOLF',detail:'접지 · 무릎 관절 · 몸의 무게',description:'네 발의 접지를 유지하며 무릎과 몸이 낮아집니다. 쓰러진 자세를 유지해 보행·피격 자세와 구분합니다.',source:'frost-wolf-collapse.blend',command:'npm run models:wolf-collapse',action:'▶ 쓰러짐 재생',clip:'frost-wolf-collapse',hold:true},
 {id:'forest-gate',asset:'forest-gate-impact',clip:'forest-gate-impact',name:'녹음 성문 · 뿌리 아치',kind:'VERDANT GATEHOUSE',detail:'석조 아치 · 고목 뿌리 · 초록 지붕',description:'석조 아치와 기초는 고정되고 목재 상부와 등불이 침입 충격에 반응합니다. 가벼운 등불은 더 크게 흔들린 뒤 제자리로 돌아옵니다.',source:'forest-gate-impact.blend',command:'npm run models:forest-gate-impact',action:'▶ 침입 충격'},
 {id:'forest-bridge',static:true,name:'숲 마을 교량',kind:'VILLAGE CROSSING',detail:'석조 아치 · 목재 상판',description:'석재 아치와 교대가 목재 상판을 받칩니다. 앞 난간을 별도로 렌더해 전투에서 유닛과 앞뒤가 맞도록 표시합니다.',source:'forest-bridge.blend',command:'npm run models:bridge',action:'정적 구조물'},
];
const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const stage = $<HTMLDivElement>('model-stage'), status = $<HTMLParagraphElement>('model-loading'), fallback = $<HTMLImageElement>('model-fallback');
const shoot = $<HTMLButtonElement>('attack-preview'), rotate = $<HTMLButtonElement>('auto-rotate'), wire = $<HTMLButtonElement>('wireframe'), reset = $<HTMLButtonElement>('reset-view');
let renderer:WebGLRenderer|null = null, controls:OrbitControls|null = null, current:Group|null = null, mixer:AnimationMixer|null = null, attackAction:AnimationAction|null = null;
let currentModelId = models[0].id;
let generation = 0, automatic = false, wireEnabled = false, shotAt = -Infinity, last = performance.now(), elapsed = 0, redraw = true, lastRender = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const scene = new Scene(), camera = new PerspectiveCamera(35,1,.05,100), loader = new GLTFLoader();
const pivot = new Group(); scene.add(pivot);
let currentMaterials:MeshStandardMaterial[] = [];
const emissionLevels = new Map<MeshStandardMaterial,number>();
const parts:{object:Object3D;position:Vector3;rotation:Vector3;type:'core'|'barrel'|'bolt'|'turret'}[] = [];

function materials(object:Object3D) {
 const result = new Set<Material>();
 object.traverse(node => {if(node instanceof Mesh)for(const material of Array.isArray(node.material)?node.material:[node.material])result.add(material);});
 return result;
}
function release(object:Object3D) {
 object.traverse(node => {if(node instanceof Mesh)node.geometry.dispose();});
 materials(object).forEach(material => material.dispose());
}
// Match the dwarf render's front three-quarter view so its hammer clears the face.
function resetView() {pivot.rotation.y = currentModelId.startsWith('dwarf-')?-1.85:0;camera.position.set(8.3,6.5,10.3);controls?.target.set(0,currentModelId==='forest-bridge'?1:2.0,0);controls?.update();}
function stopAction() {
 attackAction?.stop(); shotAt = -Infinity; stage.dataset.action = 'idle'; shoot.textContent=models.find(model=>model.id===currentModelId)?.action??'▶ 동작 재생'; redraw = true;
}
function clearModel() {
 mixer?.stopAllAction();
 if(mixer)mixer.uncacheRoot(mixer.getRoot());
 attackAction = null; mixer = null;
 if(current){pivot.remove(current);release(current);current = null;}
 parts.length = 0; currentMaterials = []; emissionLevels.clear(); pivot.rotation.y = 0; stopAction();
}
function setReady(ready:boolean) {
 const missingAttack = !!models.find(model=>model.id===currentModelId)?.clip&&!attackAction;
 const staticModel=!!models.find(model=>model.id===currentModelId)?.static;
 shoot.hidden=staticModel;shoot.disabled = staticModel || !ready || reduced.matches || missingAttack;
 rotate.disabled = !ready || reduced.matches;
 wire.disabled = !ready; reset.disabled = !ready;
 shoot.title = reduced.matches?'동작 줄이기 설정으로 공격 모션을 멈췄어요.':ready&&missingAttack?'이 모델에 재생할 모션이 없습니다.':'';
 rotate.title = reduced.matches?'동작 줄이기 설정으로 자동 회전을 멈췄어요.':'';
}
function showFallback(message:string) {
 fallback.hidden = false; stage.dataset.loaded = 'fallback';
 $('model-format').textContent = 'PNG · 렌더 이미지';
 $('model-hint').textContent = '선택한 모델의 정사영 렌더 이미지';
 status.textContent = message; status.hidden = false;
 setReady(false); redraw = true;
}
try {
 renderer = new WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.outputColorSpace = SRGBColorSpace;
 renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = .88;
 renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
 renderer.domElement.setAttribute('aria-label','선택한 타워와 캐릭터 모델을 회전하며 살펴보는 3D 화면');
 renderer.domElement.setAttribute('role','img'); stage.prepend(renderer.domElement);
 const environment = new RoomEnvironment(), pmrem = new PMREMGenerator(renderer), map = pmrem.fromScene(environment,.04);
 scene.environment = map.texture; environment.dispose(); pmrem.dispose();
 scene.add(new AmbientLight(0xb2c9c3,.65));
 const key = new DirectionalLight(0xffe6c0,2.7); key.position.set(5,9,5); key.castShadow = true;
 key.shadow.mapSize.set(1024,1024); key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6; key.shadow.normalBias = .03; scene.add(key);
 const rim = new DirectionalLight(0xa8ddff,1.5); rim.position.set(-5,5,-4); scene.add(rim);
 const floor = new Mesh(new PlaneGeometry(50,50),new ShadowMaterial({color:0x000d0d,opacity:.24}));
 floor.rotation.x = -Math.PI/2; floor.position.y = -.015; floor.receiveShadow = true; scene.add(floor);
 const grid = new GridHelper(18,36,0x74948a,0x496e66); grid.position.y = -.025; grid.material.transparent = true; grid.material.opacity = .16; scene.add(grid);
 controls = new OrbitControls(camera,renderer.domElement); controls.enableDamping = true; controls.enablePan = false;
 controls.minDistance = 5; controls.maxDistance = 22; controls.minPolarAngle = .18; controls.maxPolarAngle = Math.PI*.49; resetView();
 const resize = () => {if(!renderer)return;renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect = stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();redraw = true;};
 new ResizeObserver(resize).observe(stage); resize();
} catch {
 renderer?.domElement.remove(); renderer?.dispose(); renderer = null;
}

async function select(index:number) {
 const ticket = ++generation, model = models[index]; currentModelId = model.id;
 setReady(false); status.hidden = false; status.textContent = '모델을 불러오는 중…';
 $('model-name').textContent = model.name; $('model-kind').textContent = model.kind; $('model-description').textContent = model.description;
 $('model-source').textContent = model.source; $('model-command').textContent = model.command; shoot.textContent = model.action;
 $('model-format').textContent = 'GLB · 실시간 3D'; $('model-hint').textContent = '드래그하여 회전 · 휠 또는 두 손가락으로 확대';
 fallback.src = `/defense/models/${model.asset??model.id}.png`; fallback.alt = `${model.name}의 정사영 렌더 이미지`; fallback.hidden = true;
 $<HTMLAnchorElement>('download-model').href = `/defense/models/${model.asset??model.id}.glb`;
 document.querySelectorAll<HTMLButtonElement>('#model-list button').forEach((button,i) => button.setAttribute('aria-pressed',String(i===index)));
 clearModel(); stage.dataset.loaded = 'loading';
 delete stage.dataset.renderCalls; delete stage.dataset.renderTriangles;
 for(const id of ['triangle-count','mesh-count','material-count'])$(id).textContent = '—';
 if(!renderer){showFallback('이 환경에서는 3D 화면을 열 수 없어 렌더 이미지를 표시합니다.');return;}
 try {
  const gltf = await loader.loadAsync(`/defense/models/${model.asset??model.id}.glb`);
  if(ticket!==generation){release(gltf.scene);return;}
  // Keep normalization outside the animated scene: clip tracks own their local transforms.
  current = new Group(); current.add(gltf.scene);
  const box = new Box3().setFromObject(current), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3()), scale = model.static?6.5/Math.max(size.x,size.y,size.z,.01):4.6/Math.max(size.y,.01);
  current.scale.setScalar(scale); current.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale); pivot.add(current);
  let triangles = 0, meshes = 0;
  current.traverse(node => {if(node instanceof Mesh){node.castShadow = true;node.receiveShadow = true;meshes++;triangles += (node.geometry.index?.count??node.geometry.attributes.position.count)/3;}});
  currentMaterials = [...materials(current)].filter((material):material is MeshStandardMaterial => material instanceof MeshStandardMaterial);
  currentMaterials.forEach(material => {material.wireframe = wireEnabled;material.envMapIntensity = .55;emissionLevels.set(material,material.emissiveIntensity);});
  for(const type of ['core','barrel','bolt','turret'] as const){const object = current.getObjectByName(type==='core'?'fire-core':type);if(object)parts.push({object,position:object.position.clone(),rotation:new Vector3(object.rotation.x,object.rotation.y,object.rotation.z),type});}
  const clip = gltf.animations.find(animation => animation.name===model.clip);
  if(clip){
   mixer = new AnimationMixer(gltf.scene); attackAction = mixer.clipAction(clip);
   attackAction.setLoop(model.loop?LoopRepeat:LoopOnce,model.loop?Infinity:1); attackAction.clampWhenFinished = true;
   mixer.addEventListener('finished',()=>{if(model.hold){stage.dataset.action='settled';redraw=true;}else stopAction();});
  }
  $('triangle-count').textContent = Math.round(triangles).toLocaleString(); $('mesh-count').textContent = String(meshes); $('material-count').textContent = String(materials(current).size);
  stage.dataset.loaded = model.id; status.hidden = true; setReady(true);
  redraw = true; renderer.shadowMap.needsUpdate = true; resetView();
 } catch {
  // A failed old request must not replace a newer successful selection.
  if(ticket!==generation)return;
  clearModel(); showFallback('3D 모델을 불러오지 못해 렌더 이미지를 표시합니다. 다시 선택하면 재시도해요.');
 }
}
models.forEach((model,index) => {
 const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-pressed',String(index===0));
 button.innerHTML = `<img src="/defense/models/${model.asset??model.id}.png" alt=""/><span><strong>${model.name}</strong><small>${model.detail}</small></span>`;
 button.onclick = () => {void select(index);}; $('model-list').append(button);
});
shoot.onclick = () => {
 if(!current||reduced.matches||models.find(model=>model.id===currentModelId)?.static)return;
 const looping=models.find(model=>model.id===currentModelId)?.loop;
 if(looping&&attackAction?.isRunning()){stopAction();return;}
 shotAt = elapsed; redraw = true; stage.dataset.action = looping?'walking':'firing';
 if(looping)shoot.textContent='■ 보행 멈춤';
 attackAction?.reset().play();
};
rotate.onclick = () => {automatic = !automatic;rotate.setAttribute('aria-pressed',String(automatic));redraw = true;};
wire.onclick = () => {
 wireEnabled = !wireEnabled; redraw = true; wire.setAttribute('aria-pressed',String(wireEnabled));
 currentMaterials.forEach(material => {material.wireframe = wireEnabled;});
};
reset.onclick = () => {redraw = true;resetView();};
let reducedMode=reduced.matches;
function syncReducedMotion(){
 reducedMode=reduced.matches;
 if(reducedMode){automatic = false;rotate.setAttribute('aria-pressed','false');stopAction();}
 setReady(!!current); redraw = true;
}
reduced.addEventListener('change',syncReducedMotion);

function draw(now:number) {
 // Some embedded browsers update matches before dispatching the change event.
 if(reducedMode!==reduced.matches)syncReducedMotion();
 const dt = Math.min(1,(now-last)/1000); last = now;
 if(!document.hidden){
  elapsed += dt;
  const autoMoving = automatic&&!reduced.matches&&!!current;
  if(autoMoving)pivot.rotation.y += dt*.28;
  const age = elapsed-shotAt, clipMoving = !!attackAction?.isRunning();
  // Towers use a short procedural recoil; the dwarf uses its authored attack clip.
  const power = !attackAction&&!reduced.matches&&age<.8?Math.sin(Math.min(1,age/.8)*Math.PI)*(1-age/.8):0;
  for(const part of parts){
   part.object.position.copy(part.position); part.object.rotation.set(part.rotation.x,part.rotation.y,part.rotation.z);
   if(part.type==='core'&&!reduced.matches)part.object.rotation.y += (automatic?elapsed*.35:0)+power*.5;
   if(part.type==='bolt')part.object.position.z += power*.38;
   // GLB forward is +Z; the cannon's bore rises by Blender delta Z/Y = .4/1.26.
   if(part.type==='barrel'){part.object.position.z -= power*.25;part.object.position.y -= power*.25*(.4/1.26);}
  }
  if(current){current.rotation.z = power*.018;for(const material of currentMaterials)if(material.emissive.getHex()!==0)material.emissiveIntensity = (emissionLevels.get(material)??.6)+power*2;}
  if(clipMoving){mixer?.update(dt);redraw = true;}
  if(!attackAction&&age>=.8&&stage.dataset.action==='firing'){stage.dataset.action = 'idle';redraw = true;}
  if(controls?.update())redraw = true;
  if(renderer&&(redraw||autoMoving||power>0||clipMoving)&&now-lastRender>=33){
   renderer.shadowMap.needsUpdate = true; renderer.render(scene,camera);
   stage.dataset.renderCalls = String(renderer.info.render.calls); stage.dataset.renderTriangles = String(renderer.info.render.triangles);
   redraw = false; lastRender = now;
  }
 }
 requestAnimationFrame(draw);
}
// Allow a direct preview link without accepting arbitrary asset paths.
const requestedModel = new URLSearchParams(location.search).get('model');
void select(Math.max(0,models.findIndex(model => model.id===requestedModel))); requestAnimationFrame(draw);
