// 3D kingdom view: an island town whose buildings grow in three visual stages with their levels.
// Shares the battle renderer; owns its own scene and camera. View-only — rules live in kingdom.ts.
import {
  BoxGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, OctahedronGeometry,
  PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, Vector3, type BufferGeometry,
} from 'three';
import { bake, hullGeometry, outlineMaterial, PAL, toon, type Part } from './look.ts';
import type { Kingdom, Upgrade } from './kingdom.ts';
import { ENDLESS_MILESTONES, ENDLESS_STAGE, level, stageUnlocked } from './kingdom.ts';

/** Visual stage for a level: -1 empty lot (perk not started), 0 = Lv1, 1 = Lv2-3, 2 = Lv4-5. */
export const stageOf = (lv: number) => (lv <= 0 ? -1 : lv <= 1 ? 0 : lv <= 3 ? 1 : 2);

type Spot = { id: Upgrade; x: number; z: number; label: number };
export const SPOTS: readonly Spot[] = [
  { id: 'castle', x: 0, z: -2.6, label: 5.4 },
  { id: 'farm', x: -6, z: 2.4, label: 2.6 },
  { id: 'mill', x: 6, z: 2.4, label: 2.6 },
  { id: 'attack', x: -6.2, z: -4, label: 2.6 },
  { id: 'towerDiscount', x: 6.2, z: -4, label: 3 },
  { id: 'townHp', x: 0, z: 1.6, label: 0.9 },
  // Behind the castle, left (cycle 20): the camera-side front of the island is under the HUD on phones.
  { id: 'forge', x: -4.3, z: -7.2, label: 2.9 },
  // Behind the castle, right (cycle 38): mirrors the forge.
  { id: 'vault', x: 4.3, z: -7.2, label: 2.7 },
];

/** Endless record flag (cycle 57): front right of the castle on the open lawn, between the mill path and the wall arc. */
export const FLAG = { x: 2.7, z: 1.5 } as const;
/** Flag look for a kingdom: -1 none (endless still locked), else the record milestones reached (0-4). */
export const flagStage = (k: Kingdom) => !stageUnlocked(k, ENDLESS_STAGE) ? -1 : ENDLESS_MILESTONES.filter(m => k.endlessBest >= m.waves).length;
const flagHeight = (stage: number) => 2.5 + 0.35 * stage;

const C = { cream: PAL.cream, roof: PAL.ally, wood: PAL.wood, dark: PAL.woodDark, gold: PAL.gold, stone: PAL.stone, stoneTop: PAL.stoneTop, red: 0xd9473f, hay: 0xf2c94c, crop: 0x9bd35a, purple: PAL.super, leaf: 0x4fae4a };

function sign(): Part[] {
  return [
    { geo: new CylinderGeometry(0.08, 0.08, 1, 6), color: C.dark, at: [0, 0.5, 0] },
    { geo: new BoxGeometry(0.9, 0.5, 0.08), color: C.wood, at: [0, 0.95, 0] },
    { geo: new BoxGeometry(1.4, 0.06, 1.4), color: 0xc9a46b, at: [0, 0.03, 0] },
  ];
}

