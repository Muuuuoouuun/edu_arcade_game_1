import { enemyWalkFrame, walkFrame } from './locomotion.ts';
import { attackOctant, dwarfHammerFrame } from './action.ts';
import { MAGE_SOCKETS } from './mageSockets.ts';
import { ELF_SOCKETS } from './elfSockets.ts';
import { DWARF_HAMMER_TRAIL } from './dwarfHammerTrail.ts';
import { BALLISTA_MUZZLES } from './ballistaMuzzles.ts';
import { BALLISTA_LV3_MUZZLES } from './ballistaLv3Muzzles.ts';
import { WATER_CANNON_MUZZLES } from './waterCannonMuzzles.ts';
import { WATER_CANNON_LV3_MUZZLES } from './waterCannonLv3Muzzles.ts';
import type { Branch, CombatAttack, EnemyKind, HeroId, Point, Projectile, TowerKind } from './types';
export type SpriteAsset = {src:string;viewBox:string;width:number;height:number;displayScale?:number;nativeFacing?:-1|1;groundY?:number;oriented?:boolean};
export type ActionPose = 'windup'|'strike'|'recover';
// Source frames are shared by tactical units, portraits and the growing village.
const ORIGINAL = [[38,65,275,250],[350,65,265,255],[675,65,225,255],[950,65,280,260],[40,380,260,260],[355,360,240,280],[650,385,260,260],[965,355,270,290],[40,690,245,210],[330,650,280,270],[660,665,250,245],[965,675,270,240],[20,940,280,250],[335,950,270,250],[635,915,300,285],[960,950,270,250]];
const SNOW = [[46,20,446,485],[548,30,442,479],[94,568,336,370],[543,533,448,425],[22,952,516,562],[545,962,459,528]];
const CAMP = [[18,16,694,672],[735,110,699,579],[1471,30,685,652]];
export function spriteAsset(index:number):SpriteAsset {
 // Portraits crop out the shared action-frame margin; battle keeps the full frame.
 if(index===2){const model=idleSpriteAsset('dwarf');if(model)return {...model,viewBox:'180 172 392 430'};}
 if(index>=4&&index<=6){const model=towerSpriteAsset((['crossbow','magic','cannon'] as const)[index-4]);if(model)return model;}
 const kind=({9:'wood',10:'ice',11:'stone',12:'metal',13:'insulator',14:'boss',19:'frostwolf',20:'frostboss'} as Record<number,EnemyKind>)[index];
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
const MAGE_CAST=Array.from({length:8},(_,i)=>`/defense/models/ian-cast-${i}-atlas.webp`);
const MAGE_WALK=Array.from({length:8},(_,i)=>`/defense/models/ian-walk-${i}-atlas.webp`);
function mageModelReady(){return [...MAGE_CAST,...MAGE_WALK].every(src=>motionLoaded.has(src));}
function mageAsset(direction:number,mode:'cast'|'walk',frame:number):SpriteAsset|null {
 if(!mageModelReady())return null;
 return {src:(mode==='cast'?MAGE_CAST:MAGE_WALK)[direction],viewBox:`${frame*256} 0 256 256`,width:mode==='cast'?1024:2048,height:256,groundY:220,displayScale:1.2*6.8/5.8,oriented:true};
}
export function mageCastSocket(from:Point,to:Point,size:number,pose:ActionPose|'idle'='strike'):Point|null {
 const direction=attackOctant(from,to);
 if(direction===null||!mageModelReady()||!Number.isFinite(size)||size<=0)return null;
 const frame=pose==='idle'?0:pose==='windup'?1:pose==='strike'?2:3;
 const [x,y]=MAGE_SOCKETS[direction][frame];return {x:x*size,y:y*size};
}
/** Use the launch-time pose and size; following, promotion and moving cannot move a released bolt's origin. */
export function mageProjectileOffset(p:Projectile,unit=1):Point|undefined {
 if(p.actor!=='mage'||!p.launchAim||(p.source!=='hero'&&p.source!=='mercenary')||(p.sourceSize!==84&&p.sourceSize!==94))return undefined;
 const socket=mageCastSocket(p.from,p.launchAim,p.sourceSize*unit);
 return socket?{x:socket.x,y:socket.y+27}:undefined;
}
const ELF_CAST=Array.from({length:8},(_,i)=>`/defense/models/riel-cast-${i}-atlas.webp`);
const ELF_WALK=Array.from({length:8},(_,i)=>`/defense/models/riel-walk-${i}-atlas.webp`);
function elfModelReady(){return [...ELF_CAST,...ELF_WALK].every(src=>motionLoaded.has(src));}
function elfAsset(direction:number,mode:'cast'|'walk',frame:number):SpriteAsset|null {
 if(!elfModelReady())return null;
 return {src:(mode==='cast'?ELF_CAST:ELF_WALK)[direction],viewBox:`${frame*256} 0 256 256`,width:mode==='cast'?1024:2048,height:256,groundY:220,displayScale:1.2*6.8/5.8,oriented:true};
}
export function elfArrowSocket(from:Point,to:Point,size:number,pose:ActionPose|'idle'='strike'):Point|null {
 const direction=attackOctant(from,to);
 if(direction===null||!elfModelReady()||!Number.isFinite(size)||size<=0)return null;
 const frame=pose==='idle'?0:pose==='windup'?1:pose==='strike'?2:3;
 const [x,y]=ELF_SOCKETS[direction][frame];return {x:x*size,y:y*size};
}
/** Use the launch-time pose and size; following, promotion and moving cannot move a released arrow's origin. */
export function elfProjectileOffset(p:Projectile,unit=1):Point|undefined {
 if(p.actor!=='elf'||!p.launchAim||(p.source!=='hero'&&p.source!=='mercenary')||(p.sourceSize!==84&&p.sourceSize!==94))return undefined;
 const socket=elfArrowSocket(p.from,p.launchAim,p.sourceSize*unit);
 return socket?{x:socket.x,y:socket.y+27}:undefined;
}
const DWARF_POSES = ['idle','windup','strike','recover'] as const;
const DWARF_RENDERS = Object.fromEntries(DWARF_POSES.map(pose=>[pose,{
 src:`/defense/models/dwarf-${pose}-game.webp`,viewBox:'0 0 640 640',width:640,height:640,displayScale:1.2,nativeFacing:1,groundY:550,
}])) as Record<typeof DWARF_POSES[number],SpriteAsset>;
// Switch the whole actor together: a missing action frame must never alternate
// a modeled body with the old illustrated body during an attack.
function dwarfModelReady(){return DWARF_POSES.every(pose=>motionLoaded.has(DWARF_RENDERS[pose].src));}
const DWARF_DIRECTIONS=Array.from({length:8},(_,i)=>`/defense/models/dwarf-attack-${i}-atlas.webp`);
/** Rotate the authored model instead of mirroring its asymmetric hammer/shield. */
export function directionalActionSpriteAsset(actor:HeroId|'wolf',pose:ActionPose,from:Point,to:Point,reduced=false):SpriteAsset|null {
 const direction=attackOctant(from,to);
 if(actor==='elf'&&direction!==null)return elfAsset(direction,'cast',reduced?(pose==='strike'?2:0):pose==='windup'?1:pose==='strike'?2:3);
 if(actor==='mage'&&direction!==null)return mageAsset(direction,'cast',reduced?(pose==='strike'?2:0):pose==='windup'?1:pose==='strike'?2:3);
 if(actor!=='dwarf'||direction===null||!dwarfModelReady()||!DWARF_DIRECTIONS.every(src=>motionLoaded.has(src)))return null;
 const frame=pose==='windup'?0:pose==='strike'?1:2;
 return {src:DWARF_DIRECTIONS[direction],viewBox:`${frame*384} 0 384 384`,width:1152,height:384,displayScale:1.2*6.8/5.8,groundY:330};
}
const DWARF_HAMMER=Array.from({length:8},(_,i)=>`/defense/models/dwarf-hammer-${i}-atlas.webp`);
/** Eight authored load/contact/recovery poses, with the same ground and scale as walking. */
export function hammerSequenceSpriteAsset(actor:HeroId|'wolf',attack:CombatAttack,reduced=false):SpriteAsset|null {
 const direction=attackOctant(attack.from,attack.to);
 if(actor!=='dwarf'||direction===null||!dwarfModelReady()||!DWARF_HAMMER.every(src=>motionLoaded.has(src)))return null;
 const frame=dwarfHammerFrame(attack,reduced);
 return {src:DWARF_HAMMER[direction],viewBox:`${frame*256} 0 256 256`,width:2048,height:256,displayScale:1.2*6.8/5.8,groundY:220,oriented:true};
}
/** Contact-only ribbon sampled from the same camera as the visible hammer head. */
export function hammerContactTrail(attack:CombatAttack,size:number):Point[]|null {
 if(attack.actor!=='dwarf'||dwarfHammerFrame(attack)!==4||!Number.isFinite(size)||size<=0||!hammerSequenceSpriteAsset('dwarf',attack))return null;
 const direction=attackOctant(attack.from,attack.to)!;
 return DWARF_HAMMER_TRAIL[direction].map(([x,y])=>({x:x*size,y:y*size}));
}
const DWARF_LOCOMOTION=Array.from({length:8},(_,i)=>`/defense/models/dwarf-locomotion-${i}-atlas.webp`);
/** One complete direction set shares the attack camera; frame 8 is a neutral stop. */
export function directionalLocomotionSpriteAsset(actor:HeroId|'wolf',heading:Point,distance:number|null):SpriteAsset|null {
 const direction=attackOctant({x:0,y:0},heading);
 if(actor==='elf'&&direction!==null)return elfAsset(direction,distance===null?'cast':'walk',distance===null?0:walkFrame(distance));
 if(actor==='mage'&&direction!==null)return mageAsset(direction,distance===null?'cast':'walk',distance===null?0:walkFrame(distance));
 if(actor!=='dwarf'||direction===null||!dwarfModelReady()||!DWARF_LOCOMOTION.every(src=>motionLoaded.has(src)))return null;
 const frame=distance===null?8:walkFrame(distance);
 return {src:DWARF_LOCOMOTION[direction],viewBox:`${frame*256} 0 256 256`,width:2304,height:256,displayScale:1.2*6.8/5.8,groundY:220,oriented:true};
}
export function idleSpriteAsset(actor:HeroId|'wolf'):SpriteAsset|null {
 return actor==='elf'?elfAsset(1,'cast',0):actor==='mage'?mageAsset(1,'cast',0):actor==='dwarf'&&dwarfModelReady()?DWARF_RENDERS.idle:null;
}
const DWARF_WALK = Array.from({length:8},(_,i):SpriteAsset=>({
 ...DWARF_RENDERS.idle,src:`/defense/models/dwarf-walk-${i}-game.webp`,
}));
/** A partial walk set keeps the existing modeled idle pose, never mixes styles. */
export function walkingSpriteAsset(actor:HeroId|'wolf',distance:number):SpriteAsset|null {
 if(actor==='elf')return elfAsset(1,'walk',walkFrame(distance));
 if(actor==='mage')return mageAsset(1,'walk',walkFrame(distance));
 return actor==='dwarf'&&dwarfModelReady()&&DWARF_WALK.every(frame=>motionLoaded.has(frame.src))
  ?DWARF_WALK[walkFrame(distance)]:null;
}
const TOWER_MODELS:MotionFrame[] = [
 [40,35,337,380,1],[432,24,460,391,1.15],[889,48,333,370,1],
 [43,434,337,398,1],[446,412,365,422,1],[885,420,342,413,1],
 [33,874,360,340,1],[425,834,406,390,1.05],[858,840,396,378,1.05],
];
// The editable GLBs are baked once for battle; no WebGL scene is created per unit.
// A shared, centered camera frame keeps the foundation on the same ground anchor.
// Its projected ground center is (320, 488.65): this crop/scale aligns it within
// half a world pixel of the build point at Lv.2, including TowerUnit's +12 offset.
type BakedTower={kind?:TowerKind;branch:Branch;asset:SpriteAsset;mastered?:SpriteAsset};
const BAKED_TOWERS:Record<TowerKind,BakedTower> = {
 crossbow:{branch:'pierce',asset:{src:'/defense/models/piercing-ballista-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1},mastered:{src:'/defense/models/piercing-ballista-lv3-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1}},
 // Lv.3 has its own render with the same camera/crop, so the ground anchor is shared with Lv.2.
 magic:{branch:'fire',asset:{src:'/defense/models/fire-tower-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16},mastered:{src:'/defense/models/fire-tower-lv3-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16}},
 cannon:{branch:'water',asset:{src:'/defense/models/water-cannon-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1},mastered:{src:'/defense/models/water-cannon-lv3-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1}},
};
// Render-only branch variants (baked 2.5D, no GLB), same camera and crop as the Fire tower.
const BAKED_BRANCHES:BakedTower[] = [
 {kind:'magic',branch:'lightning',asset:{src:'/defense/models/lightning-tower-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16},mastered:{src:'/defense/models/lightning-tower-lv3-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16}},
 {kind:'crossbow',branch:'rapid',asset:{src:'/defense/models/rapid-crossbow-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1},mastered:{src:'/defense/models/rapid-crossbow-lv3-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1}},
 {kind:'cannon',branch:'crush',asset:{src:'/defense/models/crush-cannon-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1},mastered:{src:'/defense/models/crush-cannon-lv3-game.webp',viewBox:'32 24 576 576',width:640,height:640,displayScale:1.16,nativeFacing:-1}},
];
const bakedFor=(kind:TowerKind,branch:Branch|null)=>BAKED_BRANCHES.find(model=>model.kind===kind&&model.branch===branch)??BAKED_TOWERS[kind];
const WATER_ACTION_ATLASES=Array.from({length:8},(_,i)=>`/defense/models/water-action-${i}-atlas.webp`);
const WATER_LV3_ACTION_ATLASES=Array.from({length:8},(_,i)=>`/defense/models/water-lv3-action-${i}-atlas.webp`);
/** Each upgrade uses its own complete set and matching authored fallback. */
export function waterCannonActionSpriteAsset(kind:TowerKind,branch:Branch|null,level:number,from:Point,to:Point,recoil=0,reduced=false) {
 const direction=attackOctant(from,to);
 if(kind!=='cannon'||branch!=='water'||(level!==2&&level!==3)||direction===null)return null;
 const mastered=level===3,atlases=mastered?WATER_LV3_ACTION_ATLASES:WATER_ACTION_ATLASES;
 const base=mastered?BAKED_TOWERS.cannon.mastered!:BAKED_TOWERS.cannon.asset;
 if(!motionLoaded.has(base.src)||!atlases.every(src=>motionLoaded.has(src)))return null;
 const pose=reduced||!Number.isFinite(recoil)||recoil<=0?0:recoil>.12?1:2;
 const [x,y]=(mastered?WATER_CANNON_LV3_MUZZLES:WATER_CANNON_MUZZLES)[direction][pose],size=92+level*4;
 return {direction,pose,muzzle:{x:x*size,y:y*size},asset:{src:atlases[direction],viewBox:`${pose*384+19.2} 14.4 345.6 345.6`,width:1152,height:384,displayScale:1.16*(mastered?1.025:1)} as SpriteAsset};
}
const BALLISTA_ACTION_ATLASES=Array.from({length:8},(_,i)=>`/defense/models/ballista-action-${i}-atlas.webp`);
const BALLISTA_LV3_ACTION_ATLASES=Array.from({length:8},(_,i)=>`/defense/models/ballista-lv3-action-${i}-atlas.webp`);
/** Release only after the engine fires; the foundation never recoils with the bow. */
export function ballistaActionSpriteAsset(kind:TowerKind,branch:Branch|null,level:number,from:Point,to:Point,recoil=0,reduced=false) {
 const direction=attackOctant(from,to);
 if(kind!=='crossbow'||branch!=='pierce'||(level!==2&&level!==3)||direction===null)return null;
 const mastered=level===3,atlases=mastered?BALLISTA_LV3_ACTION_ATLASES:BALLISTA_ACTION_ATLASES;
 const base=mastered?BAKED_TOWERS.crossbow.mastered!:BAKED_TOWERS.crossbow.asset;
 if(!motionLoaded.has(base.src)||!atlases.every(src=>motionLoaded.has(src)))return null;
 const pose=reduced||!Number.isFinite(recoil)||recoil<=0?0:recoil>.16?1:recoil>.08?2:3;
 const [x,y]=(mastered?BALLISTA_LV3_MUZZLES:BALLISTA_MUZZLES)[direction][pose],size=92+level*4;
 return {direction,pose,muzzle:{x:x*size,y:y*size},asset:{src:atlases[direction],viewBox:`${pose*256+12.8} 9.6 230.4 230.4`,width:1024,height:256,displayScale:1.16*(mastered?1.025:1)} as SpriteAsset};
}
/** Keep a released arrow at its launch-level socket even if the tower upgrades or sells. */
export function ballistaProjectileOffset(p:Projectile):Point|undefined {
 if(p.source!=='tower'||p.actor!=='crossbow'||!p.pierce||!p.launchAim||(p.sourceLevel!==2&&p.sourceLevel!==3))return undefined;
 const render=ballistaActionSpriteAsset('crossbow','pierce',p.sourceLevel,p.from,p.launchAim);
 return render?{x:render.muzzle.x,y:12+render.muzzle.y+27}:undefined;
}
/** Presentation offset fades to zero on landing; collision coordinates stay untouched. */
export function waterCannonProjectileOffset(p:Projectile):Point|undefined {
 if(p.source!=='tower'||p.actor!=='cannon'||p.element!=='water'||(p.sourceLevel!==2&&p.sourceLevel!==3))return undefined;
 const render=waterCannonActionSpriteAsset('cannon','water',p.sourceLevel,p.from,p.to);
 return render?{x:render.muzzle.x,y:12+render.muzzle.y+27}:undefined;
}
/** Available model renders take precedence; each failed render keeps its atlas fallback. */
export function towerSpriteAsset(kind:TowerKind,branch:Branch|null=null,level=1):SpriteAsset|null {
 const baked=bakedFor(kind,branch);
 if(level===3&&branch===baked.branch&&baked.mastered&&motionLoaded.has(baked.mastered.src))return {...baked.mastered,displayScale:(baked.mastered.displayScale??1)*1.025};
 if(level>=2&&branch===baked.branch&&motionLoaded.has(baked.asset.src))return {...baked.asset,displayScale:(baked.asset.displayScale??1)*(level===3?1.025:1)};
 const src='/defense/tower-models.webp';if(!motionLoaded.has(src))return null;
 const row=kind==='crossbow'?0:kind==='magic'?1:2;
 const column=branch==='pierce'||branch==='fire'||branch==='crush'?1:branch?2:0;
 const [x,y,w,h,scale]=TOWER_MODELS[row*3+column];
 return {src,viewBox:`${x} ${y} ${w} ${h}`,width:1254,height:1254,displayScale:scale*(level===3?1.025:1)};
}
export type MonsterPose='walk-a'|'walk-b'|'hit'|'idle'|'charge'|'death';
type ModelFrame=[number,number,number,number];
type MonsterModel={span:number;frames:ModelFrame[];atlas?:{src:string;width:number;height:number};fallback?:MonsterModel};
/** Baked Blender monster renders (tools/blender/build_<name>.py): 384px frames, walk-a/walk-b/hit, one shared crop band. */
const bakedAtlas=(file:string)=>({src:`/defense/models/${file}-atlas.webp`,width:1152,height:384});
const SLIME_ATLAS=bakedAtlas('insulator-slime'),GOLEM_ATLAS=bakedAtlas('stone-golem'),WOOD_ATLAS=bakedAtlas('wood-soldier'),ICE_ATLAS=bakedAtlas('ice-knight'),WOLF_ATLAS=bakedAtlas('frost-wolf'),METAL_ATLAS=bakedAtlas('metal-soldier');
const WOOD_WALK_ATLAS={src:'/defense/models/wood-soldier-walk-atlas.webp',width:3072,height:384};
const WOLF_COLLAPSE_ATLAS={src:'/defense/models/frost-wolf-collapse-atlas.webp',width:1536,height:384};
const WOLF_TROT_ATLAS={src:'/defense/models/frost-wolf-trot-atlas.webp',width:3072,height:384};
const MONSTER_MODELS:Partial<Record<EnemyKind,MonsterModel>>={
 wood:{span:360,frames:[[0,8,384,364],[384,8,384,364],[768,8,384,364]],atlas:WOOD_ATLAS,
  // Previous illustrated frames keep the creature on screen if the baked render fails to load.
  fallback:{span:330,frames:[[38,59,324,323],[405,66,286,316],[761,62,325,320]]}},
 ice:{span:360,frames:[[0,4,384,372],[384,4,384,372],[768,4,384,372]],atlas:ICE_ATLAS,
  // Previous illustrated frames keep the creature on screen if the baked render fails to load.
  fallback:{span:345,frames:[[53,399,309,353],[416,403,295,349],[776,401,310,351]]}},
 stone:{span:260,frames:[[22,68,340,255],[406,68,340,255],[790,68,340,255]],atlas:GOLEM_ATLAS,
  // Previous illustrated frames keep the creature on screen if the baked render fails to load.
  fallback:{span:340,frames:[[26,759,372,326],[414,757,326,328],[779,761,307,324]]}},
 frostwolf:{span:315,frames:[[8,100,368,228],[392,100,368,228],[776,100,368,228]],atlas:WOLF_ATLAS,
  // Previous illustrated frames keep the creature on screen if the baked render fails to load.
  fallback:{span:350,frames:[[15,1101,365,304],[394,1105,347,300],[756,1087,330,318]]}},
 // No illustrated pose set exists for the metal soldier: if the render fails the single atlas.png frame stays.
 metal:{span:260,frames:[[22,67,340,255],[406,67,340,255],[790,67,340,255]],atlas:METAL_ATLAS},
 insulator:{span:330,frames:[[39,78,317,245],[423,78,317,245],[787,78,317,245]],atlas:SLIME_ATLAS},
};
const BOSS_MODELS:Partial<Record<EnemyKind,MonsterModel>>={
 boss:{span:345,frames:[[42,105,349,340],[490,50,382,395],[933,111,393,334],[1381,177,363,268]]},
 frostboss:{span:355,frames:[[36,500,385,363],[483,448,402,415],[932,512,402,351],[1365,584,392,279]]},
};
/** Every baked monster atlas is preloaded from the model table, so a new bake cannot be forgotten in the loader. */
const MONSTER_ATLAS_SOURCES=[...new Set(Object.values(MONSTER_MODELS).flatMap(model=>model.atlas?[model.atlas.src]:[]))];
/** A common pixels-to-world scale per creature prevents pose changes resizing the body. */
export function monsterSpriteAsset(kind:EnemyKind,pose:MonsterPose):SpriteAsset|null {
 const boss=kind==='boss'||kind==='frostboss';let model=(boss?BOSS_MODELS:MONSTER_MODELS)[kind];if(!model)return null;
 if(model.atlas&&model.fallback&&!motionLoaded.has(model.atlas.src))model=model.fallback;
 const atlas=model.atlas,src=atlas?.src??(boss?'/defense/boss-models.webp':'/defense/monster-models.webp');if(!motionLoaded.has(src))return null;
 const frame=boss?(pose==='charge'?1:pose==='hit'?2:pose==='death'?3:0):(pose==='hit'||pose==='death'?2:pose==='walk-b'?1:0);
 const [x,y,w,h]=model.frames[frame];
 return {src,viewBox:`${x} ${y} ${w} ${h}`,width:atlas?.width??(boss?1774:1086),height:atlas?.height??(boss?887:1448),displayScale:Math.max(w,h)/model.span,...(atlas&&kind==='wood'?{groundY:317.61}:atlas&&kind==='frostwolf'?{groundY:284.49}:{})};
}
/** Eight authored poses, complete atlas only; never swap a modeled gait onto illustrated hit art. */
export function monsterWalkingSpriteAsset(kind:EnemyKind,distance:number):SpriteAsset|null {
 if(kind==='frostwolf'&&motionLoaded.has(WOLF_ATLAS.src)&&motionLoaded.has(WOLF_TROT_ATLAS.src))return {...WOLF_TROT_ATLAS,viewBox:`${enemyWalkFrame(kind,distance)*384+8} 100 368 228`,displayScale:368/315,groundY:284.49};
 if(kind!=='wood'||!motionLoaded.has(WOOD_ATLAS.src)||!motionLoaded.has(WOOD_WALK_ATLAS.src))return null;
 return {...WOOD_WALK_ATLAS,viewBox:`${enemyWalkFrame(kind,distance)*384} 8 384 364`,displayScale:384/360,groundY:317.61};
}
/** Collapse follows simulation age, with the same camera, crop and ground as the living wolf. */
export function monsterDeathSpriteAsset(kind:EnemyKind,progress:number,reduced=false):{asset:SpriteAsset;frame:number}|null {
 if(kind!=='frostwolf'||!motionLoaded.has(WOLF_ATLAS.src)||!motionLoaded.has(WOLF_COLLAPSE_ATLAS.src))return null;
 const frame=reduced?3:Math.max(0,Math.min(3,Math.floor((Number.isFinite(progress)?progress:0)/.24)));
 return {frame,asset:{...WOLF_COLLAPSE_ATLAS,viewBox:`${frame*384+8} 100 368 228`,displayScale:368/315,groundY:284.49}};
}
/** Long weapons need a larger viewport to keep the actor's body size consistent. */
export function actionSpriteAsset(actor:HeroId|'wolf',pose:ActionPose):SpriteAsset|null {
 if(actor==='elf'&&elfModelReady())return elfAsset(1,'cast',pose==='windup'?1:pose==='strike'?2:3);
 if(actor==='mage'&&mageModelReady())return mageAsset(1,'cast',pose==='windup'?1:pose==='strike'?2:3);
 if(actor==='dwarf'&&dwarfModelReady())return DWARF_RENDERS[pose];
 const melee = actor==='barbarian'||actor==='dwarf'||actor==='wolf';
 const src = melee?'/defense/melee-motion.webp':'/defense/ranged-motion.webp';
 if(!motionLoaded.has(src))return null;
 const frames = melee?MELEE[actor as keyof typeof MELEE]:RANGED[actor as keyof typeof RANGED];
 const [x,y,w,h,displayScale]=frames[pose==='windup'?0:pose==='strike'?1:2];
 return {src,viewBox:`${x} ${y} ${w} ${h}`,width:melee?1254:1086,height:melee?1254:1448,displayScale};
}
/** Load while preparing in camp; slow or failed requests keep the existing idle art. */
export function preloadDefenseMotion():Promise<void> {
 if(typeof Image==='undefined')return Promise.resolve();
 const load=(src:string)=>new Promise<void>(resolve=>{
  const asset=new Image();
  asset.onload=()=>{motionLoaded.add(src);asset.onload=null;asset.onerror=null;resolve();};
  asset.onerror=()=>{asset.onload=null;asset.onerror=null;resolve();};
  asset.src=src;
 });
 return motionPreload ??= Promise.all(['/defense/melee-motion.webp','/defense/ranged-motion.webp','/defense/tower-models.webp','/defense/boss-models.webp',...MONSTER_ATLAS_SOURCES,WOOD_WALK_ATLAS.src,WOLF_TROT_ATLAS.src,WOLF_COLLAPSE_ATLAS.src,...MAGE_CAST,...MAGE_WALK,...ELF_CAST,...ELF_WALK,...DWARF_DIRECTIONS,...DWARF_HAMMER,...DWARF_LOCOMOTION,...WATER_ACTION_ATLASES,...WATER_LV3_ACTION_ATLASES,...BALLISTA_ACTION_ATLASES,...BALLISTA_LV3_ACTION_ATLASES,...[...Object.values(BAKED_TOWERS),...BAKED_BRANCHES].flatMap(model=>model.mastered?[model.asset.src,model.mastered.src]:[model.asset.src]),...[...Object.values(DWARF_RENDERS),...DWARF_WALK].map(asset=>asset.src)].map(load)).then(()=>{
  // The illustrated monster sheet (~594 KB) is only a fallback: fetch it only when a baked atlas that relies on it failed.
  const needed=Object.values(MONSTER_MODELS).some(model=>model.fallback&&model.atlas&&!motionLoaded.has(model.atlas.src));
  return needed?load('/defense/monster-models.webp'):undefined;
 });
}
