// 아르카나 수비대 프로토타입 검증: node proto_test.js
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOT = path.resolve(__dirname, '..', 'screenshot.png');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
  const external = [];
  page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) external.push(r.url()); });

  await page.clock.install();             // 실제 게임 루프(RAF/performance.now)를 가상 시계로 제어
  await page.goto(FILE);
  await page.clock.runFor(200);
  const results = {};
  const st = (expr) => page.evaluate(expr);

  // 시작
  await page.click('#startBtn');
  await page.clock.runFor(100);
  results.started = await st(() => __arcana.state.phase === 'prep');

  // (b) 정답 클릭 → 마나 증가
  const manaDomBefore = +(await page.textContent('#manaTxt'));
  const { correct, d } = await st(() => ({ correct: __arcana.state.q.correct, d: __arcana.state.q.item.d }));
  await page.click(`#choices .ch:nth-child(${correct + 1})`);
  await page.clock.runFor(100);
  const manaDomAfter = +(await page.textContent('#manaTxt'));
  const expected = { 1: 3, 2: 4, 3: 5 }[d];
  results.b_manaOnCorrect = { before: manaDomBefore, after: manaDomAfter, expectedGain: expected, pass: manaDomAfter - manaDomBefore === expected };
  // 오답 → 콤보 0, 봉인 등록
  await page.clock.runFor(500);
  const wrongIdx = await st(() => (__arcana.state.q.correct + 1) % 4);
  const manaW0 = await st(() => __arcana.state.mana);
  await page.keyboard.press(`Digit${wrongIdx + 1}`);   // 키보드 1~4 경로
  await page.clock.runFor(100);
  results.wrongAnswer = await st(() => ({ combo: __arcana.state.combo, wrong: __arcana.state.stats.wrong, quizLocked: document.getElementById('quiz').classList.contains('locked') }));
  results.wrongAnswer.manaUnchanged = (await st(() => __arcana.state.mana)) === manaW0;
  await page.clock.runFor(2200);

  // (c) 슬롯 클릭 → 팝업 → 소환
  const manaC0 = await st(() => __arcana.state.mana);
  const p0 = await st(() => __arcana.slotClientPos(0));
  await page.mouse.click(p0.x, p0.y);
  await page.clock.runFor(50);
  const popupVisible = await page.isVisible('#popup [data-sum="wand"]');
  await page.click('#popup [data-sum="wand"]');
  await page.clock.runFor(50);
  const t0 = await st(() => __arcana.state.towers[0]);
  results.c_summon = { popupVisible, tower: t0, manaBefore: manaC0, manaAfter: await st(() => __arcana.state.mana), pass: popupVisible && t0 && t0.type === 'wand' };
  // 소환된 슬롯 탭 → 강화 팝업
  for (let i = 0; i < 2; i++) { await st(() => __arcana.answerCorrect()); await page.clock.runFor(400); }
  await page.mouse.click(p0.x, p0.y);
  await page.clock.runFor(50);
  const upVisible = await page.isVisible('#popup [data-up]');
  const canUp = await st(() => __arcana.state.mana >= 4);
  if (upVisible && canUp) await page.click('#popup [data-up]');
  await page.clock.runFor(50);
  results.c_upgrade = { upVisible, level: await st(() => __arcana.state.towers[0].lv) };
  await page.keyboard.press('Escape');
  // 키보드 Q/W/E/R: E 두 번 → 자동 배치
  await st(() => { __arcana.state.mana += 0; });
  for (let i = 0; i < 2; i++) { await st(() => __arcana.answerCorrect()); await page.clock.runFor(400); }
  await page.keyboard.press('KeyE'); await page.keyboard.press('KeyE');
  await page.clock.runFor(50);
  results.keyboardAutoPlace = await st(() => __arcana.state.towers.filter(Boolean).map(t => t.type + t.lv));

  // (d) 60초 시뮬레이션 (실제 RAF 루프를 가상 시계로 60초 진행, 그동안 문제는 방치 → 자동 교체 확인)
  const t0sim = await st(() => __arcana.state.time);
  const samples = [];
  let warnSeen = false;
  for (let s = 0; s < 60; s++) {
    await page.clock.runFor(1000);
    const snap = await st(() => ({ t: +__arcana.state.time.toFixed(1), phase: __arcana.state.phase, wave: __arcana.state.waveIdx + 1,
      n: __arcana.state.enemies.length, dists: __arcana.state.enemies.map(e => Math.round(e.dist)), hp: __arcana.state.hp,
      warn: document.getElementById('quiz').classList.contains('warn'), skipped: __arcana.state.stats.skipped, killed: __arcana.state.stats.killed }));
    warnSeen = warnSeen || snap.warn;
    if (s % 10 === 9) samples.push({ t: snap.t, phase: snap.phase, wave: snap.wave, enemies: snap.n, maxDist: Math.max(0, ...snap.dists), hp: snap.hp, killed: snap.killed });
  }
  const simTime = (await st(() => __arcana.state.time)) - t0sim;
  // 적 이동 확인: 60초 시점의 적 id별 거리 → 0.5초 후 비교
  let before = await st(() => __arcana.state.enemies.map(e => ({ id: e.id, d: e.dist })));
  let extra = 0;
  while (!before.length && extra < 20) { await page.clock.runFor(1000); extra++; before = await st(() => __arcana.state.enemies.map(e => ({ id: e.id, d: e.dist }))); }
  await page.clock.runFor(500);
  const after = await st(() => __arcana.state.enemies.map(e => ({ id: e.id, d: e.dist })));
  const moved = before.filter(b => { const a = after.find(x => x.id === b.id); return a && a.d > b.d; }).length;
  results.d_sim60 = { simulatedSec: +simTime.toFixed(1), extraSecToFindEnemies: extra, samples, enemiesAt60: before.length, movedIn0_5s: moved,
    skippedByIdle: await st(() => __arcana.state.stats.skipped), idleWarnSeen: warnSeen, pass: before.length > 0 && moved > 0 };

  // 스크린샷용: 마나 모아 몇 개 더 배치, 전투 중 장면
  for (let i = 0; i < 10; i++) { await st(() => __arcana.answerCorrect()); await page.clock.runFor(400); }
  await st(() => { const A = __arcana; ['sword', 'cup', 'pentacle', 'wand'].forEach(t => { const s = A.SLOT_PRIORITY.find(i => !A.state.towers[i]); if (s !== undefined) A.summon(s, t); }); });
  let waited = 0;
  while ((await st(() => __arcana.state.enemies.length)) < 4 && waited < 30) { await page.clock.runFor(1000); waited++; }
  await page.clock.runFor(300);
  await page.screenshot({ path: SHOT });

  // 콤보 보상 확인: 정답 8연속
  await page.clock.runFor(2500);
  await st(() => { const S = __arcana.state; S.combo = 0; S.discountReady = false; S.buffT = 0; S.ultReady = false; });
  const comboLog = [];
  for (let i = 0; i < 8; i++) {
    await st(() => __arcana.answerCorrect()); await page.clock.runFor(400);
    comboLog.push(await st(() => ({ c: __arcana.state.combo, disc: __arcana.state.discountReady, buff: __arcana.state.buffT > 0, ult: __arcana.state.ultReady })));
  }
  const ultEnabled = await st(() => !document.getElementById('ultBtn').disabled);
  await page.keyboard.press('Space');
  await page.clock.runFor(50);
  results.combo = { at3: comboLog[2], at5: comboLog[4], at8: comboLog[7], ultBtnEnabled: ultEnabled, ultUsed: await st(() => __arcana.state.stats.ults) };

  // 결과 화면: 강제로 함락시켜 결과/해제 퀴즈 확인
  await st(() => { __arcana.state.hp = 0; });
  await page.clock.runFor(100);
  const resultVisible = await page.isVisible('#retryBtn');
  const sealedCount = await page.locator('#sealedList button[data-id]').count();
  if (await page.isVisible('#reviewBtn')) {
    await page.click('#reviewBtn');
    await page.click('#review [data-r="0"]');
  }
  const reviewMsg = await page.textContent('#rmsg').catch(() => null);
  await page.click('#retryBtn');
  await page.clock.runFor(100);
  results.result = { resultVisible, sealedCount, reviewMsg, restarted: await st(() => __arcana.state.phase === 'prep'), restartMana: await st(() => __arcana.state.mana) };

  results.a_consoleErrors = errors;
  results.externalRequests = external;
  console.log(JSON.stringify(results, null, 1));
  const ok = errors.length === 0 && external.length === 0 && results.b_manaOnCorrect.pass && results.c_summon.pass && results.d_sim60.pass;
  console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
