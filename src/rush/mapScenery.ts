// What a battlefield layout (maps.ts) looks like: the painted ground, cover models, enemy gates, and the scenery
// around and on the field. Everything static is returned as coloured parts to bake (look.ts `bake`): the view merges
// them into a few meshes, so the whole dressing costs a fixed handful of draw calls. No rules live here.
import {
  BoxGeometry, ConeGeometry, CylinderGeometry, DataTexture, DodecahedronGeometry, IcosahedronGeometry, LinearFilter, LinearMipmapLinearFilter,
  OctahedronGeometry, RGBAFormat, SRGBColorSpace, SphereGeometry, type BufferGeometry,
} from 'three';
import { ARENA, CRATE, HERO_SPAWN, LANES, PADS, TOWN, type Block, type Vec } from './data.ts';
import { GATES, inBush, laneDistance, onBridge, pathDistance, type MapId, type MapLayout, type Wall } from './maps.ts';
import { heightAt, type GroundPalette } from './terrainElevation.ts';
import { PAL, type Part } from './look.ts';

/** Colours of the scenery per region. Calmer than actors: nothing here uses the team colours except the gate banner. */
export interface SceneryLook {
  water: number; waterLight: number; bank: number; ice: number; iceLight: number; iceRim: number; dot: number;
  trunk: number; leaves: readonly [number, number, number]; pine: number; pineDark: number; snowCap: number | null;
  rock: number; rockDark: number; land: number; landEdge: number; far: number; farCap: number;
  gateStone: number; gateStoneDark: number; gateTrim: number; gateDark: number;
}
export const SCENERY_LOOK: Record<MapId, SceneryLook> = {
  forest: {
    water: 0x55b3cf, waterLight: 0x8ed3e2, bank: 0x8c7b4f, ice: 0, iceLight: 0, iceRim: 0, dot: 0x8fb466,
    trunk: 0x7a4a26, leaves: [0x3f9a4a, 0x57b552, 0x2f8444], pine: 0x2f7a4f, pineDark: 0x25653f, snowCap: null,
    rock: 0x8d968c, rockDark: 0x6c776f, land: 0x5f8749, landEdge: 0x4b6f3d, far: 0x2f7044, farCap: 0x3f8a4f,
    gateStone: 0x8f9488, gateStoneDark: 0x636a63, gateTrim: 0x4f8a45, gateDark: 0x191228,
  },
  snow: {
    water: 0, waterLight: 0, bank: 0, ice: 0x8fd0ee, iceLight: 0xe2f5fd, iceRim: 0x4b97c8, dot: 0xd6e4ee,
    trunk: 0x5f4634, leaves: [0x2f6f66, 0x3a8076, 0x285f58], pine: 0x2f6f66, pineDark: 0x245a54, snowCap: 0xf1f7fb,
    rock: 0x7f90a6, rockDark: 0x5c6f88, land: 0xa9c2d3, landEdge: 0x8aa7bb, far: 0x8fa6bd, farCap: 0xf1f7fb,
    gateStone: 0x7fc4ea, gateStoneDark: 0x4f93c4, gateTrim: 0xe9f6fd, gateDark: 0x161a36,
  },
};

