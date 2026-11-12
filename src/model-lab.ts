import { AmbientLight, AnimationMixer, Box3, Color, DirectionalLight, GridHelper, Group, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, PCFShadowMap, PerspectiveCamera, PlaneGeometry, Scene, ShadowMaterial, SRGBColorSpace, Vector3, WebGLRenderer, ACESFilmicToneMapping, type AnimationAction, type Object3D, type Material } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';
import './model-lab.css';
import { createHitClip, hitFlashStrength } from './model-lab-hit';
import { createBronIdle } from './model-lab-motion';

type Model = {id:string;name:string;kind:string;detail:string;description:string;source:string;command:string;action:string;clip?:string;prototype?:boolean;viewRotation?:number;previews?:{idle:string;walk:string}};
const models:Model[] = [
 {id:'human-guard',name:'인간 창방패병 · 제작 시제품',kind:'HUMAN / GARRISON STUDY',detail:'청록 제복 · 철투구 · 목재 방패',description:'14-A 시안을 참고해 큰 머리와 짧은 팔다리로 만든 인간 병사입니다. 호흡·보행·찌르기와 장비 결합을 살펴보세요. 기하 모델 시제품이며 캠페인 병과로 추가되지는 않았습니다.',source:'prototypes/human-guard/human-guard.blend',command:'blender -b --python tools/blender/build_human_guard.py',action:'▶ 창 찌르기',clip:'human-guard-thrust',prototype:true,viewRotation:-1.85,previews:{idle:'human-guard-idle',walk:'human-guard-walk'}},
 {id:'fire-tower',name:'화염 수정탑',kind:'ELEMENTAL TOWER',detail:'돌 · 청동 · 발광 수정',description:'층층이 쌓은 석재 위에 청동 발톱이 수정을 지탱합니다. 마력 코어가 회전하며 불꽃을 모읍니다.',source:'towers.blend',command:'npm run models:build',action:'▶ 발사 동작'},
 {id:'piercing-ballista',name:'관통 발리스타',kind:'SIEGE WEAPON',detail:'오크 · 황동 · 강철',description:'보강한 목재 프레임과 거대한 활대, 긴 관통탄을 조합했습니다. 발사 후 장전 장치가 복귀합니다.',source:'towers.blend',command:'npm run models:build',action:'▶ 발사 동작'},
 {id:'water-cannon',name:'물폭탄포',kind:'HYDRAULIC TOWER',detail:'황동 · 유리 · 물',description:'유리 탱크와 배관이 압력 포신으로 연결됩니다. 포신 반동과 물 코어의 움직임을 확인하세요.',source:'towers.blend',command:'npm run models:build',action:'▶ 발사 동작'},
 {clip:'dwarf-hammer-attack',viewRotation:-1.85,id:'dwarf-guardian',name:'브론 · 드워프 공병',kind:'DWARF GUARDIAN',detail:'강철 · 청동 · 가죽',description:'두꺼운 갑옷과 땋은 수염, 묵직한 망치로 드워프 공병의 실루엣을 만들었습니다. 망치를 들어 강타하고 원래 자세로 돌아옵니다.',source:'dwarf.blend',command:'npm run models:dwarf',action:'▶ 망치 강타'},
 {id:'kar-barbarian',name:'카르 · 설산 전사',kind:'PROTOTYPE / HERO',detail:'붉은 머리 · 흰 털망토 · 양손 망치',description:'변경 전장에서 제작한 카르의 3D 시안입니다. 두 손으로 망치를 들어 내려치는 동작을 살펴보세요. 기존 캠페인 전투에는 아직 연결되지 않았습니다.',source:'kar-barbarian.blend',command:'blender -b --python tools/blender/build_barbarian.py',action:'▶ 망치 강타',clip:'kar-slam',viewRotation:-1.85},
 {id:'frontier-kar-game',name:'카르 · 전장 원본',kind:'FRONTIER / HERO',detail:'양손 망치 · 보행·강타',description:'기존 Frontier에서 가져온 카르 모델입니다. 캠페인에서 카르의 보행·강타에 연결한 원본입니다. 공격 시점은 기존 전투 엔진과 맞춥니다.',source:'frontier-kar.blend',command:'원본: Frontier bec8041',action:'▶ 망치 강타',clip:'kar-slam',prototype:true,viewRotation:-1.85},
 {id:'kar-detail-20261111',name:'카르 · 망치 디테일 시안',kind:'FRONTIER / DETAIL STUDY',detail:'자루 · 망치 끝 실루엣',description:'망치 자루와 머리 형태를 조정한 검토용 시안입니다. 게임 적용 전 손 관통과 실제 전장 크기 검증이 필요합니다.',source:'kar-detail-20261111/kar-detail.blend',command:'python3 tools/tests/check-kar-detail.py',action:'▶ 망치 강타',clip:'kar-slam',prototype:true,viewRotation:-1.85},
 {id:'frontier-ballista-game',name:'발리스타 · 전장 원본',kind:'FRONTIER / TOWER',detail:'나무 · 금속 · 화살',description:'기존 Frontier의 발리스타 모델과 발사 클립입니다. 캠페인 관통 석궁 Lv.2에 연결한 원본입니다. 기단을 유지하고 상부를 조준하며 발사합니다.',source:'frontier-ballista.blend',command:'원본: Frontier bec8041',action:'▶ 발사 동작',clip:'frontier-ballista-release',prototype:true},
 {id:'frontier-wood-strike-game',name:'나무 병사 · 전장 원본',kind:'FRONTIER / ENEMY',detail:'나뭇결 · 나뭇가지 · 이끼',description:'기존 Frontier 나무 병사의 공격 모델입니다. 자세와 재질을 검토하는 시안이며 캠페인에는 아직 연결되지 않았습니다.',source:'frontier-wood-strike.blend',command:'원본: Frontier bec8041',action:'▶ 공격 동작',clip:'frontier-wood-strike',prototype:true},
 {id:'polar-bear',name:'북극곰 · 빙해 수호자',kind:'PROTOTYPE / POLAR',detail:'제작 시안 · 닻 망치',description:'큰 방패와 닻 망치로 만든 극지 수호자입니다. 무기를 크게 들었다가 내려치는 동작과 손잡이 결합을 살펴보세요. 제작 시안이며 캠페인 전투에는 아직 연결되지 않았습니다.',source:'prototypes/polar-bear/polar-bear.blend',command:'npm run models:bear',action:'▶ 닻 망치 강타',clip:'polar-bear-attack',prototype:true,viewRotation:-1.85},
 {id:'gecko-ranger',name:'도마뱀 · 씨앗 궁수',kind:'PROTOTYPE / TROPICAL',detail:'제작 시안 · 씨앗 쇠뇌',description:'잎 두건과 긴 꼬리, 큼직한 씨앗 쇠뇌가 특징인 열대 궁수입니다. 조준·발사 반동·복귀를 확인하세요. 제작 시안이며 캠페인 전투에는 아직 연결되지 않았습니다.',source:'prototypes/gecko-ranger/gecko-ranger.blend',command:'npm run models:gecko',action:'▶ 씨앗 발사',clip:'gecko-seed-shot',prototype:true,viewRotation:-1.85},
];
const asset = (model:Model,extension:'png'|'glb') => `/defense/models/${model.prototype?'prototypes/':''}${model.id}.${extension}`;
const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const stage = $<HTMLDivElement>('model-stage'), status = $<HTMLParagraphElement>('model-loading'), fallback = $<HTMLImageElement>('model-fallback');
const shoot = $<HTMLButtonElement>('attack-preview'), rotate = $<HTMLButtonElement>('auto-rotate'), wire = $<HTMLButtonElement>('wireframe'), reset = $<HTMLButtonElement>('reset-view');
const idleButton = $<HTMLButtonElement>('idle-preview');
const clipIdle=$<HTMLButtonElement>('clip-idle-preview'),clipWalk=$<HTMLButtonElement>('clip-walk-preview');
const previewActions=new Map<string,AnimationAction>();let previewAction:AnimationAction|null=null;
let idleRig:ReturnType<typeof createBronIdle> = null, idleEnabled = false;
const pose = $<HTMLInputElement>('pose-progress'), hit = $<HTMLButtonElement>('hit-preview');
let renderer:WebGLRenderer|null = null, controls:OrbitControls|null = null, current:Group|null = null, mixer:AnimationMixer|null = null, attackAction:AnimationAction|null = null, hitAction:AnimationAction|null = null;
let currentModelId = models[0].id;
let generation = 0, automatic = false, wireEnabled = false, shotAt = -Infinity, last = performance.now(), elapsed = 0, redraw = true, lastRender = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const scene = new Scene(), camera = new PerspectiveCamera(35,1,.05,100), loader = new GLTFLoader();
const pivot = new Group(); scene.add(pivot);
let currentMaterials:MeshStandardMaterial[] = [];
const emissionLevels = new Map<MeshStandardMaterial,number>();
const baseColors = new Map<MeshStandardMaterial,Color>(), flashColor = new Color(0xff694b);
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
// Authoring +Y becomes GLB -Z; character defaults show the face and weapon.
function resetView() {pivot.rotation.y = models.find(model => model.id===currentModelId)?.viewRotation??0;camera.position.set(8.3,6.5,10.3);controls?.target.set(0,2.0,0);controls?.update();}
function stopAction() {
 attackAction?.stop(); hitAction?.stop(); previewAction?.stop();previewAction=null;clipIdle.setAttribute('aria-pressed','false');clipWalk.setAttribute('aria-pressed','false');idleRig?.restore(); idleEnabled = false; idleButton.setAttribute('aria-pressed','false'); $('motion-state').textContent = 'REST · 기본 자세'; baseColors.forEach((color,material) => material.color.copy(color)); pose.value = '0'; $('pose-value').textContent = '0%'; shotAt = -Infinity; stage.dataset.action = 'idle'; redraw = true;
}
function clearModel() {
 stopAction(); idleRig = null;
 mixer?.stopAllAction();
 if(mixer)mixer.uncacheRoot(mixer.getRoot());
 attackAction = null; hitAction = null; mixer = null;previewActions.clear();
 if(current){pivot.remove(current);release(current);current = null;}
 parts.length = 0; currentMaterials = []; emissionLevels.clear(); baseColors.clear(); pivot.rotation.y = 0; stopAction();
}
function setReady(ready:boolean) {
 $('motion-review').hidden = currentModelId!=='dwarf-guardian';
 const previews=models.find(model=>model.id===currentModelId)?.previews;
 for(const [kind,button] of [['idle',clipIdle],['walk',clipWalk]] as const){button.hidden=!previews;button.disabled=!ready||reduced.matches||!previews||!previewActions.has(previews[kind]);}
 idleButton.disabled = !ready || !idleRig || reduced.matches;
 document.querySelectorAll<HTMLButtonElement>('[data-review-pose]').forEach(button => {button.disabled = !ready || !attackAction;});
 $('pose-control').hidden = !ready || !attackAction;
 hit.hidden = !['polar-bear','gecko-ranger'].includes(currentModelId); hit.disabled = !ready || !hitAction || reduced.matches;
 const missingAttack = !!models.find(model => model.id===currentModelId)?.clip&&!attackAction;
 shoot.disabled = !ready || reduced.matches || missingAttack;
 rotate.disabled = !ready || reduced.matches;
 wire.disabled = !ready; reset.disabled = !ready;
 shoot.title = reduced.matches?'동작 줄이기 설정으로 공격 모션을 멈췄어요.':ready&&missingAttack?'이 모델에 공격 모션이 없습니다.':'';
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
 fallback.src = asset(model,'png'); fallback.alt = `${model.name}의 정사영 렌더 이미지`; fallback.hidden = true;
 $<HTMLAnchorElement>('download-model').href = asset(model,'glb');
 document.querySelectorAll<HTMLButtonElement>('#model-list button').forEach((button,i) => {
  button.setAttribute('aria-pressed',String(i===index));
  if(i===index){const list = $('model-list');list.scrollLeft += button.getBoundingClientRect().left-list.getBoundingClientRect().left;}
 });
 clearModel(); stage.dataset.loaded = 'loading';
 delete stage.dataset.renderCalls; delete stage.dataset.renderTriangles;
 for(const id of ['triangle-count','mesh-count','material-count'])$(id).textContent = '—';
 if(!renderer){showFallback('이 환경에서는 3D 화면을 열 수 없어 렌더 이미지를 표시합니다.');return;}
 try {
  const gltf = await loader.loadAsync(asset(model,'glb'));
  if(ticket!==generation){release(gltf.scene);return;}
  // Keep normalization outside the animated scene: clip tracks own their local transforms.
  current = new Group(); current.add(gltf.scene);
  const box = new Box3().setFromObject(current), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3()), scale = 4.6/Math.max(size.y,.01);
  current.scale.setScalar(scale); current.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale); pivot.add(current);
  let triangles = 0, meshes = 0;
  current.traverse(node => {if(node instanceof Mesh){node.castShadow = true;node.receiveShadow = true;meshes++;triangles += (node.geometry.index?.count??node.geometry.attributes.position.count)/3;}});
  currentMaterials = [...materials(current)].filter((material):material is MeshStandardMaterial => material instanceof MeshStandardMaterial);
  currentMaterials.forEach(material => {material.wireframe = wireEnabled;material.envMapIntensity = .55;emissionLevels.set(material,material.emissiveIntensity);baseColors.set(material,material.color.clone());});
  for(const type of ['core','barrel','bolt','turret'] as const){const object = current.getObjectByName(type==='core'?'fire-core':type);if(object)parts.push({object,position:object.position.clone(),rotation:new Vector3(object.rotation.x,object.rotation.y,object.rotation.z),type});}
  idleRig = model.id==='dwarf-guardian'?createBronIdle(gltf.scene):null;
  const clip = gltf.animations.find(animation => animation.name===model.clip);
  if(clip){
   mixer = new AnimationMixer(gltf.scene); attackAction = mixer.clipAction(clip);
   attackAction.setLoop(LoopOnce,1); attackAction.clampWhenFinished = true;
   const hitClip = createHitClip(model.id,gltf.scene);
   if(hitClip){hitAction = mixer.clipAction(hitClip);hitAction.setLoop(LoopOnce,1);}
   if(model.previews)for(const name of Object.values(model.previews)){const animation=gltf.animations.find(item=>item.name===name);if(animation){const action=mixer.clipAction(animation);action.setLoop(LoopRepeat,Infinity);previewActions.set(name,action);}}
   mixer.addEventListener('finished',stopAction);
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
 button.innerHTML = `<img src="${asset(model,'png')}" alt=""/><span><strong>${model.name}</strong><small>${model.detail}</small></span>`;
 button.onclick = () => {void select(index);}; $('model-list').append(button);
});
shoot.onclick = () => {
 if(!current||reduced.matches)return;
 stopAction(); shotAt = elapsed; redraw = true; stage.dataset.action = 'firing'; $('motion-state').textContent = 'ATTACK · 강타 재생';
 attackAction?.reset().play();
};
for(const [kind,button] of [['idle',clipIdle],['walk',clipWalk]] as const){
 button.onclick=()=>{
  const name=models.find(model=>model.id===currentModelId)?.previews?.[kind],action=name?previewActions.get(name):undefined;
  if(!action||reduced.matches)return;const stop=previewAction===action;stopAction();
  if(!stop){previewAction=action;action.reset().play();button.setAttribute('aria-pressed','true');stage.dataset.action=kind==='walk'?'walking':'breathing';}
  redraw=true;
 };
}
hit.onclick = () => {
 if(!hitAction||reduced.matches)return;
 stopAction(); stage.dataset.action = 'hit'; hitAction.reset().play(); redraw = true;
};
function reviewPose(requestedPose:number, label='POSE · 자유 포즈') {
 if(!attackAction||!mixer)return;
 // Evaluate a single authored pose without advancing time, including reduced motion.
 stopAction(); pose.value = String(requestedPose); attackAction.reset().play(); attackAction.paused = true;
 attackAction.time = attackAction.getClip().duration*requestedPose/100;
 mixer.update(0); shotAt = -Infinity; stage.dataset.action = 'pose';
 $('pose-value').textContent = `${Math.round(requestedPose*10)/10}%`; $('motion-state').textContent = label; redraw = true;
}
pose.oninput = () => reviewPose(Number(pose.value));
document.querySelectorAll<HTMLButtonElement>('[data-review-pose]').forEach(button => {
 button.onclick = () => reviewPose(Number(button.dataset.reviewPose),button.dataset.reviewLabel);
});
idleButton.onclick = () => {
 if(!idleRig||reduced.matches)return;
 const next = !idleEnabled; stopAction(); idleEnabled = next;
 idleButton.setAttribute('aria-pressed',String(next));
 stage.dataset.action = next?'breathing':'idle';
 $('motion-state').textContent = next?'IDLE · 경계하며 호흡':'REST · 기본 자세'; redraw = true;
};
rotate.onclick = () => {automatic = !automatic;rotate.setAttribute('aria-pressed',String(automatic));redraw = true;};
wire.onclick = () => {
 wireEnabled = !wireEnabled; redraw = true; wire.setAttribute('aria-pressed',String(wireEnabled));
 currentMaterials.forEach(material => {material.wireframe = wireEnabled;});
};
reset.onclick = () => {redraw = true;resetView();};
reduced.addEventListener('change',() => {
 if(reduced.matches){automatic = false;rotate.setAttribute('aria-pressed','false');stopAction();}
 setReady(!!current); redraw = true;
});

