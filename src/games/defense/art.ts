import type { Branch, EnemyKind, HeroId, TowerKind } from './types';
export type SpriteAsset = {src:string;viewBox:string;width:number;height:number;displayScale?:number;nativeFacing?:-1|1};
export type ActionPose = 'windup'|'strike'|'recover';
// Source frames are shared by tactical units, portraits and the growing village.
const ORIGINAL = [[38,65,275,250],[350,65,265,255],[675,65,225,255],[950,65,280,260],[40,380,260,260],[355,360,240,280],[650,385,260,260],[965,355,270,290],[40,690,245,210],[330,650,280,270],[660,665,250,245],[965,675,270,240],[20,940,280,250],[335,950,270,250],[635,915,300,285],[960,950,270,250]];
const SNOW = [[46,20,446,485],[548,30,442,479],[94,568,336,370],[543,533,448,425],[22,952,516,562],[545,962,459,528]];
const CAMP = [[18,16,694,672],[735,110,699,579],[1471,30,685,652]];
export function spriteAsset(index:number):SpriteAsset {
 if(index>=4&&index<=6){const model=towerSpriteAsset((['crossbow','magic','cannon'] as const)[index-4]);if(model)return model;}
 const kind=({9:'wood',10:'ice',11:'stone',14:'boss',19:'frostwolf',20:'frostboss'} as Record<number,EnemyKind>)[index];
 if(kind){const model=monsterSpriteAsset(kind,'idle');if(model)return model;}
 if(index<16) return {src:'/defense/atlas.png',viewBox:ORIGINAL[index].join(' '),width:1254,height:1254};
 if(index<22)return {src:'/defense/snow-atlas.png',viewBox:SNOW[index-16].join(' '),width:1024,height:1536};
 return {src:'/defense/camp-props.png',viewBox:CAMP[index-22].join(' '),width:2172,height:724};
}
type MotionFrame = [number,number,number,number,number];
const MELEE:Record<'barbarian'|'dwarf'|'wolf',MotionFrame[]> = {
 barbarian:[[30,48,354,420,1.1],[401,174,477,305,1.3],[880,164,374,315,1.15]],
 dwarf:[[50,476,331,369,1.1],[409,574,468,278,1.5],[879,593,375,264,1.3]],
 wolf:[[26,882,373,320,1],[423,902,461,282,1.12],[902,887,352,323,1]],
};
const RANGED:Record<'mage'|'elf'|'tao'|'druid',MotionFrame[]> = {
 mage:[[43,35,322,345,1.12],[375,110,407,271,1.35],[774,89,306,293,1]],
 elf:[[37,398,325,337,1],[367,420,414,319,1.3],[775,450,289,288,1]],
 tao:[[28,742,315,328,.95],[361,763,419,307,1.2],[774,748,302,322,.95]],
 druid:[[30,1061,292,353,1],[357,1102,425,312,1.3],[785,1070,292,345,1]],
};
const motionLoaded = new Set<string>();
let motionPreload:Promise<void>|null = null;
const TOWER_MODELS:MotionFrame[] = [
 [40,35,337,380,1],[432,24,460,391,1.15],[889,48,333,370,1],
 [43,434,337,398,1],[446,412,365,422,1],[885,420,342,413,1],
 [33,874,360,340,1],[425,834,406,390,1.05],[858,840,396,378,1.05],
];
// The editable GLBs are baked once for battle; no WebGL scene is created per unit.
// A shared, centered camera frame keeps the foundation on the same ground anchor.
// Its projected ground center is (320, 488.65): this crop/scale aligns it within
// half a world pixel of the build point at Lv.2, including TowerUnit's +12 offset.
const BAKED_TOWERS:Record<TowerKind,{branch:Branch;asset:SpriteAsset;mastered?:SpriteAsset}> = {
 crossbow:{branch:'pierce',asset:{src:'/defense/models/piercing-ballista-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1},mastered:{src:'/defense/models/piercing-ballista-lv3-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1}},
 // Lv.3 has its own render with the same camera/crop, so the ground anchor is shared with Lv.2.
 magic:{branch:'fire',asset:{src:'/defense/models/fire-tower-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16},mastered:{src:'/defense/models/fire-tower-lv3-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16}},
 cannon:{branch:'water',asset:{src:'/defense/models/water-cannon-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1},mastered:{src:'/defense/models/water-cannon-lv3-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1}},
};
/** Available model renders take precedence; each failed render keeps its atlas fallback. */
export function towerSpriteAsset(kind:TowerKind,branch:Branch|null=null,level=1):SpriteAsset|null {
 const baked=BAKED_TOWERS[kind];
 if(level===3&&branch===baked.branch&&baked.mastered&&motionLoaded.has(baked.mastered.src))return {...baked.mastered,displayScale:(baked.mastered.displayScale??1)*1.025};
 if(level>=2&&branch===baked.branch&&motionLoaded.has(baked.asset.src))return {...baked.asset,displayScale:(baked.asset.displayScale??1)*(level===3?1.025:1)};
 const src='/defense/tower-models.png';if(!motionLoaded.has(src))return null;
 const row=kind==='crossbow'?0:kind==='magic'?1:2;
 const column=branch==='pierce'||branch==='fire'||branch==='crush'?1:branch?2:0;
 const [x,y,w,h,scale]=TOWER_MODELS[row*3+column];
 return {src,viewBox:`${x} ${y} ${w} ${h}`,width:1254,height:1254,displayScale:scale*(level===3?1.025:1)};
}
export type MonsterPose='walk-a'|'walk-b'|'hit'|'idle'|'charge'|'death';
type ModelFrame=[number,number,number,number];
const MONSTER_MODELS:Partial<Record<EnemyKind,{span:number;frames:ModelFrame[]}>>={
 wood:{span:330,frames:[[38,59,324,323],[405,66,286,316],[761,62,325,320]]},
 ice:{span:345,frames:[[53,399,309,353],[416,403,295,349],[776,401,310,351]]},
 stone:{span:340,frames:[[26,759,372,326],[414,757,326,328],[779,761,307,324]]},
 frostwolf:{span:350,frames:[[15,1101,365,304],[394,1105,347,300],[756,1087,330,318]]},
};
const BOSS_MODELS:Partial<Record<EnemyKind,{span:number;frames:ModelFrame[]}>>={
 boss:{span:345,frames:[[42,105,349,340],[490,50,382,395],[933,111,393,334],[1381,177,363,268]]},
 frostboss:{span:355,frames:[[36,500,385,363],[483,448,402,415],[932,512,402,351],[1365,584,392,279]]},
};
/** A common pixels-to-world scale per creature prevents pose changes resizing the body. */
export function monsterSpriteAsset(kind:EnemyKind,pose:MonsterPose):SpriteAsset|null {
 const boss=kind==='boss'||kind==='frostboss',model=(boss?BOSS_MODELS:MONSTER_MODELS)[kind];if(!model)return null;
 const src=boss?'/defense/boss-models.png':'/defense/monster-models.png';if(!motionLoaded.has(src))return null;
 const frame=boss?(pose==='charge'?1:pose==='hit'?2:pose==='death'?3:0):(pose==='hit'||pose==='death'?2:pose==='walk-b'?1:0);
 const [x,y,w,h]=model.frames[frame];
 return {src,viewBox:`${x} ${y} ${w} ${h}`,width:boss?1774:1086,height:boss?887:1448,displayScale:Math.max(w,h)/model.span};
}
/** Long weapons need a larger viewport to keep the actor's body size consistent. */
export function actionSpriteAsset(actor:HeroId|'wolf',pose:ActionPose):SpriteAsset|null {
 const melee = actor==='barbarian'||actor==='dwarf'||actor==='wolf';
 const src = melee?'/defense/melee-motion.png':'/defense/ranged-motion.png';
 if(!motionLoaded.has(src))return null;
 const frames = melee?MELEE[actor as keyof typeof MELEE]:RANGED[actor as keyof typeof RANGED];
 const [x,y,w,h,displayScale]=frames[pose==='windup'?0:pose==='strike'?1:2];
 return {src,viewBox:`${x} ${y} ${w} ${h}`,width:melee?1254:1086,height:melee?1254:1448,displayScale};
}
/** Load while preparing in camp; slow or failed requests keep the existing idle art. */
export function preloadDefenseMotion():Promise<void> {
 if(typeof Image==='undefined')return Promise.resolve();
 return motionPreload ??= Promise.all(['/defense/melee-motion.png','/defense/ranged-motion.png','/defense/tower-models.png','/defense/monster-models.png','/defense/boss-models.png',...Object.values(BAKED_TOWERS).flatMap(model=>model.mastered?[model.asset.src,model.mastered.src]:[model.asset.src])].map(src=>new Promise<void>(resolve=>{
  const asset=new Image();
  asset.onload=()=>{motionLoaded.add(src);asset.onload=null;asset.onerror=null;resolve();};
  asset.onerror=()=>{asset.onload=null;asset.onerror=null;resolve();};
  asset.src=src;
 }))).then(()=>undefined);
}
