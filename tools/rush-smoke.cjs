#!/usr/bin/env node
// Browser smoke check for the Arcana Rush prototype (desktop + mobile landscape).
// Usage: node tools/rush-smoke.cjs [outDir]   (starts a Vite dev server on 3110 if nothing answers there)
// Uses the globally installed Playwright/Chromium. Software rendering: FPS numbers are NOT device performance.
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const PORT = 3110;
const BASE = `http://127.0.0.1:${PORT}/rush.html`;
const OUT = path.resolve(process.argv[2] || 'rush-smoke');
const ROOT = path.resolve(__dirname, '..');
mkdirSync(OUT, { recursive: true });

const up = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };

(async () => {
  let server = null;
  if (!(await up())) {
    // Run Vite's own entry with node (not npx) so kill() reaches the server process itself.
    server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 60 && !(await up()); i++) await new Promise(r => setTimeout(r, 500));
  }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // 1. Desktop: title, demo autoplay reaches a later wave without page errors.
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('requestfailed', r => errors.push('request failed ' + r.url()));
    await page.goto(BASE);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/desktop-title.png` });
    await page.goto(BASE + '?demo=1&speed=3&debug=1&seed=3');
    await page.waitForFunction(() => window.__rush.state.wave >= 2 && window.__rush.state.phase === 'wave' && window.__rush.state.enemies.length > 6, null, { timeout: 90000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/desktop-demo.png` });
    const demo = await page.evaluate(() => ({ wave: __rush.state.wave, towers: __rush.state.towers.filter(Boolean).length, info: __rush.info() }));
    check(demo.towers >= 2, `demo built towers (${demo.towers}), draw calls ${demo.info.calls}`);
    // Hit-stop: catch a stop in progress and confirm the simulation does not advance during it.
    const stop = await page.evaluate(() => new Promise(done => {
      const deadline = performance.now() + 45000;
      const look = () => {
        const now = performance.now() / 1000;
        if (__rush.stopUntil > now + 0.03) {
          const tick = __rush.state.tick;
          setTimeout(() => done({ held: __rush.state.tick === tick, stops: __rush.hitStops }), 15);
        } else if (performance.now() > deadline) done({ held: false, stops: __rush.hitStops, timeout: true });
        else requestAnimationFrame(look);
      };
      look();
    }));
    check(stop.held, `hit-stop holds the simulation (${stop.stops} stops${stop.timeout ? ', none caught' : ''})`);

    // 2. Town (kingdom) loop: title → town → upgrade → persists across reload → battle uses the upgrade.
    await page.goto(BASE + '?seed=5');
    await page.evaluate(() => localStorage.removeItem('arcana-rush:kingdom:v1'));
    await page.reload();
    await page.click('#btn-play');
    await page.waitForTimeout(300);
    check(await page.isVisible('#screen-town'), 'title → town screen');
    await page.screenshot({ path: `${OUT}/desktop-town.png` });
    await page.click('[data-up="attack"]');
    await page.waitForTimeout(150);
    check(await page.evaluate(() => __rush.kingdom.perks.attack === 1), 'perk upgrade in town');
    await page.reload();
    await page.click('#btn-play');
    await page.waitForTimeout(200);
    check(await page.evaluate(() => __rush.kingdom.perks.attack === 1), 'kingdom persists across reload');
    check(await page.isDisabled('[data-stage="2"]'), 'stage 2 locked on a fresh kingdom');
    check((await page.textContent('#btn-battle')).includes('스테이지 1'), 'battle button names the selected stage');

    // 3. Desktop controls: keyboard movement per sim tick, build on a pad, mouse fire.
    await page.click('#btn-battle');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => __rush.state.mods.damage > 1), 'battle starts with kingdom modifiers');
    const t0 = await page.evaluate(() => ({ tick: __rush.state.tick, x: __rush.state.hero.x }));
    await page.keyboard.down('KeyA');
    await page.waitForFunction(() => __rush.state.hero.x <= -4.4, null, { timeout: 20000 });
    await page.keyboard.up('KeyA');
    const t1 = await page.evaluate(() => ({ tick: __rush.state.tick, x: __rush.state.hero.x }));
    const perTick = (t0.x - t1.x) / (t1.tick - t0.tick);
    check(Math.abs(perTick - 5.2 / 60) < 0.01, `keyboard move ${perTick.toFixed(4)} m/tick`);
    await page.waitForTimeout(200);
    check(await page.isVisible('#build'), 'build button appears on a pad');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => __rush.state.towers[0] !== null), 'tower built with E');
    await page.click('#start-wave');
    await page.mouse.move(640, 200);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(300);
    check(await page.evaluate(() => __rush.state.stats.shots >= 1), 'mouse click fires');
    check(await page.evaluate(() => new Promise(done => { const until = performance.now() + 1500; const look = () => __rush.info().heroAnim ? done(true) : performance.now() > until ? done(false) : requestAnimationFrame(look); look(); })), 'hero shoot clip plays on the baked model');
    await page.screenshot({ path: `${OUT}/desktop-play.png` });
    // 4. Finish the battle by letting the town fall (fast) → reward once → back to town.
    await page.goto(BASE + '?seed=5&speed=8');
    await page.click('#btn-play');
    await page.click('#btn-battle');
    const lostBefore = await page.evaluate(() => __rush.kingdom.battles.lost);
    await page.waitForSelector('#screen-result:not([hidden])', { timeout: 60000 });
    check(await page.isVisible('#result-reward'), `result shows reward: ${(await page.textContent('#result-reward')).trim()}`);
    await page.screenshot({ path: `${OUT}/desktop-result.png` });
    await page.click('#btn-town');
    await page.waitForTimeout(200);
    check(await page.evaluate(n => __rush.kingdom.battles.lost === n + 1, lostBefore), 'battle recorded once in the kingdom');
    check(errors.length === 0, `desktop page errors: ${errors.join(' | ') || 'none'}`);
    await page.close();

    // 5. Mobile landscape touch: town, joystick, tap auto-fire, drag aim-fire.
    const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] });
    const mp = await ctx.newPage();
    const merrors = [];
    mp.on('pageerror', e => merrors.push(e.message));
    await mp.goto(BASE + '?seed=2');
    await mp.waitForTimeout(800);
    await mp.screenshot({ path: `${OUT}/mobile-title.png` });
    await mp.tap('#btn-play');
    await mp.waitForTimeout(300);
    await mp.screenshot({ path: `${OUT}/mobile-town.png` });
    await mp.tap('#btn-battle');
    await mp.waitForTimeout(300);
    const cdp = await ctx.newCDPSession(mp);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const vp = mp.viewportSize();
    const z0 = await mp.evaluate(() => __rush.state.hero.z);
    await touch('touchStart', [{ x: 140, y: vp.height - 110, id: 1 }]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: 140, y: vp.height - 110 - i * 10, id: 1 }]); await mp.waitForTimeout(16); }
    await mp.waitForTimeout(500);
    await touch('touchEnd', []);
    check((await mp.evaluate(() => __rush.state.hero.z)) < z0 - 1, 'touch joystick moves the hero north');
    await mp.tap('#start-wave');
    await mp.waitForTimeout(4000);
    await mp.tap('#fire');
    await mp.waitForTimeout(400);
    check((await mp.evaluate(() => __rush.state.stats.shots)) >= 1, 'tap fire (auto-aim)');
    const box = await mp.locator('#fire').boundingBox();
    const fx = box.x + box.width / 2, fy = box.y + box.height / 2;
    const shots = await mp.evaluate(() => __rush.state.stats.shots);
    await mp.waitForTimeout(400);
    await touch('touchStart', [{ x: fx, y: fy, id: 2 }]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: fx - i * 6, y: fy - i * 9, id: 2 }]); await mp.waitForTimeout(16); }
    await mp.waitForTimeout(150);
    await mp.screenshot({ path: `${OUT}/mobile-aim.png` });
    await touch('touchEnd', []);
    await mp.waitForTimeout(250);
    check((await mp.evaluate(() => __rush.state.stats.shots)) > shots, 'drag-aim fire');
    check(merrors.length === 0, `mobile page errors: ${merrors.join(' | ') || 'none'}`);
    await ctx.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log(`screenshots: ${OUT}`);
  if (failures.length) { console.error(`${failures.length} check(s) failed`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
