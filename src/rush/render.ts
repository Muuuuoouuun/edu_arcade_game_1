// Three.js view of the Arcana Rush simulation. Reads RushState, never writes it.
import {
  AmbientLight, AnimationMixer, Box3, BoxGeometry, CanvasTexture, CapsuleGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry,
  DirectionalLight, DoubleSide, Group, HemisphereLight, LoopOnce, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial,
  OctahedronGeometry, PerspectiveCamera, Plane, PlaneGeometry, Raycaster, RingGeometry, Scene, SphereGeometry, SRGBColorSpace,
  Vector2, Vector3, WebGLRenderer, type AnimationAction, type Material,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARENA, ENEMIES, HERO, LANES, PADS, TOWER_LEVELS, TOWN, WALLS, type EnemyKind, type Vec } from './data.ts';
import { padInReach, type Enemy, type RushEvent, type RushState, type Shot } from './sim.ts';

export type AimPreview = { kind: 'fire'; dir: Vec } | { kind: 'super'; offset: Vec } | null;

const TEAM = { ally: 0x3fa9ff, enemy: 0xff4d5e };
const HERO_MODEL_URL = '/defense/models/prototypes/gecko-ranger.glb';
const HERO_HEIGHT = 2.0;
/** Yaw that turns the GLB authored front (-z) toward simulation angle 0 (+x). Verified by east/north close-up renders. */
const HERO_MODEL_YAW = -Math.PI / 2;

const lambert = (color: number, extra: Record<string, unknown> = {}) => new MeshLambertMaterial({ color, ...extra });
const basic = (color: number, opacity = 1) => new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
/** Sim angle a → Three.js yaw for an object whose front is +x. */
const yaw = (a: number) => -a;

