// 3D 렌더 스파이크 검증: node prototype/tests/spike_test.js
// (a) 콘솔 에러 0  (b) vendor 외 외부 요청 0  (c) 적 5/50/200 각 10초 평균 FPS·드로우콜·삼각형  (d) 스크린샷
// headless chromium 은 GPU 없이 SwiftShader(소프트웨어 렌더)로 그린다 → FPS 는 "소프트웨어 렌더 기준" 값.
const { chromium } = require('playwright');
const path = require('path');
const PROTO = path.resolve(__dirname, '..');
const SEC = +(process.env.SPIKE_SEC || 10);

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const errors = [], warnings = [], external = [], files = new Set();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') warnings.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('request', r => {
    const u = r.url();
    if (u.startsWith('file://')) {
      const p = decodeURIComponent(u.slice(7));
      files.add(path.relative(PROTO, p));
      if (!(p === path.join(PROTO, '3d_spike.html') || p.startsWith(path.join(PROTO, 'vendor') + path.sep))) external.push(u);
    } else if (!u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  await page.goto('file://' + path.join(PROTO, '3d_spike.html'));
  await page.waitForFunction(() => window.SPIKE_API, null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  const info = await page.evaluate(() => SPIKE_API.info());
  console.log('three r' + info.three, '| GL:', info.gl, '| dpr', info.dpr);

  const set = async (id, v) => { await page.selectOption('#' + id, String(v)); await page.waitForTimeout(150); };
  const setShadow = async on => { const cb = page.locator('#chkSh'); if ((await cb.isChecked()) !== on) await cb.click(); };
  const rows = [];
  const run = async (label, n, view, shadow = true) => {
    await set('selView', view); await set('selN', n); await setShadow(shadow);
    await page.waitForTimeout(1000); // 워밍업(셰이더 컴파일·그림자 맵)
    const r = await page.evaluate(s => SPIKE_API.measure(s), SEC);
    const t = (await page.evaluate(() => SPIKE_API.info())).tile;
    rows.push({ label, enemies: r.enemies, view, shadow, fps: +r.fps.toFixed(1), calls: +r.calls.toFixed(1), tris: Math.round(r.tris), maxFrameMs: +r.maxFrameMs.toFixed(0), tilePx: t.map(v => +v.toFixed(1)) });
    console.log(label.padEnd(22), JSON.stringify(rows[rows.length - 1]));
  };
  // 기준 조건: 1장 들판 · 난이도 1 · 직교 · 요 45° · 그림자 켬
  await run('portrait 5', 5, 'portrait');
  await run('portrait 50', 50, 'portrait');
  await run('portrait 200', 200, 'portrait');
  await run('portrait 200 noShadow', 200, 'portrait', false);
  await run('landscape 200', 200, 'landscape');
  await setShadow(true);

  // 스크린샷: [파일 접미사, 화면, 지역, 난이도, 카메라, 요, 적]
  const shots = [
    ['portrait_r1_d1', 'portrait', 0, 0, 'o', 45, 50],
    ['portrait_r1_d1_yaw0', 'portrait', 0, 0, 'o', 0, 50],
    ['portrait_r2_d2_persp', 'portrait', 1, 1, 'p', 45, 50],
    ['portrait_r3_d3_yaw0', 'portrait', 2, 2, 'o', 0, 50],
    ['landscape_r4_d1', 'landscape', 3, 0, 'o', 45, 50],
    ['landscape_r1_d2_200', 'landscape', 0, 1, 'p', 45, 200]
  ];
  for (const [name, view, r, d, cam, yaw, n] of shots) {
    await set('selView', view); await set('selR', r); await set('selD', d); await set('selCam', cam); await set('selYaw', yaw); await set('selN', n);
    await page.waitForTimeout(1500);
    const tile = (await page.evaluate(() => SPIKE_API.info())).tile;
    await page.locator('#app').screenshot({ path: path.join(PROTO, `3d_spike_${name}.png`) });
    console.log('shot', `prototype/3d_spike_${name}.png`, 'tilePx', tile.map(v => v.toFixed(1)).join('x'));
  }

  console.log('\n| 조건 | 적 | 평균 FPS | 드로우콜 | 삼각형 | 최대 프레임(ms) |');
  console.log('|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.view}${r.shadow ? '' : ' 그림자 끔'} | ${r.enemies} | ${r.fps} | ${r.calls} | ${r.tris} | ${r.maxFrameMs} |`);
  console.log('\nfiles loaded:', [...files].join(', '));
  console.log('external requests:', external.length, JSON.stringify(external));
  console.log('console errors:', errors.length, JSON.stringify(errors));
  console.log('console warnings:', warnings.length, JSON.stringify(warnings.slice(0, 5)));
  await browser.close();
  process.exit(errors.length || external.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
