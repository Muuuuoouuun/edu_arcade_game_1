// Battlefield layouts per expedition region (pure data and rules; no rendering). The arena bounds, the three lanes,
// the town and the tower pads are shared (data.ts), so balance stays comparable; what changes is what stands on the
// field: cover, hiding spots, crates, and one region zone each (a shallow stream in the forest, ice on the snow lanes).
// A battle keeps its layout on `RushState.map`, so the simulation, the bot and the view read the same thing.
import { ARENA, LANES, PADS, TOWN, type Block, type Vec } from './data.ts';

export type MapId = 'forest' | 'snow';
/** How a wall looks (the collider is the same axis-aligned block for all): mossy stone, a fallen log, an ice rock, or
 * a tall rock outcrop that closes part of the field. Stage signatures add a sawmill log pile, a standing stone and a
 * tall ice pillar. */
export type WallKind = 'stone' | 'log' | 'ice' | 'outcrop' | 'logpile' | 'menhir' | 'pillar';
export type Wall = Block & { kind: WallKind };
/** `gold` set = a treasure crate (a cache worth a detour); absent = an ordinary crate (CRATE.gold). */
export type CrateSpot = Vec & { gold?: number };
/** A band of shallow water along a centre line; bridges are dry. */
export interface Stream { path: readonly Vec[]; half: number; bridges: readonly Block[] }

/** A signature prop of a stage: scenery only, never blocks (kept off the lanes, the pads and the town by a test). */
export type PropKind = 'signpost' | 'fence' | 'stump' | 'sawhorse' | 'brazier' | 'snowpatch' | 'bones' | 'footprint' | 'banner';
export type Prop = Vec & { kind: PropKind; turn?: number };

export interface MapLayout {
  /** Region: decides the look (palette, cover models, gate style). */
  id: MapId;
  /** Region name for the two region bases, the village name for a stage layout. */
  name: string;
  /** Stage this layout belongs to (1-10); the endless challenge reuses stage 1. */
  stage: number;
  /** What sets this stage's field apart, in a few words (docs and tools). */
  signature: string;
  props: readonly Prop[];
  /** Size of the centre gate (default 1): the last stage has a throne gate. */
  gateScale?: number;
  walls: readonly Wall[];
  /** Walk-through cover that hides the hero: tall grass in the forest, frosted reeds on the snow. */
  bushes: readonly Block[];
  crates: readonly CrateSpot[];
  stream: Stream | null;
  /** Ice sheets (ZONE): a faster hero, longer knockback slides, and the enemies' ice marching factor. */
  ice: readonly Block[];
}

/** Zone rules. Stream: the hero wades slower, so the bridges are the fast way across. Ice: the hero runs faster on it
 * (`iceHero`) and anything knocked back on it slides further (`iceSlide`). `iceSpeed` is the enemies' marching factor
 * on ice; the old campaign used 1.25. It is 1 here on purpose: the guard-bot balance checks (stages.test.ts,
 * STAGE_POWER) sit on a knife edge where even 1.0001 flips several seeds (docs/rush/map-metrics.md), so raising it
 * belongs with the next full balance pass, not with the map work. */
export const ZONE = { streamSpeed: 0.75, iceSpeed: 1, iceHero: 1.2, iceSlide: 1.6, cacheGold: 14 } as const;

/** The cover beside the gate road is the same in every region. Measured (docs/rush/map-metrics.md): of everything on
 * the field, only this pair, the stream and the ice change how the guard bot's battles go, so keeping it in place
 * keeps the forest exactly on the old balance and leaves the ice as the snow region's only difference. */
const NEAR_BUSH: Block = { x: 3.6, z: 1.5, w: 2, d: 1.6 };
const pair = <T extends Vec>(list: readonly T[]): T[] => list.flatMap(b => [{ ...b, x: -b.x }, b]);

/** 청록의 숲 (stages 1-5 and the endless challenge): a stream with three bridges cuts the field in two, fallen logs and
 * mossy walls give cover, and a ruin in the north holds two treasure crates between the lanes. */
