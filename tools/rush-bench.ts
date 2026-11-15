// Arcana Rush simulation scaling bench (cycle 13 ECS spike).
// node --experimental-strip-types tools/rush-bench.ts [N ...]
// Puts N long-lived enemies on the three lanes with four Lv3 towers and an idle hero, then times stepRush.
// Container CPU numbers are a reference for the growth shape only, not a device performance claim.
import { PerformanceObserver, performance } from 'node:perf_hooks';
import { LANES, TOWER_LEVELS, WAVES } from '../src/rush/data.ts';
import { createRush, stepRush, type RushState } from '../src/rush/sim.ts';

function scene(n: number): RushState {
  const s = createRush(7);
  s.town.hp = s.town.maxHp = 1e12;
  s.phase = 'wave';
  s.groups = WAVES[0].map(() => ({ spawned: 1e9, timer: 0 }));
  s.towers = s.towers.map(() => ({ level: TOWER_LEVELS.length - 1, cd: 0, facing: 0 }));
  for (let i = 0; i < n; i++) {
    const lane = i % LANES.length, path = LANES[lane], k = (i / n) * (path.length - 1);
    const a = path[Math.floor(k)], b = path[Math.min(path.length - 1, Math.floor(k) + 1)], f = k - Math.floor(k);
    const kind = (['grunt', 'grunt', 'skirmisher', 'brute'] as const)[i % 4];
    s.enemies.push({
      id: s.nextId++, kind, x: a.x + (b.x - a.x) * f + ((i * 7) % 5 - 2) * 0.3, z: a.z + (b.z - a.z) * f, kx: 0, kz: 0,
      hp: 1e9, maxHp: 1e9, lane, wp: Math.min(path.length - 1, Math.floor(k) + 1), cd: 0, flash: 0, chasing: false, facing: 0, windup: null,
    });
  }
  return s;
}

let gcCount = 0;
new PerformanceObserver(list => { gcCount += list.getEntries().length; }).observe({ entryTypes: ['gc'] });

const sizes = process.argv.slice(2).map(Number).filter(n => n > 0);
const rows: string[] = [];
for (const n of sizes.length ? sizes : [25, 100, 300, 1000]) {
  const s = scene(n);
  for (let i = 0; i < 120; i++) stepRush(s, {});
  const batch = n >= 1000 ? 60 : 300, samples: number[] = [];
  await new Promise(r => setTimeout(r, 0));
  const gc0 = gcCount;
  let steps = 0;
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now();
    for (let i = 0; i < batch; i++) stepRush(s, {});
    samples.push((performance.now() - t0) / batch);
    steps += batch;
  }
  await new Promise(r => setTimeout(r, 0)); // let the gc observer flush
  samples.sort((a, b) => a - b);
  const alive = s.enemies.filter(e => e.hp > 0).length;
  rows.push(`| ${n} | ${alive} | ${samples[2].toFixed(3)} | ${((gcCount - gc0) * 1000 / steps).toFixed(1)} | ${(alive * (alive - 1) / 2).toLocaleString('en')} |`);
}
console.log('| 적 N | 살아 있는 적 | ms/스텝 (중앙값) | GC/1000스텝 | 밀어내기 쌍 검사/스텝 |');
console.log('| ---: | ---: | ---: | ---: | ---: |');
for (const r of rows) console.log(r);
