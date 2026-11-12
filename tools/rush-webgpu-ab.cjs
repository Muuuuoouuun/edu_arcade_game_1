// Cycle 07 WebGPURenderer A/B measurement. Prerequisite: git apply docs/rush/cycles/07-webgpu-spike.patch, then
// run a Vite dev server on 3110 (the production build would merge three/webgpu into the shared three chunk).
// Usage: node tools/rush-webgpu-ab.cjs [outDir]
const { chromium } = require('playwright');
const OUT = require('node:path').resolve(process.argv[2] || 'rush-webgpu-ab');
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:3110/rush.html?demo=1&seed=3&speed=8&freeze=3409';
const SWIFT = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const runs = [
  ['webgl-default', '', SWIFT],
  ['webgpu-default-flags', '&renderer=webgpu', SWIFT],
  ['webgpu-unsafe-flags', '&renderer=webgpu', [...SWIFT, '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-webgpu-adapter=swiftshader']],
  ['webgpu-forcewebgl', '&renderer=webgpu&forcewebgl', SWIFT],
];
(async () => {
  for (const [name, q, args] of runs) {
    const browser = await chromium.launch({ args });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [], warnings = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') warnings.push(m.text()); });
    const t0 = Date.now();
    await page.goto(BASE + q);
    let result;
    try {
      await page.waitForFunction(() => window.__rush && window.__rush.frozen, null, { timeout: 120000 });
      await page.waitForTimeout(1500);
      result = await page.evaluate(() => ({ gpu: !!navigator.gpu, renderer: __rush.renderer, firstFrameMs: __rush.firstFrameMs, info: __rush.info() }));
      await page.screenshot({ path: `${OUT}/${name}.png` });
    } catch (e) { result = { failed: String(e).slice(0, 200) }; }
    const uniq = [...new Set(warnings.map(w => w.slice(0, 140)))];
    console.log(JSON.stringify({ name, ...result, wallToFrozenMs: Date.now() - t0, errors: [...new Set(errors.map(e => e.slice(0, 160)))].slice(0, 4), warnings: uniq.length, warningSamples: uniq.slice(0, 3) }));
    await browser.close();
  }
})();
