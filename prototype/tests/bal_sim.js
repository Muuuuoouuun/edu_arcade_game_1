// 밸런스 봇 시뮬레이션: 프로필별(응답 시간 T초, 정답률 p) 20판씩 전체 게임 진행
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const PROFILES = [
  { name: '우수(3s,90%)', T: 3, p: 0.9 },
  { name: '보통(5s,75%)', T: 5, p: 0.75 },
  { name: '느림(6.5s,60%)', T: 6.5, p: 0.6 },
  { name: '찍기(0.6s,25%)', T: 0.6, p: 0.25, flat: true },
  { name: '방치(답X)', T: 999, p: 0 },
];
const RUNS = +process.env.RUNS || 20;
const OV = process.env.OV ? JSON.parse(process.env.OV) : null;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  await page.clock.install(); // RAF 정지 → step()으로만 진행
  await page.goto(FILE);
  for (const prof of PROFILES) {
    const out = await page.evaluate(({ prof, RUNS, OV }) => {
      const A = __arcana, rs = [];
      if (OV) { const B = A.BALANCE; for (const [k, v] of Object.entries(OV)) { const ks = k.split('.'); let o = B; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; } }
      const plan = ['wand', 'sword', 'cup', 'wand', 'sword', 'pentacle', 'wand', 'sword'];
      for (let r = 0; r < RUNS; r++) {
        A.start(); const S = () => A.state;
        let lastQ = null, need = null, firstFullMax = null, peakMana = 0, manaAtWave = [];
        let lastWave = -1, leakByWave = [0,0,0,0,0], hpPrev = S().hp, spent = 0;
        while (S().phase !== 'result' && S().time < 600) {
          const s = S();
          if (s.q !== lastQ) { lastQ = s.q; need = null; }
          if (s.q && s.lockT <= 0) {
            if (need === null) need = prof.flat ? prof.T : prof.T * (0.6 + 0.3 * s.q.item.d) * (0.8 + Math.random() * 0.4);
            if (s.qT >= need) { Math.random() < prof.p ? A.answerCorrect() : A.answerWrong(); need = null; }
          }
          if (s.waveIdx !== lastWave) { manaAtWave.push(s.mana); lastWave = s.waveIdx; }
          // 소비
          let acted = true;
          while (acted) {
            acted = false;
            const empty = A.SLOT_PRIORITY.filter(i => !s.towers[i]);
            const placed = 8 - empty.length;
            const cost = s.discountReady ? 3 : 5;
            if (empty.length && s.mana >= cost) { const m0 = s.mana; A.summon(empty[0], plan[placed]); spent += m0 - s.mana; acted = true; continue; }
            const up = s.towers.map((t, i) => ({ t, i })).filter(o => o.t && o.t.lv < 3).sort((a, b) => a.t.lv - b.t.lv)[0];
            if (up && (!empty.length || placed >= 5)) { const c = A.BALANCE.cost.upgrade[up.t.lv - 1]; if (s.mana >= c) { A.upgrade(up.i); spent += c; acted = true; } }
          }
          if (firstFullMax === null && s.towers.every(t => t && t.lv === 3)) firstFullMax = +s.time.toFixed(0);
          if (s.ultReady && (s.enemies.length >= 5 || s.enemies.some(e => e.type === 'boss'))) A.useUlt();
          peakMana = Math.max(peakMana, s.mana);
          if (s.hp < hpPrev) { leakByWave[s.waveIdx] += hpPrev - s.hp; hpPrev = s.hp; }
          A.step(0.1, 0.05, false);
        }
        const s = S();
        rs.push({ win: s.result.win, stars: s.result.stars, hp: s.hp, wave: s.result.wave, time: Math.round(s.time),
          acc: s.result.acc, maxCombo: s.maxCombo, ults: s.stats.ults, quizMana: s.stats.manaFromQuiz, regenMana: s.stats.manaFromRegen,
          endMana: s.mana, peakMana, firstFullMax, answered: s.stats.answered, skipped: s.stats.skipped, leakByWave, manaAtWave,
          towers: s.towers.filter(Boolean).length, lvSum: s.towers.reduce((a, t) => a + (t ? t.lv : 0), 0) });
      }
      return rs;
    }, { prof, RUNS, OV });
    const avg = k => (out.reduce((a, r) => a + (r[k] ?? 0), 0) / out.length);
    const fm = out.filter(r => r.firstFullMax !== null).map(r => r.firstFullMax);
    const leak = [0,1,2,3,4].map(w => (out.reduce((a, r) => a + r.leakByWave[w], 0) / out.length).toFixed(1));
    console.log(`${prof.name.padEnd(14)} 승률 ${(out.filter(r => r.win).length / out.length * 100).toFixed(0)}% | 별 ${avg('stars').toFixed(2)} | HP ${avg('hp').toFixed(1)} | 도달웨이브 ${avg('wave').toFixed(1)} | ${avg('time').toFixed(0)}s | 정답률 ${(avg('acc')*100).toFixed(0)}% | 최대콤보 ${avg('maxCombo').toFixed(1)} | 궁 ${avg('ults').toFixed(1)} | 마나 문제 ${avg('quizMana').toFixed(0)}/회복 ${avg('regenMana').toFixed(0)} | 종료잔여 ${avg('endMana').toFixed(0)} 최고 ${avg('peakMana').toFixed(0)} | 타워 ${avg('towers').toFixed(1)}개 Lv합 ${avg('lvSum').toFixed(1)} | 풀강 ${fm.length}/${out.length}판 평균 ${fm.length ? (fm.reduce((a,b)=>a+b,0)/fm.length).toFixed(0)+'s' : '-'} | 웨이브별 HP손실 ${leak.join('/')}`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
