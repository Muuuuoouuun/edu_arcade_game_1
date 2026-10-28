// 아르카나 수비대 프로토타입 3차 검증: node proto_test.js
// 1차 항목(마나·소환·강화·키보드·60초 진행·콤보·결과/해제 퀴즈) + 2차 항목(지역 선택 시작, 고도 사거리/비용/경사 속도, 오답 잠금, 읽기 하한, Lv4, 궁극기 유지)
// + 3차 항목(판 안 XP·레벨업, 드래프트 보류·카드 3장·키 선택·3초 자동 선택, 특성 효과·사거리 상한, 몰입 게이트·마나 상한, 비교 플래그, 결과 화면 특성 목록)
// 1·2차 항목은 특성 시스템을 끈 상태(BALANCE.perk.enabled = false)로 돌려 2차와 같은 조건에서 검증한다.
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOT = path.resolve(__dirname, '..', 'screenshot.png');
const SHOT_START = path.resolve(__dirname, '..', 'screenshot_start.png');
const SHOT_DRAFT = path.resolve(__dirname, '..', 'screenshot_draft.png');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

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
  await page.evaluate(() => { __arcana.BALANCE.perk.enabled = false; });   // 1·2차 항목: 특성 없이
  const R = {};
  const st = (fn, arg) => page.evaluate(fn, arg);
  const check = (name, pass, detail) => { R[name] = Object.assign({ pass: !!pass }, detail || {}); };

  // ── 시작 화면: 지역/과목/난이도 셀렉트 → 시작
  const titleSel = await st(() => ['selRegion', 'selSubject', 'selDiff'].map(id => document.getElementById(id) ? document.getElementById(id).options.length : 0));
  await page.selectOption('#selRegion', '1');        // 2장 메아리 숲
  await page.selectOption('#selSubject', '2');       // 과학 소품
  await page.selectOption('#selDiff', '1');          // 난이도 2
  await page.clock.runFor(200);
  const pvKey = await st(() => __arcana.bgCache.key);
  await page.screenshot({ path: SHOT_START });
  await page.click('#startBtn');
  await page.clock.runFor(100);
  const started = await st(() => ({ phase: __arcana.state.phase, region: __arcana.state.region, subject: __arcana.state.subject, diff: __arcana.state.diff,
    slots: __arcana.SLOTS.length, bgKey: __arcana.bgCache.key, bgMs: Math.round(__arcana.bgCache.ms) }));
  check('a_regionStart', titleSel.join() === '4,4,3' && started.phase === 'prep' && started.region === 1 && started.subject === 2 && started.diff === 2
    && started.slots === 9 && started.bgKey.startsWith('1-2-2@') && pvKey.startsWith('1-2-2@'), { titleSel, pvKey, ...started });

  // ── 정답 클릭 → 마나 증가 (표시 직후라 읽기 하한에 걸림: 마나는 주고 콤보는 그대로)
  const manaDomBefore = +(await page.textContent('#manaTxt'));
  const { correct, d } = await st(() => ({ correct: __arcana.state.q.correct, d: __arcana.state.q.item.d }));
  await page.click(`#choices .ch:nth-child(${correct + 1})`);
  await page.clock.runFor(100);
  const manaDomAfter = +(await page.textContent('#manaTxt'));
  const expected = { 1: 3, 2: 4, 3: 5 }[d];
  const fastCombo = await st(() => ({ combo: __arcana.state.combo, fast: __arcana.state.stats.fastCorrect }));
  check('b_manaOnCorrect', manaDomAfter - manaDomBefore === expected, { before: manaDomBefore, after: manaDomAfter, expectedGain: expected });
  check('b_readFloor_fastNoCombo', fastCombo.combo === 0 && fastCombo.fast === 1, fastCombo);
  await page.clock.runFor(1400);   // 정답 후 지연 0.35초 + 다음 문제 표시 후 0.8초 이상
  const readSlow = await st(() => { const A = __arcana, m0 = A.state.mana, qT = A.state.qT; A.answerCorrect(); return { qT: +qT.toFixed(2), combo: A.state.combo, gained: A.state.mana - m0 }; });
  check('b_readFloor_slowCombo', readSlow.combo === 1 && readSlow.gained > 0, readSlow);
  await page.clock.runFor(500);

  // ── 오답 잠금: 2초 → 연속 오답 3초 → 정답 시 리셋. 잠금 중 입력 무시, 카드 흐림 + 남은 시간 표시
  const wrongIdx = await st(() => (__arcana.state.q.correct + 1) % 4);
  const manaW0 = await st(() => __arcana.state.mana);
  await page.keyboard.press(`Digit${wrongIdx + 1}`);   // 키보드 1~4 경로
  await page.clock.runFor(100);
  const w1 = await st(() => { const S = __arcana.state, q = document.getElementById('quiz'), lb = document.getElementById('lockBadge');
    return { combo: S.combo, streak: S.wrongStreak, lockT: +S.lockT.toFixed(2), wlock: q.classList.contains('wlock'), badge: lb.hidden ? null : lb.textContent,
      blur: getComputedStyle(document.querySelector('#quiz.wlock #qText')).filter }; });
  w1.manaUnchanged = (await st(() => __arcana.state.mana)) === manaW0;
  const answeredBefore = await st(() => __arcana.state.stats.answered);
  await page.keyboard.press(`Digit${((wrongIdx + 1) % 4) + 1}`);
  await page.click('#choices .ch:nth-child(1)', { force: true }).catch(() => {});
  await page.clock.runFor(50);
  w1.inputIgnored = (await st(() => __arcana.state.stats.answered)) === answeredBefore;
  check('e_wrongLock_first', w1.combo === 0 && w1.streak === 1 && near(w1.lockT, 1.9, 0.11) && w1.wlock && /🔒 [0-9.]+초/.test(w1.badge || '') && w1.blur.includes('blur')
    && w1.manaUnchanged && w1.inputIgnored, w1);
  await page.clock.runFor(2000);
  const afterLock = await st(() => ({ lockT: __arcana.state.lockT, wlock: document.getElementById('quiz').classList.contains('wlock'), badgeHidden: document.getElementById('lockBadge').hidden }));
  await page.clock.runFor(900);
  const w2 = await st(() => { __arcana.answerWrong(); return { streak: __arcana.state.wrongStreak, lockT: +__arcana.state.lockT.toFixed(2) }; });
  await page.clock.runFor(3100);
  await page.clock.runFor(900);
  const w3 = await st(() => { __arcana.answerWrong(); return { streak: __arcana.state.wrongStreak, lockT: +__arcana.state.lockT.toFixed(2) }; });
  await page.clock.runFor(4100);
  await page.clock.runFor(900);
  const reset = await st(() => { __arcana.answerCorrect(); return { streak: __arcana.state.wrongStreak }; });
  await page.clock.runFor(1300);
  const w4 = await st(() => { __arcana.answerWrong(); return { streak: __arcana.state.wrongStreak, lockT: +__arcana.state.lockT.toFixed(2) }; });
  const capped = await st(() => [1, 2, 3, 4, 5, 9].map(n => __arcana.wrongLockSec(n)));
  check('e_wrongLock_escalate', !afterLock.wlock && afterLock.badgeHidden && w2.streak === 2 && w2.lockT === 3 && w3.streak === 3 && w3.lockT === 4
    && reset.streak === 0 && w4.streak === 1 && w4.lockT === 2 && capped.join() === '2,3,4,5,5,5', { afterLock, w2, w3, reset, w4, capped });
  await page.clock.runFor(2200);

  // ── 슬롯 클릭 → 팝업(지형 문구) → 소환. 저지대 슬롯은 4마나
  await st(() => { __arcana.state.mana = Math.max(__arcana.state.mana, 12); });
  const lowSlot = await st(() => __arcana.SLOTS.find(s => s.e === 0).i);
  const manaC0 = await st(() => __arcana.state.mana);
  const p0 = await st(i => __arcana.slotClientPos(i), lowSlot);
  await page.mouse.click(p0.x, p0.y);
  await page.clock.runFor(50);
  const popupVisible = await page.isVisible('#popup [data-sum="wand"]');
  const popupTerrain = await page.textContent('#popup .pterr').catch(() => '');
  await page.click('#popup [data-sum="wand"]');
  await page.clock.runFor(50);
  const t0 = await st(i => __arcana.state.towers[i], lowSlot);
  const manaC1 = await st(() => __arcana.state.mana);
  check('c_summon_lowland', popupVisible && t0 && t0.type === 'wand' && manaC0 - manaC1 === 4 && popupTerrain.includes('저지대'),
    { lowSlot, popupVisible, popupTerrain, tower: t0, manaBefore: manaC0, manaAfter: manaC1 });
  // 소환된 슬롯 탭 → 강화 팝업 → Lv2 … Lv4 (비용 4/6/8)
  await st(() => { __arcana.state.mana = 40; });
  const upCosts = [];
  for (let k = 0; k < 3; k++) {
    if (!(await page.isVisible('#popup [data-up]'))) { await page.mouse.click(p0.x, p0.y); await page.clock.runFor(50); }
    const m0 = await st(() => __arcana.state.mana);
    await page.click('#popup [data-up]');
    await page.clock.runFor(50);
    upCosts.push(m0 - (await st(() => __arcana.state.mana)));
  }
  const lv4 = await st(i => ({ lv: __arcana.state.towers[i].lv, popupText: document.getElementById('popup').textContent, upDisabled: document.querySelector('#popup [data-up]').disabled }), lowSlot);
  check('f_upgrade_to_lv4', lv4.lv === 4 && upCosts.join() === '4,6,8' && lv4.popupText.includes('최대 레벨') && lv4.popupText.includes('관통') && lv4.upDisabled,
    { upCosts, lv: lv4.lv, maxSpendPerSlot: 5 + 4 + 6 + 8 });
  await page.keyboard.press('Escape');
  // 키보드 Q/W/E/R: E 두 번 → 자동 배치
  await st(() => { __arcana.state.mana += 10; });
  await page.keyboard.press('KeyE'); await page.keyboard.press('KeyE');
  await page.clock.runFor(50);
  const kb = await st(() => __arcana.state.towers.map((t, i) => t ? `${i}:${t.type}${t.lv}` : null).filter(Boolean));
  check('c_keyboardAutoPlace', kb.some(s => s.includes('sword1')), { towers: kb });

  // ── 60초 진행 (실제 RAF 루프를 가상 시계로 60초, 그동안 문제는 방치 → 자동 교체 확인)
  const t0sim = await st(() => __arcana.state.time);
  const samples = []; let warnSeen = false;
  for (let s = 0; s < 60; s++) {
    await page.clock.runFor(1000);
    const snap = await st(() => ({ t: +__arcana.state.time.toFixed(1), phase: __arcana.state.phase, wave: __arcana.state.waveIdx + 1, n: __arcana.state.enemies.length,
      dists: __arcana.state.enemies.map(e => Math.round(e.dist)), hp: __arcana.state.hp, warn: document.getElementById('quiz').classList.contains('warn'), killed: __arcana.state.stats.killed }));
    warnSeen = warnSeen || snap.warn;
    if (s % 10 === 9) samples.push({ t: snap.t, phase: snap.phase, wave: snap.wave, enemies: snap.n, maxDist: Math.max(0, ...snap.dists), hp: snap.hp, killed: snap.killed });
  }
  const simTime = (await st(() => __arcana.state.time)) - t0sim;
  let before = await st(() => __arcana.state.enemies.map(e => ({ id: e.id, d: e.dist })));
  let extra = 0;
  while (!before.length && extra < 20) { await page.clock.runFor(1000); extra++; before = await st(() => __arcana.state.enemies.map(e => ({ id: e.id, d: e.dist }))); }
  await page.clock.runFor(500);
  const after = await st(() => __arcana.state.enemies.map(e => ({ id: e.id, d: e.dist })));
  const moved = before.filter(b => { const a = after.find(x => x.id === b.id); return a && a.d > b.d; }).length;
  check('d_sim60', before.length > 0 && moved > 0 && warnSeen, { simulatedSec: +simTime.toFixed(1), samples, enemiesAt60: before.length, movedIn0_5s: moved,
    skippedByIdle: await st(() => __arcana.state.stats.skipped), idleWarnSeen: warnSeen });

  // ── 스크린샷: 지역 2, 지형 표시 강화(T) 켜고 전투 장면
  await st(() => { const A = __arcana; A.state.mana = 60; ['cup', 'sword', 'pentacle', 'wand', 'sword', 'cup'].forEach(t => { const s = A.SLOT_PRIORITY.find(i => !A.state.towers[i]); if (s !== undefined) A.summon(s, t); });
    A.upgrade(A.SLOT_PRIORITY[0]); A.upgrade(A.SLOT_PRIORITY[1]); A.upgrade(A.SLOT_PRIORITY[1]); });
  await page.keyboard.press('KeyT');
  let waited = 0;
  while ((await st(() => __arcana.state.enemies.length)) < 5 && waited < 30) { await page.clock.runFor(1000); waited++; }
  await page.clock.runFor(300);
  const strongOn = await st(() => __arcana.terrainStrong);
  await st(() => { __arcana.BALANCE.perk.enabled = true; __arcana.state.xp = 9; });   // 스크린샷에만 레벨·XP 줄 표시(특성 효과 없음)
  await page.clock.runFor(50);
  await page.screenshot({ path: SHOT });
  await st(() => { __arcana.BALANCE.perk.enabled = false; __arcana.state.xp = 0; __arcana.state.level = 1; __arcana.state.pendingDrafts = 0; });
  await page.keyboard.press('KeyT');
  check('g_terrainToggle', strongOn && !(await st(() => __arcana.terrainStrong)), { strongOn });

  // ── 콤보 보상 (읽기 하한 때문에 문제마다 0.9초 이상 기다렸다 정답)
  await page.clock.runFor(2500);
  await st(() => { const S = __arcana.state; S.combo = 0; S.gauge = 0; S.discountReady = false; S.buffT = 0; S.ultReady = false; S.enemies = []; S.spawnQ = []; S.hp = 10; });
  const comboLog = [];
  for (let i = 0; i < 8; i++) {
    while ((await st(() => __arcana.state.lockT)) > 0) await page.clock.runFor(100);
    await page.clock.runFor(900);
    await st(() => __arcana.answerCorrect());
    comboLog.push(await st(() => ({ c: __arcana.state.combo, disc: __arcana.state.discountReady, buff: __arcana.state.buffT > 0, ult: __arcana.state.ultReady })));
    await page.clock.runFor(100);
  }
  // 궁극기 사용권: 콤보가 끊겨도 유지(최대 1개)
  while ((await st(() => __arcana.state.lockT)) > 0) await page.clock.runFor(100);
  await page.clock.runFor(900);
  const keep = await st(() => { __arcana.answerWrong(); return { combo: __arcana.state.combo, ult: __arcana.state.ultReady }; });
  const ultEnabled = await st(() => !document.getElementById('ultBtn').disabled);
  await page.keyboard.press('Space');
  await page.clock.runFor(50);
  const comboOk = comboLog[2].disc && comboLog[4].buff && comboLog[7].ult && comboLog[7].c === 8;
  check('h_combo_ult', comboOk && keep.combo === 0 && keep.ult && ultEnabled && (await st(() => __arcana.state.stats.ults)) >= 1,
    { at3: comboLog[2], at5: comboLog[4], at8: comboLog[7], afterWrong: keep, ultBtnEnabled: ultEnabled, ultUsed: await st(() => __arcana.state.stats.ults) });

  // ── 결과 화면: 강제로 함락 → 봉인 목록, 해제 퀴즈, 다시하기(같은 지역 유지)
  await st(() => { __arcana.state.hp = 0; });
  await page.clock.runFor(100);
  const resultVisible = await page.isVisible('#retryBtn');
  const sealedCount = await page.locator('#sealedList button[data-id]').count();
  if (await page.isVisible('#reviewBtn')) { await page.click('#reviewBtn'); await page.click('#review [data-r="0"]'); }
  const reviewMsg = await page.textContent('#rmsg').catch(() => null);
  await page.click('#retryBtn');
  await page.clock.runFor(100);
  const restart = await st(() => ({ phase: __arcana.state.phase, region: __arcana.state.region, mana: __arcana.state.mana }));
  check('i_result_retry', resultVisible && sealedCount > 0 && restart.phase === 'prep' && restart.region === 1, { resultVisible, sealedCount, reviewMsg, restart });

  // ── 지형 규칙 (지역 4: 고지대 4 / 저지대 2 / 오르막 2)
  await st(() => __arcana.start({ region: 3, subject: 0, diff: 2 }));
  await page.clock.runFor(100);
  const terr = await st(() => {
    const A = __arcana, S = A.state, B = A.BALANCE, TR = B.terrain;
    const hi = A.SLOTS.find(s => s.e === 2), lo = A.SLOTS.find(s => s.e === 0), mid = A.SLOTS.find(s => s.e === 1);
    S.mana = 99; S.discountReady = false;
    const costs = { low: A.summonCost(lo.i), mid: A.summonCost(mid.i), high: A.summonCost(hi.i) };
    S.discountReady = true; costs.lowWithCombo3 = A.summonCost(lo.i); costs.highWithCombo3 = A.summonCost(hi.i); S.discountReady = false;
    A.summon(hi.i, 'wand'); A.summon(lo.i, 'wand'); A.summon(mid.i, 'wand');
    const base = B.cards.wand.lv[0].range;
    const ranges = { high: A.towerRange(hi.i), mid: A.towerRange(mid.i), low: A.towerRange(lo.i), base };
    // 행동 검증: 기본 사거리 밖·보정 사거리 안(거리 = 기본 × 1.07)의 길 위 지점에 적 1체를 놓고 0.05초 진행
    function probe(slot, others) {
      S.enemies = []; S.towers.forEach(t => { if (t) t.cd = 99; }); S.towers[slot.i].cd = 0;
      const want = base * 1.07; let best = null;
      for (let d = 0; d < A.PATH_LEN; d += 1) {
        const segs = A.SEG; let p = null;
        for (const s of segs) if (d <= s.start + s.len) { const t = (d - s.start) / s.len; p = { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t }; break; }
        if (!p) continue;
        const dist = Math.hypot(p.x - slot.x, p.y - slot.y);
        if (Math.abs(dist - want) < 1.5 && (!best || Math.abs(dist - want) < Math.abs(best.dist - want))) best = { d, dist, ...p };
      }
      if (!best) return null;
      S.enemies.push({ id: 9000 + slot.i, type: 'tank', hp: 5000, maxHp: 5000, dist: best.d, slowT: 0, slowAmt: 0, hitT: 0, x: best.x, y: best.y, si: 0 });
      A.step(0.05, 0.05, false);
      const e = S.enemies[0];
      return { dist: +best.dist.toFixed(1), hit: !!e && e.hp < 5000 };
    }
    const probeHigh = probe(hi), probeLow = probe(lo);
    S.enemies = [];
    // 경사 속도: 오르막 구간 ×0.8, 내리막 ×1.1 (지역 4는 내리막 0 → 지역 1에서 따로 확인)
    const upSi = A.SEG.findIndex(s => s.slope > 0), flatSi = A.SEG.findIndex(s => s.slope === 0);
    const mk = si => ({ type: 'normal', si, slowT: 0, slowAmt: 0 });
    const speeds = { up: A.enemySpeed(mk(upSi)), flat: A.enemySpeed(mk(flatSi)) };
    return { costs, ranges, probeHigh, probeLow, speeds, upRatio: speeds.up / speeds.flat, hiSlot: hi.i, loSlot: lo.i };
  });
  check('j_terrain_range_cost_slope',
    near(terr.ranges.high, terr.ranges.base * 1.15) && near(terr.ranges.mid, terr.ranges.base * 1.08) && near(terr.ranges.low, terr.ranges.base)
    && terr.probeHigh && terr.probeHigh.hit && terr.probeLow && !terr.probeLow.hit
    && terr.costs.low === 4 && terr.costs.mid === 5 && terr.costs.high === 5 && terr.costs.lowWithCombo3 === 3 && terr.costs.highWithCombo3 === 3
    && near(terr.upRatio, 0.8), terr);
  const down = await st(() => { const A = __arcana; A.start({ region: 0, subject: 0, diff: 2 });
    const dn = A.SEG.findIndex(s => s.slope < 0), fl = A.SEG.findIndex(s => s.slope === 0);
    const mk = si => ({ type: 'fast', si, slowT: 0, slowAmt: 0 });
    const slowed = { type: 'fast', si: A.SEG.findIndex(s => s.slope > 0), slowT: 1, slowAmt: 0.55 };
    return { downRatio: A.enemySpeed(mk(dn)) / A.enemySpeed(mk(fl)), floorRatio: A.enemySpeed(slowed) / A.enemySpeed(mk(fl)) }; });
  check('j_terrain_downhill_floor', near(down.downRatio, 1.1) && near(down.floorRatio, 0.45), down);

  // ── Lv4 특수효과: 소드 3체, 완드 관통, 컵 범위 둔화, 펜타클 피격 후 재생
  const lv4fx = await st(() => {
    const A = __arcana, S = A.state; S.mana = 99;
    const slot = A.SLOT_PRIORITY[0], s = A.SLOTS[slot];
    // 슬롯에서 가장 가까운 길 지점 주변에 6px 간격으로 적 4체(움직여도 사거리 안)
    let dNear = 0, best = 1e9;
    for (let d = 0; d < A.PATH_LEN; d += 2) { let p = null; for (const g of A.SEG) if (d <= g.start + g.len) { const t = (d - g.start) / g.len; p = { x: g.a.x + (g.b.x - g.a.x) * t, y: g.a.y + (g.b.y - g.a.y) * t }; break; }
      if (p) { const q = Math.hypot(p.x - s.x, p.y - s.y); if (q < best) { best = q; dNear = d; } } }
    const near3 = () => { S.enemies = []; for (let k = 0; k < 4; k++) S.enemies.push({ id: 8000 + k, type: 'tank', hp: 5000, maxHp: 5000, dist: dNear - 9 + k * 6, slowT: 0, slowAmt: 0, hitT: 0, x: s.x, y: s.y, si: 0 }); };
    const run = (type) => { S.mana = 99; S.towers[slot] = null; A.summon(slot, type); for (let k = 0; k < 3; k++) A.upgrade(slot); S.towers.forEach((t, i) => { if (t) t.cd = i === slot ? 0 : 99; }); near3();
      const sv = S.enemies.map(e => e.x); A.step(0.05, 0.05, false); return S.enemies.map(e => ({ dmg: 5000 - e.hp, slow: e.slowT > 0 })); };
    const sword = run('sword'), wand = run('wand'), cup = run('cup');
    // 펜타클 Lv4: 탑 피격 직후 쿨다운이 1.5초 이하로 당겨짐
    S.mana = 99; S.enemies = []; S.towers[slot] = null; A.summon(slot, 'pentacle'); for (let k = 0; k < 3; k++) A.upgrade(slot);
    const pt = S.towers[slot]; pt.cd = 5; S.shield = 0; const hp0 = S.hp;
    S.enemies.push({ id: 8100, type: 'normal', hp: 10, maxHp: 10, dist: A.PATH_LEN - 0.1, slowT: 0, slowAmt: 0, hitT: 0, x: 0, y: 0, si: A.SEG.length - 1 });
    S.towers.forEach((t, i) => { if (t && i !== slot) t.cd = 99; });
    A.step(0.05, 0.05, false);
    const pent = { lv: pt.lv, cdAfterHit: +pt.cd.toFixed(2), hpLost: hp0 - S.hp };
    S.enemies = [];
    return { swordHits: sword.filter(e => e.dmg > 0).length, wandHits: wand.filter(e => e.dmg > 0).length, cupSlowed: cup.filter(e => e.slow).length, pent };
  });
  check('k_lv4_specials', lv4fx.swordHits === 3 && lv4fx.wandHits === 2 && lv4fx.cupSlowed >= 3 && lv4fx.pent.lv === 4 && lv4fx.pent.cdAfterHit <= 1.5, lv4fx);


  // ══════════ 3차: 판 안 레벨업 · 특성 드래프트 (09 문서) ══════════
  await st(() => { __arcana.BALANCE.perk.enabled = true; });
  const waitUnlock = async () => { while ((await st(() => __arcana.state.lockT)) > 0) await page.clock.runFor(50); };
  // ── XP 곡선(지역 2 = 챕터 배수 1.2) + 정답 XP: 콤보 2 미만 0, 읽기 하한 위반 0, 오답 0 + 처치 XP
  await st(() => __arcana.start({ region: 1, subject: 2, diff: 2 }));
  await page.clock.runFor(100);
  const curve = await st(() => [1, 2, 3, 4, 5].map(n => __arcana.xpNeed(n)));
  const xpSeq = [];
  const xpSnap = async (label) => xpSeq.push(await st(l => ({ step: l, combo: __arcana.state.combo, xpAnswer: __arcana.state.stats.xp.answer }), label));
  await page.clock.runFor(900); await st(() => __arcana.answerCorrect()); await xpSnap('정답1(콤보1)');
  await waitUnlock(); await page.clock.runFor(900); await st(() => __arcana.answerCorrect()); await xpSnap('정답2(콤보2)');
  await waitUnlock(); await st(() => __arcana.answerCorrect()); await xpSnap('빠른 정답(읽기 하한)');
  await waitUnlock(); await page.clock.runFor(900); await st(() => __arcana.answerWrong()); await xpSnap('오답');
  const killXp = await st(() => { const A = __arcana, S = A.state, k0 = S.stats.xp.kill;
    S.ultReady = true; for (const [i, type] of [[0, 'normal'], [1, 'fast'], [2, 'tank']]) S.enemies.push({ id: 7000 + i, type, hp: 5, maxHp: 5, dist: 10, slowT: 0, slowAmt: 0, hitT: 0, x: 0, y: 0, si: 0 });
    A.useUlt(); return S.stats.xp.kill - k0; });
  check('m_xp_curve_comboGate', curve.join() === '18,36,54,72,90' && xpSeq.map(s => s.xpAnswer).join() === '0,2,2,2' && xpSeq[0].combo === 1 && xpSeq[1].combo === 2
    && xpSeq[2].combo === 2 && killXp === 1 + 2 + 4, { curve, xpSeq, killXp_normal_fast_tank: killXp });
  await page.clock.runFor(2500);

  // ── 레벨업 → 정답 3개 전에는 드래프트 보류 → 3번째 정답 직후 드래프트(카드 3장, 월드 ×0.3, 문제 타이머 정지, 답 입력 차단)
  await st(() => __arcana.start({ region: 1, subject: 2, diff: 2 }));
  await page.clock.runFor(100);
  const lv0 = await st(() => { const A = __arcana; A.addXP(A.xpNeed(1)); return { level: A.state.level, pending: A.state.pendingDrafts, xp: A.state.xp }; });
  await page.clock.runFor(400);
  const held = await st(() => ({ draft: !!__arcana.state.draft, xpTxt: document.getElementById('xpTxt').textContent, lv: document.getElementById('lvTxt').textContent }));
  for (let k = 0; k < 3; k++) { await waitUnlock(); await page.clock.runFor(900); await st(() => __arcana.answerCorrect()); }
  await page.clock.runFor(100);
  const open1 = await st(() => { const S = __arcana.state, cards = [...document.querySelectorAll('#draft .pcard')];
    return { draft: !!S.draft, timeScale: S.timeScale, qT: S.qT, offered: S.draft && S.draft.cards.map(p => p.id), choicesHidden: getComputedStyle(document.getElementById('choices')).display === 'none',
      cards: cards.map(c => ({ cls: c.className, text: c.textContent, w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height) })),
      head: document.getElementById('qDiff').textContent }; });
  const blocked = await st(() => __arcana.answerCorrect());
  await page.clock.runFor(1000);
  const frozen = await st(() => ({ qT: __arcana.state.qT, t: +__arcana.state.draft.t.toFixed(2), bar: parseFloat(document.getElementById('idleBar').style.width) }));
  const offeredOk = open1.offered && open1.offered.length === 3 && new Set(open1.offered).size === 3
    && open1.cards.length === 3 && open1.cards.every((c, i) => /r-(common|rare|legendary)/.test(c.cls) && /[●◆★](일반|희귀|전설)/.test(c.text) && c.text.includes(String(i + 1)))
    && open1.cards[0].text.includes('기본');
  check('n_levelup_held_then_draft3', lv0.level === 2 && lv0.pending === 1 && !held.draft && held.xpTxt.includes('정답이 필요해요') && held.lv === 'Lv2'
    && open1.draft && offeredOk && open1.choicesHidden && open1.timeScale === 0.3 && blocked === null && near(frozen.qT, open1.qT) && frozen.bar < 80,
    { lv0, held, open1, blockedAnswer: blocked, frozen });
  // ── 3초 초과 → 1번 카드 자동 선택, 월드 시간 복귀
  await page.clock.runFor(2200);
  const auto = await st(() => { const S = __arcana.state; return { draft: !!S.draft, pick: S.picks[0], perks: __arcana.perks, choicesShown: getComputedStyle(document.getElementById('choices')).display !== 'none' }; });
  await page.clock.runFor(500);
  const ts = await st(() => __arcana.state.timeScale);
  check('o_draft_autoPick_3s', !auto.draft && auto.pick && auto.pick.auto && auto.pick.id === open1.offered[0] && auto.pick.ms >= 3000 && auto.pick.ms < 3300
    && auto.perks.length === 1 && auto.perks[0].id === open1.offered[0] && auto.choicesShown && ts === 1, { auto, timeScaleAfter: ts });

  // ── 키 2로 선택 → 효과 적용(C3 높은 곳의 눈: 중·고지대 사거리 +5%p, 지형과 가산 후 ×1.20 상한) + 스크린샷
  const setup = await st(() => { const A = __arcana, S = A.state; S.mana = 99;
    const lo = A.SLOTS.find(s => s.e === 0 && !S.towers[s.i]).i, mid = A.SLOTS.find(s => s.e === 1 && !S.towers[s.i]).i, hi = A.SLOTS.find(s => s.e === 2 && !S.towers[s.i]).i;
    A.summon(lo, 'wand'); A.summon(mid, 'wand'); A.summon(hi, 'wand');
    for (const t of ['cup', 'sword']) { const s = A.SLOT_PRIORITY.find(i => !S.towers[i]); A.summon(s, t); }
    A.upgrade(hi); A.upgrade(mid);
    return { lo, mid, hi, before: { lo: A.towerRange(lo), mid: A.towerRange(mid), hi: A.towerRange(hi) } }; });
  waited = 0;
  while ((await st(() => __arcana.state.enemies.length)) < 4 && waited < 40) { await page.clock.runFor(500); waited++; }
  await st(() => { const S = __arcana.state; if (S.draft) __arcana.pickPerk(0); S.pendingDrafts = 0; S.draftGap = 0; });
  const forced = await st(() => __arcana.openDraft(['A4', 'C3', 'B6']));
  await page.keyboard.press('Digit2');                         // 입력 가드(0.25초) 안 → 무시
  await page.clock.runFor(50);
  const guarded = await st(() => !!__arcana.state.draft);
  await page.clock.runFor(350);
  await page.screenshot({ path: SHOT_DRAFT });
  await page.keyboard.press('Digit2');
  await page.clock.runFor(50);
  const eff = await st(s => { const A = __arcana, S = A.state, base = A.BALANCE.cards.wand.lv;
    const r = { lo: A.towerRange(s.lo) / base[0].range, mid: A.towerRange(s.mid) / base[1].range, hi: A.towerRange(s.hi) / base[1].range };
    const pick = S.picks[S.picks.length - 1];
    // 4속성 + C6(사거리 +3%p)까지 얹어도 고지대는 ×1.20에서 잘린다
    S.mana = 99; const p = A.SLOT_PRIORITY.find(i => !S.towers[i]); A.summon(p, 'pentacle'); A.gainPerk('C6');
    const r2 = { lo: A.towerRange(s.lo) / base[0].range, mid: A.towerRange(s.mid) / base[1].range, hi: A.towerRange(s.hi) / base[1].range };
    return { pick, r, r2, draft: !!S.draft, perks: A.perks.map(o => o.id) }; }, setup);
  check('p_key2_pick_effect_rangeCap', forced && forced.join() === 'A4,C3,B6' && guarded && !eff.draft && eff.pick.id === 'C3' && !eff.pick.auto
    && near(eff.r.lo, 1) && near(eff.r.mid, 1.13) && near(eff.r.hi, 1.20) && near(eff.r2.lo, 1.03) && near(eff.r2.mid, 1.16) && near(eff.r2.hi, 1.20),
    { forced, inputGuardIgnored: guarded, pick: eff.pick, rangeMult_afterC3: eff.r, rangeMult_afterC3_C6: eff.r2, perks: eff.perks });

  // ── 드래프트 알고리즘(09 §5) 성질: 2,000회 — 중복 없음, 같은 계열 3장 없음, 첫 드래프트 전설 없음, 비스택 보유 제외, 희귀도 비율
  const algo = await st(() => { const A = __arcana, S = A.state, keep = { perks: S.perks, perkUse: S.perkUse, draftNo: S.draftNo };
    S.perks = [{ id: 'B3', n: 1 }, { id: 'A1', n: 2 }]; S.perkUse = { B3: { used: 0, cnt: 0 }, A1: { used: 0, cnt: 0 } };
    const res = { dup: 0, tri: 0, legend1: 0, ownedOffered: 0, n: 0, rar: { common: 0, rare: 0, legendary: 0 }, short: 0 };
    for (const no of [1, 2]) { S.draftNo = no; for (let k = 0; k < 1000; k++) { const c = A.draftPerks(); res.n++;
      if (c.length < 3) res.short++;
      if (new Set(c.map(p => p.id)).size !== c.length) res.dup++;
      if (c.length === 3 && c[0].family === c[1].family && c[1].family === c[2].family) res.tri++;
      if (no === 1 && c.some(p => p.rarity === 'legendary')) res.legend1++;
      if (c.some(p => p.id === 'B3' || p.id === 'A1')) res.ownedOffered++;
      if (no === 2) c.forEach(p => res.rar[p.rarity]++); } }
    Object.assign(S, keep); return res; });
  const rt = algo.rar.common + algo.rar.rare + algo.rar.legendary;
  check('q_draft_algorithm', algo.dup === 0 && algo.tri === 0 && algo.legend1 === 0 && algo.ownedOffered === 0 && algo.short === 0
    && Math.abs(algo.rar.legendary / rt - 0.05) < 0.03, { ...algo, rarityShare_draft2: Object.fromEntries(Object.entries(algo.rar).map(([k, v]) => [k, +(v / rt).toFixed(3)])) });

  // ── 처치 마나 특성: 몰입 게이트(최근 10문항 중 6개 이상 정답) + 판당 특성 마나 20 상한
  const gate = await st(() => { const A = __arcana, S = A.state;
    S.perks = []; S.perkUse = {}; S.pool = { killMana: 0, learnMana: 0, towerHeal: 0, totalMana: 0 }; A.gainPerk('B6');   // B6(적 5마리마다 마나 +1, 몰입 전용)만 남김
    const kill = n => { const m0 = S.mana; S.mana = 0; S.ultReady = true; S.enemies = []; for (let i = 0; i < n; i++) S.enemies.push({ id: 7100 + i, type: 'normal', hp: 1, maxHp: 1, dist: 5, slowT: 0, slowAmt: 0, hitT: 0, x: 0, y: 0, si: 0 });
      S.perkUse.B6.cnt = 0; A.useUlt(); const got = S.mana; S.mana = m0; return got; };
    S.recent = [true, false, false, false, true, false, false, false, true, false]; const off = { flow: A.inFlow(), mana: kill(10) };
    S.recent = [true, true, true, true, true, true, false, false, false, false]; const on = { flow: A.inFlow(), mana: kill(10) };
    S.pool.totalMana = A.BALANCE.perk.caps.totalMana; const capped = { mana: kill(10) };
    return { off, on, capped, everyB6: A.PERKS.find(p => p.id === 'B6').effects[0].every }; });
  check('r_flowGate_manaCap', !gate.off.flow && gate.off.mana === 0 && gate.on.flow && gate.on.mana === 2 && gate.capped.mana === 0, gate);

  // ── 비교 플래그: 기본값(현행) + 'half' 콤보 절반 리셋 + 잠금 상한 10초
  const flags = await st(() => { const A = __arcana, B = A.BALANCE, S = A.state;
    const def = { mode: B.comboResetMode, lockMax: B.quiz.wrongLockMax };
    if (S.draft) A.pickPerk(0); S.pendingDrafts = 0; S.draftGap = 0;   // 앞 항목의 처치 XP로 열린 드래프트 정리
    S.lockT = 0; S.combo = 6; S.gauge = 6; S.comboShield = 0; S.perks = []; A.answerWrong(); const full = { combo: S.combo, gauge: S.gauge };
    B.comboResetMode = 'half'; S.lockT = 0; S.combo = 7; S.gauge = 7; A.answerWrong(); const half = { combo: S.combo, gauge: S.gauge };
    B.comboResetMode = def.mode;
    B.quiz.wrongLockMax = 10; const locks10 = [1, 3, 9, 12].map(n => A.wrongLockSec(n)); B.quiz.wrongLockMax = def.lockMax;
    S.lockT = 0; return { def, full, half, locks10 }; });
  check('s_compare_flags', flags.def.mode === 'full' && flags.def.lockMax === 5 && flags.full.combo === 0 && flags.full.gauge === 0
    && flags.half.combo === 0 && flags.half.gauge === 3 && flags.locks10.join() === '2,4,10,10', flags);

  // ── 결과 화면: 이번 판에서 고른 특성 목록
  await page.clock.runFor(300);
  await st(() => { __arcana.state.hp = 0; });
  await page.clock.runFor(100);
  const resPerks = await st(() => { const el = document.getElementById('perkList'); return el ? [...el.querySelectorAll('div')].map(d => d.textContent) : null; });
  check('t_result_perkList', resPerks && resPerks.length >= 2 && resPerks.some(t => t.includes('높은 곳의 눈')) && resPerks.some(t => t.includes('(자동)')), { resPerks });
  await page.click('#retryBtn');
  await page.clock.runFor(100);

  // ── BALANCE v0.3 값
  const bal = await st(() => { const B = __arcana.BALANCE; return { regenSec: B.mana.regenSec, maxLevel: B.maxLevel, upgrade: B.cost.upgrade, hpMult: B.waves.hpMult, readFloor: B.quiz.readFloorSec }; });
  check('l_balance_v03', bal.regenSec === 10 && bal.maxLevel === 4 && bal.upgrade.join() === '4,6,8' && bal.hpMult.join() === '1,1.6,2.4,3.4,5' && bal.readFloor === 0.8, bal);

  check('z_consoleErrors_0', errors.length === 0, { errors });
  check('z_externalRequests_0', external.length === 0, { external });
  console.log(JSON.stringify(R, null, 1));
  const failed = Object.entries(R).filter(([, v]) => !v.pass).map(([k]) => k);
  console.log(`\n${Object.keys(R).length - failed.length}/${Object.keys(R).length} checks passed`);
  console.log(failed.length ? 'SOME CHECKS FAILED: ' + failed.join(', ') : 'ALL CHECKS PASSED');
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
