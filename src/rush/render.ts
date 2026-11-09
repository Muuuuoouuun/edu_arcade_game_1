// Three.js view of the Arcana Rush simulation. Reads RushState, never writes it.
import {
  AnimationMixer, Box3, BoxGeometry, CanvasTexture, CapsuleGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry,
  DirectionalLight, Group, HemisphereLight, LoopOnce, Mesh, MeshBasicMaterial, OctahedronGeometry, PerspectiveCamera, Plane,
  PlaneGeometry, Raycaster, RingGeometry, Scene, SphereGeometry, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
  type AnimationAction, type BufferGeometry, type Material,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARENA, ENEMIES, HERO, LANES, PADS, TOWER_LEVELS, TOWN, WALLS, type EnemyKind, type Vec } from './data.ts';
import { padInReach, type Enemy, type RushEvent, type RushState, type Shot } from './sim.ts';
import { bake, hullGeometry, outlineMaterial, PAL, toon, toonify, type Part } from './look.ts';

export type AimPreview = { kind: 'fire'; dir: Vec } | { kind: 'super'; offset: Vec } | null;

const TEAM = { ally: PAL.ally, enemy: PAL.enemy };
const HERO_MODEL_URL = '/defense/models/prototypes/gecko-ranger.glb';
const HERO_HEIGHT = 2.0;
/** Yaw that turns the GLB authored front (-z) toward simulation angle 0 (+x). Verified by east/north close-up renders. */
const HERO_MODEL_YAW = -Math.PI / 2;

const basic = (color: number, opacity = 1) => new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
/** Sim angle a → Three.js yaw for an object whose front is +x. */
const yaw = (a: number) => -a;

type Bar = { root: Group; fill: Mesh; width: number };
type EnemyView = { root: Group; rig: Group; body: Mesh; bar: Bar; kind: EnemyKind };
type Fx = { mesh: Mesh; age: number; life: number; grow: number; fade: number; y0: number };

