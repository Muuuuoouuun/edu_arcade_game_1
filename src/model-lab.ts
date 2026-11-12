import { AmbientLight, AnimationMixer, Box3, Color, DirectionalLight, GridHelper, Group, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, PCFShadowMap, PerspectiveCamera, PlaneGeometry, Scene, ShadowMaterial, SRGBColorSpace, Vector3, WebGLRenderer, ACESFilmicToneMapping, type AnimationAction, type Object3D, type Material } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';
import './model-lab.css';
import { createHitClip, hitFlashStrength } from './model-lab-hit';
import { createBronIdle } from './model-lab-motion';

const models = [
 {id:'rush-town',glb:new URL('./rush/models/forest-town.glb',import.meta.url).href,name:'Rush · 녹음 성채',kind:'RUSH FOREST TOWN',detail:'석조 아치 · 목재 양문 · 청록 지붕',description:'Rush 전장에서 지키는 성채입니다. 앞문의 쐐기돌과 목재 보강, 뒤쪽 보급문과 지붕을 회전하며 살펴보세요. 현재는 고정된 건물이며 파괴·피격 애니메이션은 포함하지 않습니다.',source:'rush-town.blend',command:'npm run models:rush-town',action:'고정 모형',static:true,fitBounds:true},
 {id:'legion-shield',name:'군단 방패병 · 방패 강타',kind:'LEGION SHIELD SOLDIER',detail:'청록 방패 · 주홍 목도리 · 고정된 발',description:'같은 모델이 군단 전장과 병종 카드에 사용됩니다. 방패가 타격 순간 앞으로 나가고 발을 디딘 채 회복합니다.',source:'legion-shield.blend',command:'blender -b --python tools/blender/build_legion_shield.py',action:'▶ 방패 강타',clip:'legion-shield-bash',hold:true,fitBounds:true},
 {id:'legion-shield-walk',name:'군단 방패병 · 접지 보행',kind:'LEGION SHIELD SOLDIER',detail:'남청 망토 · 교대 지지 발 · 청록 방패',description:'양 발의 지지와 회수를 실제 메시 관절로 재생합니다. 군단에서는 이동 거리에 따라 이 포즈를 사용하고 피해 시 강타가 우선합니다.',source:'legion-shield-walk.blend',command:'blender --background --python-exit-code 1 --python tools/blender/build_legion_shield_walk.py',action:'▶ 보행 재생',clip:'legion-shield-walk',loop:true,fitBounds:true},
 {id:'frontier-relic',name:'변경 전장 · 회복 수정',kind:'FRONTIER RECOVERY CRYSTAL',detail:'석재 받침 · 황동 고정쇠 · 청록 결정',description:'수정 원정의 회복 수정입니다. 전장에서는 가까이 다가가 상호작용하고, 수집한 뒤 수정이 사라져 빈 받침이 남습니다. 작업실에서는 고정된 3D 형태를 살펴봅니다.',source:'frontier-relic.blend',command:'npm run models:frontier-relic',action:'고정 모형',static:true,fitBounds:true},
 {id:'frontier-squad',name:'변경 전장 · 석궁 지원병',kind:'FRONTIER SUPPORT SCOUT',detail:'청록 천 · 금속 투구 · 양손 석궁',description:'작은 지원병이 양손으로 석궁을 잡고 발을 디딥니다. 전장에서는 실제 이동 거리에 따라 다리를 움직이고 표적을 향합니다. 작업실에서는 모델의 고정 자세를 살펴봅니다.',source:'frontier-squad.blend',command:'npm run models:frontier-squad',action:'고정 모형',static:true,fitBounds:true},
 {id:'frontier-forest-doors',name:'녹음 성문 · 목재 양문',kind:'FOREST GATE DOORS',detail:'곡선 널판 · 철띠 · 충격 반동',description:'녹음 성문의 두 목재 문짝이 충격을 받고 경첩을 중심으로 뒤로 밀렸다 돌아옵니다. 3D 미리보기는 문짝을 표시하며 원본 렌더는 석조 아치와 함께 보여 줍니다.',source:'frontier-forest-doors.blend',command:'npm run models:frontier-forest-doors',action:'▶ 성문 충격',clip:'forest-door-impact',fitBounds:true},
 {id:'frontier-terrain',name:'녹음 협곡 · 숲 전장',kind:'VERDANT FRONTIER TERRAIN',detail:'넓은 수관 · 강 · 양안의 석재 접근로',description:'숲 경계와 굽은 도로, 강 양안에서 다리로 이어지는 석재 길을 살펴보세요. 기존 강과 다리의 통행 높이는 유지합니다.',source:'frontier-terrain.blend',command:'npm run models:frontier-terrain',action:'고정 지형',static:true,fitBounds:true},
 {id:'frontier-frost-forest',name:'서리 협곡 · 눈 덮인 숲',kind:'FROST FOREST TERRAIN',detail:'침엽수 · 눈 쌓인 수관 · 층진 절벽',description:'눈이 쌓인 침엽수가 협곡 바깥에 서서 전장 뒤편의 높이와 깊이를 보여 줍니다. 기존 이동 지형과 다리는 유지합니다.',source:'frontier-frost-forest.blend',command:'npm run models:frontier-frost-forest',action:'고정 지형',static:true,fitBounds:true},
 {id:'frontier-frost-cliffs',name:'서리 협곡 · 층진 절벽',kind:'POLAR CLIFF TERRAIN',detail:'깊은 암면 틈 · 눈 처마 · 낮고 높은 능선',description:'눈이 얹힌 넓은 암면과 깊게 들어간 틈이 실제 입체로 이어집니다. 이동 가능한 땅과 다리 높이를 유지하면서 서리 협곡 바깥의 실루엣을 다듬었습니다.',source:'frontier-frost-cliffs.blend',command:'npm run models:frontier-frost-cliffs',action:'고정 지형',static:true,fitBounds:true},
 {id:'frontier-frost-gate-impact',name:'서리 성문 · 충격과 등불',kind:'FROST GATE IMPACT',detail:'고정 석조 · 두꺼운 문짝 · 뒤따르는 등불',description:'철띠로 보강한 목재 문짝이 충격에 밀렸다 돌아오고, 매달린 등불이 뒤늦게 흔들립니다. 변경 전장의 실제 성문 피해에 연결되며 분대·솔로 모드에서는 통로를 열어 둡니다.',source:'frontier-frost-gate-impact.blend',command:'npm run models:frontier-gate-impact',action:'▶ 성문 피격',clip:'frost-gate-impact',fitBounds:true},
 {id:'frontier-frost-gate',name:'서리 협곡 · 설산 성문',kind:'FROST ARCHITECTURE',detail:'열린 석조 아치 · 눈 쌓인 성벽',description:'짙은 깃발과 황동 등불, 쌓인 돌의 아치와 눈 덮인 흉벽을 회전하며 살펴보세요. 기본 석조 아치 원본이며, 현재 서리 전장에서는 보강 문짝과 피격 동작을 더한 버전을 사용합니다.',source:'frontier-frost.blend',command:'npm run models:frontier-frost',action:'고정 모형',static:true,fitBounds:true},
 {id:'frontier-frost',name:'서리 협곡 · 입체 지형',kind:'FROST TERRAIN',detail:'얼음 능선 · 고드름 · 협곡 다리',description:'눈 처마 아래 고드름과 빙하 능선이 실제 높이를 갖습니다. 숲 전장과 같은 이동 경로 위에 설산의 다른 실루엣을 더했습니다.',source:'frontier-frost.blend',command:'npm run models:frontier-frost',action:'고정 지형',static:true,fitBounds:true},
 {id:'frontier-beacon',name:'변경 봉화 · 녹음 신호탑',kind:'CAPTURE BEACON',detail:'고정 석조 · 열리는 황동 잎',description:'석조 받침은 고정하고 네 황동 덮개가 열리며 수정이 올라옵니다. 지휘 전장에서는 점령 진행에 맞춰 움직입니다.',source:'frontier-beacon.blend',command:'npm run models:frontier-beacon',action:'▶ 점령 전개',clip:'beacon-capture',hold:true,fitBounds:true},
 {id:'frontier-kar-stop',asset:'frontier-kar-game',name:'카르 · 변경 전장 발 디딤',kind:'GROUNDED WALK STOP',detail:'마지막 걸음 · 늦게 멈추는 망치',description:'발을 차례로 디뎌 몸을 세우고, 양손 망치와 털망토가 뒤따라 멈춥니다.',source:'frontier-kar.blend',command:'npm run models:frontier-kar',action:'▶ 발 디디며 정지',clip:'kar-stop-2',hold:true,fitBounds:true},
 {id:'frontier-kar-reset',asset:'frontier-kar-game',name:'카르 · 변경 전장 회수',kind:'GROUNDED HAMMER RECOVERY',detail:'고정된 발 · 늦게 따라오는 망치',description:'두 발을 디딘 채 몸을 먼저 세우고, 무거운 망치와 털망토가 뒤따라 안정됩니다.',source:'frontier-kar.blend',command:'npm run models:frontier-kar',action:'▶ 강타 회수',clip:'kar-reset-0',hold:true,fitBounds:true},
 {id:'frontier-kar',asset:'frontier-kar-game',name:'카르 · 변경 전장',kind:'FRONTIER WINTER WARRIOR',detail:'흰 털망토 · 황동 망치 · 발 디딤',description:'붉은 머리와 흰 털망토, 황동 문양이 새겨진 망치를 가진 설산 전사입니다. 변경 전장에서 사용하는 몸으로 두 손을 모아 망치를 내려치는 모습을 살펴보세요.',source:'frontier-kar.blend',command:'npm run models:frontier-kar',action:'▶ 망치 강타',clip:'kar-slam',fitBounds:true},
 {id:'frontier-wood-strike',name:'통나무 병사 · 몽둥이 내려치기',kind:'FRONTIER CLUB STRIKE',detail:'발 고정 · 무기 들기 · 타격과 회수',description:'두 발을 짚고 몽둥이를 들어 올린 뒤 내려칩니다. 변경 전장에서는 0.28초의 타격 시점에 사거리와 방향을 확인하며 준비 중에는 피할 수 있습니다.',source:'frontier-wood-strike.blend',command:'npm run models:frontier-wood-strike',action:'▶ 몽둥이 내려치기',clip:'frontier-wood-strike',fitBounds:true},
 {id:'frontier-wood',name:'통나무 병사 · 변경 전장',kind:'FRONTIER WOODEN SOLDIER',detail:'목재 단면 · 가지 · 손에 쥔 몽둥이',description:'기존 통나무 병사의 관절 보행을 전장 크기에 맞춘 모델입니다. 실제 변경 전장에서는 이동 거리에 따라 걸음을 재생하고 진행 방향으로 몸을 돌립니다. 멈추면 두 발을 디디며 준비 자세로 돌아옵니다.',source:'frontier-wood.blend',command:'npm run models:frontier-wood',action:'▶ 보행 재생',clip:'frontier-wood-walk',loop:true,fitBounds:true},
 {id:'frontier-ballista',name:'변경 발리스타 · 실시간 전장',kind:'FRONTIER SIEGE WEAPON',detail:'고정 석조 기초 · 목재 활대 · 황동 반동 장치',description:'목재 활대와 시위가 풀리고 상부 받침이 짧게 물러난 뒤 다시 장전합니다. 실시간 변경 전장에서는 기초를 고정하고 상부만 조준하며 실제 탄이 도착할 때 피해를 줍니다.',source:'frontier-ballista.blend',command:'npm run models:frontier-ballista',action:'▶ 발사·재장전',clip:'frontier-ballista-release',fitBounds:true},
 {id:'polar-bear',name:'북극곰 · 빙해 수호자',kind:'PROTOTYPE / POLAR',detail:'제작 시안 · 닻 망치',description:'큰 방패와 닻 망치로 만든 극지 수호자입니다. 무기를 크게 들었다가 내려치는 동작과 손잡이 결합을 살펴보세요. 제작 시안이며 캠페인 전투에는 아직 연결되지 않았습니다.',source:'prototypes/polar-bear/polar-bear.blend',command:'npm run models:bear',action:'▶ 닻 망치 강타',clip:'polar-bear-attack',asset:'prototypes/polar-bear',fitBounds:true},
 {id:'gecko-ranger',name:'도마뱀 · 씨앗 궁수',kind:'PROTOTYPE / TROPICAL',detail:'제작 시안 · 씨앗 쇠뇌',description:'잎 두건과 긴 꼬리, 큼직한 씨앗 쇠뇌가 특징인 열대 궁수입니다. 조준·발사 반동·복귀를 확인하세요. 제작 시안이며 캠페인 전투에는 아직 연결되지 않았습니다.',source:'prototypes/gecko-ranger/gecko-ranger.blend',command:'npm run models:gecko',action:'▶ 씨앗 발사',clip:'gecko-seed-shot',asset:'prototypes/gecko-ranger',fitBounds:true},
 {id:'kar-barbarian',name:'카르 · 설산 전사',kind:'WINTER HAMMER WARRIOR',detail:'붉은 머리 · 흰 털망토 · 양손 망치',description:'두 손으로 무거운 망치를 들어 올리고, 발을 디딘 채 내려칩니다. 몸통이 무게를 받고 털망토와 수염이 뒤따라 흔들립니다.',source:'kar-barbarian.blend',command:'npm run models:barbarian',action:'▶ 망치 강타',clip:'kar-slam'},
 {id:'kar-barbarian-walk',name:'카르 · 방향 보행',kind:'WINTER HAMMER WARRIOR',detail:'넓은 발 지지 · 망치 유지 · 털망토',description:'망치 손잡이를 두 손으로 잡고 발을 번갈아 내딛습니다. 전투에서는 같은 몸을 여덟 방향으로 렌더해 사용합니다.',source:'kar-barbarian-walk.blend',command:'npm run models:barbarian',action:'▶ 보행 재생',clip:'kar-walk',loop:true},
 {id:'moonlight-wolf',name:'달빛 늑대 · 동료',kind:'MOONLIGHT COMPANION',detail:'작은 몸 · 은빛 털 · 초록 목걸이',description:'네 발을 디디고 몸을 낮춘 뒤 입을 벌려 내밉니다. 턱 닫힘·반동·회수를 여덟 자세로 연결하고 귀·꼬리·목걸이는 늦게 따라옵니다.',source:'moonlight-wolf.blend',command:'npm run models:pet-wolf',action:'▶ 물기 재생',clip:'moonlight-bite'},
 {id:'moonlight-wolf-walk',name:'달빛 늑대 · 사족 보행',kind:'MOONLIGHT COMPANION',detail:'대각선 발 지지 · 둥근 다리 · 꼬리',description:'대각선 발을 짝지어 땅을 밀고, 짧게 떠오르며 다음 발을 내딛습니다. 실제 발 이동량에서 방향별 보폭을 계산해 전투 이동과 맞췄습니다.',source:'moonlight-wolf-walk.blend',command:'npm run models:pet-wolf',action:'▶ 보행 재생',clip:'moonlight-walk',loop:true},
 {id:'luna-druid',name:'루나 · 숲의 드루이드',kind:'WOODLAND DRUID',detail:'여우 귀 · 구리빛 머리 · 잎 지팡이',description:'지팡이를 모아 준비한 뒤 수정 끝을 앞으로 내밀어 시전합니다. 두 발은 지면을 짚고 귀·머리카락·망토가 뒤따라 움직입니다.',source:'luna-druid.blend',command:'npm run models:druid',action:'▶ 숲의 시전',clip:'luna-cast'},
 {id:'luna-ultimate',name:'루나 · 덩굴의 포효',kind:'WOODLAND DRUID',detail:'지팡이를 높인 시전 · 두 발 접지',description:'필살기가 즉시 발동할 때 지팡이와 빈손을 들어 올리고 준비 자세로 거둡니다. 늑대 동료는 별도로 움직입니다.',source:'luna-ultimate.blend',command:'npm run models:luna-ultimate',action:'▶ 필살기 동작',clip:'luna-ultimate-0',hold:true,fitBounds:true},
 {id:'luna-druid-walk',name:'루나 · 방향 보행',kind:'WOODLAND DRUID',detail:'양발 지지 · 옷자락 · 머리카락',description:'지팡이를 들고 양발의 지지와 회수를 번갈아 이어갑니다. 여덟 방향 전투 이미지도 같은 원본으로 렌더합니다.',source:'luna-druid-walk.blend',command:'npm run models:druid',action:'▶ 보행 재생',clip:'luna-walk',loop:true},
 {id:'cheongun-tao',name:'청운 · 부적술사',kind:'TALISMAN CASTER',detail:'청록 도포 · 넓은 소매 · 붉은 매듭',description:'부적을 들어 올린 뒤 팔을 뻗어 시전합니다. 두 발은 지면을 짚고 소매·종이 끝·머리카락이 뒤따라 움직입니다.',source:'cheongun-tao.blend',command:'npm run models:tao',action:'▶ 부적 시전',clip:'cheongun-cast'},
 {id:'cheongun-tao-walk',name:'청운 · 방향 보행',kind:'TALISMAN CASTER',detail:'도포 자락 · 장화 · 발 접지',description:'장화의 지지와 회수를 번갈아 연결하고 도포 자락과 머리카락이 따라 움직입니다. 전투도 같은 원본에서 여덟 방향으로 렌더합니다.',source:'cheongun-tao-walk.blend',command:'npm run models:tao',action:'▶ 보행 재생',clip:'cheongun-walk',loop:true},
 {id:'cheongun-ultimate',name:'청운 · 뇌운 결계',kind:'TALISMAN CASTER',detail:'부적을 높이 든 시전 · 두 발 접지',description:'뇌운 결계가 발동하는 즉시 부적을 높이 들고 양팔을 거둡니다. 기존 청운 모델과 지면을 공유합니다.',source:'cheongun-ultimate.blend',command:'npm run models:cheongun-ultimate',action:'▶ 필살기 동작',clip:'cheongun-ultimate-0',hold:true,fitBounds:true},
 {id:'riel-reset',name:'리엘 · 제자리 사격 회수',kind:'ELVEN ARCHER',detail:'고정된 발 · 당긴 손 회수 · 망토 정리',description:'화살을 놓은 뒤 몸통을 안정시키고, 손과 망토를 차례로 정리해 다음 사격을 준비합니다.',source:'riel-reset.blend',command:'npm run models:riel-reset',action:'▶ 회수 재생',clip:'riel-reset-0',hold:true},
 {id:'riel-stop',name:'리엘 · 발 디디며 멈추기',kind:'FOREST ARCHER',detail:'한 발씩 멈추기 · 활 안정 · 망토 정리',description:'마지막 걸음에서 한 발씩 내려놓고 체중을 정리합니다. 활을 안정시키고 머리카락과 망토가 뒤따라 멈춥니다.',source:'riel-stop.blend',command:'npm run models:riel-stop',action:'▶ 정지 동작',clip:'riel-stop-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'riel-return',name:'리엘 · 사격에서 걸음으로',kind:'FOREST ARCHER',detail:'활 회수 · 망토 정리 · 보행 복귀',description:'화살을 놓은 뒤 팔과 망토를 정리하며 다음 걸음으로 이어집니다. 복귀 걸음을 바꿔 끝 자세를 확인하세요.',source:'riel-return.blend',command:'npm run models:riel-return',action:'▶ 보행 복귀',clip:'riel-return-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'riel-entry',name:'리엘 · 걸음에서 사격으로',kind:'FOREST ARCHER',detail:'차례로 발 디디기 · 체중 정리 · 활 당기기',description:'마지막 걸음에서 한 발씩 짚고 활을 당깁니다. 여덟 출발 자세를 바꿔 확인하세요. 화살을 놓는 순간과 회수는 기존 사격과 같습니다.',source:'riel-entry.blend',command:'npm run models:riel-entry',action:'▶ 사격 진입',clip:'riel-entry-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'riel-archer',name:'리엘 · 숲 명사수',kind:'FOREST ARCHER',detail:'초록 후드 · 금발 · 곡선 활',description:'두 발로 버티고 활대와 시위를 당겼다가 화살을 놓습니다. 팔·시위·화살의 실제 움직임과 복귀를 확인하세요.',source:'riel-archer.blend',command:'npm run models:elf',action:'▶ 활 발사',clip:'riel-cast'},
 {id:'riel-ultimate',name:'리엘 · 별빛 화살비',kind:'FOREST ARCHER',detail:'들어 올린 활 · 발사 후 회수',description:'별빛 화살비가 즉시 발동할 때 활을 들어 올리고, 시위와 양팔을 연결한 채 대기 자세로 돌아옵니다.',source:'riel-ultimate.blend',command:'npm run models:riel-ultimate',action:'▶ 필살기 동작',clip:'riel-ultimate-0',hold:true,fitBounds:true},
 {id:'riel-archer-walk',name:'리엘 · 방향 보행',kind:'FOREST ARCHER',detail:'가죽 장화 · 망토 · 발 접지',description:'활을 든 채 양발의 지지와 회수를 번갈아 연결합니다. 같은 원본에서 전투의 여덟 방향을 렌더합니다.',source:'riel-archer-walk.blend',command:'npm run models:elf',action:'▶ 보행 재생',clip:'riel-walk',loop:true},
 {id:'ian-mage',name:'이안 · 수정 마법사',kind:'ARCANE MAGE',detail:'꺾인 모자 · 남색 코트 · 수정 지팡이',description:'발을 짚고 수정 지팡이를 모았다가 앞으로 뻗어 시전합니다. 코트와 망토, 손목의 복귀를 실제 관절로 확인하세요.',source:'ian-mage.blend',command:'npm run models:mage',action:'▶ 지팡이 시전',clip:'ian-cast'},
 {id:'ian-reset',name:'이안 · 제자리 시전 회수',kind:'ARCANE MAGE',detail:'고정된 발 · 지팡이 회수 · 망토 잔동작',description:'발을 짚은 채 몸의 반동을 정리하고 손목이 작은 호를 그리며 지팡이를 세웁니다. 망토가 뒤따라 멈추는 모습을 확인하세요.',source:'ian-reset.blend',command:'npm run models:ian-reset',action:'▶ 시전 회수',clip:'ian-reset-0',hold:true,fitBounds:true},
 {id:'cheongun-reset',name:'청운 · 제자리 시전 회수',kind:'TALISMAN CASTER',detail:'고정된 발 · 부적 손 회수 · 도포 잔동작',description:'발을 짚은 채 몸의 반동을 정리하고 손목이 작은 호를 그리며 부적을 거둡니다. 도포가 뒤따라 멈추는 모습을 확인하세요.',source:'cheongun-reset.blend',command:'npm run models:cheongun-reset',action:'▶ 시전 회수',clip:'cheongun-reset-0',hold:true,fitBounds:true},
 {id:'ian-return',name:'이안 · 시전에서 걸음으로',kind:'ARCANE MAGE',detail:'체중 회수 · 지팡이 잔동작 · 보행 복귀',description:'마법탄을 보낸 뒤 몸이 먼저 돌아오고 지팡이와 망토가 뒤따릅니다. 복귀 걸음을 바꿔 다음 발 디딤을 확인하세요.',source:'ian-return.blend',command:'npm run models:ian-return',action:'▶ 보행 복귀',clip:'ian-return-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'cheongun-return',name:'청운 · 시전에서 걸음으로',kind:'TALISMAN CASTER',detail:'체중 회수 · 부적 손·도포 회수 · 보행 복귀',description:'부적을 보낸 뒤 몸이 먼저 돌아오고 손·머리카락·도포가 뒤따릅니다. 복귀 걸음을 바꿔 다음 발 디딤을 확인하세요.',source:'cheongun-return.blend',command:'npm run models:cheongun-return',action:'▶ 보행 복귀',clip:'cheongun-return-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'luna-stop',name:'루나 · 발 디디며 멈추기',kind:'WOODLAND DRUID',detail:'차례로 발 디디기 · 체중 받기 · 지팡이 잔동작',description:'마지막 걸음에서 두 발을 차례로 짚고 몸이 먼저 멈춥니다. 가지 지팡이와 망토·머리카락이 뒤따라 안정되는 모습을 확인하세요.',source:'luna-stop.blend',command:'npm run models:luna-stop',action:'▶ 정지 동작',clip:'luna-stop-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'luna-reset',name:'루나 · 제자리 시전 회수',kind:'WOODLAND DRUID',detail:'고정된 발 · 지팡이 회수 · 망토 잔동작',description:'두 발을 짚은 채 몸의 반동을 먼저 정리하고 손목이 작은 호를 그리며 지팡이를 거둡니다. 망토와 머리카락이 뒤따라 멈추는 모습을 확인하세요.',source:'luna-reset.blend',command:'npm run models:luna-reset',action:'▶ 시전 회수',clip:'luna-reset-0',hold:true,fitBounds:true},
 {id:'luna-return',name:'루나 · 시전에서 걸음으로',kind:'WOODLAND DRUID',detail:'체중 회수 · 지팡이 손·망토 회수 · 보행 복귀',description:'마법탄을 보낸 뒤 몸이 먼저 돌아오고 손·머리카락·망토가 뒤따릅니다. 복귀 걸음을 바꿔 다음 발 디딤을 확인하세요.',source:'luna-return.blend',command:'npm run models:luna-return',action:'▶ 보행 복귀',clip:'luna-return-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'luna-entry',name:'루나 · 걸음에서 지팡이 시전으로',kind:'WOODLAND DRUID',detail:'차례로 발 디디기 · 소매와 손 연결 · 지팡이 준비',description:'걷던 발을 차례로 짚고 지팡이를 들어 시전을 준비합니다. 여덟 출발 자세와 지팡이를 든 손, 넓은 소매가 이어지는 모습을 확인하세요.',source:'luna-entry.blend',command:'npm run models:luna-entry',action:'▶ 시전 진입',clip:'luna-entry-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'cheongun-entry',name:'청운 · 걸음에서 부적 시전으로',kind:'TALISMAN CASTER',detail:'차례로 발 디디기 · 소매와 손 연결 · 부적 준비',description:'걷던 발을 차례로 짚고 부적을 들어 시전을 준비합니다. 여덟 출발 자세와 부적을 든 손, 넓은 소매가 이어지는 모습을 확인하세요.',source:'cheongun-entry.blend',command:'npm run models:cheongun-entry',action:'▶ 시전 진입',clip:'cheongun-entry-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'ian-entry',name:'이안 · 걸음에서 시전으로',kind:'ARCANE MAGE',detail:'발 디디기 · 체중 받기 · 지팡이 준비',description:'마지막 걸음에서 두 발을 차례로 짚고 지팡이에 힘을 모읍니다. 출발 걸음을 바꿔 준비 자세를 확인하세요. 마법탄 발사와 회수는 기존 시전과 같습니다.',source:'ian-entry.blend',command:'npm run models:ian-entry',action:'▶ 시전 진입',clip:'ian-entry-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'dwarf-stop',name:'브론 · 발 디디며 멈추기',kind:'IRON GUARDIAN',detail:'한 발씩 접지 · 체중 받기 · 망치 관성',description:'마지막 걸음에서 한 발씩 지면을 짚고 몸을 안정시킵니다. 무거운 망치는 몸보다 늦게 흔들림을 멈춥니다. 출발 걸음을 바꾸어 확인하세요.',source:'dwarf-stop.blend',command:'npm run models:dwarf-stop',action:'▶ 정지 동작',clip:'dwarf-stop-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'cheongun-stop',name:'청운 · 발 디디며 멈추기',kind:'TALISMAN CASTER',detail:'한 발씩 접지 · 체중 받기 · 도포·부적 잔동작',description:'마지막 걸음에서 한 발씩 지면을 짚고 몸을 안정시킵니다. 도포와 부적 끝은 몸보다 늦게 흔들림을 멈춥니다. 출발 걸음을 바꾸어 확인하세요.',source:'cheongun-stop.blend',command:'npm run models:cheongun-stop',action:'▶ 정지 동작',clip:'cheongun-stop-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'ian-stop',name:'이안 · 발 디디며 멈추기',kind:'ARCANE MAGE',detail:'한 발씩 접지 · 체중 정리 · 지팡이 복귀',description:'선택한 걸음 자세에서 한 발을 내려놓고, 그 발로 버티며 반대 발을 정리합니다. 여덟 가지 출발 자세를 바꾸어 확인하세요.',source:'ian-stop.blend',command:'npm run models:ian-stop',action:'▶ 정지 동작',clip:'ian-stop-0',hold:true,stopVariants:true},
 {id:'ian-mage-walk',name:'이안 · 방향 보행',kind:'ARCANE MAGE',detail:'가죽 장화 · 코트 자락 · 발 접지',description:'발의 지지와 회수를 번갈아 연결하고 망토와 팔이 작게 따라 움직입니다. 전투의 여덟 방향도 같은 원본에서 렌더합니다.',source:'ian-mage-walk.blend',command:'npm run models:mage',action:'▶ 보행 재생',clip:'ian-walk',loop:true},
 {id:'lightning-tower',asset:'lightning-tower-action',clip:'lightning-conductor-release',name:'뇌전 수정탑',kind:'LIGHTNING CONDUCTOR TOWER',detail:'푸른 수정 · 청동 전극 · 강철 고리',description:'중앙 수정과 피뢰침은 고정된 채 양옆 전극이 안으로 모여 충전합니다. 방출할 때 전극과 고리가 펼쳐졌다 복귀하고, 석조 기초는 움직이지 않습니다.',source:'lightning-tower-action.blend',command:'npm run models:lightning-action',action:'▶ 전극 방출'},
 {id:'lightning-tower-lv3',asset:'lightning-tower-lv3-action',clip:'lightning-crown-release',name:'뇌전 수정탑 · 최종 강화',kind:'ASCENDED LIGHTNING TOWER',detail:'금빛 이중 고리 · 여섯 전하 구슬 · 고정 첨탑',description:'큰 금빛 고리가 올라가며 안쪽 고리와 전극을 향해 힘을 모읍니다. 두 고리가 반대 방향으로 펼쳐져 방출한 뒤 돌아오고, 네 첨탑과 중앙 수정·기초는 고정됩니다.',source:'lightning-tower-lv3-action.blend',command:'npm run models:lightning-action-lv3',action:'▶ 이중 고리 방출'},
 {id:'fire-tower',asset:'fire-tower-action',clip:'fire-core-release',name:'화염 수정탑',kind:'ELEMENTAL TOWER',detail:'돌 · 청동 · 발광 수정',description:'석조 기초는 고정된 채 수정이 낮아지며 충전합니다. 청동 지지대가 펼쳐지고 수정이 솟아 불꽃을 방출한 뒤 제자리로 돌아옵니다.',source:'fire-tower-action.blend',command:'npm run models:fire-action',action:'▶ 수정 방출'},
 {id:'fire-tower-lv3',asset:'fire-tower-lv3-action',clip:'fire-core-release',name:'화염 수정탑 · 최종 강화',kind:'ASCENDED FIRE TOWER',detail:'금빛 고리 · 불씨 구슬 · 고정 첨탑',description:'금빛 고리가 기울며 수정을 향해 힘을 모읍니다. 방출할 때 고리와 청동 지지대가 펼쳐지고, 수정이 솟은 뒤 천천히 복귀합니다. 네 첨탑과 석조 기초는 고정됩니다.',source:'fire-tower-lv3-action.blend',command:'npm run models:fire-action-lv3',action:'▶ 고리 방출'},
 {id:'rapid-crossbow-lv3',asset:'rapid-crossbow-lv3-action',clip:'rapid-feed-release',name:'연발 석궁 · 최종 강화',kind:'ASCENDED REPEATING CROSSBOW',detail:'금장 활대 · 세 갈래 화살 · 계단식 장전 밀대',description:'금장 활대와 세 갈래 화살이 함께 조준합니다. 발사 후 시위와 탄창을 되감고, 세 손가락 장전 밀대가 레일을 따라 움직입니다. 붉은 깃발과 목재 기초는 고정됩니다.',source:'rapid-crossbow-lv3-action.blend',command:'npm run models:rapid-action-lv3',action:'▶ 최종 장전'},
 {id:'rapid-crossbow',asset:'rapid-crossbow-action',clip:'rapid-feed-release',name:'연발 석궁',kind:'REPEATING CROSSBOW',detail:'붉은 깃 탄창 · 강철 이송 레일 · 장전 레버',description:'목재 기초를 고정한 채 상부가 조준합니다. 시위가 풀린 뒤 장전 레버와 되감기 바퀴가 움직이고 탄창이 이송 레일을 따라 왕복하며 다음 화살을 준비합니다.',source:'rapid-crossbow-action.blend',command:'npm run models:rapid-action',action:'▶ 연발 장전'},
 {id:'piercing-ballista',asset:'piercing-ballista-action',clip:'ballista-release',name:'관통 발리스타',kind:'SIEGE WEAPON',detail:'오크 · 황동 · 강철',description:'석재 기초를 고정한 채 상부가 조준합니다. 활대와 시위가 풀리며 관통탄을 발사하고, 시위를 다시 당겨 다음 탄을 장전합니다.',source:'piercing-ballista-action.blend',command:'npm run models:ballista-action',action:'▶ 시위 발사'},
 {id:'piercing-ballista-lv3',asset:'piercing-ballista-lv3-action',clip:'ballista-release',name:'관통 발리스타 · 최종 강화',kind:'SIEGE WEAPON',detail:'금장 활대 · 부채꼴 관통탄 · 고정 기초',description:'금장 활대와 세 갈래 장전탄이 상부와 함께 조준합니다. 시위 이완과 재장전 사이에도 깃발·기초는 고정됩니다.',source:'piercing-ballista-lv3-action.blend',command:'npm run models:ballista-action-lv3',action:'▶ 시위 발사'},
 {id:'crush-cannon-lv3',asset:'crush-cannon-lv3-action',clip:'crush-cannon-fire',name:'파쇄포 · 최종 강화',kind:'ASCENDED SIEGE CANNON',detail:'금장 포구 · 돌 포탄 · 넓은 반동 레일',description:'금장 포신과 돌 포탄 적재대가 함께 조준합니다. 포신·피스톤·황동 받침이 넓은 레일을 따라 뒤로 밀리고 천천히 돌아옵니다. 기초와 붉은 깃발은 고정됩니다.',source:'crush-cannon-lv3-action.blend',command:'npm run models:crush-action-lv3',action:'▶ 중포 반동'},
 {id:'base-magic',asset:'base-magic-action',clip:'base-magic-release',name:'기본 마법탑',kind:'CRYSTAL TOWER',detail:'푸른 수정 · 밝은 석재 · 황금 고리',description:'석재 기초 위의 수정이 힘을 모아 떠오르고 금속 고리가 움직입니다. 발사 뒤 원래 위치로 돌아갑니다.',source:'base-magic-action.blend',command:'npm run models:base-magic-action',action:'▶ 마력 발사'},
 {id:'base-crossbow',asset:'base-crossbow-action',clip:'base-crossbow-release',name:'기본 석궁탑',kind:'FIELD CROSSBOW',detail:'석재 기초 · 오크 활대 · 푸른 깃발',description:'석재 기초는 고정하고 상부 활대가 표적을 향합니다. 시위와 활대가 풀려 화살을 발사한 뒤 다시 장전합니다.',source:'base-crossbow-action.blend',command:'npm run models:base-crossbow-action',action:'▶ 석궁 발사'},
 {id:'base-cannon',asset:'base-cannon-action',clip:'base-cannon-fire',name:'기본 포격탑',kind:'FIELD CANNON',detail:'석재 기초 · 오크 포대 · 철제 포신',description:'고정된 석재 기초 위에서 포대가 적을 향하고 철제 포신이 발사 뒤에 밀렸다가 제자리로 돌아옵니다.',source:'base-cannon-action.blend',command:'npm run models:base-cannon-action',action:'▶ 포격 동작'},
 {id:'crush-cannon',asset:'crush-cannon-action',clip:'crush-cannon-fire',name:'파쇄포',kind:'SIEGE CANNON',detail:'현무암 포신 · 쌍 완충 피스톤 · 돌 포탄 적재대',description:'목재 기초를 고정한 채 포대가 조준합니다. 포탄을 내보내면 무거운 포신과 양옆 피스톤이 뒤로 밀리고, 고정된 완충통 안에서 천천히 제자리로 돌아옵니다.',source:'crush-cannon-action.blend',command:'npm run models:crush-action',action:'▶ 파쇄 포격'},
 {id:'water-cannon',asset:'water-cannon-action',clip:'water-cannon-fire',name:'물폭탄포',kind:'HYDRAULIC TOWER',detail:'황동 · 유리 · 물',description:'원형 기초 위에서 물탱크·배관·포신이 함께 조준합니다. 발사할 때 포신만 뒤로 밀리고 천천히 복귀합니다.',source:'water-cannon-action.blend',command:'npm run models:water-action',action:'▶ 발사 동작'},
 {id:'water-cannon-lv3',asset:'water-cannon-lv3-action',clip:'water-cannon-fire',name:'물폭탄포 · 최종 강화',kind:'HYDRAULIC TOWER',detail:'황동 · 유리 · 물',description:'수정 왕관·금빛 궤도 링이 수조와 함께 조준합니다. 깃발과 받침대는 고정되고, 금장 포신만 뒤로 밀렸다가 복귀합니다.',source:'water-cannon-lv3-action.blend',command:'npm run models:water-action-lv3',action:'▶ 발사 동작'},
 {id:'dwarf-return',name:'브론 · 강타에서 걸음으로',kind:'DWARF GUARDIAN',detail:'망치 회수 · 방패 정리 · 다음 걸음',description:'강타의 반동을 받은 뒤 몸을 세우고 무거운 망치가 뒤따라 올라옵니다. 복귀 걸음을 바꿔 다음 발 디딤을 확인하세요.',source:'dwarf-return.blend',command:'npm run models:dwarf-return',action:'▶ 보행 복귀',clip:'dwarf-return-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'kar-stop',name:'카르 · 발 디디며 멈추기',kind:'WINTER WARRIOR',detail:'차례로 발 디디기 · 체중 받기 · 망치 잔동작',description:'마지막 걸음에서 두 발을 차례로 짚고 몸통이 먼저 멈춥니다. 양손으로 든 망치와 모피·수염이 뒤따라 안정되는 모습을 확인하세요.',source:'kar-stop.blend',command:'npm run models:kar-stop',action:'▶ 정지 동작',clip:'kar-stop-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'kar-reset',name:'카르 · 제자리 강타 회수',kind:'WINTER WARRIOR',detail:'고정된 발 · 양손 망치 회수 · 모피 잔동작',description:'두 발을 짚은 채 몸통이 먼저 안정되고 무거운 망치와 모피가 뒤따라 멈춥니다. 양손 그립과 망치 머리의 복귀 궤적을 확인하세요.',source:'kar-reset.blend',command:'npm run models:kar-reset',action:'▶ 강타 회수',clip:'kar-reset-0',hold:true,fitBounds:true},
 {id:'kar-return',name:'카르 · 강타에서 걸음으로',kind:'WINTER WARRIOR',detail:'체중 회수 · 양손 망치 관성 · 다음 걸음',description:'강타의 반동을 받은 몸이 먼저 일어서고 무거운 망치와 털망토가 뒤따릅니다. 복귀 걸음을 바꿔 양손 그립과 다음 발 디딤을 확인하세요.',source:'kar-return.blend',command:'npm run models:kar-return',action:'▶ 보행 복귀',clip:'kar-return-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'kar-entry',name:'카르 · 걸음에서 강타로',kind:'WINTER WARRIOR',detail:'차례로 발 디디기 · 양손 그립 · 망치 끌어올리기',description:'걷던 발을 차례로 짚고 두 손으로 무거운 망치를 들어 올립니다. 여덟 출발 자세에서 손과 망치가 이어지는 모습을 확인하세요.',source:'kar-entry.blend',command:'npm run models:kar-entry',action:'▶ 강타 진입',clip:'kar-entry-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'dwarf-entry',name:'브론 · 걸음에서 강타로',kind:'DWARF GUARDIAN',detail:'발 디디기 · 체중 받기 · 망치 끌어올리기',description:'마지막 걸음에서 두 발을 차례로 짚고 망치를 들어 올립니다. 출발 걸음을 바꿔 준비 자세를 확인하세요. 내려치는 순간과 반동은 기존 강타와 같습니다.',source:'dwarf-entry.blend',command:'npm run models:dwarf-entry',action:'▶ 강타 진입',clip:'dwarf-entry-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'dwarf-guardian',asset:'dwarf-hammer-sequence',name:'브론 · 드워프 공병',kind:'DWARF GUARDIAN',detail:'강철 · 청동 · 가죽',description:'두 발을 짚고 망치를 끌어올린 뒤 내려칩니다. 몸통과 팔꿈치가 무게를 받아 짧게 반동하고, 망치를 회수해 중립 자세로 돌아옵니다.',source:'dwarf-hammer-sequence.blend',command:'npm run models:dwarf-hammer',action:'▶ 망치 강타',clip:'dwarf-hammer-sequence'},
 {id:'dwarf-locomotion',name:'브론 · 방향 보행',kind:'DWARF LOCOMOTION',detail:'발 접지 · 무거운 망치 · 방향 보행',description:'두 발의 지지와 회수를 엇갈리며 걷습니다. 전투에서는 같은 원본을 여덟 방향으로 렌더해 망치와 방패의 손을 유지합니다.',source:'dwarf-locomotion.blend',command:'npm run models:dwarf-locomotion',action:'▶ 보행 재생',clip:'dwarf-walk',loop:true},
 {id:'metal-soldier-walk',name:'금속 병사 · 무거운 행군',kind:'METAL SOLDIER',detail:'갑옷 발 접지 · 금속 어깨 · 체중 이동',description:'둥근 금속 갑옷을 유지하며 양발을 번갈아 지탱하고 무거운 팔이 한 박자 뒤따릅니다. 실제 이동 거리에 맞춰 전투 보행을 재생합니다.',source:'metal-soldier-walk.blend',command:'npm run models:metal-walk',action:'▶ 행군 재생',clip:'metal-soldier-walk',loop:true,fitBounds:true},
 {id:'metal-soldier-death',name:'금속 병사 · 갑옷 붕괴',kind:'METAL SOLDIER',detail:'투구와 갑옷 분리 · 무게감 있는 착지',description:'금속 병사가 쓰러질 때 원본 갑옷 부품이 움직이며 바닥에 쌓입니다. 전투에서는 처치 판정과 보상이 즉시 확정되고 이 자세는 짧은 잔상으로 재생됩니다.',source:'metal-soldier-death.blend',command:'npm run models:metal-death',action:'▶ 갑옷 붕괴',clip:'metal-soldier-death',hold:true,fitBounds:true},
 {id:'ice-knight-walk',name:'빙결 기사 · 검을 든 행군',kind:'ICE KNIGHT',detail:'교대 발 접지 · 얼음검 · 무게 이동',description:'얼음 갑옷을 입고 양발을 번갈아 디디며 검을 든 팔이 몸을 따라 움직입니다. 검은 손에 고정됩니다.',source:'ice-knight-walk.blend',command:'npm run models:ice-walk',action:'▶ 행군 재생',clip:'ice-knight-walk',loop:true,fitBounds:true},
 {id:'stone-golem-walk',name:'돌 갑옷병 · 무거운 걸음',kind:'STONE GOLEM',detail:'발목 접지 · 몸의 체중 이동 · 큰 돌주먹',description:'발목을 굽히고 두 발을 번갈아 디디며 넓은 몸과 돌주먹이 뒤따릅니다. 전투 보행은 이동 거리에 맞춰 재생됩니다.',source:'stone-golem-walk.blend',command:'npm run models:golem-walk',action:'▶ 무거운 걸음',clip:'stone-golem-walk',loop:true,fitBounds:true},
 {id:'ice-knight-death',name:'빙결 기사 · 갑옷 파쇄',kind:'FROST KNIGHT',detail:'분리된 몸통 · 투구 · 얼음검',description:'얼음 몸통이 실제 상·하 메시로 나뉘고 투구와 검을 든 팔이 내려앉습니다. 전투에서는 처치와 보상을 즉시 확정한 뒤 짧은 잔상을 재생합니다.',source:'ice-knight-death.blend',command:'npm run models:ice-death',action:'▶ 얼음 갑옷 파쇄',clip:'ice-knight-death',hold:true,fitBounds:true},
 {id:'stone-golem-death',name:'돌 갑옷병 · 바위 붕괴',kind:'STONE GOLEM',detail:'돌 몸통·거대한 주먹의 착지',description:'넓은 돌 몸통이 나뉘고 주먹과 머리가 천천히 바닥으로 내려앉습니다. 처치 판정과 보상은 즉시 확정됩니다.',source:'stone-golem-death.blend',command:'npm run models:golem-death',action:'▶ 바위 붕괴',clip:'stone-golem-death',hold:true,fitBounds:true},
 {id:'wood-soldier-death',name:'나무 병사 · 통나무 붕괴',kind:'LIVING LOG SOLDIER',detail:'몸통·가지 분리 · 손에 남은 몽둥이',description:'기존 나무 병사의 몸통과 관절이 지면에 내려앉고 쥔 통나무가 함께 움직입니다. 전투 판정과 보상은 즉시 확정되며 동작은 짧은 잔상으로 재생됩니다.',source:'wood-soldier-death.blend',command:'npm run models:wood-death',action:'▶ 통나무 붕괴',clip:'wood-soldier-death',hold:true,fitBounds:true},
 {id:'wood-soldier',name:'나무 병사 · 통나무 파수꾼',kind:'LIVING LOG SOLDIER',detail:'주황 목재 · 초록 눈 · 통나무 몽둥이',description:'곧게 선 몸과 밝은 나이테, 손에 쥔 통나무 몽둥이로 돌 병사와 구분합니다. 무기를 든 팔은 작게 움직이고 손목과 잎이 뒤따릅니다.',source:'wood-soldier.blend',command:'npm run models:wood',action:'▶ 보행 재생',clip:'wood-soldier-walk',loop:true},
 {id:'frost-wolf-brace-fall',name:'서리늑대 · 버티다 쓰러짐',kind:'SILVERFROST WOLF',detail:'버티던 발 · 낮아지는 몸 · 마지막 자세',description:'버티던 몸을 다시 세우지 않고 그 자세에서 힘을 잃고 쓰러집니다. 밀림 세기와 출발 걸음을 바꾸어 확인하세요.',source:'frost-wolf-brace-fall.blend',command:'npm run models:wolf-brace-fall',action:'▶ 쓰러짐 재생',clip:'frost-wolf-brace-fall-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'frost-wolf-brace',name:'서리늑대 · 밀림 버티기',kind:'SILVERFROST WOLF',detail:'넓힌 발 · 낮은 몸 · 걸음으로 복귀',description:'앞을 향한 채 발을 벌리고 몸을 낮춰 밀림을 버팁니다. 힘이 줄어들면 처음 걸음으로 돌아옵니다.',source:'frost-wolf-brace.blend',command:'npm run models:wolf-brace',action:'▶ 버티기 재생',clip:'frost-wolf-brace-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'frost-wolf-fall',name:'서리늑대 · 걸음에서 쓰러짐',kind:'SILVERFROST WOLF',detail:'들린 발 내려놓기 · 무릎과 몸의 무게',description:'걷던 방향을 유지하며 들린 발을 내려놓고 몸을 낮춥니다. 출발 걸음을 바꿔 발 디딤과 쓰러진 자세를 확인하세요.',source:'frost-wolf-fall.blend',command:'npm run models:wolf-fall',action:'▶ 쓰러짐 재생',clip:'frost-wolf-fall-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'frost-wolf-flinch',name:'서리늑대 · 걸음 위 피격',kind:'SILVERFROST WOLF',detail:'발 위치 유지 · 목과 몸의 충격 흡수',description:'앞을 향한 채 몸과 목으로 충격을 받고 같은 걸음으로 돌아옵니다. 피격 걸음을 바꿔 발 디딤을 확인하세요.',source:'frost-wolf-flinch.blend',command:'npm run models:wolf-flinch',action:'▶ 피격 재생',clip:'frost-wolf-flinch-0',hold:true,stopVariants:true,fitBounds:true},
 {id:'frost-wolf-stride',fitBounds:true,name:'서리늑대 · 접지 보행',kind:'SILVERFROST WOLF',detail:'평평한 발 · 무릎과 발목 · 방향 보행',description:'대각선 발을 짝지어 땅을 밀고, 무릎과 발목을 굽혀 다음 발을 내딛습니다. 전투에서도 방향별 보폭과 이동 거리를 맞춰 같은 보행을 사용합니다.',source:'frost-wolf-stride.blend',command:'npm run models:wolf-stride',action:'▶ 보행 재생',clip:'frost-wolf-stride',loop:true},
 {id:'frost-wolf',name:'서리늑대 · 은서리 야수',kind:'SILVERFROST WOLF',detail:'회백색 털 · 짙은 발 · 청백색 눈',description:'은서리 늑대 컨셉의 낮은 몸과 긴 다리를 전투 크기에 맞췄습니다. 대각선으로 짝을 이루는 발의 접지와 목·꼬리의 후속 움직임을 확인하세요.',source:'frost-wolf.blend',command:'npm run models:wolf',action:'▶ 보행 재생',clip:'frost-wolf-trot',loop:true},
 {id:'frost-wolf-collapse',name:'서리늑대 · 쓰러짐',kind:'SILVERFROST WOLF',detail:'접지 · 무릎 관절 · 몸의 무게',description:'네 발의 접지를 유지하며 무릎과 몸이 낮아집니다. 쓰러진 자세를 유지해 보행·피격 자세와 구분합니다.',source:'frost-wolf-collapse.blend',command:'npm run models:wolf-collapse',action:'▶ 쓰러짐 재생',clip:'frost-wolf-collapse',hold:true},
 {id:'forest-gate',asset:'forest-gate-impact',clip:'forest-gate-impact',name:'녹음 성문 · 뿌리 아치',kind:'VERDANT GATEHOUSE',detail:'석조 아치 · 고목 뿌리 · 초록 지붕',description:'석조 아치와 기초는 고정되고 목재 상부와 등불이 침입 충격에 반응합니다. 가벼운 등불은 더 크게 흔들린 뒤 제자리로 돌아옵니다.',source:'forest-gate-impact.blend',command:'npm run models:forest-gate-impact',action:'▶ 침입 충격'},
 {id:'forest-bridge',static:true,name:'숲 마을 교량',kind:'VILLAGE CROSSING',detail:'석조 아치 · 목재 상판',description:'석재 아치와 교대가 목재 상판을 받칩니다. 앞 난간을 별도로 렌더해 전투에서 유닛과 앞뒤가 맞도록 표시합니다.',source:'forest-bridge.blend',command:'npm run models:bridge',action:'정적 구조물'},
];
const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const stage = $<HTMLDivElement>('model-stage'), status = $<HTMLParagraphElement>('model-loading'), fallback = $<HTMLImageElement>('model-fallback');
const shoot = $<HTMLButtonElement>('attack-preview'), rotate = $<HTMLButtonElement>('auto-rotate'), wire = $<HTMLButtonElement>('wireframe'), reset = $<HTMLButtonElement>('reset-view');
const idleButton=$<HTMLButtonElement>('idle-preview'),pose=$<HTMLInputElement>('pose-progress'),hit=$<HTMLButtonElement>('hit-preview');
let idleRig:ReturnType<typeof createBronIdle> = null,idleEnabled=false;
let renderer:WebGLRenderer|null = null, controls:OrbitControls|null = null, current:Group|null = null, mixer:AnimationMixer|null = null, attackAction:AnimationAction|null = null, hitAction:AnimationAction|null = null;
const stopLabel=document.createElement('label');stopLabel.className='lab-stop-phase';stopLabel.textContent='출발 걸음 ';stopLabel.hidden=true;
const stopSelect=document.createElement('select');stopSelect.setAttribute('aria-label','정지 동작 출발 걸음');
for(let i=0;i<8;i++){const option=document.createElement('option');option.value=String(i);option.textContent=`걸음 ${i+1}`;stopSelect.append(option);}
stopLabel.append(stopSelect);shoot.parentElement?.append(stopLabel);
stopSelect.onchange=()=>{void select(models.findIndex(model=>model.id===currentModelId));};
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
// Match the dwarf render's front three-quarter view so its hammer clears the face.
function resetView() {pivot.rotation.y = (currentModelId==='polar-bear'||currentModelId==='gecko-ranger'||currentModelId.startsWith('kar-')||currentModelId.startsWith('dwarf-')||currentModelId.startsWith('ian-')||currentModelId.startsWith('riel-')||currentModelId.startsWith('cheongun-')||currentModelId.startsWith('luna-')||currentModelId.startsWith('moonlight-'))?-1.85:0;camera.position.set(8.3,6.5,10.3);controls?.target.set(0,currentModelId==='forest-bridge'?1:2.0,0);if(controls)controls.maxDistance=22;controls?.update();fitModelView();}
/** A long quadruped needs its horizontal silhouette fitted on portrait displays too. */
function fitModelView() {
 if(!current||!controls||!models.find(model=>model.id===currentModelId)?.fitBounds)return;
 pivot.updateMatrixWorld(true);
 const bounds=new Box3().setFromObject(current),center=bounds.getCenter(new Vector3()),radius=bounds.getSize(new Vector3()).length()/2;
 const vertical=camera.fov*Math.PI/360,halfFov=Math.min(vertical,Math.atan(Math.tan(vertical)*camera.aspect));
 const distance=radius/Math.sin(halfFov)*1.08,direction=camera.position.clone().sub(controls.target).normalize();
 controls.maxDistance=Math.max(22,distance*1.5);controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);controls.update();
}
function stopAction() {
 attackAction?.stop();hitAction?.stop();idleRig?.restore();idleEnabled=false;idleButton.setAttribute('aria-pressed','false');$('motion-state').textContent='REST · 기본 자세';baseColors.forEach((color,material)=>material.color.copy(color));pose.value='0';$('pose-value').textContent='0%';shotAt = -Infinity; stage.dataset.action = 'idle'; shoot.textContent=models.find(model=>model.id===currentModelId)?.action??'▶ 동작 재생'; redraw = true;
}
function clearModel() {
 stopAction(); idleRig = null;
 mixer?.stopAllAction();
 if(mixer)mixer.uncacheRoot(mixer.getRoot());
 attackAction = null; hitAction = null; mixer = null;
 if(current){pivot.remove(current);release(current);current = null;}
 parts.length = 0; currentMaterials = []; emissionLevels.clear(); baseColors.clear(); pivot.rotation.y = 0; stopAction();
}
function setReady(ready:boolean) {
 $('motion-review').hidden=currentModelId!=='dwarf-guardian';
 idleButton.disabled=!ready||!idleRig||reduced.matches;
 document.querySelectorAll<HTMLButtonElement>('[data-review-pose]').forEach(button=>{button.disabled=!ready||!attackAction;});
 $('pose-control').hidden=!ready||!attackAction;
 hit.hidden=!['polar-bear','gecko-ranger'].includes(currentModelId);hit.disabled=!ready||!hitAction||reduced.matches;
 const missingAttack = !!models.find(model=>model.id===currentModelId)?.clip&&!attackAction;
 const staticModel=!!models.find(model=>model.id===currentModelId)?.static;
 shoot.hidden=staticModel;shoot.disabled = staticModel || !ready || reduced.matches || missingAttack;
 rotate.disabled = !ready || reduced.matches;
 wire.disabled = !ready; reset.disabled = !ready;
 shoot.title = reduced.matches?'동작 줄이기 설정으로 공격 모션을 멈췄어요.':ready&&missingAttack?'이 모델에 재생할 모션이 없습니다.':'';
 rotate.title = reduced.matches?'동작 줄이기 설정으로 자동 회전을 멈췄어요.':'';
}
function showMissingPreview() {
 if(stage.dataset.loaded!=='fallback')return;
 fallback.hidden=true;$('model-format').textContent='미리보기 없음';$('model-hint').textContent='모델을 다시 선택해 재시도하세요.';
 status.textContent='3D 모델과 미리보기 이미지를 불러오지 못했습니다. 모델을 다시 선택해 재시도하세요.';status.hidden=false;
}
fallback.addEventListener('error',showMissingPreview);
function showFallback(message:string) {
 fallback.hidden = false; stage.dataset.loaded = 'fallback';
 $('model-format').textContent = 'PNG · 렌더 이미지';
 $('model-hint').textContent = '선택한 모델의 정사영 렌더 이미지';
 status.textContent = message; status.hidden = false;
 setReady(false); redraw = true;
 if(fallback.complete&&fallback.naturalWidth===0)showMissingPreview();
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
 const resize = () => {if(!renderer)return;renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect = stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();fitModelView();redraw = true;};
 new ResizeObserver(resize).observe(stage); resize();
} catch {
 renderer?.domElement.remove(); renderer?.dispose(); renderer = null;
}

async function select(index:number) {
 const ticket = ++generation, model = models[index]; currentModelId = model.id;
 const braceFall=model.id==='frost-wolf-brace-fall',count=braceFall?24:8;
 if(stopSelect.options.length!==count){stopSelect.replaceChildren(...Array.from({length:count},(_,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=braceFall?`${['강한 버티기','중간 버티기','복귀 중'][Math.floor(i/8)]} · 걸음 ${i%8+1}`:`걸음 ${i+1}`;return option;}));}
 stopLabel.hidden=!model.stopVariants;
 stopLabel.firstChild!.textContent=braceFall?'출발 자세 ':model.id==='frost-wolf-flinch'?'피격 걸음 ':(model.id==='kar-return'||model.id==='riel-return'||model.id==='dwarf-return'||model.id==='ian-return'||model.id==='cheongun-return'||model.id==='luna-return')?'복귀 걸음 ':'출발 걸음 ';
 stopSelect.setAttribute('aria-label',braceFall?'버티다 쓰러짐 출발 자세':model.id==='frost-wolf-brace'?'버티기 출발 걸음':model.id==='frost-wolf-fall'?'쓰러짐 출발 걸음':model.id==='frost-wolf-flinch'?'피격 당시 걸음':(model.id==='dwarf-return'||model.id==='kar-return')?'강타 후 복귀 걸음':model.id==='riel-return'?'사격 후 복귀 걸음':(model.id==='dwarf-entry'||model.id==='kar-entry')?'강타 진입 출발 걸음':model.id==='riel-entry'?'사격 진입 출발 걸음':(model.id==='ian-entry'||model.id==='cheongun-entry'||model.id==='luna-entry')?'시전 진입 출발 걸음':(model.id==='ian-return'||model.id==='cheongun-return'||model.id==='luna-return')?'시전 후 복귀 걸음':'정지 동작 출발 걸음');
 setReady(false); status.hidden = false; status.textContent = '모델을 불러오는 중…';
 $('model-name').textContent = model.name; $('model-kind').textContent = model.kind; $('model-description').textContent = model.description;
 $('model-source').textContent = model.source; $('model-command').textContent = model.command; shoot.textContent = model.action;
 $('model-format').textContent = 'GLB · 실시간 3D'; $('model-hint').textContent = '드래그하여 회전 · 휠 또는 두 손가락으로 확대';
 fallback.src = `/defense/models/${model.asset??model.id}.png`; fallback.alt = `${model.name}의 정사영 렌더 이미지`; fallback.hidden = true;
 $<HTMLAnchorElement>('download-model').href = model.glb??`/defense/models/${model.asset??model.id}.glb`;
 document.querySelectorAll<HTMLButtonElement>('#model-list button').forEach((button,i) => {button.setAttribute('aria-pressed',String(i===index));if(i===index){const list=$('model-list');list.scrollLeft+=button.getBoundingClientRect().left-list.getBoundingClientRect().left;}});
 clearModel(); stage.dataset.loaded = 'loading';
 delete stage.dataset.renderCalls; delete stage.dataset.renderTriangles;
 for(const id of ['triangle-count','mesh-count','material-count'])$(id).textContent = '—';
 if(!renderer){showFallback('이 환경에서는 3D 화면을 열 수 없어 렌더 이미지를 표시합니다.');return;}
 try {
  const gltf = await loader.loadAsync(model.glb??`/defense/models/${model.asset??model.id}.glb`);
  if(ticket!==generation){release(gltf.scene);return;}
  // The Legion model faces the shared Blender camera; turn its scene toward the lab camera.
  if(model.id==='legion-shield'||model.id==='legion-shield-walk')gltf.scene.rotation.y=Math.PI;
  // Keep normalization outside the animated scene: clip tracks own their local transforms.
  current = new Group(); current.add(gltf.scene);
  const box = new Box3().setFromObject(current), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3()), scale = model.static?6.5/Math.max(size.x,size.y,size.z,.01):4.6/Math.max(size.y,.01);
  current.scale.setScalar(scale); current.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale); pivot.add(current);
  let triangles = 0, meshes = 0;
  current.traverse(node => {if(node instanceof Mesh){node.castShadow = true;node.receiveShadow = true;meshes++;triangles += (node.geometry.index?.count??node.geometry.attributes.position.count)/3;}});
  currentMaterials = [...materials(current)].filter((material):material is MeshStandardMaterial => material instanceof MeshStandardMaterial);
  currentMaterials.forEach(material => {material.wireframe = wireEnabled;material.envMapIntensity = .55;emissionLevels.set(material,material.emissiveIntensity);baseColors.set(material,material.color.clone());});
  for(const type of ['core','barrel','bolt','turret'] as const){const object = current.getObjectByName(type==='core'?'fire-core':type);if(object&&(type!=='core'||!model.clip))parts.push({object,position:object.position.clone(),rotation:new Vector3(object.rotation.x,object.rotation.y,object.rotation.z),type});}
  idleRig=model.id==='dwarf-guardian'?createBronIdle(gltf.scene):null;
  const clip = gltf.animations.find(animation => animation.name===(model.stopVariants?`${model.id}-${stopSelect.value}`:model.clip));
  if(clip){
   mixer = new AnimationMixer(gltf.scene); attackAction = mixer.clipAction(clip);
   attackAction.setLoop(model.loop?LoopRepeat:LoopOnce,model.loop?Infinity:1); attackAction.clampWhenFinished = true;
   const hitClip=createHitClip(model.id,gltf.scene);if(hitClip){hitAction=mixer.clipAction(hitClip);hitAction.setLoop(LoopOnce,1);}
   if(model.stopVariants){attackAction.play();mixer.setTime(0);attackAction.paused=true;}
   mixer.addEventListener('finished',event=>{if(event.action===hitAction)stopAction();else if(model.hold){stage.dataset.action='settled';redraw=true;}else stopAction();});
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
 stopAction();
 shotAt = elapsed; redraw = true; stage.dataset.action = looping?'walking':'firing';
 $('motion-state').textContent='ATTACK · 동작 재생';
 if(looping)shoot.textContent='■ 보행 멈춤';
 attackAction?.reset().play();
};
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
let reducedMode=reduced.matches;
function syncReducedMotion(){
 reducedMode=reduced.matches;
 if(reducedMode){automatic = false;rotate.setAttribute('aria-pressed','false');stopAction();}
 setReady(!!current); redraw = true;
}
reduced.addEventListener('change',syncReducedMotion);

document.addEventListener('visibilitychange',() => {last = performance.now();redraw = true;});

function draw(now:number) {
 // Some embedded browsers update matches before dispatching the change event.
 if(reducedMode!==reduced.matches)syncReducedMotion();
 const dt = Math.min(1,(now-last)/1000); last = now;
 if(!document.hidden){
  elapsed += dt;
  const autoMoving = automatic&&!reduced.matches&&!!current;
  if(autoMoving)pivot.rotation.y += dt*.28;
  const age = elapsed-shotAt, clipMoving = !!attackAction?.isRunning() || !!hitAction?.isRunning();
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
void select(requestedModel?Math.max(0,models.findIndex(model => model.id===requestedModel)):3); requestAnimationFrame(draw);
