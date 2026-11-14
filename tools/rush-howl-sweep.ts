// Frost lord's howl tuning (2026-11-14): for each (barricade share, tower freeze seconds), wins out of 8 on stage 10 for
// the pillar test's maxed kingdom and for growth steps L6-L8 of tools/rush-stage-power.ts. The setting must keep the
// maxed kingdom at 6+ wins (stages.test.ts) and put the recommended step above stage 9's (L6).
// Usage: node --experimental-strip-types tools/rush-howl-sweep.ts "1,4" "0.5,6" ...
import { createRush, stepRush, type RushMods } from '../src/rush/sim.ts';
import { guardBot } from '../src/rush/bot.ts';
import { stageDifficulty } from '../src/rush/stages.ts';
import { createKingdom, kingdomMods, type Kingdom } from '../src/rush/kingdom.ts';
import { FROST_HOWL } from '../src/rush/data.ts';

const MAXED: RushMods = { damage: 1.4, towerCost: 0.6, townHp: 1.5, heroHp: 1, forge: 5 };
function growth(L: number): Kingdom {
  const k = createKingdom(0), castle = Math.min(5, 1 + Math.floor(L / 2)), perk = Math.min(castle, Math.floor(L / 2));
  return { ...k, castle, farm: castle, mill: castle, perks: { attack: perk, towerDiscount: perk, townHp: perk, forge: perk, vault: perk },
    heroLv: { ranger: Math.min(2 * castle, 1 + L), bron: 1, bear: 1 }, talent: { ranger: Math.min(3, Math.floor(L / 3)), bron: 0, bear: 0 } };
}
const wins = (mods: RushMods) => [1, 2, 3, 4, 5, 6, 7, 8].filter(seed => {
  const s = createRush(seed, mods, stageDifficulty(10), 'ranger');
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < 60 * 60 * 8) stepRush(s, guardBot(s));
  return s.phase === 'won';
}).length;
for (const arg of process.argv.slice(2)) {
  const [share, freeze] = arg.split(',').map(Number);
  Object.assign(FROST_HOWL as { barricade: number; towerFreeze: number }, { barricade: share, towerFreeze: freeze });
  console.log(`barricade ${share}, freeze ${freeze}s: maxed ${wins(MAXED)}/8, L6 ${wins(kingdomMods(growth(6)))}/8, L7 ${wins(kingdomMods(growth(7)))}/8, L8 ${wins(kingdomMods(growth(8)))}/8`);
}
