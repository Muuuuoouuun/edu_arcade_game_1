// Device benchmark (cycle 125, `rush.html?bench=1`): frame-time statistics of a fixed heavy scene, read on the device
// itself. Nothing is sent anywhere; the numbers are shown on screen and kept on window.__rush.bench.

export type BenchStats = { frames: number; meanMs: number; fps: number; p50: number; p95: number; p99: number; worst: number };

/** Statistics of frame intervals in ms. p99 is the slowest 1% boundary ("1% low" as a frame time). */
export function benchStats(deltas: readonly number[]): BenchStats {
  const d = deltas.filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!d.length) return { frames: 0, meanMs: 0, fps: 0, p50: 0, p95: 0, p99: 0, worst: 0 };
  const at = (q: number) => d[Math.min(d.length - 1, Math.floor(q * d.length))];
  const meanMs = d.reduce((a, x) => a + x, 0) / d.length;
  const r = (x: number) => Math.round(x * 100) / 100;
  return { frames: d.length, meanMs: r(meanMs), fps: r(1000 / meanMs), p50: r(at(0.5)), p95: r(at(0.95)), p99: r(at(0.99)), worst: r(d[d.length - 1]) };
}

/** The heavy scene of the draw-call cycles (107-124): 40 enemies of seven kinds, some warded, frozen or flashing, mid-field,
 * plus a boss, the hero 3.5 m south of them. Plain objects in the sim's enemy shape; the caller pushes them. */
export function benchEnemies(firstId: number) {
  const kinds = ['grunt', 'skirmisher', 'brute', 'shield', 'shaman', 'wolf', 'grunt', 'grunt'] as const;
  const out = [];
  for (let i = 0; i < 40; i++) out.push({ id: firstId + i, kind: kinds[i % kinds.length], x: -10 + (i % 10) * 2.2, z: -12 + Math.floor(i / 10) * 1.8, kx: 0, kz: 0, hp: 1, maxHp: 1, lane: 0, wp: 1, cd: 99, flash: i % 9 === 4 ? 0.2 : 0, chasing: false, facing: Math.PI / 2, windup: null, ...(i % 7 === 3 ? { wardT: 99 } : i % 5 === 1 ? { slowT: 99 } : {}) });
  out.push({ id: firstId + 40, kind: 'boss' as const, x: 6, z: -15, kx: 0, kz: 0, hp: 1, maxHp: 1, lane: 0, wp: 1, cd: 99, flash: 0, chasing: false, facing: Math.PI / 2, windup: null });
  return out;
}
