// Frame-level look shared by the battle and the town island: the key light and its shadow map, which meshes cast and
// receive, the stylised water, and the per-region light colours. The finishing pass is post.ts; shaders of the toon
// bands are toonShader.ts. Nothing here knows about enemies, towers or terrain layout.
import {
  Color, DirectionalLight, ShaderMaterial, Vector3, Vector4, type InstancedMesh, type Material, type Mesh, type Object3D,
  type PerspectiveCamera, type Scene,
} from 'three';
import type { RegionName, ToonRole } from './look.ts';
import { OUTLINE_VIEW, setToonDetail, TOON_LIGHT, toonDetail } from './toonShader.ts';
import type { Grade } from './post.ts';

/** Direction toward the sun: high in the north-west. Tops and west faces are lit, the camera-facing south faces sit in
 * the mid band, east faces in the cool shade, and shadows fall toward the camera's right where they are seen. */
export const SUN_DIR = new Vector3(-0.62, 0.74, -0.26).normalize();

/** Light and finish per region. Region palettes (ground, water, hemisphere fill) stay in look.ts `REGION_LOOK`; this
 * table only holds what the frame adds on top, so the two can change independently. */
export interface FrameLook {
  /** Key light colour and strength: warm in the forest, paler on snow. */
  sun: number; sunIntensity: number;
  /** Key-light multipliers of the shade and mid toon bands, and the rim colour. */
  shade: readonly [number, number, number]; mid: readonly [number, number, number]; rim: number;
  /** Depth of the drifting cloud shadows on the ground (0 = none). */
  clouds: number;
  /** Water: multiplier toward open water, and the foam / cloud-reflection colour. */
  deep: readonly [number, number, number]; foam: number;
  grade: Grade;
}
export const FRAME_LOOK: Record<RegionName, FrameLook> = {
  forest: {
    sun: 0xfff1d8, sunIntensity: 2.3, shade: [0.33, 0.45, 0.9], mid: [0.76, 0.80, 0.93], rim: 0xfff0d2, clouds: 0.5,
    deep: [0.62, 0.80, 0.96], foam: 0xf4fdff,
    grade: { saturation: 1.06, contrast: 0.2, gain: [1.015, 1.0, 0.985], vignette: 0.2, bloom: 0.9 },
  },
  // Snow: a paler sun and bluer shade; less added saturation so the calm blue-grey field stays calm.
  snow: {
    sun: 0xfff3e2, sunIntensity: 2.25, shade: [0.40, 0.52, 0.90], mid: [0.78, 0.83, 0.95], rim: 0xf2f8ff, clouds: 0.4,
    deep: [0.70, 0.84, 0.97], foam: 0xffffff,
    grade: { saturation: 1.06, contrast: 0.2, gain: [1.0, 1.0, 1.01], vignette: 0.2, bloom: 0.9 },
  },
};

/** Push a region's light colours into the shared toon uniforms. */
export function applyToonLight(look: FrameLook): void {
  TOON_LIGHT.shade.value.setRGB(...look.shade);
  TOON_LIGHT.mid.value.setRGB(...look.mid);
  TOON_LIGHT.rim.value.setHex(look.rim);
  TOON_LIGHT.ground.value.z = look.clouds;
}
const waters = new Set<WaterMaterial>();
/** Surface detail tier switch: anti-aliased toon bands, painted ground and cloud shadows (toonShader.ts), and the
 * water's rings, cloud reflections and glints. Compiled in or out, so the low tier's shaders carry none of it. */
export function setSurfaceDetail(on: boolean): void {
  setToonDetail(on);
  for (const m of waters) if (('WATER_DETAIL' in m.defines) !== on) {
    if (on) m.defines.WATER_DETAIL = ''; else delete m.defines.WATER_DETAIL;
    m.needsUpdate = true;
  }
}
export function setSurfaceTime(seconds: number): void { TOON_LIGHT.ground.value.y = seconds; }
/** Tell the outlines how tall the drawing buffer is (their minimum thickness is in buffer pixels). */
export function setOutlineViewport(bufferHeight: number): void { OUTLINE_VIEW.value.x = Math.max(1, bufferHeight / 2); }

