// Defence models (defence lane, 2026-11-13): towers per level and branch, barricades per level and damage state, build
// sites and the "can upgrade" chevron. Plain coloured primitives that render.ts bakes into one vertex-coloured mesh plus an
// inverted-hull outline, like every other prop (docs/rush/art-direction.md). Shapes are ours; the reference games
// (Kingshot, Clash of Clans) only lend the principle that a defence's level and type read from its silhouette.
import { BoxGeometry, ConeGeometry, CylinderGeometry, OctahedronGeometry, SphereGeometry } from 'three';
import type { TowerBranch } from './data.ts';
import { PAL, type Part } from './look.ts';

/** Colours shared by the defence kits. Stone matches the cover walls (look.ts wallParts); fire is ember red to yellow,
 * frost a deep-to-pale ice blue (deep enough to hold on the snow ground). */
export const DEF = {
  wood: PAL.wood, woodDark: PAL.woodDark, plank: 0xc98a4a, tip: 0xe0b077,
  stone: 0xb4b6a0, stoneAlt: 0x9fa995, stoneFoot: 0x596e67, stoneCap: 0xd7d2b3, mortar: 0x687a72,
  iron: 0x4a4458, steel: 0xc9ced8, earth: 0x7a5a3a,
  ember: 0xd8402a, flame: 0xff7a2f, flameCore: 0xffd23f,
  iceDeep: 0x2f8fe0, ice: 0x6cc8ff, icePale: 0xd8f6ff,
} as const;
/** Branch colour used by trims, shots and effects. */
export const BRANCH_TRIM: Record<TowerBranch, number> = { fire: DEF.flame, frost: DEF.ice };

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const cyl = (top: number, bottom: number, h: number, seg = 8) => new CylinderGeometry(top, bottom, h, seg);
const cone = (r: number, h: number, seg = 6) => new ConeGeometry(r, h, seg);

export type TowerKit = { base: Part[]; head: Part[]; headY: number; height: number };

/** A brazier flame: an iron cup holding a wide orange blaze, a tall yellow core and two red tongues leaning out
 * (cones, so the top-down battle camera sees an orange-and-yellow star, not a red spike). */
