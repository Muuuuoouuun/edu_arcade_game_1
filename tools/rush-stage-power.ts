// Recommended stage power (cycle 89): for each stage, the least step L on a balanced growth path at which the guard bot
// (ranger) wins at least 4 of seeds 1-8, and that kingdom's power with two stars per earlier stage. STAGE_POWER in
// src/rush/kingdom.ts is this column rounded down to 50; rerun after any balance change.
// Usage: node --experimental-strip-types tools/rush-stage-power.ts [stage ...]   (default: all stages; a few minutes)
import { createRush, stepRush } from '../src/rush/sim.ts';
import { guardBot } from '../src/rush/bot.ts';
import { STAGE_COUNT, stageDifficulty } from '../src/rush/stages.ts';
import { createKingdom, kingdomMods, kingdomPower, type Kingdom } from '../src/rush/kingdom.ts';

function growth(L: number): Kingdom {
  const k = createKingdom(0), castle = Math.min(5, 1 + Math.floor(L / 2)), perk = Math.min(castle, Math.floor(L / 2));
  return {
    ...k, castle, farm: castle, mill: castle,
    perks: { attack: perk, towerDiscount: perk, townHp: perk, forge: perk, vault: perk },
    heroLv: { ranger: Math.min(2 * castle, 1 + L), bron: 1, bear: 1 },
    talent: { ranger: Math.min(3, Math.floor(L / 3)), bron: 0, bear: 0 },
  };
}
const stages = process.argv.slice(2).map(Number).filter(n => n >= 1 && n <= STAGE_COUNT);
for (const stage of stages.length ? stages : Array.from({ length: STAGE_COUNT }, (_, i) => i + 1)) {
  const tried: string[] = [];
  for (let L = 0; L <= 10; L++) {
    const k = growth(L), mods = kingdomMods(k);
    const wins = [1, 2, 3, 4, 5, 6, 7, 8].filter(seed => {
      const s = createRush(seed, mods, stageDifficulty(stage), 'ranger');
      while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < 60 * 60 * 8) stepRush(s, guardBot(s));
      return s.phase === 'won';
    }).length;
    const power = kingdomPower({ ...k, stars: k.stars.map((_, i) => (i < stage - 1 ? 2 : 0)) });
    tried.push(`L${L} ${wins}/8`);
    if (wins >= 4) { console.log(`stage ${stage}: L${L}, power ${power}, recommended ${Math.floor(power / 50) * 50} (${tried.join(', ')})`); break; }
  }
}