type Bar = { root: Group; fill: Mesh; width: number };
type EnemyView = { root: Group; body: Group; mats: MeshLambertMaterial[]; base: Color[]; bar: Bar; kind: EnemyKind };
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
  private time = 0;
  readonly geo = {
    blob: new CircleGeometry(1, 20), ring: new RingGeometry(0.82, 1, 32), bolt: new CapsuleGeometry(0.11, 0.5, 4, 8),
    orb: new SphereGeometry(0.28, 12, 10), coin: new CylinderGeometry(0.28, 0.28, 0.08, 14), spark: new OctahedronGeometry(0.22),
    bar: new PlaneGeometry(1, 0.13), disc: new CircleGeometry(1, 40),
  };
  private mats = {
    blob: basic(0x0b1a12, 0.32), allyRing: basic(TEAM.ally, 0.85), enemyRing: basic(TEAM.enemy, 0.8),
    heroBolt: basic(0x8ff7ff), towerBolt: basic(0xffe07a), enemyBolt: basic(0xff7b3a), superOrb: basic(0xc59bff),
    coin: new MeshStandardMaterial({ color: 0xffc83d, metalness: 0.6, roughness: 0.35, emissive: 0x6b4a00 }),
    barBg: basic(0x10161c, 0.8), barAlly: basic(0x52e07c), barEnemy: basic(0xff5160), barTown: basic(0x4fb8ff), ammo: basic(0xffa43a), ammoDim: basic(0x5b3a1a, 0.9),
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.scene.background = new Color(0x2a4d3a);
    this.scene.add(new HemisphereLight(0xdff3ff, 0x3a5a2a, 1.25));
    this.scene.add(new AmbientLight(0xffffff, 0.25));
    const sun = new DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(-6, 14, 8);
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
    const w = ARENA.maxX - ARENA.minX, d = ARENA.maxZ - ARENA.minZ, ppm = 18;
    const c = document.createElement('canvas');
    c.width = Math.round(w * ppm); c.height = Math.round(d * ppm);
    const g = c.getContext('2d')!;
    const px = (v: Vec) => [(v.x - ARENA.minX) * ppm, (v.z - ARENA.minZ) * ppm] as const;
    g.fillStyle = '#5f9c48'; g.fillRect(0, 0, c.width, c.height);
    // Checker tiles give the eye a speed reference, like a sports pitch.
    for (let x = 0; x < w; x += 2) for (let z = 0; z < d; z += 2) {
      if (((x + z) / 2) % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(x * ppm, z * ppm, 2 * ppm, 2 * ppm); }
    }
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '30,70,30' : '160,210,110'},${0.08 + r() * 0.12})`; g.fillRect(r() * c.width, r() * c.height, 2 + r() * 5, 2 + r() * 3); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [width, color] of [[3.3, '#7a6142'], [2.6, '#c9a36b']] as const) {
      g.strokeStyle = color; g.lineWidth = width * ppm;
      for (const lane of LANES) { g.beginPath(); lane.forEach((p, i) => (i ? g.lineTo(...px(p)) : g.moveTo(...px(p)))); g.stroke(); }
    }
    const [tx, tz] = px(TOWN);
    g.fillStyle = '#b8a07a'; g.beginPath(); g.arc(tx, tz, (TOWN.radius + 2.2) * ppm, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(70,50,30,0.5)'; g.lineWidth = 3; g.stroke();
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const ground = new Mesh(new PlaneGeometry(w, d), new MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((ARENA.minX + ARENA.maxX) / 2, 0, (ARENA.minZ + ARENA.maxZ) / 2);
    this.scene.add(ground);
    // Hedge border.
    const hedge = lambert(0x2f6b33);
    const add = (x: number, z: number, sx: number, sz: number) => { const m = new Mesh(new BoxGeometry(sx, 1.1, sz), hedge); m.position.set(x, 0.55, z); this.scene.add(m); };
    add(ARENA.minX - 0.5, (ARENA.minZ + ARENA.maxZ) / 2, 1, d + 2); add(ARENA.maxX + 0.5, (ARENA.minZ + ARENA.maxZ) / 2, 1, d + 2);
    add(0, ARENA.maxZ + 0.5, w + 2, 1); add(0, ARENA.minZ - 0.5, w + 2, 1);
  }

  private buildWalls() {
    const stone = lambert(0x9aa3ad), cap = lambert(0xc5ccd3), dark = lambert(0x6d7680);
    for (const b of WALLS) {
      const g = new Group();
      const body = new Mesh(new BoxGeometry(b.w, 1.2, b.d), stone); body.position.y = 0.6;
      const top = new Mesh(new BoxGeometry(b.w + 0.12, 0.18, b.d + 0.12), cap); top.position.y = 1.29;
      const foot = new Mesh(new BoxGeometry(b.w + 0.2, 0.16, b.d + 0.2), dark); foot.position.y = 0.08;
      g.add(body, top, foot);
      g.position.set(b.x, 0, b.z);
      this.scene.add(g);
    }
  }

  private buildTown() {
    const g = new Group(), stone = lambert(0xd8cbb2), roof = lambert(TEAM.ally), wood = lambert(0x8a5a35), gold = lambert(0xffd166);
    const base = new Mesh(new CylinderGeometry(TOWN.radius, TOWN.radius + 0.15, 1.1, 24), stone); base.position.y = 0.55;
    const keep = new Mesh(new BoxGeometry(2.2, 2.2, 2.2), stone); keep.position.y = 2.1;
    const keepRoof = new Mesh(new ConeGeometry(1.45, 1.3, 4), roof); keepRoof.position.y = 3.95; keepRoof.rotation.y = Math.PI / 4;
    g.add(base, keep, keepRoof);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, x = Math.cos(a) * 1.95, z = Math.sin(a) * 1.95;
      const t = new Mesh(new CylinderGeometry(0.48, 0.55, 2.3, 10), stone); t.position.set(x, 1.6, z);
      const r = new Mesh(new ConeGeometry(0.52, 0.75, 10), roof); r.position.set(x, 3.15, z);
      g.add(t, r);
    }
    const gate = new Mesh(new BoxGeometry(1.1, 1.3, 0.3), wood); gate.position.set(0, 1.2, -1.16);
    const pole = new Mesh(new CylinderGeometry(0.04, 0.04, 1.4, 6), wood); pole.position.set(0, 5.2, 0);
    const flag = new Mesh(new PlaneGeometry(0.8, 0.5), new MeshLambertMaterial({ color: 0xffd166, side: DoubleSide })); flag.position.set(0.42, 5.6, 0);
    const crest = new Mesh(new OctahedronGeometry(0.25), gold); crest.position.set(0, 2.4, -1.15);
    g.add(gate, pole, flag, crest);
    g.position.set(TOWN.x, 0, TOWN.z);
    this.scene.add(g);
  }

  private buildPads() {
    for (const p of PADS) {
      const ring = new Mesh(this.geo.ring, basic(0xffd166, 0.55));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.03, p.z); ring.scale.setScalar(1.05);
      const disc = new Mesh(this.geo.disc, basic(0x3d2c18, 0.35));
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
    const cloak = lambert(0x3d8f5a), skin = lambert(0x9fd36b);
    const body = new Mesh(new CapsuleGeometry(0.36, 0.6, 4, 10), cloak); body.position.y = 0.75;
    const head = new Mesh(new SphereGeometry(0.3, 12, 10), skin); head.position.set(0.05, 1.45, 0);
    const bow = new Mesh(new BoxGeometry(0.7, 0.14, 0.14), lambert(0x8a5a35)); bow.position.set(0.45, 0.95, 0);
    const placeholder = new Group(); placeholder.add(body, head, bow); placeholder.name = 'placeholder';
    this.heroBody.add(placeholder);
    new GLTFLoader().load(HERO_MODEL_URL, gltf => {
      const model = gltf.scene, box = new Box3().setFromObject(model), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
      const k = HERO_HEIGHT / Math.max(size.y, 0.01);
      model.scale.setScalar(k);
      model.position.set(-center.x * k, -box.min.y * k, -center.z * k);
      const holder = new Group(); holder.rotation.y = HERO_MODEL_YAW; holder.add(model);
      this.heroBody.remove(placeholder);
      this.heroBody.add(holder);
      const clip = gltf.animations[0];
      if (clip) {
        this.heroMixer = new AnimationMixer(model);
        this.heroShot = this.heroMixer.clipAction(clip);
        this.heroShot.setLoop(LoopOnce, 1);
        this.heroShot.clampWhenFinished = false;
      }
    }, undefined, () => { /* Keep the placeholder; the prototype stays playable without the model. */ });
  }

  private makeEnemy(kind: EnemyKind): EnemyView {
    const root = new Group(), body = new Group(), def = ENEMIES[kind], r = def.radius;
    const mats: MeshLambertMaterial[] = [];
    const m = (color: number) => { const mat = lambert(color); mats.push(mat); return mat; };
    const shadow = new Mesh(this.geo.blob, this.mats.blob); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.setScalar(r * 1.25);
    const ring = new Mesh(this.geo.ring, this.mats.enemyRing); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.scale.setScalar(r * 1.15);
    root.add(shadow, ring, body);
    if (kind === 'grunt') {
      const torso = new Mesh(new CapsuleGeometry(r * 0.75, r * 0.7, 4, 8), m(0xb2414b)); torso.position.y = r * 1.4;
      const head = new Mesh(new SphereGeometry(r * 0.62, 10, 8), m(0x7c2b38)); head.position.set(r * 0.15, r * 2.45, 0);
      const hornL = new Mesh(new ConeGeometry(r * 0.16, r * 0.6, 6), m(0xf1e2c6)); hornL.position.set(r * 0.1, r * 3.0, r * 0.32); hornL.rotation.x = 0.4;
      const hornR = hornL.clone(); hornR.position.z = -r * 0.32; hornR.rotation.x = -0.4;
      const club = new Mesh(new BoxGeometry(r * 1.3, r * 0.3, r * 0.3), m(0x6b4426)); club.position.set(r * 0.9, r * 1.5, r * 0.6);
      body.add(torso, head, hornL, hornR, club);
    } else if (kind === 'skirmisher') {
      const robe = new Mesh(new ConeGeometry(r * 0.95, r * 2.6, 10), m(0x8a3d9e)); robe.position.y = r * 1.3;
      const head = new Mesh(new SphereGeometry(r * 0.5, 10, 8), m(0x5a2a6a)); head.position.y = r * 2.85;
      const hood = new Mesh(new ConeGeometry(r * 0.6, r * 0.9, 10), m(0x3c1a48)); hood.position.y = r * 3.4;
      const bow = new Mesh(new BoxGeometry(r * 0.25, r * 1.8, r * 0.25), m(0xe8b04a)); bow.position.set(r * 0.85, r * 1.8, 0);
      body.add(robe, head, hood, bow);
    } else if (kind === 'brute') {
      const torso = new Mesh(new BoxGeometry(r * 1.6, r * 1.6, r * 1.9), m(0x8f3a2e)); torso.position.y = r * 1.25;
      const belly = new Mesh(new SphereGeometry(r * 0.8, 10, 8), m(0xc4704f)); belly.position.set(r * 0.45, r * 1.0, 0);
      const head = new Mesh(new BoxGeometry(r * 0.8, r * 0.7, r * 0.8), m(0x5e2420)); head.position.set(r * 0.25, r * 2.35, 0);
      const shoulder = new Mesh(new SphereGeometry(r * 0.45, 8, 6), m(0x9aa3ad)); shoulder.position.set(0, r * 2.05, r * 0.95);
      const shoulder2 = shoulder.clone(); shoulder2.position.z = -r * 0.95;
      body.add(torso, belly, head, shoulder, shoulder2);
    } else {
      const torso = new Mesh(new CylinderGeometry(r * 0.75, r * 0.95, r * 1.9, 12), m(0x3b2f5c)); torso.position.y = r * 1.05;
      const chest = new Mesh(new SphereGeometry(r * 0.8, 12, 10), m(0x5b4590)); chest.position.y = r * 2.0;
      const head = new Mesh(new SphereGeometry(r * 0.45, 10, 8), m(0x261d3d)); head.position.set(r * 0.2, r * 2.85, 0);
      const crown = new Mesh(new CylinderGeometry(r * 0.45, r * 0.4, r * 0.35, 6), m(0xffd166)); crown.position.set(r * 0.2, r * 3.3, 0);
      const fistL = new Mesh(new SphereGeometry(r * 0.42, 10, 8), m(0x8b6fd8)); fistL.position.set(r * 0.7, r * 1.5, r * 1.05);
      const fistR = fistL.clone(); fistR.position.z = -r * 1.05;
      body.add(torso, chest, head, crown, fistL, fistR);
    }
    const bar = this.makeBar(kind === 'boss' ? 2.6 : Math.max(0.9, r * 2), this.mats.barEnemy);
    bar.root.position.y = kind === 'boss' ? r * 3.9 : r * 3.2 + 0.25;
    root.add(bar.root);
    this.scene.add(root);
    return { root, body, mats, base: mats.map(mm => mm.color.clone()), bar, kind };
  }

  private makeTower(level: number): Group {
    // Open-top watchtower: the rotating crossbow must stay visible from the high camera.
    const g = new Group(), trim = [0x3fa9ff, 0x8f6bff, 0xffc23d][level], h = 1.0 + level * 0.3;
    const base = new Mesh(new CylinderGeometry(0.5, 0.68, h, 8), lambert(0xcbbd9f)); base.position.y = h / 2;
    const band = new Mesh(new CylinderGeometry(0.53, 0.53, 0.16, 8), lambert(trim)); band.position.y = h * 0.62;
    const deck = new Mesh(new CylinderGeometry(0.72, 0.6, 0.22, 8), lambert(0x8a5a35)); deck.position.y = h + 0.11;
    const head = new Group(); head.name = 'head'; head.position.y = h + 0.42;
    const stock = new Mesh(new BoxGeometry(0.9, 0.18, 0.2), lambert(0x5b3b22)); stock.position.x = 0.2;
    const limbs = new Mesh(new BoxGeometry(0.14, 0.12, 1.1), lambert(trim)); limbs.position.x = 0.5;
    const bolt = new Mesh(new BoxGeometry(0.7, 0.06, 0.06), basic(0xffe07a)); bolt.position.set(0.45, 0.12, 0);
    head.add(stock, limbs, bolt);
    g.add(base, band, deck, head);
    for (let i = 0; i < level; i++) {
      const star = new Mesh(new OctahedronGeometry(0.13), basic(0xffe07a)); star.position.set((i - (level - 1) / 2) * 0.32, h * 0.62, -0.58);
      g.add(star);
    }
    return g;
  }

  private makeBar(width: number, fillMat: Material): Bar {
    const root = new Group();
    const bg = new Mesh(this.geo.bar, this.mats.barBg); bg.scale.set(width + 0.08, 1.5, 1);
    const fill = new Mesh(new PlaneGeometry(1, 0.13).translate(0.5, 0, 0), fillMat); fill.position.set(-width / 2, 0, 0.01); fill.scale.x = width;
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
    for (const [id, v] of this.enemies) if (!seen.has(id)) { this.scene.remove(v.root); v.mats.forEach(m => m.dispose()); this.enemies.delete(id); }
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
    v.body.rotation.y = yaw(e.facing);
    const walk = Math.sin(this.time * 10 + e.id) * 0.06;
    v.body.position.y = Math.abs(walk);
    if (e.windup) v.body.scale.set(1.08, 0.9, 1.08); else v.body.scale.set(1, 1, 1);
    const flash = e.flash > 0;
    v.mats.forEach((m, i) => m.color.copy(flash ? WHITE : v.base[i]));
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
    // Look a little ahead toward the enemy side, and keep the view inside the arena.
    target.z -= this.portrait ? 1.5 : 2;
    target.x = Math.max(ARENA.minX + 6, Math.min(ARENA.maxX - 6, target.x));
    target.z = Math.max(ARENA.minZ + 6, Math.min(ARENA.maxZ - 6, target.z));
    this.focus.lerp(target, 1 - Math.exp(-6 * dt));
    const height = this.portrait ? 30 : 23, back = this.portrait ? 14 : 12.5;
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

const WHITE = new Color(0xffffff);
const towerMaxed = (s: RushState, pad: number) => { const t = s.towers[pad]; return !!t && t.level >= TOWER_LEVELS.length - 1; };
