// In-game check of the battlefield GLBs in the real campaign renderer (scratch copy of origin/main, never the repo).
//   1. git archive origin/main | tar -x -C <copy>; cd <copy>; npm ci; git apply <this folder>/battlefield-glb-probe.patch
//   2. cp docs/arcana-3d-modeling/glb/battlefield-*.{glb,height.json} <copy>/public/rt/
//   3. npx vite --host 127.0.0.1 --port 3100 --strictPort   (in <copy>)
//   4. node ingame-check.cjs <outdir> 1 4 5 8        (MODES=now,glb  VW=844 VH=390  WAVE=1 to start the first wave)
// Writes <outdir>/s<stage>-<mode>.png and prints renderer draw calls / triangles (dev build diagnostics).
const { chromium } = require('playwright');
const out = process.argv[2], stages = process.argv.slice(3).map(Number);
const id = s => `${s >= 5 ? 'snow' : 'forest'}-${s === 4 || s === 8 ? 'expanded' : 'single'}`;
const modes = (process.env.MODES || 'now,glb').split(',');
(async () => {
  const browser = await chromium.launch();
  for (const st of stages) for (const mode of modes) {
    const ctx = await browser.newContext({ viewport: { width: +(process.env.VW || 844), height: +(process.env.VH || 390) }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ko-KR' });
    await ctx.addInitScript(([cleared, variant, glb]) => {
      localStorage.setItem('playground:defense:v1', JSON.stringify({ version: 1, cleared, gold: 9999, training: 0 }));
      if (!glb) return;
      globalThis.__TERRAIN_GLB = { [variant]: `/rt/battlefield-${variant}.glb` };
      fetch(`/rt/battlefield-${variant}.height.json`).then(r => r.json()).then(h => { globalThis.__HEIGHTS = { [variant]: h }; });
    }, [Array.from({ length: st - 1 }, (_, i) => i + 1), id(st), mode === 'glb']);
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    await page.locator('button.arcana-mode', { hasText: '원정' }).first().click(); await page.waitForTimeout(1500);
    for (let i = 0; i < 4; i++) { const d = page.locator('[role="dialog"] button.defense-primary').first(); if (await d.count() && await d.isVisible()) { await d.click(); await page.waitForTimeout(600); } else break; }
    await page.evaluate(() => document.querySelector('button.camp-enter-stage')?.click()); await page.waitForTimeout(1500);
    for (let i = 0; i < 5 && !await page.locator('main.battle-page').count(); i++) {
      const b = page.locator('[role="dialog"] button.defense-primary, button:has-text("출전"), button:has-text("출발")').first();
      if (await b.count()) { await b.click({ force: true }); await page.waitForTimeout(1000); } else break;
    }
    await page.waitForTimeout(2500);
    for (let i = 0; i < 3; i++) { const d = page.locator('[role="dialog"] button.defense-primary').first(); if (await d.count() && await d.isVisible()) { await d.click(); await page.waitForTimeout(700); } else break; }
    await page.waitForTimeout(2500);
    if (process.env.WAVE) {
      const pad = page.locator('.def-build-pad').nth(2);
      if (await pad.count()) { const r = await pad.boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(600); const buy = page.locator('.tactical-towers button:not([disabled])').first(); if (await buy.count()) { await buy.click(); await page.waitForTimeout(500); } }
      await page.locator('button.battle-start').click().catch(() => {}); await page.waitForTimeout(9000);
    }
    const file = `${out}/s${st}-${mode}${process.env.WAVE ? '-wave' : ''}.png`; await page.screenshot({ path: file });
    const info = await page.evaluate(() => { const d = document.querySelector('.def-terrain-3d')?.dataset; return { battle: !!document.querySelector('main.battle-page'), calls: d?.renderCalls, triangles: d?.renderTriangles, models: d?.modelKeys, glbReady: !!globalThis.__GLB_READY }; });
    console.log(file, JSON.stringify(info), errors.join(' | ').slice(0, 300));
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