// ---------- painted ground ----------
const hash = (x: number, z: number, k = 0) => { const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
/** Distance to the nearest speck of a jittered grid (one speck per `cell` m, present with probability `p`). */
function speck(x: number, z: number, cell: number, p: number, k: number): number {
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  if (hash(cx, cz, k) > p) return Infinity;
  return Math.hypot(x - (cx + 0.2 + 0.6 * hash(cx, cz, k + 1)) * cell, z - (cz + 0.2 + 0.6 * hash(cx, cz, k + 2)) * cell);
}
const edgeDistance = (b: Block, x: number, z: number) => Math.min(b.w / 2 - Math.abs(x - b.x), b.d / 2 - Math.abs(z - b.z));
/** Ground colour at a point of a layout: hard-edged bands (plaza, road, road edge, two grass tones), the stream with
 * its bank, ice sheets with a rim and glare streaks, and sparse specks. Sampled into a texture, so edges stay crisp
 * (the old ground interpolated one colour per metre between vertices and looked smeared). */
export function groundPaintAt(map: MapLayout, pal: GroundPalette, look: SceneryLook, x: number, z: number): number {
  if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.radius + 2.2) return pal.plaza;
  for (const b of map.ice) {
    const e = edgeDistance(b, x, z);
    if (e < 0) continue;
    if (e < 0.16) return look.iceRim;
    const streak = (((x * 0.8 + z * 1.6) % 2.6) + 2.6) % 2.6;
    return streak < 0.2 || (streak > 0.5 && streak < 0.6) ? look.iceLight : look.ice;
  }
  let lane = laneDistance(x, z);
  // The road runs on from each lane start to the gate at the field's edge.
  for (const g of GATES) if (Math.abs(x - g.x) < lane && z < g.z) lane = Math.abs(x - g.x);
  if (map.stream) {
    const s = pathDistance(x, z, map.stream.path) - map.stream.half;
    if (onBridge(map, x, z)) { if (s < 0.3) return look.bank; }
    else if (s < 0) {
      if (s > -0.16) return look.waterLight;
      const ripple = (((x * 0.55 + Math.sin(z * 2.1) * 0.5) % 2.2) + 2.2) % 2.2;
      return ripple < 0.5 && Math.abs(s + map.stream.half * 0.55) < 0.07 ? look.waterLight : look.water;
    } else if (s < 0.26) return look.bank;
  }
  if (lane < 1.3) return speck(x, z, 0.8, 0.4, 3) < 0.085 ? pal.roadEdge : pal.road;
  if (lane < 1.56) return pal.roadEdge;
  if (speck(x, z, 1.1, 0.45, 7) < 0.09) return look.dot;
  return Math.sin(x * 0.37 + z * 0.21) + Math.cos(z * 0.31 - x * 0.15) > 0.3 ? pal.grass : pal.grassAlt;
}
export const GROUND_TEXELS_PER_METRE = 16;
/** The ground of a layout as an sRGB texture over the arena (u west → east, v south → north, like the ground mesh).
 * Each texel averages 2×2 samples, so band edges are anti-aliased instead of stepped. */