/** Parts for one building at one visual stage (local coordinates, origin at the building's foot). */
function buildingParts(id: Upgrade, stage: number): Part[] {
  const s = stage;
  if (id === 'castle') {
    const k = 1 + 0.18 * s, parts: Part[] = [
      { geo: new BoxGeometry(2.2 * k, 2.2 * k, 2.2 * k), color: C.cream, at: [0, 1.1 * k, 0] },
      { geo: new ConeGeometry(1.7 * k, 1.5 * k, 4), color: C.roof, at: [0, 2.2 * k + 0.75 * k, 0], rot: [0, Math.PI / 4, 0] },
      { geo: new BoxGeometry(0.8, 1.1, 0.25), color: C.wood, at: [0, 0.55, 1.12 * k] },
    ];
    const towers = s === 0 ? 0 : s === 1 ? 2 : 4;
    for (let i = 0; i < towers; i++) {
      const a = (s === 1 ? [0.75, 2.39] : [0.75, 2.39, 3.9, 5.53])[i] * 1, x = Math.cos(a) * 1.9 * k, z = Math.sin(a) * 1.9 * k;
      parts.push({ geo: new CylinderGeometry(0.45, 0.52, 2.4 * k, 10), color: C.cream, at: [x, 1.2 * k, z] });
      parts.push({ geo: new ConeGeometry(0.6, 0.9, 10), color: C.roof, at: [x, 2.4 * k + 0.45, z] });
    }
    if (s === 2) {
      parts.push({ geo: new OctahedronGeometry(0.35), color: C.gold, at: [0, 2.2 * k + 1.9 * k, 0] });
      parts.push({ geo: new BoxGeometry(0.9, 0.55, 0.06), color: C.gold, at: [0.5, 2.2 * k + 2.4 * k, 0] });
      parts.push({ geo: new CylinderGeometry(0.05, 0.05, 1.6, 6), color: C.dark, at: [0, 2.2 * k + 2.1 * k, 0] });
    }
    return parts;
  }
  if (s < 0) return sign();
  if (id === 'farm') {
    const parts: Part[] = [
      { geo: new BoxGeometry(1.4, 1.1, 1.2), color: C.red, at: [0, 0.55, -0.6] },
      { geo: new ConeGeometry(1.1, 0.8, 4), color: C.dark, at: [0, 1.5, -0.6], rot: [0, Math.PI / 4, 0] },
    ];
    for (let i = 0; i <= s; i++) parts.push({ geo: new BoxGeometry(1.2, 0.18, 1.0), color: i % 2 ? C.hay : C.crop, at: [-1.4 + i * 1.35, 0.09, 1.0] });
    if (s >= 1) parts.push({ geo: new CylinderGeometry(0.35, 0.45, 0.6, 10), color: C.hay, at: [1.3, 0.3, -0.7] });
    if (s >= 2) {
      parts.push({ geo: new CylinderGeometry(0.35, 0.5, 2.6, 8), color: C.cream, at: [-1.7, 1.3, -0.8] });
      parts.push({ geo: new BoxGeometry(2.2, 0.16, 0.16), color: C.wood, at: [-1.7, 2.4, -0.35], rot: [0, 0, 0.6] });
      parts.push({ geo: new BoxGeometry(2.2, 0.16, 0.16), color: C.wood, at: [-1.7, 2.4, -0.35], rot: [0, 0, -0.6] });
    }
    return parts;
  }
  if (id === 'mill') {
    const parts: Part[] = [
      { geo: new BoxGeometry(1.5, 1.0 + 0.3 * s, 1.2), color: C.wood, at: [0, 0.5 + 0.15 * s, -0.5] },
      { geo: new BoxGeometry(1.8, 0.2, 1.5), color: C.dark, at: [0, 1.1 + 0.3 * s, -0.5] },
    ];
    for (let i = 0; i < 2 + s * 2; i++) parts.push({ geo: new CylinderGeometry(0.18, 0.18, 1.2, 8), color: 0xb5773d, at: [-0.6 + (i % 4) * 0.4, 0.2 + Math.floor(i / 4) * 0.34, 0.9], rot: [0, 0, Math.PI / 2] });
    if (s >= 1) parts.push({ geo: new BoxGeometry(1.0, 0.5, 0.5), color: C.stone, at: [1.4, 0.25, 0.4] });
    if (s >= 2) parts.push({ geo: new CylinderGeometry(0.9, 0.9, 0.25, 12), color: C.dark, at: [-1.2, 0.9, -0.5], rot: [0, 0, Math.PI / 2] });
    return parts;
  }
  if (id === 'attack') {
    const parts: Part[] = [];
    const dummies = s + 1;
    for (let i = 0; i < dummies; i++) {
      const x = -0.9 + i * 0.9;
      parts.push({ geo: new CylinderGeometry(0.08, 0.08, 1.2, 6), color: C.dark, at: [x, 0.6, 0] });
      parts.push({ geo: new SphereGeometry(0.32, 10, 8), color: 0xe8c99a, at: [x, 1.3, 0] });
      parts.push({ geo: new BoxGeometry(0.8, 0.12, 0.12), color: C.dark, at: [x, 0.95, 0] });
    }
    if (s >= 1) parts.push({ geo: new CylinderGeometry(0.55, 0.55, 0.12, 16), color: C.red, at: [1.5, 0.9, -0.6], rot: [Math.PI / 2, 0, 0] });
    if (s >= 2) {
      parts.push({ geo: new ConeGeometry(1.0, 1.4, 6), color: C.red, at: [-1.2, 0.7, -1.2] });
      parts.push({ geo: new CylinderGeometry(0.05, 0.05, 2, 6), color: C.dark, at: [0.4, 1.0, -1.2] });
    }
    return parts;
  }
  if (id === 'towerDiscount') {
    const parts: Part[] = [
      { geo: new BoxGeometry(1.4, 1.0, 1.2), color: C.cream, at: [0, 0.5, 0] },
      { geo: new ConeGeometry(1.1, 0.9, 4), color: C.purple, at: [0, 1.45, 0], rot: [0, Math.PI / 4, 0] },
    ];
    if (s >= 1) {
      parts.push({ geo: new BoxGeometry(0.16, 2.4, 0.16), color: C.wood, at: [1.2, 1.2, 0.2] });
      parts.push({ geo: new BoxGeometry(1.4, 0.14, 0.14), color: C.wood, at: [0.7, 2.35, 0.2] });
    }
    if (s >= 2) {
      parts.push({ geo: new CylinderGeometry(0.35, 0.45, 1.3, 8), color: 0xece0c4, at: [-1.3, 0.65, 0.4] });
      parts.push({ geo: new OctahedronGeometry(0.22), color: C.gold, at: [-1.3, 1.5, 0.4] });
    }
    return parts;
  }
  if (id === 'forge') {
    // Stone smithy with a glowing chimney and an anvil; from stage 2 a fire crystal and an ice crystal (the two branches).
    const k = 1 + 0.15 * s, parts: Part[] = [
      { geo: new BoxGeometry(1.8 * k, 1.1 * k, 1.4 * k), color: C.stone, at: [0, 0.55 * k, -0.2] },
      { geo: new BoxGeometry(2.0 * k, 0.18, 1.6 * k), color: C.stoneTop, at: [0, 1.1 * k + 0.09, -0.2] },
      { geo: new CylinderGeometry(0.26, 0.32, 1.3 * k, 8), color: C.dark, at: [0.55 * k, 1.1 * k + 0.6 * k, -0.5] },
      { geo: new CylinderGeometry(0.2, 0.2, 0.12, 8), color: 0xff7a2f, at: [0.55 * k, 1.1 * k + 1.27 * k, -0.5] },
      { geo: new BoxGeometry(0.6, 0.28, 0.32), color: 0x4a4f63, at: [-0.2, 0.42, 0.85] },
      { geo: new BoxGeometry(0.28, 0.28, 0.24), color: C.dark, at: [-0.2, 0.14, 0.85] },
    ];
    if (s >= 1) parts.push({ geo: new CylinderGeometry(0.2, 0.26, 1.0 * k, 8), color: C.dark, at: [-0.6 * k, 1.1 * k + 0.45 * k, -0.6] });
    if (s >= 2) {
      parts.push({ geo: new ConeGeometry(0.3, 0.8, 6), color: 0xff7a2f, at: [-1.25, 0.4, 0.7] }, { geo: new ConeGeometry(0.17, 0.45, 6), color: 0xffd04a, at: [-1.25, 0.35, 0.72] });
      parts.push({ geo: new OctahedronGeometry(0.34), color: 0x8fe6ff, at: [1.25, 0.45, 0.7], scale: [0.8, 1.4, 0.8] });
    }
    return parts;
  }
  if (id === 'vault') {
    // Squat stone treasury with a gold roof and an iron-banded door; coin piles and chests grow with the stage.
    const k = 1 + 0.12 * s, roofY = 1.0 * k + 0.4 * k, parts: Part[] = [
      { geo: new BoxGeometry(1.6 * k, 1.0 * k, 1.3 * k), color: C.stone, at: [0, 0.5 * k, -0.2] },
      { geo: new ConeGeometry(1.25 * k, 0.8 * k, 4), color: C.gold, at: [0, roofY, -0.2], rot: [0, Math.PI / 4, 0] },
      { geo: new BoxGeometry(0.6, 0.75, 0.12), color: C.dark, at: [0, 0.38, -0.2 + 0.65 * k] },
      { geo: new BoxGeometry(0.66, 0.08, 0.14), color: 0x4a4f63, at: [0, 0.55, -0.2 + 0.66 * k] },
      { geo: new CylinderGeometry(0.3 + 0.08 * s, 0.38 + 0.1 * s, 0.2 + 0.1 * s, 10), color: C.gold, at: [-1.05, 0.1 + 0.05 * s, 0.7] },
    ];
    if (s >= 1) parts.push(
      { geo: new BoxGeometry(0.6, 0.4, 0.4), color: C.wood, at: [1.05, 0.2, 0.65] },
      { geo: new BoxGeometry(0.64, 0.08, 0.44), color: C.gold, at: [1.05, 0.42, 0.65] },
    );
    if (s >= 2) parts.push(
      { geo: new OctahedronGeometry(0.28), color: C.gold, at: [0, roofY + 0.4 * k + 0.25, -0.2] },
      { geo: new CylinderGeometry(0.22, 0.3, 0.2, 10), color: C.gold, at: [-0.55, 0.1, 1.0] },
      { geo: new BoxGeometry(0.5, 0.34, 0.34), color: C.wood, at: [1.55, 0.17, -0.1], rot: [0, 0.5, 0] },
    );
    return parts;
  }
  // townHp: an arc of wall segments in front of the castle; height and count grow with the stage.
  // Local origin is the townHp spot; the arc is centred on the castle.
  const parts: Part[] = [];
  const n = [6, 8, 10][s], h = [0.6, 0.9, 1.2][s], color = s === 0 ? C.wood : C.stone;
  const castle = SPOTS[0], spot = SPOTS[5], cx = castle.x - spot.x, cz = castle.z - spot.z;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 0.1 + (i / (n - 1)) * Math.PI * 0.8;
    const x = cx + Math.cos(a) * 3.5, z = cz + Math.sin(a) * 3.1, rot: [number, number, number] = [0, Math.PI / 2 - a, 0];
    parts.push({ geo: new BoxGeometry(1.0, h, 0.35), color, at: [x, h / 2, z], rot });
    if (s >= 1) parts.push({ geo: new BoxGeometry(1.06, 0.14, 0.41), color: C.stoneTop, at: [x, h + 0.07, z], rot });
  }
  return parts;
}

