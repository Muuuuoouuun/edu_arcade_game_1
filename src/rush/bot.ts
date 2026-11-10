// Scripted players for balance checks and the in-browser demo. They only issue Commands, like a person would.
import { PADS, TOWN, type TowerBranch, type Vec } from './data.ts';
import { bestSuperPoint, heroAlive, heroDef, nearestEnemy, padCost, superReady, type Command, type RushState } from './sim.ts';

const GUARD: Vec = { x: 0, z: 2.5 };
const toward = (from: Vec, to: Vec): Vec => {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  return d < 0.25 ? { x: 0, z: 0 } : { x: dx / d, z: dz / d };
};

const BOT_BRANCH: readonly TowerBranch[] = ['fire', 'fire', 'frost', 'frost'];

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
  const def = heroDef(s), melee = def.attack === 'swing';
  // A melee hero looks further out and closes in; a ranged hero keeps its distance.
  const threat = nearestEnemy(s, h, melee ? 7 : def.range);
  const coin = s.coins.reduce<{ c: Vec | null; d: number }>((best, c) => {
    const d = Math.hypot(c.x - h.x, c.z - h.z);
    return d < best.d && Math.hypot(c.x - TOWN.x, c.z - TOWN.z) < 16 ? { c, d } : best;
  }, { c: null, d: 7 }).c;

  if (padGoal >= 0 && (!threat || s.phase === 'prep')) {
    cmd.move = toward(h, PADS[padGoal]);
    // Lv2 choice: fire on the inner pads where lanes merge into a crowd, frost on the outer pads that meet them first.
    cmd.build = s.towers[padGoal]?.level === 0 ? BOT_BRANCH[padGoal] : true;
  } else if (coin && (!threat || Math.hypot(coin.x - h.x, coin.z - h.z) < 3)) {
    cmd.move = toward(h, coin);
  } else if (threat) {
    const d = Math.hypot(threat.x - h.x, threat.z - h.z);
    // Melee: close in, but stay leashed to the gate so the hero is not surrounded far from the towers.
    if (melee) cmd.move = Math.hypot(threat.x - GUARD.x, threat.z - GUARD.z) > 8 ? toward(h, GUARD) : d > def.range * 0.8 ? toward(h, threat) : { x: 0, z: 0 };
    // Keep a little distance from melee threats; otherwise hold the guard line.
    else cmd.move = d < 3 ? toward(threat, h) : toward(h, GUARD);
  } else {
    cmd.move = toward(h, GUARD);
  }
  if (threat && (!melee || Math.hypot(threat.x - h.x, threat.z - h.z) <= def.range + 0.6)) cmd.fire = 'auto';
  if (superReady(s)) {
    if (melee) {
      const near = s.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= def.superRadius).length;
      if (near >= 3) cmd.super = 'auto';
    } else {
      const point = bestSuperPoint(s);
      if (point) cmd.super = { x: point.x - h.x, z: point.z - h.z };
    }
  }
  if (s.phase === 'prep' && padGoal < 0 && s.prepT < 9) cmd.startWave = true;
  return cmd;
}

/** Does nothing: the town must fall without a player. */
export const idleBot = (): Command => ({});
