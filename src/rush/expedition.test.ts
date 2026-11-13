// Expedition merge (2026-11-13): the old 원정 campaign folded into the Rush stage ladder. Run from kingdom.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPANIONS, EXPEDITION, LEGACY_GOLD_CAP, LEGACY_STAR_CAP, REGIONS, companionsOf, expeditionStage, firstClearNews, importLegacyCampaign, keeperOf, regionOf } from './expedition.ts';
import { createKingdom, HERO_JOINS, parseKingdom, serializeKingdom } from './kingdom.ts';
import { STAGE_COUNT } from './stages.ts';

const T0 = 1_700_000_000_000;
const legacy = (o: object) => JSON.stringify({ version: 1, gold: 0, cleared: [], questClaimed: [], visitors: [], seenVisitors: [], training: 0, selectedHero: 'mage', difficulty: 'standard', processedRuns: [], ...o });

test('expedition: every stage has a village, two regions split the ladder at the stage-6 wall', () => {
  assert.equal(EXPEDITION.length, STAGE_COUNT);
  EXPEDITION.forEach((s, i) => { assert.equal(s.stage, i + 1); assert.ok(s.name && s.story && s.boss); });
  assert.deepEqual([1, 5, 6, 10].map(regionOf), ['forest', 'forest', 'snow', 'snow']);
  assert.equal(REGIONS.snow.stages[0], 6);
  assert.equal(expeditionStage(5).boss, '고목왕');
  assert.equal(expeditionStage(10).boss, '서리군주');
  assert.equal(expeditionStage(99).stage, STAGE_COUNT);
});

test('expedition: playable companions arrive on the stage that unlocks them as heroes', () => {
  const at = (c: string) => EXPEDITION.find(s => s.visitor === c)!.stage;
  assert.equal(at('bron'), HERO_JOINS.bron);
  assert.equal(at('popo'), HERO_JOINS.bear);
  const visitors = EXPEDITION.filter(s => s.visitor).map(s => s.visitor);
  assert.equal(new Set(visitors).size, visitors.length, 'each companion arrives once');
  const keepers = Object.values(COMPANIONS).map(c => c.keeper);
  assert.equal(new Set(keepers).size, keepers.length, 'one keeper per building');
});

test('expedition: companions and keepers follow the stars; chapter news on 5 and 10', () => {
  const k = createKingdom(T0);
  assert.deepEqual(companionsOf(k), ['ian']);
  assert.equal(keeperOf(k, 'castle'), 'ian');
  assert.equal(keeperOf(k, 'forge'), null);
  k.stars[0] = 1; k.stars[1] = 2;
  assert.deepEqual(companionsOf(k), ['ian', 'riel', 'bron']);
  assert.equal(keeperOf(k, 'forge'), 'bron');
  assert.equal(firstClearNews(1).visitor, 'riel');
  assert.match(firstClearNews(5).chapter!.title, /청록의 숲/);
  assert.match(firstClearNews(10).chapter!.title, /서리산맥/);
  assert.equal(firstClearNews(7).chapter, undefined);
});

test('legacy import: cleared villages become stars up to the forest end, gold and training add, nothing lowers', () => {
  const k = createKingdom(T0);
  assert.equal(importLegacyCampaign(k, null), null);
  assert.equal(importLegacyCampaign(k, '{bad'), null);
  assert.equal(importLegacyCampaign(k, legacy({})), null, 'a save with no progress brings nothing');
  const all = importLegacyCampaign(k, legacy({ cleared: [1, 2, 3, 4, 5, 6, 7, 8], gold: 5000, training: 5, selectedHero: 'dwarf' }))!;
  assert.deepEqual(all.kingdom.stars, [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], `capped at stage ${LEGACY_STAR_CAP}`);
  assert.equal(all.kingdom.food, k.food + LEGACY_GOLD_CAP);
  assert.equal(all.kingdom.shards, k.shards + 15);
  assert.equal(all.kingdom.hero, 'bron');
  assert.deepEqual(all.kingdom.perks, k.perks, 'perks untouched');
  assert.equal(all.report.villages, 8);
  const two = importLegacyCampaign(k, legacy({ cleared: [1, 2], gold: 120 }))!;
  assert.deepEqual(two.kingdom.stars.slice(0, 3), [1, 1, 0]);
  const kept = { ...k, stars: [3, 2, 0, 0, 0, 0, 0, 0, 0, 0] };
  assert.deepEqual(importLegacyCampaign(kept, legacy({ cleared: [1, 2, 3] }))!.kingdom.stars.slice(0, 4), [3, 2, 1, 0]);
  assert.equal(importLegacyCampaign(k, legacy({ cleared: [1], selectedHero: 'dwarf' }))!.kingdom.hero, 'ranger', 'Bron needs his stage');
  // The imported kingdom survives the save parser (a reset here would wipe the player's kingdom).
  assert.deepEqual(parseKingdom(serializeKingdom(all.kingdom), T0), all.kingdom);
});