/** Side of the square the shadow map must cover: the visible ground around `focus` plus room for tall casters just
 * outside the view. Pure, for tests: `corners` are the four view-frustum corner rays hitting the ground. */
export function shadowHalfExtent(corners: readonly { x: number; z: number }[], focus: { x: number; z: number }, margin = 3.5): number {
  let r = 0;
  for (const c of corners) r = Math.max(r, Math.hypot(c.x - focus.x, c.z - focus.z));
  return Math.ceil((r + margin) * 2) / 2;
}
/** Snap a light-space coordinate to whole shadow texels, so the map does not swim while the camera follows the hero. */
export const snapToTexel = (v: number, half: number, mapSize: number) => { const texel = (2 * half) / mapSize; return Math.round(v / texel) * texel; };

const rigs = new Set<SunRig>();
/** Real shadows on or off for every rig (0 = off: blob shadows only). */
export function setShadowQuality(mapSize: number): void { for (const r of rigs) r.setShadows(mapSize); }
/** Cycle 101: a following rig redraws its shadow map (and moves its shadow box with it) once every this many frames.
 * 2 halves the shadow pass; a shadow is then at most one frame behind its caster (9 cm for the hero at full run). */
let shadowEvery = 2;
export function setShadowEvery(n: number): void { shadowEvery = Math.max(1, Math.round(n) || 1); }

/** The key light of one scene, with a square orthographic shadow box that follows a focus point. */
export class SunRig {
  readonly sun = new DirectionalLight(0xffffff, 2.3);
  private half = 0;
  private mapSize = 0;
  private right = new Vector3();
  private up = new Vector3();
  private p = new Vector3();
  private ray = new Vector3();
  private corners = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];

  /** Frames since the shadow map was last drawn (following rigs only). */
  private skipped = 0;
  /** `still`: a scene that rarely changes (the town island). Its shadow map is drawn only after `refresh()`. */
  constructor(scene: Scene, still = false) {
    // The same basis three builds for the shadow camera (lookAt with +y up).
    this.right.crossVectors(new Vector3(0, 1, 0), SUN_DIR).normalize();
    this.up.crossVectors(SUN_DIR, this.right).normalize();
    this.sun.position.copy(SUN_DIR).multiplyScalar(40);
    const s = this.sun.shadow;
    s.camera.near = 4; s.camera.far = 80;
    // The ground never casts, so it cannot shadow itself; the small biases only keep walls and towers clean.
    s.bias = -0.0004; s.normalBias = 0.035;
    // Drawn on demand: a still rig after refresh(), a following rig every `shadowEvery` frames from follow().
    s.autoUpdate = false;
    s.needsUpdate = !still;
    scene.add(this.sun, this.sun.target);
    rigs.add(this);
  }
  /** Redraw a still rig's shadow map on the next frame (something that casts moved, appeared or changed shape). */
  refresh() { this.sun.shadow.needsUpdate = true; }
  get shadows() { return this.mapSize > 0; }
  setLook(look: FrameLook) { this.sun.color.setHex(look.sun); this.sun.intensity = look.sunIntensity; }
  setShadows(mapSize: number) {
    if (mapSize === this.mapSize) return;
    this.mapSize = mapSize;
    // Toggling castShadow changes the light state, so three recompiles the lit materials with or without shadow code.
    this.sun.castShadow = mapSize > 0;
    const s = this.sun.shadow;
    if (mapSize > 0) s.mapSize.set(mapSize, mapSize);
    if (s.map) { s.map.dispose(); (s as { map: unknown }).map = null; }
    s.needsUpdate = true;
    this.half = 0;
  }
  /** Fixed shadow box (the town island): centre and half-size in metres. */
  cover(cx: number, cy: number, cz: number, half: number) { this.place(cx, cy, cz, half); }
  /** Shadow box around what a perspective camera sees of the ground plane at height `focus.y`. */
  follow(camera: PerspectiveCamera, focus: Vector3): boolean {
    if (!this.shadows) return false;
    // Between redraws the box stays where its map was drawn: moving it alone would read the old map through a new
    // matrix and slide every shadow for a frame. Returns whether this frame redraws (callers skip their own prep).
    if (++this.skipped < shadowEvery && this.half > 0) return false;
    this.skipped = 0;
    this.sun.shadow.needsUpdate = true;
    let i = 0;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      this.ray.set(sx, sy, 0.5).unproject(camera).sub(camera.position).normalize();
      // A ray that misses the ground (never with the battle camera) is cut off at 60 m.
      const t = this.ray.y < -1e-3 ? Math.min(60, (focus.y - camera.position.y) / this.ray.y) : 60;
      const c = this.corners[i++];
      c.x = camera.position.x + this.ray.x * t; c.z = camera.position.z + this.ray.z * t;
    }
    // Keep the box size while the view only shakes or drifts a little: a new size changes the texel grid.
    const want = shadowHalfExtent(this.corners, focus);
    const half = want > this.half || want < this.half - 2 ? want : this.half;
    this.place(focus.x, focus.y, focus.z, half);
    return true;
  }
  private place(cx: number, cy: number, cz: number, half: number) {
    if (!this.shadows) return;
    const cam = this.sun.shadow.camera;
    if (half !== this.half) {
      this.half = half;
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.updateProjectionMatrix();
    }
    const p = this.p.set(cx, cy, cz), u = p.dot(this.right), v = p.dot(this.up);
    p.addScaledVector(this.right, snapToTexel(u, half, this.mapSize) - u).addScaledVector(this.up, snapToTexel(v, half, this.mapSize) - v);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(SUN_DIR, 40);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }
}

