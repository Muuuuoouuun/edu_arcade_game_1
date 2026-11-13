// Map size and density numbers per layout (docs/rush/map-metrics.md is this output; src/rush/sim.test.ts locks the
// important ones). "old" is the single layout every stage had before the regions, kept here as the reference.
// Usage: node --experimental-strip-types tools/rush-map-metrics.ts
import { ARENA, ENEMIES, HEROES, HERO_SPAWN, LANES } from '../src/rush/data.ts';
import { FOREST, SNOW, laneLength, laneTime, mapStats, nearestFeature, type MapLayout } from '../src/rush/maps.ts';
import { viewFootprint } from '../src/rush/battleCamera.ts';

const OLD: MapLayout = {
  id: 'forest', name: 'old (one layout for all stages)', stream: null, ice: [],
  walls: [[-4, -20, 2, 1], [4, -20, 2, 1], [-4.5, -12, 3, 1], [4.5, -12, 3, 1], [-3.2, -3.5, 1, 1.2], [3.2, -3.5, 1, 1.2], [-9.5, 3, 1.2, 4], [9.5, 3, 1.2, 4]].map(([x, z, w, d]) => ({ x, z, w, d, kind: 'stone' as const })),
  bushes: [{ x: -6, z: -7, w: 2.4, d: 2 }, { x: 6, z: -7, w: 2.4, d: 2 }, { x: -3.6, z: 1.5, w: 2, d: 1.6 }, { x: 3.6, z: 1.5, w: 2, d: 1.6 }],
  crates: [{ x: -2.2, z: -9 }, { x: 2.2, z: -9 }, { x: -8.5, z: -16 }, { x: 8.5, z: -16 }],
};
const pct = (v: number) => `${(v * 100).toFixed(1)}%`, f1 = (v: number) => v.toFixed(1);
/** Largest circle of ground with nothing in it (m radius), on a 0.5 m grid. */
const emptiest = (m: MapLayout) => {
  let best = { r: 0, x: 0, z: 0 };
  for (let z = ARENA.minZ + 0.25; z < ARENA.maxZ; z += 0.5) for (let x = ARENA.minX + 0.25; x < ARENA.maxX; x += 0.5) {
    const r = Math.min(nearestFeature(m, x, z), x - ARENA.minX, ARENA.maxX - x, z - ARENA.minZ, ARENA.maxZ - z);
    if (r > best.r) best = { r, x, z };
  }
  return best;
};
for (const m of [OLD, FOREST, SNOW]) {
  const s3 = mapStats(m, 3), s2 = mapStats(m, 2), e = emptiest(m);
  console.log(`\n## ${m.name}`);
  console.log(`arena ${s3.area} m2 (30 x 39), walkable ${f1(s3.walkable)} m2, closed by walls ${f1(s3.blocked)} m2`);
  console.log(`elements: walls ${m.walls.length}, cover ${m.bushes.length}, crates ${m.crates.length} (treasure ${m.crates.filter(c => c.gold).length}), ice ${m.ice.length}, stream ${m.stream ? 1 : 0}, bridges ${m.stream?.bridges.length ?? 0}, gates 3 -> ${s3.features}`);
  console.log(`used ground within 3 m of a feature: ${pct(s3.used)} (north half ${pct(s3.north)}); within 2 m: ${pct(s2.used)} (north half ${pct(s2.north)})`);
  console.log(`largest empty circle: r ${f1(e.r)} m at (${e.x}, ${e.z})`);
  for (const kind of ['grunt', 'brute', 'boss'] as const)
    console.log(`${kind} arrival (s): ${LANES.map((_, i) => `lane ${i} ${f1(laneTime(m, i, ENEMIES[kind].speed))}`).join(', ')}`);
}
console.log(`\nlane lengths (m): ${LANES.map((_, i) => f1(laneLength(i))).join(', ')}`);
const v = HEROES.ranger.speed;
console.log(`hero (ranger ${v} m/s): east-west ${f1((ARENA.maxX - ARENA.minX - 1) / v)} s, spawn to north edge ${f1((HERO_SPAWN.z - ARENA.minZ - 0.5) / v)} s`);
for (const [name, w, h] of [['phone landscape 915x412', 915, 412], ['desktop 1280x720', 1280, 720], ['phone portrait 412x915', 412, 915]] as const)
  for (const [where, hero] of [['hero start', HERO_SPAWN], ['mid field', { x: 0, z: -6 }], ['north', { x: 0, z: -18 }]] as const) {
    const f = viewFootprint(hero, w, h);
    console.log(`${name}, ${where}: sees z ${f1(f.north)}..${f1(f.south)}, ground ${f1(f.area)} m2, in arena ${f1(f.inArena)} m2 = ${pct(f.share)} of the arena`);
  }
