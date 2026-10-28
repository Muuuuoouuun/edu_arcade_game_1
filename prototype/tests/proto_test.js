// 아르카나 수비대 프로토타입 2차 검증: node proto_test.js
// 1차 항목(마나·소환·강화·키보드·60초 진행·콤보·결과/해제 퀴즈) + 2차 항목(지역 선택 시작, 고도 사거리/비용/경사 속도, 오답 잠금, 읽기 하한, Lv4, 궁극기 유지)
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOT = path.resolve(__dirname, '..', 'screenshot.png');
const SHOT_START = path.resolve(__dirname, '..', 'screenshot_start.png');
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
  await page.screenshot({ path: SHOT });
  await page.keyboard.press('KeyT');
  check('g_terrainToggle', strongOn && !(await st(() => __arcana.terrainStrong)), { strongOn });

  // ── 콤보 보상 (읽기 하한 때문에 문제마다 0.9초 이상 기다렸다 정답)
  await page.clock.runFor(2500);
  await st(() => { const S = __arcana.state; S.combo = 0; S.discountReady = false; S.buffT = 0; S.ultReady = false; S.enemies = []; S.spawnQ = []; S.hp = 10; });
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
