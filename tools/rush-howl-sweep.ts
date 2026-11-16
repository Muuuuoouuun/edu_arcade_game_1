// Frost lord's howl tuning (2026-11-14): for each (barricade share, tower freeze seconds), wins out of 8 on stage 10 for
// the pillar test's maxed kingdom and for growth steps L6-L8 of tools/rush-stage-power.ts. The setting must keep the
// maxed kingdom at 6+ wins (stages.test.ts) and put the recommended step above stage 9's (L6).
// Usage: node --experimental-strip-types tools/rush-howl-sweep.ts "1,4" "0.5,6" ...
//   Each argument: barricade share, tower freeze s[, stage-10 enemy count x, enemy health x, enemy damage x, hero freeze s] (cycle 99:
//   the last three try a finale-only difficulty on top of stages.ts, default 1).
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
let finale = { count: 1, hp: 1, damage: 1 };
const wins = (mods: RushMods) => [1, 2, 3, 4, 5, 6, 7, 8].filter(seed => {
  const d = stageDifficulty(10);
  const s = createRush(seed, mods, { ...d, enemyCount: d.enemyCount * finale.count, enemyHp: d.enemyHp * finale.hp, enemyDamage: d.enemyDamage * finale.damage }, 'ranger');
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < 60 * 60 * 8) stepRush(s, guardBot(s));
  return s.phase === 'won';
}).length;
for (const arg of process.argv.slice(2)) {
  const [share, freeze, count = 1, hp = 1, damage = 1, hero = 0] = arg.split(',').map(Number);
  Object.assign(FROST_HOWL as { barricade: number; towerFreeze: number; heroFreeze: number }, { barricade: share, towerFreeze: freeze, heroFreeze: hero });
  finale = { count, hp, damage };
  console.log(`barricade ${share}, freeze ${freeze}s, finale count x${count} hp x${hp} damage x${damage}, hero freeze ${hero}s: maxed ${wins(MAXED)}/8, L6 ${wins(kingdomMods(growth(6)))}/8, L7 ${wins(kingdomMods(growth(7)))}/8, L8 ${wins(kingdomMods(growth(8)))}/8`);
}
