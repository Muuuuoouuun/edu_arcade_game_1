// Shader compile probe (cycle 128): when does WebGL compile and link programs, and does it land inside a battle frame?
// Wraps the WebGL2 compile/link calls before the page loads, runs the demo battle, and prints every program linked after
// the battle started: its game tick, the time spent in the wrapped calls and the length of the frame it fell in.
// Usage: start a server (npx vite --port 3150), then
//   node tools/rush-shader-probe.cjs [baseUrl=http://127.0.0.1:3150] [extraQuery=] [seconds=60]
// Software GL (SwiftShader): the counts and the tick are what to trust; the ms are only for comparing runs.
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:3150', EXTRA = process.argv[3] || '', SECONDS = Number(process.argv[4] || 60);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ ...devices['Pixel 7 landscape'] })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => {
    const log = window.__glLog = { links: [], frames: [], busy: 0 };
    Error.stackTraceLimit = 80;
    const P = WebGL2RenderingContext.prototype;
    const wrap = (name, onDone) => {
      const orig = P[name];
      P[name] = function (...a) {
        const t0 = performance.now(); const r = orig.apply(this, a); const dt = performance.now() - t0;
        log.busy += dt; if (onDone) onDone(dt, a, r);
        return r;
      };
    };
    // The call stack names the render.ts function that drew the new material first (dev build, not minified).
    const where = () => (new Error().stack || '').split('\n').filter(l => l.includes('/src/rush/')).slice(0, 3)
      .map(l => l.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\/src\/rush\//, '').replace(/\?[^:]*/, '').replace(/\)$/, '')).join(' < ');
    wrap('compileShader');
    wrap('getShaderParameter');
    wrap('getProgramParameter');
    wrap('linkProgram', () => {
      const r = window.__rush;
      log.links.push({ t: performance.now(), tick: r && r.state ? r.state.tick : -1, mode: r ? r.mode : '-', where: where() });
    });
    let last = performance.now();
    const loop = now => { log.frames.push([now, now - last]); last = now; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  const t0 = Date.now();
  await page.goto(`${BASE}/rush.html?demo=1&seed=3&speed=2${EXTRA ? '&' + EXTRA : ''}`);
  await page.waitForFunction(() => window.__rush && __rush.mode === 'demo' && __rush.state && __rush.state.tick > 0, null, { timeout: 180000 });
  const loadMs = Date.now() - t0;
  const startT = await page.evaluate(() => performance.now());
  await page.waitForTimeout(SECONDS * 1000);
  const out = await page.evaluate(startT => {
    const log = window.__glLog;
    const frameAt = t => { const f = log.frames.find(([end]) => end >= t); return f ? f[1] : null; };
    const before = log.links.filter(l => l.t < startT).length;
    const during = log.links.filter(l => l.t >= startT).map(l => ({ tick: l.tick, frameMs: Math.round(frameAt(l.t)), where: l.where }));
    const deltas = log.frames.filter(([end]) => end >= startT).map(f => f[1]).sort((a, b) => a - b);
    const p = q => Math.round(deltas[Math.floor(q * (deltas.length - 1))]);
    return { before, during, frames: deltas.length, median: p(0.5), p95: p(0.95), worst: p(1), tick: __rush.state.tick, programs: __rush.info().memory.programs, glBusyMs: Math.round(log.busy) };
  }, startT);
  const { during, ...rest } = out;
  console.log(JSON.stringify({ query: EXTRA, loadMs, ...rest, linkedInBattle: during.length, errors: errs.slice(0, 3) }));
  for (const d of during) console.log(`tick ${String(d.tick).padStart(5)}  frame ${String(d.frameMs).padStart(5)} ms  ${d.where}`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