export const FOREST: MapLayout = {
  id: 'forest', name: '숲 가장자리', stage: 1, signature: 'stream with three bridges, ruin with a treasure cache, signposts at the forest edge',
  props: pair<Prop>([{ x: 4.4, z: -4.6, kind: 'signpost' }, { x: 11.9, z: -6.3, kind: 'fence' }, { x: 6.4, z: -12.2, kind: 'fence', turn: 0.5 }, { x: 4.6, z: -16.6, kind: 'signpost' }]),
  walls: [
    ...pair<Wall>([
      { x: 4, z: -20, w: 2, d: 1, kind: 'stone' },
      { x: 7.6, z: -22.6, w: 3.2, d: 0.9, kind: 'stone' },
      { x: 4.5, z: -13.6, w: 3, d: 0.9, kind: 'log' },
      { x: 3.2, z: -3.5, w: 1, d: 1.2, kind: 'stone' },
      { x: 9.5, z: 3, w: 1.2, d: 4, kind: 'stone' },
    ]),
  ],
  bushes: pair([
    { x: 6, z: -7, w: 2.4, d: 2 }, NEAR_BUSH, { x: 9.4, z: -18.2, w: 2.2, d: 2 },
  ]),
  crates: pair<CrateSpot>([{ x: 2.2, z: -7 }, { x: 8.5, z: -16 }, { x: 7.6, z: -21.3, gold: ZONE.cacheGold }]),
  stream: {
    path: [{ x: -16.2, z: -10.6 }, { x: -9, z: -9.7 }, { x: -3, z: -10.3 }, { x: 3, z: -9.5 }, { x: 9, z: -10.2 }, { x: 16.2, z: -9.4 }],
    half: 0.95,
    bridges: [{ x: 0, z: -9.9, w: 3.4, d: 2.9 }, { x: -11.3, z: -10.1, w: 4.2, d: 3.3 }, { x: 11.3, z: -9.8, w: 4.2, d: 3.3 }],
  },
  ice: [],
};

/** 서리산맥 (stages 6-10): two rock outcrops split the north into three canyons, ice sheets lie on the lanes (fast
 * footing for the hero, long slides for anything knocked back), frosted reeds hide the hero further out, and the treasure sits in the lee of each outcrop. */
export const SNOW: MapLayout = {
  id: 'snow', name: '눈꽃 고갯길', stage: 6, signature: 'two crags split the north into three canyons, ice sheets on every lane',
  props: pair<Prop>([{ x: 5.2, z: -13.6, kind: 'banner' }, { x: 12.6, z: -6.2, kind: 'snowpatch' }, { x: 5.4, z: -17.4, kind: 'snowpatch' }]),
  walls: [
    ...pair<Wall>([
      { x: 6.7, z: -22.6, w: 6.2, d: 6.8, kind: 'outcrop' },
      { x: 7.2, z: -9.5, w: 1, d: 3, kind: 'ice' },
      { x: 3.2, z: -3.5, w: 1, d: 1.2, kind: 'ice' },
      { x: 10.2, z: 2, w: 1.4, d: 3, kind: 'ice' },
    ]),
  ],
  bushes: pair([
    { x: 8.6, z: -13.6, w: 2.4, d: 2 }, { x: 3.2, z: -8.2, w: 2, d: 1.8 }, NEAR_BUSH,
  ]),
  crates: pair<CrateSpot>([{ x: 2.6, z: -17.6 }, { x: 4.9, z: -11.4 }, { x: 6.7, z: -18.3, gold: ZONE.cacheGold }]),
  stream: null,
  ice: [{ x: 0, z: -13, w: 3.2, d: 7 }, { x: -12.7, z: -17, w: 3.4, d: 7 }, { x: 12.7, z: -17, w: 3.4, d: 7 }],
};

// ---------- one battlefield per stage ----------
// Measured (docs/rush/map-metrics.md): crates, walls north of z -5, the side walls, cover other than the gate-road
// pair, the stream (hero only) and the ice (hero and knockback only) do not change a guard-bot battle. Every stage
// rearranges exactly those, so the ten fields differ while the balance numbers stay where they were.
const forestNear: Wall[] = pair<Wall>([{ x: 3.2, z: -3.5, w: 1, d: 1.2, kind: 'stone' }, { x: 9.5, z: 3, w: 1.2, d: 4, kind: 'stone' }]);
const snowNear: Wall[] = pair<Wall>([{ x: 3.2, z: -3.5, w: 1, d: 1.2, kind: 'ice' }, { x: 10.2, z: 2, w: 1.4, d: 3, kind: 'ice' }]);
const chest = (x: number, z: number): CrateSpot => ({ x, z, gold: ZONE.cacheGold });
const ring = (cx: number, cz: number, r: number, n: number, kind: WallKind): Wall[] =>
  Array.from({ length: n }, (_, i) => ({ x: +(cx + Math.cos((i / n) * Math.PI * 2) * r).toFixed(2), z: +(cz + Math.sin((i / n) * Math.PI * 2) * r).toFixed(2), w: 1, d: 1, kind }));
