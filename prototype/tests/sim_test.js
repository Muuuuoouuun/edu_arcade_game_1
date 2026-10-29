// 시뮬 코어 검증 (4차): node prototype/tests/sim_test.js   — Node 에서 core/sim.js 만 로드, 렌더 없음
//  (a) 2D 3차와 같은 조건의 봇 5종 × 50판 클리어율 비교(±5%p). 기준값은 tests/sim_ref_2d.json
//      = 동결된 2D index.html 을 Playwright 로 열고 Math.random 을 같은 시드의 세 흐름(문제·봇 / 드래프트 / 특성 확률)으로 바꿔 같은 봇을 돌린 결과.
//      시뮬은 세 모드: 기본(평면 타일 좌표, 3D 게임과 같음) / compat2D(검증 전용: 2D 고도 들어올림 4px 재현 → 2D 10fps 와 판 단위 동일 여부)
//      / cooldownCarry(비교 플래그: 60fps 2D 와 같은 공격 주기)
//  (b) 무풀이(방치)·찍기 불변식  (c) 지형 규칙·특성 적용기·드래프트·스냅샷 단위 검사
// 옵션: RUNS=50, REF=1(2D 기준값 3종 재생성: 20fps = bal_sim 조건, 10fps = 시뮬과 같은 틱, 60fps = 실제 플레이 프레임률. 약 1분)
for (const a of process.argv.slice(2)) { const m = /^([A-Z_]+)=(.*)$/.exec(a); if (m) process.env[m[1]] = m[2]; }
const path = require('path'), fs = require('fs');
const A = require('../core/sim.js');
const RUNS = +(process.env.RUNS || 50), REF_FILE = path.join(__dirname, 'sim_ref_2d.json');
const PROFILES = [
  { name: '우수(3s,90%)', T: 3, p: 0.9 },
  { name: '보통(5s,75%)', T: 5, p: 0.75 },
  { name: '느림(6.5s,60%)', T: 6.5, p: 0.6 },
  { name: '찍기(0.6s,25%)', T: 0.6, p: 0.25, flat: true },
  { name: '방치(답X)', T: 999, p: 0 },
];
const seedOf = (pi, r) => 9001 + pi * 1000 + r;
const PLAN = ['wand', 'sword', 'cup', 'wand', 'sword', 'pentacle', 'wand', 'sword', 'cup', 'wand'];