/** A purple banner on a pole; the pole grows and a gold star joins the banner for every record milestone. */
function flagParts(stage: number): Part[] {
  const h = flagHeight(stage), parts: Part[] = [
    { geo: new BoxGeometry(0.9, 0.28, 0.9), color: C.stone, at: [0, 0.14, 0] },
    { geo: new BoxGeometry(0.66, 0.14, 0.66), color: C.stoneTop, at: [0, 0.35, 0] },
    { geo: new CylinderGeometry(0.09, 0.11, h, 6), color: C.dark, at: [0, h / 2, 0] },
    { geo: new SphereGeometry(0.2, 8, 6), color: C.gold, at: [0, h + 0.1, 0] },
    { geo: new BoxGeometry(1.4, 0.86, 0.08), color: C.purple, at: [0.76, h - 0.5, 0], rot: [0, -0.15, 0.03] },
    { geo: new BoxGeometry(0.26, 0.86, 0.09), color: 0x7a45d6, at: [1.36, h - 0.5, -0.09], rot: [0, -0.15, 0.03] },
  ];
  for (let i = 0; i < stage; i++) parts.push({ geo: new OctahedronGeometry(0.15), color: C.gold, at: [0.36 + i * 0.27, h - 0.5, 0.12], rot: [0, -0.15, 0] });
  return parts;
}