const trail = (from: Vec, to: Vec, n: number, kind: PropKind): Prop[] =>
  Array.from({ length: n }, (_, i) => ({ x: +(from.x + ((to.x - from.x) * i) / (n - 1) + (i % 2 ? 0.22 : -0.22)).toFixed(2), z: +(from.z + ((to.z - from.z) * i) / (n - 1)).toFixed(2), kind }));

/** Stage layouts in order (index = stage - 1). Names are the villages of expedition.ts `EXPEDITION`. */
export const STAGE_MAPS: readonly MapLayout[] = [
  FOREST,
  {
    id: 'forest', name: '제재소 구조 작전', stage: 2, signature: 'sawmill: stacked log piles for cover, stumps and sawhorses, the mill stream',
    walls: [...forestNear, ...pair<Wall>([{ x: 4.6, z: -13.6, w: 3, d: 1.2, kind: 'logpile' }, { x: 5.2, z: -18.4, w: 1.2, d: 3, kind: 'logpile' }, { x: 7.8, z: -22, w: 3, d: 0.9, kind: 'log' }])],
    bushes: pair([{ x: 6, z: -6.6, w: 2.4, d: 2 }, NEAR_BUSH, { x: 9.2, z: -17.6, w: 2, d: 2 }]),
    crates: pair<CrateSpot>([{ x: 2.4, z: -12.2 }, { x: 8.6, z: -14.2 }, chest(7.8, -20.6)]),
    stream: FOREST.stream, ice: [],
    props: pair<Prop>([{ x: 7.4, z: -11.6, kind: 'stump' }, { x: 9.6, z: -12.6, kind: 'stump' }, { x: 3.4, z: -16, kind: 'stump' }, { x: 8.6, z: -19.6, kind: 'stump' }, { x: 12.9, z: -5.2, kind: 'stump' }, { x: 7.6, z: -15.8, kind: 'sawhorse' }, { x: 3.2, z: -21.6, kind: 'sawhorse', turn: 1.2 }]),
  },
  {
    id: 'forest', name: '서리 낀 옛길', stage: 3, signature: 'old road: milestones along the centre lane, frost creeping onto the roads in the north, no stream',
    walls: [...forestNear, ...pair<Wall>([{ x: 2.7, z: -8, w: 1, d: 1, kind: 'menhir' }, { x: 2.7, z: -14.5, w: 1, d: 1, kind: 'menhir' }, { x: 2.7, z: -21, w: 1, d: 1, kind: 'menhir' }, { x: 7.5, z: -17, w: 3, d: 1, kind: 'stone' }, { x: 9.2, z: -12, w: 1, d: 2.4, kind: 'stone' }])],
    bushes: pair([{ x: 5.8, z: -5.6, w: 2.2, d: 2 }, NEAR_BUSH, { x: 9.3, z: -21, w: 2.2, d: 2 }, { x: 5.4, z: -24.4, w: 2.2, d: 1.8 }]),
    crates: pair<CrateSpot>([{ x: 5.2, z: -11 }, { x: 8.2, z: -13 }, chest(7.5, -18.4)]),
    stream: null, ice: [{ x: 0, z: -20.5, w: 3, d: 5 }, { x: -12.8, z: -21, w: 3.2, d: 5 }, { x: 12.8, z: -21, w: 3.2, d: 5 }],
    props: pair<Prop>([{ x: 5.6, z: -8.6, kind: 'snowpatch' }, { x: 4.8, z: -23.4, kind: 'snowpatch' }, { x: 9.8, z: -24, kind: 'snowpatch' }, { x: 6.2, z: -20.6, kind: 'snowpatch' }, { x: 5.6, z: -14.4, kind: 'fence', turn: 1.57 }]),
  },
  {
    id: 'forest', name: '설산에서 온 손님', stage: 4, signature: 'the stream runs far north under the snow line; ice rocks and snow patches up there, logs below',
    walls: [...forestNear, ...pair<Wall>([{ x: 5, z: -21.6, w: 3, d: 1, kind: 'ice' }, { x: 4.5, z: -11, w: 3, d: 0.9, kind: 'log' }, { x: 3.3, z: -8.2, w: 0.9, d: 2.4, kind: 'log' }])],
    bushes: pair([{ x: 5.6, z: -7.4, w: 2.4, d: 2 }, NEAR_BUSH, { x: 8.6, z: -13.6, w: 2.2, d: 2 }]),
    crates: pair<CrateSpot>([{ x: 2.3, z: -13.4 }, { x: 8, z: -9.6 }, chest(8.6, -22.4)]),
    stream: {
      path: [{ x: -16.2, z: -17.4 }, { x: -6, z: -16.6 }, { x: 0, z: -17.2 }, { x: 6, z: -16.5 }, { x: 16.2, z: -17.3 }], half: 0.95,
      bridges: [{ x: 0, z: -17, w: 3.4, d: 3 }, { x: -12.7, z: -17, w: 3.8, d: 3.3 }, { x: 12.7, z: -17, w: 3.8, d: 3.3 }],
    },
    ice: [],
    props: pair<Prop>([{ x: 3.4, z: -19.6, kind: 'snowpatch' }, { x: 8.4, z: -19.4, kind: 'snowpatch' }, { x: 9.8, z: -23.6, kind: 'snowpatch' }, { x: 2.8, z: -23.8, kind: 'snowpatch' }, { x: 6.6, z: -24.2, kind: 'snowpatch' }, ...trail({ x: 10.4, z: -24.6 }, { x: 5.4, z: -4.4 }, 9, 'footprint')]),
  },
  {
    id: 'forest', name: '강 건너의 불빛', stage: 5, signature: 'boss arena: a wide river with long bridges and beacon fires, open ground on both banks',
    walls: [...forestNear, ...pair<Wall>([{ x: 7, z: -20.6, w: 2.4, d: 1, kind: 'stone' }, { x: 6.2, z: -15.4, w: 1, d: 1, kind: 'menhir' }])],
    bushes: pair([{ x: 6.4, z: -6.9, w: 2.4, d: 1.8 }, NEAR_BUSH, { x: 3.8, z: -17.6, w: 2, d: 1.8 }]),
    crates: pair<CrateSpot>([{ x: 3.2, z: -6 }, { x: 9, z: -17.4 }, chest(7, -22)]),
    stream: {
      path: [{ x: -16.2, z: -11.4 }, { x: -8, z: -10.7 }, { x: 0, z: -11.2 }, { x: 8, z: -10.6 }, { x: 16.2, z: -11.2 }], half: 1.8,
      bridges: [{ x: 0, z: -11, w: 3.6, d: 5 }, { x: -11.6, z: -11, w: 4.8, d: 5.4 }, { x: 11.6, z: -11, w: 4.8, d: 5.4 }],
    },
    ice: [],
    props: pair<Prop>([{ x: 2.7, z: -7.8, kind: 'brazier' }, { x: 2.7, z: -14.2, kind: 'brazier' }, { x: 8.6, z: -14.6, kind: 'brazier' }, { x: 12.6, z: -6.0, kind: 'signpost' }]),
  },
  SNOW,
  {
    id: 'snow', name: '늑대 무리의 습격', stage: 7, signature: 'wolf gorge: two long rock walls squeeze the middle, ice runs down the side lanes, bones by the dens',
    walls: [...snowNear, ...pair<Wall>([{ x: 6.3, z: -15, w: 2.6, d: 9, kind: 'outcrop' }, { x: 4.4, z: -23, w: 2, d: 1, kind: 'ice' }])],
    bushes: pair([{ x: 9.2, z: -8.4, w: 2.2, d: 2 }, { x: 3.4, z: -7.4, w: 2, d: 1.8 }, NEAR_BUSH]),
    crates: pair<CrateSpot>([{ x: 2.6, z: -21 }, { x: 9.4, z: -19.6 }, chest(3.4, -14.6)]),
    stream: null, ice: [{ x: -12.7, z: -15, w: 3.4, d: 9 }, { x: 12.7, z: -15, w: 3.4, d: 9 }],
    props: pair<Prop>([{ x: 3.6, z: -11.4, kind: 'bones' }, { x: 9.4, z: -22.8, kind: 'bones' }, { x: 8.8, z: -11.8, kind: 'bones' }, { x: 3.4, z: -18.2, kind: 'bones' }, { x: 5.6, z: -5.4, kind: 'snowpatch' }]),
  },
  {
    id: 'snow', name: '영물의 발자국', stage: 8, signature: 'two rings of standing stones around the treasure, glowing footprints leading south, ice on the centre lane',
    walls: [...snowNear, ...pair<Wall>(ring(7.2, -15, 2.6, 6, 'menhir').filter(w => w.x > 0))],
    bushes: pair([{ x: 6.2, z: -6.8, w: 2.2, d: 2 }, NEAR_BUSH, { x: 9.4, z: -21.6, w: 2.2, d: 2 }]),
    crates: pair<CrateSpot>([{ x: 2.6, z: -9.6 }, { x: 5, z: -21.6 }, chest(7.2, -15)]),
    stream: null, ice: [{ x: 0, z: -20, w: 3.2, d: 6 }],
    props: pair<Prop>([...trail({ x: 7.2, z: -11.6 }, { x: 5.2, z: -4.6 }, 8, 'footprint'), ...trail({ x: 6.8, z: -24.6 }, { x: 7.2, z: -18.6 }, 5, 'footprint'), { x: 3.4, z: -14, kind: 'snowpatch' }]),
  },
  {
    id: 'snow', name: '서리 왕좌로 가는 길', stage: 9, signature: 'processional road: ice pillars line the centre lane on one long ice sheet, crags close the corners',
    walls: [...snowNear, ...pair<Wall>([{ x: 2.9, z: -22, w: 1.2, d: 1.2, kind: 'pillar' }, { x: 2.9, z: -17.5, w: 1.2, d: 1.2, kind: 'pillar' }, { x: 2.9, z: -13, w: 1.2, d: 1.2, kind: 'pillar' }, { x: 2.9, z: -8.5, w: 1.2, d: 1.2, kind: 'pillar' }, { x: 8.4, z: -23.4, w: 4, d: 4.6, kind: 'outcrop' }])],
    bushes: pair([{ x: 8.6, z: -14, w: 2.4, d: 2 }, { x: 5.6, z: -6, w: 2, d: 1.8 }, NEAR_BUSH]),
    crates: pair<CrateSpot>([{ x: 5.6, z: -10.8 }, { x: 5.8, z: -19.8 }, chest(8.4, -19.8)]),
    stream: null, ice: [{ x: 0, z: -15, w: 3.2, d: 14 }],
    props: pair<Prop>([{ x: 4.6, z: -15.2, kind: 'banner' }, { x: 4.6, z: -24.2, kind: 'banner' }, { x: 8.8, z: -10.6, kind: 'snowpatch' }]),
  },
  {
    id: 'snow', name: '서리 왕좌의 결전', stage: 10, signature: 'throne arena: a larger throne gate, one wide ice floor, four great ice pillars, blue fires',
    gateScale: 1.5,
    walls: [...snowNear, ...pair<Wall>([{ x: 6, z: -9.5, w: 1.6, d: 1.6, kind: 'pillar' }, { x: 6, z: -18.5, w: 1.6, d: 1.6, kind: 'pillar' }, { x: 8.2, z: -24, w: 3.6, d: 3.6, kind: 'outcrop' }])],
    bushes: pair([{ x: 9.3, z: -10.6, w: 2, d: 2 }, { x: 4.4, z: -13.9, w: 2, d: 1.8 }, NEAR_BUSH]),
    crates: pair<CrateSpot>([{ x: 3.4, z: -22.6 }, { x: 9.4, z: -14 }, chest(9.2, -20.6)]),
    stream: null, ice: [{ x: 0, z: -14, w: 6.4, d: 7 }],
    props: pair<Prop>([{ x: 4.4, z: -24.4, kind: 'brazier' }, { x: 4.6, z: -5.6, kind: 'brazier' }, { x: 3.9, z: -18.4, kind: 'banner' }, { x: 3.9, z: -9.6, kind: 'banner' }]),
  },
];
/** The two region bases (stage 1 and stage 6), by region. */
export const MAPS: Record<MapId, MapLayout> = { forest: FOREST, snow: SNOW };
/** Stage → layout: one per stage; the endless challenge (11) and a battle without a stage use stage 1's. */
export const mapFor = (stage = 1): MapLayout => STAGE_MAPS[stage >= 1 && stage <= STAGE_MAPS.length ? Math.round(stage) - 1 : 0];

