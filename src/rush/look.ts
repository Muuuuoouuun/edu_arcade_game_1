// Render tone ("look") for Arcana Rush: bright toon shading, rim light, ink outlines and baked multi-part meshes.
// Art direction: docs/rush/art-direction.md. Our own palette and shapes; reference games are principles only.
import {
  BackSide, BoxGeometry, BufferAttribute, Color, DataTexture, Euler, Matrix4, MeshBasicMaterial, MeshToonMaterial, NearestFilter, Quaternion,
  RedFormat, Vector3, type BufferGeometry, type Material, type Mesh,
} from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { FOREST_GROUND, type GroundPalette } from './terrainElevation.ts';

/** Palette tokens. Ground stays calmer than anything you can interact with. */
export const PAL = {
  water: 0x3fb4d8, grass: '#86d35a', grassAlt: '#79c84f', grassDot: '#9be06a', path: '#f3cf8e', pathEdge: '#d39b5a', plaza: '#f6e2b0',
  hedge: 0x3e9e4a, hedgeTop: 0x63c75a, stone: 0x8796bf, stoneTop: 0xd3dcef, stoneFoot: 0x5f6c93,
  ally: 0x2f9bff, enemy: 0xff3d55, gold: 0xffc93c, super: 0xa46bff, ink: 0x1d1433,
  cream: 0xf5e6c6, wood: 0xa8642e, woodDark: 0x6e3c1c,
} as const;

/** The two expedition regions (expedition.ts `regionOf`): stages 1-5 and the endless challenge are the forest, 6-10 the snowy mountains. */
export type RegionName = 'forest' | 'snow';
/** Everything in the battle scene that changes with the region. Team colours, ink and the heroes never do. */
export interface RegionLook {
  water: number; ground: GroundPalette;
  hedge: number; hedgeTop: number;
  /** Tall-grass cover: the patch underneath and three blade colours. */
  bushBase: number; bushBlades: readonly [number, number, number];
  /** Snow lying on the upward faces of walls and town roofs; null = none. */
  cap: number | null;
  /** Wall stone leans this far (0-1) toward `wallCool`. */
  wallMix: number; wallCool: number;
  hemiSky: number; hemiGround: number;
  /** Multiplied into every enemy body (one shared material, set per battle). */
  enemyTint: number;
  /** Frost cues (slow ring, ice shell, snowball landing): pale in the forest, deeper on snow where pale would vanish. */
  frostRing: number; ice: number; iceOpacity: number; frostFx: number;
  /** Aim previews: white fan and pale landing ring in the forest, ink-blue on snow. */
  aimFan: number; aimLob: number;
  /** Falling snowflakes at full quality (0 = none). */
  snowfall: number;
}
export const REGION_LOOK: Record<RegionName, RegionLook> = {
  forest: {
    water: PAL.water, ground: FOREST_GROUND, hedge: PAL.hedge, hedgeTop: PAL.hedgeTop,
    bushBase: 0x4cae48, bushBlades: [0x6bd05a, 0x58c04d, 0x7ddc63],
    cap: null, wallMix: 0, wallCool: 0xffffff, hemiSky: 0xe6f6ff, hemiGround: 0x9c8a62, enemyTint: 0xffffff,
    frostRing: 0x8fe6ff, ice: 0xc4f2ff, iceOpacity: 0.4, frostFx: 0xc4f2ff, aimFan: 0xffffff, aimLob: 0xc4f2ff, snowfall: 0,
  },
  // Snowy mountains: a calm blue-grey field (never pure white, so white actors, snowballs and frost cues still show),
  // a paler packed-snow road with a slate edge, icy water. Reference: the old campaign's snow villages, toned down.
  snow: {
    water: 0x86c3d6,
    ground: {
      plaza: 0xc6d4da, road: 0xd0dde2, roadEdge: 0x86a3b3, grass: 0xb4cbdb, grassAlt: 0xa6c0d2,
      rock: 0x8394a8, rockAlt: 0x6f8196, rockFoot: 0x4a5d78, rim: 0xa6c0d2,
    },
    hedge: 0x3f7f78, hedgeTop: 0xe9f2f8,
    bushBase: 0xa9bfd0, bushBlades: [0xdbe8f2, 0xc9dbe9, 0xeef5fa],
    cap: 0xe9f2f8, wallMix: 0.35, wallCool: 0x8fa0c0, hemiSky: 0xe8f6ff, hemiGround: 0x8f9fb5, enemyTint: 0xd4deee,
    frostRing: 0x1aa0d8, ice: 0x5cc4f5, iceOpacity: 0.55, frostFx: 0x49b6e6, aimFan: 0x24406e, aimLob: 0x1f8fd0, snowfall: 140,
  },
};
/** Boss body colours. Only the last stage of a region has a named boss (stage 5 elder tree king, stage 10 frost lord);
 * every other boss wave keeps the default purple. Eyes stay enemy red in all three. */
