import type { SpriteAsset } from '../defense/art.ts';

/** A single shared Blender bake for the shield soldier's card and battlefield. */
export const LEGION_SHIELD_ATLAS = '/defense/models/legion-shield-atlas.webp';
export const LEGION_SHIELD_FRAME = { width:384, height:384, crop:[132,154,167,191], groundY:330, displayScale:1.32311 } as const;

/** Damage is immediate: contact starts with the effect, then the shield recoils. */
export function legionShieldFrame(attackAge:number|null,reduced:boolean):0|1|2 {
  if (reduced || attackAge===null || !Number.isFinite(attackAge) || attackAge<0 || attackAge>=.22) return 0;
  return attackAge<.10?1:2;
}

export function legionShieldAsset(attackAge:number|null=null,reduced=false):SpriteAsset {
  const {width,height,crop,groundY,displayScale}=LEGION_SHIELD_FRAME;
  const frame=legionShieldFrame(attackAge,reduced);
  return {src:LEGION_SHIELD_ATLAS,width:width*3,height,viewBox:`${frame*width+crop[0]} ${crop[1]} ${crop[2]} ${crop[3]}`,groundY,displayScale};
}
