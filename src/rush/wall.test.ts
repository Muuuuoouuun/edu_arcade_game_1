import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, CRATE, LANES, PADS, TOWN } from './data.ts';
import { FOREST, MAPS, SNOW, STAGE_MAPS, inWater, laneDistance, onIce } from './maps.ts';
import { bake, REGION_LOOK, wallParts } from './look.ts';
import { bushParts, coverParts, crateParts, decorSpot, gateParts, groundPaintAt, partTriangles, SCENERY_LOOK, sceneryParts } from './mapScenery.ts';

const bounds = (parts: Parameters<typeof bake>[0]) => { const g = bake(parts); g.computeBoundingBox(); const b = g.boundingBox!; g.dispose(); return b; };
const MAX_HEIGHT = { stone: 1.42, ice: 1.42, log: 1.2, outcrop: 3, logpile: 1.42, menhir: 2.1, pillar: 3 } as const;

test('every cover model (stone wall, log, ice rock, outcrop) stays inside its collider', () => {
  for (const map of STAGE_MAPS) for (const wall of map.walls) {
    const parts = coverParts(wall, wallParts);
    assert.ok(parts.length >= 6, `${wall.kind}: more than a plain block`);
    const b = bounds(parts), e = 1e-4;
    assert.ok(b.min.x >= wall.x - wall.w / 2 - e && b.max.x <= wall.x + wall.w / 2 + e, `${map.id} ${wall.kind} at ${wall.x},${wall.z}: x ${b.min.x}..${b.max.x}`);
    assert.ok(b.min.z >= wall.z - wall.d / 2 - e && b.max.z <= wall.z + wall.d / 2 + e, `${map.id} ${wall.kind} at ${wall.x},${wall.z}: z ${b.min.z}..${b.max.z}`);
    assert.ok(b.min.y >= -e && b.max.y <= MAX_HEIGHT[wall.kind] + e, `${wall.kind}: height ${b.max.y}`);
    // A solid thing looks solid: the model fills most of the collider's footprint.
    assert.ok(b.max.x - b.min.x >= wall.w * 0.85 && b.max.z - b.min.z >= wall.d * 0.8, `${wall.kind}: fills its collider`);
  }
});

test('crates and hiding cover: models match their footprints in both regions', () => {
  for (const id of ['forest', 'snow'] as const) {
    for (const treasure of [false, true]) {
      const b = bounds(crateParts(treasure, id));
      assert.ok(b.max.x - b.min.x <= CRATE.size + 0.02 && b.max.z - b.min.z <= CRATE.size + 0.02 && b.max.y <= CRATE.size * 1.15, `${id} crate`);
    }
    for (const bush of MAPS[id].bushes) {
      const b = bounds(bushParts(bush, id, 3));
      assert.ok(b.max.x - b.min.x <= bush.w + 0.5 && b.max.z - b.min.z <= bush.d + 0.5 && b.max.y < 1.7, `${id} cover`);
    }
  }
});

test('painted ground: roads, the stream and the ice read as themselves; gates stand behind every lane start', () => {
  const f = SCENERY_LOOK.forest, s = SCENERY_LOOK.snow, fp = REGION_LOOK.forest.ground, sp = REGION_LOOK.snow.ground;
  assert.ok([fp.road, fp.roadEdge].includes(groundPaintAt(FOREST, fp, f, 0, -20)));
  assert.ok(inWater(FOREST, 6, -9.9) && [f.water, f.waterLight].includes(groundPaintAt(FOREST, fp, f, 6, -9.9)));
  assert.ok(onIce(SNOW, 0, -13) && [s.ice, s.iceLight].includes(groundPaintAt(SNOW, sp, s, 0, -13)));
  assert.equal(groundPaintAt(SNOW, sp, s, 0, 10), sp.plaza);
  // The road runs on from each lane start to its gate.
  for (const lane of LANES) assert.ok([fp.road, fp.roadEdge].includes(groundPaintAt(FOREST, fp, f, lane[0].x, ARENA.minZ + 0.2)));
  for (const id of ['forest', 'snow'] as const) for (const lane of LANES) {
    const b = bounds(gateParts(lane[0], id));
    assert.ok(b.max.z <= ARENA.minZ + 0.4 && b.max.z > ARENA.minZ - 0.2, `${id} gate front at the north edge (${b.max.z})`);
    assert.ok(Math.abs((b.min.x + b.max.x) / 2 - lane[0].x) < 1 && b.max.y > 3, 'centred on the lane and taller than any actor');
  }
});

test('scenery: decoration keeps off everything that is played, and stays inside the triangle budget', () => {
  for (const map of STAGE_MAPS) {
    // Signature props never block, so they stay 1.9 m off every lane centre and clear of the pads and the town.
    for (const p of map.props) assert.ok(laneDistance(p.x, p.z) >= 1.9 && PADS.every(q => Math.hypot(p.x - q.x, p.z - q.z) > 2) && Math.hypot(p.x - TOWN.x, p.z - TOWN.z) > TOWN.radius + 2 && !map.walls.some(w => Math.abs(p.x - w.x) < w.w / 2 + 0.2 && Math.abs(p.z - w.z) < w.d / 2 + 0.2), `${map.name}: prop ${p.kind} at ${p.x},${p.z}`);
    for (const lane of LANES) for (const p of lane) assert.equal(decorSpot(map, p.x, p.z), false);
    for (const b of [...map.walls, ...map.bushes]) assert.equal(decorSpot(map, b.x, b.z), false);
    const sc = sceneryParts(map);
    assert.ok(sc.outlined.length > 100 && sc.extra.length > 300, `${map.id}: gates, trees and field decoration exist`);
    // Body + ink hull of the framed set, plus the high-tier extras: under 30k triangles per region.
    const tris = partTriangles(sc.frame) + partTriangles(sc.outlined) + partTriangles(sc.extra);
    assert.ok(tris < 32000, `${map.name}: ${tris} scenery triangles`);
  }
});
