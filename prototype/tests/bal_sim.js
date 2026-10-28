// 밸런스 봇 시뮬레이션 (2차): node bal_sim.js
//   RUNS=12(기본, 봇마다 판 수 — 지역 1~4를 번갈아 사용), DIFF=2(스테이지 난이도), OV='{"enemies.normal.hp":70}'(BALANCE 덮어쓰기)
//   봇 응답 시간: 평균 T초(문항 난이도 d에 따라 T×(0.6+0.2d), ±20% 무작위). 찍기 봇은 0.6초 고정.
//   봇은 게임과 같은 규칙(오답 잠금·읽기 하한·지형 비용/사거리)을 그대로 받는다: answerCorrect/answerWrong 은 일반 answer() 경로.
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const PROFILES = [
  { name: '우수(3s,90%)', T: 3, p: 0.9 },
  { name: '보통(5s,75%)', T: 5, p: 0.75 },
  { name: '찍기(0.6s,25%)', T: 0.6, p: 0.25, flat: true },
  { name: '방치(답X)', T: 999, p: 0 },
];
if (process.env.SLOW) PROFILES.splice(2, 0, { name: '느림(6.5s,60%)', T: 6.5, p: 0.6 });
const RUNS = +process.env.RUNS || 12;
const DIFF = +process.env.DIFF || 2;
const OV = process.env.OV ? JSON.parse(process.env.OV) : null;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  await page.clock.install(); // RAF 정지 → step()으로만 진행
  await page.goto(FILE);
  const rows = [];
  for (const prof of PROFILES) {
    const out = await page.evaluate(({ prof, RUNS, OV, DIFF }) => {
      const A = __arcana, rs = [];
      if (OV) { const B = A.BALANCE; for (const [k, v] of Object.entries(OV)) { const ks = k.split('.'); let o = B; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; } }
      const plan = ['wand', 'sword', 'cup', 'wand', 'sword', 'pentacle', 'wand', 'sword', 'cup', 'wand'];
      for (let r = 0; r < RUNS; r++) {
        const region = r % 4;
        A.start({ region, subject: r % 4, diff: DIFF }); const S = () => A.state;
        const maxLv = A.BALANCE.maxLevel;
        let lastQ = null, need = null, peakMana = 0, hpPrev = S().hp, leakByWave = [0,0,0,0,0], firstFull = null;
        while (S().phase !== 'result' && S().time < 900) {
          const s = S();
          if (s.q !== lastQ) { lastQ = s.q; need = null; }
          if (s.q && s.lockT <= 0) {
            if (need === null) need = prof.flat ? prof.T : prof.T * (0.6 + 0.2 * s.q.item.d) * (0.8 + Math.random() * 0.4);
            if (s.qT >= need) { Math.random() < prof.p ? A.answerCorrect() : A.answerWrong(); need = null; }
          }
          // 소비: 슬롯 4개까지는 소환 우선, 그 뒤엔 (다음 소환 vs 가장 낮은 레벨 강화) 중 싼 쪽부터, 같으면 소환
          for (let guard = 0; guard < 20; guard++) {
            const empty = A.SLOT_PRIORITY.filter(i => !s.towers[i]);
            const placed = s.towers.length - empty.length;
            const sum = empty.length ? { kind: 's', slot: empty.find(i => A.summonCost(i) <= s.mana) ?? empty[0] } : null;
            if (sum) sum.cost = A.summonCost(sum.slot);
            const ups = A.SLOT_PRIORITY.map(i => ({ i, t: s.towers[i] })).filter(o => o.t && o.t.lv < maxLv).sort((a, b) => a.t.lv - b.t.lv);
            const up = ups.length ? { kind: 'u', slot: ups[0].i, cost: A.BALANCE.cost.upgrade[ups[0].t.lv - 1] } : null;
            let pick = null;
            if (sum && placed < 4) pick = sum;
            else if (sum && up) pick = up.cost < sum.cost ? up : sum;
            else pick = sum || up;
            if (!pick || s.mana < pick.cost) break;
            if (pick.kind === 's') A.summon(pick.slot, plan[placed % plan.length]); else A.upgrade(pick.slot);
          }
          if (firstFull === null && s.towers.every(t => t && t.lv === maxLv)) firstFull = Math.round(s.time);
          if (s.ultReady && (s.enemies.length >= 5 || s.enemies.some(e => e.type === 'boss'))) A.useUlt();
          peakMana = Math.max(peakMana, s.mana);
          if (s.hp < hpPrev) { leakByWave[s.waveIdx] += hpPrev - s.hp; hpPrev = s.hp; }
          A.step(0.1, 0.05, false);
        }
        const s = S();
        rs.push({ region, win: s.result.win, stars: s.result.stars, hp: s.hp, wave: s.result.wave, time: Math.round(s.time),
          acc: s.result.acc, maxCombo: s.maxCombo, ults: s.stats.ults, quizMana: s.stats.manaFromQuiz, regenMana: s.stats.manaFromRegen,
          spent: s.stats.spent, endMana: s.mana, peakMana, firstFull, fast: s.stats.fastCorrect, lockSec: s.stats.lockSec,
          towers: s.towers.filter(Boolean).length, slots: s.towers.length, lvSum: s.towers.reduce((a, t) => a + (t ? t.lv : 0), 0), leakByWave });
      }
      return rs;
    }, { prof, RUNS, OV, DIFF });
    const n = out.length, avg = (arr, k) => arr.length ? arr.reduce((a, r) => a + (r[k] ?? 0), 0) / arr.length : NaN;
    const wins = out.filter(r => r.win), losses = out.filter(r => !r.win);
    const hpByRegion = [0, 1, 2, 3].map(g => { const a = out.filter(r => r.region === g); return a.length ? avg(a, 'hp').toFixed(1) : '-'; }).join('/');
    const leak = [0,1,2,3,4].map(w => (out.reduce((a, r) => a + r.leakByWave[w], 0) / n).toFixed(1)).join('/');
    const fullN = out.filter(r => r.firstFull !== null).length;
    const row = {
      name: prof.name, n, clear: Math.round(wins.length / n * 100), hp: avg(out, 'hp').toFixed(1), hpWin: wins.length ? avg(wins, 'hp').toFixed(1) : '-',
      fallWave: losses.length ? avg(losses, 'wave').toFixed(1) : '-', fallWaves: losses.map(r => r.wave).sort().join(''),
      time: avg(out, 'time').toFixed(0), acc: (avg(out, 'acc') * 100).toFixed(0), maxCombo: avg(out, 'maxCombo').toFixed(1), ults: avg(out, 'ults').toFixed(1),
      quiz: avg(out, 'quizMana').toFixed(0), regen: avg(out, 'regenMana').toFixed(0), spent: avg(out, 'spent').toFixed(0), endMana: avg(out, 'endMana').toFixed(0),
      lvSum: avg(out, 'lvSum').toFixed(1), slots: avg(out, 'slots').toFixed(1), full: `${fullN}/${n}${fullN ? ' 평균 ' + Math.round(out.filter(r => r.firstFull !== null).reduce((a, r) => a + r.firstFull, 0) / fullN) + 's' : ''}`, fast: avg(out, 'fast').toFixed(1), lock: avg(out, 'lockSec').toFixed(0),
      stars: avg(out, 'stars').toFixed(2), hpByRegion, leak,
    };
    rows.push(row);
    if (process.env.DUMP) console.log('  HP 분포', JSON.stringify(out.map(r => r.hp).sort((a, b) => a - b)), '마나', JSON.stringify(out.map(r => r.quizMana + r.regenMana)), '궁', JSON.stringify(out.map(r => r.ults)));
    console.log(`${row.name.padEnd(14)} 클리어 ${String(row.clear).padStart(3)}% | 잔여HP ${row.hp} (클리어판 ${row.hpWin}) | 함락웨이브 ${row.fallWave} [${row.fallWaves}] | ${row.time}s | 정답률 ${row.acc}% | 최대콤보 ${row.maxCombo} | 궁 ${row.ults} | 마나 문제 ${row.quiz}/회복 ${row.regen} 지출 ${row.spent} 잔여 ${row.endMana} | Lv합 ${row.lvSum}/${row.slots}슬롯 풀강 ${row.full} | 빠른정답 ${row.fast} 잠금 ${row.lock}s | 지역별HP ${row.hpByRegion} | 웨이브별 HP손실 ${row.leak}`);
  }
  console.log(`\n| 봇 | 판 | 클리어율 | 평균 잔여 HP | 클리어 판 HP | 함락 웨이브(평균) | 정답률 | 최대 콤보 | 마나 문제/회복/지출 | Lv 합(슬롯) | 지역별 HP R1/R2/R3/R4 |`);
  console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of rows) console.log(`| ${r.name} | ${r.n} | ${r.clear}% | ${r.hp} | ${r.hpWin} | ${r.fallWave}${r.fallWaves ? ` (${r.fallWaves})` : ''} | ${r.acc}% | ${r.maxCombo} | ${r.quiz}/${r.regen}/${r.spent} | ${r.lvSum} (${r.slots}) | ${r.hpByRegion} |`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