document.addEventListener('visibilitychange',() => {last = performance.now();redraw = true;});

function draw(now:number) {
 const dt = Math.min(1,(now-last)/1000); last = now;
 if(!document.hidden){
  elapsed += dt;
  const autoMoving = automatic&&!reduced.matches&&!!current;
  if(autoMoving)pivot.rotation.y += dt*.28;
  const age = elapsed-shotAt, clipMoving = !!attackAction?.isRunning() || !!hitAction?.isRunning() || !!previewAction?.isRunning();
  // Towers use procedural recoil; characters use their authored attack clips.
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
  const idleMoving = idleEnabled&&!reduced.matches&&!!idleRig;
  if(idleMoving)idleRig?.update(dt);
  const flash = hitAction?.isRunning() ? hitFlashStrength(hitAction.time) : 0;
  baseColors.forEach((color,material) => material.color.copy(color).lerp(flashColor,flash));
  if(!attackAction&&age>=.8&&stage.dataset.action==='firing'){stage.dataset.action = 'idle';redraw = true;}
  if(controls?.update())redraw = true;
  if(renderer&&(redraw||autoMoving||power>0||clipMoving||idleMoving)&&now-lastRender>=33){
   renderer.shadowMap.needsUpdate = true; renderer.render(scene,camera);
   stage.dataset.renderCalls = String(renderer.info.render.calls); stage.dataset.renderTriangles = String(renderer.info.render.triangles);
   redraw = false; lastRender = now;
  }
 }
 requestAnimationFrame(draw);
}
// Allow a direct preview link without accepting arbitrary asset paths.
const requestedModel = new URLSearchParams(location.search).get('model');
void select(requestedModel?Math.max(0,models.findIndex(model => model.id===requestedModel)):models.findIndex(model=>model.id==='dwarf-guardian')); requestAnimationFrame(draw);
