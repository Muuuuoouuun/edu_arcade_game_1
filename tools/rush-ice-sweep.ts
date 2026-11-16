// Enemy pace on the snow region's ice (cycle 104): for each ZONE.iceSpeed candidate, the numbers the progression pillar
// tests (stages.test.ts) check, so a value is only taken if every pillar still holds:
//   maxed ranger, stage 10, seeds 1-8: 6+ wins; maxed Bron, stage 10, seeds 1-2: both won;
//   hero training per hero: stage 7-8 wins over seeds 1-6, Lv10 at least 3 more than Lv1; Lv10 alone loses stage 10 seeds 1-4.
// Usage: node --experimental-strip-types tools/rush-ice-sweep.ts 1 1.1 1.25
//   --wide=N: instead, stage 10 wins over seeds 1-N (the pillar checks only 8 and 2 seeds, where single seeds flip with
//   any rule change) of the maxed ranger, the maxed Bron and the ranger growth steps L6-L8 of tools/rush-stage-power.ts.
//   --freeze=S also sets the frost lord's hero freeze (FROST_HOWL.heroFreeze) for the run.
import { createRush, NO_MODS, stepRush, type RushMods } from '../src/rush/sim.ts';
import { guardBot } from '../src/rush/bot.ts';
import { stageDifficulty } from '../src/rush/stages.ts';
import { createKingdom, heroGrowth, kingdomMods, type Kingdom } from '../src/rush/kingdom.ts';
import { FROST_HOWL } from '../src/rush/data.ts';
import { ZONE } from '../src/rush/maps.ts';

type Hero = 'ranger' | 'bron' | 'bear';
const MAXED: RushMods = { damage: 1.4, towerCost: 0.6, townHp: 1.5, heroHp: 1, forge: 5 };
const won = (seed: number, stage: number, hero: Hero, mods: RushMods) => {
  const s = createRush(seed, mods, stageDifficulty(stage), hero);
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < 60 * 60 * 8) stepRush(s, guardBot(s));
  return s.phase === 'won';
};
const lv = (n: number): RushMods => { const g = heroGrowth(n); return { ...NO_MODS, damage: g.damage, heroHp: g.hp }; };
const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
/** Growth step L of the balanced path (same as tools/rush-howl-sweep.ts and tools/rush-stage-power.ts). */
function growth(L: number): Kingdom {
  const k = createKingdom(0), castle = Math.min(5, 1 + Math.floor(L / 2)), perk = Math.min(castle, Math.floor(L / 2));
  return { ...k, castle, farm: castle, mill: castle, perks: { attack: perk, towerDiscount: perk, townHp: perk, forge: perk, vault: perk },
    heroLv: { ranger: Math.min(2 * castle, 1 + L), bron: 1, bear: 1 }, talent: { ranger: Math.min(3, Math.floor(L / 3)), bron: 0, bear: 0 } };
}
const freeze = process.argv.find(a => a.startsWith('--freeze='));
if (freeze) (FROST_HOWL as { heroFreeze: number }).heroFreeze = Number(freeze.slice(9));
const wide = Number(process.argv.find(a => a.startsWith('--wide='))?.slice(7) ?? 0);
for (const arg of process.argv.slice(2).filter(a => !a.startsWith('--'))) {
  (ZONE as { iceSpeed: number }).iceSpeed = Number(arg);
  if (wide) {
    const rate = (hero: Hero, mods: RushMods) => { const w = seeds(wide).filter(seed => won(seed, 10, hero, mods)).length; return `${w}/${wide} (${Math.round(100 * w / wide)}%)`; };
    console.log(`iceSpeed ${arg}, hero freeze ${FROST_HOWL.heroFreeze}s, stage 10: maxed ranger ${rate('ranger', MAXED)}, maxed bron ${rate('bron', MAXED)}, ` +
      [6, 7, 8].map(L => `L${L} ${rate('ranger', kingdomMods(growth(L)))}`).join(', '));
    continue;
  }
  const maxed = seeds(8).filter(seed => won(seed, 10, 'ranger', MAXED));
  const bron = seeds(2).filter(seed => won(seed, 10, 'bron', MAXED));
  const training = (['ranger', 'bron', 'bear'] as const).map(hero => {
    const w = (n: number) => [7, 8].reduce((sum, stage) => sum + seeds(6).filter(seed => won(seed, stage, hero, lv(n))).length, 0);
    const low = w(1), high = w(10), alone = seeds(4).filter(seed => won(seed, 10, hero, lv(10))).length;
    return { hero, low, high, alone, ok: high >= low + 3 && alone === 0 };
  });
  const ok = maxed.length >= 6 && bron.length === 2 && training.every(t => t.ok);
  console.log(`iceSpeed ${arg}: maxed ranger s10 ${maxed.length}/8 [${maxed}] · maxed bron s10 ${bron.length}/2 · training ${training.map(t => `${t.hero} ${t.low}->${t.high} alone ${t.alone}`).join(', ')} · pillars ${ok ? 'HOLD' : 'BROKEN'}`);
}
