// Usage: start a server first (npx vite --port 3141), then: node tools/rush-haptics-check.cjs   (PORT=... to change)
// Vibration check (1.0): navigator.vibrate is intercepted; a started wave must buzz with vibration on and stay silent off.
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const haptics of [true, false]) {
    const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'], deviceScaleFactor: 1 }); const page = await ctx.newPage();
    await page.addInitScript(h => {
      window.__vib = [];
      Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: p => { window.__vib.push(p); return true; } });
      localStorage.setItem('arcana-rush:settings:v1', JSON.stringify({ sfx: true, music: true, haptics: h }));
    }, haptics);
    await page.goto('http://127.0.0.1:' + (process.env.PORT || 3141) + '/rush.html');
    await page.waitForSelector('#btn-play', { state: 'visible', timeout: 120000 });
    await page.click('#btn-play'); await page.waitForTimeout(1200);
    await page.click('#btn-battle'); await page.waitForTimeout(1200);
    await page.click('#start-wave').catch(() => {});
    await page.waitForFunction(() => __rush.state.phase === 'wave', null, { timeout: 30000 });
    await page.waitForTimeout(600);
    // A boss arrival is another buzz: inject one.
    await page.evaluate(() => { const s = __rush.state; s.events.length = 0; });
    const calls = await page.evaluate(() => window.__vib.slice());
    console.log(`haptics ${haptics ? 'on ' : 'off'}: vibrate calls ${calls.length} ${JSON.stringify(calls.slice(0, 4))}`);
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
