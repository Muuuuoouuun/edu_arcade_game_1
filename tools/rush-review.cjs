// Six-area review shots (docs/rush/goal-6areas.md): the same scenes every time, so scores before and after a change
// compare like for like. Phone landscape, software GL. Needs a dev or preview server.
// Usage: [REVIEW_KINDS=grunt,...,boss] node tools/rush-review.cjs <outDir> [baseUrl=http://127.0.0.1:3150] [quality=high]
// Scenes: model sheet; forest and snow battles with one of every enemy kind in a row and a crowd; towers at every level
// and branch; a mid-wave demo frame; draw calls and triangles of the heavy scene (printed as JSON).
const { chromium, devices } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2], BASE = process.argv[3] || 'http://127.0.0.1:3150', Q = process.argv[4] || 'high';
if (!OUT) { console.error('usage: node tools/rush-review.cjs <outDir> [baseUrl] [quality]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const report = {};
  await page.goto(`${BASE}/rush.html?sheet=1&quality=${Q}`); await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/sheet.png` });

  await page.goto(`${BASE}/rush.html?demo=1&seed=3&speed=8&freeze=300&quality=${Q}`);
  await page.waitForFunction(() => window.__rush && __rush.frozen, null, { timeout: 180000 });
  // Enemy kinds to show (REVIEW_KINDS, comma separated): new kinds must be listed explicitly; boss stays last.
  const kinds = (process.env.REVIEW_KINDS || 'grunt,skirmisher,brute,shield,shaman,boss').split(',');
  const scene = async (name, stage, list, opts = {}) => {
    await page.evaluate(({ stage, opts }) => {
      // setStage (debug hook) also swaps the map layout; older builds only had the stage number.
      if (__rush.setStage) __rush.setStage(stage); else __rush.state.diff.stage = stage;
      const s = __rush.state; s.enemies.length = 0; s.shots.length = 0;
      s.hero.kind = opts.hero || 'ranger'; s.hero.x = opts.hx ?? 0; s.hero.z = opts.hz ?? 4.2; s.hero.facing = -Math.PI / 2;
      if (opts.towers) s.towers = s.towers.map((_, i) => opts.towers[i] ?? null);
    }, { stage, opts });
    await page.waitForTimeout(1500);
    await page.evaluate(list => {
      const s = __rush.state; let id = 7000;
      for (const [kind, x, z, extra] of list) s.enemies.push({ id: id++, kind, x, z, kx: 0, kz: 0, hp: 1, maxHp: 1, lane: 0, wp: 1, cd: 99, flash: 0, chasing: false, facing: Math.PI / 2, windup: null, ...(extra || {}) });
    }, list);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    if (opts.info) report[name] = await page.evaluate(() => { const i = __rush.info(); return { calls: i.calls, triangles: i.triangles }; });
  };
  const row = kinds.map((k, i) => [k, -7.5 + i * 2.5, 1.5]);
  const crowd = []; { let i = 0; for (let z = -6; z <= 2; z += 1.6) for (let x = -9; x <= 9; x += 2.2) crowd.push([kinds[i++ % (kinds.length - 1)], x, z]); crowd.push(['boss', 0, -8.5]); }
  const towers = [{ level: 0, cd: 9, facing: 0 }, { level: 1, cd: 9, facing: 0, branch: 'fire' }, { level: 2, cd: 9, facing: 0, branch: 'frost' }, { level: 2, cd: 9, facing: 0, branch: 'fire' }];
  await scene('forest-row', 2, row, { towers });
  await scene('snow-row', 7, row, { towers });
  await scene('forest-crowd', 3, crowd, { towers });
  await scene('snow-heavy', 10, crowd, { towers, info: true });
  await scene('boss5', 5, [['boss', 0, 1.6]], { hz: 5.2 });
  await scene('boss10', 10, [['boss', 0, 1.6]], { hz: 5.2 });
  await scene('north-forest', 2, [], { hz: -14 });
  await scene('north-snow', 8, [], { hz: -14 });

  await page.goto(`${BASE}/rush.html?demo=1&seed=7&speed=8&freeze=3600&quality=${Q}`);
  await page.waitForFunction(() => window.__rush && __rush.frozen, null, { timeout: 240000 }); await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/demo-mid.png` });
  console.log(JSON.stringify(report), 'errors:', JSON.stringify(errs.slice(0, 5)));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
