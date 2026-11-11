import type { SpriteAsset } from '../defense/art.ts';

/** Existing articulated Blender bake, calibrated to the same camera and ground as its hit pose. */
export const WOLF_BASE = '/defense/models/frost-wolf-atlas.webp';
export const WOLF_WALK = '/defense/models/frost-wolf-trot-atlas.webp';
export const WOLF_GROUND_Y = 284.49;
/** Snow atlas index 19; independent of the campaign's asynchronous model cache. */
export const WOLF_ILLUSTRATION: SpriteAsset = {src:'/defense/snow-atlas.png',viewBox:'543 533 448 425',width:1024,height:1536};
/** Keep the long body and dark feet legible at the landscape mobile battlefield scale. */
export const LEGION_WOLF_SIZE = 54;
const WOLF_CROP = [8, 100, 368, 228] as const;

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
