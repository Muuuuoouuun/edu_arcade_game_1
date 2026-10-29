import type { Branch, Element, EnemyKind, HeroId, Point, Slot, StageDef, TowerKind } from './types.ts';

export type { StageDef } from './types.ts';
export const HERO_ORDER: HeroId[] = ['mage','elf','dwarf','tao','barbarian','druid'];
export const STAGE_COUNT = 8;
export const STAGES: StageDef[] = [
  { id:1,region:'forest',label:'1-1',chapter:1,order:1,expanded:false,climate:'clear', name:'숲 가장자리', weather:'맑은 숲', story:'작은 마을의 첫 방어. 길목에 타워를 세우고 수비대의 이름을 알려요.', quest:'마을 체력 15 이상으로 지키기', questReward:80, visitor:'elf',questType:'village',questGoal:15 },
  { id:2,region:'forest',label:'1-2',chapter:1,order:2,expanded:false,climate:'rain', name:'제재소 구조 작전', weather:'비 내리는 강가', story:'대장장이 브론이 고립됐어요. 젖은 적에게 번개를 연결하며 제재소를 지켜요.', quest:'마을 체력 15 이상으로 제재소 지키기', questReward:80, visitor:'dwarf',questType:'village',questGoal:15 },
  { id:3,region:'forest',label:'1-3',chapter:1,order:3,expanded:false,climate:'clear', name:'서리 낀 옛길', weather:'차가운 서리', story:'얼음 갑옷을 입은 적들이 내려와요. 불과 충격으로 길을 열면 낯선 도사가 찾아옵니다.', quest:'마을 체력 15 이상으로 옛길 확보', questReward:80, visitor:'tao',questType:'village',questGoal:15 },
  { id:4,region:'forest',label:'1-4',chapter:1,order:4,expanded:true,climate:'rain', name:'강 건너의 불빛', weather:'다가오는 뇌우', story:'강 건너 마을의 구조 요청! 두 진입로를 지키고 고목왕의 습격을 막아주세요.', quest:'강 건너 마을을 끝까지 보호하기', questReward:80, visitor:null,questType:'outpost',questGoal:1 },
  { id:5,region:'snow',label:'2-1',chapter:2,order:1,expanded:false,climate:'snow', name:'눈꽃 고갯길', weather:'눈 내리는 산길', story:'설산에서 구조 요청이 왔어요. 빙판을 달리는 서리늑대를 막으면 바바리안 전사가 찾아옵니다.',quest:'마을 체력 12 이상으로 고갯길 지키기',questReward:80,visitor:'barbarian',questType:'village',questGoal:12},
  { id:6,region:'snow',label:'2-2',chapter:2,order:2,expanded:false,climate:'snow', name:'늑대 무리의 습격',weather:'얼어붙은 협곡',story:'서리늑대 무리가 협곡으로 몰려와요. 빙판 앞에 화염과 충격 타워를 준비하세요.',quest:'몬스터 60마리 이상 격퇴하고 클리어',questReward:80,visitor:null,questType:'hunt',questGoal:60},
  { id:7,region:'snow',label:'2-3',chapter:2,order:3,expanded:false,climate:'blizzard', name:'영물의 발자국',weather:'짙어지는 눈보라',story:'길을 잃은 드루이드와 영물이 마을로 향하고 있어요. 방어선을 지켜 새로운 동료를 맞이하세요.',quest:'마을 체력 12 이상으로 영물 맞이하기',questReward:80,visitor:'druid',questType:'village',questGoal:12},
  { id:8,region:'snow',label:'2-4',chapter:2,order:4,expanded:true,climate:'blizzard', name:'서리 왕좌의 결전',weather:'서리군주의 눈보라',story:'산 너머 피난처까지 전장이 넓어졌어요. 서리군주의 충전을 필살기로 끊고 두 거점을 지켜요.',quest:'산 너머 피난처를 끝까지 보호하기',questReward:80,visitor:null,questType:'outpost',questGoal:1},
];
export function getStage(stage:number):StageDef { return STAGES.find(s=>s.id===stage) || STAGES[0]; }
export function getRegion(stage:number):'forest'|'snow' { return getStage(stage).region; }
export function stageLabel(stage:number):string { return getStage(stage).label; }

