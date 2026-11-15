// Requires a running Vite server and Playwright; BASE_URL defaults to the local dev port.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const missing of ['', 'frost-brace-2-atlas.webp', 'frost-stride-2-atlas.webp']) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (missing) await page.route(`**/${missing}`, route => route.abort());
      await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3100/');
      await page.evaluate(async () => {
        const urls = performance.getEntriesByType('resource').map(entry => entry.name);
        const React = (await import(urls.find(url => url.includes('/react.js?')))).default;
        const { createRoot } = (await import(urls.find(url => url.includes('/react-dom_client.js?')))).default;
        const { DefenseBoard } = await import('/src/components/DefenseBoard.tsx');
        const { createDefense } = await import('/src/games/defense/engine.ts');
        // Use the board's transformed module URL so its image cache is the one preloaded.
        const source = await (await fetch('/src/components/DefenseBoard.tsx')).text();
        const artUrl = source.match(/from "(\/src\/games\/defense\/art\.ts[^"]*)"/)[1];
        await (await import(artUrl)).preloadDefenseMotion();
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;align-content:center';
        document.body.append(host);
        const root = createRoot(host);
        window.drawWolf = async (direction, cycles, hit, knock) => {
          const state = createDefense(5, 'mage');
          state.phase = 'wave';
          state.enemies = [{ id: 0, kind: 'frostwolf', path: 0, progress: 320, x: 430, y: 360,
            hp: 100, maxHp: 100, speed: 62, baseSpeed: 62, hit, recoil: 0, burn: 0, wet: 0,
            slow: 0, shock: 0, knockVelocity: knock, facing: direction > 2 && direction < 6 ? -1 : 1,
            walkDistance: cycles * 40, walkSpeed: 62, walkCycles: cycles,
            walkHeading: { x: Math.cos(direction * Math.PI / 4), y: Math.sin(direction * Math.PI / 4) } }];
          root.render(React.createElement(DefenseBoard, { state, selectedSlot: null, onSelect() {}, onMove() {} }));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        };
        await window.drawWolf(0, 0, 0, 0);
      });
      const wolf = page.locator('[data-enemy="frostwolf"]').last();
      for (let direction = 0; direction < 8; direction++) {
        const frames = new Set();
        for (const [cycles, hit, knock] of [[0, 0, 0], [.25, 0, 0], [.5, .1, 0], [.75, 0, 80]]) {
          await page.evaluate(args => window.drawWolf(...args), [direction, cycles, hit, knock]);
          const image = wolf.locator('image').first();
          const src = await image.getAttribute('href');
          if (missing.startsWith('frost-stride')) {
            assert.match(src, /frost-wolf-atlas/);
          } else {
            assert.match(src, new RegExp(`/frost-stride-${direction}-atlas\\.webp$`));
            frames.add(await image.locator('..').getAttribute('viewBox'));
            assert.equal(await wolf.getAttribute('data-walk-direction'), String(direction));
          }
        }
        if (!missing.startsWith('frost-stride')) assert.equal(frames.size, 1, `direction ${direction} must stay still`);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS reduced wolf: ${missing || 'all assets'}, eight directions and hit/knock states`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
