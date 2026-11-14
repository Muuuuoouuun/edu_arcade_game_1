// Contrast scenes (cycles 74, 92, 102): each enemy kind in a row on the forest and snow battlefields, plain, frosted and
// warded, plus an empty frame of the same view; tools/rush-contrast.py turns them into CIELAB ΔE tables.
// Usage: start a server (npx vite --port 3150), then
//   node tools/rush-contrast.cjs <outDir> [baseUrl=http://127.0.0.1:3150] [quality=high]
//   python3 tools/rush-contrast.py <outDir>
// ONLY=s7,s8 limits the scenes to names starting with those prefixes (python side: pass the same stages).
// Phone landscape, software GL. The map layout follows the stage (__rush.setStage), not just the stage number.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2], BASE = process.argv[3] || 'http://127.0.0.1:3150', Q = process.argv[4] || 'high';
if (!OUT) { console.error('usage: node tools/rush-contrast.cjs <outDir> [baseUrl] [quality]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const KINDS = ['grunt', 'skirmisher', 'brute', 'shield', 'shaman', 'wolf', 'boss'];
const row = z => KINDS.map((k, i) => [k, -7.5 + i * 2.5, z]);
const SCENES = {};
// Road row (z 1.5: the gate-road cover pair is the same in every layout) and field row (z -0.6), forest and snow.
for (const [stage, z] of [[2, 1.5], [3, -0.6], [7, 1.5], [8, -0.6]]) {
  SCENES[`s${stage}plain`] = { stage, list: row(z) };
  SCENES[`s${stage}frost`] = { stage, list: row(z).map(e => [...e, { slowT: 99 }]) };
  SCENES[`s${stage}ward`] = { stage, list: row(z).map(e => [...e, { wardT: 99 }]) };
}
SCENES.s5boss = { stage: 5, list: [['boss', 0, 2.2]] };
SCENES.s10boss = { stage: 10, list: [['boss', 0, 2.2]] };
if (process.env.ONLY) {
  const pre = process.env.ONLY.split(',');
  for (const k of Object.keys(SCENES)) if (!pre.some(p => k.startsWith(p))) delete SCENES[k];
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  // Reduced motion hides the snowfall and the walk waddle: falling flakes crossing an enemy were counted as its pixels
  // and moved single values by 10-20 between runs (cycle 102).
  const page = await (await browser.newContext({ ...devices['Pixel 7 landscape'], reducedMotion: 'reduce' })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  // shadowEvery=1: every captured frame has its own shadow map (no half-drawn frame between the two shots).
  await page.goto(`${BASE}/rush.html?demo=1&seed=3&speed=8&freeze=300&quality=${Q}&shadowEvery=1`);
  await page.waitForFunction(() => window.__rush && __rush.frozen, null, { timeout: 180000 });
  for (const [name, sc] of Object.entries(SCENES)) {
    await page.evaluate(stage => { __rush.setStage(stage); const s = __rush.state; s.enemies.length = 0; s.shots.length = 0; s.hero.kind = 'ranger'; s.hero.x = 0; s.hero.z = 4.2; s.hero.facing = -Math.PI / 2; }, sc.stage);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}-empty.png`, timeout: 180000 });
    await page.evaluate(list => { const s = __rush.state; let id = 6000; for (const [kind, x, z, extra] of list) s.enemies.push({ id: id++, kind, x, z, kx: 0, kz: 0, hp: 1, maxHp: 1, lane: 0, wp: 1, cd: 99, flash: 0, chasing: false, facing: Math.PI / 2, windup: null, ...(extra || {}) }); }, sc.list);
    await page.waitForTimeout(1200);
    const pts = await page.evaluate(() => __rush.enemyScreen().map(e => { const en = __rush.state.enemies.find(x => x.id === e.id); return { kind: en.kind, x: e.pts[0].x, y: e.pts[0].y, hx: e.pts[1].x, hy: e.pts[1].y, dpr: devicePixelRatio }; }));
    await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 });
    fs.writeFileSync(`${OUT}/${name}-pts.json`, JSON.stringify(pts));
  }
  console.log('scenes', Object.keys(SCENES).length, 'errors:', JSON.stringify(errs.slice(0, 5)));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