export interface BossLook { cape: number; trunk: number; chest: number; head: number; crown: number; arm: number; fist: number; kill: number }
export type BossName = 'default' | RegionName;
export const BOSS_LOOK: Record<BossName, BossLook> = {
  default: { cape: 0x8a1f3a, trunk: 0x4b3a8a, chest: 0x6d55c4, head: 0x2a1f4d, crown: PAL.gold, arm: 0x6d55c4, fist: 0x9d83ff, kill: 0x6d55c4 },
  // Bark and moss: dark bark trunk, mossy shoulders and arms, leaf-green fists, an autumn-amber crown.
  forest: { cape: 0x7a2a1e, trunk: 0x5a3a22, chest: 0x7d5a34, head: 0x3a2616, crown: 0xf2b23a, arm: 0x4f7d3a, fist: 0x9ccf4a, kill: 0x7d5a34 },
  // Ice-blue and white over dark ink-navy; the crimson cape and red eyes keep it on the enemy team.
  snow: { cape: 0x8a1f3a, trunk: 0x232c5c, chest: 0x62b4ee, head: 0x1a2044, crown: 0xe6f8ff, arm: 0x62b4ee, fist: 0xf2fbff, kill: 0x62b4ee },
};

let gradient: DataTexture | null = null;
/** Three hard light bands: shadow, mid, lit. */
function toonGradient(): DataTexture {
  if (gradient) return gradient;
  gradient = new DataTexture(new Uint8Array([105, 185, 255]), 3, 1, RedFormat);
  gradient.minFilter = gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

/** Toon material with an optional fresnel rim that lifts silhouettes off the ground. */
export function toon(color: number | Color = 0xffffff, opts: { vertexColors?: boolean; rim?: number; emissive?: number } = {}): MeshToonMaterial {
  const m = new MeshToonMaterial({ color, gradientMap: toonGradient(), vertexColors: !!opts.vertexColors, emissive: opts.emissive ?? 0x000000 });
  const rim = opts.rim ?? 0.32;
  if (rim > 0) {
    m.onBeforeCompile = shader => {
      shader.uniforms.rimStrength = { value: rim };
      shader.fragmentShader = 'uniform float rimStrength;\n' + shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        'float rimF = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );\n' +
        'outgoingLight += vec3( 1.0, 0.97, 0.9 ) * rimStrength * pow( rimF, 2.6 );\n#include <opaque_fragment>',
      );
    };
    m.customProgramCacheKey = () => `toon-rim-${rim}`;
  }
  return m;
}

const outlineCache = new Map<string, MeshBasicMaterial>();
/** Inverted-hull ink outline: back faces pushed out along smoothed normals (object units). */
export function outlineMaterial(width: number, color: number = PAL.ink): MeshBasicMaterial {
  const key = `${width}:${color}`;
  let m = outlineCache.get(key);
  if (m) return m;
  m = new MeshBasicMaterial({ color, side: BackSide });
  m.onBeforeCompile = shader => {
    shader.uniforms.outlineWidth = { value: width };
    shader.vertexShader = 'uniform float outlineWidth;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', 'vec3 transformed = vec3( position ) + normal * outlineWidth;');
  };
  m.customProgramCacheKey = () => `outline-${width}`;
  outlineCache.set(key, m);
  return m;
}

/** Hull geometry with fully averaged normals so box corners do not crack open. */
export const hullGeometry = (geo: BufferGeometry): BufferGeometry => toCreasedNormals(geo.clone(), Math.PI);

export type Part = {
  geo: BufferGeometry; color: number;
  at?: [number, number, number]; rot?: [number, number, number]; scale?: number | [number, number, number];
};