export class RushView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(42, 1, 0.5, 120);
  private focus = new Vector3(0, 0, 4);
  private shake = 0;
  private hero = new Group();
  private heroBody = new Group();
  private heroBar: Bar;
  private ammoSegs: Mesh[] = [];
  private heroMixer: AnimationMixer | null = null;
  private heroShot: AnimationAction | null = null;
  private enemies = new Map<number, EnemyView>();
  private shots = new Map<number, Mesh>();
  private coins = new Map<number, Mesh>();
  private enemyKits = new Map<EnemyKind, { body: BufferGeometry; hull: BufferGeometry }>();
  private towerKits: ({ base: BufferGeometry; baseHull: BufferGeometry; head: BufferGeometry; headHull: BufferGeometry; h: number } | undefined)[] = [];
  private towers: (Group | null)[] = PADS.map(() => null);
  private towerLevels: number[] = PADS.map(() => -1);
  private padRings: Mesh[] = [];
  private townBar: Bar;
  private fx: Fx[] = [];
  private telegraphs: { mesh: Mesh; fill: Mesh; age: number; life: number }[] = [];
  private aimFan: Mesh;
  private aimRing: Mesh;
  private aimLine: Mesh;
  private raycaster = new Raycaster();
  private ground = new Plane(new Vector3(0, 1, 0), 0);
  private portrait = false;
  /** Camera distance factor: short phone screens get a closer camera so characters stay readable. */
  private zoom = 1;
  private time = 0;
  readonly geo = {
    blob: new CircleGeometry(1, 20), ring: new RingGeometry(0.82, 1, 32), bolt: new CapsuleGeometry(0.11, 0.5, 4, 8),
    orb: new SphereGeometry(0.28, 12, 10), coin: new CylinderGeometry(0.28, 0.28, 0.08, 14), spark: new OctahedronGeometry(0.22),
    bar: new PlaneGeometry(1, 0.13), barFill: new PlaneGeometry(1, 0.13).translate(0.5, 0, 0), disc: new CircleGeometry(1, 40),
  };
  private mats = {
    blob: basic(0x0b1a12, 0.32), allyRing: basic(TEAM.ally, 0.85), enemyRing: basic(TEAM.enemy, 0.8),
    heroBolt: basic(0x8ff7ff), towerBolt: basic(0xffe07a), enemyBolt: basic(0xff7b3a), superOrb: basic(0xc59bff),
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

    this.buildGround();
    this.buildWalls();
    this.buildTown();
    this.buildPads();
    this.townBar = this.makeBar(3.2, this.mats.barTown);
    this.townBar.root.position.set(TOWN.x, 4.6, TOWN.z);
    this.scene.add(this.townBar.root);

    this.buildHero();
    this.heroBar = this.makeBar(1.3, this.mats.barAlly);
    this.heroBar.root.position.y = 2.55;
    this.hero.add(this.heroBar.root);
    for (let i = 0; i < HERO.ammoMax; i++) {
      const seg = new Mesh(new PlaneGeometry(0.4, 0.1), this.mats.ammo);
      seg.position.set((i - 1) * 0.44, 2.37, 0);
      this.ammoSegs.push(seg);
      this.hero.add(seg);
    }
    this.scene.add(this.hero);

    this.aimFan = new Mesh(new CircleGeometry(HERO.range, 24, -HERO.spread * 1.6, HERO.spread * 3.2), basic(0xffffff, 0.22));
    this.aimFan.rotation.x = -Math.PI / 2;
    this.aimRing = new Mesh(this.geo.ring, basic(0xc59bff, 0.7));
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.scale.setScalar(HERO.superRadius);
    this.aimLine = new Mesh(new PlaneGeometry(1, 0.12), basic(0xc59bff, 0.45));
    this.aimLine.rotation.x = -Math.PI / 2;
    for (const m of [this.aimFan, this.aimRing, this.aimLine]) { m.visible = false; m.renderOrder = 2; this.scene.add(m); }
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
    const shore = new Mesh(new BoxGeometry(w + 3.2, 0.6, d + 3.2), toon(0xf0c98a, { rim: 0 }));
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
    this.addBaked(bake(parts), 0.04);
  }

  /** Add a baked static mesh with its ink hull. */
  private addBaked(geo: BufferGeometry, outline: number, at?: Vec): Mesh {
    const mesh = new Mesh(geo, this.mats.baked);
    if (outline > 0) mesh.add(new Mesh(hullGeometry(geo), outlineMaterial(outline)));
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
    this.addBaked(bake(parts), 0.05);
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
    new GLTFLoader().load(HERO_MODEL_URL, gltf => {
      const model = gltf.scene, box = new Box3().setFromObject(model), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
      const k = HERO_HEIGHT / Math.max(size.y, 0.01);
      model.scale.setScalar(k);
      model.position.set(-center.x * k, -box.min.y * k, -center.z * k);
      const holder = new Group(); holder.rotation.y = HERO_MODEL_YAW; holder.add(model);
      this.heroBody.remove(placeholder);
      this.heroBody.add(holder);
      this.hero.updateMatrixWorld(true);
      const meshes: Mesh[] = [];
      model.traverse(node => { if (node instanceof Mesh) meshes.push(node); });
      const scale = new Vector3();
      for (const mesh of meshes) {
        toonify(mesh);
        // Constant on-screen ink width regardless of the node's own scale.
        const s = mesh.getWorldScale(scale).x || 1;
        mesh.add(new Mesh(hullGeometry(mesh.geometry), outlineMaterial(+(0.035 / s).toFixed(3))));
      }
      const clip = gltf.animations[0];
      if (clip) {
        this.heroMixer = new AnimationMixer(model);
        this.heroShot = this.heroMixer.clipAction(clip);
        this.heroShot.setLoop(LoopOnce, 1);
        this.heroShot.clampWhenFinished = false;
      }
    }, undefined, () => { /* Keep the placeholder; the prototype stays playable without the model. */ });
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
    let parts: Part[];
    if (kind === 'grunt') {
      parts = [
        { geo: new CapsuleGeometry(r * 0.78, r * 0.6, 4, 10), color: 0xe2463f, at: [0, r * 1.3, 0] },
        { geo: new SphereGeometry(r * 0.78, 12, 10), color: 0xa82c42, at: [r * 0.12, r * 2.45, 0] },
        { geo: new ConeGeometry(r * 0.2, r * 0.75, 8), color: 0xfff0d2, at: [r * 0.05, r * 3.2, r * 0.42], rot: [0.45, 0, 0] },
        { geo: new ConeGeometry(r * 0.2, r * 0.75, 8), color: 0xfff0d2, at: [r * 0.05, r * 3.2, -r * 0.42], rot: [-0.45, 0, 0] },
        { geo: new BoxGeometry(r * 1.5, r * 0.36, r * 0.36), color: 0x8a5428, at: [r * 0.95, r * 1.4, r * 0.75] },
        ...eyes(r * 0.68, r * 2.55, r * 0.26, r * 0.19, 0xffffff, PAL.ink),
      ];
    } else if (kind === 'skirmisher') {
      parts = [
        { geo: new ConeGeometry(r * 1.0, r * 2.4, 12), color: 0x9b4dd6, at: [0, r * 1.2, 0] },
        { geo: new SphereGeometry(r * 0.66, 12, 10), color: 0x6b2d8a, at: [0, r * 2.75, 0] },
        { geo: new ConeGeometry(r * 0.78, r * 1.1, 12), color: 0x40195a, at: [0, r * 3.45, 0] },
        { geo: new BoxGeometry(r * 0.28, r * 2.0, r * 0.28), color: 0xffb52e, at: [r * 0.95, r * 1.8, 0] },
        ...eyes(r * 0.55, r * 2.8, r * 0.24, r * 0.15, 0xffe14d, 0xb06a00),
      ];
    } else if (kind === 'brute') {
      parts = [
        { geo: new BoxGeometry(r * 1.6, r * 1.6, r * 2.0), color: 0xd0602f, at: [0, r * 1.25, 0] },
        { geo: new SphereGeometry(r * 0.85, 12, 10), color: 0xf29a5c, at: [r * 0.45, r * 1.0, 0] },
        { geo: new BoxGeometry(r * 0.95, r * 0.8, r * 0.95), color: 0x7a2c1c, at: [r * 0.25, r * 2.45, 0] },
        { geo: new SphereGeometry(r * 0.5, 10, 8), color: 0xb8c3d6, at: [0, r * 2.1, r * 1.0] },
        { geo: new SphereGeometry(r * 0.5, 10, 8), color: 0xb8c3d6, at: [0, r * 2.1, -r * 1.0] },
        ...eyes(r * 0.74, r * 2.55, r * 0.22, r * 0.13, 0xffffff, PAL.ink),
      ];
    } else {
      parts = [
        { geo: new CylinderGeometry(r * 0.75, r * 0.95, r * 1.9, 14), color: 0x4b3a8a, at: [0, r * 1.05, 0] },
        { geo: new SphereGeometry(r * 0.85, 14, 12), color: 0x6d55c4, at: [0, r * 2.0, 0] },
        { geo: new SphereGeometry(r * 0.55, 12, 10), color: 0x2a1f4d, at: [r * 0.2, r * 2.95, 0] },
        { geo: new CylinderGeometry(r * 0.5, r * 0.44, r * 0.4, 6), color: PAL.gold, at: [r * 0.2, r * 3.45, 0] },
        { geo: new SphereGeometry(r * 0.46, 12, 10), color: 0x9d83ff, at: [r * 0.7, r * 1.5, r * 1.08] },
        { geo: new SphereGeometry(r * 0.46, 12, 10), color: 0x9d83ff, at: [r * 0.7, r * 1.5, -r * 1.08] },
        ...eyes(r * 0.62, r * 3.0, r * 0.2, r * 0.11, 0xff4d6a, 0x5a0010),
      ];
    }
    const body = bake(parts);
    kit = { body, hull: hullGeometry(body) };
    this.enemyKits.set(kind, kit);
    return kit;
  }

  private makeEnemy(kind: EnemyKind): EnemyView {
    const root = new Group(), rig = new Group(), r = ENEMIES[kind].radius, kit = this.enemyKit(kind);
    const shadow = new Mesh(this.geo.blob, this.mats.blob); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.setScalar(r * 1.25);
    const ring = new Mesh(this.geo.ring, this.mats.enemyRing); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.scale.setScalar(r * 1.15);
    const body = new Mesh(kit.body, this.mats.baked);
    rig.add(body, new Mesh(kit.hull, outlineMaterial(kind === 'boss' ? 0.08 : 0.05)));
    root.add(shadow, ring, rig);
    const bar = this.makeBar(kind === 'boss' ? 2.6 : Math.max(0.9, r * 2), this.mats.barEnemy);
    bar.root.position.y = kind === 'boss' ? r * 4.0 : r * 3.4 + 0.25;
    root.add(bar.root);
    this.scene.add(root);
    return { root, rig, body, bar, kind };
  }

  /** Watchtower per level, baked: a static base and a rotating crossbow head. Open top keeps the head visible. */
  private towerKit(level: number): { base: BufferGeometry; baseHull: BufferGeometry; head: BufferGeometry; headHull: BufferGeometry; h: number } {
    let kit = this.towerKits[level];
    if (kit) return kit;
    const trim = [PAL.ally, PAL.super, PAL.gold][level], h = 1.0 + level * 0.3;
    const parts: Part[] = [
      { geo: new CylinderGeometry(0.5, 0.68, h, 8), color: 0xece0c4, at: [0, h / 2, 0] },
      { geo: new CylinderGeometry(0.54, 0.54, 0.18, 8), color: trim, at: [0, h * 0.62, 0] },
      { geo: new CylinderGeometry(0.74, 0.6, 0.24, 8), color: PAL.wood, at: [0, h + 0.12, 0] },
    ];
    for (let i = 0; i < level; i++) parts.push({ geo: new OctahedronGeometry(0.14), color: PAL.gold, at: [(i - (level - 1) / 2) * 0.34, h * 0.62, -0.6] });
    const base = bake(parts);
    const head = bake([
      { geo: new BoxGeometry(0.9, 0.2, 0.22), color: PAL.woodDark, at: [0.2, 0, 0] },
      { geo: new BoxGeometry(0.16, 0.14, 1.15), color: trim, at: [0.5, 0, 0] },
      { geo: new BoxGeometry(0.72, 0.07, 0.07), color: 0xfff1a8, at: [0.45, 0.13, 0] },
    ]);
    kit = { base, baseHull: hullGeometry(base), head, headHull: hullGeometry(head), h };
    this.towerKits[level] = kit;
    return kit;
  }
  private makeTower(level: number): Group {
    const kit = this.towerKit(level), g = new Group(), head = new Group();
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
  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.portrait = height > width;
    const short = Math.min(width, height);
    this.zoom = short >= 720 ? 1 : short <= 420 ? 0.8 : 0.8 + ((short - 420) / 300) * 0.2;
    this.camera.fov = this.portrait ? 46 : 32;
    this.camera.updateProjectionMatrix();
  }

  /** Apply one simulation step's events (FX, animation triggers). */
  applyEvents(events: RushEvent[], reducedMotion: boolean) {
    for (const ev of events) {
      if (ev.type === 'fire' && this.heroShot) { this.heroShot.reset(); this.heroShot.play(); }
      else if (ev.type === 'burst') { this.ring(ev.x, ev.z, 0xc59bff, ev.radius, 0.45, 0.9); this.ring(ev.x, ev.z, 0xffffff, ev.radius * 0.6, 0.25, 1); if (!reducedMotion) this.shake = Math.max(this.shake, 0.45); }
      else if (ev.type === 'kill') this.ring(ev.x, ev.z, ev.kind === 'boss' ? 0xffd166 : 0xffb0b8, ev.kind === 'boss' ? 4 : 1.1, 0.35, 0.8);
      else if (ev.type === 'spark') this.ring(ev.x, ev.z, 0xffffff, 0.35, 0.15, 0.7);
      else if (ev.type === 'hit' && ev.owner !== 'super') this.ring(ev.x, ev.z, ev.owner === 'tower' ? 0xffe07a : 0x8ff7ff, 0.5, 0.14, 0.9);
      else if (ev.type === 'telegraph') this.telegraph(ev.x, ev.z, ev.radius, ev.time);
      else if (ev.type === 'slam') { this.ring(ev.x, ev.z, 0xff5d73, ev.radius, 0.35, 0.9); if (!reducedMotion) this.shake = Math.max(this.shake, 0.6); }
      else if (ev.type === 'townHit' && !reducedMotion) this.shake = Math.max(this.shake, 0.12);
      else if (ev.type === 'heroDown') this.ring(this.hero.position.x, this.hero.position.z, 0xff5d73, 1.6, 0.5, 0.9);
      else if (ev.type === 'build') { const p = PADS[ev.pad]; this.ring(p.x, p.z, 0xffd166, 1.8, 0.45, 0.9); }
    }
  }

  private ring(x: number, z: number, color: number, radius: number, life: number, opacity: number) {
    const mesh = new Mesh(this.geo.ring, basic(color, opacity));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, z);
    mesh.scale.setScalar(radius * 0.3);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.fx.push({ mesh, age: 0, life, grow: radius, fade: opacity, y0: 0.06 });
  }
  private telegraph(x: number, z: number, radius: number, time: number) {
    const mesh = new Mesh(this.geo.ring, basic(0xff3b4e, 0.85));
    const fill = new Mesh(this.geo.disc, basic(0xff3b4e, 0.28));
    for (const m of [mesh, fill]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); m.renderOrder = 3; this.scene.add(m); }
    mesh.scale.setScalar(radius); fill.scale.setScalar(0.01);
    this.telegraphs.push({ mesh, fill, age: 0, life: time });
  }

  sync(s: RushState, dt: number, aim: AimPreview) {
    this.time += dt;
    const h = s.hero, alive = h.downT <= 0;
    // Hero
    this.hero.visible = alive;
    this.hero.position.set(h.x, 0, h.z);
    this.heroBody.rotation.y = yaw(h.facing);
    this.heroMixer?.update(dt);
    this.setBar(this.heroBar, h.hp / HERO.hp);
    this.ammoSegs.forEach((seg, i) => {
      const full = h.ammo > i, partial = h.ammo === i ? h.reloadT / HERO.reload : 0;
      seg.material = full ? this.mats.ammo : this.mats.ammoDim;
      seg.scale.x = full ? 1 : Math.max(0.05, partial);
      seg.position.x = (i - 1) * 0.44 - (full ? 0 : (1 - seg.scale.x) * 0.2);
      seg.quaternion.copy(this.camera.quaternion);
    });
    // Enemies
    const seen = new Set<number>();
    for (const e of s.enemies) {
      seen.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) { v = this.makeEnemy(e.kind); this.enemies.set(e.id, v); }
      this.updateEnemy(v, e);
    }
    // Geometry and materials are shared per kind, so removal only detaches the view.
    for (const [id, v] of this.enemies) if (!seen.has(id)) { this.scene.remove(v.root); this.enemies.delete(id); }
    // Shots
    const live = new Set<number>();
    for (const shot of s.shots) {
      live.add(shot.id);
      let m = this.shots.get(shot.id);
      if (!m) { m = this.makeShot(shot); this.shots.set(shot.id, m); this.scene.add(m); }
      this.updateShot(m, shot);
    }
    for (const [id, m] of this.shots) if (!live.has(id)) { this.scene.remove(m); this.shots.delete(id); }
    // Coins
    const coinIds = new Set<number>();
    for (const c of s.coins) {
      coinIds.add(c.id);
      let m = this.coins.get(c.id);
      if (!m) { m = new Mesh(this.geo.coin, this.mats.coin); m.rotation.x = Math.PI / 2; this.coins.set(c.id, m); this.scene.add(m); }
      m.position.set(c.x, 0.45 + Math.sin(this.time * 5 + c.id) * 0.1, c.z);
      m.rotation.z = this.time * 4 + c.id;
      m.visible = c.life > 3 || Math.floor(c.life * 6) % 2 === 0; // blink before expiring
    }
    for (const [id, m] of this.coins) if (!coinIds.has(id)) { this.scene.remove(m); this.coins.delete(id); }
    // Towers
    s.towers.forEach((t, i) => {
      const level = t ? t.level : -1;
      if (level !== this.towerLevels[i]) {
        if (this.towers[i]) this.scene.remove(this.towers[i]!);
        this.towers[i] = t ? this.makeTower(t.level) : null;
        if (this.towers[i]) { this.towers[i]!.position.set(PADS[i].x, 0, PADS[i].z); this.scene.add(this.towers[i]!); }
        this.towerLevels[i] = level;
      }
      if (t && this.towers[i]) this.towers[i]!.getObjectByName('head')!.rotation.y = yaw(t.facing);
    });
    const reach = alive ? padInReach(s) : -1;
    this.padRings.forEach((ring, i) => {
      (ring.material as MeshBasicMaterial).opacity = i === reach ? 0.6 + Math.sin(this.time * 8) * 0.3 : 0.45;
      ring.scale.setScalar(i === reach ? 1.15 : 1.05);
      ring.visible = !towerMaxed(s, i) || i === reach;
    });
    this.setBar(this.townBar, s.town.hp / s.town.maxHp);
    this.updateAim(s, aim);
    this.updateFx(dt);
    this.updateCamera(s, dt);
  }

  private updateEnemy(v: EnemyView, e: Enemy) {
    v.root.position.set(e.x, 0, e.z);
    v.rig.rotation.y = yaw(e.facing);
    const walk = Math.sin(this.time * 10 + e.id) * 0.06;
    v.rig.position.y = Math.abs(walk);
    if (e.windup) v.rig.scale.set(1.1, 0.88, 1.1); else v.rig.scale.set(1, 1, 1);
    v.body.material = e.flash > 0 ? this.mats.flash : this.mats.baked;
    this.setBar(v.bar, e.hp / e.maxHp);
    v.bar.root.visible = e.kind === 'boss' || e.hp < e.maxHp;
  }

  private makeShot(shot: Shot): Mesh {
    if (shot.owner === 'hero') return new Mesh(this.geo.bolt, this.mats.heroBolt);
    if (shot.owner === 'tower') return new Mesh(this.geo.bolt, this.mats.towerBolt);
    if (shot.owner === 'enemy') { const m = new Mesh(this.geo.orb, this.mats.enemyBolt); return m; }
    const m = new Mesh(this.geo.orb, this.mats.superOrb); m.scale.setScalar(1.8); return m;
  }
  private updateShot(m: Mesh, shot: Shot) {
    if (shot.owner === 'super') {
      // Lobbed: a parabola that lands on the target point.
      const p = 1 - Math.max(0, shot.life) / HERO.superTravel;
      m.position.set(shot.x, 0.6 + Math.sin(p * Math.PI) * 2.6, shot.z);
      return;
    }
    m.position.set(shot.x, shot.owner === 'tower' ? 1.6 : 0.85, shot.z);
    if (shot.owner === 'enemy') return;
    // Capsules point along +y; lay them flat along the velocity.
    m.rotation.set(0, 0, 0);
    m.rotation.order = 'YXZ';
    m.rotation.y = Math.atan2(-shot.vx, -shot.vz);
    m.rotation.x = -Math.PI / 2;
  }

  private updateAim(s: RushState, aim: AimPreview) {
    const h = s.hero, alive = h.downT <= 0;
    this.aimFan.visible = this.aimRing.visible = this.aimLine.visible = false;
    if (!aim || !alive) return;
    if (aim.kind === 'fire') {
      const a = Math.atan2(aim.dir.z, aim.dir.x);
      this.aimFan.visible = true;
      this.aimFan.position.set(h.x, 0.05, h.z);
      this.aimFan.rotation.set(-Math.PI / 2, 0, -a);
      (this.aimFan.material as MeshBasicMaterial).opacity = h.ammo >= 1 ? 0.24 : 0.1;
    } else {
      const l = Math.hypot(aim.offset.x, aim.offset.z), k = l > HERO.superRange ? HERO.superRange / l : 1;
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
  info() { const r = this.renderer.info.render; return { calls: r.calls, triangles: r.triangles, enemies: this.enemies.size, shots: this.shots.size }; }
}

const towerMaxed = (s: RushState, pad: number) => { const t = s.towers[pad]; return !!t && t.level >= TOWER_LEVELS.length - 1; };