export function groundTexture(map: MapLayout, pal: GroundPalette, look: SceneryLook, perMetre = GROUND_TEXELS_PER_METRE): DataTexture {
  const w = (ARENA.maxX - ARENA.minX) * perMetre, h = (ARENA.maxZ - ARENA.minZ) * perMetre, data = new Uint8Array(w * h * 4);
  const sub = [0.25, 0.75];
  for (let row = 0, i = 0; row < h; row++) {
    for (let col = 0; col < w; col++, i += 4) {
      let r = 0, g = 0, b = 0;
      for (const dz of sub) for (const dx of sub) {
        const c = groundPaintAt(map, pal, look, ARENA.minX + (col + dx) / perMetre, ARENA.maxZ - (row + dz) / perMetre);
        r += c >> 16; g += (c >> 8) & 255; b += c & 255;
      }
      data[i] = r >> 2; data[i + 1] = g >> 2; data[i + 2] = b >> 2; data[i + 3] = 255;
    }
  }
  const t = new DataTexture(data, w, h, RGBAFormat);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---------- shared primitives (bake() copies them, so one of each is enough) ----------
const G = {
  box: new BoxGeometry(1, 1, 1), trunk: new CylinderGeometry(0.2, 0.28, 1, 6), blob: new IcosahedronGeometry(1, 0), cone: new ConeGeometry(1, 1, 6),
  rock: new DodecahedronGeometry(1, 0), gem: new OctahedronGeometry(1, 0), blade: new ConeGeometry(1, 1, 3), log: new CylinderGeometry(1, 1, 1, 8),
  post: new CylinderGeometry(1, 1.15, 1, 6), crystal: new CylinderGeometry(0.45, 1, 1, 5), lid: new CylinderGeometry(1, 1, 1, 8, 1, false, 0, Math.PI),
  ball: new SphereGeometry(1, 8, 6), mesa: new CylinderGeometry(0.78, 1, 1, 8),
};
const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, rot?: [number, number, number]): Part =>
  ({ geo: G.box, color, at: [x, y, z], scale: [sx, sy, sz], rot });
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- cover models ----------
/** Wall model by kind. Every part stays inside the block's collider; heights: stone/ice ≤ 1.42 m, log ≤ 1 m, outcrop ≤ 3 m. */
export function coverParts(b: Wall, stone: (b: Block) => Part[]): Part[] {
  const r = rng(Math.round((b.x + 40) * 131 + (b.z + 40) * 17) + 5);
  if (b.kind === 'stone') {
    // The stone-and-timber wall, overgrown: moss pads on the cap (inside the collider, under the 1.42 m top).
    const parts = stone(b), alongX = b.w >= b.d, len = alongX ? b.w : b.d, dep = alongX ? b.d : b.w;
    for (let i = 0, n = Math.max(2, Math.round(len * 1.4)); i < n; i++) {
      const o = (r() - 0.5) * (len - 0.6), s = 0.22 + r() * 0.16, q = (r() - 0.5) * (dep - 0.5);
      parts.push(box(b.x + (alongX ? o : q), 1.215, b.z + (alongX ? q : o), alongX ? s : 0.2, 0.07, alongX ? 0.2 : s, i % 2 ? 0x5f9a4a : 0x79b356));
    }
    return parts;
  }
  if (b.kind === 'log') {
    // A fallen trunk lying along the long side: bark, pale cut ends, a branch stub and moss.
    const alongX = b.w >= b.d, len = (alongX ? b.w : b.d) - 0.06, rad = Math.min((alongX ? b.d : b.w) / 2 - 0.02, 0.5);
    const rot: [number, number, number] = alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
    const along = (o: number, y: number, q = 0): [number, number, number] => [b.x + (alongX ? o : q), y, b.z + (alongX ? q : o)];
    const parts: Part[] = [
      { geo: G.log, color: 0x8a5a30, at: along(0, rad * 1.04), rot, scale: [rad, len - 0.1, rad] },
      { geo: G.log, color: 0xe2c08a, at: along(0, rad * 1.04), rot, scale: [rad * 0.8, len, rad * 0.8] },
      { geo: G.log, color: 0x6e4424, at: along(-len * 0.22, rad * 1.04), rot, scale: [rad * 1.04, 0.16, rad * 1.04] },
      { geo: G.log, color: 0x6e4424, at: along(len * 0.3, rad * 1.04), rot, scale: [rad * 1.04, 0.12, rad * 1.04] },
      { geo: G.trunk, color: 0x7a4a26, at: along(len * 0.12, rad * 2 + 0.1), scale: [0.5, 0.3, 0.5] },
    ];
    for (let i = 0; i < 4; i++) parts.push({ geo: G.blob, color: i % 2 ? 0x5f9a4a : 0x79b356, at: along((r() - 0.5) * (len - 0.8), rad * 1.9, (r() - 0.5) * rad * 0.6), scale: [0.24, 0.1, 0.2] });
    return parts;
  }
  if (b.kind === 'ice') {
    // Ice rock: a low stone base with a row of blue crystals, snow on the tips.
    const alongX = b.w >= b.d, len = alongX ? b.w : b.d, dep = alongX ? b.d : b.w, n = Math.max(2, Math.round(len / 0.62));
    const parts: Part[] = [box(b.x, 0.14, b.z, b.w, 0.28, b.d, 0x4f6283), box(b.x, 0.33, b.z, b.w - 0.1, 0.1, b.d - 0.1, 0x6f86a6)];
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + 0.5) * (len / n), rad = Math.min(dep / 2 - 0.06, len / n / 2 - 0.02), h = 0.58 + r() * 0.4;
      const at = (y: number): [number, number, number] => [b.x + (alongX ? o : 0), y, b.z + (alongX ? 0 : o)];
      parts.push({ geo: G.crystal, color: i % 2 ? 0x45a3e0 : 0x6cbcec, at: at(0.36 + h / 2), scale: [rad, h, rad], rot: [0, r() * 3, 0] });
      parts.push({ geo: G.crystal, color: 0xdff1fb, at: at(0.36 + h + 0.03), scale: [rad * 0.46, 0.07, rad * 0.46] });
    }
    return parts;
  }
  // Rock outcrop: a low footing that fills the collider, then two tapering rock masses; snow lies in patches and
  // boulders and ice crystals sit on the south ledge, so it reads as a crag and not as a building.
  const parts: Part[] = [box(b.x, 0.3, b.z, b.w, 0.6, b.d, 0x4f6283), box(b.x, 0.62, b.z, b.w - 0.06, 0.05, b.d - 0.06, 0x6a7f9a)];
  const mass = (cx: number, cz: number, w: number, d: number, y: number, h: number, side: number, top: number, turn: number) => {
    // An 8-sided tapered prism turned by `turn`; its widest corner stays inside w × d.
    parts.push({ geo: G.mesa, color: side, at: [cx, y + h / 2, cz], scale: [w / 2, h, d / 2], rot: [0, turn, 0] });
    parts.push({ geo: G.mesa, color: top, at: [cx, y + h + 0.03, cz], scale: [w / 2 * 0.8, 0.06, d / 2 * 0.8], rot: [0, turn, 0] });
    parts.push({ geo: G.mesa, color: 0xdce9f2, at: [cx - w * 0.06, y + h + 0.09, cz - d * 0.1], scale: [w / 2 * 0.56, 0.07, d / 2 * 0.5], rot: [0, turn + 0.3, 0] });
  };
  const m = Math.min(b.w, b.d);
  mass(b.x, b.z - b.d * 0.06, m * 0.96 * (b.w / m) * 0.92, m * 0.96 * (b.d / m) * 0.82, 0.6, 1.0, 0x5c7190, 0x7c91aa, 0);
  mass(b.x + (r() - 0.5) * b.w * 0.2, b.z - b.d * 0.14, b.w * 0.56, b.d * 0.5, 1.6, 0.9, 0x6a7f9a, 0x8da1b8, 0);
  const edge = (k: number): [number, number] => [b.x + (r() - 0.5) * (b.w - 1.6), b.z + b.d / 2 - 0.42 - k * 0.3];
  for (let i = 0; i < 4; i++) { const [x, z] = edge(r()); parts.push({ geo: G.crystal, color: i % 2 ? 0x45a3e0 : 0x6cbcec, at: [x, 0.6 + 0.4, z], scale: [0.3, 0.8, 0.3], rot: [0, r() * 3, 0] }); }
  for (let i = 0; i < 4; i++) { const [x, z] = edge(r()); parts.push({ geo: G.rock, color: i % 2 ? 0x5c7190 : 0x44587a, at: [x, 0.6 + 0.2, z], scale: [0.4, 0.3, 0.34], rot: [0, r() * 3, 0] }); }
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) parts.push({ geo: G.rock, color: 0x5c7190, at: [b.x + cx * (b.w / 2 - 0.62), 0.85, b.z + cz * (b.d / 2 - 0.62) - (cz > 0 ? 0.5 : 0)], scale: [0.6, 0.5, 0.6], rot: [0, r() * 3, 0] });
  return parts;
}

