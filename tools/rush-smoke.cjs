#!/usr/bin/env node
// Browser smoke check for the Arcana Rush prototype (desktop + mobile landscape).
// Usage: node tools/rush-smoke.cjs [outDir]   (starts a Vite dev server on 3110 if nothing answers there)
// Uses the globally installed Playwright/Chromium. Software rendering: FPS numbers are NOT device performance.
const { spawn } = require('node:child_process');
const { mkdirSync, existsSync } = require('node:fs');
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
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
    // 1.0 front door (completion C1-C4): no prototype label, an install manifest, settings that persist, music moods.
    check(!(await page.textContent('#screen-title')).includes('PROTOTYPE') && (await page.title()) === '아르카나 러시', 'title has no prototype label');
    check(await page.evaluate(() => !!document.querySelector('link[rel="manifest"][href="/rush/rush.webmanifest"]')), 'install manifest linked');
    await page.click('#btn-settings');
    await page.click('#set-music');
    const off = await page.evaluate(() => ({ music: __rush.music.enabled, saved: JSON.parse(localStorage.getItem('arcana-rush:settings:v1') || '{}').music }));
    await page.click('#set-music');
    await page.click('#set-close');
    check(off.music === false && off.saved === false && await page.evaluate(() => __rush.music.enabled) && await page.isVisible('#screen-title'), 'settings: music toggle saves and returns to the title');
    check(await page.evaluate(() => __rush.music.mood === 'title'), 'title music mood');
    await page.click('#btn-play');
    await page.waitForTimeout(300);
    check(await page.isVisible('#screen-town'), 'title → town screen');
    check(await page.evaluate(() => __rush.music.mood === 'town'), 'town music mood');
    await page.screenshot({ path: `${OUT}/desktop-town.png` });
    await page.click('[data-select="attack"]');
    check(await page.isVisible('[data-up="attack"]'), 'tapping a building tag shows its card');
    await page.click('[data-select="forge"]');
    check(await page.isVisible('[data-up="forge"]') && (await page.textContent('[data-id="forge"]')).includes('대장간'), 'forge tag opens the forge card');
    await page.click('[data-select="attack"]');
    await page.click('[data-up="attack"]');
    await page.waitForTimeout(150);
    check(await page.evaluate(() => __rush.kingdom.perks.attack === 1), 'perk upgrade in town');
    await page.reload();
    await page.click('#btn-play');
    await page.waitForTimeout(200);
    check(await page.evaluate(() => __rush.kingdom.perks.attack === 1), 'kingdom persists across reload');
    check(await page.isDisabled('[data-stage="2"]'), 'stage 2 locked on a fresh kingdom');
    check(await page.isHidden('[data-endless]'), 'endless record flag tag hidden until endless opens');
    // Cycle 87: a still town island redraws about one frame in four (every frame only during a building pop).
    const still = await page.evaluate(() => new Promise(r => { setTimeout(() => { const d0 = __rush.drawnFrames, t0 = performance.now(); let n = 0; const f = () => { if (++n < 40) requestAnimationFrame(f); else r({ n, drawn: __rush.drawnFrames - d0, ms: Math.round(performance.now() - t0), mode: __rush.mode, q: __rush.quality.tier }); }; requestAnimationFrame(f); }, 1500); }));
    check(still.drawn >= 6 && still.drawn <= 16, `still town redraws ${still.drawn} of ${still.n} frames (${still.ms} ms, ${still.mode}, ${still.q})`);
    check((await page.textContent('#town-goal')).includes('1-1 승리') && !(await page.getAttribute('#town-goal', 'class')).includes('done'), 'fresh kingdom shows the first goal, not yet claimable');
    // 1.0: an unmet stage goal is tappable and points at its stage instead of paying out.
    await page.click('#town-goal');
    check(await page.evaluate(() => __rush.kingdom.goal === 0) && (await page.getAttribute('[data-stage="1"]', 'aria-checked')) !== 'false', 'unmet stage goal selects its stage, pays nothing');
    await page.click('#btn-hero');
    check(await page.isVisible('[data-train]'), 'hero button opens the hero card');
    await page.click('[data-train]');
    await page.waitForTimeout(150);
    check(await page.evaluate(() => __rush.kingdom.heroLv.ranger === 2) && (await page.textContent('#hero-name')).includes('Lv2'), 'hero training levels the ranger');
    await page.screenshot({ path: `${OUT}/desktop-hero-card.png` });
    await page.click('#btn-hero');
    check((await page.textContent('#hero-name')).includes('도마뱀') && await page.isVisible('#town-reward'), 'Bron stays locked on a fresh kingdom (hint shown)');
    check((await page.textContent('#btn-battle')).includes('1-1'), 'battle button names the selected village');
    check(await page.isVisible('#btn-battle .daily-badge'), 'battle button shows the daily first-win badge on a fresh kingdom');

    // 3. Desktop controls: keyboard movement per sim tick, build on a pad, mouse fire.
    await page.click('#btn-battle');
    await page.waitForTimeout(200);
    check(await page.evaluate(() => __rush.music.mood === 'battle' || __rush.music.mood === 'boss'), 'battle music mood');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => __rush.state.mods.damage > 1 && __rush.state.mods.heroHp > 1 && __rush.state.hero.hp > 420), 'battle starts with kingdom and hero-level modifiers');
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
    await page.waitForFunction(() => __rush.state.towers[0] !== null, null, { timeout: 3000 }).catch(() => {}); // few frames a second under software GL
    check(await page.evaluate(() => __rush.state.towers[0] !== null), 'tower built with E');
    // Lv2 choice (cycle 15): with enough gold the build button splits; R picks frost.
    await page.evaluate(() => { __rush.state.gold += 500; });
    await page.waitForTimeout(150);
    check(await page.isVisible('#build-frost'), 'Lv1 tower offers fire and frost');
    await page.screenshot({ path: `${OUT}/desktop-branch-choice.png` });
    await page.keyboard.press('KeyR');
    // Wait for the result, not a fixed delay: with real shadows the software-rendered desktop run draws few frames a second.
    await page.waitForFunction(() => __rush.state.towers[0]?.level === 1 && document.getElementById('build-frost')?.hidden !== false, null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(150);
    check(await page.evaluate(() => __rush.state.towers[0]?.level === 1 && __rush.state.towers[0]?.branch === 'frost') && !(await page.isVisible('#build-frost')), 'R upgrades to a frost tower');
    await page.click('#start-wave');
    await page.mouse.move(640, 200);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction(() => __rush.state.stats.shots >= 1, null, { timeout: 3000 }).catch(() => {});
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
    await mp.tap('#btn-hero');
    await mp.waitForTimeout(200);
    await mp.screenshot({ path: `${OUT}/mobile-hero-card.png` });
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
    // Graphics quality (cycle 12): auto follows the frame rate; the pause button cycles auto -> high -> low and persists.
    const auto = await mp.evaluate(() => ({ ...__rush.quality, fps: __rush.fps }));
    // The automatic drop is one-way (quality.ts), so once it has happened the tier stays low whatever the fps reads now.
    check(auto.autoDropped ? auto.tier === 'low' : auto.fps < 30 ? auto.tier === 'low' : auto.fps > 50 ? auto.tier === 'high' : true, `auto quality at ${auto.fps}fps → ${auto.tier}${auto.autoDropped ? ' (dropped earlier)' : ''}`);
    await mp.tap('#pause');
    await mp.waitForTimeout(200);
    await mp.tap('#btn-quality');
    const high = await mp.evaluate(() => ({ ...__rush.quality, w: __rush.info().buffer[0] }));
    await mp.tap('#btn-quality');
    await mp.waitForTimeout(100);
    await mp.screenshot({ path: `${OUT}/mobile-pause.png` });
    const low = await mp.evaluate(() => ({ ...__rush.quality, w: __rush.info().buffer[0] }));
    check(high.pref === 'high' && low.pref === 'low' && low.w < high.w && (await mp.textContent('#btn-quality')).includes('낮음'), `pause button sets quality (buffer width ${high.w} → ${low.w})`);
    await mp.reload();
    await mp.waitForTimeout(500);
    check(await mp.evaluate(() => __rush.quality.pref === 'low' && __rush.quality.tier === 'low'), 'quality setting persists across reload');
    check(merrors.length === 0, `mobile page errors: ${merrors.join(' | ') || 'none'}`);
    await ctx.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log(`screenshots: ${OUT}`);
  if (failures.length) { console.error(`${failures.length} check(s) failed`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