// ---------- zone queries ----------
const inBlock = (b: Block, x: number, z: number, pad = 0) => Math.abs(x - b.x) <= b.w / 2 + pad && Math.abs(z - b.z) <= b.d / 2 + pad;
export function segmentDistance(x: number, z: number, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}
export function pathDistance(x: number, z: number, path: readonly Vec[]): number {
  let d = Infinity;
  for (let i = 1; i < path.length; i++) d = Math.min(d, segmentDistance(x, z, path[i - 1], path[i]));
  return d;
}
export const onBridge = (m: MapLayout, x: number, z: number) => !!m.stream && m.stream.bridges.some(b => inBlock(b, x, z));
/** In the stream and not on a bridge. */
export const inWater = (m: MapLayout, x: number, z: number) =>
  !!m.stream && pathDistance(x, z, m.stream.path) < m.stream.half && !onBridge(m, x, z);
export const onIce = (m: MapLayout, x: number, z: number) => m.ice.some(b => inBlock(b, x, z));
/** Movement multiplier of the ground under an enemy: ice is faster. The stream does not slow them: they keep their pace. */
export const paceAt = (m: MapLayout, x: number, z: number) => (m.ice.length && onIce(m, x, z) ? ZONE.iceSpeed : 1);
/** The same for the hero, who also wades slowly through the stream: cross on a bridge, or be caught in the water. */
export const heroPaceAt = (m: MapLayout, x: number, z: number) => (inWater(m, x, z) ? ZONE.streamSpeed : m.ice.length && onIce(m, x, z) ? ZONE.iceHero : 1);
/** Knockback multiplier of the ground: pushed things slide further on ice. */
export const slideAt = (m: MapLayout, x: number, z: number) => (m.ice.length && onIce(m, x, z) ? ZONE.iceSlide : 1);
export const inBush = (m: MapLayout, x: number, z: number) => m.bushes.some(b => inBlock(b, x, z));
/** Where each lane enters the field: the enemy gates stand here. */
export const GATES: readonly Vec[] = LANES.map(l => l[0]);
export const laneDistance = (x: number, z: number) => Math.min(...LANES.map(l => pathDistance(x, z, l)));