function flame(parts: Part[], x: number, y: number, z: number, k = 1) {
  const out = Math.atan2(z, x);
  parts.push(
    { geo: cyl(0.2 * k, 0.13 * k, 0.16 * k, 7), color: DEF.iron, at: [x, y + 0.08 * k, z] },
    { geo: cone(0.22 * k, 0.46 * k, 7), color: DEF.flame, at: [x, y + 0.36 * k, z] },
    { geo: cone(0.12 * k, 0.5 * k, 6), color: DEF.flameCore, at: [x, y + 0.46 * k, z], rot: [0, 0.4, 0] },
    { geo: cone(0.08 * k, 0.3 * k, 5), color: DEF.ember, at: [x + Math.cos(out) * 0.13 * k, y + 0.3 * k, z + Math.sin(out) * 0.13 * k], rot: [Math.sin(out) * 0.5, 0, -Math.cos(out) * 0.5] },
    { geo: cone(0.07 * k, 0.26 * k, 5), color: DEF.ember, at: [x - Math.sin(out) * 0.13 * k, y + 0.28 * k, z + Math.cos(out) * 0.13 * k], rot: [Math.cos(out) * 0.45, 0, Math.sin(out) * 0.45] },
  );
}
/** Parapet ring per branch: wood or stone plain, black iron with a ring of glowing coals for fire, ice for frost. */
function parapet(parts: Part[], branch: TowerBranch | undefined, plain: number, rTop: number, rBottom: number, h: number, y: number) {
  const side = branch === 'fire' ? DEF.iron : branch === 'frost' ? DEF.ice : plain;
  parts.push({ geo: cyl(rTop, rBottom, h), color: side, at: [0, y, 0] });
  if (branch) parts.push({ geo: cyl(rTop - 0.08, rTop - 0.08, 0.04), color: branch === 'fire' ? DEF.flame : DEF.icePale, at: [0, y + h / 2 + 0.01, 0] });
}
/** An ice crystal cluster: one tall deep-blue shard with two pale ones leaning out. */
function crystal(parts: Part[], x: number, y: number, z: number, k = 1, lean = 0) {
  parts.push(
    { geo: new OctahedronGeometry(0.2 * k), color: DEF.iceDeep, at: [x, y + 0.34 * k, z], scale: [0.85, 2.3, 0.85], rot: [0, 0.4, lean] },
    { geo: new OctahedronGeometry(0.14 * k), color: DEF.icePale, at: [x + 0.13 * k, y + 0.2 * k, z + 0.07 * k], scale: [0.8, 1.9, 0.8], rot: [0.3, 0, -0.55] },
    { geo: new OctahedronGeometry(0.13 * k), color: DEF.ice, at: [x - 0.13 * k, y + 0.18 * k, z - 0.06 * k], scale: [0.8, 1.8, 0.8], rot: [-0.3, 0, 0.55] },
  );
}
/** Gold level studs on the camera side (+z): one per level. */
function studs(parts: Part[], level: number, y: number, z: number) {
  for (let i = 0; i <= level; i++) parts.push({ geo: new OctahedronGeometry(0.11), color: PAL.gold, at: [(i - level / 2) * 0.28, y, z] });
}
/** The crossbow head (front = +x, rotates toward the target). `k` scales it per level; Lv3 has a second, upper bow. */
function crossbow(level: number, branch?: TowerBranch): Part[] {
  const k = [1, 1.22, 1.4][level], trim = branch ? BRANCH_TRIM[branch] : PAL.ally;
  const tipColor = branch === 'fire' ? DEF.flame : branch === 'frost' ? DEF.icePale : DEF.steel;
  const parts: Part[] = [
    { geo: box(0.95 * k, 0.18 * k, 0.24 * k), color: DEF.woodDark, at: [0.14 * k, 0, 0] },
    { geo: box(0.2 * k, 0.16 * k, 1.2 * k), color: trim, at: [0.5 * k, 0, 0] },
    { geo: box(0.07, 0.07, 1.1 * k), color: DEF.woodDark, at: [0.36 * k, 0.03, 0] },
    { geo: box(0.85 * k, 0.07, 0.07), color: 0xfff1a8, at: [0.42 * k, 0.13 * k, 0] },
    { geo: cone(0.09 * k, 0.24 * k, 5), color: tipColor, at: [0.92 * k, 0.13 * k, 0], rot: [0, 0, -Math.PI / 2] },
  ];
  if (level >= 2) parts.push(
    { geo: box(0.16 * k, 0.12 * k, 1.0 * k), color: trim, at: [0.42 * k, 0.26 * k, 0] },
    { geo: box(0.7 * k, 0.06, 0.06), color: 0xfff1a8, at: [0.4 * k, 0.33 * k, 0] },
    { geo: cone(0.08 * k, 0.2 * k, 5), color: tipColor, at: [0.82 * k, 0.33 * k, 0], rot: [0, 0, -Math.PI / 2] },
  );
  return parts;
}

/** Lv1 wooden crossbow tower; Lv2 stone tower with a bigger crossbow and the branch crown (fire braziers, frost
 * crystals); Lv3 tall two-tier stone tower with hanging banners, a roofed back turret and a double crossbow. */
