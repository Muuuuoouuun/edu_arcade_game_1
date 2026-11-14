// Three.js view of the Arcana Rush simulation. Reads RushState, never writes it.
import {
  Box3, BufferAttribute, DodecahedronGeometry, BoxGeometry, CapsuleGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DirectionalLight, Group, HemisphereLight, IcosahedronGeometry, Mesh, MeshBasicMaterial, OctahedronGeometry, PerspectiveCamera,
  PlaneGeometry, Raycaster, RingGeometry, Scene, SphereGeometry, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
  Matrix4, Object3D, Quaternion, Euler, Frustum, Sphere, BackSide, BufferGeometry, Points, ShaderMaterial, type AnimationAction, type Material, type MeshToonMaterial, type MeshStandardMaterial,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
// Loaded by URL, not bundled: the shared Vite config puts every three/examples module in the first-screen 'three-tools'
// chunk, and this one is only needed once a hero model arrives (cycle 62). The file is self-contained (no imports).
import simplifierUrl from 'three/addons/libs/meshopt_simplifier.module.js?url';
// Shared textured deliveries from models:characters; tools/rush-glb.sh optionally compresses the runtime copies.
import rangerGlb from './models/gecko-ranger.glb?url';
import bronGlb from './models/dwarf-guardian.glb?url';
import bearGlb from './models/polar-bear.glb?url';
import { ARENA, BARRICADES, ENEMIES, HEROES, HERO_SPAWN, LANES, PADS, TOWER_LEVELS, TOWN, type EnemyKind, type HeroDef, type HeroKind, type TowerBranch, type Vec } from './data.ts';
import { barricadeMaxHp, barricadeOrder, heroDef, heroHidden, heroMaxHp, lobReach, padCost, siteInReach, superReady, wardBreakBurst, type Enemy, type RushEvent, type RushState, type Shot } from './sim.ts';
import { BRANCH_TRIM, DEF, barricadeParts, barricadeState, chevronParts, padParts, siteParts, towerParts, type BarricadeState } from './defenceModels.ts';
import { bake, bakeColors, bakeMatrices, BOSS_LOOK, capColors, hullGeometry, mixHex, outlineMaterial, PAL, REGION_LOOK, toon, toonify, wallParts, type BossLook, type BossName, type Part, type RegionLook, type RegionName } from './look.ts';
import { REGIONS, regionOf } from './expedition.ts';
import { FOREST, type MapId, type MapLayout } from './maps.ts';
import { bushParts, coverParts, crateParts, groundTexture, sceneryParts, SCENERY_LOOK } from './mapScenery.ts';
import { loadForestTown, toFloat32 } from './townModel.ts';
import { Batch } from './batch.ts';
import { Particles } from './fx.ts';
import { QUALITY, type Quality } from './quality.ts';
import { TownView } from './townView.ts';
import { TownDamage } from './townDamage.ts';
import { battleFocus } from './battleCamera.ts';
import { HeroMotion } from './heroMotion.ts';
import { cliffColors, createGroundGeometry, createCliffGeometry, heightAt, raycastTerrain } from './terrainElevation.ts';

export type AimPreview = { kind: 'fire'; dir: Vec } | { kind: 'lob'; offset: Vec } | { kind: 'super'; offset: Vec } | null;

const TEAM = { ally: PAL.ally, enemy: PAL.enemy };
const HERO_MODELS: Record<HeroKind, string> = { ranger: rangerGlb, bron: bronGlb, bear: bearGlb };
const heroLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
/** Hero ink hulls at half the triangles (cycle 62; measured in cycle 56: no visible change at battle size, a thin
 * part's ink only starts to drop at a quarter). The simplifier is three.js's bundled meshoptimizer, fetched on demand
 * with the first hero model so the first screen does not pay for it; without it (no WASM) hulls stay full. */
const HULL_RATIO = 0.5;
type Simplifier = (typeof import('three/addons/libs/meshopt_simplifier.module.js'))['MeshoptSimplifier'];
let simplifierLoad: Promise<Simplifier | null> | null = null;
/** ?hullSimplify=0 forces the full-hull fallback (cycle 62: checks that path). */
const simplifierOff = new URLSearchParams(location.search).get('hullSimplify') === '0';
function loadSimplifier(): Promise<Simplifier | null> {
  if (simplifierOff) return Promise.resolve(null);
  simplifierLoad ??= (import(/* @vite-ignore */ simplifierUrl) as Promise<typeof import('three/addons/libs/meshopt_simplifier.module.js')>)
    .then(async ({ MeshoptSimplifier: m }) => { if (!m.supported) return null; await m.ready; return m; })
    .catch(() => null);
  return simplifierLoad;
}
/** The ink hull for a baked hero part: positions only, welded, then simplified (full hull when that is not possible). */
function heroHull(geo: BufferGeometry, simplifier: Simplifier | null): BufferGeometry {
  if (!simplifier) return hullGeometry(geo);
  const g = new BufferGeometry();
  g.setAttribute('position', geo.getAttribute('position').clone());
  const welded = mergeVertices(g, 1e-5);
  const idx = new Uint32Array(welded.index!.array), pos = welded.getAttribute('position').array as Float32Array;
  const [out] = simplifier.simplify(idx, pos, 3, Math.floor(idx.length * HULL_RATIO / 3) * 3, 0.05, []);
  if (out.length < 3) return hullGeometry(geo);
  welded.setIndex(new BufferAttribute(out, 1));
  return hullGeometry(welded);
}
const HERO_HEIGHT = 2.0;
/** Yaw that turns the GLB authored front (-z) toward simulation angle 0 (+x). Verified by east/north close-up renders. */
const HERO_MODEL_YAW = -Math.PI / 2;
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
/** Everything that belongs to one battlefield layout (maps.ts): built once per layout, shown while it is in play. */
type MapKit = { root: Group; bushes: Mesh[]; crates: Map<number, { mesh: Mesh; wobble: number }>; ground: DataTexture };

export class RushView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(42, 1, 0.5, 160);
  private focus = new Vector3(0, 0, 4);
  private shake = 0;
  private townView: TownView | null = null;
  private townHeroTarget = new Vector3();
  private townDamage = new TownDamage();
  private heroDamage = new TownDamage();
  private damageBattle: RushState | null = null;
  private lastSmokeTick = -Infinity;
  private damageStages = { town: 'healthy', hero: 'healthy' };
  private hero = new Group();
  private heroFootprints: Mesh[] = [];
  private superRing: Mesh | null = null;
  private heroBody = new Group();
  /** Team-blue cape per hero (cycle 29): the ally colour on the body itself, not only the ring underfoot. */
  private capes = new Map<HeroKind, Mesh>();
  private heroBar: Bar;
  private ammoSegs: Mesh[] = [];
  /** One loaded model per hero kind; only the current hero's rig is visible. */
  private heroRigs = new Map<HeroKind, { holder: Group; shot: AnimationAction | null; held: Mesh | null; motion: HeroMotion; material: MeshToonMaterial } | 'loading'>();
  private heroKind: HeroKind | null = null;
  private heroPlaceholder: Mesh | null = null;
  private get heroRig() { const r = this.heroKind ? this.heroRigs.get(this.heroKind) : undefined; return r && r !== 'loading' ? r : null; }
  private get heroShot() { return this.heroRig?.shot ?? null; }
  private enemyKits = new Map<string, { body: BufferGeometry; hull: BufferGeometry }>();
  private towerKits = new Map<string, { base: BufferGeometry; baseHull: BufferGeometry; head: BufferGeometry; headHull: BufferGeometry; headY: number; height: number }>();
  private towers: (Group | null)[] = PADS.map(() => null);
  private towerLevels: string[] = PADS.map(() => '');
  /** Defence feedback per tower: build pop (s left), recoil after a shot, last cooldown seen (a jump = it fired), idle fx timer. */
  private towerFx = PADS.map(() => ({ pop: 0, recoil: 0, cd: 0, idle: Math.random() }));
  /** Build-site rings: pads first, then barricade sites (same order as siteInReach kinds). */
  private siteRings: Mesh[] = [];
  /** Barricades (defence lane): one group per site, its geometry swapped by level, damage state and region. */
  private barricadeKits = new Map<string, { body: BufferGeometry; hull: BufferGeometry }>();
  private barricadeViews: { root: Group; body: Mesh; hull: Mesh; key: string; wobble: number; pop: number }[] = [];
  private chevrons!: { body: Batch; hull: Batch };
  private townBar: Bar;
  private fx: Fx[] = [];
  private particles: Particles;
  /** Layout kits by map id; `kit` is the one in play (see useMap). */
  private kits = new Map<MapId, MapKit>();
  private kit: MapKit | null = null;
  private styledMap: MapLayout | null = null;
  private ground: Mesh | null = null;
  /** Debug (?overhead=1 or __rush.overhead): look straight down on the whole arena to check a layout. */
  overhead = false;
  /** Low quality hides these (cycle 12): ink hulls on walls, hedges and bushes, and the shore decor. */
  private terrainHulls: Mesh[] = [];
  private decor: Mesh[] = [];
  quality: Quality = 'high';
  /** Region restyle (expedition merge): the view lives for the whole session, so a battle on another stage swaps
   * colour sets on the same meshes instead of rebuilding them. `styledStage` is the stage the scene is dressed for. */
  private styledStage = 1;
  private region: RegionName = 'forest';
  private regionColors: { geo: BufferGeometry; sets: Record<RegionName, BufferAttribute> }[] = [];
  private bossKill: number = BOSS_LOOK.default.kill;
  private hemi = new HemisphereLight(REGION_LOOK.forest.hemiSky, REGION_LOOK.forest.hemiGround, 1.15);
  private water: Mesh | null = null;
  private snow: Points | null = null;
  private snowTime = 0;
  private get look(): RegionLook { return REGION_LOOK[this.region]; }
  private size = { w: 1, h: 1 };
  /** Model-sheet mode (?sheet=1): only characters on a flat background, for silhouette checks. */
  private sheetMode = false;
  /** Instanced batches: draw calls stay fixed however many enemies, shots and coins are alive. */
  private batches!: {
    body: Record<EnemyKind, Batch>; hull: Record<EnemyKind, Batch>; flash: Record<EnemyKind, Batch>; ice: Record<EnemyKind, Batch>; ward: Record<EnemyKind, Batch>;
    shadow: Batch; ring: Batch; frostRing: Batch; wardRing: Batch; streak: Batch; barBg: Batch; barFill: Batch; shots: Record<Shot['owner'], Batch>; branchShots: Record<TowerBranch, Batch>; coins: Batch;
  };
  private counts = { enemies: 0, shots: 0 };
  private tmp = { m: new Matrix4(), q: new Quaternion(), e: new Euler(), p: new Vector3(), s: new Vector3(), o: new Vector3() };
  private frustum = new Frustum();
  private sphere = new Sphere();
  /** Per-instance culling for the batches (InstancedMesh cannot cull individual instances itself). */
  private onScreen(x: number, y: number, z: number, r: number) {
    this.sphere.center.set(x, y + this.groundHeight(x,z), z);
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
  private decalBases = new WeakMap<Mesh, Float32Array>();
  private decalPoint = new Vector3();
  private decalInverse = new Matrix4();
  private shotOrigins = new Map<number, {x:number;z:number}>();
  private shotBattle: RushState | null = null;
  private groundHeight(x: number, z: number) { return this.sheetMode ? 0 : heightAt(x,z); }
  /** Drape only the translucent ground decal; solid architecture remains rigid. */
  private conformDecal(mesh: Mesh, lift = .05) {
    let base=this.decalBases.get(mesh);
    if (!base) {
      const original = mesh.geometry;
      mesh.geometry = original.clone();
      // Preserve shared primitives, but release one-off aim/swing geometry after cloning.
      if (!Object.values(this.geo).some(geometry => geometry === original)) original.dispose();
      base = Float32Array.from(mesh.geometry.getAttribute('position').array);
      this.decalBases.set(mesh, base);
      mesh.frustumCulled = false;
    }
    mesh.updateWorldMatrix(true,false);this.decalInverse.copy(mesh.matrixWorld).invert();
    const pos=mesh.geometry.getAttribute('position');
    for(let i=0;i<pos.count;i++) {
      this.decalPoint.fromArray(base,i*3).applyMatrix4(mesh.matrixWorld);
      this.decalPoint.y=this.groundHeight(this.decalPoint.x,this.decalPoint.z)+lift;
      this.decalPoint.applyMatrix4(this.decalInverse);pos.setXYZ(i,this.decalPoint.x,this.decalPoint.y,this.decalPoint.z);
    }
    pos.needsUpdate=true;
  }
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
    blob: basic(0x0b1a12, 0.32), allyRing: basic(TEAM.ally, 0.85), enemyRing: basic(TEAM.enemy, 0.8), frostRing: basic(REGION_LOOK.forest.frostRing, 0.9),
    heroBolt: basic(0x8ff7ff), towerBolt: basic(0xffe07a), enemyBolt: basic(0xff7b3a), superOrb: basic(0xc59bff), snowball: basic(0xf4fbff),
    coin: toon(PAL.gold, { emissive: 0x5a3a00, rim: 0.5 }),
    hero: toon(0xffffff, { vertexColors: true, rim: 0.34 }),
    baked: toon(0xffffff, { vertexColors: true, rim: 0.34 }), flash: basic(0xffffff),
    // Enemy bodies only (same program as `baked`): its colour is the region tint, set once per battle.
    enemy: toon(0xffffff, { vertexColors: true, rim: 0.34 }),
    barBg: basic(0x10161c, 0.8), barAlly: basic(0x52e07c), barEnemy: basic(0xff5160), barTown: basic(0x4fb8ff), ammo: basic(0xffa43a), ammoDim: basic(0x5b3a1a, 0.9),
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.scene.background = new Color(PAL.water);
    // Toon bands come from the key light; the sky/ground fill keeps the shadow band bright and colourful.
    this.scene.add(this.hemi);
    const sun = new DirectionalLight(0xfff3dc, 2.2);
    sun.position.set(-7, 16, 9);
    this.scene.add(sun);

    this.particles = new Particles(this.scene, 360, (x,z) => this.groundHeight(x,z));
    this.buildGround();
    this.useMap(FOREST);
    this.buildTown();
    this.buildPads();
    this.townBar = this.makeBar(3.2, this.mats.barTown);
    this.townBar.root.visible = false;
    this.townBar.root.position.set(TOWN.x, 4.6, TOWN.z);
    this.scene.add(this.townBar.root);

    this.buildBatches();
    this.buildHero();
    this.heroBar = this.makeBar(1.3, this.mats.barAlly);
    this.heroBar.root.visible = false;
    this.heroBar.root.position.y = 2.55;
    this.hero.add(this.heroBar.root);
    for (let i = 0; i < HEROES.ranger.ammoMax; i++) {
      const seg = new Mesh(new PlaneGeometry(0.4, 0.1), this.mats.ammo);
      seg.visible = false;
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
    const cx=(ARENA.minX+ARENA.maxX)/2,cz=(ARENA.minZ+ARENA.maxZ)/2;
    // The ground's colours come from a texture painted per layout (mapScenery.ts `groundTexture`, set in useMap):
    // one colour per vertex smeared every edge across a metre.
    const ground = new Mesh(createGroundGeometry(), toon(0xffffff,{rim:0}));
    ground.name='rush-walkable-approach';this.ground=ground;
    const cliff = new Mesh(createCliffGeometry(), toon(0xffffff,{vertexColors:true,rim:.1}));
    cliff.name='rush-rock-foundation';
    const water = new Mesh(new PlaneGeometry(240,240),toon(PAL.water,{rim:0}));
    water.rotation.x=-Math.PI/2;water.position.set(cx,-1.3,cz);
    this.scene.add(water,cliff,ground);this.water=water;
    const snow=REGION_LOOK.snow;
    this.regional(cliff.geometry,cliffColors(snow.ground));
    // Short hedge sections follow the slope without bending stone cover or changing collision bounds.
    const parts:Part[]=[];
    const hedge=(x:number,z:number,sx:number,sz:number)=>{
      const y=heightAt(x,z);
      parts.push({geo:new BoxGeometry(sx,1,sz),color:0,at:[x,y+.5,z]});
      parts.push({geo:new BoxGeometry(sx+.1,.28,sz+.1),color:1,at:[x,y+1.08,z]});
    };
    // Part colours are slots here (0 side, 1 top), filled per region.
    const dress=(look:RegionLook)=>parts.map(p=>({...p,color:p.color?look.hedgeTop:look.hedge}));
    for(let z=ARENA.minZ;z<ARENA.maxZ;z++) {hedge(ARENA.minX-.55,z+.5,1.1,1.02);hedge(ARENA.maxX+.55,z+.5,1.1,1.02);}
    hedge(cx,ARENA.maxZ+.55,ARENA.maxX-ARENA.minX+2.2,1.1);
    hedge(cx,ARENA.minZ-.55,ARENA.maxX-ARENA.minX+2.2,1.1);
    this.regional(this.addBaked(bake(dress(REGION_LOOK.forest)),.04,undefined,'terrain').geometry,bakeColors(dress(snow)));
    // Decorative shore props are omitted: there is now a rock drop, not a flat sandy shelf.
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
    if (at) mesh.position.set(at.x, this.groundHeight(at.x,at.z), at.z);
    this.scene.add(mesh);
    return mesh;
  }

  /** Register a second (snow) colour set for a static mesh; restyle() swaps the geometry's colour attribute. */
  private regional(geo: BufferGeometry, snow: Float32Array | BufferAttribute) {
    this.regionColors.push({ geo, sets: { forest: geo.getAttribute('color') as BufferAttribute, snow: snow instanceof BufferAttribute ? snow : new BufferAttribute(snow, 3) } });
  }

  /** Dress the scene for a stage: region palette, snowfall, and the region boss. Runs only when the stage changes. */
  private restyle(stage: number, map: MapLayout) {
    this.styledStage = stage;
    this.useMap(map);
    const region = regionOf(stage), look = REGION_LOOK[region];
    this.region = region;
    if (!this.sheetMode) (this.scene.background as Color).setHex(look.water);
    ((this.water?.material) as MeshToonMaterial | undefined)?.color.setHex(look.water);
    this.hemi.color.setHex(look.hemiSky); this.hemi.groundColor.setHex(look.hemiGround);
    for (const r of this.regionColors) r.geo.setAttribute('color', r.sets[region]);
    this.townView?.setSnow(look.cap);
    this.mats.enemy.color.setHex(look.enemyTint);
    this.mats.frostRing.color.setHex(look.frostRing);
    ICE.color.setHex(look.ice); ICE.opacity = look.iceOpacity;
    (this.aimFan.material as MeshBasicMaterial).color.setHex(look.aimFan);
    (this.aimLob.material as MeshBasicMaterial).color.setHex(look.aimLob);
    // Named boss on the last stage of a region; any other boss wave (and the endless challenge) keeps the default.
    const boss: BossName = stage === REGIONS[region].stages[1] ? region : 'default';
    // Enemy shapes for this battle: winter clothes on snow, and the named boss's own shape. Kits are baked on first use.
    if (this.batches) for (const kind of ENEMY_KINDS) {
      const kit = this.enemyKit(kind, kind === 'boss' ? boss : region === 'snow' ? 'snow' : 'default'), B = this.batches;
      for (const set of [B.body, B.flash, B.ice, B.ward]) set[kind].mesh.geometry = kit.body;
      B.hull[kind].mesh.geometry = kit.hull;
    }
    this.bossKill = BOSS_LOOK[boss].kill;
  }

  /** Show a layout's kit (walls, cover, crates, gates, scenery, painted ground), building it the first time. */
  private useMap(map: MapLayout) {
    this.styledMap = map;
    let kit = this.kits.get(map.id);
    if (!kit) { kit = this.buildKit(map); this.kits.set(map.id, kit); }
    for (const k of this.kits.values()) k.root.visible = k === kit && !this.sheetMode;
    this.kit = kit;
    const mat = this.ground!.material as MeshToonMaterial;
    if (mat.map !== kit.ground) { mat.map = kit.ground; mat.needsUpdate = true; }
  }

  private buildKit(map: MapLayout): MapKit {
    const root = new Group(), spec = QUALITY[this.quality], region = REGION_LOOK[map.id];
    root.name = `rush-map-${map.id}`;
    const ground = groundTexture(map, region.ground, SCENERY_LOOK[map.id]);
    ground.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const inked = (geo: BufferGeometry, hullOf: BufferGeometry, width: number) => {
      const mesh = new Mesh(geo, this.mats.baked), hull = new Mesh(hullGeometry(hullOf), outlineMaterial(width));
      mesh.add(hull); hull.visible = spec.terrainOutlines; this.terrainHulls.push(hull);
      root.add(mesh);
      return mesh;
    };
    // Walls: every part stays inside its collider (wall.test.ts); one baked mesh and one hull for all of them.
    const walls: Part[] = map.walls.flatMap(w => {
      const base = heightAt(w.x, w.z), low = heightAt(w.x, w.z - w.d / 2);
      const raised = coverParts(w, wallParts).map(p => ({ ...p, at: [p.at![0], p.at![1] + base, p.at![2]] as [number, number, number] }));
      // A grounded footing fills the lower end of cover that straddles the ramp.
      if (base > low) raised.push({ geo: new BoxGeometry(w.w, base - low, w.d), color: PAL.stoneFoot, at: [w.x, (base + low) / 2, w.z] });
      return raised;
    });
    if (walls.length) { const g = bake(walls); inked(g, g, 0.05); }
    // Gates, bridges and the land around the field: one mesh, ink on the gates, bridges, trees and rocks only.
    const scenery = sceneryParts(map);
    inked(bake(scenery.frame), bake(scenery.outlined), 0.05).name = 'rush-map-frame';
    if (scenery.extra.length) {
      const extra = new Mesh(bake(scenery.extra), this.mats.baked);
      extra.name = 'rush-map-extra'; extra.visible = spec.decor; this.decor.push(extra);
      root.add(extra);
    }
    // Hiding cover: walk-through, see-through when the hero hides in it.
    const bushes = map.bushes.map((b, i) => {
      const geo = bake(bushParts(b, map.id, 3 + i * 7));
      const position = geo.getAttribute('position');
      for (let k = 0; k < position.count; k++) position.setY(k, position.getY(k) + heightAt(b.x + position.getX(k), b.z + position.getZ(k)) - heightAt(b.x, b.z));
      position.needsUpdate = true; geo.computeVertexNormals();
      const mat = toon(0xffffff, { vertexColors: true, rim: 0.3 });
      mat.transparent = true;
      const mesh = new Mesh(geo, mat), hull = new Mesh(hullGeometry(geo), outlineMaterial(0.03));
      mesh.add(hull); hull.visible = spec.terrainOutlines; this.terrainHulls.push(hull);
      mesh.position.set(b.x, heightAt(b.x, b.z), b.z);
      mesh.renderOrder = 6; // drawn after the hero so the see-through state shows them
      root.add(mesh);
      return mesh;
    });
    const crates = new Map<number, { mesh: Mesh; wobble: number }>();
    const crateGeo = [false, true].map(treasure => { const geo = bake(crateParts(treasure, map.id)); return { geo, hull: hullGeometry(geo) }; });
    map.crates.forEach((c, i) => {
      const kind = crateGeo[c.gold ? 1 : 0], mesh = new Mesh(kind.geo, this.mats.baked);
      mesh.add(new Mesh(kind.hull, outlineMaterial(0.04)));
      mesh.position.set(c.x, heightAt(c.x, c.z), c.z);
      root.add(mesh);
      crates.set(1 + i, { mesh, wobble: 0 });
    });
    this.scene.add(root);
    return { root, bushes, crates, ground };
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
    const town = new TownView(bake(parts));
    this.townView = town;
    town.root.position.y=heightAt(TOWN.x,TOWN.z);
    this.scene.add(town.root);
    // Cycle 66: the shared meshopt web copy (townModel.ts); the scene is shared with the town screen, so it is not disposed.
    loadForestTown().then(scene => { try { town.accept(scene); } catch { town.fail(); } }, () => town.fail());
  }

  /** Respawn dial (cycle 80): while the hero is down, a team-blue pie at the respawn spot fills clockwise toward the
   * return; no text (#107 hid the toast that said when). Kept hero-sized: a wider ring slid under the castle's back
   * towers from the battle camera. 24 pre-built wedges, so nothing is rebuilt per frame. */
  private respawnDial: { root: Group; fill: Mesh; steps: CircleGeometry[] } | null = null;
  private syncRespawn(downT: number, total: number) {
    if (downT <= 0) { if (this.respawnDial) this.respawnDial.root.visible = false; return; }
    if (!this.respawnDial) {
      const root = new Group(), r = 0.66, top = Math.PI / 2;
      const flat = (m: Mesh, order: number, y: number) => { m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = order; root.add(m); return m; };
      flat(new Mesh(new CircleGeometry(r, 32), basic(PAL.ink, 0.5)), 4, 0);
      flat(new Mesh(new RingGeometry(r, r + 0.11, 32), basic(PAL.ink, 0.9)), 4, 0);
      // Positive arc lengths only (a negative one flips the winding and is culled); the start walks clockwise from 12 o'clock.
      const steps = Array.from({ length: 24 }, (_, i) => { const len = ((i + 1) / 24) * Math.PI * 2; return new CircleGeometry(r - 0.04, 32, top - len, len); });
      const fill = flat(new Mesh(steps[0], basic(PAL.ally, 0.95)), 5, 0.01);
      root.position.set(HERO_SPAWN.x, this.groundHeight(HERO_SPAWN.x, HERO_SPAWN.z) + 0.08, HERO_SPAWN.z);
      this.scene.add(root);
      this.respawnDial = { root, fill, steps };
    }
    const d = this.respawnDial, k = Math.min(23, Math.max(0, Math.ceil((1 - downT / total) * 24) - 1));
    d.root.visible = true;
    d.fill.geometry = d.steps[k];
  }

  /** Build sites (defence lane): stone slabs under the tower pads and marker stakes at the barricade sites, baked into one
   * mesh; a build ring per site (gold = affordable, pale = not yet, green = a barricade to repair); the barricade views;
   * and the "can upgrade" chevrons (two instanced draws for all of them). */
  private buildPads() {
    const parts: Part[] = [];
    PADS.forEach(p => parts.push(...padParts(p.x, heightAt(p.x, p.z), p.z)));
    BARRICADES.forEach(b => parts.push(...siteParts(b.x, heightAt(b.x, b.z), b.z, siteAngle(b))));
    const geo = bake(parts), snow = bakeColors(parts.map(coolPart)), snowAttr = new BufferAttribute(snow, 3);
    capColors(geo, snowAttr, REGION_LOOK.snow.cap ?? 0xffffff, 0.7, -Infinity, 0.6);
    this.regional(this.addBaked(geo, 0.035, undefined, 'terrain').geometry, snowAttr);
    for (const p of [...PADS, ...BARRICADES]) {
      const ring = new Mesh(this.geo.ring, basic(0xffe48a, 0.8));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, heightAt(p.x,p.z)+0.2, p.z); ring.scale.setScalar(1.12);
      ring.renderOrder = 2;
      this.scene.add(ring);
      this.siteRings.push(ring);
    }
    BARRICADES.forEach(b => {
      const root = new Group(), body = new Mesh(undefined, this.mats.baked), hull = new Mesh(undefined, outlineMaterial(0.045));
      root.add(body, hull);
      root.position.set(b.x, heightAt(b.x, b.z), b.z);
      root.rotation.y = siteAngle(b);
      root.visible = false;
      this.scene.add(root);
      this.barricadeViews.push({ root, body, hull, key: '', wobble: 0, pop: 0 });
    });
    const chevron = bake(chevronParts());
    this.chevrons = { body: new Batch(this.scene, chevron, this.mats.baked, 8, { order: 5 }), hull: new Batch(this.scene, hullGeometry(chevron), outlineMaterial(0.04), 8, { order: 5 }) };
  }

  private buildHero() {
    const shadow = new Mesh(this.geo.blob, this.mats.blob); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.setScalar(0.62);
    const ring = new Mesh(this.geo.ring, this.mats.allyRing); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.scale.setScalar(0.72);
    // Super-ready ring (cycle 85): the super colour around the team ring while the super is charged, so the eye on the hero
    // sees it without looking at the button corner (the "super ready" toast is hidden since #107).
    const charged = new Mesh(new RingGeometry(0.86, 1, 40), basic(PAL.super, 0.9)); charged.rotation.x = -Math.PI / 2; charged.position.y = 0.04; charged.visible = false;
    this.superRing = charged;
    this.hero.add(shadow, ring, charged, this.heroBody);this.heroFootprints=[shadow,ring];
    // Fallback body, replaced if the GLB loads.
    const placeholderGeo = bake([
      { geo: new CapsuleGeometry(0.36, 0.6, 4, 10), color: 0x3d8f5a, at: [0, 0.75, 0] },
      { geo: new SphereGeometry(0.34, 12, 10), color: 0x9fd36b, at: [0.05, 1.5, 0] },
      { geo: new BoxGeometry(0.7, 0.14, 0.14), color: PAL.wood, at: [0.45, 0.95, 0] },
    ]);
    const placeholder = new Mesh(placeholderGeo, this.mats.hero);
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
      const cape = new Mesh(geo, this.mats.hero);
      cape.add(new Mesh(hullGeometry(geo), outlineMaterial(0.035)));
      cape.visible = false;
      this.heroBody.add(cape);
      this.capes.set(kind, cape);
    }
  }

  /** Light snowfall in the snow region: one Points draw, animated in the vertex shader (no per-frame CPU work or
   * allocation). The flake box wraps around the camera focus, so a few flakes cover the whole arena. Half the flakes on
   * the low tier; none under reduced motion or in the forest. Built on the first snow battle. */
  private syncSnow(dt: number, reduced: boolean) {
    const want = Math.round(this.look.snowfall * QUALITY[this.quality].particles);
    const on = want > 0 && !reduced && !this.sheetMode;
    if (!on) { if (this.snow) this.snow.visible = false; return; }
    if (!this.snow) {
      const n = REGION_LOOK.snow.snowfall, base = new Float32Array(n * 3);
      let seed = 11;
      for (let i = 0; i < base.length; i++) base[i] = (seed = (seed * 16807) % 2147483647) / 2147483647;
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(base, 3));
      const mat = new ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uFocus: { value: new Vector3() }, uHalfHeight: { value: 1 } },
        vertexShader: `uniform float uTime; uniform vec3 uFocus; uniform float uHalfHeight; varying float vFade;
          void main() {
            vec3 box = vec3(30.0, 8.0, 24.0);
            float r = fract(position.x * 7.31 + position.z * 3.17);
            vec3 p = position * box;
            p.y = mod(p.y - uTime * (1.1 + 0.9 * r), box.y);
            p.x += sin(uTime * 0.7 + r * 6.2832) * 0.4;
            p.xz = mod(p.xz - uFocus.xz, box.xz) - box.xz * 0.5 + uFocus.xz;
            vFade = smoothstep(0.0, 0.8, p.y) * (0.65 + 0.35 * r);
            vec4 mv = modelViewMatrix * vec4(p.x, p.y + uFocus.y, p.z, 1.0);
            gl_PointSize = (0.1 + 0.07 * r) * projectionMatrix[1][1] * uHalfHeight / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `varying float vFade;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            gl_FragColor = vec4(1.0, 1.0, 1.0, 0.9 * vFade * smoothstep(0.5, 0.32, d));
          }`,
      });
      this.snow = new Points(geo, mat);
      this.snow.frustumCulled = false;
      this.snow.renderOrder = 7;
      this.scene.add(this.snow);
    }
    if (!this.fxPaused) this.snowTime += dt;
    const u = (this.snow.material as ShaderMaterial).uniforms;
    u.uTime.value = this.snowTime;
    (u.uFocus.value as Vector3).copy(this.focus);
    u.uHalfHeight.value = this.renderer.domElement.height / 2;
    this.snow.geometry.setDrawRange(0, want);
    this.snow.visible = true;
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
    this.aimFan.geometry.dispose();this.decalBases.delete(this.aimFan);
    this.aimFan.geometry = this.fanGeometry(def);
  }

  private loadHeroModel(kind: HeroKind) {
    this.heroRigs.set(kind, 'loading');
    // The simplifier downloads alongside the model; baking waits for both (cycle 62).
    const simplifier = loadSimplifier();
    heroLoader.load(HERO_MODELS[kind], gltf => void simplifier.then(simplifier => {
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
      // Bake parts per animated owner instead of drawing each costume piece separately.
      // The shared atlas and UVs survive batching; all clips contribute articulated owners.
      const animated = new Set(gltf.animations.flatMap(c => c.tracks).map(t => t.name.split('.')[0]));
      const meshes: Mesh[] = [];
      model.traverse(node => { if (node instanceof Mesh) meshes.push(node); });
      const sourceMaterial = meshes.find(m => !Array.isArray(m.material))?.material as MeshStandardMaterial | undefined;
      const material = this.mats.hero.clone();
      material.map = sourceMaterial?.map ?? null;
      material.normalMap = sourceMaterial?.normalMap ?? null;
      if (sourceMaterial?.normalScale) material.normalScale.copy(sourceMaterial.normalScale);
      if (material.map) material.map.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      // Three's clone does not copy onBeforeCompile; preserve the common toon rim program.
      material.onBeforeCompile = this.mats.hero.onBeforeCompile;
      material.customProgramCacheKey = this.mats.hero.customProgramCacheKey;
      material.needsUpdate = true;
      const groups = new Map<Object3D, { geo: BufferGeometry; color: number; matrix: Matrix4 }[]>();
      const inv = new Matrix4(), ws = new Vector3(), hidden = new MeshBasicMaterial({ visible: false });
      const drop = new Set(HERO_DROP[kind] ?? []);
      for (const mesh of meshes) {
        if (drop.has(mesh.name) || (kind === 'bear' && mesh.userData.rushHideForThrow)) { mesh.removeFromParent(); continue; }
        let owner: Object3D = model;
        for (let p: Object3D | null = mesh; p && p !== model; p = p.parent) if (animated.has(p.name)) { owner = p; break; }
        if (owner === mesh) { toonify(mesh); mesh.add(new Mesh(heroHull(mesh.geometry, simplifier), outlineMaterial(+(0.035 / (mesh.getWorldScale(ws).x || 1)).toFixed(3)))); continue; }
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
        held = new Mesh(geo, this.mats.hero);
        held.add(new Mesh(hullGeometry(geo), outlineMaterial(+(0.035 / (propNode.getWorldScale(ws).x || 1)).toFixed(3))));
        propNode.add(held);
      }
      for (const [owner, parts] of groups) {
        const geo = bakeMatrices(parts, !!material.map), body = new Mesh(geo, material);
        body.add(new Mesh(heroHull(geo, simplifier), outlineMaterial(+(0.035 / (owner.getWorldScale(ws).x || 1)).toFixed(3))));
        owner.add(body);
      }
      const motion = new HeroMotion(model, gltf.animations, kind);
      this.heroRigs.set(kind, { holder, shot: motion.shot, held, motion, material });
    }), undefined, () => { this.heroRigs.delete(kind); /* Keep the placeholder; the prototype stays playable without the model. */ });
  }

  /** One baked body + hull per enemy kind and look, shared by every instance of that kind. Looks: every kind has its
   * forest shape; in the snow region the five raiders wear winter bits (cream fur collars, trims and boots); the boss has
   * three shapes (unnamed, stage 5 elder tree king, stage 10 frost lord). restyle() swaps the batches' geometry per battle. */
  private enemyKit(kind: EnemyKind, look: BossName = 'default'): { body: BufferGeometry; hull: BufferGeometry } {
    const snow = look === 'snow' && kind !== 'wolf', key = kind === 'boss' ? (look === 'default' ? kind : `${kind}:${look}`) : snow ? `${kind}:snow` : kind;
    let kit = this.enemyKits.get(key);
    if (kit) return kit;
    // Drawn larger than the hitbox (ENEMY_SCALE): every length below is in visual radii.
    const r = ENEMIES[kind].radius * ENEMY_SCALE[kind];
    // Low segment counts on purpose (cycles 50 and 54): from the high camera a small enemy reads the same, and the
    // heavy scene draws each body two to three times (body, ink hull, frost or ward shell).
    const S = (rad: number, w = 8, h = 5) => new SphereGeometry(rad * r, w, h);
    const X = (x: number, y: number, z: number) => new BoxGeometry(x * r, y * r, z * r);
    const C = (rad: number, h: number, seg = 6) => new ConeGeometry(rad * r, h * r, seg);
    const Y = (top: number, bottom: number, h: number, seg = 8, open = false) => new CylinderGeometry(top * r, bottom * r, h * r, seg, 1, open);
    const I = (rad: number) => new IcosahedronGeometry(rad * r, 0);
    const O = (rad: number) => new OctahedronGeometry(rad * r);
    const P = (geo: BufferGeometry, color: number, x: number, y: number, z: number, rot?: [number, number, number], scale?: [number, number, number]): Part => ({ geo, color, at: [x * r, y * r, z * r], rot, scale });
    /** A part and its mirror image across the body's centre line (z → -z). */
    const pair = (make: () => BufferGeometry, color: number, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0]): Part[] =>
      [P(make(), color, x, y, z, rot), P(make(), color, x, y, -z, [-rot[0], -rot[1], rot[2]])];
    /** Big eyes with pupils looking forward, and (with `brow`) two slanted brows: an angry V. */
    const face = (x: number, y: number, z: number, size: number, white: number, pupil: number, brow?: number): Part[] => [
      ...pair(() => I(size), white, x, y, z),
      ...pair(() => I(size * 0.52), pupil, x + size * 0.62, y - size * 0.05, z * 0.92),
      ...(brow === undefined ? [] : pair(() => X(size * 0.5, size * 0.32, size * 2.2), brow, x + size * 0.2, y + size * 1.12, z * 1.05, [-0.42, 0, 0])),
    ];
    const FUR = 0xfff1dc, BONE = 0xfff0d2, IRON = 0x8f9bb5;
    let parts: Part[];
    if (kind === 'grunt') {
      // Raider imp: round body, big head with horns and ears, an underbite with two fangs, a bone club raised to one side.
      const skin = 0xd13c44, dark = 0x4a1a26;
      parts = [
        P(S(0.85), 0xe2463f, 0, 0.95, 0, undefined, [1, 0.95, 1.08]),
        P(Y(0.86, 0.9, 0.22, 8, true), dark, 0, 0.72, 0), P(X(0.14, 0.3, 0.34), PAL.gold, 0.88, 0.72, 0),
        P(S(0.78, 8, 6), skin, 0.12, 1.95, 0),
        ...pair(() => C(0.2, 0.6, 4), skin, 0.05, 1.95, 0.88, [1.35, 0, 0]),
        ...pair(() => C(0.22, 0.8, 5), BONE, 0.05, 2.68, 0.42, [0.55, 0, 0]),
        ...pair(() => X(0.55, 0.28, 0.4), 0x6e1f2c, 0.15, 0.14, 0.42),
        ...face(0.7, 2.1, 0.32, 0.26, 0xffffff, PAL.ink, dark),
        P(X(0.12, 0.16, 0.52), dark, 0.84, 1.68, 0), ...pair(() => C(0.08, 0.24, 4), 0xffffff, 0.88, 1.78, 0.17),
        P(I(0.28), skin, 0.3, 1.45, 0.98), P(I(0.28), skin, 0.4, 1.2, -0.9),
        P(X(0.2, 1.4, 0.2), 0x8a5a2c, 0.35, 2.0, 1.1, [0.35, 0, 0]),
        P(I(0.46), 0xfff3dc, 0.35, 2.78, 1.4), P(C(0.1, 0.42, 4), IRON, 0.35, 3.2, 1.55, [0.35, 0, 0]),
        P(C(0.3, 0.45, 5), IRON, 0, 1.6, 0.78, [0.8, 0, 0]),
      ];
      if (snow) parts.push(P(Y(0.62, 0.76, 0.32), FUR, 0.05, 1.4, 0), ...pair(() => X(0.62, 0.2, 0.48), FUR, 0.15, 0.34, 0.42));
    } else if (kind === 'skirmisher') {
      // Masked archer: thin robe, wide hat with a red feather, a bandit mask with yellow eyes, a drawn bow held across.
      const bow = 0xffb52e;
      parts = [
        P(C(0.75, 2.3, 8), 0x1fa6b0, 0, 1.15, 0), // cycle 74: teal leans cyan, off the grass
        P(S(0.62), 0x2bbcc4, 0.1, 2.5, 0), P(X(0.22, 0.4, 1.06), 0x0f4a52, 0.6, 2.62, 0),
        P(Y(0.98, 0.98, 0.12, 10), 0x1d9faa, -0.32, 2.98, 0, [0, 0, -0.2]), P(Y(0.57, 0.6, 0.18, 8, true), bow, -0.34, 3.12, 0, [0, 0, -0.2]),
        P(C(0.55, 1.5, 8), 0x166f7a, -0.5, 3.72, 0, [0, 0, 0.25]),
        P(C(0.13, 0.95, 4), TEAM.enemy, -0.6, 3.55, 0.5, [0.5, 0, 0.4]),
        P(Y(0.5, 0.62, 0.28), snow ? FUR : 0x0f5a66, 0, 2.0, 0, undefined, snow ? [1.15, 1.2, 1.15] : undefined),
        P(X(0.2, 0.22, 1.0), bow, 0.85, 1.7, 0), ...pair(() => X(0.18, 0.2, 1.1), bow, 0.61, 1.7, 1.0, [0, -0.45, 0]),
        P(X(0.05, 0.05, 2.9), 0xfff1c2, 0.38, 1.7, 0),
        P(X(1.1, 0.07, 0.07), 0xfff1c2, 0.9, 1.72, 0), P(C(0.14, 0.36, 4), 0xdfe6f2, 1.6, 1.72, 0, [0, 0, -Math.PI / 2]),
        ...pair(() => X(0.7, 0.2, 0.2), 0x1fa6b0, 0.5, 1.75, 0.35),
        P(Y(0.22, 0.22, 1.0, 6), 0x7a4a24, -0.55, 1.9, 0.3, [0.3, 0, 0]), P(X(0.3, 0.3, 0.3), TEAM.enemy, -0.55, 2.45, 0.48),
        ...face(0.62, 2.66, 0.27, 0.21, 0xffe14d, 0x5a3200),
      ];
      if (snow) parts.push(P(Y(1.12, 1.12, 0.16, 10), FUR, -0.3, 2.9, 0, [0, 0, -0.2]));
    } else if (kind === 'shield') {
      // Shield-bearer (cycle 27): slate soldier with a crested helmet and a spear, behind a gold-rimmed tower shield
      // facing forward (+x). The shield stops below the eyes, so the face shows over its top edge.
      const face1 = 0x9fb0d6, helm = 0x2f3854, steel = 0x7c869c; // cycle 74: gunmetal, the silver read as sand
      parts = [
        P(Y(0.7, 0.85, 1.7), 0x4f5d7e, 0, 0.85, 0),
        P(S(0.62), face1, 0.05, 2.1, 0),
        P(C(0.68, 0.75, 8), helm, 0, 2.68, 0), P(Y(0.7, 0.7, 0.14, 8, true), PAL.gold, 0, 2.34, 0),
        P(X(0.8, 0.42, 0.14), TEAM.enemy, -0.12, 3.0, 0),
        P(X(0.22, 2.0, 1.9), steel, 0.95, 1.1, 0),
        ...pair(() => X(0.26, 2.1, 0.16), PAL.gold, 0.97, 1.1, 0.95),
        P(X(0.26, 0.16, 2.06), PAL.gold, 0.97, 2.1, 0), P(X(0.26, 0.16, 2.06), PAL.gold, 0.97, 0.1, 0),
        P(O(0.36), TEAM.enemy, 1.1, 1.2, 0),
        P(X(0.1, 3.6, 0.1), 0x7a4a24, 0.3, 1.8, -1.0), P(C(0.2, 0.55, 4), 0xdfe6f2, 0.3, 3.85, -1.0), P(X(0.04, 0.3, 0.5), TEAM.enemy, 0.3, 3.3, -0.72),
        P(I(0.24), face1, 0.3, 1.5, -0.95),
        ...pair(() => S(0.4, 6, 4), steel, 0, 1.75, 0.78),
        ...face(0.56, 2.18, 0.25, 0.2, 0xffffff, PAL.ink, helm),
      ];
      if (snow) parts.push(P(Y(0.6, 0.74, 0.28), FUR, 0, 1.72, 0), P(X(0.36, 0.16, 2.1), FUR, 0.97, 2.24, 0), P(Y(0.75, 0.75, 0.2, 8, true), FUR, 0, 2.36, 0));
    } else if (kind === 'shaman') {
      // Shaman (cycle 59): bell robe, horned bone mask with hollow green-lit eyes, and a staff taller than the body with a
      // glowing green orb (the heal colour), held to one side: an 'i' beside a bell, unlike the skirmisher's T. Cycle 68:
      // the robe was yellow-green and measured dE 8 against the #107 grass; magenta (hue ~304) stands off grass and path.
      const mask = 0xf3e6c8, hood = 0x7d2f86, wood = 0x7a4a24, glow = 0x7dff9a;
      parts = [
        P(C(1.0, 2.1, 10), 0xd65fcf, 0, 1.05, 0), P(Y(1.02, 1.05, 0.2, 10), hood, 0, 0.1, 0),
        P(S(0.6), mask, 0.1, 2.2, 0),
        P(C(0.72, 1.1, 8), hood, -0.1, 2.8, 0, [0, 0, 0.18]),
        ...pair(() => C(0.14, 0.62, 4), mask, 0.25, 2.75, 0.5, [0.7, 0, 0]),
        ...face(0.56, 2.26, 0.23, 0.2, 0x3a1440, 0x9dff5a),
        P(X(0.1, 0.14, 0.42), 0x3a1440, 0.66, 1.93, 0),
        P(O(0.15), glow, 0.52, 1.58, 0), ...pair(() => O(0.13), PAL.gold, 0.44, 1.62, 0.3),
        P(X(0.14, 3.6, 0.14), wood, 0.5, 1.8, 0.9), P(S(0.42, 6, 4), glow, 0.5, 3.8, 0.9), P(O(0.2), 0x3fd46a, 0.5, 4.38, 0.9),
        P(C(0.1, 0.55, 4), wood, 0.5, 3.75, 1.36), P(C(0.1, 0.55, 4), wood, 0.5, 3.75, 0.44),
        P(I(0.22), mask, 0.55, 1.7, 0.85), P(I(0.22), mask, 0.62, 1.45, -0.55),
        ...pair(() => C(0.16, 0.6, 4), glow, -0.1, 1.95, 0.55, [1.0, 0, 0]),
      ];
      if (snow) parts.push(P(Y(0.5, 0.72, 0.3), FUR, 0, 1.75, 0));
    } else if (kind === 'brute') {
      // Brute: wide and low, a horned iron helmet over a jutting jaw with tusks, spiked pauldrons and huge banded fists.
      const hide = 0xe8842a, skin = 0xf29a5c, dark = 0x5a2416, fist = 0x7a2c1c;
      parts = [
        P(X(1.5, 1.5, 2.0), hide, 0, 1.25, 0), P(S(0.85), skin, 0.42, 1.0, 0),
        P(X(1.58, 0.28, 2.08), dark, 0, 0.6, 0),
        P(X(0.95, 0.75, 1.0), skin, 0.32, 2.3, 0), P(X(0.8, 0.36, 1.08), 0x55607a, 0.16, 2.74, 0),
        ...pair(() => C(0.2, 0.7, 5), BONE, 0.16, 2.98, 0.62, [0.9, 0, 0]),
        P(X(0.4, 0.3, 0.9), 0xd9763a, 0.72, 2.02, 0), ...pair(() => C(0.1, 0.38, 4), BONE, 0.9, 2.22, 0.32),
        ...face(0.74, 2.44, 0.27, 0.21, 0xffffff, PAL.ink, dark),
        ...pair(() => S(0.55, 6, 4), IRON, 0, 2.05, 1.08), ...pair(() => C(0.16, 0.5, 4), BONE, 0, 2.62, 1.2, [0.4, 0, 0]),
        ...pair(() => X(0.5, 1.1, 0.5), hide, 0.3, 1.3, 1.38),
        ...pair(() => S(0.6, 6, 4), fist, 0.5, 0.62, 1.42), ...pair(() => X(0.5, 0.34, 1.0), IRON, 0.88, 0.62, 1.42),
        ...pair(() => X(0.7, 0.3, 0.6), dark, 0.2, 0.15, 0.5),
      ];
      if (snow) parts.push(P(X(0.9, 0.36, 2.4), FUR, -0.25, 2.1, 0), ...pair(() => X(0.76, 0.2, 0.66), FUR, 0.2, 0.38, 0.5));
    } else if (kind === 'wolf') {
      // Frost wolf (snow region): a quadruped, so its outline is long and low where every raider stands upright. Frost-blue
      // coat with a white ruff, muzzle and tail tip (pure white would vanish on snow), ice shards along the spine, and the
      // enemy cue twice: red eyes and a red collar.
      const coat = 0x6fa6ee, pale = 0xf2f8ff, navy = 0x35508f;
      parts = [
        P(S(0.7), coat, -0.05, 0.98, 0, undefined, [1.45, 0.9, 0.95]),
        P(S(0.62, 6, 4), pale, 0.62, 1.05, 0),
        P(S(0.62), coat, 1.15, 1.5, 0),
        P(X(0.62, 0.36, 0.44), pale, 1.7, 1.33, 0), P(O(0.14), PAL.ink, 2.02, 1.45, 0),
        ...pair(() => C(0.07, 0.24, 4), 0xffffff, 1.78, 1.07, 0.15, [Math.PI, 0, 0]),
        ...pair(() => C(0.24, 0.6, 4), navy, 1.0, 2.12, 0.34, [0.25, 0, 0]),
        ...face(1.56, 1.68, 0.28, 0.19, 0xff4d6a, 0x5a0010, navy),
        P(C(0.3, 1.0, 6), coat, -1.2, 1.4, 0, [0, 0, 0.9]), P(I(0.18), pale, -1.56, 1.7, 0),
        ...pair(() => X(0.26, 0.75, 0.26), navy, 0.55, 0.37, 0.38), ...pair(() => X(0.26, 0.75, 0.26), navy, -0.7, 0.37, 0.38),
        P(Y(0.52, 0.52, 0.18), TEAM.enemy, 0.9, 1.3, 0, [0, 0, -0.9]),
        ...[0.25, -0.3, -0.8].map((x, i) => P(O(0.26 - i * 0.03), 0xcdf1ff, x, 1.66 - i * 0.04, 0, [0, 0, 0.3], [0.6, 1.5, 0.6])),
      ];
    } else {
      parts = this.bossParts(BOSS_LOOK[look], look, r);
    }
    const body = bake(parts);
    kit = { body, hull: hullGeometry(body) };
    this.enemyKits.set(key, kit);
    return kit;
  }

  /** The boss: big and tall, arms raised overhead (a 'Y' that never reads like the low, wide brute), cape, red eyes.
   * The unnamed boss wears a gold spiked crown; the elder tree king (stage 5) grows branch antlers, a bark crown, a moss
   * beard and roots; the frost lord (stage 10) an ice-spike crown, shoulder crystals, an icicle beard and a fur mantle. */
  private bossParts(c: BossLook, look: BossName, r: number): Part[] {
    type V3 = [number, number, number];
    const P = (geo: BufferGeometry, color: number, x: number, y: number, z: number, rot?: V3, scale?: V3): Part => ({ geo, color, at: [x * r, y * r, z * r], rot, scale });
    const both = (make: () => BufferGeometry, color: number, x: number, y: number, z: number, rot: V3 = [0, 0, 0], scale?: V3): Part[] =>
      [P(make(), color, x, y, z, rot, scale), P(make(), color, x, y, -z, [-rot[0], -rot[1], rot[2]], scale)];
    const cone = (rad: number, h: number, seg = 6) => new ConeGeometry(rad * r, h * r, seg), box = (x: number, y: number, z: number) => new BoxGeometry(x * r, y * r, z * r);
    const ico = (rad: number) => new IcosahedronGeometry(rad * r, 0), oct = (rad: number) => new OctahedronGeometry(rad * r);
    const out: Part[] = [
      P(box(0.25, 2.6, 2.4), c.cape, -0.75, 1.5, 0),
      P(new CylinderGeometry(r * 0.75, r * 0.95, r * 1.9, 14), c.trunk, 0, 1.05, 0),
      P(new SphereGeometry(r * 0.85, 14, 12), c.chest, 0, 2.0, 0),
      P(new SphereGeometry(r * 0.6, 12, 10), c.head, 0.2, 3.0, 0),
      ...both(() => box(0.38, 1.3, 0.38), c.arm, 0.3, 2.85, 0.95, [0.45, 0, 0]),
      ...both(() => new SphereGeometry(r * 0.46, 12, 10), c.fist, 0.3, 3.55, 1.25),
      ...both(() => new CylinderGeometry(r * 0.27, r * 0.27, r * 0.2, 8), c.crown, 0.3, 3.2, 1.1, [0.45, 0, 0]),
      // Face: large red eyes under a heavy angry brow, and a jaw with two fangs.
      ...both(() => ico(0.17), 0xff4d6a, 0.64, 3.08, 0.25), ...both(() => ico(0.09), 0x5a0010, 0.76, 3.07, 0.24),
      ...both(() => box(0.12, 0.1, 0.42), c.chest, 0.72, 3.27, 0.26, [-0.42, 0, 0]),
      P(box(0.3, 0.2, 0.62), c.chest, 0.66, 2.72, 0), ...both(() => cone(0.07, 0.24, 4), 0xfff0d2, 0.8, 2.88, 0.2),
      P(new CylinderGeometry(r * 0.9, r * 0.93, r * 0.22, 12, 1, true), c.head, 0, 0.9, 0), P(ico(0.24), c.crown, 0.92, 0.9, 0),
    ];
    const ring = (n: number, f: (a: number, i: number) => Part) => { for (let i = 0; i < n; i++) out.push(f((i / n) * Math.PI * 2, i)); };
    if (look === 'forest') {
      const bark = c.trunk, leaf = c.fist, amber = c.crown;
      // Bark crown of uneven splinters, and two branching antlers with leaf tufts at the tips.
      ring(6, (a, i) => P(cone(0.16, 0.5 + (i % 2) * 0.3, 5), bark, 0.2 + Math.cos(a) * 0.42, 3.62 + (i % 2) * 0.12, Math.sin(a) * 0.42));
      out.push(
        ...both(() => box(0.17, 1.2, 0.17), bark, 0.15, 4.0, 0.62, [0.75, 0, 0]),
        ...both(() => box(0.13, 0.7, 0.13), bark, 0.15, 4.35, 0.5, [-0.2, 0, 0]),
        ...both(() => box(0.12, 0.6, 0.12), bark, 0.3, 4.1, 0.95, [0.3, 0, -0.5]),
        ...both(() => ico(0.24), amber, 0.15, 4.5, 1.08), ...both(() => ico(0.2), leaf, 0.15, 4.75, 0.42), ...both(() => ico(0.18), amber, 0.48, 4.4, 1.02),
        // Leafy shoulders, a moss beard, a knot hole, and roots spreading from the foot of the trunk.
        ...both(() => ico(0.46), c.arm, 0, 2.5, 0.92), ...both(() => ico(0.34), leaf, 0.25, 2.72, 0.7), ...both(() => ico(0.3), amber, -0.25, 2.8, 1.05),
        P(cone(0.36, 0.8, 6), c.arm, 0.72, 2.3, 0, [Math.PI, 0, 0]),
        P(ico(0.2), c.head, 0.82, 1.35, 0.2, undefined, [0.5, 1.3, 1]),
      );
      ring(6, a => P(cone(0.34, 0.75, 5), bark, Math.cos(a + 0.5) * 0.98, 0.37, Math.sin(a + 0.5) * 0.98));
    } else if (look === 'snow') {
      const ice = c.chest, white = c.crown;
      // Tall ice-spike crown around one great crystal.
      out.push(P(new CylinderGeometry(r * 0.52, r * 0.46, r * 0.24, 10), white, 0.2, 3.55, 0), P(oct(0.3), ice, 0.2, 4.35, 0, undefined, [0.65, 2.4, 0.65]));
      ring(7, (a, i) => P(cone(0.13, 0.7 + (i % 2) * 0.45, 4), white, 0.2 + Math.cos(a) * 0.44, 3.95 + (i % 2) * 0.2, Math.sin(a) * 0.44, [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25]));
      out.push(
        // Fur mantle, crystal clusters on both shoulders, an icicle beard and ice-spiked knuckles.
        P(new CylinderGeometry(r * 0.8, r * 0.98, r * 0.42, 10), 0xfff1dc, 0, 2.52, 0),
        ...both(() => oct(0.34), ice, 0, 2.95, 1.0, [0.5, 0, 0], [0.6, 2.0, 0.6]),
        ...both(() => oct(0.26), white, 0.3, 2.8, 0.78, [0.15, 0, -0.3], [0.6, 1.8, 0.6]),
        ...both(() => oct(0.24), white, -0.3, 2.85, 1.15, [0.9, 0, 0.3], [0.6, 1.8, 0.6]),
        P(cone(0.13, 0.7, 4), white, 0.74, 2.3, 0, [Math.PI, 0, 0]), ...both(() => cone(0.1, 0.5, 4), white, 0.7, 2.4, 0.2, [Math.PI, 0, 0]),
        ...both(() => cone(0.13, 0.5, 4), ice, 0.3, 4.1, 1.35, [0.3, 0, 0]), ...both(() => cone(0.11, 0.4, 4), ice, 0.6, 3.85, 1.4, [0.3, 0, -0.7]),
      );
    } else {
      out.push(P(new CylinderGeometry(r * 0.52, r * 0.46, r * 0.28, 10), c.crown, 0.2, 3.55, 0));
      ring(5, a => P(cone(0.12, 0.55, 6), c.crown, 0.2 + Math.cos(a) * 0.42, 3.9, Math.sin(a) * 0.42));
      // Gold pauldrons with a spike each.
      out.push(...both(() => new SphereGeometry(r * 0.42, 8, 6), c.crown, 0, 2.5, 0.9), ...both(() => cone(0.14, 0.5, 5), c.fist, 0, 2.95, 1.05, [0.5, 0, 0]));
    }
    return out;
  }

  private buildBatches() {
    const per = <T,>(f: (k: EnemyKind) => T) => Object.fromEntries(ENEMY_KINDS.map(k => [k, f(k)])) as Record<EnemyKind, T>;
    const cap = 160;
    this.batches = {
      body: per(k => new Batch(this.scene, this.enemyKit(k).body, this.mats.enemy, k === 'boss' ? 4 : cap)),
      hull: per(k => new Batch(this.scene, this.enemyKit(k).hull, outlineMaterial(k === 'boss' ? 0.08 : 0.05), k === 'boss' ? 4 : cap)),
      flash: per(k => new Batch(this.scene, this.enemyKit(k).body, this.mats.flash, k === 'boss' ? 4 : cap)),
      // Frost shell (cycle 16): the same body, a little larger, pale ice blue and see-through. Drawn only while slowed.
      ice: per(k => new Batch(this.scene, this.enemyKit(k).body, ICE, k === 'boss' ? 4 : cap, { order: 4 })),
      ward: per(k => new Batch(this.scene, this.enemyKit(k).body, WARD, k === 'boss' ? 4 : cap, { order: 4 })),
      shadow: new Batch(this.scene, this.geo.blob, this.mats.blob, cap),
      ring: new Batch(this.scene, this.geo.ring, this.mats.enemyRing, cap),
      frostRing: new Batch(this.scene, this.geo.ring, this.mats.frostRing, cap),
      // Ward floor ring (cycle 92): a cue that does not depend on body colour (the purple boss and the magenta shaman
      // change little under the shell); a little wider than the frost ring so both read when they stack.
      wardRing: new Batch(this.scene, this.geo.ring, basic(0xe070e0, 0.9), cap),
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
    return t.m.compose(t.p.set(x, y + this.groundHeight(x,z), z), t.q.setFromEuler(t.e), t.s.set(sx, sy, sz));
  }

  private drawEnemies(s: RushState, reduced: boolean) {
    const B = this.batches, t = this.tmp;
    this.camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(t.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    const all = [...Object.values(B.body), ...Object.values(B.hull), ...Object.values(B.flash), ...Object.values(B.ice), ...Object.values(B.ward), B.shadow, B.ring, B.frostRing, B.wardRing, B.streak, B.barBg, B.barFill];
    const swift = s.diff.twist === 'swift';
    all.forEach(b => b.begin());
    for (const e of s.enemies) {
      const r = ENEMIES[e.kind].radius * ENEMY_SCALE[e.kind];
      if (!this.onScreen(e.x, r * 2, e.z, r * 4 + 1)) continue;
      const wolf = e.kind === 'wolf', step = this.time * (wolf ? 16 : 10) + e.id;
      const bob = Math.abs(Math.sin(step) * (wolf ? 0.1 : 0.06));
      // Slam wind-up crouches (wide and low); the rally roar (cycle 34) is the opposite: it swells up and trembles.
      let sx = e.windup ? 1.1 : 1, sy = e.windup ? 0.88 : 1, jx = 0;
      const roar = e.roarT ?? 0, call = ENEMIES[e.kind].summon;
      if (roar > 0 && call) {
        const k = 1 - roar / call.roar;
        sx = 1 + 0.12 * k; sy = 1 + 0.18 * k;
        jx = 0.07 * Math.sin(this.time * 70 + e.id);
      }
      // Walk: raiders waddle from foot to foot, the wolf gallops (nose up and down). A melee strike is a short forward
      // jab right after the cooldown restarts. Frost wolf lunge: it crouches low and blinks white (the tell), then
      // stretches out long while it flies.
      let lean = 0, roll = 0, sl = 1, blink = false;
      if (!reduced && !this.fxPaused) { if (wolf) lean = Math.sin(step) * 0.12; else if (e.kind !== 'boss') roll = Math.sin(step) * 0.09; }
      const def = ENEMIES[e.kind], struck = def.cooldown - e.cd;
      if (!def.shotSpeed && !e.windup && struck >= 0 && struck < 0.16) lean -= 0.32 * Math.sin((struck / 0.16) * Math.PI);
      if ((e.lungeT ?? 0) > 0) { sy = 0.72; sl = 1.12; lean = -0.12; roll = 0; blink = Math.floor(this.time * 14) % 2 === 0; }
      else if ((e.dashT ?? 0) > 0) { sl = 1.3; sy = 0.86; lean = 0.1; }
      const m = this.place(e.x + jx, bob, e.z, roll, yaw(e.facing), lean, sx * sl, sy, sx, 'YXZ');
      (e.flash > 0 || blink ? B.flash : B.body)[e.kind].push(m);
      B.hull[e.kind].push(m);
      // Frost shell; blinks in its last quarter second so the player sees the slow wearing off.
      const ice = e.slowT ?? 0;
      // The frost wolf wears neither shell: an ice-blue shell on an ice-blue wolf shows nothing, and the floor rings
      // already carry both states for every kind. That keeps a wolf pack at two draw calls (body and outline).
      if (!wolf && ice > 0 && (ice > 0.25 || Math.floor(this.time * 16) % 2 === 0)) B.ice[e.kind].push(this.place(e.x, bob - 0.02, e.z, roll, yaw(e.facing), lean, sx * sl * 1.08, sy * 1.06, sx * 1.08, 'YXZ'));
      // Ward shell (cycle 90): magenta while warded, blinking in its last quarter second like the frost shell.
      const ward = e.wardT ?? 0;
      if (!wolf && ward > 0 && (ward > 0.25 || Math.floor(this.time * 16) % 2 === 0)) B.ward[e.kind].push(this.place(e.x, bob - 0.02, e.z, roll, yaw(e.facing), lean, sx * sl * 1.16, sy * 1.12, sx * 1.16, 'YXZ'));
      if (this.sheetMode) continue;
      B.shadow.push(this.place(e.x, 0.02, e.z, -Math.PI / 2 - (!this.sheetMode&&e.z>1&&e.z<5?Math.atan(.3):0), 0, 0, r * 1.15));
      B.ring.push(this.place(e.x, 0.03, e.z, -Math.PI / 2 - (!this.sheetMode&&e.z>1&&e.z<5?Math.atan(.3):0), 0, 0, r * 1.08));
      if ((e.slowT ?? 0) > 0) B.frostRing.push(this.place(e.x, 0.05, e.z, -Math.PI / 2 - (!this.sheetMode&&e.z>1&&e.z<5?Math.atan(.3):0), 0, 0, r * 1.38)); // frost slow
      if (ward > 0 && (ward > 0.25 || Math.floor(this.time * 16) % 2 === 0)) B.wardRing.push(this.place(e.x, 0.055, e.z, -Math.PI / 2 - (!this.sheetMode&&e.z>1&&e.z<5?Math.atan(.3):0), 0, 0, r * 1.58)); // ward
      if (swift && !reduced && e.kind !== 'boss' && !e.windup) B.streak.push(this.place(e.x, bob, e.z, 0, yaw(e.facing), 0, Math.max(0.6, r))); // swift lap: readable even on small enemies
    }
    // Towers frozen by the frost lord's howl stand in a frost ring (the same cue as a slowed enemy), blinking as it ends.
    s.towers.forEach((tw, i) => {
      const f = tw?.frozen ?? 0;
      if (f > 0 && (f > 0.6 || Math.floor(this.time * 12) % 2 === 0)) B.frostRing.push(this.place(PADS[i].x, 0.06, PADS[i].z, -Math.PI / 2, 0, 0, 1.55));
    });
    all.forEach(b => b.end());
    this.counts.enemies = s.enemies.length;
  }

  /** Straight shots interpolate launch/arrival elevation; lobbed shots add their authored arc.
   * Damage and cover tests deliberately remain the prototype's deterministic x/z rules. */
  private shotHeight(s: RushState, shot: Shot): number {
    if(this.sheetMode)return 0;
    if(shot.owner==='tower') {
      let start=this.shotOrigins.get(shot.id);
      if(!start){start={x:shot.x,z:shot.z};this.shotOrigins.set(shot.id,start);}
      const traveled=Math.hypot(shot.x-start.x,shot.z-start.z),remaining=Math.hypot(shot.tx-shot.x,shot.tz-shot.z);
      const p=traveled/Math.max(.001,traveled+remaining);
      return (heightAt(start.x,start.z)+1.6)*(1-p)+(heightAt(shot.tx,shot.tz)+.7)*p;
    }
    const hd=heroDef(s),lob=shot.owner==='lob'||shot.owner==='super';
    const total=shot.owner==='lob'?(hd.lobTravel??.5):shot.owner==='super'?hd.superTravel:
      shot.owner==='hero'?hd.range/hd.boltSpeed:(ENEMIES.skirmisher.reach+2)/(ENEMIES.skirmisher.shotSpeed??9);
    const elapsed=Math.max(0,total-shot.life),p=Math.min(1,elapsed/total);
    const sx=shot.x-shot.vx*elapsed,sz=shot.z-shot.vz*elapsed;
    const tx=lob?shot.tx:sx+shot.vx*total,tz=lob?shot.tz:sz+shot.vz*total;
    return heightAt(sx,sz)*(1-p)+heightAt(tx,tz)*p+(lob?0:.85);
  }

  private drawShotsAndCoins(s: RushState) {
    const B = this.batches;
    if(this.shotBattle!==s){this.shotBattle=s;this.shotOrigins.clear();}
    const live=new Set(s.shots.map(shot=>shot.id));for(const id of this.shotOrigins.keys())if(!live.has(id))this.shotOrigins.delete(id);
    [...Object.values(B.shots), ...Object.values(B.branchShots)].forEach(b => b.begin());
    for (const shot of s.shots) {
      if (!this.onScreen(shot.x, 1, shot.z, 3)) continue;
      const elevation=this.shotHeight(s,shot)-this.groundHeight(shot.x,shot.z);
      if (shot.owner === 'super') {
        // Lobbed: a parabola that lands on the target point.
        const p = 1 - Math.max(0, shot.life) / HEROES[s.hero.kind].superTravel;
        B.shots.super.push(this.place(shot.x, elevation + 0.6 + Math.sin(p * Math.PI) * 2.6, shot.z, 0, 0, 0, 1.8));
      } else if (shot.owner === 'lob') {
        // Snowball (cycle 39): a lower arc than the super.
        const p = 1 - Math.max(0, shot.life) / (HEROES[s.hero.kind].lobTravel ?? 0.5);
        B.shots.lob.push(this.place(shot.x, elevation + 0.7 + Math.sin(p * Math.PI) * 1.8, shot.z, 0, 0, 0, 1.15));
      } else if (shot.owner === 'enemy') B.shots.enemy.push(this.place(shot.x, elevation, shot.z, 0, 0, 0, 1));
      // Capsules point along +y; lay them flat along the velocity.
      else (shot.branch ? B.branchShots[shot.branch] : B.shots[shot.owner]).push(this.place(shot.x, elevation, shot.z, -Math.PI / 2, Math.atan2(-shot.vx, -shot.vz), 0, 1, 1, 1, 'YXZ'));
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

  /** Tower per level and branch (defenceModels.ts), baked: a static base and a rotating crossbow head. Lv1 wood, Lv2 stone
   * with the branch crown (fire braziers, frost crystals), Lv3 a tall stone tower with banners and a roofed turret. On
   * snow, wood and stone cool down and upward faces carry snow, like the walls (one kit per region). */
  private towerKit(level: number, branch?: TowerBranch) {
    const key = `${level}${branch ?? ''}:${this.region}`;
    let kit = this.towerKits.get(key);
    if (kit) return kit;
    const t = towerParts(level, branch), base = this.regionBake(t.base), head = this.regionBake(t.head, false);
    kit = { base, baseHull: hullGeometry(base), head, headHull: hullGeometry(head), headY: t.headY, height: t.height };
    this.towerKits.set(key, kit);
    return kit;
  }
  /** Bake defence parts for the current region: as authored in the forest; on snow, building materials cool down and
   * (with `cap`) their upward faces carry snow. Coals, flames, ice, gold and team cloth never do. */
  private regionBake(parts: Part[], cap = true): BufferGeometry {
    if (this.region !== 'snow') return bake(parts);
    const geo = bake(parts.map(coolPart));
    if (!cap) return geo;
    const mask = bakeColors(parts.map(p => ({ ...p, color: COOLED.has(p.color) ? 0xffffff : 0 })));
    const n = geo.getAttribute('normal'), c = geo.getAttribute('color') as BufferAttribute, snow = new Color(REGION_LOOK.snow.cap ?? 0xffffff), k = 0.7;
    for (let i = 0; i < c.count; i++) if (mask[i * 3] > 0.5 && n.getY(i) > 0.75)
      c.setXYZ(i, c.getX(i) + (snow.r - c.getX(i)) * k, c.getY(i) + (snow.g - c.getY(i)) * k, c.getZ(i) + (snow.b - c.getZ(i)) * k);
    return geo;
  }
  /** `mirror`: the base is flipped east-west (the Lv3 turret then stands on the middle-lane side of a west pad). */
  private makeTower(level: number, branch?: TowerBranch, mirror = false): Group {
    const kit = this.towerKit(level, branch), g = new Group(), head = new Group(), body = new Group(), shell = new Group();
    body.name = 'body';
    shell.add(new Mesh(kit.base, this.mats.baked), new Mesh(kit.baseHull, outlineMaterial(0.05)));
    if (mirror) shell.scale.x = -1; // three.js flips the face winding for a mirrored matrix, so the ink hull still works
    body.add(shell);
    head.name = 'head'; head.position.y = kit.headY;
    const bow = new Group(); bow.name = 'bow';
    bow.add(new Mesh(kit.head, this.mats.baked), new Mesh(kit.headHull, outlineMaterial(0.04)));
    head.add(bow);
    body.add(head);
    g.add(body);
    g.userData.height = kit.height;
    return g;
  }
  private barricadeKit(level: number, state: BarricadeState) {
    const key = `${level}:${state}:${this.region}`;
    let kit = this.barricadeKits.get(key);
    if (!kit) { const body = this.regionBake(barricadeParts(level, state)); kit = { body, hull: hullGeometry(body) }; this.barricadeKits.set(key, kit); }
    return kit;
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
    // Several wards broken at once (cycle 91): one magenta ink ring around the whole cleared pack.
    const wards = wardBreakBurst(events);
    if (wards && wards.count >= 2) this.ring(wards.x, wards.z, 0xe070e0, wards.radius + 1.2, 0.35, 0.95, true);
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
          fx.emit({ kind: 'shard', n: boss ? 26 : 8, color: boss ? this.bossKill : KILL_COLOR[ev.kind], at: [ev.x, 0.8, ev.z], speed: boss ? 8 : 5.5, up: boss ? 8 : 5, size: boss ? 0.22 : 0.13, life: boss ? 0.9 : 0.55 });
          fx.emit({ kind: 'puff', n: boss ? 8 : 3, color: 0xefe6d2, at: [ev.x, 0.6, ev.z], speed: boss ? 2.6 : 1.6, up: 1.2, size: boss ? 0.4 : 0.2, life: boss ? 0.6 : 0.38 });
          if (boss) { this.ring(ev.x, ev.z, PAL.gold, 4.2, 0.6, 0.95, true); if (!reducedMotion) this.shake = Math.max(this.shake, 0.7); }
          break;
        }
        case 'snow': // snowball landing (cycle 39): a pale ring and a puff of snow
          this.ring(ev.x, ev.z, this.look.frostFx, ev.radius, 0.3, 0.85);
          fx.emit({ kind: 'puff', n: 6, color: 0xf4fbff, at: [ev.x, 0.4, ev.z], speed: 3, up: 1.5, size: 0.22, life: 0.4 });
          break;
        case 'splash': // fire tower
          this.ring(ev.x, ev.z, BRANCH_COLOR.fire, ev.radius, 0.3, 0.85);
          fx.emit({ kind: 'shard', n: 5, color: 0xffb02e, at: [ev.x, 0.7, ev.z], speed: 4.5, up: 4, size: 0.11, life: 0.4 });
          break;
        case 'block': // shield-bearer turned a bolt aside
          fx.emit({ kind: 'spark', n: 4, color: 0xe8eefc, at: [ev.x, 1.0, ev.z], speed: 4, up: 2, size: 0.16, life: 0.2 });
          break;
        case 'ward': // shaman ward pulse (cycle 90): a magenta ink ring over the warded circle
          this.ring(ev.x, ev.z, 0xe070e0, ev.radius, 0.45, 0.85, true);
          break;
        case 'wardBreak': // a hero hit pops a ward: magenta shards
          fx.emit({ kind: 'shard', n: 6, color: 0xf08cf0, at: [ev.x, 0.9, ev.z], speed: 4.5, up: 3.5, size: 0.12, life: 0.4 });
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
          const c = this.kit?.crates.get(ev.id);
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
        // Shaman heal (cycle 59): a green ring out to the heal radius, so the cause of the refilled bars is visible.
        // Cycle 60: at 0.55 opacity the ink band won and it read as a grey smudge; 0.9 and a little longer reads green.
        // Frost wolf lunge: a thin red ring under the crouching wolf while it winds up, then a snow puff as it springs.
        case 'lunge': this.ring(ev.x, ev.z, TEAM.enemy, 0.9, ev.time, 0.9, true); break;
        case 'pounce': fx.emit({ kind: 'puff', n: 3, color: 0xeef5fa, at: [ev.x, 0.2, ev.z], speed: 1.8, up: 0.6, size: 0.18, life: 0.3 }); break;
        case 'heal': this.ring(ev.x, ev.z, 0x5ee87a, ev.radius, 0.7, 0.9, true); break;
        case 'superReady': this.ring(this.hero.position.x, this.hero.position.z, PAL.super, 2.4, 0.5, 0.95, true); break;
        case 'lap': // endless lap (cycle 47): a wide red ink ring around the town and a shake
          this.ring(TOWN.x, TOWN.z, 0xff4d5e, 7, 0.7, 0.95, true);
          if (!reducedMotion) this.shake = Math.max(this.shake, 0.5);
          break;
        case 'summon':
          this.ring(ev.x, ev.z, 0xffb02e, 3, 0.4, 0.95, true);
          fx.emit({ kind: 'puff', n: 12, color: 0xe8c99a, at: [ev.x, 0.4, ev.z], speed: 4, up: 1, size: 0.3, life: 0.5 });
          if (!reducedMotion) this.shake = Math.max(this.shake, 0.35);
          break;
        case 'howl': { // the frost lord's howl: a wide ice ring from the boss, and ice bursts on every tower
          this.ring(ev.x, ev.z, 0x9fe6ff, 16, 0.9, 0.95, true);
          this.towers.forEach((tw, i) => { if (tw) fx.emit({ kind: 'puff', n: 8, color: 0xd8f6ff, at: [PADS[i].x, 1.4, PADS[i].z], speed: 2.4, up: 1.2, size: 0.28, life: 0.6 }); });
          if (!reducedMotion) this.shake = Math.max(this.shake, 0.6);
          break;
        }
        case 'slam':
          this.ring(ev.x, ev.z, 0xff5d73, ev.radius, 0.35, 0.95, true);
          fx.emit({ kind: 'puff', n: 10, color: 0xe8c99a, at: [ev.x, 0.3, ev.z], speed: 3.5, up: 0.8, size: 0.28, life: 0.45 });
          if (!reducedMotion) this.shake = Math.max(this.shake, 0.6);
          break;
        case 'townHit': if (!reducedMotion) this.shake = Math.max(this.shake, 0.12); break;
        // Wave held (cycle 79): a gold ink ring around the town and sparks rising from it; no text (#107 hid the toasts).
        case 'waveClear': {
          this.ring(TOWN.x, TOWN.z, PAL.gold, 4.5, 0.9, 0.9, true);
          // Sparks rise from eight points on the ring, not over the castle roof where they hid behind it.
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2, x = TOWN.x + Math.cos(a) * 3.4, z = TOWN.z + Math.sin(a) * 3.4;
            fx.emit({ kind: 'spark', n: reducedMotion ? 1 : 3, color: PAL.gold, at: [x, this.groundHeight(x, z) + 0.4, z], speed: 1.2, up: 5, size: 0.22, life: 0.9 });
          }
          break;
        }
        // Boss arrival (cycle 67): a wide red ink ring where it walks in and one big shake; no text since #107 hid the toasts.
        case 'bossEnter': this.ring(ev.x, ev.z, TEAM.enemy, 5, 1.1, 0.95, true); if (!reducedMotion) this.shake = Math.max(this.shake, 0.55); break;
        case 'heroDown':
          this.ring(hp.x, hp.z, 0xff5d73, 1.6, 0.5, 0.9, true);
          fx.emit({ kind: 'shard', n: 10, color: 0x7fd36b, at: [hp.x, 1.0, hp.z], speed: 4, up: 5, size: 0.14, life: 0.6 });
          break;
        case 'coin':
          fx.emit({ kind: 'spark', n: 3, color: PAL.gold, at: [hp.x, 1.6, hp.z], speed: 1.5, up: 3, size: 0.14, life: 0.35 });
          break;
        case 'build': {
          // Build or level up: a gold ink ring, dust, and chips in the new branch colour (the tower itself pops, see syncDefences).
          const p = PADS[ev.pad], c = ev.branch ? BRANCH_TRIM[ev.branch] : PAL.gold;
          this.ring(p.x, p.z, 0xffd166, 1.8 + ev.level * 0.3, 0.45, 0.9, ev.level > 0);
          fx.emit({ kind: 'puff', n: 8, color: 0xf0d9a8, at: [p.x, 0.3, p.z], speed: 2.5, up: 0.8, size: 0.26, life: 0.45 });
          fx.emit({ kind: 'shard', n: 6 + ev.level * 3, color: c, at: [p.x, 1.4 + ev.level * 0.4, p.z], speed: 3.5, up: 5, size: 0.12, life: 0.55 });
          break;
        }
        case 'barricade': {
          const p = BARRICADES[ev.slot], v = this.barricadeViews[ev.slot];
          if (v) v.pop = ev.repair ? POP_TIME * 0.6 : POP_TIME;
          this.ring(p.x, p.z, ev.repair ? 0x7fe08a : 0xffd166, 2.0, 0.45, 0.9, !ev.repair);
          fx.emit({ kind: 'puff', n: 6, color: 0xf0d9a8, at: [p.x, 0.3, p.z], speed: 2.5, up: 0.8, size: 0.24, life: 0.45 });
          fx.emit({ kind: ev.repair ? 'spark' : 'shard', n: 6, color: ev.repair ? 0x9df0a8 : ev.level ? DEF.steel : DEF.plank, at: [p.x, 0.9, p.z], speed: 3, up: 4, size: 0.12, life: 0.5 });
          break;
        }
        case 'barricadeHit': {
          const v = this.barricadeViews[ev.slot];
          if (v) v.wobble = 0.16;
          fx.emit({ kind: 'shard', n: 2, color: DEF.plank, at: [ev.x, 0.7, ev.z], speed: 2.5, up: 2.5, size: 0.08, life: 0.3 });
          if (ev.spiked) fx.emit({ kind: 'spark', n: 2, color: 0xffffff, at: [ev.x, 0.6, ev.z], speed: 3, up: 1, size: 0.13, life: 0.16 });
          break;
        }
        case 'loot': // gold taken at a barricade: coins hop up from where it fell
          fx.emit({ kind: 'spark', n: reducedMotion ? 2 : 4, color: PAL.gold, at: [ev.x, 0.8, ev.z], speed: 1.5, up: 4, size: 0.16, life: 0.5 });
          break;
        case 'barricadeBreak': // splinters, dust and a brown ink ring; a little shake
          this.ring(ev.x, ev.z, DEF.plank, 2.2, 0.4, 0.9, true);
          fx.emit({ kind: 'shard', n: 14, color: DEF.wood, at: [ev.x, 0.6, ev.z], speed: 5, up: 5, size: 0.14, life: 0.6 });
          fx.emit({ kind: 'puff', n: 5, color: 0xe8c99a, at: [ev.x, 0.4, ev.z], speed: 2, up: 1, size: 0.3, life: 0.5 });
          if (!reducedMotion) this.shake = Math.max(this.shake, 0.3);
          break;
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
  sync(s: RushState, dt: number, aim: AimPreview, held = false, reduced = false) {
    const worldDt = held ? 0 : dt;
    this.time += worldDt;
    const stage = s.diff.stage ?? 1;
    if (stage !== this.styledStage || s.map !== this.styledMap) this.restyle(stage, s.map);
    this.syncSnow(dt, reduced);
    const h = s.hero, alive = h.downT <= 0, def = heroDef(s);
    this.syncRespawn(h.downT, def.respawn);
    this.showHero(h.kind);
    this.syncFan(def);
    // Popo's snowball (cycle 48): in the paw only with a round loaded and not right after a throw; an empty paw = reloading.
    const paw = this.heroRig?.held;
    if (paw) paw.visible = h.ammo >= 1 && h.fireCd <= 0;
    // Hero
    this.hero.visible = alive;
    this.hero.position.set(h.x, this.groundHeight(h.x,h.z), h.z);
    this.heroFootprints.forEach((m,i)=>this.conformDecal(m,.02+i*.01));
    const ring = this.superRing;
    if (ring) {
      ring.visible = alive && superReady(s);
      if (ring.visible) {
        // Breathes on the super button's 0.9 s beat; steady under reduced motion.
        const beat = reduced ? 0 : Math.sin(this.time * Math.PI * 2 / 0.9);
        ring.scale.setScalar(0.95 * (1 + 0.07 * beat));
        (ring.material as MeshBasicMaterial).opacity = 0.82 + 0.13 * beat;
        this.conformDecal(ring, .04);
      }
    }
    this.heroBody.rotation.y = yaw(h.facing);
    this.heroRig?.motion.sync(s, h.x, h.z, worldDt, reduced, alive);
    this.setBar(this.heroBar, h.hp / heroMaxHp(s));
    this.ammoSegs.forEach((seg, i) => {
      const full = h.ammo > i, partial = h.ammo === i ? h.reloadT / def.reload : 0;
      seg.material = full ? this.mats.ammo : this.mats.ammoDim;
      seg.scale.x = full ? 1 : Math.max(0.05, partial);
      seg.position.x = (i - 1) * 0.44 - (full ? 0 : (1 - seg.scale.x) * 0.2);
      seg.quaternion.copy(this.camera.quaternion);
    });
    this.drawEnemies(s, reduced);
    this.drawShotsAndCoins(s);
    // Cover: bushes turn see-through while the hero hides in one; broken crates disappear.
    const hiding = alive && heroHidden(s);
    const kit = this.kit!;
    s.map.bushes.forEach((b, i) => {
      const mesh = kit.bushes[i], mat = mesh.material as Material & { opacity: number };
      const inside = hiding && Math.abs(h.x - b.x) <= b.w / 2 && Math.abs(h.z - b.z) <= b.d / 2;
      mat.opacity = inside ? 0.4 : 1;
      mat.depthWrite = !inside;
      mesh.children[0].visible = !inside;
    });
    const standing = new Set(s.crates.map(c => c.id));
    for (const [id, c] of kit.crates) {
      c.mesh.visible = standing.has(id);
      c.wobble = Math.max(0, c.wobble - worldDt);
      const k = Math.sin(c.wobble * 60) * c.wobble * 0.5;
      c.mesh.rotation.set(k * 0.4, 0, k);
    }
    this.syncDefences(s, worldDt, alive, reduced);
    this.setBar(this.townBar, s.town.hp / s.town.maxHp);
    this.syncDamage(s, reduced);
    this.updateAim(s, aim);
    this.updateFx(this.fxPaused ? 0 : dt);
    this.particles.update(this.fxPaused ? 0 : dt);
    this.updateCamera(s, dt);
    this.camera.updateMatrixWorld();
    this.townHeroTarget.set(h.x, this.groundHeight(h.x,h.z)+1, h.z);
    this.townView?.update(this.camera, alive && !this.sheetMode ? this.townHeroTarget : undefined,
      this.renderer.domElement.width, this.renderer.domElement.height);
  }

  /** Towers, barricades, build rings and upgrade chevrons (defence lane). */
  private syncDefences(s: RushState, dt: number, alive: boolean, reduced: boolean) {
    const fx = this.particles;
    s.towers.forEach((t, i) => {
      const look = t ? `${t.level}${t.branch ?? ''}` : '', key = `${look}:${this.region}`, f = this.towerFx[i], pad = PADS[i];
      if (key !== this.towerLevels[i]) {
        // A new level or branch pops up (squash and stretch); a region change alone just swaps the kit.
        if (look && look !== this.towerLevels[i].split(':')[0]) f.pop = POP_TIME;
        if (this.towers[i]) this.scene.remove(this.towers[i]!);
        this.towers[i] = t ? this.makeTower(t.level, t.branch, pad.x < 0) : null;
        if (this.towers[i]) { this.towers[i]!.position.set(pad.x, this.groundHeight(pad.x, pad.z), pad.z); this.scene.add(this.towers[i]!); }
        this.towerLevels[i] = key;
        f.cd = t?.cd ?? 0;
      }
      const g = this.towers[i];
      if (!t || !g) return;
      const head = g.getObjectByName('head')!, bow = g.getObjectByName('bow')!, body = g.getObjectByName('body')!;
      head.rotation.y = yaw(t.facing);
      // A shot: the cooldown jumps back up. The bow kicks back and a puff in the branch colour leaves the muzzle.
      if (t.cd > f.cd + 0.05 && dt > 0 && !this.fxPaused) {
        f.recoil = 0.14;
        const tip = 1.0 + t.level * 0.25, y = (g.userData.height as number) + 0.4;
        fx.emit({ kind: 'puff', n: 2, color: t.branch === 'fire' ? 0xffb02e : t.branch === 'frost' ? 0xd8f6ff : 0xfff1c2, at: [pad.x + Math.cos(t.facing) * tip, y, pad.z + Math.sin(t.facing) * tip], speed: 1.4, up: 0.4, size: 0.13, life: 0.22, dir: t.facing, cone: 0.5 });
      }
      f.cd = t.cd;
      f.recoil = Math.max(0, f.recoil - dt);
      bow.position.x = -0.22 * (f.recoil / 0.14);
      f.pop = Math.max(0, f.pop - dt);
      const k = popScale(f.pop);
      body.scale.set(1 + (k - 1) * 0.6, k, 1 + (k - 1) * 0.6);
      // Branch life: embers rise off the fire crown, ice glints off the frost one (instanced particles, no draw calls).
      if (t.branch && !reduced && !this.sheetMode && !this.fxPaused && (f.idle -= dt) <= 0) {
        f.idle = t.branch === 'fire' ? 0.28 : 0.55;
        const a = Math.random() * Math.PI * 2, r = 0.55 + t.level * 0.1, y = (g.userData.height as number) + 0.55;
        fx.emit(t.branch === 'fire'
          ? { kind: 'spark', n: 1, color: Math.random() < 0.5 ? 0xffb02e : 0xff6a2a, at: [pad.x + Math.cos(a) * r, y, pad.z + Math.sin(a) * r], speed: 0.3, up: 2.2, size: 0.09, life: 0.6 }
          : { kind: 'spark', n: 1, color: 0xe6fbff, at: [pad.x + Math.cos(a) * r, y, pad.z + Math.sin(a) * r], speed: 0.2, up: 0.6, size: 0.11, life: 0.45 });
      }
    });
    // Barricades: level, damage state (intact, cracked, rubble) and region pick the kit; a hit wobbles it, a build pops it.
    s.barricades.forEach((b, i) => {
      const v = this.barricadeViews[i];
      if (!v) return;
      v.root.visible = !!b && !this.sheetMode;
      if (!b) { v.key = ''; return; }
      const key = `${b.level}:${barricadeState(b.hp, barricadeMaxHp(s, b.level))}:${this.region}`;
      if (key !== v.key) {
        const kit = this.barricadeKit(b.level, barricadeState(b.hp, barricadeMaxHp(s, b.level)));
        v.body.geometry = kit.body; v.hull.geometry = kit.hull; v.key = key;
      }
      v.wobble = Math.max(0, v.wobble - dt);
      v.pop = Math.max(0, v.pop - dt);
      const w = Math.sin(v.wobble * 60) * v.wobble * 0.35, k = popScale(v.pop);
      v.root.rotation.set(w * 0.5, siteAngle(BARRICADES[i]), w);
      v.root.scale.set(1 + (k - 1) * 0.4, k, 1 + (k - 1) * 0.4);
    });
    // Build rings: gold = you can afford it here, pale = not yet, green = a barricade to repair; the one in reach pulses.
    const here = alive ? siteInReach(s) : null, gold = s.gold;
    const C = this.chevrons;
    C.body.begin(); C.hull.begin();
    const chevron = (x: number, y: number, z: number) => {
      const t = this.tmp, bob = reduced ? 0 : Math.sin(this.time * 4 + x) * 0.12;
      t.m.compose(t.p.set(x, y + bob + this.groundHeight(x, z), z), this.camera.quaternion, t.s.set(1, 1, 1));
      C.body.push(t.m); C.hull.push(t.m);
    };
    this.siteRings.forEach((ring, j) => {
      const tower = j < PADS.length, i = tower ? j : j - PADS.length;
      const inReach = !!here && (here.kind === 'tower') === tower && here.i === i;
      let cost: number | null, repair = false;
      if (tower) cost = padCost(s, i);
      else { const o = barricadeOrder(s, i); cost = o ? o.cost : null; repair = o?.action === 'repair'; }
      ring.visible = !this.sheetMode && (cost !== null || inReach);
      if (!ring.visible) return;
      const can = cost !== null && cost <= gold, mat = ring.material as MeshBasicMaterial;
      mat.color.setHex(repair ? 0x6fe08a : can ? 0xffd34a : 0xfff0b8);
      const pulse = inReach && !reduced ? Math.sin(this.time * 8) : 0;
      mat.opacity = inReach ? 0.85 + pulse * 0.12 : can ? 0.85 : 0.42;
      ring.scale.setScalar((tower ? 1.12 : 1.4) * (inReach ? 1.08 + pulse * 0.03 : 1));
      // Chevron over a standing defence whose next level is affordable (not over empty sites: the ring says that).
      if (!can || repair || this.sheetMode) return;
      if (tower && s.towers[i]) chevron(PADS[i].x, (this.towers[i]?.userData.height as number ?? 2) + 1.05, PADS[i].z);
      else if (!tower && s.barricades[i]) chevron(BARRICADES[i].x, 1.85, BARRICADES[i].z);
    });
    C.body.end(); C.hull.end();
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
      this.conformDecal(this.aimLob,.06);this.conformDecal(this.aimLine,.055);
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
      if (hd.superSelf) { this.aimRing.visible = true; this.aimRing.position.set(h.x, 0.06, h.z); this.aimRing.scale.setScalar(hd.superRadius); this.conformDecal(this.aimRing,.06);return; }
      const l = Math.hypot(aim.offset.x, aim.offset.z), k = l > hd.superRange ? hd.superRange / l : 1;
      const tx = h.x + aim.offset.x * k, tz = h.z + aim.offset.z * k;
      this.aimRing.visible = this.aimLine.visible = true;
      this.aimRing.position.set(tx, 0.06, tz);
      const d = Math.hypot(tx - h.x, tz - h.z);
      this.aimLine.position.set((tx + h.x) / 2, 0.055, (tz + h.z) / 2);
      this.aimLine.scale.x = Math.max(0.01, d);
      this.aimLine.rotation.set(-Math.PI / 2, 0, -Math.atan2(tz - h.z, tx - h.x));
    }
    for(const mesh of [this.aimFan,this.aimRing,this.aimLine])if(mesh.visible)this.conformDecal(mesh,.06);
  }

  private updateFx(dt: number) {
    this.fx = this.fx.filter(f => {
      f.age += dt;
      const p = f.age / f.life;
      if (p >= 1) { this.scene.remove(f.mesh); (f.mesh.material as Material).dispose();if(this.decalBases.has(f.mesh))f.mesh.geometry.dispose(); return false; }
      f.mesh.scale.setScalar(f.grow * (0.3 + 0.7 * Math.sqrt(p)));
      this.conformDecal(f.mesh,.07);
      (f.mesh.material as MeshBasicMaterial).opacity = f.fade * (1 - p);
      return true;
    });
    this.telegraphs = this.telegraphs.filter(t => {
      t.age += dt;
      const p = Math.min(1, t.age / t.life);
      t.fill.scale.setScalar(Math.max(.001,t.mesh.scale.x * p));
      this.conformDecal(t.mesh,.05);this.conformDecal(t.fill,.052);
      if (t.age >= t.life) { this.scene.remove(t.mesh, t.fill); (t.mesh.material as Material).dispose(); (t.fill.material as Material).dispose();if(this.decalBases.has(t.mesh))t.mesh.geometry.dispose();if(this.decalBases.has(t.fill))t.fill.geometry.dispose(); return false; }
      return true;
    });
  }

  /** Read-only world cues: materials/posture survive pause without adding a health HUD. */
  private syncDamage(s: RushState, reduced: boolean) {
    const town = this.townDamage.update(s, s.tick, s.town.hp, s.town.maxHp, reduced);
    const hero = this.heroDamage.update(s, s.tick, s.hero.hp, heroMaxHp(s), reduced);
    this.damageStages = { town: town.stage, hero: hero.stage };
    this.townView?.setDamage(town);
    this.mats.hero.color.setHex(hero.tint);
    this.mats.hero.emissive.setHex(hero.emissive);
    this.mats.hero.emissiveIntensity = hero.emissiveIntensity;
    const skin = this.heroRig?.material;
    if (skin) { skin.color.copy(this.mats.hero.color); skin.emissive.copy(this.mats.hero.emissive); skin.emissiveIntensity = hero.emissiveIntensity; }
    // Compress from the grounded origin: feet stay at y=0 and the collision radius never changes.
    this.heroBody.scale.y = hero.stage === 'critical' ? .9 : hero.stage === 'damaged' ? .96 : 1;
    if (s !== this.damageBattle || s.tick < this.lastSmokeTick) {
      this.damageBattle = s; this.lastSmokeTick = s.tick;this.particles.clear();
    }
    if (!this.sheetMode && !reduced && s.town.hp > 0 && town.stage !== 'healthy'
        && s.phase === 'wave' && s.tick - this.lastSmokeTick >= 30) {
      this.lastSmokeTick = s.tick;
      const critical = town.stage === 'critical';
      for (const side of critical ? [-1, 1] : [1]) this.particles.emit({ kind: 'puff', n: 3,
        color: critical ? 0x958c7b : 0xaca28b, at: [TOWN.x + side * .8, 4.25, TOWN.z - .65],
        speed: .18, up: 1.8, size: critical ? .23 : .17, life: 1.1 });
      if(critical)this.particles.emit({kind:'spark',n:1,color:0xd99046,at:[TOWN.x,3.8,TOWN.z-.6],speed:.2,up:1,size:.08,life:.45});
    }
  }

  private updateCamera(s: RushState, dt: number) {
    if (this.overhead) {
      const cx = (ARENA.minX + ARENA.maxX) / 2, cz = (ARENA.minZ + ARENA.maxZ) / 2 - 2;
      this.focus.set(cx, 0, cz);
      this.camera.position.set(cx, 88, cz + 0.01); this.camera.lookAt(cx, 0, cz);
      return;
    }
    const h = s.hero, target = battleFocus(h, h.downT > 0, this.portrait);
    if (this.sheetMode) target.y = 0;
    this.focus.lerp(target, 1 - Math.exp(-6 * dt));
    const height = (this.portrait ? 30 : 23) * this.zoom, back = (this.portrait ? 14 : 12.5) * this.zoom;
    this.camera.position.set(this.focus.x, this.focus.y + height, this.focus.z + back);
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
    return raycastTerrain(this.raycaster.ray, p) ? { x: p.x, z: p.z } : null;
  }
  /** World point → CSS pixels relative to the canvas. */
  screenPoint(x: number, y: number, z: number, rect: DOMRect): { x: number; y: number; visible: boolean } {
    const v = new Vector3(x, y + this.groundHeight(x,z), z).project(this.camera);
    return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  }

  render() { this.renderer.render(this.scene, this.camera); }
  /** Renderer statistics for the debug overlay and performance notes. */
  /** Hero model triangles split into body and ink hull (outline meshes draw back faces), for measurement. */
  private heroTris() {
    const rig = this.heroRig, out = { body: 0, hull: 0 };
    rig?.holder.traverse(o => {
      if (!(o instanceof Mesh) || !o.visible || !(o.material as Material).visible) return; // parents drawn as nothing
      const g = o.geometry as BufferGeometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
      if ((o.material as Material).side === BackSide) out.hull += n; else out.body += n;
    });
    return out;
  }
  info() { const r = this.renderer.info.render; return { calls: r.calls, triangles: r.triangles, enemies: this.counts.enemies, shots: this.counts.shots, particles: this.particles.active, heroAnim: !!this.heroShot?.isRunning(), heroReady: !!this.heroRig, heroTexture: !!this.heroRig?.material.map, heroNormalMap: !!this.heroRig?.material.normalMap, heroMotion: this.heroRig?.motion.info(), heroKind: this.heroKind, heroTris: this.heroTris(), enemyTris: Object.fromEntries([...this.enemyKits].map(([k, v]) => [k, (v.body.index ? v.body.index.count : v.body.attributes.position.count) / 3])), heldProp: this.heroRig?.held ? this.heroRig.held.visible : null, townModel: this.townView?.status, townOccluders: this.townView?.occlusion.count ?? 0, damage: { ...this.damageStages }, heroTint: this.mats.hero.color.getHex(), heroPosture: this.heroBody.scale.y, terrain: {heroY:this.hero.position.y,townY:this.townView?.root.position.y,focusY:this.focus.y}, dropped: Batch.dropped, quality: this.quality, pixelRatio: this.renderer.getPixelRatio(), buffer: [this.renderer.domElement.width, this.renderer.domElement.height] }; }
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
/** Ward shell (cycle 90): the shaman's magenta, see-through, a little larger than the frost shell so both can show. */
const WARD = new MeshBasicMaterial({ color: 0xf08cf0, transparent: true, opacity: 0.42, depthWrite: false });
const KILL_COLOR: Record<EnemyKind, number> = { grunt: 0xe2463f, skirmisher: 0x1fa6b0, brute: 0xe8842a, boss: 0x6d55c4, shield: 0x8fa0c4, shaman: 0xd65fcf, wolf: 0x6fa6ee };
const ENEMY_KINDS: readonly EnemyKind[] = ['grunt', 'skirmisher', 'brute', 'boss', 'shield', 'shaman', 'wolf'];
/** Enemies are drawn larger than their hitbox so a grunt is no longer ~30 px tall on a phone; the simulation radius,
 * spacing and hit tests are unchanged. The wolf is long rather than tall, the boss was already big. */
export const ENEMY_SCALE: Record<EnemyKind, number> = { grunt: 1.3, skirmisher: 1.25, brute: 1.2, shield: 1.25, shaman: 1.25, boss: 1.1, wolf: 1.3 };
/** Build pop (squash and stretch) length and its height scale over time left. */
const POP_TIME = 0.45;
const popScale = (left: number) => { if (left <= 0) return 1; const p = 1 - left / POP_TIME; return 1 - 0.4 * (1 - p) ** 2 * Math.cos(p * Math.PI * 2.5); };
/** Barricade yaw: its front (local -z) faces up its lane, toward the enemies. */
function siteAngle(b: Vec & { lane: number }): number {
  const lane = LANES[b.lane];
  let best = 0, bestD = Infinity;
  for (let i = 0; i < lane.length - 1; i++) {
    const a = lane[i], c = lane[i + 1], ax = c.x - a.x, az = c.z - a.z;
    const t = Math.min(1, Math.max(0, ((b.x - a.x) * ax + (b.z - a.z) * az) / (ax * ax + az * az)));
    const d = Math.hypot(a.x + ax * t - b.x, a.z + az * t - b.z);
    if (d < bestD) { bestD = d; best = i; }
  }
  const a = lane[best], c = lane[best + 1];
  return Math.atan2(c.x - a.x, c.z - a.z);
}
/** Snow region: building materials (wood, stone, earth, steel) lean toward the cool wall stone; fire, ice, gold and
 * team colours stay as they are so the branch and the side still read. */
const COOLED = new Set<number>([DEF.wood, DEF.woodDark, DEF.plank, DEF.tip, DEF.stone, DEF.stoneAlt, DEF.stoneFoot, DEF.stoneCap, DEF.mortar, DEF.earth, DEF.iron, DEF.steel, 0xb87436]);
const coolPart = (p: Part): Part => (COOLED.has(p.color) ? { ...p, color: mixHex(p.color, REGION_LOOK.snow.wallCool, REGION_LOOK.snow.wallMix) } : p);