const roleOf = (m: Material | Material[]): ToonRole | undefined => (Array.isArray(m) ? m[0] : m)?.userData.toon as ToonRole | undefined;
/** Decide who casts and who receives, from the material alone, so every lane's meshes take part without a flag at each
 * creation site: solid toon meshes cast and receive; flat scenery (ground, rock skirt) only receives; instanced actors
 * and everything under `actors` (the hero) only cast, so characters stay bright wherever they stand. Ink hulls, effects
 * and HUD quads (basic materials) do neither. `userData.noShadow` on an object opts it out; `userData.noCast` keeps it
 * receiving but not casting. Cheap enough to run every
 * frame (a few hundred property writes), which also covers towers, models and props added later. */
export function markShadows(root: Object3D, actors?: Object3D | null): void { visitShadows(root, false, actors ?? null); }
function visitShadows(o: Object3D, actor: boolean, actors: Object3D | null): void {
  const mesh = o as Mesh;
  if (mesh.isMesh && !o.userData.noShadow) {
    const role = roleOf(mesh.material);
    if (role) {
      // `userData.noCast` (cycle 100): receives but does not cast (walk-through grass, small field decoration).
      mesh.castShadow = role === 'solid' && !o.userData.noCast;
      mesh.receiveShadow = !actor && !(mesh as InstancedMesh).isInstancedMesh;
    }
  }
  const kids = o.children;
  for (let i = 0; i < kids.length; i++) visitShadows(kids[i], actor || kids[i] === actors, actors);
}

export type WaterMaterial = ShaderMaterial & { color: Color };
/** Stylised water: turquoise shallows that deepen away from the shore, a foam band with rings that drift outward, and
 * (high tier) soft cloud reflections and glints. `shore` is a rounded box in world x/z: centre, half-size and corner
 * radius (a circle is a zero-size box with a radius). `material.color` is the region's water colour, as on the toon
 * material it replaces. Unlit. Low tier: the depth tint and the foam band only (two sines), no more than the lit toon
 * water it replaces. High tier adds the rings, three noise lookups and the glint grid. */