export const HEROES: Record<HeroId,{name:string;role:string;description:string;skill:string;sprite:number;color:string}> = {
  mage:{name:'이안',role:'인간 · 마법사',description:'나무를 태우고 얼음 갑옷을 녹이는 불꽃 공격.',skill:'유성 낙하',sprite:0,color:'#e4813f'},
  elf:{name:'리엘',role:'엘프 · 명사수',description:'가장 긴 사거리로 빠른 적을 추격해요.',skill:'별빛 화살비',sprite:1,color:'#73aa65'},
  dwarf:{name:'브론',role:'드워프 · 공병',description:'망치의 충격으로 돌과 얼음 갑옷을 부숴요.',skill:'대지 강타',sprite:2,color:'#c89b52'},
  tao:{name:'청운',role:'동방 · 도사',description:'번개 부적으로 금속과 젖은 적을 연결해요.',skill:'뇌운 결계',sprite:3,color:'#69afb8'},
  barbarian:{name:'카르',role:'바바리안 · 전사',description:'거대한 전투 망치로 가까운 적 무리와 얼음 갑옷을 부숴요.',skill:'산맥 가르기',sprite:16,color:'#ba7656'},
  druid:{name:'루나',role:'수인 · 드루이드',description:'늑대 영물이 별도로 공격하고 적의 발을 붙잡아요.',skill:'덩굴의 포효',sprite:17,color:'#7fa87d'},
};
export const TOWERS: Record<TowerKind,{name:string;cost:number;description:string;sprite:number}> = {
  crossbow:{name:'석궁탑',cost:70,description:'빠르고 안정적인 단일 공격',sprite:4},
  magic:{name:'마법탑',cost:90,description:'불꽃과 번개로 갈라지는 속성 공격',sprite:5},
  cannon:{name:'포격탑',cost:110,description:'주변 적 최대 2명까지 휩쓰는 충격 포격',sprite:6},
};
export const BRANCHES: Record<Branch,{name:string;element:Element;description:string}> = {
  pierce:{name:'관통 석궁',element:'physical',description:'강한 한 발로 뒤쪽 적까지 관통'},
  rapid:{name:'연발 석궁',element:'physical',description:'공격 속도가 크게 증가'},
  fire:{name:'화염탑',element:'fire',description:'나무·얼음 약점 공격 + 연소'},
  lightning:{name:'뇌전탑',element:'lightning',description:'금속·젖은 적을 타고 연쇄 번개'},
  crush:{name:'파쇄포',element:'impact',description:'돌·얼음 약점 공격 · 주변 2명에 폭발 피해'},
  water:{name:'물폭탄포',element:'water',description:'가까운 적 3명까지 둔화 + 젖음 부여'},
};
export const ENEMIES: Record<EnemyKind,{name:string;hp:number;speed:number;elementHint:string;sprite:number}> = {
  sprout:{name:'새싹 도적',hp:72,speed:48,elementHint:'불 약점 · 물 내성',sprite:8},
  wood:{name:'나무 병사',hp:155,speed:28,elementHint:'불 약점 · 물 내성',sprite:9},
  ice:{name:'빙결 기사',hp:180,speed:34,elementHint:'불·충격 약점',sprite:10},
  stone:{name:'돌 갑옷병',hp:245,speed:23,elementHint:'충격 약점 · 불 내성',sprite:11},
  metal:{name:'금속 병사',hp:155,speed:37,elementHint:'전기 전도 · 연쇄 연결',sprite:12},
  insulator:{name:'절연 슬라임',hp:100,speed:51,elementHint:'전기 내성 · 연쇄 차단',sprite:13},
  boss:{name:'고목왕',hp:2500,speed:19,elementHint:'불 약점 · 체력 절반에 돌진',sprite:14},
  frostwolf:{name:'서리늑대',hp:110,speed:57,elementHint:'불 약점 · 빙판에서 가속',sprite:19},
  frostboss:{name:'서리군주',hp:3200,speed:17,elementHint:'불·충격 약점 · 필살기로 충전 차단',sprite:20},
};
export const PATHS: Point[][] = [
  [{x:0,y:170},{x:130,y:170},{x:230,y:285},{x:410,y:285},{x:520,y:430},{x:730,y:430},{x:820,y:300},{x:900,y:300}],
  [{x:380,y:0},{x:380,y:150},{x:520,y:235},{x:730,y:235},{x:820,y:115},{x:900,y:115}],
];
export const SLOTS: Slot[] = [
  {id:0,x:170,y:110,terrain:'high',unlock:1},
  {id:1,x:220,y:380,terrain:'plain',unlock:1},
  {id:2,x:380,y:205,terrain:'plain',unlock:1},
  {id:3,x:500,y:335,terrain:'plain',unlock:1},
  {id:4,x:650,y:515,terrain:'water',unlock:1},
  {id:5,x:780,y:340,terrain:'high',unlock:1},
  {id:6,x:540,y:130,terrain:'plain',unlock:4},
  {id:7,x:750,y:165,terrain:'water',unlock:4},
];

export const SNOW_PATHS: Point[][] = [
  [{x:0,y:150},{x:200,y:150},{x:290,y:320},{x:510,y:320},{x:620,y:455},{x:790,y:455},{x:850,y:300},{x:900,y:300}],
  [{x:370,y:0},{x:370,y:180},{x:590,y:180},{x:760,y:115},{x:900,y:115}],
];
export const SNOW_SLOTS: Slot[] = [
  {id:0,x:190,y:90,terrain:'high',unlock:5},
  {id:1,x:250,y:410,terrain:'plain',unlock:5},
  {id:2,x:415,y:235,terrain:'ice',unlock:5},
  {id:3,x:560,y:345,terrain:'high',unlock:5},
  {id:4,x:675,y:530,terrain:'plain',unlock:5},
  {id:5,x:800,y:350,terrain:'high',unlock:5},
  {id:6,x:460,y:100,terrain:'ice',unlock:8},
  {id:7,x:755,y:195,terrain:'high',unlock:8},
];
/** Both regional paths are returned; stage.expanded decides whether lane 2 is active. */
export function getPaths(stage:number):Point[][] { return getRegion(stage)==='snow'?SNOW_PATHS:PATHS; }
/** The board filters by slot.unlock <= stage; the engine enforces the same rule. */
export function getSlots(stage:number):Slot[] { return getRegion(stage)==='snow'?SNOW_SLOTS:SLOTS; }