export function towerParts(level: number, branch?: TowerBranch): TowerKit {
  const base: Part[] = [];
  const trim = branch ? BRANCH_TRIM[branch] : PAL.ally;
  if (level === 0) {
    const top = 1.3;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      base.push({ geo: box(0.17, top, 0.17), color: DEF.woodDark, at: [x * 0.4, top / 2, z * 0.4], rot: [z * 0.06, 0, -x * 0.06] });
    }
    // X braces on the camera side and the sides, a plank floor with a rail, a mount post, a team pennant.
    for (const s of [-1, 1]) {
      base.push({ geo: box(0.08, 1.1, 0.06), color: DEF.wood, at: [0, 0.62, 0.42], rot: [0, 0, s * 0.62] });
      base.push({ geo: box(0.06, 1.1, 0.08), color: DEF.wood, at: [s * 0.42, 0.62, 0], rot: [s * 0.62, 0, 0] });
    }
    base.push(
      { geo: box(1.1, 0.16, 1.1), color: DEF.plank, at: [0, top, 0] },
      { geo: box(1.16, 0.06, 1.16), color: DEF.woodDark, at: [0, top - 0.1, 0] },
      { geo: box(1.1, 0.16, 0.08), color: DEF.wood, at: [0, top + 0.18, 0.51] },
      { geo: box(1.1, 0.16, 0.08), color: DEF.wood, at: [0, top + 0.18, -0.51] },
      { geo: box(0.08, 0.16, 1.1), color: DEF.wood, at: [0.51, top + 0.18, 0] },
      { geo: box(0.08, 0.16, 1.1), color: DEF.wood, at: [-0.51, top + 0.18, 0] },
      { geo: cyl(0.12, 0.15, 0.3, 6), color: DEF.woodDark, at: [0, top + 0.2, 0] },
      { geo: box(0.05, 0.95, 0.05), color: DEF.woodDark, at: [-0.5, top + 0.45, -0.5] },
      { geo: box(0.42, 0.26, 0.04), color: trim, at: [-0.28, top + 0.78, -0.5] },
    );
    studs(base, 0, top - 0.02, 0.6);
    return { base, head: crossbow(0, branch), headY: top + 0.42, height: top + 0.3 };
  }
  if (level === 1) {
    const top = 1.55;
    base.push(
      { geo: cyl(0.84, 0.9, 0.22), color: DEF.stoneFoot, at: [0, 0.11, 0] },
      { geo: cyl(0.62, 0.76, top - 0.1), color: DEF.stone, at: [0, 0.2 + (top - 0.1) / 2, 0] },
      { geo: cyl(0.7, 0.72, 0.12), color: DEF.stoneAlt, at: [0, 0.62, 0] },
      { geo: cyl(0.66, 0.68, 0.12), color: DEF.stoneAlt, at: [0, 1.08, 0] },
      { geo: cyl(0.67, 0.64, 0.16), color: trim, at: [0, top - 0.02, 0] },
      { geo: cyl(0.14, 0.18, 0.3, 6), color: DEF.woodDark, at: [0, top + 0.38, 0] },
      // A banner in the branch colour on the camera side.
      { geo: box(0.36, 0.56, 0.05), color: trim, at: [0, 0.96, 0.72], rot: [-0.08, 0, 0] },
      { geo: box(0.42, 0.07, 0.07), color: DEF.woodDark, at: [0, 1.26, 0.72] },
    );
    parapet(base, branch, DEF.wood, 0.86, 0.72, 0.24, top + 0.16);
    // Four crown seats on the parapet corners: braziers or crystals.
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, x = Math.cos(a) * 0.66, z = Math.sin(a) * 0.66;
      if (branch === 'fire') flame(base, x, top + 0.26, z, 1.05);
      else if (branch === 'frost') crystal(base, x, top + 0.24, z, 1.05, Math.cos(a) * 0.3);
      else base.push({ geo: box(0.26, 0.28, 0.26), color: DEF.stoneCap, at: [x, top + 0.42, z], rot: [0, a, 0] });
    }
    if (branch === 'frost') for (const x of [-0.42, -0.14, 0.14, 0.42]) base.push({ geo: cone(0.06, 0.26, 5), color: DEF.icePale, at: [x, top - 0.02, 0.76], rot: [Math.PI, 0, 0] });
    studs(base, 1, 0.4, 0.82);
    return { base, head: crossbow(1, branch), headY: top + 0.62, height: top + 0.3 };
  }
  // Lv3. The turret stands on the -x side (render.ts mirrors the base on the west pads so it faces the middle lane),
  // never straight north where it would hide the barricade line from the battle camera.
  const mid = 1.1, top = 2.2, tx = -0.6, tz = -0.18;
  base.push(
    { geo: cyl(0.96, 1.02, 0.24), color: DEF.stoneFoot, at: [0, 0.12, 0] },
    { geo: cyl(0.8, 0.9, mid - 0.2), color: DEF.stoneAlt, at: [0, 0.24 + (mid - 0.2) / 2, 0] },
    { geo: cyl(0.84, 0.84, 0.14), color: PAL.gold, at: [0, mid, 0] },
    { geo: cyl(0.66, 0.74, top - mid), color: DEF.stone, at: [0, mid + (top - mid) / 2, 0] },
    { geo: cyl(0.7, 0.7, 0.1), color: DEF.stoneAlt, at: [0, mid + 0.5, 0] },
    { geo: cyl(0.71, 0.68, 0.16), color: trim, at: [0, top - 0.02, 0] },
    { geo: cyl(0.16, 0.2, 0.3, 6), color: DEF.woodDark, at: [0, top + 0.4, 0] },
    // Side turret with a roof and a team pennant: the tall silhouette beside the head.
    { geo: cyl(0.24, 0.26, 0.8, 8), color: DEF.stone, at: [tx, top + 0.5, tz] },
    { geo: cone(0.36, 0.56, 8), color: trim, at: [tx, top + 1.18, tz] },
    { geo: box(0.04, 0.5, 0.04), color: DEF.woodDark, at: [tx, top + 1.66, tz] },
    { geo: box(0.42, 0.24, 0.04), color: PAL.ally, at: [tx - 0.22, top + 1.78, tz] },
  );
  parapet(base, branch, DEF.stoneCap, 0.94, 0.74, 0.26, top + 0.17);
  // Two long banners on the camera side, gold-tipped.
  for (const x of [-0.3, 0.3]) base.push(
    { geo: box(0.3, 0.86, 0.05), color: trim, at: [x, mid + 0.68, 0.74], rot: [-0.06, 0, 0] },
    { geo: cone(0.15, 0.2, 4), color: trim, at: [x, mid + 0.18, 0.74], rot: [Math.PI, Math.PI / 4, 0], scale: [1, 1, 0.3] },
    { geo: box(0.34, 0.07, 0.07), color: PAL.gold, at: [x, mid + 1.12, 0.75] },
  );
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3, x = Math.cos(a) * 0.78, z = Math.sin(a) * 0.78;
    if (x < -0.5) continue; // the turret stands there
    if (branch === 'fire') flame(base, x, top + 0.28, z, 1.15);
    else if (branch === 'frost') crystal(base, x, top + 0.26, z, 1.2, Math.cos(a) * 0.35);
    else base.push({ geo: box(0.28, 0.3, 0.28), color: DEF.stoneCap, at: [x, top + 0.45, z], rot: [0, a, 0] });
  }
  if (branch === 'fire') flame(base, tx, top + 1.42, tz, 0.75); // the turret roof burns too
  if (branch === 'frost') crystal(base, tx, top + 1.36, tz, 1.0);
  studs(base, 2, mid + 0.02, 0.9);
  return { base, head: crossbow(2, branch), headY: top + 0.66, height: top + 0.3 };
}