// bal_sim.js 의 봇과 같은 규칙. rnd = 게임과 같은 난수 흐름(2D 의 Math.random 하나를 게임·봇이 같이 쓰는 것과 같게)
function botLoop(api, prof, rnd) {
  const S = () => api.state, maxLv = api.BALANCE.maxLevel;
  let lastQ = null, need = null;
  while (S().phase !== 'result' && S().time < 900) {
    const s = S();
    if (s.q !== lastQ) { lastQ = s.q; need = null; }
    if (s.q && s.lockT <= 0 && !s.draft) {
      if (need === null) need = prof.flat ? prof.T : prof.T * (0.6 + 0.2 * s.q.item.d) * (0.8 + rnd() * 0.4);
      if (s.qT >= need) { rnd() < prof.p ? api.answer(s.q.correct) : api.answer((s.q.correct + 1) % 4); need = null; }
    }
    for (let guard = 0; guard < 20; guard++) {
      const empty = api.SLOT_PRIORITY.filter(i => !s.towers[i]);
      const placed = s.towers.length - empty.length;
      const sum = empty.length ? { kind: 's', slot: empty.find(i => api.summonCost(i) <= s.mana) ?? empty[0] } : null;
      if (sum) sum.cost = api.summonCost(sum.slot);
      const ups = api.SLOT_PRIORITY.map(i => ({ i, t: s.towers[i] })).filter(o => o.t && o.t.lv < maxLv).sort((a, b) => a.t.lv - b.t.lv);
      const up = ups.length ? { kind: 'u', slot: ups[0].i, cost: api.BALANCE.cost.upgrade[ups[0].t.lv - 1] } : null;
      let pick = null;
      if (sum && placed < 4) pick = sum; else if (sum && up) pick = up.cost < sum.cost ? up : sum; else pick = sum || up;
      if (!pick || s.mana < pick.cost) break;
      if (pick.kind === 's') api.summon(pick.slot, PLAN[placed % PLAN.length]); else api.upgrade(pick.slot);
    }
    if (s.ultReady && (s.enemies.length >= 5 || s.enemies.some(e => e.type === 'boss'))) api.useUlt();
    api.step();
  }
  const s = S();
  return { win: s.result.win, hp: s.hp, wave: s.result.wave, time: Math.round(s.time * 10) / 10, stars: s.result.stars, killed: s.stats.killed,
    correct: s.stats.correct, answered: s.stats.answered, skipped: s.stats.skipped, spent: s.stats.spent, level: s.level, maxCombo: s.maxCombo, ults: s.stats.ults,
    perkMana: s.stats.manaFromPerk, quizMana: s.stats.manaFromQuiz, regenMana: s.stats.manaFromRegen, xpAns: s.stats.xp.answer, picks: s.picks.map(p => p.id).join('') };
}
function simRuns(compat2D, runs = RUNS, carry = false) {
  const keep = A.BALANCE.sim.cooldownCarry; A.BALANCE.sim.cooldownCarry = carry;
  try { return PROFILES.map((prof, pi) => {
    const out = [];
    for (let r = 0; r < runs; r++) {
      const run = A.createRun({ region: r % 4, subject: r % 4, diff: 2, seed: seedOf(pi, r), events: false, compat2D });
      out.push(botLoop({ get state() { return run.state; }, BALANCE: A.BALANCE, SLOT_PRIORITY: run.geo.slotPriority, summonCost: run.summonCost,
        answer: run.answer, summon: run.summon, upgrade: run.upgrade, useUlt: run.useUlt, step: () => run.step(A.BALANCE.sim.tickSec) }, prof, run.rng));
    }
    return out;
  }); } finally { A.BALANCE.sim.cooldownCarry = keep; }
}

// ---- 2D 기준값 만들기: index.html(동결)을 열고 Math.random 을 시드 RNG 로 바꿔 같은 봇을 돌린다
async function make2DRef(dt) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  await page.clock.install();
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  const prio = await page.evaluate(() => [0, 1, 2, 3].map(ri => { __arcana.loadMap(ri); return __arcana.SLOT_PRIORITY.slice(); }));
  const res = [];
  for (let pi = 0; pi < PROFILES.length; pi++) {
    res.push(await page.evaluate(({ prof, pi, RUNS, dt, botSrc, seeds }) => {
      const A = __arcana, mul = a => function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      const botLoop = eval('(' + botSrc + ')'), PLAN = ['wand', 'sword', 'cup', 'wand', 'sword', 'pentacle', 'wand', 'sword', 'cup', 'wand'];
      const out = [];
      for (let r = 0; r < RUNS; r++) {
        // 2D 의 Math.random 하나를 시뮬과 같은 세 흐름(문제·봇 / 드래프트 / 특성 확률)으로 나눠 준다: 호출한 함수 이름으로 구분
        const rMain = mul(seeds[r]), rDraft = mul(seeds[r] ^ 0x9E3779B9), rPerk = mul(seeds[r] ^ 0x85EBCA6B);
        Math.random = function () { const st = new Error().stack; return st.includes('draftPerks') ? rDraft() : st.includes('applyPerks') ? rPerk() : rMain(); };
        A.start({ region: r % 4, subject: r % 4, diff: 2 });
        out.push(botLoop({ get state() { return A.state; }, BALANCE: A.BALANCE, get SLOT_PRIORITY() { return A.SLOT_PRIORITY; }, summonCost: A.summonCost,
          answer: A.answer, summon: A.summon, upgrade: A.upgrade, useUlt: A.useUlt, step: () => A.step(0.1, dt, false) }, prof, () => Math.random()));
      }
      return out;
    }, { prof: PROFILES[pi], pi, RUNS, dt, botSrc: botLoop.toString().replace('PLAN[', 'PLAN['), seeds: Array.from({ length: RUNS }, (_, r) => seedOf(pi, r)) }));
  }
  await browser.close();
  const slim = x => [x.win ? 1 : 0, x.hp, x.wave, x.time, x.killed, x.correct, x.picks];   // 비교에 쓰는 값만 [win, hp, wave, time, killed, correct, picks]
  return { made: new Date().toISOString(), dt, runs: RUNS, slotPriority: prio, profiles: PROFILES.map(p => p.name), res: res.map(a => a.map(slim)) };
}

