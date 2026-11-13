// Usage: start a server first (npx vite --port 3141), then: node tools/rush-perf-check.cjs   (PORT=... to change). A proxy, not a device claim.
// Performance proxy (1.0): main-thread script/task time per frame with the CPU throttled 4x (CDP), phone landscape, auto quality.
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] }); const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto('http://127.0.0.1:' + (process.env.PORT || 3141) + '/rush.html?seed=3');
  await page.waitForSelector('#btn-play', { state: 'visible', timeout: 120000 });
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const sample = async (label, seconds) => {
    await page.evaluate(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const a = await metrics(), f0 = await page.evaluate(() => window.__frames);
    await page.waitForTimeout(seconds * 1000);
    const b = await metrics(), frames = (await page.evaluate(() => window.__frames)) - f0;
    const per = k => ((b[k] - a[k]) * 1000 / Math.max(1, frames)).toFixed(2);
    console.log(`${label}: ${frames} frames in ${seconds}s (${(frames / seconds).toFixed(0)}/s) | per frame script ${per('ScriptDuration')} ms, all tasks ${per('TaskDuration')} ms, style+layout ${((b.RecalcStyleDuration - a.RecalcStyleDuration + b.LayoutDuration - a.LayoutDuration) * 1000 / Math.max(1, frames)).toFixed(2)} ms | enemies ${await page.evaluate(() => __rush.state.enemies.length)}`);
  };
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sample('title (4x CPU)', 4);
  await page.click('#btn-play'); await page.waitForTimeout(1500);
  await sample('town (4x CPU)', 4);
  await page.click('#btn-battle'); await page.waitForTimeout(1500);
  await page.click('#start-wave').catch(() => {});
  await page.evaluate(() => { const s = __rush.state; s.town.hp = s.town.maxHp = 1e9; const kinds = ['grunt', 'grunt', 'skirmisher', 'brute', 'shield', 'shaman'];
    for (let i = 0; i < 45; i++) s.enemies.push({ id: 9000 + i, kind: kinds[i % kinds.length], x: -8 + (i % 9) * 2, z: -20 + Math.floor(i / 9) * 2.5, kx: 0, kz: 0, hp: 5000, maxHp: 5000, lane: i % 2, wp: 1, cd: 1, flash: 0, chasing: false, facing: Math.PI / 2, windup: null }); });
  await page.waitForTimeout(1500);
  await sample('battle, 45+ live enemies (4x CPU)', 6);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await sample('battle, same scene (no throttle)', 4);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