export type BarricadeState = 'intact' | 'damaged' | 'broken';
/** Visual damage state: below half health it is cracked and missing stakes; at 0 it is rubble. */
export const barricadeState = (hp: number, maxHp: number): BarricadeState => (hp <= 0 ? 'broken' : hp < maxHp * 0.5 ? 'damaged' : 'intact');

/** Barricade in its own frame: length along x, front (toward the enemies) at -z. Lv1 a wooden palisade of sharpened
 * stakes on an earth bank with back braces and a team-blue band; Lv2 adds a stone footing, iron bands and steel
 * spikes pointing at the enemy. Damaged: stakes knocked askew or snapped, a spike or two gone. Broken: low rubble. */
export function barricadeParts(level: number, state: BarricadeState): Part[] {
  const parts: Part[] = [], spiked = level >= 1, n = 6, half = 0.98;
  const xs = Array.from({ length: n }, (_, i) => -half + (i * 2 * half) / (n - 1));
  if (state === 'broken') {
    // Rubble: the bank, snapped stumps, logs lying across it, a plank and a couple of loose spikes.
    parts.push({ geo: box(2.3, 0.12, 0.62), color: spiked ? DEF.stoneFoot : DEF.earth, at: [0, 0.06, 0] });
    for (const i of [0, 2, 5]) parts.push({ geo: cyl(0.12, 0.13, 0.28, 7), color: DEF.wood, at: [xs[i], 0.2, 0] }, { geo: cyl(0.1, 0.1, 0.03, 7), color: DEF.tip, at: [xs[i], 0.35, 0] });
    parts.push(
      { geo: cyl(0.11, 0.12, 1.05, 7), color: DEF.wood, at: [-0.35, 0.22, -0.32], rot: [0, 0.35, Math.PI / 2] },
      { geo: cyl(0.11, 0.12, 0.9, 7), color: 0xb87436, at: [0.5, 0.2, 0.3], rot: [0, -0.5, Math.PI / 2] },
      { geo: box(1.0, 0.1, 0.16), color: DEF.woodDark, at: [0.15, 0.17, 0.05], rot: [0, 0.25, 0.08] },
    );
    if (spiked) parts.push(
      { geo: cone(0.07, 0.5, 5), color: DEF.steel, at: [-0.8, 0.14, -0.45], rot: [0, 0.6, Math.PI / 2] },
      { geo: cone(0.07, 0.5, 5), color: DEF.steel, at: [0.9, 0.14, -0.3], rot: [0, -0.9, Math.PI / 2] },
      { geo: box(0.4, 0.22, 0.32), color: DEF.stoneAlt, at: [0.95, 0.15, 0.15], rot: [0, 0.4, 0] },
    );
    return parts;
  }
  const damaged = state === 'damaged';
  parts.push({ geo: box(2.4, 0.16, 0.7), color: spiked ? DEF.stoneFoot : DEF.earth, at: [0, 0.08, 0] });
  if (spiked) for (const x of [-0.8, 0, 0.8]) parts.push({ geo: box(0.74, 0.26, 0.5), color: x ? DEF.stoneAlt : DEF.stone, at: [x, 0.25, 0.1] });
  // Stakes: a little uneven in height; damaged knocks two askew and snaps one.
  xs.forEach((x, i) => {
    const h = 1.0 + ((i * 37) % 5) * 0.03, color = i % 2 ? 0xb87436 : DEF.wood;
    if (damaged && i === 2) {
      parts.push({ geo: cyl(0.12, 0.13, 0.5, 7), color, at: [x, 0.25, 0] }, { geo: cone(0.12, 0.16, 5), color: DEF.tip, at: [x + 0.03, 0.56, 0], rot: [0.3, 0, 0.5] });
      return;
    }
    const tilt: [number, number, number] = damaged && (i === 1 || i === 4) ? [i === 1 ? -0.3 : 0.25, 0, i === 1 ? 0.3 : -0.35] : [0, 0, 0];
    parts.push(
      { geo: cyl(0.12, 0.13, h, 7), color, at: [x, h / 2, 0], rot: tilt },
      { geo: cone(0.13, 0.26, 7), color: spiked ? DEF.steel : DEF.tip, at: [x - tilt[2] * (h + 0.1), h + 0.11, tilt[0] * (h + 0.1)], rot: tilt },
    );
  });
  // Back rails and braces, the team band on the front.
  parts.push(
    { geo: box(2.2, 0.13, 0.08), color: DEF.woodDark, at: [0, 0.36, 0.17] },
    { geo: box(2.2, 0.13, 0.08), color: DEF.woodDark, at: [0, damaged ? 0.7 : 0.76, 0.17], rot: [0, 0, damaged ? 0.12 : 0] },
  );
  for (const x of [-0.7, 0.7]) parts.push({ geo: box(0.1, 0.95, 0.1), color: DEF.woodDark, at: [x, 0.4, 0.42], rot: [-0.55, 0, 0] });
  if (!damaged) parts.push({ geo: box(1.2, 0.16, 0.05), color: PAL.ally, at: [0, 0.6, -0.14] });
  else parts.push({ geo: box(0.55, 0.16, 0.05), color: PAL.ally, at: [-0.5, 0.6, -0.14], rot: [0, 0, -0.12] });
  if (spiked) {
    parts.push({ geo: box(2.25, 0.1, 0.05), color: DEF.iron, at: [0, 0.32, -0.14] }, { geo: box(2.25, 0.1, 0.05), color: DEF.iron, at: [0, 0.82, -0.14] });
    // Spikes angled forward and up at the enemy; damaged loses two.
    [-0.95, -0.57, -0.19, 0.19, 0.57, 0.95].forEach((x, i) => {
      if (damaged && (i === 1 || i === 4)) return;
      parts.push({ geo: cone(0.08, 0.62, 5), color: DEF.steel, at: [x, 0.5, -0.44], rot: [-1.15, 0, 0] });
    });
    [-0.6, 0, 0.6].forEach((x, i) => { if (!(damaged && i === 2)) parts.push({ geo: cone(0.07, 0.5, 5), color: DEF.steel, at: [x, 0.95, -0.34], rot: [-1.0, 0, 0] }); });
  }
  if (damaged) parts.push(
    // Splinters on the bank.
    { geo: box(0.36, 0.06, 0.1), color: DEF.tip, at: [0.2, 0.19, -0.3], rot: [0, 0.6, 0] },
    { geo: box(0.28, 0.06, 0.08), color: DEF.wood, at: [-0.7, 0.19, -0.28], rot: [0, -0.4, 0] },
  );
  return parts;
}

