import type { SpriteAsset } from '../defense/art.ts';
import { attackOctant } from '../defense/action.ts';
import { FROST_WOLF_FRAME, FROST_WOLF_STRIDE } from '../defense/frostWolfGait.ts';
import { LANES } from './data.ts';

/** Existing articulated Blender bake, calibrated to the same camera and ground as its hit pose. */
export const WOLF_BASE = '/defense/models/frost-wolf-atlas.webp';
export const WOLF_WALK = '/defense/models/frost-wolf-trot-atlas.webp';
export const WOLF_GROUND_Y = 284.49;
/** Snow atlas index 19; independent of the campaign's asynchronous model cache. */
export const WOLF_ILLUSTRATION: SpriteAsset = {src:'/defense/snow-atlas.png',viewBox:'543 533 448 425',width:1024,height:1536};
/** Keep the long body and dark feet legible at the landscape mobile battlefield scale. */
export const LEGION_WOLF_SIZE = 54;
const WOLF_CROP = [8, 100, 368, 228] as const;

type LaneSegment = { length:number; direction:number };
/** Compute directions from the actual paths, so unused atlases are not decoded. */
const laneSegments:LaneSegment[][] = LANES.map(points => points.slice(1).map((point,index) => {
  const from=points[index], dx=point.x-from.x, dy=point.y-from.y;
  return {length:Math.hypot(dx,dy),direction:attackOctant(from,point) ?? 0};
}));
export const LEGION_WOLF_DIRECTIONS = [...new Set(laneSegments.flatMap(lane=>lane.map(segment=>segment.direction)))];
export const WOLF_DIRECTIONAL_WALK = (direction:number) => `/defense/models/frost-stride-${direction}-atlas.webp`;
export const WOLF_DIRECTIONAL_HIT = (direction:number) => `/defense/models/frost-flinch-${direction}-atlas.webp`;

/** Integrate the authored projected stride per path segment; turns must not rephase earlier travel. */
export function legionWolfPathPose(lane:number,progress:number,size:number,reduced:boolean):{direction:number;frame:number}|null {
  const segments=laneSegments[lane];
  if(!segments?.length||!Number.isFinite(progress)||!Number.isFinite(size)||size<=0)return null;
  let remaining=Math.max(0,progress), cycles=0, direction=segments[0].direction;
  for(const segment of segments){
    direction=segment.direction;
    const travelled=Math.min(remaining,segment.length);
    cycles+=travelled/(FROST_WOLF_STRIDE[direction]*size);
    remaining-=travelled;
    if(remaining<=0)break;
  }
  return {direction,frame:reduced?4:Math.floor((cycles+1e-9)*8)%8};
}

/** Both gait and the matching impact poses share the authored camera and grounded feet. */
export function legionWolfDirectionalAsset(lane:number,progress:number,hit:number,size:number,reduced:boolean,walkReady:boolean,hitReady:boolean):SpriteAsset|null {
  if(!walkReady||(!reduced&&hit>0&&!hitReady))return null;
  const pose=legionWolfPathPose(lane,progress,size,reduced);if(!pose)return null;
  const flinch=!reduced&&hit>0;
  const scale=flinch ? .75 : 1;
  const [x,y,w,h]=FROST_WOLF_FRAME.crop.map(v=>v*scale);
  const cell=flinch?192:256;
  const sample=flinch?(hit>.09?0:1):0;
  const column=flinch?pose.frame*2+sample:pose.frame;
  return {src:flinch?WOLF_DIRECTIONAL_HIT(pose.direction):WOLF_DIRECTIONAL_WALK(pose.direction),
    width:flinch?3072:2048,height:cell,viewBox:`${column*cell+x} ${y} ${w} ${h}`,
    displayScale:FROST_WOLF_FRAME.display_scale,groundY:FROST_WOLF_FRAME.ground_y*scale,oriented:true};
}

/** Legion progress only advances when an enemy really moves; it freezes in combat and on pause. */
export function legionWolfFrame(progress: number, size: number, reduced: boolean): number {
  if (reduced) return 1;
  if (!Number.isFinite(progress) || !Number.isFinite(size) || size <= 0) return 0;
  const stride = 40 * size / 68;
  return Math.floor((Math.max(0, progress) / stride + 1e-9) * 8) % 8;
}

export function legionWolfAsset(progress: number, hit: number, size: number, reduced: boolean, walkReady: boolean): SpriteAsset {
  const [x, y, width, height] = WOLF_CROP;
  const walk = walkReady && (reduced || !(hit > 0));
  const safeProgress = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  const frame = walk ? legionWolfFrame(safeProgress, size, reduced) : !reduced && hit > 0 ? 2 : reduced ? 0 : Math.floor(safeProgress / 15) % 2;
  return {
    src: walk ? WOLF_WALK : WOLF_BASE,
    width: walk ? 3072 : 1152,
    height: 384,
    viewBox: `${frame * 384 + x} ${y} ${width} ${height}`,
    displayScale: width / 315,
    groundY: WOLF_GROUND_Y,
  };
}