/** A solid cover block remains inside its simulation footprint and the original 1.42m height. */
export function wallParts(b:{x:number;z:number;w:number;d:number}):Part[] {
  const parts:Part[]=[];
  const alongX=b.w>=b.d, length=alongX?b.w:b.d, depth=alongX?b.d:b.w;
  const part=(offset:number,y:number,span:number,height:number,thickness:number,color:number) => {
    parts.push({geo:new BoxGeometry(alongX?span:thickness,height,alongX?thickness:span),color,
      at:[b.x+(alongX?offset:0),y,b.z+(alongX?0:offset)]});
  };
  part(0,.09,length,.18,depth,0x596e67); // grounded stone foot
  part(0,.62,length-.08,.88,depth-.08,0x687a72); // mortar between inset stones
  const inside=length-.12, half=inside/2, step=.78, gap=.045;
  for(let row=0;row<2;row++) {
    // Offset the second course; clip end pieces instead of crossing the collider.
    for(let start=-half-(row?step/2:0);start<half;start+=step) {
      const left=Math.max(-half,start),right=Math.min(half,start+step-gap);
      if(right-left<.09)continue;
      part((left+right)/2,.40+row*.42,right-left,.36,depth-.04,
        (row+Math.round((start+half)/step))%2?0xb4b6a0:0x9fa995);
    }
  }
  // Teal timber and paired stone end posts echo the forest gate palette.
  part(0,1.105,length-.08,.16,depth-.08,0x347970);
  const post=Math.min(.24,length*.2);
  for(const side of [-1,1]) {
    const offset=side*(length/2-post/2);
    part(offset,.65,post,.96,depth-.02,0x87988a);
    part(offset,1.205,post,.22,depth-.02,0xd7d2b3);
  }
  return parts;
}
/** Vertex colours bake(parts) would produce, without keeping the geometry: a second colour set for the same mesh. */
export function bakeColors(parts: Part[]): Float32Array {
  const g = bake(parts), out = g.getAttribute('color').array as Float32Array;
  g.dispose();
  return out;
}
/** Lean a colour toward another (in the renderer's working space). */
export function mixHex(a: number, b: number, t: number): number { return new Color(a).lerp(new Color(b), t).getHex(); }
/** Paint the upward faces (normal.y above `minNy`, at or above height `minY`) of a colour set: snow that settled on top.
 * `mix` below 1 leaves some of the colour underneath showing (the town keeps its team-blue roofs under a dusting). */
export function capColors(geo: BufferGeometry, colors: BufferAttribute, cap: number, minNy = 0.7, minY = -Infinity, mix = 1): void {
  const n = geo.getAttribute('normal'), p = geo.getAttribute('position'), c = new Color(cap);
  if (!n) return;
  const old = colors as unknown as BufferAttribute;
  for (let i = 0; i < p.count; i++) if (n.getY(i) > minNy && p.getY(i) >= minY) {
    if (mix >= 1) colors.setXYZ(i, c.r, c.g, c.b);
    else colors.setXYZ(i, old.getX(i) + (c.r - old.getX(i)) * mix, old.getY(i) + (c.g - old.getY(i)) * mix, old.getZ(i) + (c.b - old.getZ(i)) * mix);
  }
}

/** Bake several coloured primitives into one vertex-coloured geometry: one draw call per object. */
export function bake(parts: Part[]): BufferGeometry {
  const q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3();
  return bakeMatrices(parts.map(part => {
    e.set(...(part.rot ?? [0, 0, 0]));
    const sc = part.scale ?? 1;
    const matrix = new Matrix4().compose(p.set(...(part.at ?? [0, 0, 0])), q.setFromEuler(e), typeof sc === 'number' ? s.set(sc, sc, sc) : s.set(...sc));
    return { geo: part.geo, color: part.color, matrix };
  }));
}

/** Same as bake(), with an explicit transform per part (used to merge an imported model's meshes). */
export function bakeMatrices(parts: { geo: BufferGeometry; color: number; matrix: Matrix4 }[], preserveUv = false): BufferGeometry {
  const c = new Color();
  const geos = parts.map(part => {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(preserveUv && name === 'uv')) g.deleteAttribute(name);
    if (preserveUv && !g.getAttribute('uv')) throw new Error('textured model part is missing UV coordinates');
    g.applyMatrix4(part.matrix);
    c.set(part.color);
    const n = g.attributes.position.count, colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  if (!merged) throw new Error('bake: incompatible parts');
  return merged;
}

/** Convert an imported model's materials to the toon look, keeping base colour and texture. */
export function toonify(mesh: Mesh): void {
  const convert = (old: Material): Material => {
    const src = old as Material & { color?: Color; map?: MeshToonMaterial['map']; normalMap?: MeshToonMaterial['normalMap']; normalScale?: MeshToonMaterial['normalScale'] };
    const m = toon(src.color?.clone() ?? new Color(0xffffff), { rim: 0.3 });
    if (src.map) m.map = src.map;
    if (src.normalMap) m.normalMap = src.normalMap;
    if (src.normalScale) m.normalScale.copy(src.normalScale);
    old.dispose();
    return m;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
}