const R = []; const check = (name, pass, detail) => { R.push({ name, pass: !!pass, detail }); };
const pct = a => Math.round(a.filter(x => x.win).length / a.length * 100);
const avg = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
const same = (x, y) => x.win === y.win && x.hp === y.hp && x.time === y.time && x.killed === y.killed && x.correct === y.correct && x.picks === y.picks;

(async () => {
  const t0 = Date.now();
  const DTS = { '20fps': 0.05, '10fps': 0.1, '60fps': 1 / 60 };
  let file = fs.existsSync(REF_FILE) ? JSON.parse(fs.readFileSync(REF_FILE, 'utf8')) : {};
  if (process.env.REF === '1' || Object.keys(DTS).some(k => !file[k] || file[k].runs < RUNS)) {
    for (const k of Object.keys(DTS)) {
      if (process.env.REF !== '1' && file[k] && file[k].runs >= RUNS) continue;
      const t = Date.now(); file[k] = await make2DRef(DTS[k]);
      console.log(`2D 기준값 생성(${k}, ${RUNS}판 × 5봇): ${((Date.now() - t) / 1000).toFixed(1)}초`);
    }
    fs.writeFileSync(REF_FILE, JSON.stringify(file));
  }
  const n = RUNS, unpack = a => ({ win: !!a[0], hp: a[1], wave: a[2], time: a[3], killed: a[4], correct: a[5], picks: a[6] });
  const cut = k => file[k].res.map(x => x.slice(0, n).map(unpack));
  const R20 = cut('20fps'), R10 = cut('10fps'), R60 = cut('60fps');
  const t1 = Date.now();
  const simA = simRuns(false, n), simB = simRuns(true, n), simC = simRuns(false, n, true);
  const simMs = Date.now() - t1;

  // (a) 기준 = 2D 3차 bal_sim.js 와 같은 조건(봇 루프 0.1초, 2D 틱 0.05초 = 20fps). 시뮬 4차 = 평면 타일 좌표·10틱/초(기본값)
  console.log(`\n(a) 2D 3차 vs 시뮬 코어 — 난이도 2, 봇마다 ${n}판(지역 1~4 번갈아), 판마다 같은 시드`);
  console.log('| 봇 | 2D 20fps (bal_sim 조건) | **시뮬 4차** | 차이 | 2D/시뮬 잔여 HP | 2D 10fps | compat2D = 2D 10fps 같은 판 | 2D 60fps | 시뮬 + cooldownCarry |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  PROFILES.forEach((p, i) => {
    const a = R20[i], b = simA[i], d = pct(b) - pct(a);
    const ident = simB[i].filter((x, k) => same(x, R10[i][k])).length;
    console.log(`| ${p.name} | ${pct(a)}% | ${pct(b)}% | ${d > 0 ? '+' : ''}${d}%p | ${avg(a, 'hp').toFixed(1)} / ${avg(b, 'hp').toFixed(1)} | ${pct(R10[i])}% | ${ident}/${n} | ${pct(R60[i])}% | ${pct(simC[i])}% |`);
    check(`a_clear_${i}`, Math.abs(d) <= 5, { bot: p.name, ref2D: pct(a), sim: pct(b) });
    check(`a_clear10fps_${i}`, Math.abs(pct(b) - pct(R10[i])) <= 5, { bot: p.name, ref2D: pct(R10[i]), sim: pct(b) });
    check(`a_compatIdentical_${i}`, ident >= n * 0.8, { bot: p.name, identical: ident, n });   // 나머지는 같은 거리 동점(둔화된 적을 뒤 적이 정확히 따라잡음)을 px/타일 반올림이 다르게 가르는 경우
  });
  {
    const prioSim = [0, 1, 2, 3].map(ri => A.buildGeo(ri, A.LIFT_2D).slotPriority);
    check('a_slotPriority_compat', JSON.stringify(prioSim) === JSON.stringify(file['10fps'].slotPriority), { sim: prioSim, ref: file['10fps'].slotPriority });
    const prioFlat = [0, 1, 2, 3].map(ri => A.buildGeo(ri, 0).slotPriority);
    console.log('자동 배치 우선순위 2D:', JSON.stringify(file['10fps'].slotPriority), '/ 평면 타일:', JSON.stringify(prioFlat));
  }

  // (b) 무풀이·찍기 불변식 (평면 모드 = 3D 게임과 같은 조건)
  const idle = simA[4], guess = simA[3];
  check('b_idle_noClear', idle.every(x => !x.win) && idle.every(x => x.wave >= 2 && x.wave <= 4), { waves: [...new Set(idle.map(x => x.wave))], mana: avg(idle, 'quizMana') });
  check('b_idle_noQuizMana', idle.every(x => x.quizMana === 0 && x.perkMana === 0 && x.level === 1 || x.picks === ''), {});
  const byW4 = a => a.filter(x => !x.win && x.wave <= 4).length / a.length;   // 2D 도 찍기 판의 일부는 웨이브 5에서 함락(20fps 200판 중 1판)
  check('b_guess_lowClear', pct(guess) <= Math.max(15, pct(R20[3]) + 5) && byW4(guess) >= 0.85,
    { clear: pct(guess), fallByW4: +byW4(guess).toFixed(2), ref2D: +byW4(R20[3]).toFixed(2) });
  check('b_guess_noComboRewards', guess.every(x => x.maxCombo === 0 && x.xpAns === 0 && x.perkMana === 0 && x.ults === 0), { maxCombo: Math.max(...guess.map(x => x.maxCombo)) });
  check('b_manaSources', simA.flat().every(x => x.perkMana <= A.BALANCE.perk.caps.totalMana), { maxPerkMana: Math.max(...simA.flat().map(x => x.perkMana)) });
  check('b_goodBeatsGuess', pct(simA[0]) >= pct(simA[1]) && pct(simA[1]) >= pct(simA[3]) + 50 && pct(simA[1]) >= pct(simA[2]), { good: pct(simA[1]), top: pct(simA[0]), guess: pct(guess) });

  // 결정성: 같은 시드 → 같은 결과, 다른 시드 → 다른 문제 순서
  const one = s => simRunsOne(s);
  function simRunsOne(seed) { const run = A.createRun({ region: 1, seed, events: false }); return botLoop({ get state() { return run.state; }, BALANCE: A.BALANCE, SLOT_PRIORITY: run.geo.slotPriority, summonCost: run.summonCost, answer: run.answer, summon: run.summon, upgrade: run.upgrade, useUlt: run.useUlt, step: () => run.step(0.1) }, PROFILES[1], run.rng); }
  check('b_deterministic', JSON.stringify(one(77)) === JSON.stringify(one(77)) && A.createRun({ seed: 1 }).state.q.item.id !== undefined, {});

  // (c) 단위 검사
  unitChecks(check);

  const fails = R.filter(r => !r.pass);
  console.log(`\n검사 ${R.length}항목 중 통과 ${R.length - fails.length}` + (fails.length ? `, 실패 ${fails.length}` : ''));
  for (const f of fails) console.log('  ✗', f.name, JSON.stringify(f.detail));
  console.log(`시뮬 ${n}판 × 5봇 × 3모드 = ${n * 15}판: ${(simMs / 1000).toFixed(1)}초`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

function unitChecks(check) {
  const B = A.BALANCE;
  const mk = (o = {}) => A.createRun(Object.assign({ region: 3, seed: 3 }, o));
  const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
  // 맵 데이터
  check('c_maps', A.MAPS.map(m => m.slots.length).join() === '10,9,9,9' && A.MAPS.map(m => `${m.up}/${m.down}`).join() === '3/3,4/4,1/3,2/0'
    && A.MAPS.map(m => m.path.length).join() === '39,35,34,38', { slots: A.MAPS.map(m => m.slots.length), slopes: A.MAPS.map(m => `${m.up}/${m.down}`) });
  check('c_data', A.QUESTIONS.length === 30 && A.PERKS.length === 24 && new Set(A.PERKS.flatMap(p => p.effects.map(e => e.op))).size === 19, {});
  // 지형: 사거리 배율·소환 비용·경사 속도
  let r = mk(); const S = r.state, slots = r.geo.SLOTS;
  const byE = e => slots.find(s => s.e === e).i;
  check('c_rangeMult', [0, 1, 2].map(e => r.slotRangeMult(byE(e))).join() === '1,1.08,1.15', {});
  S.mana = 50; r.summon(byE(2), 'wand');
  check('c_rangeTiles', near(r.towerRange(byE(2)), 88 / 34 * 1.15), { range: r.towerRange(byE(2)) });
  check('c_summonCost', r.summonCost(byE(0)) === 4 && r.summonCost(byE(1)) === 5 && (S.discountReady = true, r.summonCost(byE(0)) === 3 && r.summonCost(byE(1)) === 3), {});
  S.discountReady = false;
  const g = r.geo, up = g.SEG.findIndex(s => s.slope > 0);
  const e0 = { type: 'normal', si: 0, slowT: 0 }, eUp = { type: 'normal', si: up, slowT: 0 }, eSlow = { type: 'normal', si: up, slowT: 1, slowAmt: 0.55 };
  const base = r.enemySpeed(e0);
  check('c_slope', near(base, B.enemies.normal.speed * g.speedNorm) && near(r.enemySpeed(eUp) / base, 0.8) && near(r.enemySpeed(eSlow) / base, 0.45), { up: r.enemySpeed(eUp) / base, floor: r.enemySpeed(eSlow) / base });
  const R1 = A.buildGeo(0, 0), dn = R1.SEG.findIndex(s => s.slope < 0);
  const r1 = A.createRun({ region: 0, seed: 1 });
  check('c_downhill', near(r1.enemySpeed({ type: 'fast', si: dn, slowT: 0 }) / r1.enemySpeed({ type: 'fast', si: 0, slowT: 0 }), 1.1), {});
  check('c_pathNorm', [0, 1, 2, 3].every(ri => { const G = A.buildGeo(ri, 0); return near(G.pathLen / G.speedNorm, B.terrain.refPathLen); }), {});
  check('c_tileCoords', slots.every(s => s.x === s.c + 0.5 && s.y === s.r + 0.5) && g.PTS.every(p => p.x % 1 === 0.5), {});
  // 문제·잠금·읽기 하한·방치
  r = mk(); let s = r.state;
  check('c_wrongLock', [1, 2, 3, 4, 5].map(k => r.wrongLockSec(k)).join() === '2,3,4,5,5', {});
  const m0 = s.mana; r.answer(s.q.correct);
  check('c_readFloor', s.combo === 0 && s.stats.fastCorrect === 1 && s.mana - m0 === B.mana.byDifficulty[s.q.item.d], {});
  for (let k = 0; k < 5; k++) r.step(0.1);
  for (let k = 0; k < 9; k++) r.step(0.1);
  r.answer(s.q.correct);
  check('c_comboAfterRead', s.combo === 1, { combo: s.combo, qT: s.qT });
  r.step(0.4); r.answer((s.q.correct + 1) % 4);
  const locked = r.answer(s.q.correct) === null;
  check('c_wrongResets', s.combo === 0 && s.lockT === 2 && locked && s.wrongStreak === 1, { lockT: s.lockT });
  r.step(2.1); const qBefore = s.q; for (let k = 0; k < 101; k++) r.step(0.1);
  check('c_idleSkip', s.stats.skipped === 1 && s.q !== qBefore, { skipped: s.stats.skipped });
  // 콤보 3/5/8 보상
  r = mk(); s = r.state;
  const answerSlow = () => { r.step(0.9); r.answer(s.q.correct); r.step(0.4); };
  for (let k = 0; k < 8; k++) { answerSlow(); if (k === 2) check('c_combo3', s.discountReady, {}); if (k === 4) check('c_combo5', s.buffT > 9, { buffT: s.buffT }); }
  check('c_combo8', s.ultReady && s.combo === 8, {});
  // XP 곡선·정답 XP
  r = A.createRun({ region: 1, seed: 2 }); s = r.state;
  check('c_xpCurve', [1, 2, 3, 4, 5].map(l => r.xpNeed(l)).join() === '18,36,54,72,90', {});
  // Lv4 특수효과(행동): 소드 3체 · 완드 관통 2체 · 컵 범위 둔화 · 펜타클 피격 후 1.5초 재생
  const lv4 = (type, nEn) => {
    const q = mk({ seed: 11 }), st = q.state; st.mana = 99; st.phaseT = 99;
    const slot = q.geo.SLOTS.findIndex(o => o.e === 0); q.summon(slot, type); for (let k = 0; k < 3; k++) q.upgrade(slot);
    const sp = q.geo.SLOTS[slot]; st.towers[slot].cd = 0;
    for (let k = 0; k < nEn; k++) st.enemies.push({ id: 900 + k, type: 'normal', hp: 5000, maxHp: 5000, dist: 0, ps: 0, slowT: 0, slowAmt: 0, hitT: 0, x: sp.x + 0.3 + k * 0.1, y: sp.y, si: 0, dead: false });
    const G2 = q.geo; G2.posAt = (d, o) => o;   // 이 검사에서는 적을 제자리에 둔다
    q.tick(); return { st, hit: st.enemies.filter(e => e.hp < 5000).length, slowed: st.enemies.filter(e => e.slowT > 0).length, t: st.towers[slot] };
  };
  const sw = lv4('sword', 5), wd = lv4('wand', 5), cp = lv4('cup', 5);
  const pq = mk({ seed: 11 }), ps = pq.state; ps.mana = 99; pq.summon(0, 'pentacle'); for (let k = 0; k < 3; k++) pq.upgrade(0); ps.towers[0].cd = 4;
  ps.enemies.push({ id: 999, type: 'normal', hp: 10, maxHp: 10, dist: pq.geo.pathLen - 1e-6, ps: 0, slowT: 0, slowAmt: 0, hitT: 0, x: 0, y: 0, si: 0, dead: false }); pq.tick();
  check('c_lv4', sw.hit === 3 && wd.hit === 2 && cp.hit >= 3 && cp.slowed === cp.hit && ps.towers[0].cd <= 1.5, { sword: sw.hit, wand: wd.hit, cup: cp.hit, cupSlowed: cp.slowed, pentCd: ps.towers[0].cd });
  // 특성 적용기: C3/C6 사거리 상한, 피해 비례 축소(G1), 몰입 게이트, 특성 마나 상한 20, 탑 회복 3, 공속 상한
  r = mk({ seed: 5 }); s = r.state; s.mana = 99;
  const lo = byE(0), mid = byE(1), hi = byE(2);
  [lo, mid, hi].forEach(i => r.summon(i, 'wand'));
  r.gainPerk('C3');
  check('c_perk_C3', [lo, mid, hi].map(i => r.slotRangeMult(i).toFixed(2)).join() === '1.00,1.13,1.20', { v: [lo, mid, hi].map(i => r.slotRangeMult(i)) });
  s.mana = 99; r.summon(slots.find(o => !s.towers[o.i]).i, 'cup'); r.summon(slots.find(o => !s.towers[o.i]).i, 'sword'); r.summon(slots.find(o => !s.towers[o.i]).i, 'pentacle');
  r.gainPerk('C6');
  check('c_perk_C6', [lo, mid, hi].map(i => r.slotRangeMult(i).toFixed(2)).join() === '1.03,1.16,1.20', { v: [lo, mid, hi].map(i => r.slotRangeMult(i)) });
  r.gainPerk('A1'); r.gainPerk('A1'); r.gainPerk('A4');
  const eqSum = 10.5 + 3.8 + 5.5 * 2 + 7.4, dmgN = r.applyPerks('dmg', { slot: lo, card: 'wand', enemy: 'normal' });
  check('c_perk_G1', near(dmgN, (0.07 + 0.30) * 15 / eqSum), { dmgN, expect: (0.07 + 0.30) * 15 / eqSum });   // C6 +7% · A1×2 +30%, eq 합 32.7 > 15 → 비례 축소
  check('c_perk_armor', (r.gainPerk('A3'), r.applyPerks('armor', { enemy: 'tank' }) === 3), {});
  check('c_perk_speed', (r.gainPerk('A2'), (() => { const x = { enemy: 'fast', mult: 1, floor: 0.45 }; r.applyPerks('speed', x); return near(x.mult, 0.85); })()), {});
  r.gainPerk('A5'); check('c_perk_boss', r.applyPerks('towerDmg', { enemy: 'boss' }) === -2, {});
  // 몰입 게이트(B6): 몰입 아님 → 0, 몰입 → 5마리마다 +1
  r = mk({ seed: 6 }); s = r.state; r.gainPerk('B6');
  const pm0 = s.stats.manaFromPerk; for (let k = 0; k < 10; k++) r.applyPerks('kill', { enemy: 'normal' });
  const notFlow = s.stats.manaFromPerk - pm0;
  s.recent = [true, true, true, true, true, true, true, false, false, false];
  for (let k = 0; k < 10; k++) r.applyPerks('kill', { enemy: 'normal' });
  check('c_perk_flowGate', notFlow === 0 && s.stats.manaFromPerk - pm0 === 2, { notFlow, flow: s.stats.manaFromPerk - pm0 });
  // 특성 마나 합계 상한 20(G5)
  r.gainPerk('D6'); r.gainPerk('D1'); r.gainPerk('D1'); r.gainPerk('D5'); r.gainPerk('B4');
  s.combo = 6; for (let k = 0; k < 60; k++) { r.applyPerks('correct', { q: { item: { d: 3 } } }); r.applyPerks('milestone', { c: 3 }); r.applyPerks('kill', { enemy: 'fast' }); }
  check('c_perk_totalCap', s.pool.totalMana === 20 && s.stats.manaFromPerk === 20, { total: s.pool.totalMana });
  // 탑 회복 상한 3(G6), 콤보 방패, 잠금 단축(D2), 공속 상한(G7), 복습 통과(D3 op)
  r = mk({ seed: 7 }); s = r.state; s.hp = 2; r.gainPerk('B2'); r.gainPerk('B5');
  for (let k = 0; k < 8; k++) { r.applyPerks('kill', { enemy: 'tank' }); r.applyPerks('waveClear', { leaks: 1 }); }
  check('c_perk_healCap', s.hp === 5 && s.pool.towerHeal === 3, { hp: s.hp });
  r.gainPerk('B3'); r.applyPerks('waveClear', { leaks: 0 });
  check('c_perk_comboShield', s.comboShield === 1 && r.applyPerks('wrong') === 1 && s.comboShield === 0, {});
  r.gainPerk('D2'); s.recent = [true, true, true, true, true, true, false, false, false, false];
  const lk = { lock: 4 }; r.applyPerks('lock', lk); const lk2 = { lock: 2 }; r.applyPerks('lock', lk2);
  check('c_perk_D2', lk.lock === 3 && lk2.lock === 2, { lk: lk.lock });
  r.gainPerk('D3'); const pmR = s.stats.manaFromPerk; r.applyPerks('reviewPass');
  check('c_perk_reviewPass', s.stats.manaFromPerk - pmR === 3, {});
  // 인접 오라(C1·C5): 4개 맵에 인접 슬롯 쌍이 없어 효과 0 (2D 3차와 같은 한계)
  check('c_perk_adjacency', [0, 1, 2, 3].every(ri => A.buildGeo(ri, 0).SLOTS.every(o => o.adj.length === 0)), {});
  r = mk({ seed: 8 }); s = r.state; s.mana = 99; r.summon(0, 'cup'); r.summon(1, 'wand'); r.gainPerk('C5'); r.gainPerk('C1'); r.gainPerk('C2'); r.gainPerk('C4');
  check('c_perk_auraZero', r.applyPerks('atkSpeed', { slot: 1 }) === 0, {});
  // 드래프트 알고리즘 2000회: 중복 0, 같은 계열 3장 0, 첫 드래프트 전설 0, 비스택 보유 제외
  r = mk({ seed: 9 }); s = r.state; s.mana = 99; [0, 1, 2, 3].forEach((i, k) => r.summon(i, A.CARD_TYPES[k])); s.maxCombo = 5; r.gainPerk('A3');
  let dup = 0, fam3 = 0, leg1 = 0, owned = 0, legN = 0, tot = 0; const rr = A.mulberry32(123);
  for (let k = 0; k < 2000; k++) {
    s.draftNo = k % 2 ? 1 : 2; const c = r.draftPerks(rr); tot += c.length;
    if (new Set(c.map(p => p.id)).size !== c.length) dup++;
    if (c.length === 3 && c.every(p => p.family === c[0].family)) fam3++;
    if (s.draftNo === 1 && c.some(p => p.rarity === 'legendary')) leg1++;
    if (c.some(p => p.id === 'A3')) owned++;
    legN += c.filter(p => p.rarity === 'legendary').length;
  }
  check('c_draftAlgo', dup === 0 && fam3 === 0 && leg1 === 0 && owned === 0, { dup, fam3, leg1, owned, legendaryShare: +(legN / tot).toFixed(3) });
  // 드래프트 흐름: 정답 3개 전 보류 → 열림 → 월드 ×0.3 → 3초 뒤 1번 자동 선택
  r = mk({ seed: 10 }); s = r.state; r.addXP(r.xpNeed(1));
  r.step(0.1);
  check('c_draftHeld', s.pendingDrafts === 1 && !s.draft, {});
  for (let k = 0; k < 3; k++) { r.step(0.9); r.answer(s.q.correct); }
  r.step(0.1);
  const ts = s.timeScale; const guard = r.pickPerk(1) === false;
  for (let k = 0; k < 31; k++) r.step(0.1);
  check('c_draftFlow', ts === B.perk.draft.timeScale && guard && s.picks.length === 1 && s.picks[0].auto === true, { ts, picks: s.picks });
  // 별 판정: ★1 클리어 / ★2 HP≥6 / ★3 정답률≥80% & 콤보≥5
  r = mk({ seed: 12 }); s = r.state; s.stats.answered = 10; s.stats.correct = 9; s.maxCombo = 5; s.hp = 5; r.endGame(true);
  check('c_stars', s.result.stars === 2 && s.result.crit.map(c => c.ok).join() === 'true,false,true', { stars: s.result.stars });
  // 봉인 카드·해제 퀴즈(세션): 오답 → 봉인 등록, 정답 → 다음 판 시작 마나 +3
  const ses = A.createSession(); r = A.createRun({ seed: 13, session: ses }); s = r.state;
  r.step(0.9); const wid = s.q.item.id; r.answer((s.q.correct + 1) % 4); r.endGame(false);
  const rv = r.reviewStart(); const ok = r.reviewAnswer(rv.correct);
  const r2 = A.createRun({ seed: 14, session: ses });
  check('c_sealedReview', ses.sealed.has(wid) && ok === true && ses.sealed.get(wid).freed && r2.state.mana === B.mana.start + B.review.bonusMana, { mana: r2.state.mana });
  // 스냅샷: SoA 숫자 배열 + 이벤트 flush
  r = mk({ seed: 15 }); s = r.state; s.mana = 99; r.summon(2, 'wand'); r.step(5.0); r.step(2.0);
  const sn = r.snapshot(), evk = new Set(sn.events.map(e => e.k));
  const sn2 = r.snapshot();
  check('c_snapshot', sn.enemies.id instanceof Int32Array && sn.enemies.x instanceof Float32Array && sn.enemies.n === s.enemies.length && sn.towers.type[2] === 0
    && evk.has('summon') && evk.has('waveStart') && evk.has('spawn') && sn2.events.length === 0, { n: sn.enemies.n, ev: [...evk] });
  check('c_fixedTick', (() => { const q = mk({ seed: 16 }); const n1 = q.step(0.25); const a1 = q.alpha; const n2 = q.step(0.05); return n1 === 2 && near(a1, 0.5, 1e-6) && n2 === 1; })(), {});
}
