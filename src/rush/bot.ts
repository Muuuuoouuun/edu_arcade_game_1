// Scripted players for balance checks and the in-browser demo. They only issue Commands, like a person would.
import { BARRICADE, BARRICADES, HOME_PADS, PADS, STEP, TOWN, type TowerBranch, type Vec } from './data.ts';
import { BARRICADE_FRAMES, barricadeMaxHp, barricadeOrder, barricadeStanding, bestSuperPoint, heroAlive, heroDef, nearestEnemy, padCost, siteNear, superReady, type Command, type RushState, type Site } from './sim.ts';

const GUARD: Vec = { x: 0, z: 2.5 };
const toward = (from: Vec, to: Vec): Vec => {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  return d < 0.25 ? { x: 0, z: 0 } : { x: dx / d, z: dz / d };
};

/** `toward`, but around any standing barricade in the way (a coin dropped in front of one, a site beyond it). In the
 * barricade's own frame the box grows by the hero's radius; a straight walk that would cross it heads for the nearer
 * end instead, on the hero's side. `except` = the site being walked to (reaching its box is the goal). */
function around(s: RushState, from: Vec, to: Vec, except = -1): Vec {
  const dir = toward(from, to);
  if (dir.x === 0 && dir.z === 0) return dir;
  const m = heroDef(s).radius + 0.1, hu = BARRICADE.length / 2 + m, hd = BARRICADE.depth / 2 + m;
  for (let i = 0; i < BARRICADES.length; i++) {
    if (i === except || !barricadeStanding(s, i)) continue;
    const b = BARRICADES[i], f = BARRICADE_FRAMES[i];
    const local = (p: Vec) => ({ u: (p.x - b.x) * f.u.x + (p.z - b.z) * f.u.z, d: (p.x - b.x) * f.d.x + (p.z - b.z) * f.d.z });
    const p = local(from), q = local(to);
    // Slab test: does the segment p→q cross the grown box?
    let t0 = 0, t1 = 1;
    for (const [a, c, h] of [[p.u, q.u, hu], [p.d, q.d, hd]] as const) {
      const k = c - a;
      if (Math.abs(k) < 1e-9) { if (Math.abs(a) > h) { t0 = 2; break; } continue; }
      let ta = (-h - a) / k, tb = (h - a) / k;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (t0 > t1) continue;
    // Head for the corner of the nearer end on the hero's own side; once beside that end, for its corner on the goal's side.
    const endU = (p.u + q.u >= 0 ? 1 : -1) * (hu + 0.2), beside = Math.abs(p.u) >= hu;
    const sideD = ((beside ? q.d : p.d) >= 0 ? 1 : -1) * (hd + 0.2);
    return toward(from, { x: b.x + f.u.x * endU + f.d.x * sideD, z: b.z + f.u.z * endU + f.d.z * sideD });
  }
  return dir;
}

const BOT_BRANCH: readonly TowerBranch[] = ['fire', 'frost', 'fire', 'frost'];
/** Barricades: a site is bought, spiked or repaired (cheapest first, like towers) once `after[site]` towers stand and at
 * least `spikesAfter` Lv2 towers for spikes, and only from gold beyond the next tower buy (`reserve` times its cost); a
 * standing one is repaired below `repairBelow` of its health, during a wave too when `repairInWave` (in a lull: no threat
 * in range). `weight` scales their cost in the comparison. A melee hero (`melee` false) holds the line himself and buys
 * none: behind a barricade his swing barely reaches, and in front of it he blocks the gap it was built to close. */
export const BOT_WALLS = { after: [2, 2, 2] as number[], spikesAfter: 0, weight: 1, repairBelow: 0.5, repairInWave: true, reserve: 1, melee: false };

type Goal = { at: Vec; site: Site; build: Command['build'] };
/** Spend: the cheapest affordable build, upgrade or repair, nearest first (barricades as BOT_WALLS allows), or null. */
function spendGoal(s: RushState): Goal | null {
  const h = s.hero;
  let goal: Goal | null = null, best = Infinity;
  // The bot keeps to the home pads (its measured build order); the outposts are a choice for a player.
  for (let i = 0; i < HOME_PADS; i++) {
    const pad = PADS[i], cost = padCost(s, i);
    if (cost === null || cost > s.gold) continue;
    const score = cost * 10 + Math.hypot(pad.x - h.x, pad.z - h.z);
    // Lv2 choice: fire on the inner pads where lanes merge into a crowd, frost on the outer pads that meet them first.
    if (score < best) { best = score; goal = { at: pad, site: { kind: 'tower', i }, build: s.towers[i]?.level === 0 ? BOT_BRANCH[i] : true }; }
  }
  if (heroDef(s).attack === 'swing' && !BOT_WALLS.melee) return goal;
  const built = s.towers.filter(Boolean).length, strong = s.towers.filter(t => t && t.level >= 1).length;
  // Towers come first: a barricade is paid only from gold beyond the next tower buy (`reserve` times its cost).
  const next = Math.min(...PADS.slice(0, HOME_PADS).map((_, i) => padCost(s, i) ?? Infinity)), keep = Number.isFinite(next) ? next * BOT_WALLS.reserve : 0;
  for (let i = 0; i < BARRICADES.length; i++) {
    const at = BARRICADES[i], order = barricadeOrder(s, i), b = s.barricades[i];
    if (!order || order.cost + keep > s.gold || built < BOT_WALLS.after[i]) continue;
    if (order.action === 'upgrade' && strong < BOT_WALLS.spikesAfter) continue;
    if (order.action === 'repair' && (b!.hp > BOT_WALLS.repairBelow * barricadeMaxHp(s, b!.level) || (s.phase !== 'prep' && !BOT_WALLS.repairInWave))) continue;
    const score = order.cost * 10 * BOT_WALLS.weight + Math.hypot(at.x - h.x, at.z - h.z);
    if (score < best) { best = score; goal = { at, site: { kind: 'barricade', i }, build: true }; }
  }
  return goal;
}

/** A competent-but-plain player: guards the gate, shoots with auto-aim, collects coins, builds and upgrades towers. */
export function guardBot(s: RushState): Command {
  if (!heroAlive(s)) return {};
  const h = s.hero, cmd: Command = {};
  // Spend: cheapest affordable build/upgrade, nearest first.
  const goal = spendGoal(s);
  const def = heroDef(s), melee = def.attack === 'swing';
  // A melee hero looks further out and closes in; a ranged hero keeps its distance.
  const threat = nearestEnemy(s, h, melee ? 7 : def.range);
  const coin = s.coins.reduce<{ c: Vec | null; d: number }>((best, c) => {
    const d = Math.hypot(c.x - h.x, c.z - h.z);
    return d < best.d && Math.hypot(c.x - TOWN.x, c.z - TOWN.z) < 16 ? { c, d } : best;
  }, { c: null, d: 7 }).c;

  if (goal && (!threat || s.phase === 'prep')) {
    cmd.move = around(s, h, goal.at, goal.site.kind === 'barricade' ? goal.site.i : -1);
    // Build is held all the way there, so passing another pad on the way may buy that first (the bot always has).
    // Not so for a barricade site it walks past: that would buy a barricade it did not choose.
    const speed = def.speed * STEP, here = siteNear({ x: h.x + cmd.move.x * speed, z: h.z + cmd.move.z * speed });
    if (here?.kind !== 'barricade' || (goal.site.kind === 'barricade' && here.i === goal.site.i)) cmd.build = goal.build;
  } else if (coin && (!threat || Math.hypot(coin.x - h.x, coin.z - h.z) < 3)) {
    cmd.move = around(s, h, coin);
  } else if (threat) {
    const d = Math.hypot(threat.x - h.x, threat.z - h.z);
    // Melee: close in, but stay leashed to the gate so the hero is not surrounded far from the towers.
    if (melee) cmd.move = Math.hypot(threat.x - GUARD.x, threat.z - GUARD.z) > 8 ? around(s, h, GUARD) : d > def.range * 0.8 ? toward(h, threat) : { x: 0, z: 0 };
    // Keep a little distance from melee threats; otherwise hold the guard line.
    else cmd.move = d < 3 ? toward(threat, h) : around(s, h, GUARD);
  } else {
    cmd.move = around(s, h, GUARD);
  }
  if (threat && (!melee || Math.hypot(threat.x - h.x, threat.z - h.z) <= def.range + 0.6)) cmd.fire = 'auto';
  // Ward first (cycle 90): a ranged hero breaks the nearest ward in range so the towers bite again.
  if (!melee) {
    let ward: (typeof s.enemies)[number] | null = null, best = def.range;
    for (const e of s.enemies) { const d = Math.hypot(e.x - h.x, e.z - h.z); if (e.hp > 0 && (e.wardT ?? 0) > 0 && d <= best) { best = d; ward = e; } }
    if (ward) cmd.fire = { x: ward.x - h.x, z: ward.z - h.z };
  }
  if (superReady(s)) {
    if (melee) {
      const near = s.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - h.x, e.z - h.z) <= def.superRadius).length;
      if (near >= 3) cmd.super = 'auto';
    } else {
      const point = bestSuperPoint(s);
      if (point) cmd.super = { x: point.x - h.x, z: point.z - h.z };
    }
  }
  if (s.phase === 'prep' && !goal && s.prepT < 9) cmd.startWave = true;
  return cmd;
}

/** Does nothing: the town must fall without a player. */
export const idleBot = (): Command => ({});
