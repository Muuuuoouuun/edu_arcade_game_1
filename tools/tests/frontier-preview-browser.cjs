// Start Vite first; supply BASE_URL and Playwright through your local environment.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const failBoth of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/frontier-frost-forest.webp', route => route.abort());
      if (failBoth) await page.route('**/frontier-frost-cliffs.webp', route => route.abort());
      await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3100/frontier.html');
      if (failBoth) {
        await page.waitForFunction(() => document.querySelectorAll('.frontier-themes img')[1]?.hidden);
      } else {
        await page.waitForFunction(() => {
          const image = document.querySelectorAll('.frontier-themes img')[1];
          return image?.src.endsWith('frontier-frost-cliffs.webp') && image.complete && image.naturalWidth > 0;
        });
      }
      const button = page.getByRole('button', { name: /서리 협곡/ });
      assert.equal(await button.count(), 1);
      await button.tap();
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      assert.deepEqual(errors, []);
      console.log('PASS frost preview:', failBoth ? 'both images missing' : 'previous image');
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
