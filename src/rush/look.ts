// Render tone ("look") for Arcana Rush: bright toon shading, rim light, ink outlines and baked multi-part meshes.
// Art direction: docs/rush/art-direction.md. Our own palette and shapes; reference games are principles only.
import {
  BackSide, BoxGeometry, BufferAttribute, Color, DataTexture, Euler, Matrix4, MeshBasicMaterial, MeshToonMaterial, NearestFilter, Quaternion,
  RedFormat, Vector3, type BufferGeometry, type Material, type Mesh,
} from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/** Palette tokens. Ground stays calmer than anything you can interact with. */
export const PAL = {
  water: 0x3fb4d8, grass: '#86d35a', grassAlt: '#79c84f', grassDot: '#9be06a', path: '#f3cf8e', pathEdge: '#d39b5a', plaza: '#f6e2b0',
  hedge: 0x3e9e4a, hedgeTop: 0x63c75a, stone: 0x8796bf, stoneTop: 0xd3dcef, stoneFoot: 0x5f6c93,
  ally: 0x2f9bff, enemy: 0xff3d55, gold: 0xffc93c, super: 0xa46bff, ink: 0x1d1433,
  cream: 0xf5e6c6, wood: 0xa8642e, woodDark: 0x6e3c1c,
} as const;

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
export function bakeMatrices(parts: { geo: BufferGeometry; color: number; matrix: Matrix4 }[]): BufferGeometry {
  const c = new Color();
  const geos = parts.map(part => {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
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
    const src = old as Material & { color?: Color; map?: MeshToonMaterial['map'] };
    const m = toon(src.color?.clone() ?? new Color(0xffffff), { rim: 0.3 });
    if (src.map) m.map = src.map;
    old.dispose();
    return m;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
}
