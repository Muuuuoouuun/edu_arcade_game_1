// Scripted players for balance checks and the in-browser demo. They only issue Commands, like a person would.
import { HERO, PADS, TOWN, type Vec } from './data.ts';
import { bestSuperPoint, heroAlive, nearestEnemy, padCost, superReady, type Command, type RushState } from './sim.ts';

const GUARD: Vec = { x: 0, z: 2.5 };
const toward = (from: Vec, to: Vec): Vec => {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  return d < 0.25 ? { x: 0, z: 0 } : { x: dx / d, z: dz / d };
};

/** A competent-but-plain player: guards the gate, shoots with auto-aim, collects coins, builds and upgrades towers. */
export function guardBot(s: RushState): Command {
  if (!heroAlive(s)) return {};
  const h = s.hero, cmd: Command = {};
  // Spend: cheapest affordable build/upgrade, nearest first.
  let padGoal = -1, padBest = Infinity;
  PADS.forEach((pad, i) => {
    const cost = padCost(s, i);
    if (cost === null || cost > s.gold) return;
    const score = cost * 10 + Math.hypot(pad.x - h.x, pad.z - h.z);
    if (score < padBest) { padBest = score; padGoal = i; }
  });
  const threat = nearestEnemy(s, h, HERO.range);
  const coin = s.coins.reduce<{ c: Vec | null; d: number }>((best, c) => {
    const d = Math.hypot(c.x - h.x, c.z - h.z);
    return d < best.d && Math.hypot(c.x - TOWN.x, c.z - TOWN.z) < 16 ? { c, d } : best;
  }, { c: null, d: 7 }).c;

  if (padGoal >= 0 && (!threat || s.phase === 'prep')) {
    cmd.move = toward(h, PADS[padGoal]);
    cmd.build = true;
  } else if (coin && (!threat || Math.hypot(coin.x - h.x, coin.z - h.z) < 3)) {
    cmd.move = toward(h, coin);
  } else if (threat) {
    // Keep a little distance from melee threats; otherwise hold the guard line.
    const d = Math.hypot(threat.x - h.x, threat.z - h.z);
    cmd.move = d < 3 ? toward(threat, h) : toward(h, GUARD);
  } else {
    cmd.move = toward(h, GUARD);
  }
  if (threat) cmd.fire = 'auto';
  if (superReady(s)) {
    const point = bestSuperPoint(s);
    if (point) cmd.super = { x: point.x - h.x, z: point.z - h.z };
  }
  if (s.phase === 'prep' && padGoal < 0 && s.prepT < 9) cmd.startWave = true;
  return cmd;
}

/** Does nothing: the town must fall without a player. */
export const idleBot = (): Command => ({});
