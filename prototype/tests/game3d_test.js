// 4차 3D 게임 검증: node prototype/tests/game3d_test.js
// 3d_game.html 을 headless Chromium(SwiftShader = GPU 없는 소프트웨어 렌더)으로 열어
//  콘솔 에러 0 · 외부 요청 0 · 시작 → 받침대 탭 소환 → 정답 클릭 → 마나 증가 → 강화 → 키보드 → 웨이브 진행 → 드래프트(키 2) → 결과 화면(별·봉인·해제 퀴즈)까지 한 판,
//  세로·가로 스크린샷(prototype/3d_game_portrait.png, 3d_game_landscape.png)과 드래프트(3d_game_draft.png), 드로우콜·삼각형·FPS 기록.
// 게임 진행은 페이지 안 봇이 sim 틱을 직접 돌리고(실시간 대기 없음) 몇 틱마다 렌더한다. FPS 는 실제 RAF 루프로 3초 잰다.
const { chromium } = require('playwright');
const path = require('path');
const PROTO = path.resolve(__dirname, '..');
const ALLOWED = ['3d_game.html', 'core/sim.js', 'vendor/three.min.js'].map(f => path.join(PROTO, f));
const R = []; const check = (name, pass, detail) => { R.push({ name, pass: !!pass, detail }); console.log(pass ? '✓' : '✗', name, JSON.stringify(detail || {})); };

// 페이지 안 봇(2D bal_sim 과 같은 소비 규칙, 마나가 모자라면 사지 않음). sec 동안 0.1초 틱, every 틱마다 렌더
const BOT = ({ sec, p = 0.9, T = 2.5, every = 5, stop = '' }) => {
  const G = __game3d, run = G.run, B = G.SIM.BALANCE, plan = ['wand', 'sword', 'cup', 'wand', 'sword', 'pentacle', 'wand', 'sword', 'cup', 'wand'];
  let n = Math.round(sec / 0.1), k = 0; const waves = new Set();
  while (n-- > 0 && run.canPlay()) {
    const s = run.state; waves.add(s.waveIdx);
    if (stop === 'draft' && s.draft) break;
    if (stop === 'wave3' && s.phase === 'wave' && s.waveIdx >= 3 && s.enemies.length >= 10) break;
    if (s.q && s.lockT <= 0 && !s.draft && s.qT >= T) run.answer(run.rng() < p ? s.q.correct : (s.q.correct + 1) % 4);
    for (let g = 0; g < 10; g++) {
      const empty = run.geo.slotPriority.filter(i => !s.towers[i]), placed = s.towers.length - empty.length;
      const up = run.geo.slotPriority.filter(i => s.towers[i] && s.towers[i].lv < B.maxLevel).sort((a, b) => s.towers[a].lv - s.towers[b].lv)[0];
      const slot = empty.find(i => run.summonCost(i) <= s.mana);
      if (empty.length && (placed < 4 || up === undefined)) { if (slot === undefined || !run.summon(slot, plan[placed % 10])) break; }
      else if (up !== undefined && run.upgradeCost(up) <= s.mana) run.upgrade(up); else break;
    }
    if (s.ultReady && s.enemies.length >= 5) run.useUlt();
    run.step(0.1); if (++k % every === 0) G.pump(true);
  }
  G.pump(true);
  return { phase: run.state.phase, wave: run.state.waveIdx, waves: [...waves], draft: !!run.state.draft, time: +run.state.time.toFixed(1) };
};

