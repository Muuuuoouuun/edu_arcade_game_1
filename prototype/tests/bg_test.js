const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 1100 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + require('path').resolve(__dirname, '..', 'bg_demo.html'));
  await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const out = []; let maxMs = 0, minPathVsGround = 99, minEnemy = 99, maxPathLum = 0, maxP95 = 0, maxFogGrid = 0, maxSat = 0;
    for (let r = 0; r < 4; r++) for (let s = 0; s < 4; s++) for (let d = 0; d < 3; d++) {
      const o = BGDEMO.set(r, s, d, false, false);
      const sat = BGDEMO.satP95();
      maxMs = Math.max(maxMs, o.ms); minPathVsGround = Math.min(minPathVsGround, o.stats.pathVsGround);
      minEnemy = Math.min(minEnemy, ...o.stats.enemyContrast.map(e => e[1])); maxPathLum = Math.max(maxPathLum, o.stats.pathLum);
      maxP95 = Math.max(maxP95, sat.p95); maxSat = Math.max(maxSat, sat.max); maxFogGrid = Math.max(maxFogGrid, o.fogGrid);
      out.push([r, s, d, +o.ms.toFixed(1), +sat.p95.toFixed(3)]);
    }
    return { n: out.length, maxMs, minPathVsGround, minEnemy, maxPathLum, maxP95, maxSat, maxFogGrid, rows: out };
  });
  console.log('combos', res.n, 'maxBuildMs', res.maxMs.toFixed(1), 'minPathVsGround', res.minPathVsGround.toFixed(2),
    'minEnemyContrast', res.minEnemy.toFixed(2), 'maxPathLum', res.maxPathLum.toFixed(3), 'maxP95sat', res.maxP95.toFixed(3), 'maxSat', res.maxSat.toFixed(3), 'maxFogGrid', res.maxFogGrid.toFixed(3));
  const worst = res.rows.slice().sort((a,b)=>b[4]-a[4]).slice(0,3); console.log('top sat p95', JSON.stringify(worst));
  const shots = [
    [0, 0, 0, false, 'r1_math_d1'], [1, 1, 1, true, 'r2_eng_d2_terrain'], [2, 2, 2, false, 'r3_sci_d3'],
    [3, 3, 2, true, 'r4_hist_d3_terrain'], [3, 0, 0, false, 'r4_math_d1'], [2, 3, 1, true, 'r3_hist_d2_terrain']
  ];
  for (const [r, s, d, t, name] of shots) {
    await page.selectOption('#selR', String(r)); await page.selectOption('#selS', String(s)); await page.selectOption('#selD', String(d));
    const cb = await page.$('#tgTerr'); if ((await cb.isChecked()) !== t) await cb.click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: require('path').resolve(__dirname, '..', `bg_demo_${name}.png`), fullPage: true });
  }
  console.log('console errors/warnings:', errors.length, JSON.stringify(errors));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