export function waterMaterial(shore: { x: number; z: number; hx: number; hz: number; r: number }): WaterMaterial {
  const color = new Color(0x3fb4d8);
  const m = new ShaderMaterial({
    uniforms: {
      uColor: { value: color }, uDeep: { value: new Vector3(0.62, 0.8, 0.96) }, uFoam: { value: new Color(0xf4fdff) },
      uShore: { value: new Vector4(shore.x, shore.z, shore.hx, shore.hz) }, uRound: { value: shore.r }, uAnim: TOON_LIGHT.ground,
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vWorld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4( vWorld, 1.0 );
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec4 uShore; uniform float uRound; uniform vec3 uAnim;
      varying vec3 vWorld;
      float hash( vec2 p ) { p = fract( p * vec2( 0.1031, 0.1030 ) ); p += dot( p, p.yx + 33.33 ); return fract( ( p.x + p.y ) * p.x ); }
      float noise( vec2 p ) {
        vec2 i = floor( p ), f = fract( p );
        f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
      }
      void main() {
        vec2 p = vWorld.xz;
        float t = uAnim.y, px = length( fwidth( p ) );
        vec2 q = abs( p - uShore.xy ) - uShore.zw;
        // Metres from the shore line, positive on open water.
        float d = length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uRound;
        vec3 col = mix( uColor * 1.08, uColor * uDeep, smoothstep( 0.4, 10.0, d ) );
        float wob = sin( p.x * 0.9 + t * 0.8 ) * 0.5 + sin( p.y * 1.1 - t * 0.6 ) * 0.5;
        #ifdef WATER_DETAIL
          // Puffy clouds mirrored in the water, drifting with the cloud shadows on the land.
          float c = noise( p * 0.055 + vec2( t * 0.016, t * 0.006 ) ) * 0.7 + noise( p * 0.13 - vec2( t * 0.011, 0.0 ) ) * 0.3;
          col = mix( col, uFoam, smoothstep( 0.5, 0.66, c ) * 0.14 );
          // Glints: short bright dashes in about a quarter of the cells of a grid that slides and bends with the swell.
          vec2 gq = vec2( p.x * 0.55 + t * 0.14 + sin( p.y * 0.7 ) * 0.9, p.y * 1.5 + sin( p.x * 0.45 + t * 0.3 ) * 0.7 );
          vec2 gc = floor( gq ), gf = fract( gq ) - 0.5;
          float gh = hash( gc );
          float dash = ( 1.0 - smoothstep( 0.07, 0.07 + px * 1.5, abs( gf.y ) ) ) * ( 1.0 - smoothstep( 0.10 + gh * 0.16, 0.12 + gh * 0.16 + px * 0.55, abs( gf.x ) ) );
          col = mix( col, uFoam, step( 0.88, gh ) * dash * ( 0.32 + 0.25 * sin( t * 1.3 + gh * 40.0 ) ) );
        #endif
        // Foam: a wobbling band on the shore and (high tier) two rings that travel outward and fade.
        float edge = d + wob * 0.13;
        float foam = 1.0 - smoothstep( 0.36 - px, 0.36 + px, edge );
        #ifdef WATER_DETAIL
          for ( int i = 0; i < 2; i ++ ) {
            float ph = fract( t * 0.13 + float( i ) * 0.5 );
            float ring = 1.0 - smoothstep( 0.05, 0.05 + px * 1.5, abs( edge - 0.6 - ph * 2.0 ) );
            foam = max( foam, ring * ( 1.0 - ph ) * 0.8 );
          }
        #endif
        col = mix( col, uFoam, foam );
        gl_FragColor = vec4( col, 1.0 );
        #include <colorspace_fragment>
      }`,
  }) as WaterMaterial;
  m.color = color;
  if (toonDetail()) m.defines.WATER_DETAIL = '';
  waters.add(m);
  m.addEventListener('dispose', () => waters.delete(m));
  return m;
}
/** A region's water tones on a water material (its base colour is set through `material.color`). */
export function setWaterLook(m: WaterMaterial, look: FrameLook): void {
  (m.uniforms.uDeep.value as Vector3).set(...look.deep);
  (m.uniforms.uFoam.value as Color).setHex(look.foam);
}