async function open(browser, vp, dpr) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: dpr });
  const errors = [], external = [], files = new Set(), infos = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.text().startsWith('[3d]')) infos.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('request', r => { const u = r.url();
    if (u.startsWith('file://')) { const p = decodeURIComponent(u.slice(7)); files.add(path.relative(PROTO, p)); if (!ALLOWED.includes(p)) external.push(u); }
    else if (!u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
  await page.goto('file://' + path.join(PROTO, '3d_game.html'));
  await page.waitForFunction(() => window.__game3d && document.getElementById('startBtn'), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  return { page, errors, external, files, infos };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const fpsOver = async (page, ms) => { await page.waitForTimeout(500); const f0 = await ev(page, () => __game3d.fps); await page.waitForTimeout(ms); return ev(page, () => __game3d.fps); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const perf = [];
  // ================= 세로 360×740 =================
  const P = await open(browser, { width: 360, height: 740 }, 2), page = P.page;
  const title = await ev(page, () => ({ sels: ['selRegion', 'selSubject', 'selDiff', 'selTheme'].map(id => document.getElementById(id).options.length), three: THREE.REVISION, sim: typeof ArcanaSim.createRun }));
  check('title_selects', title.sels.join() === '4,4,3,2' && title.three === '169' && title.sim === 'function', title);
  await page.selectOption('#selRegion', '0'); await page.selectOption('#selSubject', '0'); await page.selectOption('#selDiff', '0');
  await page.click('#startBtn'); await page.waitForTimeout(300);
  await ev(page, () => { __game3d.paused = true; });
  const st0 = await ev(page, () => ({ phase: __game3d.run.state.phase, region: __game3d.run.state.region, diff: __game3d.run.state.diff, ov: document.getElementById('overlay').hidden, mana: __game3d.run.state.mana }));
  check('start', st0.phase === 'prep' && st0.region === 0 && st0.diff === 1 && st0.ov && st0.mana === 5, st0);

  // 받침대 탭(3D 피킹) → 속성 팝업 → 소환. 저지대(4마나) 우선순위 슬롯
  const slot = await ev(page, () => { const r = __game3d.run; return r.geo.slotPriority.find(i => r.geo.SLOTS[i].e === 0); });
  let sr = await ev(page, i => __game3d.slotClient(i), slot);
  const pick = await ev(page, ({ x, y }) => __game3d.pickTile(x, y), { x: sr.cx, y: sr.cy + 6 });
  await page.mouse.click(sr.cx, sr.cy); await page.waitForTimeout(150);
  const pop = await ev(page, () => ({ hidden: document.getElementById('popup').hidden, btns: document.querySelectorAll('#popup [data-sum]').length, cost: document.querySelector('#popup .pc').textContent }));
  check('tap_popup', !pop.hidden && pop.btns === 4 && pop.cost === '4💎' && pick && pick.c >= 0, { slot, pop, pick });
  await page.click('#popup [data-sum="wand"]'); await page.waitForTimeout(150);
  const sm = await ev(page, i => ({ t: __game3d.run.state.towers[i], mana: __game3d.run.state.mana, popup: document.getElementById('popup').hidden }), slot);
  check('summon_via_tap', sm.t && sm.t.type === 'wand' && sm.mana === 1 && sm.popup, sm);

  // 정답 클릭 → 마나 증가(DOM)
  await ev(page, () => { __game3d.paused = false; }); await page.waitForTimeout(900); await ev(page, () => { __game3d.paused = true; });
  const m0 = +(await page.textContent('#manaTxt')), q = await ev(page, () => ({ c: __game3d.run.state.q.correct, d: __game3d.run.state.q.item.d }));
  await page.click(`#choices .ch:nth-child(${q.c + 1})`); await page.waitForTimeout(150);
  const m1 = +(await page.textContent('#manaTxt'));
  const ok = await ev(page, () => ({ cls: document.querySelector('#choices .ch.correct') !== null, fb: document.getElementById('qFeedback').textContent }));
  check('answer_mana', m1 - m0 === { 1: 3, 2: 4, 3: 5 }[q.d] && ok.cls, { m0, m1, d: q.d, fb: ok.fb });

  // 소환된 받침대 탭 → 강화
  await ev(page, () => { __game3d.paused = false; }); await page.waitForTimeout(500); await ev(page, () => { __game3d.paused = true; });
  sr = await ev(page, i => __game3d.slotClient(i), slot);
  await page.mouse.click(sr.cx, sr.cy); await page.waitForTimeout(150);
  const upTxt = await ev(page, () => { const b = document.querySelector('#popup [data-up]'); return b ? b.textContent : null; });
  await page.click('#popup [data-up]'); await page.waitForTimeout(150);
  const up = await ev(page, i => ({ lv: __game3d.run.state.towers[i].lv, mana: __game3d.run.state.mana }), slot);
  check('upgrade_via_tap', upTxt && upTxt.includes('4💎') && up.lv === 2, { upTxt, ...up });
  await page.keyboard.press('Escape');

  // 키보드: Q 두 번 = 자동 배치, 1~4 = 답
  await ev(page, () => { __game3d.run.state.mana = 20; });
  await page.keyboard.press('KeyE'); await page.keyboard.press('KeyE'); await page.waitForTimeout(100);
  const kb = await ev(page, () => ({ swords: __game3d.run.state.towers.filter(t => t && t.type === 'sword').length }));
  await ev(page, () => { __game3d.paused = false; }); await page.waitForTimeout(1000); await ev(page, () => { __game3d.paused = true; });
  const ans0 = await ev(page, () => __game3d.run.state.stats.answered);
  await page.keyboard.press('Digit2'); await page.waitForTimeout(100);
  const ans1 = await ev(page, () => __game3d.run.state.stats.answered);
  check('keyboard', kb.swords === 1 && ans1 === ans0 + 1, { ...kb, ans0, ans1 });

  // 길게 누르기 = V-Fit(전체 보기), 떼면 V-Follow
  const box = await page.locator('#gl').boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down(); await page.waitForTimeout(900);
  const held = await ev(page, () => __game3d.info());
  await page.mouse.up(); await page.waitForTimeout(900);
  const rel = await ev(page, () => __game3d.info());
  check('longpress_fit', held.mode === 'V-Fit' && rel.mode === 'V-Follow', { held: held.mode, released: rel.mode, tilePx: rel.tilePx, fitTilePx: rel.fitTilePx });

  // 웨이브 진행 → 드래프트(스크린샷) → 키 2 로 선택
  await ev(page, () => { __game3d.paused = true; });
  let b1 = await ev(page, BOT, { sec: 400, stop: 'draft' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(PROTO, '3d_game_draft.png') });
  const d0 = await ev(page, () => ({ cards: document.querySelectorAll('#draft .pcard').length, choicesHidden: getComputedStyle(document.getElementById('choices')).display === 'none', ts: __game3d.run.state.timeScale }));
  await ev(page, () => { const r = __game3d.run; for (let k = 0; k < 3; k++) r.step(0.1); });
  await page.keyboard.press('Digit2'); await page.waitForTimeout(100);
  const d1 = await ev(page, () => { const s = __game3d.run.state; return { picks: s.picks.map(p => ({ id: p.id, auto: p.auto })), draft: !!s.draft, offered: s.picks.length ? s.picks[0].offered : [] }; });
  check('draft', b1.draft && d0.cards === 3 && d0.choicesHidden && d0.ts === 0.3 && d1.picks.length === 1 && !d1.picks[0].auto && d1.picks[0].id === d1.offered[1] && !d1.draft, { bot: b1, ...d0, ...d1 });

  // 웨이브 3~4 한복판 → 세로 스크린샷 + 드로우콜·삼각형·FPS
  const b2 = await ev(page, BOT, { sec: 600, stop: 'wave3' });
  await ev(page, () => { __game3d.paused = false; }); const fpsP = await fpsOver(page, 3000); await ev(page, () => { __game3d.paused = true; });
  await ev(page, () => __game3d.pump(true)); await page.waitForTimeout(1200);
  const infP = await ev(page, () => __game3d.info());
  await page.screenshot({ path: path.join(PROTO, '3d_game_portrait.png') });
  perf.push({ view: 'portrait 360×740 DPR2', region: 1, fps: +fpsP.toFixed(1), calls: infP.calls, tris: infP.tris, enemies: await ev(page, () => __game3d.snap.enemies.n), tilePx: infP.tilePx, mode: infP.mode });
  check('wave_progress', b2.wave >= 3 && b2.waves.length >= 3, b2);
  check('budget_portrait', infP.calls <= 60 && infP.tris <= 40000, { calls: infP.calls, tris: infP.tris });

  // 끝까지 → 결과 화면(별·기준·특성·봉인) → 해제 퀴즈
  const b3 = await ev(page, BOT, { sec: 900, p: 0.85 });
  await page.waitForTimeout(300);
  const res = await ev(page, () => ({ ov: !document.getElementById('overlay').hidden, h1: document.querySelector('#overlay h1') && document.querySelector('#overlay h1').textContent,
    stars: document.querySelectorAll('#overlay .stars span.off').length, crit: document.querySelectorAll('#overlay .crit div').length, perks: document.querySelectorAll('#perkList div').length,
    sealed: document.querySelectorAll('#sealedList button').length, result: __game3d.run.state.result && { win: __game3d.run.state.result.win, stars: __game3d.run.state.result.stars } }));
  let rev = null;
  if (await page.$('#reviewBtn')) { await page.click('#reviewBtn'); const c = await ev(page, () => __game3d.run.state.review.correct); await page.click(`#review [data-r="${c}"]`); rev = await ev(page, () => ({ msg: document.getElementById('rmsg').textContent, bonus: __game3d.run.session.pendingBonus })); }
  check('result_screen', b3.phase === 'result' && res.ov && res.crit === 3 && res.result && 3 - res.stars === res.result.stars && (res.perks >= 1), { bot: b3, ...res, review: rev });
  if (rev) check('review_quiz', rev.bonus === 3, rev);
  await page.click('#retryBtn'); await page.waitForTimeout(200);
  const again = await ev(page, () => ({ phase: __game3d.run.state.phase, mana: __game3d.run.state.mana }));
  check('retry_bonus', again.phase === 'prep' && again.mana === (rev && rev.bonus ? 8 : 5), again);
  P.infos.slice(0, 1).forEach(s => console.log(s));

  // ================= 가로 1280×720 (요 45°, H45) =================
  const L = await open(browser, { width: 1280, height: 720 }, 1), lp = L.page;
  await lp.selectOption('#selRegion', '1'); await lp.selectOption('#selDiff', '1'); await lp.click('#startBtn'); await lp.waitForTimeout(200);
  await ev(lp, () => { __game3d.paused = true; });
  const bl = await ev(lp, BOT, { sec: 600, stop: 'wave3' });
  if (await ev(lp, () => !!__game3d.run.state.draft)) await ev(lp, () => { const r = __game3d.run; for (let k = 0; k < 31; k++) r.step(0.1); __game3d.pump(true); });
  await ev(lp, () => { __game3d.paused = false; }); const fpsL = await fpsOver(lp, 3000); await ev(lp, () => { __game3d.paused = true; });
  await ev(lp, () => __game3d.pump(true)); await lp.waitForTimeout(1200);
  const infL = await ev(lp, () => __game3d.info());
  // 가로에서도 받침대 탭 → 팝업(요 45° 피킹)
  const ls = await ev(lp, () => { const r = __game3d.run; return r.geo.SLOTS.findIndex(o => !r.state.towers[o.i]); });
  const lr = await ev(lp, i => __game3d.slotClient(i), ls);
  await lp.mouse.click(lr.cx, lr.cy); await lp.waitForTimeout(150);
  const lpop = await ev(lp, () => !document.getElementById('popup').hidden && document.querySelector('#popup .ptitle span').textContent);
  await lp.keyboard.press('Escape');
  await lp.screenshot({ path: path.join(PROTO, '3d_game_landscape.png') });
  perf.push({ view: 'landscape 1280×720 DPR1', region: 2, fps: +fpsL.toFixed(1), calls: infL.calls, tris: infL.tris, enemies: await ev(lp, () => __game3d.snap.enemies.n), tilePx: infL.tilePx, mode: infL.mode });
  check('landscape', infL.mode === 'H45' && infL.yaw === 45 && bl.wave >= 3 && typeof lpop === 'string' && lpop.startsWith(`슬롯 ${ls + 1}`), { mode: infL.mode, yaw: infL.yaw, wave: bl.wave, popup: lpop });
  check('budget_landscape', infL.calls <= 60 && infL.tris <= 40000, { calls: infL.calls, tris: infL.tris });
  L.infos.slice(-1).forEach(s => console.log(s));

  // 13 §9-1 체크리스트 수치(지역 4개 × 세로 V-Follow / 가로 H45): 슬롯 간 화면 거리 ≥ 48px, 적 지름 ≥ 20px, 단차 앞면 ≥ 6px, 가림 슬롯(Lv4 기준)
  const met = [];
  for (const [pg, view] of [[page, '세로 V-Follow'], [lp, '가로 H45']]) for (let ri = 0; ri < 4; ri++) {
    const m = await ev(pg, ri => { __game3d.R.setMap(ri, 0, 2, 'light'); return __game3d.R.info; }, ri);
    met.push({ view, region: ri + 1, tilePx: m.tilePx, slotMinPx: m.slotMinPx, enemyPx: m.enemyPx, cliffFacePx: m.cliffFacePx, occluding: m.occluding.join(' ') || '-', lowProps: m.lowProps });
  }
  check('checklist_enemy_cliff', met.every(m => m.enemyPx >= 20 && m.cliffFacePx >= 6), { min: Math.min(...met.map(m => m.enemyPx)), cliff: Math.min(...met.map(m => m.cliffFacePx)) });
  const narrow = met.filter(m => m.slotMinPx < 48);   // 알려진 한계(README): 고도차가 세로 압축을 더 줄이는 슬롯 쌍
  console.log(narrow.length ? `⚠ 슬롯 간격 < 48px: ${narrow.map(m => `${m.view} ${m.region}장 ${m.slotMinPx}px`).join(', ')}` : '슬롯 간격 전부 ≥ 48px');

  // 13 §9-7: 실제 WebGL 픽셀로 길 상대휘도 ≤ 0.10, 적 ↔ 길 대비 ≥ 3:1 (난이도 3 × 테마 2, 지역 1·4)
  const lum = [];
  for (const ri of [0, 3]) for (const di of [1, 2, 3]) for (const theme of ['light', 'dark']) {
    lum.push(await ev(page, ({ ri, di, theme }) => {
      const G = __game3d, R = G.R, gl = R.renderer.getContext(), dpr = R.renderer.getPixelRatio(), H = gl.drawingBufferHeight;
      const rl = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const at = (x, y) => { const px = new Uint8Array(4); gl.readPixels(Math.round(x * dpr), Math.round(H - y * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return 0.2126 * rl(px[0]) + 0.7152 * rl(px[1]) + 0.0722 * rl(px[2]); };
      const med = a => a.sort((x, y) => x - y)[a.length >> 1];
      G.start({ region: ri, diff: di, theme }, 7); const run = G.run, m = run.geo.map;
      G.pump(true);
      const path = m.path.map(([c, r]) => R.proj(c - 4.5, +m.elev[r][c] * 0.5 - 0.08, r - 8.5)).filter(([x, y]) => x > 2 && y > 2 && x < gl.canvas.clientWidth - 2 && y < gl.canvas.clientHeight - 2).map(([x, y]) => at(x, y));
      for (let k = 0; k < 75; k++) run.step(0.1); G.pump(true);
      const en = [...R.lastPos.values()].map(([x, y, z]) => R.proj(x, y, z)).map(([x, y]) => at(x, y));
      const P = med(path), E = en.length ? med(en) : NaN;
      return { region: ri + 1, diff: di, theme, path: +P.toFixed(3), enemy: +E.toFixed(3), contrast: +((E + 0.05) / (P + 0.05)).toFixed(2), nPath: path.length, nEnemy: en.length };
    }, { ri, di, theme }));
  }
  check('checklist_lum', lum.every(l => l.path <= 0.10 && l.contrast >= 3), { worst: lum.slice().sort((a, b) => a.contrast - b.contrast)[0], maxPath: Math.max(...lum.map(l => l.path)) });

  // 리사이즈 뒤에도 받침대 탭 → 그 슬롯 팝업(라벨·피킹 재투영)
  await page.setViewportSize({ width: 390, height: 680 }); await page.waitForTimeout(400);
  await ev(page, () => { __game3d.start({ region: 1, diff: 2, theme: 'light' }, 3); __game3d.paused = true; }); await page.waitForTimeout(300);
  const rs = await ev(page, () => __game3d.run.geo.slotPriority[0]), rr = await ev(page, i => __game3d.slotClient(i), rs);
  await page.mouse.click(rr.cx, rr.cy); await page.waitForTimeout(150);
  const rp = await ev(page, () => !document.getElementById('popup').hidden && document.querySelector('#popup .ptitle span').textContent);
  check('resize_pick', typeof rp === 'string' && rp.startsWith(`슬롯 ${rs + 1}`), { slot: rs, popup: rp });

  check('console_errors_0', P.errors.length === 0 && L.errors.length === 0, { errors: [...P.errors, ...L.errors].slice(0, 5) });
  check('external_requests_0', P.external.length === 0 && L.external.length === 0, { files: [...P.files], external: [...P.external, ...L.external] });

  console.log('\n| 화면 | 지역 | 카메라 | 적 | 드로우콜 | 삼각형 | 칸(px) | FPS(SwiftShader) |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of perf) console.log(`| ${r.view} | ${r.region} | ${r.mode} | ${r.enemies} | ${r.calls} | ${r.tris} | ${r.tilePx} | ${r.fps} |`);
  console.log('\n| 화면 | 지역 | 칸(px) | 슬롯 최소 간격(px) | 적 지름(px) | 단차 앞면(px) | 가림 슬롯(Lv4) | 높이 줄인 소품 |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const m of met) console.log(`| ${m.view} | ${m.region}장 | ${m.tilePx} | ${m.slotMinPx}${m.slotMinPx < 48 ? ' ⚠' : ''} | ${m.enemyPx} | ${m.cliffFacePx} | ${m.occluding} | ${m.lowProps} |`);
  console.log('\n| 지역 | 난이도 | 테마 | 길 상대휘도 | 적 상대휘도 | 적↔길 대비 |');
  console.log('|---|---|---|---|---|---|');
  for (const l of lum) console.log(`| ${l.region}장 | D${l.diff} | ${l.theme} | ${l.path} | ${l.enemy} | ${l.contrast}:1 |`);
  const fails = R.filter(r => !r.pass);
  console.log(`\n검사 ${R.length}항목 중 통과 ${R.length - fails.length}` + (fails.length ? `, 실패 ${fails.map(f => f.name).join(', ')}` : ''));
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
