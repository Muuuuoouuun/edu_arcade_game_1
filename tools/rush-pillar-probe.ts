// Probe for the hero-training pillar test (stages.test.ts): per hero, stage 7-8 wins at hero Lv1 and Lv10 over seeds
// 1-6, and stage 10 wins at Lv10 for seeds 1-4 (must be none). Rerun after a map or balance change.
// Usage: node --experimental-strip-types tools/rush-pillar-probe.ts
import { createRush, NO_MODS, stepRush, type RushMods } from '../src/rush/sim.ts';
import { guardBot } from '../src/rush/bot.ts';
import { stageDifficulty } from '../src/rush/stages.ts';
import { heroGrowth } from '../src/rush/kingdom.ts';
import { MAPS, type MapLayout } from '../src/rush/maps.ts';
import { CRATE } from '../src/rush/data.ts';

/** --map=old: the single layout every stage had before the regions, as a reference. --map=forest|snow: force one. */
const OLD: MapLayout = {
  id: 'forest', name: 'old', stage: 0, signature: '-', props: [], stream: null, ice: [],
  walls: [[-4, -20, 2, 1], [4, -20, 2, 1], [-4.5, -12, 3, 1], [4.5, -12, 3, 1], [-3.2, -3.5, 1, 1.2], [3.2, -3.5, 1, 1.2], [-9.5, 3, 1.2, 4], [9.5, 3, 1.2, 4]].map(([x, z, w, d]) => ({ x, z, w, d, kind: 'stone' as const })),
  bushes: [{ x: -6, z: -7, w: 2.4, d: 2 }, { x: 6, z: -7, w: 2.4, d: 2 }, { x: -3.6, z: 1.5, w: 2, d: 1.6 }, { x: 3.6, z: 1.5, w: 2, d: 1.6 }],
  crates: [{ x: -2.2, z: -9 }, { x: 2.2, z: -9 }, { x: -8.5, z: -16 }, { x: 8.5, z: -16 }],
};
const arg = process.argv.find(a => a.startsWith('--map='))?.slice(6);
const forced = arg === 'old' ? OLD : arg === 'forest' || arg === 'snow' ? MAPS[arg] : null;
const play = (seed: number, stage: number, hero: 'ranger' | 'bron' | 'bear', mods: RushMods) => {
  const s = createRush(seed, mods, stageDifficulty(stage), hero);
  if (forced) { s.map = forced; s.crates = forced.crates.map((c, i) => ({ id: 1 + i, x: c.x, z: c.z, hp: CRATE.hp, ...(c.gold ? { gold: c.gold } : {}) })); s.nextId = 1 + forced.crates.length; }
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < 60 * 60 * 8) stepRush(s, guardBot(s));
  return s.phase === 'won';
};
const lv = (n: number): RushMods => { const g = heroGrowth(n); return { ...NO_MODS, damage: g.damage, heroHp: g.hp }; };
for (const hero of ['ranger', 'bron', 'bear'] as const) {
  const row = (n: number) => [7, 8].map(stage => [1, 2, 3, 4, 5, 6].filter(seed => play(seed, stage, hero, lv(n))).length);
  console.log(hero, 'Lv1 [s7,s8]', row(1), 'Lv10', row(10), 'stage10 Lv10 wins', [1, 2, 3, 4].filter(seed => play(seed, 10, hero, lv(10))));
}
