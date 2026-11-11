// Three.js view of the Arcana Rush simulation. Reads RushState, never writes it.
import {
  AnimationMixer, Box3, BufferAttribute, DodecahedronGeometry, BoxGeometry, CanvasTexture, CapsuleGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry,
  DirectionalLight, Group, HemisphereLight, LoopOnce, Mesh, MeshBasicMaterial, OctahedronGeometry, PerspectiveCamera, Plane,
  PlaneGeometry, Raycaster, RingGeometry, Scene, SphereGeometry, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
  Matrix4, Object3D, Quaternion, Euler, Frustum, Sphere, type AnimationAction, type BufferGeometry, type Material,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
// Rush-only meshopt copies of the shared campaign models (decision 2026-11-11, cycle 43; made by tools/rush-glb.sh).
import rangerGlb from './models/gecko-ranger.glb?url';
import bronGlb from './models/dwarf-guardian.glb?url';
import bearGlb from './models/polar-bear.glb?url';
import { ARENA, BUSHES, CRATE, CRATES, ENEMIES, HEROES, LANES, PADS, TOWER_LEVELS, TOWN, WALLS, type EnemyKind, type HeroDef, type HeroKind, type TowerBranch, type Vec } from './data.ts';
import { heroDef, heroHidden, heroMaxHp, lobReach, padInReach, type Enemy, type RushEvent, type RushState, type Shot } from './sim.ts';
import { bake, bakeMatrices, hullGeometry, outlineMaterial, PAL, toon, toonify, type Part } from './look.ts';
import { Batch } from './batch.ts';
import { Particles } from './fx.ts';
import { QUALITY, type Quality } from './quality.ts';

export type AimPreview = { kind: 'fire'; dir: Vec } | { kind: 'lob'; offset: Vec } | { kind: 'super'; offset: Vec } | null;

const TEAM = { ally: PAL.ally, enemy: PAL.enemy };
const HERO_MODELS: Record<HeroKind, string> = { ranger: rangerGlb, bron: bronGlb, bear: bearGlb };
const heroLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
/** The meshopt copies carry quantized positions and normals (normalized Int16/Int8, often interleaved). Baking writes
 * transformed values back into the same array type, which would clip them (cycle 31: broken parts), so the hero's
 * meshes go back to plain float32 before anything else touches them. */
function toFloat32(mesh: Mesh) {
  for (const name of ['position', 'normal'] as const) {
    const a = mesh.geometry.getAttribute(name);
    if (!a || (a.array instanceof Float32Array && !('isInterleavedBufferAttribute' in a))) continue;
    const f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
    mesh.geometry.setAttribute(name, new BufferAttribute(f, 3));
  }
}
const HERO_HEIGHT = 2.0;
/** Yaw that turns the GLB authored front (-z) toward simulation angle 0 (+x). Verified by east/north close-up renders. */
const HERO_MODEL_YAW = -Math.PI / 2;
/** The same sphere, cone or cylinder with half its round segments (min 6 around, 4 down); other shapes as they are. */
function fewerSegments(geo: BufferGeometry): BufferGeometry {
  const g = geo as BufferGeometry & { type: string; parameters?: Record<string, number> }, q = g.parameters;
  if (!q) return geo;
  const half = (n: number, min: number) => Math.max(min, Math.round(n / 2));
  if (g.type === 'SphereGeometry') return new SphereGeometry(q.radius, half(q.widthSegments, 6), half(q.heightSegments, 4));
  if (g.type === 'ConeGeometry') return new ConeGeometry(q.radius, q.height, half(q.radialSegments, 6));
  if (g.type === 'CylinderGeometry') return new CylinderGeometry(q.radiusTop, q.radiusBottom, q.height, half(q.radialSegments, 6));
  return geo;
}
/** Per-hero tweaks to a shared campaign GLB (cycle 41), applied when baking; the files stay untouched. Names are
 * GLTFLoader's (spaces → underscores). Popo's polar-bear guardian drops its hammer (handle, iron head, ivory cap)
 * and holds a snowball on the same animated node, so the attack clip becomes an overhand throw. */
const HERO_DROP: Partial<Record<HeroKind, string[]>> = { bear: ['Polar_bear_surface_24', 'Polar_bear_surface_25', 'Polar_bear_surface_26'] };
const HERO_PROPS: Partial<Record<HeroKind, { node: string; parts: { geo: BufferGeometry; color: number; at: [number, number, number] }[] }>> = {
  bear: { node: 'hammer', parts: [{ geo: new SphereGeometry(0.42, 14, 10), color: 0xf4fbff, at: [0, -0.4, -0.15] }] },
};

const basic = (color: number, opacity = 1) => new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
/** Sim angle a → Three.js yaw for an object whose front is +x. */
const yaw = (a: number) => -a;

type Bar = { root: Group; fill: Mesh; width: number };
type Fx = { mesh: Mesh; age: number; life: number; grow: number; fade: number; y0: number };

export class RushView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(42, 1, 0.5, 120);
  private focus = new Vector3(0, 0, 4);
  private shake = 0;
  private hero = new Group();
  private heroBody = new Group();
  /** Team-blue cape per hero (cycle 29): the ally colour on the body itself, not only the ring underfoot. */
  private capes = new Map<HeroKind, Mesh>();
  private heroBar: Bar;
  private ammoSegs: Mesh[] = [];
  /** One loaded model per hero kind; only the current hero's rig is visible. */
  private heroRigs = new Map<HeroKind, { holder: Group; mixer: AnimationMixer | null; shot: AnimationAction | null; held: Mesh | null } | 'loading'>();
  private heroKind: HeroKind | null = null;
  private heroPlaceholder: Mesh | null = null;
  private get heroRig() { const r = this.heroKind ? this.heroRigs.get(this.heroKind) : undefined; return r && r !== 'loading' ? r : null; }
  private get heroMixer() { return this.heroRig?.mixer ?? null; }
  private get heroShot() { return this.heroRig?.shot ?? null; }
  private enemyKits = new Map<EnemyKind, { body: BufferGeometry; hull: BufferGeometry }>();
  private towerKits = new Map<string, { base: BufferGeometry; baseHull: BufferGeometry; head: BufferGeometry; headHull: BufferGeometry; h: number }>();
  private towers: (Group | null)[] = PADS.map(() => null);
  private towerLevels: string[] = PADS.map(() => '');
  private padRings: Mesh[] = [];
  private townBar: Bar;
  private fx: Fx[] = [];
  private particles: Particles;
  private bushMeshes: Mesh[] = [];
  /** Low quality hides these (cycle 12): ink hulls on walls, hedges and bushes, and the shore decor. */
  private terrainHulls: Mesh[] = [];
  private decor: Mesh[] = [];
  quality: Quality = 'high';
  private size = { w: 1, h: 1 };
  /** Model-sheet mode (?sheet=1): only characters on a flat background, for silhouette checks. */
  private sheetMode = false;
  private crates = new Map<number, { mesh: Mesh; wobble: number }>();
  /** Instanced batches: draw calls stay fixed however many enemies, shots and coins are alive. */
  private batches!: {
    body: Record<EnemyKind, Batch>; hull: Record<EnemyKind, Batch>; flash: Record<EnemyKind, Batch>; ice: Record<EnemyKind, Batch>;
    shadow: Batch; ring: Batch; frostRing: Batch; streak: Batch; barBg: Batch; barFill: Batch; shots: Record<Shot['owner'], Batch>; branchShots: Record<TowerBranch, Batch>; coins: Batch;
  };
  private counts = { enemies: 0, shots: 0 };
  private tmp = { m: new Matrix4(), q: new Quaternion(), e: new Euler(), p: new Vector3(), s: new Vector3(), o: new Vector3() };
  private frustum = new Frustum();
  private sphere = new Sphere();
  /** Per-instance culling for the batches (InstancedMesh cannot cull individual instances itself). */
  private onScreen(x: number, y: number, z: number, r: number) {
    this.sphere.center.set(x, y, z);
    this.sphere.radius = r;
    return this.frustum.intersectsSphere(this.sphere);
  }
  private telegraphs: { mesh: Mesh; fill: Mesh; age: number; life: number }[] = [];
  private aimFan: Mesh;
  private aimRing: Mesh;
  private aimLine: Mesh;
  /** Snowball landing circle (cycle 40): ice blue, unlike the purple super ring. */
  private aimLob: Mesh;
  private raycaster = new Raycaster();
  private ground = new Plane(new Vector3(0, 1, 0), 0);
  private portrait = false;
  /** Debug `?freeze`: hold effects too, so a frozen tick can be compared before/after. */
  fxPaused = false;
  /** Camera distance factor: short phone screens get a closer camera so characters stay readable. */
  private zoom = 1;
  private time = 0;
  readonly geo = {
    blob: new CircleGeometry(1, 20), ring: new RingGeometry(0.82, 1, 32), inkRing: new RingGeometry(0.74, 1.08, 32), bolt: new CapsuleGeometry(0.11, 0.5, 4, 8),
    orb: new SphereGeometry(0.28, 12, 10), coin: new CylinderGeometry(0.28, 0.28, 0.08, 14), spark: new OctahedronGeometry(0.22),
    bar: new PlaneGeometry(1, 0.13), barFill: new PlaneGeometry(1, 0.13).translate(0.5, 0, 0), disc: new CircleGeometry(1, 40),
    // Swift-lap speed lines (cycle 53): two thin pale streaks trailing behind an enemy (local -x is behind), unit radius.
    streak: bake([
      { geo: new BoxGeometry(1.6, 0.14, 0.14), color: 0xfffbe8, at: [-2.0, 0.35, 0.5] },
      { geo: new BoxGeometry(1.2, 0.14, 0.14), color: 0xfffbe8, at: [-1.9, 0.75, 0] },
      { geo: new BoxGeometry(1.6, 0.14, 0.14), color: 0xfffbe8, at: [-2.0, 0.35, -0.5] },
    ]),
  };
  private mats = {
    blob: basic(0x0b1a12, 0.32), allyRing: basic(TEAM.ally, 0.85), enemyRing: basic(TEAM.enemy, 0.8),
    heroBolt: basic(0x8ff7ff), towerBolt: basic(0xffe07a), enemyBolt: basic(0xff7b3a), superOrb: basic(0xc59bff), snowball: basic(0xf4fbff),
    coin: toon(PAL.gold, { emissive: 0x5a3a00, rim: 0.5 }),
    baked: toon(0xffffff, { vertexColors: true, rim: 0.34 }), flash: basic(0xffffff),
    barBg: basic(0x10161c, 0.8), barAlly: basic(0x52e07c), barEnemy: basic(0xff5160), barTown: basic(0x4fb8ff), ammo: basic(0xffa43a), ammoDim: basic(0x5b3a1a, 0.9),
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.scene.background = new Color(PAL.water);
    // Toon bands come from the key light; the sky/ground fill keeps the shadow band bright and colourful.
    this.scene.add(new HemisphereLight(0xe6f6ff, 0x9c8a62, 1.15));
    const sun = new DirectionalLight(0xfff3dc, 2.2);
    sun.position.set(-7, 16, 9);
    this.scene.add(sun);

    this.particles = new Particles(this.scene);
    this.buildGround();
    this.buildWalls();
    this.buildCover();
    this.buildTown();
    this.buildPads();
    this.townBar = this.makeBar(3.2, this.mats.barTown);
    this.townBar.root.position.set(TOWN.x, 4.6, TOWN.z);
    this.scene.add(this.townBar.root);

    this.buildBatches();
    this.buildHero();
    this.heroBar = this.makeBar(1.3, this.mats.barAlly);
    this.heroBar.root.position.y = 2.55;
    this.hero.add(this.heroBar.root);
    for (let i = 0; i < HEROES.ranger.ammoMax; i++) {
      const seg = new Mesh(new PlaneGeometry(0.4, 0.1), this.mats.ammo);
      seg.position.set((i - 1) * 0.44, 2.37, 0);
      this.ammoSegs.push(seg);
      this.hero.add(seg);
    }
    this.scene.add(this.hero);

    this.aimFan = new Mesh(this.fanGeometry(HEROES.ranger), basic(0xffffff, 0.22));
    this.aimFan.rotation.x = -Math.PI / 2;
    this.aimRing = new Mesh(this.geo.ring, basic(0xc59bff, 0.7));
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.scale.setScalar(HEROES.ranger.superRadius);
    this.aimLine = new Mesh(new PlaneGeometry(1, 0.12), basic(0xc59bff, 0.45));
    this.aimLine.rotation.x = -Math.PI / 2;
    this.aimLob = new Mesh(this.geo.ring, basic(0xc4f2ff, 0.85));
    this.aimLob.rotation.x = -Math.PI / 2;
    for (const m of [this.aimFan, this.aimRing, this.aimLine, this.aimLob]) { m.visible = false; m.renderOrder = 2; this.scene.add(m); }
  }

  // ---------- static scenery ----------
  private buildGround() {
    const w = ARENA.maxX - ARENA.minX, d = ARENA.maxZ - ARENA.minZ, ppm = 20;
    const c = document.createElement('canvas');
    c.width = Math.round(w * ppm); c.height = Math.round(d * ppm);
    const g = c.getContext('2d')!;
    const px = (v: Vec) => [(v.x - ARENA.minX) * ppm, (v.z - ARENA.minZ) * ppm] as const;
    g.fillStyle = PAL.grass; g.fillRect(0, 0, c.width, c.height);
    // Crisp 2 m tiles: a pitch-like speed reference that stays calmer than anything interactive.
    g.fillStyle = PAL.grassAlt;
    for (let x = 0; x < w; x += 2) for (let z = 0; z < d; z += 2) if (((x + z) / 2) % 2 === 0) g.fillRect(x * ppm, z * ppm, 2 * ppm, 2 * ppm);
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = PAL.grassDot;
    for (let i = 0; i < 160; i++) { const x = r() * c.width, z = r() * c.height; g.beginPath(); g.ellipse(x, z, 4 + r() * 4, 2 + r() * 2, 0, 0, Math.PI * 2); g.fill(); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [width, color] of [[3.2, PAL.pathEdge], [2.6, PAL.path]] as const) {
      g.strokeStyle = color; g.lineWidth = width * ppm;
      for (const lane of LANES) { g.beginPath(); lane.forEach((p, i) => (i ? g.lineTo(...px(p)) : g.moveTo(...px(p)))); g.stroke(); }
    }
    const [tx, tz] = px(TOWN);
    g.fillStyle = PAL.pathEdge; g.beginPath(); g.arc(tx, tz, (TOWN.radius + 2.5) * ppm, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAL.plaza; g.beginPath(); g.arc(tx, tz, (TOWN.radius + 2.2) * ppm, 0, Math.PI * 2); g.fill();
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const groundMat = toon(0xffffff, { rim: 0 });
    groundMat.map = tex;
    const ground = new Mesh(new PlaneGeometry(w, d), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((ARENA.minX + ARENA.maxX) / 2, 0, (ARENA.minZ + ARENA.maxZ) / 2);
    // The arena is an island: a sand slab over water reads as a clear play boundary.
    const cx = (ARENA.minX + ARENA.maxX) / 2, cz = (ARENA.minZ + ARENA.maxZ) / 2;
    const shore = new Mesh(new BoxGeometry(w + 7.4, 0.6, d + 7.4), toon(0xf0c98a, { rim: 0 }));
    shore.position.set(cx, -0.31, cz);
    const water = new Mesh(new PlaneGeometry(240, 240), toon(PAL.water, { rim: 0 }));
    water.rotation.x = -Math.PI / 2; water.position.set(cx, -0.45, cz);
    this.scene.add(water, shore, ground);
    // Hedge border, baked into one mesh with lighter tops.
    const parts: Part[] = [];
    const hedge = (x: number, z: number, sx: number, sz: number) => {
      parts.push({ geo: new BoxGeometry(sx, 1.0, sz), color: PAL.hedge, at: [x, 0.5, z] });
      parts.push({ geo: new BoxGeometry(sx + 0.1, 0.28, sz + 0.1), color: PAL.hedgeTop, at: [x, 1.08, z] });
    };
    hedge(ARENA.minX - 0.55, cz, 1.1, d + 2.2); hedge(ARENA.maxX + 0.55, cz, 1.1, d + 2.2);
    hedge(cx, ARENA.maxZ + 0.55, w, 1.1); hedge(cx, ARENA.minZ - 0.55, w, 1.1);
    this.addBaked(bake(parts), 0.04, undefined, 'terrain');
    this.buildShoreDecor();
  }

  /** Bushes, rocks and crates on the sand outside the hedge: decoration only, never inside the play area. */
  private buildShoreDecor() {
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const parts: Part[] = [];
    const place = (x: number, z: number) => {
      const pick = r();
      if (pick < 0.5) {
        // 8x4 segments (cycle 55): these bushes were a quarter of a battle frame's triangles. The steep camera sees
        // the 8-sided outline, so fewer rings look the same as the old 8x6; 6 sides read as hexagons.
        const k = 0.45 + r() * 0.3;
        parts.push({ geo: new SphereGeometry(k, 8, 4), color: 0x4fae4a, at: [x, k * 0.7, z] });
        parts.push({ geo: new SphereGeometry(k * 0.75, 8, 4), color: 0x6cc75a, at: [x + k * 0.6, k * 0.55, z + k * 0.3] });
        parts.push({ geo: new SphereGeometry(k * 0.6, 8, 4), color: 0x5bbd52, at: [x - k * 0.5, k * 0.5, z - k * 0.4] });
      } else if (pick < 0.8) {
        const k = 0.35 + r() * 0.3;
        parts.push({ geo: new DodecahedronGeometry(k), color: 0xa3adc4, at: [x, k * 0.6, z], rot: [r(), r() * 3, 0] });
      } else {
        const k = 0.7 + r() * 0.2;
        parts.push({ geo: new BoxGeometry(k, k, k), color: 0xc98a4a, at: [x, k / 2, z], rot: [0, r() * 1.5, 0] });
        parts.push({ geo: new BoxGeometry(k * 1.02, k * 0.16, k * 1.02), color: 0x8a5428, at: [x, k * 0.5, z], rot: [0, 0, 0] });
      }
    };
    // Walk the band between the hedge (1.1 m) and the shore edge (3.7 m) on all four sides.
    for (let x = ARENA.minX - 2; x <= ARENA.maxX + 2; x += 2.2 + r() * 1.6) { place(x, ARENA.minZ - 1.9 - r() * 1.2); place(x, ARENA.maxZ + 1.9 + r() * 1.2); }
    for (let z = ARENA.minZ; z <= ARENA.maxZ; z += 2.2 + r() * 1.6) { place(ARENA.minX - 1.9 - r() * 1.2, z); place(ARENA.maxX + 1.9 + r() * 1.2, z); }
    this.addBaked(bake(parts), 0.04, undefined, 'decor');
  }

  /** Add a baked static mesh with its ink hull. */
  private addBaked(geo: BufferGeometry, outline: number, at?: Vec, role?: 'terrain' | 'decor'): Mesh {
    const mesh = new Mesh(geo, this.mats.baked);
    if (outline > 0) {
      const hull = new Mesh(hullGeometry(geo), outlineMaterial(outline));
      mesh.add(hull);
      if (role === 'terrain') this.terrainHulls.push(hull);
    }
    if (role === 'decor') this.decor.push(mesh);
    if (at) mesh.position.set(at.x, 0, at.z);
    this.scene.add(mesh);
    return mesh;
  }

  private buildWalls() {
    // Chunky blocks: pale tops catch the key light, cool sides fall into the shadow band.
    const parts: Part[] = [];
    for (const b of WALLS) {
      parts.push({ geo: new BoxGeometry(b.w, 1.2, b.d), color: PAL.stone, at: [b.x, 0.6, b.z] });
      parts.push({ geo: new BoxGeometry(b.w + 0.14, 0.24, b.d + 0.14), color: PAL.stoneTop, at: [b.x, 1.3, b.z] });
      parts.push({ geo: new BoxGeometry(b.w + 0.22, 0.18, b.d + 0.22), color: PAL.stoneFoot, at: [b.x, 0.09, b.z] });
    }
    this.addBaked(bake(parts), 0.05, undefined, 'terrain');
  }

  /** Tall-grass bushes (walk-through, see-through when the hero hides) and breakable crates. */
  private buildCover() {
    let seed = 3;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Tall grass, not a hedge: a thin patch with dense leaning blades, so it reads as walk-through.
    for (const b of BUSHES) {
      const parts: Part[] = [{ geo: new BoxGeometry(b.w, 0.12, b.d), color: 0x4cae48, at: [0, 0.06, 0] }];
      const n = Math.round(b.w * b.d * 7);
      for (let i = 0; i < n; i++) {
        const x = (r() - 0.5) * (b.w - 0.2), z = (r() - 0.5) * (b.d - 0.2), h = 0.8 + r() * 0.5;
        parts.push({ geo: new ConeGeometry(0.13, h, 4), color: [0x6bd05a, 0x58c04d, 0x7ddc63][i % 3], at: [x, h / 2 + 0.05, z], rot: [(r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5] });
      }
      const geo = bake(parts);
      const mat = toon(0xffffff, { vertexColors: true, rim: 0.3 });
      mat.transparent = true;
      const mesh = new Mesh(geo, mat);
      const hull = new Mesh(hullGeometry(geo), outlineMaterial(0.03));
      mesh.add(hull);
      this.terrainHulls.push(hull);
      mesh.position.set(b.x, 0, b.z);
      mesh.renderOrder = 6; // drawn after the hero so the see-through state shows them
      this.scene.add(mesh);
      this.bushMeshes.push(mesh);
    }
    const crateGeo = bake([
      { geo: new BoxGeometry(CRATE.size, CRATE.size, CRATE.size), color: 0xc98a4a, at: [0, CRATE.size / 2, 0] },
      { geo: new BoxGeometry(CRATE.size * 1.04, CRATE.size * 0.14, CRATE.size * 1.04), color: 0x8a5428, at: [0, CRATE.size * 0.78, 0] },
      { geo: new BoxGeometry(CRATE.size * 1.04, CRATE.size * 0.14, CRATE.size * 1.04), color: 0x8a5428, at: [0, CRATE.size * 0.22, 0] },
    ]);
    const crateHull = hullGeometry(crateGeo);
    CRATES.forEach((c, i) => {
      const mesh = new Mesh(crateGeo, this.mats.baked);
      mesh.add(new Mesh(crateHull, outlineMaterial(0.04)));
      mesh.position.set(c.x, 0, c.z);
      this.scene.add(mesh);
      this.crates.set(1 + i, { mesh, wobble: 0 });
    });
  }

  private buildTown() {
    const parts: Part[] = [
      { geo: new CylinderGeometry(TOWN.radius, TOWN.radius + 0.15, 1.1, 24), color: PAL.cream, at: [0, 0.55, 0] },
      { geo: new BoxGeometry(2.2, 2.2, 2.2), color: PAL.cream, at: [0, 2.1, 0] },
      { geo: new ConeGeometry(1.5, 1.4, 4), color: PAL.ally, at: [0, 3.9, 0], rot: [0, Math.PI / 4, 0] },
      { geo: new BoxGeometry(1.1, 1.3, 0.3), color: PAL.wood, at: [0, 1.2, -1.16] },
      { geo: new OctahedronGeometry(0.28), color: PAL.gold, at: [0, 2.45, -1.2] },
      { geo: new CylinderGeometry(0.05, 0.05, 1.4, 6), color: PAL.woodDark, at: [0, 5.2, 0] },
      { geo: new BoxGeometry(0.8, 0.5, 0.06), color: PAL.gold, at: [0.42, 5.6, 0] },
    ];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, x = Math.cos(a) * 1.95, z = Math.sin(a) * 1.95;
      parts.push({ geo: new CylinderGeometry(0.5, 0.56, 2.3, 10), color: PAL.cream, at: [x, 1.6, z] });
      parts.push({ geo: new ConeGeometry(0.62, 0.85, 10), color: PAL.ally, at: [x, 3.17, z] });
    }
    this.addBaked(bake(parts), 0.05, TOWN);
  }

  private buildPads() {
    for (const p of PADS) {
      const ring = new Mesh(this.geo.ring, basic(0xffd166, 0.55));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.03, p.z); ring.scale.setScalar(1.05);
      const disc = new Mesh(this.geo.disc, basic(0x3d2c18, 0.3));
      disc.rotation.x = -Math.PI / 2; disc.position.set(p.x, 0.02, p.z); disc.scale.setScalar(0.95);
      this.scene.add(ring, disc);
      this.padRings.push(ring);
    }
  }

  private buildHero() {
    const shadow = new Mesh(this.geo.blob, this.mats.blob); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.setScalar(0.62);
    const ring = new Mesh(this.geo.ring, this.mats.allyRing); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.scale.setScalar(0.72);
    this.hero.add(shadow, ring, this.heroBody);
    // Fallback body, replaced if the GLB loads.
    const placeholderGeo = bake([
      { geo: new CapsuleGeometry(0.36, 0.6, 4, 10), color: 0x3d8f5a, at: [0, 0.75, 0] },
      { geo: new SphereGeometry(0.34, 12, 10), color: 0x9fd36b, at: [0.05, 1.5, 0] },
      { geo: new BoxGeometry(0.7, 0.14, 0.14), color: PAL.wood, at: [0.45, 0.95, 0] },
    ]);
    const placeholder = new Mesh(placeholderGeo, this.mats.baked);
    placeholder.add(new Mesh(hullGeometry(placeholderGeo), outlineMaterial(0.05)));
    this.heroBody.add(placeholder);
    this.heroPlaceholder = placeholder;
    for (const kind of Object.keys(CAPE) as HeroKind[]) {
      const c = CAPE[kind];
      // Hangs from the shoulders and flares back (local -x is behind the hero), with a gold clasp on top.
      const geo = bake([
        { geo: new BoxGeometry(0.07, c.h, c.w), color: TEAM.ally, at: [c.x, c.y - c.h / 2, 0], rot: [0, 0, -0.22] },
        { geo: new BoxGeometry(0.08, 0.1, c.w * 1.02), color: 0x1f6fd0, at: [c.x - c.h * 0.22, c.y - c.h + 0.04, 0], rot: [0, 0, -0.22] },
        { geo: new BoxGeometry(0.16, 0.08, c.w * 0.9), color: PAL.gold, at: [c.x + 0.05, c.y + 0.02, 0] },
      ]);
      const cape = new Mesh(geo, this.mats.baked);
      cape.add(new Mesh(hullGeometry(geo), outlineMaterial(0.035)));
      cape.visible = false;
      this.heroBody.add(cape);
      this.capes.set(kind, cape);
    }
  }

  /** Aim preview shape: a long narrow fan for bolts, a short wide fan for a melee swing. */
  private fanGeometry(d: HeroDef) {
    if (d.attack === 'swing') return new CircleGeometry(d.range, 20, -d.swingArc, d.swingArc * 2);
    // A lob shows its landing circle instead (aimLob, cycle 40); the fan stays empty.
    return new CircleGeometry(d.range, 24, -d.spread * 1.6, d.spread * 3.2);
  }

  /** Start loading a hero's model ahead of its battle (cycle 42: the town calls this for the chosen hero). No-op once
   * loaded or loading; the model stays hidden until that hero is shown. */
  preloadHero(kind: HeroKind) { if (!this.heroRigs.has(kind)) this.loadHeroModel(kind); }

  /** Show the given hero, loading its model the first time (the placeholder stands in meanwhile). */
  private showHero(kind: HeroKind) {
    if (kind === this.heroKind) return;
    this.heroKind = kind;
    for (const [k, rig] of this.heroRigs) if (rig !== 'loading') rig.holder.visible = k === kind;
    for (const [k, cape] of this.capes) cape.visible = k === kind;
    const rig = this.heroRigs.get(kind);
    if (this.heroPlaceholder) this.heroPlaceholder.visible = !rig || rig === 'loading';
    if (!HEROES[kind].superSelf) this.aimRing.scale.setScalar(HEROES[kind].superRadius);
    if (!rig) this.loadHeroModel(kind);
  }
  /** The aim fan follows the hero's stats, talent included (cycle 45): rebuilt when they change. */
  private fanFor: HeroDef | null = null;
  private syncFan(def: HeroDef) {
    if (def === this.fanFor) return;
    this.fanFor = def;
    this.aimFan.geometry.dispose();
    this.aimFan.geometry = this.fanGeometry(def);
  }

  private loadHeroModel(kind: HeroKind) {
    this.heroRigs.set(kind, 'loading');
    heroLoader.load(HERO_MODELS[kind], gltf => {
      gltf.scene.traverse(node => { if (node instanceof Mesh) toFloat32(node); });
      const model = gltf.scene, box = new Box3().setFromObject(model), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
      const k = HERO_HEIGHT / Math.max(size.y, 0.01);
      model.scale.setScalar(k);
      model.position.set(-center.x * k, -box.min.y * k, -center.z * k);
      const holder = new Group(); holder.rotation.y = HERO_MODEL_YAW; holder.add(model);
      this.heroBody.add(holder);
      holder.visible = this.heroKind === kind;
      if (this.heroKind === kind && this.heroPlaceholder) this.heroPlaceholder.visible = false;
      this.hero.updateMatrixWorld(true);
      // Bake the parts per animated node (plus one static group): 5 meshes + 5 ink hulls instead of 24 + 24.
      // The model has no textures, so material colours become vertex colours.
      const animated = new Set((gltf.animations[0]?.tracks ?? []).map(t => t.name.split('.')[0]));
      const meshes: Mesh[] = [];
      model.traverse(node => { if (node instanceof Mesh) meshes.push(node); });
      const groups = new Map<Object3D, { geo: BufferGeometry; color: number; matrix: Matrix4 }[]>();
      const inv = new Matrix4(), ws = new Vector3(), hidden = new MeshBasicMaterial({ visible: false });
      const drop = new Set(HERO_DROP[kind] ?? []);
      for (const mesh of meshes) {
        if (drop.has(mesh.name)) { mesh.removeFromParent(); continue; }
        let owner: Object3D = model;
        for (let p: Object3D | null = mesh; p && p !== model; p = p.parent) if (animated.has(p.name)) { owner = p; break; }
        if (owner === mesh) { toonify(mesh); mesh.add(new Mesh(hullGeometry(mesh.geometry), outlineMaterial(+(0.035 / (mesh.getWorldScale(ws).x || 1)).toFixed(3)))); continue; }
        inv.copy(owner.matrixWorld).invert();
        const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material & { color?: Color };
        const list = groups.get(owner) ?? [];
        groups.set(owner, list);
        list.push({ geo: mesh.geometry, color: mat.color?.getHex() ?? 0xffffff, matrix: new Matrix4().multiplyMatrices(inv, mesh.matrixWorld) });
        // A mesh that parents other nodes stays in the graph but draws nothing.
        if (mesh.children.length) mesh.material = hidden; else mesh.removeFromParent();
      }
      // A held prop (cycle 48) is its own mesh on the animated node, not baked in: it can leave the hand on a throw.
      const prop = HERO_PROPS[kind], propNode = prop && model.getObjectByName(prop.node);
      let held: Mesh | null = null;
      if (prop && propNode) {
        const geo = bake(prop.parts.map(p => ({ geo: p.geo, color: p.color, at: p.at })));
        held = new Mesh(geo, this.mats.baked);
        held.add(new Mesh(hullGeometry(geo), outlineMaterial(+(0.035 / (propNode.getWorldScale(ws).x || 1)).toFixed(3))));
        propNode.add(held);
      }
      for (const [owner, parts] of groups) {
        const geo = bakeMatrices(parts), body = new Mesh(geo, this.mats.baked);
        body.add(new Mesh(hullGeometry(geo), outlineMaterial(+(0.035 / (owner.getWorldScale(ws).x || 1)).toFixed(3))));
        owner.add(body);
      }
      const clip = gltf.animations[0];
      let mixer: AnimationMixer | null = null, shot: AnimationAction | null = null;
      if (clip) {
        mixer = new AnimationMixer(model);
        shot = mixer.clipAction(clip);
        shot.setLoop(LoopOnce, 1);
        shot.clampWhenFinished = false;
      }
      this.heroRigs.set(kind, { holder, mixer, shot, held });
    }, undefined, () => { this.heroRigs.delete(kind); /* Keep the placeholder; the prototype stays playable without the model. */ });
  }

  /** One baked body + hull per enemy kind, shared by every instance of that kind. */
  private enemyKit(kind: EnemyKind): { body: BufferGeometry; hull: BufferGeometry } {
    let kit = this.enemyKits.get(kind);
    if (kit) return kit;
    const r = ENEMIES[kind].radius;
    const eyes = (x: number, y: number, z: number, size: number, white: number, pupil: number): Part[] => [
      { geo: new SphereGeometry(size, 8, 6), color: white, at: [x, y, z] },
      { geo: new SphereGeometry(size, 8, 6), color: white, at: [x, y, -z] },
      { geo: new SphereGeometry(size * 0.5, 6, 5), color: pupil, at: [x + size * 0.7, y, z] },
      { geo: new SphereGeometry(size * 0.5, 6, 5), color: pupil, at: [x + size * 0.7, y, -z] },
    ];
    // Silhouette by role (cycle 11): grunt = small, round, club raised to one side; skirmisher = tall and thin
    // with a wide hat brim and a bow held across (a T in front view); brute = wide and low with huge fists;
    // boss = big and tall, arms raised overhead, spiked crown, cape.
    let parts: Part[];
    if (kind === 'grunt') {
      parts = [
        { geo: new SphereGeometry(r * 0.82, 12, 10), color: 0xe2463f, at: [0, r * 1.0, 0], scale: [1, 0.95, 1.05] },
        { geo: new SphereGeometry(r * 0.66, 12, 10), color: 0xc4344a, at: [r * 0.15, r * 1.95, 0] },
        { geo: new ConeGeometry(r * 0.24, r * 0.95, 8), color: 0xfff0d2, at: [r * 0.05, r * 2.6, r * 0.5], rot: [0.75, 0, 0] },
        { geo: new ConeGeometry(r * 0.24, r * 0.95, 8), color: 0xfff0d2, at: [r * 0.05, r * 2.6, -r * 0.5], rot: [-0.75, 0, 0] },
        { geo: new SphereGeometry(r * 0.3, 8, 6), color: 0x6e1f2c, at: [r * 0.1, r * 0.25, r * 0.45] },
        { geo: new SphereGeometry(r * 0.3, 8, 6), color: 0x6e1f2c, at: [r * 0.1, r * 0.25, -r * 0.45] },
        { geo: new BoxGeometry(r * 0.26, r * 1.7, r * 0.26), color: 0xeedcb4, at: [r * 0.45, r * 1.95, r * 1.0], rot: [-0.6, 0, 0] },
        { geo: new SphereGeometry(r * 0.5, 10, 8), color: 0xfff3dc, at: [r * 0.45, r * 2.7, r * 1.55] },
        ...eyes(r * 0.58, r * 2.05, r * 0.24, r * 0.18, 0xffffff, PAL.ink),
      ];
    } else if (kind === 'skirmisher') {
      parts = [
        { geo: new ConeGeometry(r * 0.62, r * 2.6, 12), color: 0x2fa38f, at: [0, r * 1.3, 0] },
        { geo: new SphereGeometry(r * 0.55, 12, 10), color: 0x237f72, at: [0, r * 2.75, 0] },
        { geo: new CylinderGeometry(r * 1.0, r * 1.0, r * 0.12, 16), color: 0x26a08c, at: [0, r * 3.2, 0] },
        { geo: new ConeGeometry(r * 0.5, r * 2.0, 12), color: 0x1d7d6e, at: [-r * 0.15, r * 4.2, 0], rot: [0, 0, 0.25] },
        { geo: new BoxGeometry(r * 0.22, r * 0.22, r * 2.8), color: 0xffb52e, at: [r * 0.75, r * 1.9, 0] },
        { geo: new BoxGeometry(r * 0.06, r * 0.06, r * 2.6), color: 0xfff1c2, at: [r * 0.55, r * 1.9, 0] },
        { geo: new CylinderGeometry(r * 0.22, r * 0.22, r * 1.1, 8), color: 0x7a4a24, at: [-r * 0.55, r * 2.0, r * 0.3], rot: [0.3, 0, 0] },
        ...eyes(r * 0.48, r * 2.78, r * 0.2, r * 0.14, 0xffe14d, 0xb06a00),
      ];
    } else if (kind === 'shield') {
      // Shield-bearer (cycle 27): slate body behind a tall silver tower shield with a gold rim, facing forward (+x).
      parts = [
        { geo: new CylinderGeometry(r * 0.7, r * 0.85, r * 1.9, 12), color: 0x4f5d7e, at: [0, r * 0.95, 0] },
        { geo: new SphereGeometry(r * 0.62, 12, 10), color: 0x6b7aa0, at: [0, r * 2.2, 0] },
        { geo: new ConeGeometry(r * 0.66, r * 0.7, 10), color: 0x2f3854, at: [0, r * 2.75, 0] },
        { geo: new BoxGeometry(r * 0.22, r * 2.7, r * 2.0), color: 0xd8dee9, at: [r * 0.95, r * 1.45, 0] },
        { geo: new BoxGeometry(r * 0.26, r * 2.9, r * 0.16), color: PAL.gold, at: [r * 0.97, r * 1.45, r * 1.0] },
        { geo: new BoxGeometry(r * 0.26, r * 2.9, r * 0.16), color: PAL.gold, at: [r * 0.97, r * 1.45, -r * 1.0] },
        { geo: new BoxGeometry(r * 0.26, r * 0.16, r * 2.1), color: PAL.gold, at: [r * 0.97, r * 2.85, 0] },
        { geo: new OctahedronGeometry(r * 0.32), color: TEAM.enemy, at: [r * 1.1, r * 1.6, 0] },
        ...eyes(r * 0.5, r * 2.25, r * 0.2, r * 0.13, 0xffffff, PAL.ink),
      ];
    } else if (kind === 'brute') {
      parts = [
        { geo: new BoxGeometry(r * 1.6, r * 1.5, r * 2.1), color: 0xe8842a, at: [0, r * 1.2, 0] },
        { geo: new SphereGeometry(r * 0.85, 12, 10), color: 0xf29a5c, at: [r * 0.45, r * 0.95, 0] },
        { geo: new BoxGeometry(r * 0.95, r * 0.8, r * 0.95), color: 0x7a2c1c, at: [r * 0.3, r * 2.25, 0] },
        { geo: new SphereGeometry(r * 0.52, 10, 8), color: 0xb8c3d6, at: [0, r * 2.0, r * 1.05] },
        { geo: new SphereGeometry(r * 0.52, 10, 8), color: 0xb8c3d6, at: [0, r * 2.0, -r * 1.05] },
        { geo: new BoxGeometry(r * 0.5, r * 1.1, r * 0.5), color: 0xe8842a, at: [r * 0.3, r * 1.25, r * 1.35] },
        { geo: new BoxGeometry(r * 0.5, r * 1.1, r * 0.5), color: 0xe8842a, at: [r * 0.3, r * 1.25, -r * 1.35] },
        { geo: new SphereGeometry(r * 0.55, 10, 8), color: 0x7a2c1c, at: [r * 0.45, r * 0.6, r * 1.4] },
        { geo: new SphereGeometry(r * 0.55, 10, 8), color: 0x7a2c1c, at: [r * 0.45, r * 0.6, -r * 1.4] },
        ...eyes(r * 0.78, r * 2.35, r * 0.22, r * 0.13, 0xffffff, PAL.ink),
      ];
    } else {
      parts = [
        { geo: new BoxGeometry(r * 0.25, r * 2.6, r * 2.4), color: 0x8a1f3a, at: [-r * 0.75, r * 1.5, 0] },
        { geo: new CylinderGeometry(r * 0.75, r * 0.95, r * 1.9, 14), color: 0x4b3a8a, at: [0, r * 1.05, 0] },
        { geo: new SphereGeometry(r * 0.85, 14, 12), color: 0x6d55c4, at: [0, r * 2.0, 0] },
        { geo: new SphereGeometry(r * 0.6, 12, 10), color: 0x2a1f4d, at: [r * 0.2, r * 3.0, 0] },
        { geo: new CylinderGeometry(r * 0.52, r * 0.46, r * 0.28, 10), color: PAL.gold, at: [r * 0.2, r * 3.55, 0] },
        // Arms raised overhead: a tall 'Y' that never reads like the low, wide brute.
        { geo: new BoxGeometry(r * 0.38, r * 1.3, r * 0.38), color: 0x6d55c4, at: [r * 0.3, r * 2.85, r * 0.95], rot: [0.45, 0, 0] },
        { geo: new BoxGeometry(r * 0.38, r * 1.3, r * 0.38), color: 0x6d55c4, at: [r * 0.3, r * 2.85, -r * 0.95], rot: [-0.45, 0, 0] },
        { geo: new SphereGeometry(r * 0.46, 12, 10), color: 0x9d83ff, at: [r * 0.3, r * 3.55, r * 1.25] },
        { geo: new SphereGeometry(r * 0.46, 12, 10), color: 0x9d83ff, at: [r * 0.3, r * 3.55, -r * 1.25] },
        ...eyes(r * 0.68, r * 3.05, r * 0.22, r * 0.12, 0xff4d6a, 0x5a0010),
      ];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        parts.push({ geo: new ConeGeometry(r * 0.12, r * 0.55, 6), color: PAL.gold, at: [r * 0.2 + Math.cos(a) * r * 0.42, r * 3.9, Math.sin(a) * r * 0.42] });
      }
    }
    // Cycle 54 (measured in cycle 50): small enemies seen from the top-down camera look the same with half the round
    // segments, at 52-64% fewer triangles each. The boss keeps its full segments; its arms read faceted otherwise.
    const body = bake(kind === 'boss' ? parts : parts.map(p => ({ ...p, geo: fewerSegments(p.geo) })));
    kit = { body, hull: hullGeometry(body) };
    this.enemyKits.set(kind, kit);
    return kit;
  }

  private buildBatches() {
    const kinds: EnemyKind[] = ['grunt', 'skirmisher', 'brute', 'boss', 'shield'];
    const per = <T,>(f: (k: EnemyKind) => T) => Object.fromEntries(kinds.map(k => [k, f(k)])) as Record<EnemyKind, T>;
    const cap = 160;
    this.batches = {
      body: per(k => new Batch(this.scene, this.enemyKit(k).body, this.mats.baked, k === 'boss' ? 4 : cap)),
      hull: per(k => new Batch(this.scene, this.enemyKit(k).hull, outlineMaterial(k === 'boss' ? 0.08 : 0.05), k === 'boss' ? 4 : cap)),
      flash: per(k => new Batch(this.scene, this.enemyKit(k).body, this.mats.flash, k === 'boss' ? 4 : cap)),
      // Frost shell (cycle 16): the same body, a little larger, pale ice blue and see-through. Drawn only while slowed.
      ice: per(k => new Batch(this.scene, this.enemyKit(k).body, ICE, k === 'boss' ? 4 : cap, { order: 4 })),
      shadow: new Batch(this.scene, this.geo.blob, this.mats.blob, cap),
      ring: new Batch(this.scene, this.geo.ring, this.mats.enemyRing, cap),
      frostRing: new Batch(this.scene, this.geo.ring, basic(0x8fe6ff, 0.9), cap),
      streak: new Batch(this.scene, this.geo.streak, this.mats.baked, cap),
      barBg: new Batch(this.scene, this.geo.bar, this.mats.barBg, cap, { order: 5 }),
      barFill: new Batch(this.scene, this.geo.barFill, this.mats.barEnemy, cap, { order: 5 }),
      shots: {
        hero: new Batch(this.scene, this.geo.bolt, this.mats.heroBolt, 240),
        tower: new Batch(this.scene, this.geo.bolt, this.mats.towerBolt, 120),
        enemy: new Batch(this.scene, this.geo.orb, this.mats.enemyBolt, 120),
        super: new Batch(this.scene, this.geo.orb, this.mats.superOrb, 8),
        lob: new Batch(this.scene, this.geo.orb, this.mats.snowball, 16),
      },
      branchShots: { fire: new Batch(this.scene, this.geo.bolt, basic(BRANCH_COLOR.fire), 120), frost: new Batch(this.scene, this.geo.bolt, basic(0xbff3ff), 120) },
      coins: new Batch(this.scene, this.geo.coin, this.mats.coin, 160),
    };
  }

  /** Matrix from position, Euler rotation (order) and scale; reuses scratch objects. */
  private place(x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy = sx, sz = sx, order: 'XYZ' | 'YXZ' = 'XYZ'): Matrix4 {
    const t = this.tmp;
    t.e.set(rx, ry, rz, order);
    return t.m.compose(t.p.set(x, y, z), t.q.setFromEuler(t.e), t.s.set(sx, sy, sz));
  }

  private drawEnemies(s: RushState) {
    const B = this.batches, t = this.tmp, cam = this.camera.quaternion;
    this.camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(t.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    const all = [...Object.values(B.body), ...Object.values(B.hull), ...Object.values(B.flash), ...Object.values(B.ice), B.shadow, B.ring, B.frostRing, B.streak, B.barBg, B.barFill];
    const swift = s.diff.twist === 'swift';
    all.forEach(b => b.begin());
    for (const e of s.enemies) {
      const r = ENEMIES[e.kind].radius;
      if (!this.onScreen(e.x, r * 2, e.z, r * 4 + 1)) continue;
      const bob = Math.abs(Math.sin(this.time * 10 + e.id) * 0.06);
      // Slam wind-up crouches (wide and low); the rally roar (cycle 34) is the opposite: it swells up and trembles.
      let sx = e.windup ? 1.1 : 1, sy = e.windup ? 0.88 : 1, jx = 0;
      const roar = e.roarT ?? 0, call = ENEMIES[e.kind].summon;
      if (roar > 0 && call) {
        const k = 1 - roar / call.roar;
        sx = 1 + 0.12 * k; sy = 1 + 0.18 * k;
        jx = 0.07 * Math.sin(this.time * 70 + e.id);
      }
      const m = this.place(e.x + jx, bob, e.z, 0, yaw(e.facing), 0, sx, sy, sx);
      (e.flash > 0 ? B.flash : B.body)[e.kind].push(m);
      B.hull[e.kind].push(m);
      // Frost shell; blinks in its last quarter second so the player sees the slow wearing off.
      const ice = e.slowT ?? 0;
      if (ice > 0 && (ice > 0.25 || Math.floor(this.time * 16) % 2 === 0)) B.ice[e.kind].push(this.place(e.x, bob - 0.02, e.z, 0, yaw(e.facing), 0, sx * 1.08, sy * 1.06, sx * 1.08));
      if (this.sheetMode) continue;
      B.shadow.push(this.place(e.x, 0.02, e.z, -Math.PI / 2, 0, 0, r * 1.25));
      B.ring.push(this.place(e.x, 0.03, e.z, -Math.PI / 2, 0, 0, r * 1.15));
      if ((e.slowT ?? 0) > 0) B.frostRing.push(this.place(e.x, 0.05, e.z, -Math.PI / 2, 0, 0, r * 1.5)); // frost slow
      if (swift && e.kind !== 'boss' && !e.windup) B.streak.push(this.place(e.x, bob, e.z, 0, yaw(e.facing), 0, Math.max(0.6, r))); // swift lap: readable even on small enemies
      if (e.kind === 'boss' || e.hp < e.maxHp) {
        const boss = e.kind === 'boss', w = boss ? 2.6 : Math.max(0.9, r * 2), y = boss ? r * 4.0 : r * 3.4 + 0.25;
        B.barBg.push(t.m.compose(t.p.set(e.x, y, e.z), cam, t.s.set(w + 0.1, 1.6, 1)));
        // The fill is anchored at the bar's left edge, in camera-facing space.
        t.o.set(-w / 2, 0, 0.01).applyQuaternion(cam);
        B.barFill.push(t.m.compose(t.p.set(e.x + t.o.x, y + t.o.y, e.z + t.o.z), cam, t.s.set(Math.max(0.0001, w * Math.max(0, e.hp / e.maxHp)), 1, 1)));
      }
    }
    all.forEach(b => b.end());
    this.counts.enemies = s.enemies.length;
  }

  private drawShotsAndCoins(s: RushState) {
    const B = this.batches;
    [...Object.values(B.shots), ...Object.values(B.branchShots)].forEach(b => b.begin());
    for (const shot of s.shots) {
      if (!this.onScreen(shot.x, 1, shot.z, 3)) continue;
      if (shot.owner === 'super') {
        // Lobbed: a parabola that lands on the target point.
        const p = 1 - Math.max(0, shot.life) / HEROES[s.hero.kind].superTravel;
        B.shots.super.push(this.place(shot.x, 0.6 + Math.sin(p * Math.PI) * 2.6, shot.z, 0, 0, 0, 1.8));
      } else if (shot.owner === 'lob') {
        // Snowball (cycle 39): a lower arc than the super.
        const p = 1 - Math.max(0, shot.life) / (HEROES[s.hero.kind].lobTravel ?? 0.5);
        B.shots.lob.push(this.place(shot.x, 0.7 + Math.sin(p * Math.PI) * 1.8, shot.z, 0, 0, 0, 1.15));
      } else if (shot.owner === 'enemy') B.shots.enemy.push(this.place(shot.x, 0.85, shot.z, 0, 0, 0, 1));
      // Capsules point along +y; lay them flat along the velocity.
      else (shot.branch ? B.branchShots[shot.branch] : B.shots[shot.owner]).push(this.place(shot.x, shot.owner === 'tower' ? 1.6 : 0.85, shot.z, -Math.PI / 2, Math.atan2(-shot.vx, -shot.vz), 0, 1, 1, 1, 'YXZ'));
    }
    [...Object.values(B.shots), ...Object.values(B.branchShots)].forEach(b => b.end());
    this.counts.shots = s.shots.length;
    B.coins.begin();
    for (const c of s.coins) {
      if (!(c.life > 3 || Math.floor(c.life * 6) % 2 === 0) || !this.onScreen(c.x, 0.5, c.z, 0.6)) continue; // blink before expiring
      B.coins.push(this.place(c.x, 0.45 + Math.sin(this.time * 5 + c.id) * 0.1, c.z, Math.PI / 2, 0, this.time * 4 + c.id, 1));
    }
    B.coins.end();
  }

  /** Watchtower per level, baked: a static base and a rotating crossbow head. Open top keeps the head visible. */
  private towerKit(level: number, branch?: TowerBranch): { base: BufferGeometry; baseHull: BufferGeometry; head: BufferGeometry; headHull: BufferGeometry; h: number } {
    const key = `${level}${branch ?? ''}`;
    let kit = this.towerKits.get(key);
    if (kit) return kit;
    // Lv2+ wear their branch colour (cycle 15): fire orange with a flame, frost sky-blue with a crystal.
    const trim = branch ? BRANCH_COLOR[branch] : PAL.ally, h = 1.0 + level * 0.3;
    const parts: Part[] = [
      { geo: new CylinderGeometry(0.5, 0.68, h, 8), color: 0xece0c4, at: [0, h / 2, 0] },
      { geo: new CylinderGeometry(0.54, 0.54, 0.18, 8), color: trim, at: [0, h * 0.62, 0] },
      { geo: new CylinderGeometry(0.74, 0.6, 0.24, 8), color: PAL.wood, at: [0, h + 0.12, 0] },
    ];
    for (let i = 0; i < level; i++) parts.push({ geo: new OctahedronGeometry(0.14), color: PAL.gold, at: [(i - (level - 1) / 2) * 0.34, h * 0.62, -0.6] });
    if (branch === 'fire') parts.push({ geo: new ConeGeometry(0.2, 0.5, 6), color: 0xffb02e, at: [0, h + 0.5, -0.62] }, { geo: new ConeGeometry(0.12, 0.3, 6), color: 0xff4d1f, at: [0, h + 0.42, -0.62] });
    if (branch === 'frost') parts.push({ geo: new OctahedronGeometry(0.24), color: 0xd8f8ff, at: [0, h + 0.5, -0.62], scale: [0.8, 1.4, 0.8] });
    const base = bake(parts);
    const head = bake([
      { geo: new BoxGeometry(0.9, 0.2, 0.22), color: PAL.woodDark, at: [0.2, 0, 0] },
      { geo: new BoxGeometry(0.16, 0.14, 1.15), color: trim, at: [0.5, 0, 0] },
      { geo: new BoxGeometry(0.72, 0.07, 0.07), color: 0xfff1a8, at: [0.45, 0.13, 0] },
    ]);
    kit = { base, baseHull: hullGeometry(base), head, headHull: hullGeometry(head), h };
    this.towerKits.set(key, kit);
    return kit;
  }
  private makeTower(level: number, branch?: TowerBranch): Group {
    const kit = this.towerKit(level, branch), g = new Group(), head = new Group();
    g.add(new Mesh(kit.base, this.mats.baked), new Mesh(kit.baseHull, outlineMaterial(0.05)));
    head.name = 'head'; head.position.y = kit.h + 0.44;
    head.add(new Mesh(kit.head, this.mats.baked), new Mesh(kit.headHull, outlineMaterial(0.04)));
    g.add(head);
    return g;
  }

  private makeBar(width: number, fillMat: Material): Bar {
    const root = new Group();
    const bg = new Mesh(this.geo.bar, this.mats.barBg); bg.scale.set(width + 0.1, 1.6, 1);
    const fill = new Mesh(this.geo.barFill, fillMat); fill.position.set(-width / 2, 0, 0.01); fill.scale.x = width;
    root.add(bg, fill);
    root.renderOrder = 5;
    return { root, fill, width };
  }
  private setBar(bar: Bar, ratio: number) {
    bar.fill.scale.x = Math.max(0.0001, bar.width * Math.max(0, Math.min(1, ratio)));
    bar.root.quaternion.copy(this.camera.quaternion);
  }

  // ---------- frame ----------
  /** Graphics tier (cycle 12): render scale, terrain outlines, decor and particle count. Rules never change. */
  setQuality(q: Quality) {
    this.quality = q;
    const spec = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, spec.pixelRatio));
    this.renderer.setSize(this.size.w, this.size.h, false);
    for (const h of this.terrainHulls) h.visible = spec.terrainOutlines;
    for (const d of this.decor) d.visible = spec.decor;
  }

  resize(width: number, height: number) {
    this.size = { w: width, h: height };
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.portrait = height > width;
    const short = Math.min(width, height);
    this.zoom = short >= 720 ? 1 : short <= 420 ? 0.8 : 0.8 + ((short - 420) / 300) * 0.2;
    this.camera.fov = this.portrait ? 46 : 32;
    this.camera.updateProjectionMatrix();
  }

  /** Apply one simulation step's events: the effect grammar (docs/rush/art-direction.md) and animation triggers. */
  applyEvents(events: RushEvent[], reducedMotion: boolean) {
    const fx = this.particles, hp = this.hero.position;
    fx.density = (reducedMotion ? 0.5 : 1) * QUALITY[this.quality].particles;
    for (const ev of events) {
      switch (ev.type) {
        case 'swing': {
          if (this.heroShot) { this.heroShot.reset(); this.heroShot.play(); }
          this.swingFx(ev.x, ev.z, ev.angle, ev.range, ev.arc);
          const tipX = ev.x + Math.cos(ev.angle) * ev.range * 0.7, tipZ = ev.z + Math.sin(ev.angle) * ev.range * 0.7;
          fx.emit({ kind: ev.hits ? 'shard' : 'puff', n: ev.hits ? 6 : 2, color: ev.hits ? 0xffd166 : 0xf0d9a8, at: [tipX, 0.6, tipZ], speed: 4, up: 3, size: ev.hits ? 0.12 : 0.18, life: 0.35, dir: ev.angle, cone: ev.arc * 2 });
          if (ev.hits && !reducedMotion) this.shake = Math.max(this.shake, 0.18);
          break;
        }
        case 'fire': {
          if (this.heroShot) { this.heroShot.reset(); this.heroShot.play(); }
          const mx = hp.x + Math.cos(ev.angle) * 0.75, mz = hp.z + Math.sin(ev.angle) * 0.75;
          fx.emit({ kind: 'puff', n: 2, color: 0xffffff, at: [mx, 1.0, mz], speed: 1.2, up: 0.4, size: 0.12, life: 0.22, dir: ev.angle, cone: 0.6 });
          break;
        }
        case 'hit':
          if (ev.owner === 'hero') {
            fx.emit({ kind: 'shard', n: 4, color: 0x8ff7ff, at: [ev.x, 0.95, ev.z], speed: 4, up: 3, size: 0.1, life: 0.38 });
            fx.emit({ kind: 'spark', n: 2, color: 0xffffff, at: [ev.x, 1.0, ev.z], speed: 3, up: 1, size: 0.16, life: 0.16 });
          } else if (ev.owner === 'tower') {
            fx.emit({ kind: 'shard', n: 3, color: 0xffe07a, at: [ev.x, 1.2, ev.z], speed: 3.5, up: 3, size: 0.09, life: 0.32 });
          }
          break;
        case 'kill': {
          const boss = ev.kind === 'boss';
          fx.emit({ kind: 'shard', n: boss ? 26 : 8, color: KILL_COLOR[ev.kind], at: [ev.x, 0.8, ev.z], speed: boss ? 8 : 5.5, up: boss ? 8 : 5, size: boss ? 0.22 : 0.13, life: boss ? 0.9 : 0.55 });
          fx.emit({ kind: 'puff', n: boss ? 8 : 3, color: 0xefe6d2, at: [ev.x, 0.6, ev.z], speed: boss ? 2.6 : 1.6, up: 1.2, size: boss ? 0.4 : 0.2, life: boss ? 0.6 : 0.38 });
          if (boss) { this.ring(ev.x, ev.z, PAL.gold, 4.2, 0.6, 0.95, true); if (!reducedMotion) this.shake = Math.max(this.shake, 0.7); }
          break;
        }
        case 'snow': // snowball landing (cycle 39): a pale ring and a puff of snow
          this.ring(ev.x, ev.z, 0xc4f2ff, ev.radius, 0.3, 0.85);
          fx.emit({ kind: 'puff', n: 6, color: 0xf4fbff, at: [ev.x, 0.4, ev.z], speed: 3, up: 1.5, size: 0.22, life: 0.4 });
          break;
        case 'splash': // fire tower
          this.ring(ev.x, ev.z, BRANCH_COLOR.fire, ev.radius, 0.3, 0.85);
          fx.emit({ kind: 'shard', n: 5, color: 0xffb02e, at: [ev.x, 0.7, ev.z], speed: 4.5, up: 4, size: 0.11, life: 0.4 });
          break;
        case 'block': // shield-bearer turned a bolt aside
          fx.emit({ kind: 'spark', n: 4, color: 0xe8eefc, at: [ev.x, 1.0, ev.z], speed: 4, up: 2, size: 0.16, life: 0.2 });
          break;
        case 'chill': // frost tower
          fx.emit({ kind: 'spark', n: 3, color: 0xd8f8ff, at: [ev.x, 0.9, ev.z], speed: 2.5, up: 1.5, size: 0.18, life: 0.3 });
          break;
        case 'burst':
          this.ring(ev.x, ev.z, 0xc59bff, ev.radius, 0.45, 0.95, true);
          this.ring(ev.x, ev.z, 0xffffff, ev.radius * 0.6, 0.25, 1);
          fx.emit({ kind: 'shard', n: 16, color: PAL.super, at: [ev.x, 0.5, ev.z], speed: 7, up: 7, size: 0.16, life: 0.7 });
          fx.emit({ kind: 'spark', n: 6, color: 0xffffff, at: [ev.x, 0.9, ev.z], speed: 6, up: 2, size: 0.22, life: 0.25 });
          if (!reducedMotion) this.shake = Math.max(this.shake, 0.45);
          break;
        case 'crateHit': {
          const c = this.crates.get(ev.id);
          if (c) c.wobble = 0.18;
          fx.emit({ kind: 'shard', n: 3, color: 0xc98a4a, at: [ev.x, 0.7, ev.z], speed: 3, up: 3, size: 0.08, life: 0.3 });
          break;
        }
        case 'crateBreak':
          fx.emit({ kind: 'shard', n: 12, color: 0xc98a4a, at: [ev.x, 0.5, ev.z], speed: 5, up: 5, size: 0.14, life: 0.6 });
          fx.emit({ kind: 'puff', n: 4, color: 0xf0d9a8, at: [ev.x, 0.4, ev.z], speed: 1.5, up: 1, size: 0.26, life: 0.45 });
          break;
        case 'spark':
          fx.emit({ kind: 'spark', n: 3, color: 0xffffff, at: [ev.x, 0.9, ev.z], speed: 2.5, up: 1, size: 0.1, life: 0.15 });
          break;
        case 'telegraph': this.telegraph(ev.x, ev.z, ev.radius, ev.time); break;
        // Boss rally (cycle 33): amber, not the red of a slam, because the roar itself does no damage.
        case 'roar': this.telegraph(ev.x, ev.z, ev.radius, ev.time, 0xffb02e); break;
        case 'lap': // endless lap (cycle 47): a wide red ink ring around the town and a shake
          this.ring(TOWN.x, TOWN.z, 0xff4d5e, 7, 0.7, 0.95, true);
          if (!reducedMotion) this.shake = Math.max(this.shake, 0.5);
          break;
        case 'summon':
          this.ring(ev.x, ev.z, 0xffb02e, 3, 0.4, 0.95, true);
          fx.emit({ kind: 'puff', n: 12, color: 0xe8c99a, at: [ev.x, 0.4, ev.z], speed: 4, up: 1, size: 0.3, life: 0.5 });
          if (!reducedMotion) this.shake = Math.max(this.shake, 0.35);
          break;
        case 'slam':
          this.ring(ev.x, ev.z, 0xff5d73, ev.radius, 0.35, 0.95, true);
          fx.emit({ kind: 'puff', n: 10, color: 0xe8c99a, at: [ev.x, 0.3, ev.z], speed: 3.5, up: 0.8, size: 0.28, life: 0.45 });
          if (!reducedMotion) this.shake = Math.max(this.shake, 0.6);
          break;
        case 'townHit': if (!reducedMotion) this.shake = Math.max(this.shake, 0.12); break;
        case 'heroDown':
          this.ring(hp.x, hp.z, 0xff5d73, 1.6, 0.5, 0.9, true);
          fx.emit({ kind: 'shard', n: 10, color: 0x7fd36b, at: [hp.x, 1.0, hp.z], speed: 4, up: 5, size: 0.14, life: 0.6 });
          break;
        case 'coin':
          fx.emit({ kind: 'spark', n: 3, color: PAL.gold, at: [hp.x, 1.6, hp.z], speed: 1.5, up: 3, size: 0.14, life: 0.35 });
          break;
        case 'build': {
          const p = PADS[ev.pad];
          this.ring(p.x, p.z, 0xffd166, 1.8, 0.45, 0.9);
          fx.emit({ kind: 'puff', n: 8, color: 0xf0d9a8, at: [p.x, 0.3, p.z], speed: 2.5, up: 0.8, size: 0.26, life: 0.45 });
          break;
        }
      }
    }
  }

  private ring(x: number, z: number, color: number, radius: number, life: number, opacity: number, ink = false) {
    const add = (geo: RingGeometry, c: number, order: number) => {
      const mesh = new Mesh(geo, basic(c, opacity));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.06, z);
      mesh.scale.setScalar(radius * 0.3);
      mesh.renderOrder = order;
      this.scene.add(mesh);
      this.fx.push({ mesh, age: 0, life, grow: radius, fade: opacity, y0: 0.06 });
    };
    // Shockwaves get an ink band underneath, like the characters' outlines.
    if (ink) add(this.geo.inkRing, PAL.ink, 3);
    add(this.geo.ring, color, 4);
  }
  /** A quick sweeping fan where the hammer passed. */
  private swingFx(x: number, z: number, angle: number, range: number, arc: number) {
    const mesh = new Mesh(new CircleGeometry(1, 16, -arc, arc * 2), basic(0xfff1c2, 0.55));
    mesh.rotation.set(-Math.PI / 2, 0, -angle);
    mesh.position.set(x, 0.07, z);
    mesh.scale.setScalar(range * 0.3);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    this.fx.push({ mesh, age: 0, life: 0.16, grow: range, fade: 0.55, y0: 0.07 });
  }

  private telegraph(x: number, z: number, radius: number, time: number, color = 0xff3b4e) {
    const mesh = new Mesh(this.geo.ring, basic(color, 0.85));
    const fill = new Mesh(this.geo.disc, basic(color, 0.28));
    for (const m of [mesh, fill]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); m.renderOrder = 3; this.scene.add(m); }
    mesh.scale.setScalar(radius); fill.scale.setScalar(0.01);
    this.telegraphs.push({ mesh, fill, age: 0, life: time });
  }

  /** `held` = hit-stop: the world pose (walk bob, coin spin, hero clip) holds; effects and camera keep moving. */
  sync(s: RushState, dt: number, aim: AimPreview, held = false) {
    const worldDt = held ? 0 : dt;
    this.time += worldDt;
    const h = s.hero, alive = h.downT <= 0, def = heroDef(s);
    this.showHero(h.kind);
    this.syncFan(def);
    // Popo's snowball (cycle 48): in the paw only with a round loaded and not right after a throw; an empty paw = reloading.
    const paw = this.heroRig?.held;
    if (paw) paw.visible = h.ammo >= 1 && h.fireCd <= 0;
    // Hero
    this.hero.visible = alive;
    this.hero.position.set(h.x, 0, h.z);
    this.heroBody.rotation.y = yaw(h.facing);
    this.heroMixer?.update(worldDt);
    this.setBar(this.heroBar, h.hp / heroMaxHp(s));
    this.ammoSegs.forEach((seg, i) => {
      const full = h.ammo > i, partial = h.ammo === i ? h.reloadT / def.reload : 0;
      seg.material = full ? this.mats.ammo : this.mats.ammoDim;
      seg.scale.x = full ? 1 : Math.max(0.05, partial);
      seg.position.x = (i - 1) * 0.44 - (full ? 0 : (1 - seg.scale.x) * 0.2);
      seg.quaternion.copy(this.camera.quaternion);
    });
    this.drawEnemies(s);
    this.drawShotsAndCoins(s);
    // Cover: bushes turn see-through while the hero hides in one; broken crates disappear.
    const hiding = alive && heroHidden(s);
    BUSHES.forEach((b, i) => {
      const mesh = this.bushMeshes[i], mat = mesh.material as Material & { opacity: number };
      const inside = hiding && Math.abs(h.x - b.x) <= b.w / 2 && Math.abs(h.z - b.z) <= b.d / 2;
      mat.opacity = inside ? 0.4 : 1;
      mat.depthWrite = !inside;
      mesh.children[0].visible = !inside;
    });
    const standing = new Set(s.crates.map(c => c.id));
    for (const [id, c] of this.crates) {
      c.mesh.visible = standing.has(id);
      c.wobble = Math.max(0, c.wobble - worldDt);
      const k = Math.sin(c.wobble * 60) * c.wobble * 0.5;
      c.mesh.rotation.set(k * 0.4, 0, k);
    }
    // Towers
    s.towers.forEach((t, i) => {
      const key = t ? `${t.level}${t.branch ?? ''}` : '';
      if (key !== this.towerLevels[i]) {
        if (this.towers[i]) this.scene.remove(this.towers[i]!);
        this.towers[i] = t ? this.makeTower(t.level, t.branch) : null;
        if (this.towers[i]) { this.towers[i]!.position.set(PADS[i].x, 0, PADS[i].z); this.scene.add(this.towers[i]!); }
        this.towerLevels[i] = key;
      }
      if (t && this.towers[i]) this.towers[i]!.getObjectByName('head')!.rotation.y = yaw(t.facing);
    });
    const reach = alive ? padInReach(s) : -1;
    if (!this.sheetMode) this.padRings.forEach((ring, i) => {
      (ring.material as MeshBasicMaterial).opacity = i === reach ? 0.6 + Math.sin(this.time * 8) * 0.3 : 0.45;
      ring.scale.setScalar(i === reach ? 1.15 : 1.05);
      ring.visible = !towerMaxed(s, i) || i === reach;
    });
    this.setBar(this.townBar, s.town.hp / s.town.maxHp);
    this.updateAim(s, aim);
    this.updateFx(this.fxPaused ? 0 : dt);
    this.particles.update(this.fxPaused ? 0 : dt);
    this.updateCamera(s, dt);
  }

  private updateAim(s: RushState, aim: AimPreview) {
    const h = s.hero, alive = h.downT <= 0;
    this.aimFan.visible = this.aimRing.visible = this.aimLine.visible = this.aimLob.visible = false;
    if (!aim || !alive) return;
    if (aim.kind === 'lob') {
      // Where the snowball will land (same reach rule as the sim), its splash, and a line from the hero.
      const hd = heroDef(s), l = Math.hypot(aim.offset.x, aim.offset.z), reach = lobReach(hd, l);
      const a = l > 1e-6 ? Math.atan2(aim.offset.z, aim.offset.x) : h.facing, tx = h.x + Math.cos(a) * reach, tz = h.z + Math.sin(a) * reach;
      this.aimLob.visible = this.aimLine.visible = true;
      this.aimLob.position.set(tx, 0.06, tz);
      this.aimLob.scale.setScalar(hd.boltRadius);
      (this.aimLob.material as MeshBasicMaterial).opacity = h.ammo >= 1 ? 0.85 : 0.35;
      this.aimLine.position.set((tx + h.x) / 2, 0.055, (tz + h.z) / 2);
      this.aimLine.scale.x = Math.max(0.01, reach);
      this.aimLine.rotation.set(-Math.PI / 2, 0, -a);
      return;
    }
    if (aim.kind === 'fire') {
      const a = Math.atan2(aim.dir.z, aim.dir.x);
      this.aimFan.visible = true;
      this.aimFan.position.set(h.x, 0.05, h.z);
      this.aimFan.rotation.set(-Math.PI / 2, 0, -a);
      (this.aimFan.material as MeshBasicMaterial).opacity = h.ammo >= 1 ? 0.24 : 0.1;
    } else {
      const hd = HEROES[h.kind];
      if (hd.superSelf) { this.aimRing.visible = true; this.aimRing.position.set(h.x, 0.06, h.z); this.aimRing.scale.setScalar(hd.superRadius); return; }
      const l = Math.hypot(aim.offset.x, aim.offset.z), k = l > hd.superRange ? hd.superRange / l : 1;
      const tx = h.x + aim.offset.x * k, tz = h.z + aim.offset.z * k;
      this.aimRing.visible = this.aimLine.visible = true;
      this.aimRing.position.set(tx, 0.06, tz);
      const d = Math.hypot(tx - h.x, tz - h.z);
      this.aimLine.position.set((tx + h.x) / 2, 0.055, (tz + h.z) / 2);
      this.aimLine.scale.x = Math.max(0.01, d);
      this.aimLine.rotation.set(-Math.PI / 2, 0, -Math.atan2(tz - h.z, tx - h.x));
    }
  }

  private updateFx(dt: number) {
    this.fx = this.fx.filter(f => {
      f.age += dt;
      const p = f.age / f.life;
      if (p >= 1) { this.scene.remove(f.mesh); (f.mesh.material as Material).dispose(); return false; }
      f.mesh.scale.setScalar(f.grow * (0.3 + 0.7 * Math.sqrt(p)));
      (f.mesh.material as MeshBasicMaterial).opacity = f.fade * (1 - p);
      return true;
    });
    this.telegraphs = this.telegraphs.filter(t => {
      t.age += dt;
      const p = Math.min(1, t.age / t.life);
      t.fill.scale.setScalar(t.mesh.scale.x * p);
      if (t.age >= t.life) { this.scene.remove(t.mesh, t.fill); (t.mesh.material as Material).dispose(); (t.fill.material as Material).dispose(); return false; }
      return true;
    });
  }

  private updateCamera(s: RushState, dt: number) {
    const h = s.hero, target = h.downT > 0 ? new Vector3(TOWN.x, 0, TOWN.z - 4) : new Vector3(h.x, 0, h.z);
    // Look ahead toward the enemy side (hero sits in the lower half, enemies clear the top HUD); stay inside the arena.
    target.z -= this.portrait ? 2.5 : 3.5;
    target.x = Math.max(ARENA.minX + 6, Math.min(ARENA.maxX - 6, target.x));
    target.z = Math.max(ARENA.minZ + 6, Math.min(ARENA.maxZ - 6, target.z));
    this.focus.lerp(target, 1 - Math.exp(-6 * dt));
    const height = (this.portrait ? 30 : 23) * this.zoom, back = (this.portrait ? 14 : 12.5) * this.zoom;
    this.camera.position.set(this.focus.x, height, this.focus.z + back);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const k = this.shake * this.shake;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.z += (Math.random() - 0.5) * k;
    }
    this.camera.lookAt(this.focus);
  }

  /** Model sheet: hide everything but character bodies, outlines and the hero on a flat background. */
  sheet() {
    this.sheetMode = true;
    const keep = new Set<Object3D>([this.hero, ...Object.values(this.batches.body).map(b => b.mesh), ...Object.values(this.batches.hull).map(b => b.mesh), ...Object.values(this.batches.flash).map(b => b.mesh)]);
    for (const o of this.scene.children) if (!keep.has(o) && !(o instanceof HemisphereLight) && !(o instanceof DirectionalLight)) o.visible = false;
    this.hero.children.filter(c => c !== this.heroBody).forEach(c => (c.visible = false));
    this.scene.background = new Color(0x2b3a55);
  }

  /** Screen point → ground point (for mouse aim). */
  groundPoint(clientX: number, clientY: number, rect: DOMRect): Vec | null {
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, p) ? { x: p.x, z: p.z } : null;
  }
  /** World point → CSS pixels relative to the canvas. */
  screenPoint(x: number, y: number, z: number, rect: DOMRect): { x: number; y: number; visible: boolean } {
    const v = new Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  }

  render() { this.renderer.render(this.scene, this.camera); }
  /** Renderer statistics for the debug overlay and performance notes. */
  info() { const r = this.renderer.info.render; return { calls: r.calls, triangles: r.triangles, enemies: this.counts.enemies, shots: this.counts.shots, particles: this.particles.active, heroAnim: !!this.heroShot?.isRunning(), heroReady: !!this.heroRig, heroKind: this.heroKind, heldProp: this.heroRig?.held ? this.heroRig.held.visible : null, dropped: Batch.dropped, enemyTris: Object.fromEntries([...this.enemyKits].map(([k, v]) => [k, (v.body.index ? v.body.index.count : v.body.attributes.position.count) / 3])), quality: this.quality, pixelRatio: this.renderer.getPixelRatio(), buffer: [this.renderer.domElement.width, this.renderer.domElement.height] }; }
}

/** Cape placement per hero model (shoulder height y, back offset x, height h, width w), tuned on the model sheet. */
// Popo keeps one too (cycle 41): the polar-bear model's own team blue faces forward, its back read only 3.6% blue.
const CAPE: Record<HeroKind, { x: number; y: number; h: number; w: number }> = {
  ranger: { x: -0.3, y: 1.2, h: 0.85, w: 0.7 },
  bron: { x: -0.4, y: 1.15, h: 0.85, w: 0.95 },
  bear: { x: -0.4, y: 1.2, h: 0.85, w: 0.95 },
};
const BRANCH_COLOR: Record<TowerBranch, number> = { fire: 0xff7a2f, frost: 0x4fc3ff };
const ICE = new MeshBasicMaterial({ color: 0xc4f2ff, transparent: true, opacity: 0.4, depthWrite: false });
const KILL_COLOR: Record<EnemyKind, number> = { grunt: 0xe2463f, skirmisher: 0x2fa38f, brute: 0xe8842a, boss: 0x6d55c4, shield: 0x8fa0c4 };
const towerMaxed = (s: RushState, pad: number) => { const t = s.towers[pad]; return !!t && t.level >= TOWER_LEVELS.length - 1; };
