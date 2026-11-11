import type { MonsterKind, Point, UnitKind } from './types.ts';

export const WORLD = { width: 1600, height: 900 } as const;
export const DEPLOY = { left: 900, right: 1320, top: 220, bottom: 690 } as const;
export const POPULATION_CAP = 24;
export const MAX_ENEMIES = 80;
export const WAVE_COUNT = 4;
export const WAVE_TOTALS = [48, 60, 78, 96] as const;
export const LANES: Point[][] = [
  [{x:60,y:200},{x:410,y:240},{x:650,y:350},{x:900,y:370},{x:1230,y:425},{x:1450,y:450}],
  [{x:60,y:450},{x:440,y:450},{x:700,y:450},{x:980,y:450},{x:1230,y:450},{x:1450,y:450}],
  [{x:60,y:700},{x:410,y:665},{x:650,y:550},{x:900,y:530},{x:1230,y:475},{x:1450,y:450}],
];
export const UNIT_DEFS: Record<UnitKind, {
  name:string;cost:number;count:number;hp:number;damage:number;range:number;speed:number;cooldown:number;description:string;sprite:number;
}> = {
  shield:{name:'방패병',cost:100,count:3,hp:420,damage:20,range:48,speed:82,cooldown:.85,description:'3인 전열 · 가까운 적을 막고 자동 방패 강타',sprite:2},
  archer:{name:'궁수',cost:90,count:3,hp:140,damage:24,range:325,speed:68,cooldown:.8,description:'3인 후열 · 긴 사거리와 자동 연속 사격',sprite:1},
  mage:{name:'마법사',cost:120,count:2,hp:150,damage:34,range:285,speed:62,cooldown:1.15,description:'2인 후열 · 밀집한 적에게 자동 화염 폭발',sprite:0},
  beast:{name:'영물',cost:140,count:1,hp:850,damage:58,range:64,speed:88,cooldown:1.05,description:'1체 전열 · 넓은 충격파로 적을 둔화',sprite:18},
};
export const MONSTER_DEFS:Record<MonsterKind,{hp:number;speed:number;damage:number;cooldown:number;bounty:number;sprite:number}> = {
  sprout:{hp:64,speed:68,damage:9,cooldown:1.1,bounty:3,sprite:8},
  wood:{hp:115,speed:52,damage:12,cooldown:1.3,bounty:4,sprite:9},
  frostwolf:{hp:76,speed:92,damage:12,cooldown:.9,bounty:4,sprite:19},
  stone:{hp:235,speed:42,damage:18,cooldown:1.65,bounty:6,sprite:11},
  metal:{hp:145,speed:57,damage:15,cooldown:1.2,bounty:5,sprite:12},
  boss:{hp:2600,speed:35,damage:40,cooldown:1.5,bounty:100,sprite:14},
};