// ---------- measurements (map size and density; locked in by maps tests, table in docs/rush/map-metrics.md) ----------
export const laneLength = (lane: number) => LANES[lane].slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - LANES[lane][i].x, p.z - LANES[lane][i].z), 0);
/** Seconds for an enemy of `speed` m/s to walk a lane on this map (ice and wading included), sampled every 5 cm. */
export function laneTime(m: MapLayout, lane: number, speed: number): number {
  const pts = LANES[lane];
  let t = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.05);
    for (let k = 0; k < n; k++) { const u = (k + 0.5) / n; t += d / n / (speed * paceAt(m, a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u)); }
  }
  return t;
}
/** Distance from a point to the nearest thing that matters in play: a lane, a wall, cover, a crate, a zone, a gate,
 * a pad or the town. */
export function nearestFeature(m: MapLayout, x: number, z: number): number {
  const toBlock = (b: Block) => Math.hypot(Math.max(0, Math.abs(x - b.x) - b.w / 2), Math.max(0, Math.abs(z - b.z) - b.d / 2));
  let d = Math.min(laneDistance(x, z), Math.hypot(x - TOWN.x, z - TOWN.z) - TOWN.radius);
  for (const b of [...m.walls, ...m.bushes, ...m.ice, ...(m.stream?.bridges ?? [])]) d = Math.min(d, toBlock(b));
  for (const p of [...m.crates, ...GATES, ...PADS]) d = Math.min(d, Math.hypot(x - p.x, z - p.z));
  if (m.stream) d = Math.min(d, pathDistance(x, z, m.stream.path) - m.stream.half);
  return Math.max(0, d);
}
/** Field statistics on a 0.5 m grid. `walkable`: m² not inside a wall. `used`: share of the walkable field within
 * `near` m of a feature (the rest is dead ground). `north`: the same share for the half north of z = -6.5. */
export function mapStats(m: MapLayout, near = 3) {
  const step = 0.5, cell = step * step;
  let walkable = 0, used = 0, northAll = 0, northUsed = 0, blocked = 0;
  const midZ = (ARENA.minZ + ARENA.maxZ) / 2;
  for (let z = ARENA.minZ + step / 2; z < ARENA.maxZ; z += step) for (let x = ARENA.minX + step / 2; x < ARENA.maxX; x += step) {
    if (m.walls.some(b => inBlock(b, x, z))) { blocked += cell; continue; }
    const hit = nearestFeature(m, x, z) <= near;
    walkable += cell; if (hit) used += cell;
    if (z < midZ) { northAll += cell; if (hit) northUsed += cell; }
  }
  const features = m.walls.length + m.bushes.length + m.crates.length + m.ice.length + (m.stream ? 1 + m.stream.bridges.length : 0) + GATES.length;
  return { area: (ARENA.maxX - ARENA.minX) * (ARENA.maxZ - ARENA.minZ), walkable, blocked, used: used / walkable, north: northUsed / northAll, features };
}