/** A build site under each pad (octagonal stone slab) and barricade site (a row of short marker stakes on a low bank). */
export function padParts(x: number, y: number, z: number): Part[] {
  return [
    { geo: cyl(1.0, 1.06, 0.12, 8), color: DEF.stoneFoot, at: [x, y + 0.04, z] },
    { geo: cyl(0.86, 0.9, 0.08, 8), color: DEF.stoneCap, at: [x, y + 0.12, z] },
  ];
}
export function siteParts(x: number, y: number, z: number, angle: number): Part[] {
  const c = Math.cos(angle), s = Math.sin(angle), parts: Part[] = [{ geo: box(2.3, 0.08, 0.5), color: DEF.earth, at: [x, y + 0.03, z], rot: [0, angle, 0] }];
  for (const t of [-0.98, -0.33, 0.33, 0.98]) parts.push({ geo: box(0.1, 0.3, 0.1), color: DEF.plank, at: [x + c * t, y + 0.15, z - s * t], rot: [0, angle, 0] });
  return parts;
}

/** "Can upgrade" chevron floating over a defence when the gold is there: a gold up-arrow (no text). */
export function chevronParts(): Part[] {
  // Two stacked chevrons, the upper one a little smaller: reads as "up" even at 20 px.
  return [0, 0.3].flatMap((y, i) => {
    const k = i ? 0.8 : 1;
    return [
      { geo: box(0.2 * k, 0.6 * k, 0.14), color: PAL.gold, at: [-0.19 * k, y, 0], rot: [0, 0, -0.75] },
      { geo: box(0.2 * k, 0.6 * k, 0.14), color: PAL.gold, at: [0.19 * k, y, 0], rot: [0, 0, 0.75] },
    ] as Part[];
  }).concat([{ geo: new SphereGeometry(0.11, 6, 4), color: 0xfff1a8, at: [0, 0.5, 0] }]);
}
