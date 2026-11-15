// Run against Vite on :3110. Requires the environment's Playwright and Chromium.
// Isolated browser contexts never modify a player's save. Software rendering is not a device FPS benchmark.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const out = path.resolve(process.argv[2] || '/tmp/arcana-character-smoke');
mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:3110';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    for (const mobile of [false, true]) for (const hero of ['ranger', 'bron', 'bear']) {
      const ctx = await browser.newContext({ viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 800 }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
      const page = await ctx.newPage(), errors = [], label = `${hero}-${mobile ? 'mobile' : 'desktop'}`;
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${base}/rush.html?quality=high&seed=3`);
      await page.waitForFunction(() => window.__rush);
      await page.evaluate(async hero => {
        const { createKingdom } = await import('/src/rush/kingdom.ts');
        const save = createKingdom(Date.now()); save.stars.fill(3); save.hero = hero;
        localStorage.setItem('arcana-rush:kingdom:v1', JSON.stringify(save));
      }, hero);
      await page.reload(); await page.waitForFunction(() => window.__rush);
      await page.click('#btn-play'); await page.click('#btn-battle');
      await page.waitForFunction(hero => __rush.info().heroReady && __rush.info().heroKind === hero, hero, { timeout: 45000 });
      const ready = await page.evaluate(() => __rush.info());
      assert.equal(ready.heroTexture, true); assert.equal(ready.heroNormalMap, true);
      assert.deepEqual([ready.heroMotion.idle, ready.heroMotion.walk, ready.heroMotion.attack], [true, true, true]);
      const x0 = await page.evaluate(() => __rush.state.hero.x);
      let touch;
      if (mobile) {
        const cdp = await ctx.newCDPSession(page);
        touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
        await touch('touchStart', [{ x: 140, y: 270, id: 1 }]);
        await touch('touchMove', [{ x: 196, y: 270, id: 1 }]);
      } else await page.keyboard.down('KeyD');
      await page.waitForFunction(x => __rush.state.hero.x > x + .5 && __rush.info().heroMotion.moving, x0);
      const walking = await page.evaluate(() => __rush.info().heroMotion);
      assert.ok(walking.gaitWeight > .9 && walking.phase > 0);
      if (mobile) await touch('touchEnd', []);
      else {
        // Fire while walking to exercise the independent upper-body attack.
        await page.mouse.click(640, 250);
        await page.waitForFunction(() => __rush.info().heroAnim);
        await page.keyboard.up('KeyD');
      }
      await page.waitForFunction(() => __rush.info().heroMotion.gaitWeight === 0);
      await page.click('#start-wave');
      const shots = await page.evaluate(() => __rush.state.stats.shots);
      if (mobile) {
        const box = await page.locator('#fire').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
        await touch('touchStart', [{ x, y, id: 2 }]);
        await touch('touchMove', [{ x: x - 30, y: y - 50, id: 2 }]);
        await touch('touchEnd', []);
      } else { await page.waitForTimeout(800); await page.mouse.click(640, 250); }
      await page.waitForFunction(n => __rush.state.stats.shots > n && __rush.info().heroAnim, shots);
      if (hero === 'bear') {
        await page.waitForFunction(() => __rush.info().heldProp === false);
        await page.waitForFunction(() => __rush.info().heldProp === true, null, { timeout: 15000 });
      }
      await page.screenshot({ path: `${out}/${label}-battle.png` });
      await page.click('#pause'); await page.waitForTimeout(150);
      const paused = await page.evaluate(() => ({ tick: __rush.state.tick, motion: __rush.info().heroMotion }));
      await page.waitForTimeout(300);
      assert.deepEqual(await page.evaluate(() => ({ tick: __rush.state.tick, motion: __rush.info().heroMotion })), paused);
      await page.click('#btn-resume');
      await page.waitForFunction(tick => __rush.state.tick > tick, paused.tick);
      assert.deepEqual(errors, []);
      results.push({ label, ready, walking, pause: true, attack: true, errors });
      console.log(`PASS ${label}: textures, walking, attack, pause/resume${hero === 'bear' ? ', snowball reload' : ''}`);
      await ctx.close();
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`${base}/defense/models/characters-v2/sheets.html`);
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    for (const hero of ['ranger', 'bron', 'bear']) await page.locator(`#${hero}`).screenshot({ path: `${out}/${hero}-character-sheet.png` });
    writeFileSync(`${out}/character-smoke.json`, JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