export class TownView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 1, 0.5, 120);
  private baked = toon(0xffffff, { vertexColors: true, rim: 0.34 });
  private cache = new Map<string, { body: BufferGeometry; hull: BufferGeometry }>();
  private nodes = new Map<Upgrade, { group: Group; stage: number; pop: number }>();
  private anchor = new Vector3();
  private flag = { group: new Group(), stage: -2 };

  constructor() {
    this.scene.background = new Color(PAL.water);
    this.scene.add(new HemisphereLight(0xe6f6ff, 0x9c8a62, 1.15));
    const sun = new DirectionalLight(0xfff3dc, 2.2);
    sun.position.set(-7, 16, 9);
    this.scene.add(sun);
    const water = new Mesh(new PlaneGeometry(200, 200), toon(PAL.water, { rim: 0 }));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.5;
    const sand = new Mesh(new CylinderGeometry(11.5, 12, 0.6, 40), toon(0xf0c98a, { rim: 0 }));
    sand.position.y = -0.32;
    const grass = new Mesh(new CylinderGeometry(10.3, 10.5, 0.3, 40), toon(0x86d35a, { rim: 0 }));
    grass.position.y = -0.14;
    this.scene.add(water, sand, grass);
    // Paths from the castle to each building, and trees around the rim (decoration only).
    const deco: Part[] = [];
    for (const s of SPOTS) if (s.id !== 'castle' && s.id !== 'townHp') {
      const dx = s.x, dz = s.z + 2.6, len = Math.hypot(dx, dz);
      deco.push({ geo: new BoxGeometry(1.1, 0.04, len), color: 0xf3cf8e, at: [s.x / 2, 0.02, (s.z - 2.6) / 2], rot: [0, Math.atan2(dx, dz), 0] });
    }
    let seed = 5;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.2, rad = 9 + r() * 0.8, k = 0.5 + r() * 0.4;
      if (Math.sin(a) > 0.55) continue; // keep the front (camera side) open
      deco.push({ geo: new CylinderGeometry(0.12, 0.16, 0.8, 6), color: C.dark, at: [Math.cos(a) * rad, 0.4, Math.sin(a) * rad] });
      deco.push({ geo: new SphereGeometry(k, 8, 6), color: C.leaf, at: [Math.cos(a) * rad, 0.9 + k * 0.6, Math.sin(a) * rad] });
    }
    const decoGeo = bake(deco);
    const decoMesh = new Mesh(decoGeo, this.baked);
    decoMesh.add(new Mesh(hullGeometry(decoGeo), outlineMaterial(0.04)));
    this.scene.add(decoMesh);
    for (const s of SPOTS) {
      const group = new Group();
      group.position.set(s.x, 0, s.z);
      this.scene.add(group);
      this.nodes.set(s.id, { group, stage: -2, pop: 0 });
    }
    this.flag.group.position.set(FLAG.x, 0, FLAG.z);
    this.scene.add(this.flag.group);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / Math.max(1, height);
    const portrait = height > width, short = Math.min(width, height) <= 420;
    this.camera.fov = portrait ? 62 : 38;
    // Short landscape phones: pull back and aim further in so the island sits below the top bar.
    const dist = portrait ? 1 : short ? 1.18 : 1;
    this.camera.position.set(0, (portrait ? 22 : 15) * dist, (portrait ? 20 : 14.5) * dist);
    this.camera.lookAt(0, 0, portrait ? -0.5 : short ? -3.4 : -1.2);
    this.camera.updateProjectionMatrix();
  }

  private kit(id: Upgrade, stage: number) {
    const key = `${id}:${stage}`;
    let kit = this.cache.get(key);
    if (!kit) {
      const body = bake(buildingParts(id, stage));
      kit = { body, hull: hullGeometry(body) };
      this.cache.set(key, kit);
    }
    return kit;
  }

  /** Rebuild buildings whose visual stage changed. */
  sync(k: Kingdom) {
    for (const s of SPOTS) {
      const node = this.nodes.get(s.id)!, stage = stageOf(level(k, s.id));
      if (stage === node.stage) continue;
      node.group.clear();
      if (!(s.id === 'townHp' && stage < 0)) {
        const kit = this.kit(s.id, stage);
        node.group.add(new Mesh(kit.body, this.baked), new Mesh(kit.hull, outlineMaterial(0.05)));
      }
      node.stage = stage;
    }
    const fs = flagStage(k);
    if (fs !== this.flag.stage) {
      this.flag.group.clear();
      if (fs >= 0) {
        const body = bake(flagParts(fs));
        this.flag.group.add(new Mesh(body, this.baked), new Mesh(hullGeometry(body), outlineMaterial(0.05)));
      }
      this.flag.stage = fs;
    }
  }

  /** Squash-and-stretch pop on a building that just levelled up. */
  bump(id: Upgrade) { const n = this.nodes.get(id); if (n) n.pop = 0.45; }

  update(dt: number) {
    for (const n of this.nodes.values()) {
      if (n.pop <= 0) { n.group.scale.set(1, 1, 1); continue; }
      n.pop = Math.max(0, n.pop - dt);
      const t = 1 - n.pop / 0.45, k = Math.sin(t * Math.PI) * 0.18;
      n.group.scale.set(1 + k * 0.6, 1 + k, 1 + k * 0.6);
    }
  }

  /** Screen position (CSS px) for the record flag's tag, just above the finial. */
  flagLabelAt(rect: { width: number; height: number }) {
    const v = this.anchor.set(FLAG.x, flagHeight(Math.max(0, this.flag.stage)) + 0.8, FLAG.z).project(this.camera);
    return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height };
  }

  /** Screen position (CSS px) for a building's name tag. */
  labelAt(id: Upgrade, rect: { width: number; height: number }) {
    const s = SPOTS.find(p => p.id === id)!;
    const v = this.anchor.set(s.x, s.label, s.z).project(this.camera);
    return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height };
  }
}