/** Walk-through hiding cover, in local coordinates of the block centre. Forest: tall grass with a few flowers.
 * Snow: frosted reeds with snow at their feet. Thin blades, so it never reads as a wall. */
export function bushParts(b: Block, id: MapId, seed: number): Part[] {
  const r = rng(seed), snow = id === 'snow';
  const blades = snow ? [0xb4cfe2, 0x93b7d2, 0xdbeaf4] : [0x6bd05a, 0x58c04d, 0x7ddc63];
  const parts: Part[] = [box(0, 0.06, 0, b.w, 0.12, b.d, snow ? 0x7f9fb8 : 0x4cae48)];
  for (let i = 0, n = Math.round(b.w * b.d * 7); i < n; i++) {
    const x = (r() - 0.5) * (b.w - 0.2), z = (r() - 0.5) * (b.d - 0.2), h = 0.8 + r() * 0.5;
    parts.push({ geo: G.cone, color: blades[i % 3], at: [x, h / 2 + 0.05, z], rot: [(r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5], scale: [0.13, h, 0.13] });
  }
  for (let i = 0; i < 5; i++) {
    const x = (r() - 0.5) * (b.w - 0.4), z = (r() - 0.5) * (b.d - 0.4);
    if (snow) { if (i < 3) parts.push({ geo: G.blob, color: 0xe6f0f7, at: [x, 0.15, z], scale: [0.22, 0.1, 0.2] }); }
    else parts.push({ geo: G.gem, color: [0xfff3c4, 0xff9ec4, 0xffd45a][i % 3], at: [x, 1.0 + r() * 0.25, z], scale: 0.11 });
  }
  return parts;
}

/** A plank crate with a frame, or a treasure chest with gold bands. Snow settles on top in the snow region. */
export function crateParts(treasure: boolean, id: MapId): Part[] {
  const s = CRATE.size, snow = id === 'snow', parts: Part[] = [];
  if (!treasure) {
    parts.push(box(0, s / 2, 0, s * 0.94, s * 0.94, s * 0.94, 0xc98a4a));
    for (const y of [0.09, 0.91]) parts.push(box(0, s * y, 0, s, s * 0.16, s, 0x8a5428));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(box(x * s * 0.44, s / 2, z * s * 0.44, s * 0.12, s, s * 0.12, 0x8a5428));
    // A diagonal brace on the two faces the camera sees (south and top).
    parts.push(box(0, s / 2, s * 0.48, s * 0.1, s * 1.0, s * 0.05, 0xa56a36, [0, 0, 0.72]));
    parts.push(box(0, s * 0.99, 0, s * 0.1, s * 0.04, s * 1.0, 0xa56a36, [0, 0.72, 0]));
    if (snow) parts.push({ geo: G.blob, color: 0xe6f0f7, at: [0.06, s * 1.0, -0.08], scale: [s * 0.36, s * 0.07, s * 0.28] });
  } else {
    parts.push(box(0, s * 0.3, 0, s, s * 0.6, s * 0.78, 0x7a4424));
    parts.push({ geo: G.lid, color: 0x9a5a2c, at: [0, s * 0.6, 0], rot: [0, 0, Math.PI / 2], scale: [s * 0.39, s * 0.98, s * 0.39] });
    for (const x of [-0.36, 0, 0.36]) {
      parts.push(box(x * s, s * 0.3, 0, s * 0.1, s * 0.62, s * 0.8, PAL.gold));
      parts.push({ geo: G.lid, color: PAL.gold, at: [x * s, s * 0.6, 0], rot: [0, 0, Math.PI / 2], scale: [s * 0.41, s * 0.1, s * 0.41] });
    }
    parts.push(box(0, s * 0.56, s * 0.4, s * 0.2, s * 0.22, s * 0.06, 0xfff0a8));
    if (snow) parts.push({ geo: G.blob, color: 0xf1f7fb, at: [0.1, s * 0.98, -0.05], scale: [0.3, 0.07, 0.2] });
  }
  return parts;
}

// ---------- scenery ----------
function tree(parts: Part[], look: SceneryLook, x: number, y: number, z: number, s: number, pine: boolean, r: () => number) {
  parts.push({ geo: G.trunk, color: look.trunk, at: [x, y + 0.6 * s, z], scale: [s, 1.2 * s, s] });
  if (!pine) {
    const c = look.leaves, a = r() * 6.28;
    parts.push({ geo: G.blob, color: c[0], at: [x, y + 2.1 * s, z], scale: [1.15 * s, 1.05 * s, 1.15 * s], rot: [0, a, 0] });
    parts.push({ geo: G.blob, color: c[1], at: [x + Math.cos(a) * 0.6 * s, y + 2.5 * s, z + Math.sin(a) * 0.5 * s], scale: 0.78 * s, rot: [0.4, a, 0] });
    parts.push({ geo: G.blob, color: c[2], at: [x - Math.cos(a) * 0.6 * s, y + 1.75 * s, z - Math.sin(a) * 0.5 * s], scale: 0.72 * s, rot: [0, a, 0.5] });
    return;
  }
  for (let i = 0; i < 3; i++) {
    const rad = (1.05 - i * 0.26) * s, h = 1.25 * s, cy = y + (1.25 + i * 0.75) * s;
    parts.push({ geo: G.cone, color: i % 2 ? look.pineDark : look.pine, at: [x, cy, z], scale: [rad, h, rad], rot: [0, i * 0.5, 0] });
    if (look.snowCap !== null) parts.push({ geo: G.cone, color: look.snowCap, at: [x, cy + h * 0.3, z], scale: [rad * 0.46, h * 0.42, rad * 0.46], rot: [0, i * 0.5, 0] });
  }
}
function rock(parts: Part[], look: SceneryLook, x: number, y: number, z: number, s: number, r: () => number) {
  parts.push({ geo: G.rock, color: r() < 0.5 ? look.rock : look.rockDark, at: [x, y + s * 0.35, z], scale: [s, s * 0.7, s * 0.85], rot: [r(), r() * 3, r()] });
  if (look.snowCap !== null) parts.push({ geo: G.blob, color: look.snowCap, at: [x, y + s * 0.82, z], scale: [s * 0.62, s * 0.16, s * 0.54] });
}

/** Enemy gate behind a lane start, on the field's north edge. Forest: a ruined stone arch grown over by a dark
 * thicket. Snow: an arch of ice. Both: a black mouth and an enemy-red banner, so the lane's origin reads at a glance. */
export function gateParts(g: Vec, id: MapId): Part[] {
  const look = SCENERY_LOOK[id], z = ARENA.minZ - 0.62, x = g.x, parts: Part[] = [];
  // The mouth: darker than anything on the field, covering the hedge behind it.
  parts.push(box(x, 1.45, z - 0.1, 3.5, 2.9, 1.5, look.gateDark));
  parts.push(box(x, 0.03, z + 0.6, 3.2, 0.06, 0.4, look.gateDark));
  for (const side of [-1, 1]) {
    const px = x + side * 2.1;
    if (id === 'forest') {
      parts.push(box(px, 0.25, z + 0.1, 1.2, 0.5, 1.5, look.gateStoneDark));
      parts.push(box(px, side < 0 ? 1.75 : 1.45, z + 0.1, 0.95, side < 0 ? 2.6 : 2.0, 1.25, look.gateStone));
      parts.push(box(px, side < 0 ? 3.1 : 2.5, z + 0.1, 1.1, 0.16, 1.4, look.gateTrim));
      parts.push({ geo: G.blob, color: 0x2f6a3c, at: [px + side * 0.9, 0.7, z - 0.1], scale: [0.95, 0.8, 0.7] });
      parts.push({ geo: G.blob, color: 0x24552f, at: [px + side * 1.5, 1.3, z - 0.5], scale: [1.1, 1.2, 1.0], rot: [0, 1, 0] });
    } else {
      parts.push(box(px, 0.2, z + 0.1, 1.3, 0.4, 1.5, look.gateStoneDark));
      parts.push({ geo: G.crystal, color: look.gateStone, at: [px, 1.9, z + 0.1], scale: [0.62, 3.2, 0.62], rot: [0, 0.4, 0] });
      parts.push({ geo: G.crystal, color: 0x9ad6f4, at: [px + side * 0.75, 1.1, z + 0.35], scale: [0.4, 1.6, 0.4], rot: [0, 1.1, side * 0.2] });
      parts.push({ geo: G.blob, color: look.gateTrim, at: [px + side * 0.5, 0.42, z + 0.2], scale: [0.9, 0.3, 0.5] });
    }
  }
  if (id === 'forest') {
    // A cracked lintel, lower on the broken side, with moss on top.
    parts.push(box(x - 0.1, 3.0, z + 0.1, 4.6, 0.55, 1.2, look.gateStone, [0, 0, -0.07]));
    parts.push(box(x - 0.5, 3.33, z + 0.1, 2.6, 0.12, 1.25, look.gateTrim, [0, 0, -0.07]));
    parts.push({ geo: G.blob, color: 0x2f6a3c, at: [x + 1.2, 3.5, z], scale: [1.2, 0.6, 0.9] });
  } else {
    parts.push(box(x, 3.25, z + 0.1, 4.7, 0.5, 1.0, look.gateStone));
    parts.push(box(x, 3.56, z + 0.1, 4.8, 0.14, 1.1, look.gateTrim));
    for (const o of [-1.5, -0.75, 0.75, 1.5]) parts.push({ geo: G.cone, color: 0xbfe6fa, at: [x + o, 2.72, z + 0.5], scale: [0.13, 0.6 + Math.abs(o) * 0.12, 0.13], rot: [Math.PI, 0, 0] });
  }
  // Enemy banner with a horned mark, hanging in the mouth.
  parts.push(box(x, 2.2, z + 0.74, 1.3, 1.25, 0.08, PAL.enemy));
  parts.push({ geo: G.blade, color: PAL.enemy, at: [x, 1.42, z + 0.74], scale: [0.65, 0.5, 0.05], rot: [Math.PI, 0, 0] });
  parts.push(box(x, 2.82, z + 0.76, 1.5, 0.14, 0.12, 0x5a1522));
  parts.push({ geo: G.gem, color: 0x2a0d18, at: [x, 2.2, z + 0.8], scale: [0.3, 0.36, 0.04] });
  for (const side of [-1, 1]) parts.push({ geo: G.blade, color: 0x2a0d18, at: [x + side * 0.3, 2.55, z + 0.8], scale: [0.1, 0.34, 0.03], rot: [0, 0, -side * 0.5] });
  return parts;
}

function bridgeParts(b: Block): Part[] {
  const parts: Part[] = [], n = Math.max(4, Math.round(b.d / 0.5)), step = b.d / n;
  for (let i = 0; i < n; i++) parts.push(box(b.x, 0.07, b.z - b.d / 2 + (i + 0.5) * step, b.w - 0.5, 0.1, step - 0.05, i % 2 ? 0xb7814a : 0xa8713c));
  for (const side of [-1, 1]) {
    parts.push(box(b.x + side * (b.w / 2 - 0.16), 0.17, b.z, 0.22, 0.3, b.d + 0.2, 0x7a4a26));
    for (const end of [-1, 1]) parts.push({ geo: G.post, color: 0x8a5a30, at: [b.x + side * (b.w / 2 - 0.16), 0.4, b.z + end * (b.d / 2 + 0.02)], scale: [0.16, 0.8, 0.16] });
  }
  return parts;
}

/** True when a decoration may stand at (x, z): off the roads, the town, the pads, the hero's start and every element. */
export function decorSpot(map: MapLayout, x: number, z: number, wet = false): boolean {
  if (laneDistance(x, z) < 2.1 || Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.radius + 2.6 || Math.hypot(x - HERO_SPAWN.x, z - HERO_SPAWN.z) < 1.5) return false;
  if (GATES.some(g => Math.abs(x - g.x) < 2.2 && z < g.z + 1)) return false;
  if (PADS.some(p => Math.hypot(x - p.x, z - p.z) < 1.9)) return false;
  if (map.walls.some(b => Math.abs(x - b.x) < b.w / 2 + 0.45 && Math.abs(z - b.z) < b.d / 2 + 0.45)) return false;
  if (map.crates.some(c => Math.hypot(x - c.x, z - c.z) < 1.2) || inBush(map, x, z)) return false;
  if (map.ice.some(b => Math.abs(x - b.x) < b.w / 2 + 0.3 && Math.abs(z - b.z) < b.d / 2 + 0.3)) return false;
  if (map.stream) {
    if (map.stream.bridges.some(b => Math.abs(x - b.x) < b.w / 2 + 0.3 && Math.abs(z - b.z) < b.d / 2 + 0.6)) return false;
    const s = pathDistance(x, z, map.stream.path) - map.stream.half;
    if (wet ? s > -0.25 : s < 0.5) return false;
  }
  return true;
}

export interface Scenery {
  /** Always drawn: gates, bridges, the land and trees around the field. `outlined` is the subset that gets ink. */
  frame: Part[]; outlined: Part[];
  /** High tier only: small decoration on the field and a second row of trees. */
  extra: Part[];
}
/** Everything static around and on a layout that is not cover. Deterministic (seeded), so captures match. */
export function sceneryParts(map: MapLayout): Scenery {
  const look = SCENERY_LOOK[map.id], snow = map.id === 'snow', r = rng(snow ? 77 : 41);
  const land: Part[] = [], outlined: Part[] = [], extra: Part[] = [];
  const north = ARENA.minZ - 1.1, west = ARENA.minX - 1.1, east = ARENA.maxX + 1.1;

  // The mainland the enemy comes from, north of the field, and a far ridge behind it.
  land.push(box(0, -0.66, north - 9, 80, 1.3, 18, look.land), box(0, -0.7, north - 9.2, 81, 1.3, 18.4, look.landEdge));
  for (let i = 0; i < 7; i++) {
    const x = -33 + i * 11 + (r() - 0.5) * 4, h = 7 + r() * 5;
    land.push({ geo: G.cone, color: look.far, at: [x, h / 2 - 0.2, north - 15 - r() * 2], scale: [6 + r() * 2, h, 5], rot: [0, r(), 0] });
    if (snow) land.push({ geo: G.cone, color: look.farCap, at: [x, h * 0.78 - 0.2, north - 15], scale: [2.2, h * 0.45, 1.9] });
  }
  // Islets in the water on both sides: the field is still an island, but no longer alone.
  const islets: [number, number, number][] = [[west - 4.6, -19, 2.6], [west - 5.2, -8, 3.1], [west - 4.4, 3.5, 2.4], [east + 4.6, -15, 2.9], [east + 5.4, -3, 2.5], [east + 4.4, 7, 2.2]];
  for (const [x, z, rad] of islets) {
    land.push({ geo: G.log, color: look.rockDark, at: [x, -0.75, z], scale: [rad, 1.3, rad * 0.85] });
    land.push({ geo: G.log, color: look.land, at: [x, -0.05, z], scale: [rad * 0.93, 0.14, rad * 0.78] });
  }
  for (const g of GATES) outlined.push(...gateParts(g, map.id));
  for (const b of map.stream?.bridges ?? []) outlined.push(...bridgeParts(b));

  // First row of trees right behind the north hedge and on the islets (inked), further rows only at full quality.
  const gateGap = (x: number) => GATES.some(g => Math.abs(x - g.x) < 3.9);
  for (let x = -27; x <= 27; x += 2.3 + r() * 1.2) {
    if (gateGap(x)) continue;
    tree(outlined, look, x, 0, north - 1.6 - r() * 1.4, 1.05 + r() * 0.5, snow || r() < 0.3, r);
  }
  for (const [x, z, rad] of islets) {
    tree(outlined, look, x - rad * 0.3, 0, z - rad * 0.2, 0.9 + r() * 0.4, snow || r() < 0.4, r);
    if (rad > 2.4) tree(outlined, look, x + rad * 0.35, 0, z + rad * 0.25, 0.75 + r() * 0.3, snow || r() < 0.5, r);
    rock(outlined, look, x + rad * 0.1, 0, z + rad * 0.5, 0.5 + r() * 0.3, r);
  }
  for (let i = 0; i < 9; i++) rock(outlined, look, -26 + i * 6.5 + r() * 3, 0, north - 1.2 - r() * 2.5, 0.55 + r() * 0.5, r);
  for (let i = 0; i < 34; i++) {
    const x = -30 + r() * 60, z = north - 4.2 - r() * 7;
    if (gateGap(x) && z > north - 6) continue;
    tree(extra, look, x, 0, z, 1.1 + r() * 0.7, snow || r() < 0.35, r);
  }

  // On the field: small, low, never where anything is played.
  const spot = (wet = false): Vec | null => {
    for (let k = 0; k < 12; k++) {
      const x = ARENA.minX + 0.6 + r() * (ARENA.maxX - ARENA.minX - 1.2), z = ARENA.minZ + 0.6 + r() * (ARENA.maxZ - ARENA.minZ - 1.2);
      if (decorSpot(map, x, z, wet)) return { x, z };
    }
    return null;
  };
  const tuft = (x: number, z: number) => {
    const y = heightAt(x, z);
    for (let k = 0; k < 3; k++) {
      const h = 0.22 + r() * 0.16;
      extra.push({ geo: G.blade, color: snow ? (k % 2 ? 0x8fa9bd : 0x7b97ad) : (k % 2 ? 0x5fa64a : 0x8ccf62), at: [x + (k - 1) * 0.1, y + h / 2, z + (r() - 0.5) * 0.12], scale: [0.06, h, 0.06], rot: [(r() - 0.5) * 0.5, r() * 3, (k - 1) * 0.35] });
    }
  };
  for (let i = 0; i < 120; i++) { const p = spot(); if (p) tuft(p.x, p.z); }
  for (let i = 0; i < 60; i++) {
    const p = spot(); if (!p) continue;
    const s = 0.07 + r() * 0.07;
    extra.push({ geo: G.rock, color: snow ? 0x8097b0 : 0x8f9a80, at: [p.x, heightAt(p.x, p.z) + s * 0.2, p.z], scale: [s, s * 0.45, s * 0.8], rot: [0, r() * 3, 0] });
  }
  if (!snow) {
    // Flower beds: loose clusters of three colours, well off the roads.
    const petals = [0xfff3c4, 0xff9ec4, 0xffd45a, 0xc9a6ff];
    for (let bed = 0; bed < 22; bed++) {
      const c = spot(); if (!c) continue;
      for (let k = 0, n = 4 + Math.floor(r() * 4); k < n; k++) {
        const x = c.x + (r() - 0.5) * 1.5, z = c.z + (r() - 0.5) * 1.2;
        if (!decorSpot(map, x, z)) continue;
        const y = heightAt(x, z), h = 0.16 + r() * 0.12;
        extra.push({ geo: G.blade, color: 0x4f9a45, at: [x, y + h / 2, z], scale: [0.035, h, 0.035] });
        extra.push({ geo: G.gem, color: petals[(bed + (k > 4 ? 1 : 0)) % 4], at: [x, y + h + 0.03, z], scale: [0.085, 0.05, 0.085], rot: [0, r() * 3, 0] });
      }
    }
    // Stones and reeds in the stream.
    for (let i = 0; i < 26; i++) {
      const p = spot(true); if (!p) continue;
      if (i % 3) { const s = 0.16 + r() * 0.16; extra.push({ geo: G.rock, color: i % 2 ? look.rock : look.rockDark, at: [p.x, 0.03, p.z], scale: [s, s * 0.45, s * 0.8], rot: [0, r() * 3, 0] }); }
      else for (let k = 0; k < 3; k++) extra.push({ geo: G.blade, color: 0x4f9a45, at: [p.x + (k - 1) * 0.09, 0.3, p.z], scale: [0.04, 0.6, 0.04], rot: [0, r() * 3, (k - 1) * 0.2] });
    }
  } else {
    // Low snow pillows and ice shards.
    for (let i = 0; i < 40; i++) {
      const p = spot(); if (!p) continue;
      const s = 0.16 + r() * 0.16;
      extra.push({ geo: G.blob, color: 0xcfdfea, at: [p.x, heightAt(p.x, p.z) + 0.01, p.z], scale: [s, 0.06, s * 0.75], rot: [0, r() * 3, 0] });
    }
    for (let i = 0; i < 30; i++) {
      const p = spot(); if (!p) continue;
      const h = 0.22 + r() * 0.2;
      extra.push({ geo: G.gem, color: i % 2 ? 0x8fd0ee : 0xbfe6fa, at: [p.x, heightAt(p.x, p.z) + h * 0.6, p.z], scale: [0.08, h, 0.08], rot: [(r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6] });
    }
  }
  return { frame: [...land, ...outlined], outlined, extra };
}
export const partTriangles = (parts: Part[]) => parts.reduce((n, p) => n + ((p.geo as BufferGeometry).index ? (p.geo as BufferGeometry).index!.count : p.geo.attributes.position.count) / 3, 0);
