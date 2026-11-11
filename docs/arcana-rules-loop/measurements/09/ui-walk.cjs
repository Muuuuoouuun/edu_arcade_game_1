// Cycle 09 UI walk: landscape 844x390 touch phone, title -> village -> 1-1 build -> wave -> move -> dash -> skill.
// Needs the dev server (npm run dev, port 3100) and the preinstalled Playwright. Usage: node ui-walk.cjs <outdir>
// Prints DOM boxes for HUD, command buttons, build pads and the build panel; writes PNG screenshots to <outdir>.
const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:3100/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${out}/01-title.png` });
  await page.locator('button.arcana-start').first().click(); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/02-village.png` });
  await page.screenshot({ path: `${out}/02b-village-full.png`, fullPage: true });
  await page.locator('button.camp-enter-stage').click(); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/03-village-step.png` });
  // Handle any dialog with a primary button until battle shows (e.g. hero confirm)
  for (let i = 0; i < 4 && !await page.locator('main.battle-page').count(); i++) {
    const b = page.locator('[role="dialog"] button.defense-primary, [role="dialog"] button:has-text("출전"), [role="dialog"] button:has-text("입장"), button:has-text("출발")').first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(900); } else break;
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/04-battle-prep.png` });
  // Measure HUD and command targets.
  const boxes = await page.evaluate(() => [...document.querySelectorAll('.battle-hud > *, .battle-utilities > button, .battle-commands > button, .def-build-pad, .battle-input-note, .battle-camera button')].map(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { cls: el.className.baseVal ?? el.className, text: (el.textContent||'').trim().slice(0,24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), font: cs.fontSize, visible: r.width>0&&r.height>0 }; }));
  const map = await page.evaluate(() => { const r = document.querySelector('.battle-map-space')?.getBoundingClientRect(); const svg = document.querySelector('.battle-map-space svg')?.getBoundingClientRect(); return { space: r && [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)], svg: svg && [Math.round(svg.x),Math.round(svg.y),Math.round(svg.width),Math.round(svg.height)] }; });
  // Tap the first build pad.
  const pad = page.locator('.def-build-pad').first();
  if (await pad.count()) { const r = await pad.boundingBox(); await page.touchscreen.tap(r.x + r.width/2, r.y + r.height/2); await page.waitForTimeout(700); }
  await page.screenshot({ path: `${out}/05-build-panel.png` });
  const panelBoxes = await page.evaluate(() => [...document.querySelectorAll('.defense-tactical button')].map(el => { const r = el.getBoundingClientRect(); return { text: (el.textContent||'').trim().slice(0,30), w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) }; }));
  const buy = page.locator('.tactical-towers button:not([disabled])').nth(1);
  if (await buy.count()) { await buy.click(); await page.waitForTimeout(500); }
  // Second tower on another pad.
  const pad2 = page.locator('.def-build-pad:not(.occupied)').nth(1);
  if (await pad2.count()) { const r = await pad2.boundingBox(); await page.touchscreen.tap(r.x + r.width/2, r.y + r.height/2); await page.waitForTimeout(500); const b = page.locator('.tactical-towers button:not([disabled])').first(); if (await b.count()) { await b.click(); await page.waitForTimeout(400); } }
  await page.locator('button.battle-start').click(); await page.waitForTimeout(6500);
  await page.screenshot({ path: `${out}/06-wave.png` });
  // Tap the road to move the hero, then aim dash.
  const svgBox = await page.locator('.battle-map-space svg').first().boundingBox();
  if (svgBox) { await page.touchscreen.tap(svgBox.x + svgBox.width*0.30, svgBox.y + svgBox.height*0.47); await page.waitForTimeout(800); }
  await page.locator('button.battle-dash').click(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/07-dash-aim.png` });
  if (svgBox) { await page.touchscreen.tap(svgBox.x + svgBox.width*0.55, svgBox.y + svgBox.height*0.55); await page.waitForTimeout(500); }
  const skill = page.locator('button.battle-skill'); if (await skill.isEnabled()) { await skill.click(); }
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/08-skill.png` });
  const state = await page.evaluate(() => { const m = document.querySelector('main.battle-page'); return m && { phase: m.dataset.phase, heroX: m.dataset.heroX, heroY: m.dataset.heroY, dash: m.dataset.dashCooldown, note: document.querySelector('.battle-input-note')?.textContent }; });
  console.log(JSON.stringify({ errors, map, boxes, panelBoxes, state }, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
