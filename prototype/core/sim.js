/* =====================================================================
 * 아르카나 수비대 — 시뮬 코어 (4차, 수비 모드)
 * 2D 프로토타입 3차(index.html)의 게임 로직을 렌더·DOM 없이 옮긴 것. 새 규칙 없음.
 * - 좌표·길이는 모두 **타일 단위**(타일 (c,r) 중심 = (c+0.5, r+0.5)). 고도는 정수 e(0/1/2)만 안다.
 * - 고정 틱 10틱/초(step(dt)는 실제 시간을 쌓아 0.1초 틱으로 나눠 돌린다). 난수는 런마다 시드 RNG 1개.
 * - 렌더러는 snapshot()으로 SoA 숫자 배열 + 이벤트 큐를 읽기만 한다(12 문서 3.2·3.3절).
 * - 브라우저 <script>(window.ArcanaSim)와 Node require 모두 동작(UMD).
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArcanaSim = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

/* BALANCE v0.4 — 2D 3차와 같은 값. 길이 단위만 타일로 바꿨다:
 * 2D는 칸 34px였으므로 "2D px 값 / 34"를 분수 그대로 적는다(소수로 반올림하면 2D와 같은 입력에서 결과가 갈라진다). */
const BALANCE = {
  version: 'v0.4',
  // 10틱/초 고정, 동시 적 상한(풀). cooldownCarry(비교 플래그, 기본 false = 2D 3차 로직 그대로):
  // 2D 는 공격 쿨다운이 끝난 프레임의 남는 시간을 버린다 → 결과가 프레임률에 따라 달라진다(0.1초 틱이면 소드 0.4초 → 0.5초 주기).
  // true 면 쿨다운·스폰의 틱 안 남는 시간을 이월해 60fps 2D 와 같은 주기를 낸다(README 4차 표).
  sim: { tickSec: 0.1, enemyCap: 128, cooldownCarry: false },
  tower: { hp: 10, shieldCap: 5 },
  mana: { start: 5, max: 99, regenAmount: 1, regenSec: 10, byDifficulty: { 1: 3, 2: 4, 3: 5 } },
  cost: { summon: 5, upgrade: [4, 6, 8] },
  maxLevel: 4,
  quiz: { idleWarnSec: 7, idleSkipSec: 10, correctDelay: 0.35, wrongLockBase: 2.0, wrongLockStep: 1.0, wrongLockMax: 5.0, readFloorSec: 0.8 },
  combo: { cycle: 8, discountAt: 3, discountAmount: 2, buffAt: 5, buffMult: 1.3, buffSec: 10, ultAt: 8 },
  ult: { name: '세계(광역 폭발)', damage: 350 },
  waves: { count: 5, prepSec: 5, breakSec: 5, hpMult: [1, 1.6, 2.4, 3.4, 5.0] },
  stage: { hpMultByDiff: { 1: 0.85, 2: 1.0, 3: 1.2 } },
  terrain: {
    rangeMult: [1.00, 1.08, 1.15], lowlandDiscount: 1, lowlandFloor: 4, comboFloor: 3,
    uphill: 0.8, downhill: 1.1, minSpeedMult: 0.45,
    normalizePathLen: true, refPathLen: 1290 / 34,   // 맵마다 길 길이가 달라도 평지 통과 시간은 같게(2D 1290px)
  },
  autoPlace: { coverRange: 85 / 34, sampleStep: 4 / 34 },   // 자동 배치 우선순위: 이 반경(× 고도 배율) 안의 길 길이
  stars: { hpFor2: 6, accFor3: 0.8, comboFor3: 5 },
  review: { bonusMana: 3 },
  comboResetMode: 'full',
  xp: {
    kill: { normal: 1, fast: 2, tank: 4, boss: 10 },
    answer: { base: 2, combo5: 4, combo5At: 5, minCombo: 2, tfScale: 0.5, perWaveCap: 20 },
    perLevel: 15, maxLevel: 6, chapterMult: [1.00, 1.20, 1.40, 1.65],
    openDraftMinCorrect: 3,
  },
  perk: {
    enabled: true,
    draft: { choices: 3, windowSec: 3.0, inputGuardSec: 0.25, timeScale: 0.3, resumeSec: 0.3, chainGapSec: 1.0,
             rarityWeight: { common: 70, rare: 25, legendary: 5 }, capRoomMin: 0.5, emptyMana: 3 },
    caps: { dmgEq: 15, rangeTotal: 1.20, killMana: 10, learnMana: 14, totalMana: 20, towerHeal: 3, atkSpeed: 0.20 },
    flow: { window: 10, minCorrect: 6, earlyMinAnswered: 4, earlyMinAcc: 0.6 },
    adjDist: 1.5,                                    // 09 §3.0 인접: 슬롯 중심 거리 ≤ 1.5칸
  },
  cards: {
    wand:     { name: '완드', el: '불', icon: '🔥', glyph: '▲', key: 'Q', color: '#ff7a45', role: '단일 고화력',
                lv: [ { dmg: 24, cd: 1.1, range: 88 / 34 }, { dmg: 40, cd: 1.0, range: 96 / 34 }, { dmg: 62, cd: 0.9, range: 104 / 34 },
                      { dmg: 80, cd: 0.85, range: 108 / 34, pierce: 1, pierceMult: 0.7 } ] },
    cup:      { name: '컵', el: '물', icon: '💧', glyph: '●', key: 'W', color: '#4cc9f0', role: '둔화',
                lv: [ { dmg: 5, cd: 0.9, range: 82 / 34, slow: 0.35, slowSec: 1.6 }, { dmg: 8, cd: 0.8, range: 90 / 34, slow: 0.45, slowSec: 1.8 },
                      { dmg: 12, cd: 0.7, range: 98 / 34, slow: 0.55, slowSec: 2.0 }, { dmg: 16, cd: 0.65, range: 102 / 34, slow: 0.55, slowSec: 2.2, slowAoE: 46 / 34 } ] },
    sword:    { name: '소드', el: '바람', icon: '🗡️', glyph: '◆', key: 'E', color: '#8ee3a8', role: '연타·다수',
                lv: [ { dmg: 7, cd: 0.40, range: 78 / 34, targets: 2 }, { dmg: 11, cd: 0.35, range: 84 / 34, targets: 2 },
                      { dmg: 15, cd: 0.30, range: 90 / 34, targets: 2 }, { dmg: 18, cd: 0.28, range: 94 / 34, targets: 3 } ] },
    pentacle: { name: '펜타클', el: '땅', icon: '🪨', glyph: '⬟', key: 'R', color: '#e9c46a', role: '탑 보호막',
                lv: [ { shieldEvery: 12 }, { shieldEvery: 9 }, { shieldEvery: 6 }, { shieldEvery: 5, regenAfterHit: 1.5 } ] },
  },
  enemies: {                                         // speed = 타일/초(2D 38/70/24/15 px/초)
    normal: { name: '안개 조각', hp: 130, speed: 38 / 34, armor: 0, dmg: 1 },
    fast:   { name: '속삭임', hp: 80, speed: 70 / 34, armor: 0, dmg: 1 },
    tank:   { name: '침묵 덩어리', hp: 430, speed: 24 / 34, armor: 3, dmg: 2 },
    boss:   { name: '망각의 왕', hp: 3500, speed: 15 / 34, armor: 5, dmg: 5, slowResist: 0.5 },
  },
  waveList: [
    [ { type: 'normal', n: 6, gap: 1.8 } ],
    [ { type: 'normal', n: 6, gap: 1.5 }, { type: 'fast', n: 3, gap: 1.1 } ],
    [ { type: 'normal', n: 12, gap: 0.9 }, { type: 'tank', n: 3, gap: 2.5 }, { type: 'fast', n: 6, gap: 0.8 } ],
    [ { type: 'fast', n: 12, gap: 0.6 }, { type: 'tank', n: 4, gap: 2.2 }, { type: 'normal', n: 12, gap: 0.8 } ],
    [ { type: 'normal', n: 6, gap: 1.0 }, { type: 'boss', n: 1, gap: 3.0 }, { type: 'tank', n: 3, gap: 2.2 }, { type: 'fast', n: 8, gap: 0.7 },
      { type: 'normal', n: 10, gap: 2.0, at: 9 } ],
  ],
};

/* 문항 30개 · 특성 24개 — 2D 3차 index.html 의 데이터를 그대로 옮김 */
const QUESTIONS = [
  {id:'m01', d:1, q:'7 + 8 = ?',          c:['15','14','16','13']},
  {id:'m02', d:1, q:'23 + 19 = ?',        c:['42','41','32','43']},
  {id:'m03', d:1, q:'52 − 27 = ?',        c:['25','35','24','29']},
  {id:'m04', d:1, q:'6 × 7 = ?',          c:['42','36','48','49']},
  {id:'m05', d:1, q:'9 × 8 = ?',          c:['72','64','81','63']},
  {id:'m06', d:1, q:'56 ÷ 7 = ?',         c:['8','7','9','6']},
  {id:'m07', d:1, q:'81 ÷ 9 = ?',         c:['9','8','7','11']},
  {id:'m08', d:1, q:'100 − 36 = ?',       c:['64','74','66','54']},
  {id:'m09', d:1, q:'4 × 12 = ?',         c:['48','44','52','36']},
  {id:'m10', d:1, q:'15 + 28 = ?',        c:['43','33','42','53']},
  {id:'m11', d:2, q:'12 × 13 = ?',        c:['156','144','169','132']},
  {id:'m12', d:2, q:'144 ÷ 12 = ?',       c:['12','11','14','13']},
  {id:'m13', d:2, q:'35 × 4 = ?',         c:['140','120','145','135']},
  {id:'m14', d:2, q:'250 − 87 = ?',       c:['163','173','167','153']},
  {id:'m15', d:2, q:'3 × (4 + 5) = ?',    c:['27','17','21','35']},
  {id:'m16', d:2, q:'48 ÷ 6 + 7 = ?',     c:['15','14','13','4']},
  {id:'m17', d:2, q:'18 × 5 = ?',         c:['90','80','95','85']},
  {id:'m18', d:2, q:'7 × 8 − 9 = ?',      c:['47','49','45','56']},
  {id:'m19', d:2, q:'1/2 + 1/4 = ?',      c:['3/4','2/6','1/6','2/4']},
  {id:'m20', d:2, q:'0.5 + 0.25 = ?',     c:['0.75','0.30','0.525','0.7']},
  {id:'m21', d:3, q:'2/3 + 1/6 = ?',      c:['5/6','3/9','1/2','3/6']},
  {id:'m22', d:3, q:'3/4 − 1/3 = ?',      c:['5/12','2/1','1/2','2/12']},
  {id:'m23', d:3, q:'2/5 × 3/4 = ?',      c:['3/10','5/9','6/9','8/15']},
  {id:'m24', d:3, q:'25 × 24 = ?',        c:['600','500','625','480']},
  {id:'m25', d:3, q:'80의 15% = ?',        c:['12','15','8','16']},
  {id:'m26', d:3, q:'3² + 4² = ?',         c:['25','49','14','24']},
  {id:'m27', d:3, q:'(−3) × (−7) = ?',     c:['21','−21','−10','10']},
  {id:'m28', d:3, q:'1.2 × 0.5 = ?',       c:['0.6','6','0.06','1.7']},
  {id:'m29', d:3, q:'3/5 ÷ 3/10 = ?',      c:['2','1/2','9/50','3/2']},
  {id:'m30', d:3, q:'2x + 3 = 11 일 때 x = ?', c:['4','7','5','8']},
];

const PERKS = [
  {"id":"A1","name":"안개 걷기","family":"A","familyName":"속성 대비","rarity":"common","rarityName":"일반","icon":"🎯","short":"안개 피해 +15%","desc":"안개 조각에게 주는 피해가 15% 늘어요. 한 번 더 고르면 또 15% 늘어요.","stack":{"max":2,"mode":"repeat"},"requires":[],"minDraft":1,"effects":[{"op":"dmgVsEnemy","enemies":["normal"],"add":0.15}],"gate":null,"caps":{"pool":"dmgEq"},"eq":5.5,"me":{"full":6.4,"std":5.6,"max":6.3,"formula":"ME = 15% × 안개 비중 0.368 × 1.16 = 6.4"},"weight":1},
  {"id":"A2","name":"느린 걸음","family":"A","familyName":"속성 대비","rarity":"common","rarityName":"일반","icon":"🎯","short":"속삭임 속도 -15%","desc":"속삭임의 걸음이 15% 느려져요. 컵 둔화와 겹쳐도 원래 속도의 45%보다 느려지지 않아요.","stack":{"max":1,"mode":"none"},"requires":[{"type":"stageHas","enemy":"fast"}],"minDraft":1,"effects":[{"op":"enemySpeed","enemies":["fast"],"mult":0.85,"floorBaseSpeed":0.45}],"gate":null,"caps":{"pool":"dmgEq"},"eq":3.3,"me":{"full":3.8,"std":3.3,"max":3.7,"formula":"속도 ×0.85 → 사거리 체류 +17.6%, 하한 45%와 겹침으로 70%만 유효 = +12.3% × 속삭임 비중 0.265 × 1.16 = 3.8"},"weight":1},
  {"id":"A3","name":"갑옷 풀기","family":"A","familyName":"속성 대비","rarity":"common","rarityName":"일반","icon":"🎯","short":"침묵 방어 -3","desc":"침묵 덩어리의 방어를 3 깎고, 주는 피해도 10% 늘어요.","stack":{"max":1,"mode":"none"},"requires":[{"type":"stageHas","enemy":"tank"}],"minDraft":1,"effects":[{"op":"armorShred","enemies":["tank"],"value":3},{"op":"dmgVsEnemy","enemies":["tank"],"add":0.1}],"gate":null,"caps":{"pool":"dmgEq"},"eq":5.3,"me":{"full":6.1,"std":5.3,"max":6,"formula":"방어 -3 ≈ +13.8%(카드 피해 비중 가중) + 10% = 23.8% × 침묵 비중 0.221 × 1.16 = 6.1"},"weight":1},
  {"id":"A4","name":"큰 안개 사냥","family":"A","familyName":"속성 대비","rarity":"rare","rarityName":"희귀","icon":"🎯","short":"침묵·왕 피해 +20%","desc":"침묵 덩어리와 망각의 왕에게 주는 피해가 20% 늘어요.","stack":{"max":1,"mode":"none"},"requires":[{"type":"stageHas","enemy":"tank"}],"minDraft":1,"effects":[{"op":"dmgVsEnemy","enemies":["tank","boss"],"add":0.2}],"gate":null,"caps":{"pool":"dmgEq"},"eq":7.4,"me":{"full":8.5,"std":7.5,"max":8.4,"formula":"20% × (0.221+0.147) × 1.16 = 8.5"},"weight":1},
  {"id":"A5","name":"왕관 겨누기","family":"A","familyName":"속성 대비","rarity":"rare","rarityName":"희귀","icon":"🎯","short":"왕 피해 +35%","desc":"망각의 왕에게 주는 피해가 35% 늘고, 왕이 탑에 닿아도 피해가 2 줄어요(5→3).","stack":{"max":1,"mode":"none"},"requires":[{"type":"stageHas","enemy":"boss"}],"minDraft":1,"effects":[{"op":"dmgVsEnemy","enemies":["boss"],"add":0.35},{"op":"bossTowerDamage","delta":-2}],"gate":null,"caps":{"pool":"dmgEq"},"eq":5.1,"me":{"full":6.9,"std":6,"max":6.7,"formula":"35% × 0.147 × 1.16 = 6.0 + 보스 누수 보험 0.15 × 2HP × 3 = 0.9 → 6.9"},"weight":1},
  {"id":"A6","name":"새벽 빛줄기","family":"A","familyName":"속성 대비","rarity":"legendary","rarityName":"전설","icon":"🎯","short":"모든 피해 +10%","desc":"모든 안개에게 주는 피해가 10% 늘어요.","stack":{"max":1,"mode":"none"},"requires":[{"type":"cardKinds","kinds":["wand","cup","sword"],"min":2}],"minDraft":2,"effects":[{"op":"dmgAll","add":0.1}],"gate":null,"caps":{"pool":"dmgEq"},"eq":10,"me":{"full":11.6,"std":10.2,"max":11.4,"formula":"10% × 1.16 = 11.6"},"weight":1},
  {"id":"B1","name":"한 방울 마나","family":"B","familyName":"처치 보상","rarity":"common","rarityName":"일반","icon":"🎁","short":"처치 15% 마나 +1","desc":"안개 조각·속삭임을 흩을 때 15% 확률로 마나 +1. 몰입 상태에서만, 판당 최대 +4.","stack":{"max":1,"mode":"none"},"requires":[],"minDraft":1,"effects":[{"op":"manaOnKill","enemies":["normal","fast"],"chance":0.15,"amount":1,"gate":"flow","capRun":4}],"gate":"flow","caps":{"pool":"killMana"},"eq":null,"me":{"full":4,"std":4,"max":4,"formula":"min(4, 처치 71 × 0.15 × 몰입 0.85 × 남은 비율) = 4 (일찍 얻으면 상한에 닿음)"},"weight":1},
  {"id":"B2","name":"탑의 숨결","family":"B","familyName":"처치 보상","rarity":"common","rarityName":"일반","icon":"🎁","short":"정예 처치 탑 HP+1","desc":"침묵 덩어리나 망각의 왕을 흩으면 탑 HP +1. 판당 최대 +3.","stack":{"max":1,"mode":"none"},"requires":[{"type":"stageHas","enemy":"tank"}],"minDraft":1,"effects":[{"op":"towerHealOnKill","enemies":["tank","boss"],"amount":1,"capRun":3}],"gate":null,"caps":{"pool":"towerHeal"},"eq":null,"me":{"full":5.4,"std":5.4,"max":3.6,"formula":"min(3, 정예·왕 처치 8) × 실효 0.6(탑 HP가 깎여 있을 때만) × 3마나/HP = 5.4"},"weight":1},
  {"id":"B3","name":"콤보 방패","family":"B","familyName":"처치 보상","rarity":"common","rarityName":"일반","icon":"🎁","short":"콤보 보호 1회","desc":"누수 없이 웨이브를 막으면 방패가 충전돼요. 오답을 해도 콤보가 유지돼요(판당 최대 2번).","stack":{"max":1,"mode":"none"},"requires":[],"minDraft":1,"effects":[{"op":"comboShield","chargeOn":"waveCleanClear","holdMax":1,"useCapRun":2}],"gate":null,"caps":{},"eq":null,"me":{"full":5,"std":5,"max":5,"formula":"min(2, 콤보 3+ 오답 4 × 0.8) × 콤보 1회 가치 2.5 = 5.0"},"weight":1},
  {"id":"B4","name":"속삭임 수집","family":"B","familyName":"처치 보상","rarity":"rare","rarityName":"희귀","icon":"🎁","short":"3마리마다 마나+1","desc":"속삭임을 3마리 흩을 때마다 마나 +1. 몰입 상태에서만, 판당 최대 +6.","stack":{"max":1,"mode":"none"},"requires":[{"type":"card","card":"sword","min":1},{"type":"stageHas","enemy":"fast"}],"minDraft":1,"effects":[{"op":"manaOnKill","enemies":["fast"],"every":3,"amount":1,"gate":"flow","capRun":6}],"gate":"flow","caps":{"pool":"killMana"},"eq":null,"me":{"full":6,"std":6,"max":6,"formula":"min(6, 속삭임 36 ÷ 3 × 0.85) = 6"},"weight":1},
  {"id":"B5","name":"탑 복원","family":"B","familyName":"처치 보상","rarity":"rare","rarityName":"희귀","icon":"🎁","short":"정리 때 탑 HP+1","desc":"웨이브를 다 막으면 탑 HP +1(탑 HP 9 이하일 때). 판당 최대 +3.","stack":{"max":1,"mode":"none"},"requires":[{"type":"card","card":"pentacle","min":1}],"minDraft":1,"effects":[{"op":"towerHealOnWaveClear","amount":1,"whenTowerHpAtMost":9,"capRun":3}],"gate":null,"caps":{"pool":"towerHeal"},"eq":null,"me":{"full":9,"std":7.2,"max":6,"formula":"min(3, 남은 웨이브 5 × 실효 0.6) × 3마나/HP = 9 (이른 획득 기준)"},"weight":1},
  {"id":"B6","name":"빛의 샘","family":"B","familyName":"처치 보상","rarity":"legendary","rarityName":"전설","icon":"🎁","short":"5마리마다 마나+1","desc":"안개를 5마리 흩을 때마다 마나 +1. 몰입 상태에서만, 판당 최대 +10.","stack":{"max":1,"mode":"none"},"requires":[],"minDraft":2,"effects":[{"op":"manaOnKill","enemies":["normal","fast","tank","boss"],"every":5,"amount":1,"gate":"flow","capRun":10}],"gate":"flow","caps":{"pool":"killMana"},"eq":null,"me":{"full":10,"std":10,"max":10,"formula":"min(10, 79 ÷ 5 × 0.85) = 10"},"weight":1},
  {"id":"C1","name":"이웃의 힘","family":"C","familyName":"주변 오라","rarity":"common","rarityName":"일반","icon":"🔗","short":"이웃 1장당 +3%","desc":"옆자리 카드 1장마다 공격력 +3%(최대 2장). 한 번 더 고르면 +6%씩.","stack":{"max":2,"mode":"repeat"},"requires":[{"type":"cardCount","min":2}],"minDraft":1,"effects":[{"op":"auraAdjacentDmg","perNeighbor":0.03,"maxNeighbors":2}],"gate":null,"caps":{"pool":"dmgEq"},"eq":4.8,"me":{"full":5.6,"std":4.9,"max":5.5,"formula":"평균 이웃 1.6장 × 3% = 4.8% × 1.16 = 5.6"},"weight":1},
  {"id":"C2","name":"같은 빛 공명","family":"C","familyName":"주변 오라","rarity":"common","rarityName":"일반","icon":"🔗","short":"같은 속성 쌍 +8%","desc":"같은 속성 카드가 2장 이상이면 그 카드들의 공격력이 8% 늘어요.","stack":{"max":1,"mode":"none"},"requires":[{"type":"sameAttr","min":2}],"minDraft":1,"effects":[{"op":"resonance","sameAttrMin":2,"dmgAdd":0.08}],"gate":null,"caps":{"pool":"dmgEq"},"eq":5.6,"me":{"full":6.5,"std":5.7,"max":6.4,"formula":"표준 구성(완드 3·컵 2) 피해 비중 0.70 × 8% = 5.6% × 1.16 = 6.5"},"weight":1},
  {"id":"C3","name":"높은 곳의 눈","family":"C","familyName":"주변 오라","rarity":"common","rarityName":"일반","icon":"🔗","short":"고지 사거리 +5%p","desc":"중지대·고지대 슬롯 카드의 사거리가 5%p 늘어요. 지형 보너스와 합쳐 최대 +20%.","stack":{"max":1,"mode":"none"},"requires":[{"type":"slotElev","min":1},{"type":"stageElevKinds","min":2}],"minDraft":1,"effects":[{"op":"rangeAddByElev","elevMin":1,"add":0.05,"totalRangeCap":1.2}],"gate":null,"caps":{"rangeTotalMax":1.2,"pool":"dmgEq"},"eq":3.8,"me":{"full":4.4,"std":3.9,"max":4.3,"formula":"체류 길이 L=2√(R²-1): 고지 5.39→5.66 (+5.8%p) × 슬롯 피해 비중 0.65 = 3.8% × 1.16 = 4.4"},"weight":1},
  {"id":"C4","name":"높낮이 어울림","family":"C","familyName":"주변 오라","rarity":"rare","rarityName":"희귀","icon":"🔗","short":"높낮이 공격 +8%","desc":"서로 다른 높이의 슬롯에 카드가 있으면 모든 카드의 공격력이 8% 늘어요.","stack":{"max":1,"mode":"none"},"requires":[{"type":"stageElevKinds","min":2}],"minDraft":1,"effects":[{"op":"elevMixBonus","kindsMin":2,"dmgAdd":0.08}],"gate":null,"caps":{"pool":"dmgEq"},"eq":6.8,"me":{"full":7.9,"std":6.9,"max":7.7,"formula":"8% × 발동 확률 0.85 = 6.8% × 1.16 = 7.9"},"weight":1},
  {"id":"C5","name":"물결 오라","family":"C","familyName":"주변 오라","rarity":"rare","rarityName":"희귀","icon":"🔗","short":"컵 이웃 공속 +15%","desc":"컵 옆자리 카드의 공격 속도가 15% 늘어요.","stack":{"max":1,"mode":"none"},"requires":[{"type":"card","card":"cup","min":1},{"type":"cardCount","min":2}],"minDraft":1,"effects":[{"op":"auraAdjacentAtkSpeed","sourceCard":"cup","add":0.15}],"gate":null,"caps":{"pool":"dmgEq"},"eq":6,"me":{"full":7,"std":6.1,"max":6.8,"formula":"컵 이웃 카드 피해 비중 0.40 × 15% = 6.0% × 1.16 = 7.0"},"weight":1},
  {"id":"C6","name":"탑지기 합창","family":"C","familyName":"주변 오라","rarity":"legendary","rarityName":"전설","icon":"🔗","short":"4속성 공격 +7%","desc":"네 속성 카드가 모두 있으면 모든 카드의 공격력 +7%, 사거리 +3%p.","stack":{"max":1,"mode":"none"},"requires":[{"type":"allAttrs","min":4}],"minDraft":2,"effects":[{"op":"allAttrBonus","attrsMin":4,"dmgAdd":0.07,"rangeAdd":0.03,"totalRangeCap":1.2}],"gate":null,"caps":{"rangeTotalMax":1.2,"pool":"dmgEq"},"eq":10.5,"me":{"full":12.2,"std":10.7,"max":12,"formula":"(7% + 사거리 +3%p ≈ 3.5%) = 10.5% × 1.16 = 12.2"},"weight":1},
  {"id":"D1","name":"반짝 마나","family":"D","familyName":"학습 연계","rarity":"common","rarityName":"일반","icon":"📖","short":"콤보2+ 마나 +1","desc":"콤보 2 이상일 때 정답마다 마나 +1. 판당 최대 +5(겹치면 +10).","stack":{"max":2,"mode":"repeat"},"requires":[],"minDraft":1,"effects":[{"op":"manaOnCorrect","minCombo":2,"amount":1,"capRun":5}],"gate":null,"caps":{"pool":"learnMana"},"eq":null,"me":{"full":5,"std":5,"max":5,"formula":"min(5, 콤보2+ 정답 14 × 0.85) = 5"},"weight":1},
  {"id":"D2","name":"쉼표 한 번","family":"D","familyName":"학습 연계","rarity":"common","rarityName":"일반","icon":"📖","short":"오답 잠금 -1초","desc":"몰입 상태에서 연속 오답으로 늘어난 잠금이 1초 줄어요(기본 2초 아래로는 안 내려가요).","stack":{"max":1,"mode":"none"},"requires":[],"minDraft":1,"effects":[{"op":"wrongLockReduce","seconds":1,"minLockSec":2,"gate":"flow"}],"gate":"flow","caps":{},"eq":null,"me":{"full":1.5,"std":1,"max":1.4,"formula":"연속 오답 2회/판 × 1초 × 마나 속도 0.7/초 = 1.4 → 1.0~1.5"},"weight":1},
  {"id":"D3","name":"기억의 열쇠","family":"D","familyName":"학습 연계","rarity":"common","rarityName":"일반","icon":"📖","short":"복습 통과 마나+3","desc":"봉인 카드 복습 문제를 맞히면 마나 +3. 판당 최대 +6.","stack":{"max":1,"mode":"none"},"requires":[{"type":"dueSealed","min":1}],"minDraft":1,"effects":[{"op":"manaOnReviewPass","amount":3,"capRun":6}],"gate":null,"caps":{"pool":"learnMana"},"eq":null,"me":{"full":6,"std":4.1,"max":6,"formula":"min(6, 복습 통과 2(보통)~3(우수) × 3 × 남은 비율)"},"weight":1},
  {"id":"D4","name":"도전 보상","family":"D","familyName":"학습 연계","rarity":"rare","rarityName":"희귀","icon":"📖","short":"어려움 정답 +2","desc":"어려운 문제를 맞히면 마나가 2 더 들어와요. 몰입 상태에서만, 판당 최대 +8.","stack":{"max":1,"mode":"none"},"requires":[{"type":"packHasDifficulty","d":3}],"minDraft":1,"effects":[{"op":"manaOnCorrect","difficulty":3,"amount":2,"gate":"flow","capRun":8}],"gate":"flow","caps":{"pool":"learnMana"},"eq":null,"me":{"full":8,"std":5.8,"max":8,"formula":"min(8, 어려움 정답 5(보통)~12(우수) × 2 × 몰입 0.85~1.0 × 남은 비율) = 8"},"weight":1},
  {"id":"D5","name":"연승의 불꽃","family":"D","familyName":"학습 연계","rarity":"rare","rarityName":"희귀","icon":"📖","short":"콤보 달성 마나+1","desc":"콤보 3·5·8을 달성할 때마다 마나 +1. 판당 최대 +6.","stack":{"max":1,"mode":"none"},"requires":[{"type":"maxComboReached","min":3}],"minDraft":1,"effects":[{"op":"manaOnComboMilestone","combos":[3,5,8],"amount":1,"capRun":6}],"gate":null,"caps":{"pool":"learnMana"},"eq":null,"me":{"full":5,"std":3.4,"max":6,"formula":"min(6, 달성 횟수 5(보통)~11(우수) × 남은 비율)"},"weight":1},
  {"id":"D6","name":"깊은 몰입","family":"D","familyName":"학습 연계","rarity":"legendary","rarityName":"전설","icon":"📖","short":"몰입 정답 마나+1","desc":"몰입 상태에서 정답마다 마나 +1. 판당 최대 +10.","stack":{"max":1,"mode":"none"},"requires":[],"minDraft":2,"effects":[{"op":"manaOnCorrect","amount":1,"gate":"flow","capRun":10}],"gate":"flow","caps":{"pool":"learnMana"},"eq":null,"me":{"full":10,"std":10,"max":10,"formula":"min(10, 정답 21 × 0.85) = 10"},"weight":1}
];

/* 맵 4개 — bg_demo.html / 3d_spike.html (= 08 문서 3절)과 같은 데이터. 10×18, 고도 0/1/2 */
const COLS = 10, ROWS = 18;
const MAPS = [
 { id: 'R1', name: '1장 은빛 씨앗 들판', wp: [[1,0],[1,3],[8,3],[8,8],[1,8],[1,13],[8,13],[8,17]],
   slots: [[3,4],[6,4],[7,6],[5,7],[2,9],[5,9],[2,11],[4,12],[7,12],[7,15]],
   elev: ['0000000000','0000000000','0000111000','0001121100','0012221100','0011211100','0001110100','0000000000','0000000000','0000011000','0000111000','0001221000','0011211000','0001110000','0000000000','0000000000','0000000000','0000000000'] },
 { id: 'R2', name: '2장 메아리 숲', wp: [[8,0],[8,2],[2,2],[2,7],[7,7],[7,12],[1,12],[1,17]],
   slots: [[5,1],[4,3],[3,5],[6,6],[4,8],[6,10],[3,11],[5,13],[2,15]],
   elev: ['0000000000','0000011000','0000111000','0001221100','0001222100','0011122100','0011111100','0000110000','0001210000','0000110000','0000000000','0000000000','0000110000','0000121000','0000011000','0011000000','0000000000','0000000000'] },
 { id: 'R3', name: '3장 안개 바다 항구', wp: [[5,0],[5,2],[1,2],[1,6],[8,6],[8,11],[3,11],[3,17]],
   slots: [[3,3],[3,5],[6,5],[2,7],[5,7],[7,9],[5,12],[4,14],[2,15]],
   elev: ['2222222222','2222222222','2111222211','1112211111','1111111111','1000001111','0000000000','0000110000','0000000111','0000001211','0000001111','0000000000','0000011000','0000000000','0000100000','0000000000','0000000000','0000000000'] },
 { id: 'R4', name: '4장 구름 계단 정상', wp: [[8,0],[8,3],[1,3],[1,8],[8,8],[8,13],[2,13],[2,17]],
   slots: [[3,2],[6,2],[4,4],[5,7],[3,9],[6,9],[7,11],[5,12],[3,14]],
   elev: ['0000000000','0000000000','0000000000','0000000000','0001110000','1111111111','1111111111','1111111111','1111111111','1112111111','1111111111','1111122222','1112222222','2222222222','2222222222','2222222222','2222222222','2222222222'] },
];
function pathTiles(wp) { const out = []; for (let i = 0; i < wp.length - 1; i++) { const [x0, y0] = wp[i], [x1, y1] = wp[i + 1]; const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0); let x = x0, y = y0; for (;;) { const l = out[out.length - 1]; if (!l || l[0] !== x || l[1] !== y) out.push([x, y]); if (x === x1 && y === y1) break; x += dx; y += dy; } } return out; }
MAPS.forEach(m => {
  m.path = pathTiles(m.wp); m.E = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS) ? null : +m.elev[r][c];
  m.pk = new Map(m.path.map((t, i) => [t[0] + ',' + t[1], i])); m.sk = new Set(m.slots.map(s => s.join(',')));
  let u = 0, d = 0; const slopes = [];
  for (let i = 1; i < m.path.length; i++) { const a = m.E(...m.path[i - 1]), b = m.E(...m.path[i]); if (b > a) { u++; slopes.push([m.path[i][0], m.path[i][1], 1]); } else if (b < a) { d++; slopes.push([m.path[i][0], m.path[i][1], -1]); } }
  m.up = u; m.down = d; m.slopes = slopes; m.ec = [0, 0, 0]; m.slots.forEach(s => m.ec[m.E(s[0], s[1])]++);
});
const SUBJECTS = ['수학 · 기하 결정체', '영어 · 글자 깃발', '과학 · 실험 장치', '한국사 · 기와·성곽'];
const DIFFS = ['난이도 1 · 이른 노을', '난이도 2 · 황혼', '난이도 3 · 밤'];
const CARD_TYPES = ['wand', 'cup', 'sword', 'pentacle'];
const ENEMY_TYPES = ['normal', 'fast', 'tank', 'boss'];
const PERK_BY_ID = Object.fromEntries(PERKS.map(p => [p.id, p]));
const RARITY_RANK = { common: 0, rare: 1, legendary: 2 };
// 검증 전용: 2D 화면의 2.5D 들어올림(고도 1당 4px = 4/34칸)을 논리 좌표에 재현한다. 기본은 0(12 §3.2 고도 투영 오프셋 금지).
const LIFT_2D = 4 / 34;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* 맵 기하(타일 단위): 경로 폴리라인·구간·슬롯·자동 배치 우선순위 */
function buildGeo(ri, lift) {
  const M = MAPS[ri], TR = BALANCE.terrain, AP = BALANCE.autoPlace;
  const tc = (c, r) => { const e = M.E(c, r); return { c, r, e, x: c + 0.5, y: r + 0.5 - e * lift }; };
  const PTS = M.path.map(([c, r]) => tc(c, r)), SEG = [];
  let L = 0;
  for (let i = 0; i < PTS.length - 1; i++) {
    const a = PTS[i], b = PTS[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    SEG.push({ a, b, len, start: L, slope: Math.sign(b.e - a.e) }); L += len;
  }
  const G = { map: M, region: ri, PTS, SEG, pathLen: L, speedNorm: TR.normalizePathLen ? L / TR.refPathLen : 1 };
  G.posAt = (d, o) => {
    if (d <= 0) { o.x = PTS[0].x; o.y = PTS[0].y; o.si = 0; return o; }
    for (let i = 0; i < SEG.length; i++) { const s = SEG[i]; if (d <= s.start + s.len) { const t = (d - s.start) / s.len; o.x = s.a.x + (s.b.x - s.a.x) * t; o.y = s.a.y + (s.b.y - s.a.y) * t; o.si = i; return o; } }
    const l = PTS[PTS.length - 1]; o.x = l.x; o.y = l.y; o.si = SEG.length - 1; return o;
  };
  G.SLOTS = M.slots.map(([c, r], i) => Object.assign({ i }, tc(c, r)));
  for (const s of G.SLOTS) s.adj = G.SLOTS.filter(o => o !== s && Math.hypot(o.c - s.c, o.r - s.r) <= BALANCE.perk.adjDist).map(o => o.i);
  const p = {};
  for (const s of G.SLOTS) { const R = AP.coverRange * TR.rangeMult[s.e]; let cov = 0;
    for (let k = 0, d = 0; d < L; k++, d = k * AP.sampleStep) { G.posAt(d, p); if (Math.hypot(p.x - s.x, p.y - s.y) <= R) cov++; }
    s.coverage = cov; }
  G.slotPriority = G.SLOTS.slice().sort((a, b) => b.coverage - a.coverage).map(s => s.i);
  G.tower = PTS[PTS.length - 1];
  return G;
}

function createSession() { return { sealed: new Map(), pendingBonus: 0 }; }

/* ===================== 런(한 판) ===================== */
// opts: { region 0~3, subject 0~3, diff 1~3, seed, session, events(false = 이벤트 큐 끔, 봇용), compat2D(검증 전용) }
function createRun(opts) {
  opts = opts || {};
  const B = BALANCE, TICK = B.sim.tickSec;
  const region = clamp(opts.region | 0, 0, 3), subject = clamp(opts.subject | 0, 0, 3), diff = clamp(opts.diff || 2, 1, 3);
  const session = opts.session || createSession();
  const seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
  // 난수: 시드 하나에서 흐름 3개 — 문제·봇(rng) / 드래프트(rngDraft) / 특성 확률(rngPerk). 타이밍이 조금 달라도 문제 순서가 흔들리지 않게 나눈다
  const rng = mulberry32(seed), rngDraft = mulberry32(seed ^ 0x9E3779B9), rngPerk = mulberry32(seed ^ 0x85EBCA6B);
  const G = buildGeo(region, opts.compat2D ? LIFT_2D : 0), SLOTS = G.SLOTS, SEG = G.SEG;
  const CARRY = !opts.compat2D && B.sim.cooldownCarry;   // compat2D(검증 전용) = 2D 를 0.1초 틱으로 돌린 것과 같은 계산
  const EV_ON = opts.events !== false;
  let events = [], S = null, acc = 0, tickNo = 0, nextId = 1;
  const pool = [];

  const ev = o => { if (EV_ON) { o.tick = tickNo; events.push(o); if (events.length > 4096) events.splice(0, 2048); } };
  const banner = msg => ev({ k: 'banner', msg });
  const flash = (msg, cls, ms) => ev({ k: 'feedback', msg, cls, ms: ms || 0 });
  function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  const perksOn = () => B.perk.enabled;
  const canPlay = () => !!S && (S.phase === 'prep' || S.phase === 'wave');

  function newState(bonus) {
    return {
      phase: 'prep', time: 0, region, subject, diff, seed,
      hp: B.tower.hp, shield: 0, mana: B.mana.start + bonus, regenT: 0, startBonus: bonus,
      waveIdx: 0, phaseT: B.waves.prepSec, spawnQ: [], waveT: 0,
      enemies: [], towers: SLOTS.map(() => null),
      combo: 0, maxCombo: 0, discountReady: false, buffT: 0, ultReady: false,
      stats: { answered: 0, correct: 0, wrong: 0, skipped: 0, summons: 0, upgrades: 0, leaked: 0, killed: 0, ults: 0, manaFromQuiz: 0, manaFromRegen: 0,
               fastCorrect: 0, lockSec: 0, spent: 0, manaFromPerk: 0, xp: { kill: 0, answer: 0, hook: 0 } },
      gauge: 0,
      xp: 0, level: 1, xpAnsWave: [], pendingDrafts: 0, draftNo: 0, draft: null, draftGap: 0, timeScale: 1, heldShown: false,
      perks: [], perkUse: {}, picks: [], levelLog: [], recent: [], comboShield: 0, waveLeaks: 0,
      pool: { killMana: 0, learnMana: 0, towerHeal: 0, totalMana: 0 },
      q: null, qT: 0, lockT: 0, lockKind: '', wrongStreak: 0, deck: [], lastIdx: -1,
      result: null, reviewDone: false, review: null,
    };
  }

  /* ---- 웨이브/적 ---- */
  function buildWave(idx) {
    const q = []; let t = 0;
    for (const g of B.waveList[idx]) {
      const t0 = g.at !== undefined ? g.at : t;
      for (let k = 0; k < g.n; k++) q.push({ t: t0 + k * g.gap, type: g.type });
      if (g.at === undefined) t = t0 + g.n * g.gap + 1.0;
    }
    return q.sort((a, b) => a.t - b.t);
  }
  function startWave() {
    S.phase = 'wave'; S.waveT = 0; S.spawnQ = buildWave(S.waveIdx); S.waveLeaks = 0;
    ev({ k: 'waveStart', wave: S.waveIdx });
    banner(S.waveIdx === B.waves.count - 1 ? `웨이브 ${S.waveIdx + 1} — 망각의 왕 등장!` : `웨이브 ${S.waveIdx + 1} 시작!`);
  }
  const enemyHp = (type, w, d) => Math.round(B.enemies[type].hp * B.waves.hpMult[w] * (B.stage.hpMultByDiff[d] || 1));
  function spawn(type) {
    if (S.enemies.length >= B.sim.enemyCap) return null;
    const hp = enemyHp(type, S.waveIdx, S.diff), e = pool.pop() || {};
    e.id = nextId++; e.type = type; e.hp = hp; e.maxHp = hp; e.dist = 0; e.ps = 0; e.slowT = 0; e.slowAmt = 0; e.hitT = 0;
    e.x = G.PTS[0].x; e.y = G.PTS[0].y; e.si = 0; e.dead = false; e.leaked = false;
    S.enemies.push(e); ev({ k: 'spawn', id: e.id, type });
    return e;
  }
  function compact() {   // 2D 의 filter(e => !e.dead)와 같은 순서 유지, 객체는 풀로 되돌림
    const a = S.enemies; let j = 0;
    for (let i = 0; i < a.length; i++) { const e = a[i]; if (!e.dead) a[j++] = e; else pool.push(e); }
    a.length = j;
  }
  function damage(e, raw, ignoreArmor) {
    if (e.dead) return;
    let armor = ignoreArmor ? 0 : (B.enemies[e.type].armor || 0);
    if (armor && S.perks.length) armor = Math.max(0, armor - applyPerks('armor', { enemy: e.type }));
    const d = Math.max(1, Math.round(raw - armor));
    e.hp -= d; e.hitT = 0.12;
    if (e.hp <= 0) { e.dead = true; S.stats.killed++; onKill(e); ev({ k: 'kill', id: e.id, type: e.type, x: e.x, y: e.y, s: e.dist }); }
  }
  const slopeMult = si => { const s = SEG[si]; if (!s) return 1; return s.slope > 0 ? B.terrain.uphill : s.slope < 0 ? B.terrain.downhill : 1; };
  function enemySpeed(e) {
    const b = B.enemies[e.type];
    let m = slopeMult(e.si), floor = B.terrain.minSpeedMult;
    if (e.slowT > 0) m *= 1 - e.slowAmt * (1 - (b.slowResist || 0));
    if (S && S.perks.length) { const x = { enemy: e.type, mult: 1, floor }; applyPerks('speed', x); m *= x.mult; floor = x.floor; }
    return b.speed * G.speedNorm * Math.max(m, floor);
  }
  function updateEnemies(dt) {
    for (const e of S.enemies) {
      if (e.dead) continue;
      const b = B.enemies[e.type], sp = enemySpeed(e);
      if (e.slowT > 0) e.slowT -= dt;
      if (e.hitT > 0) e.hitT -= dt;
      e.ps = e.dist; e.dist += sp * dt;
      G.posAt(e.dist, e);
      if (e.dist >= G.pathLen) {
        e.dead = true; e.leaked = true;
        const dmg = Math.max(0, b.dmg + (S.perks.length ? applyPerks('towerDmg', { enemy: e.type }) : 0));
        ev({ k: 'leak', id: e.id, type: e.type, dmg });
        towerHit(dmg);
      }
    }
    compact();
  }
  function towerHit(dmg) {
    S.stats.leaked++; S.waveLeaks++;
    const absorbed = Math.min(S.shield, dmg); S.shield -= absorbed; dmg -= absorbed;
    if (absorbed) ev({ k: 'text', s: `🛡️-${absorbed}`, color: '#e9c46a' });
    if (dmg > 0) { S.hp = Math.max(0, S.hp - dmg); ev({ k: 'text', s: `-${dmg}`, color: '#ff5d73', hit: true }); }
    S.towers.forEach(t => { if (t && t.type === 'pentacle') { const L = towerStats(t); if (L.regenAfterHit) t.cd = Math.min(t.cd, L.regenAfterHit); } });
  }

  /* ---- 수호자(타워) ---- */
  const towerStats = t => B.cards[t.type].lv[t.lv - 1];
  const rangeMultAt = slot => B.terrain.rangeMult[SLOTS[slot].e];
  function slotRangeMult(slot) {   // 지형 배율 + 특성 사거리(가산) → 총 ×1.20 에서 자른다(09 G2)
    const base = rangeMultAt(slot);
    if (!S || !S.perks.length) return base;
    const x = { slot, cap: B.perk.caps.rangeTotal }, add = applyPerks('range', x);
    return add > 0 ? Math.min(x.cap, base + add) : base;
  }
  function towerRange(slot) { const t = S.towers[slot]; return t && t.type !== 'pentacle' ? towerStats(t).range * slotRangeMult(slot) : 0; }
  function summonCost(slot) {
    const TR = B.terrain; let c = B.cost.summon;
    if (slot !== undefined && slot !== null && slot >= 0 && SLOTS[slot].e === 0) c = Math.max(TR.lowlandFloor, c - TR.lowlandDiscount);
    if (S.discountReady) c = Math.max(TR.comboFloor, c - B.combo.discountAmount);
    return c;
  }
  const upgradeCost = t => t.lv >= B.maxLevel ? Infinity : B.cost.upgrade[t.lv - 1];
  function summon(slot, type) {
    if (typeof type === 'number') type = CARD_TYPES[type];
    if (!canPlay() || !SLOTS[slot] || S.towers[slot] || !B.cards[type]) return false;
    const cost = summonCost(slot);
    if (S.mana < cost) { flash(`마나 부족 (${cost} 필요)`, 'bad'); return false; }
    S.mana -= cost; S.stats.spent += cost; if (S.discountReady) S.discountReady = false;
    const st = B.cards[type].lv[0];
    S.towers[slot] = { type, lv: 1, cd: type === 'pentacle' ? st.shieldEvery : 0 };
    S.stats.summons++; ev({ k: 'summon', slot, type });
    return true;
  }
  function upgrade(slot) {
    const t = S.towers[slot]; if (!canPlay() || !t) return false;
    const cost = upgradeCost(t);
    if (cost === Infinity) return false;
    if (S.mana < cost) { flash(`마나 부족 (${cost} 필요)`, 'bad'); return false; }
    S.mana -= cost; S.stats.spent += cost; t.lv++; S.stats.upgrades++;
    if (t.type === 'pentacle') t.cd = Math.min(t.cd, towerStats(t).shieldEvery);
    ev({ k: 'upgrade', slot, lv: t.lv });
    return true;
  }
  function updateTowers(dt) {
    const mult = S.buffT > 0 ? B.combo.buffMult : 1;
    S.towers.forEach((t, i) => {
      if (!t) return;
      const s = SLOTS[i], L = towerStats(t);
      t.cd -= dt;
      if (t.type === 'pentacle') {
        if (t.cd <= 0) { t.cd = (CARRY ? t.cd : 0) + L.shieldEvery; if (S.shield < B.tower.shieldCap) { S.shield++; ev({ k: 'shield', slot: i }); } }
        return;
      }
      if (t.cd > 0) return;
      const R = L.range * slotRangeMult(i);
      const inRange = S.enemies.filter(e => !e.dead && Math.hypot(e.x - s.x, e.y - s.y) <= R).sort((a, b) => b.dist - a.dist);
      if (!inRange.length) { if (CARRY) t.cd = 0; return; }   // 대기 중에는 남는 시간을 쌓지 않는다
      const hasPerk = S.perks.length > 0;
      const pm = e => hasPerk ? 1 + applyPerks('dmg', { slot: i, card: t.type, enemy: e.type }) : 1;
      t.cd = (CARRY ? t.cd : 0) + (hasPerk ? L.cd / (1 + applyPerks('atkSpeed', { slot: i })) : L.cd);
      const n = L.targets || 1;
      for (let k = 0; k < Math.min(n, inRange.length); k++) {
        const e = inRange[k];
        ev({ k: 'beam', slot: i, card: t.type, id: e.id, x: e.x, y: e.y, s: e.dist });
        damage(e, L.dmg * mult * pm(e));
        if (L.slow) {
          const hit = L.slowAoE ? S.enemies.filter(o => !o.dead && Math.hypot(o.x - e.x, o.y - e.y) <= L.slowAoE) : [e];
          for (const o of hit) {
            if (o !== e) damage(o, L.dmg * mult * pm(o));
            o.slowAmt = o.slowT > 0 ? Math.max(o.slowAmt, L.slow) : L.slow; o.slowT = Math.max(o.slowT, L.slowSec);
          }
          if (L.slowAoE) ev({ k: 'aoe', slot: i, x: e.x, y: e.y, s: e.dist, r: L.slowAoE });
        }
        if (t.type === 'wand' && L.pierce) {   // Lv4 관통: 사거리 안의 다음 적에 70%
          const next = inRange.filter(o => o !== e && !o.dead).slice(0, L.pierce);
          for (const o of next) { ev({ k: 'beam', slot: i, card: t.type, id: o.id, x: o.x, y: o.y, s: o.dist, from: e.id }); damage(o, L.dmg * mult * L.pierceMult * pm(o)); }
        }
      }
    });
  }
  function useUlt() {
    if (!canPlay() || !S.ultReady) return false;
    S.ultReady = false; S.stats.ults++;
    ev({ k: 'ult' });
    for (const e of S.enemies) damage(e, B.ult.damage, true);
    banner(`💥 메이저 아르카나 — ${B.ult.name}!`);
    return true;
  }

  /* ---- 문제/마나/콤보 ---- */
  function addMana(n, src) {   // src: true = 문제, 'perk' = 특성, 그 밖 = 자동 회복
    const before = S.mana; S.mana = Math.min(B.mana.max, S.mana + n);
    const got = S.mana - before;
    if (src === 'perk') S.stats.manaFromPerk += got; else if (src) S.stats.manaFromQuiz += got; else S.stats.manaFromRegen += got;
    return got;
  }
  function nextQuestion() {
    if (!S.deck.length) { S.deck = shuffle(QUESTIONS.map((_, i) => i)); if (S.deck[S.deck.length - 1] === S.lastIdx) S.deck.unshift(S.deck.pop()); }
    const idx = S.deck.pop(); S.lastIdx = idx;
    const item = QUESTIONS[idx], order = shuffle([0, 1, 2, 3]);
    S.q = { idx, item, opts: order.map(k => item.c[k]), correct: order.indexOf(0), picked: -1 };
    S.qT = 0; S.lockT = 0; S.lockKind = '';
    ev({ k: 'question' });
  }
  function wrongLockSec(streak) { const Q = B.quiz; return Math.min(Q.wrongLockMax, Q.wrongLockBase + Q.wrongLockStep * (streak - 1)); }
  function answer(i) {
    if (!canPlay() || !S.q || S.lockT > 0 || S.draft) return null;   // 드래프트 중에는 답 입력을 받지 않는다(09 §2.4)
    const q = S.q, ok = i === q.correct; q.picked = i;
    S.stats.answered++;
    S.recent.push(ok); if (S.recent.length > B.perk.flow.window) S.recent.shift();
    let fast = false;
    if (ok) {
      const gain = B.mana.byDifficulty[q.item.d];
      S.stats.correct++; addMana(gain, true);
      S.wrongStreak = 0;
      if (S.qT < B.quiz.readFloorSec) { fast = true; S.stats.fastCorrect++; flash(`정답 +${gain} · 너무 빨라 콤보 제외`, 'skip'); }
      else {
        S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo);
        if (S.gauge >= B.combo.cycle) S.gauge = 0;
        S.gauge++;
        const xp = perksOn() ? answerXP(q) : 0;
        flash(`정답! +${gain} 마나${xp ? ` · XP +${xp}` : ''}`, 'good');
        comboReward();
        if (S.perks.length) applyPerks('correct', { q });
      }
      S.lockT = B.quiz.correctDelay; S.lockKind = 'ok';
    } else {
      S.stats.wrong++; S.wrongStreak++;
      let lock = wrongLockSec(S.wrongStreak);
      if (S.perks.length) { const x = { lock }; applyPerks('lock', x); lock = x.lock; }
      const ans = q.opts[q.correct];
      const shielded = S.perks.length > 0 && applyPerks('wrong') > 0;
      flash(shielded ? `오답 — 콤보 방패로 콤보 유지 · 정답 ${ans} 🔒` : S.combo >= 3 ? `오답 — 콤보 ${S.combo} 끊김 · 정답 ${ans} 🔒` : `오답 — 정답은 ${ans} · 봉인 등록 🔒`, 'bad', lock * 1000);
      if (!shielded) { S.combo = 0; S.gauge = B.comboResetMode === 'half' && S.gauge < B.combo.cycle ? Math.floor(S.gauge / 2) : 0; }
      const sealed = session.sealed.get(q.item.id);
      if (sealed) { sealed.wrongs++; sealed.freed = false; sealed.newThisGame = true; }
      else session.sealed.set(q.item.id, { item: q.item, wrongs: 1, freed: false, newThisGame: true });
      S.lockT = lock; S.lockKind = 'wrong'; S.stats.lockSec += lock;
    }
    ev({ k: 'answer', ok, fast });
    return ok;
  }
  function comboReward() {
    const C = B.combo, c = S.gauge;
    if (S.perks.length) applyPerks('milestone', { c });
    if (c === C.discountAt) { S.discountReady = true; ev({ k: 'combo', at: c }); banner(`콤보 ${S.combo}! 다음 소환 비용 -${C.discountAmount}`); }
    if (c === C.buffAt) { S.buffT = C.buffSec; ev({ k: 'combo', at: c }); banner(`콤보 ${S.combo}! 전체 공격력 +${Math.round((C.buffMult - 1) * 100)}% (${C.buffSec}초)`); }
    if (c === C.ultAt) { S.ultReady = true; ev({ k: 'combo', at: c }); banner(`콤보 ${S.combo}! 궁극기 준비 — Space`); }
  }
  function updateQuiz(dt) {
    if (!S.q) return;
    if (S.lockT > 0) { S.lockT -= dt; if (S.lockT <= 0) nextQuestion(); return; }
    S.qT += dt;
    if (S.qT >= B.quiz.idleSkipSec) { S.stats.skipped++; flash('⏭ 10초 방치 — 문제 교체(회피)', 'skip'); nextQuestion(); }
  }

  /* ---- 판 안 레벨업 · 특성 (09) ---- */
  const xpNeed = lv => { const X = B.xp; return Math.round(X.perLevel * lv * X.chapterMult[S.region]); };
  function addXP(n, src) {
    const X = B.xp;
    if (!perksOn() || !canPlay() || !(n > 0) || S.level >= X.maxLevel) return 0;
    let got = 0;
    while (n > 0 && S.level < X.maxLevel) {
      const take = Math.min(n, xpNeed(S.level) - S.xp);
      S.xp += take; n -= take; got += take;
      if (S.xp >= xpNeed(S.level)) { S.xp = 0; S.level++; S.pendingDrafts++; S.levelLog.push({ level: S.level, t: +S.time.toFixed(1) }); ev({ k: 'levelUp', level: S.level }); }
    }
    S.stats.xp[src] = (S.stats.xp[src] || 0) + got;
    return got;
  }
  function answerXP(q) {
    const A = B.xp.answer;
    if (S.combo < A.minCombo) return 0;
    const w = S.waveIdx, room = A.perWaveCap - (S.xpAnsWave[w] || 0);
    const xp = Math.min(room, (S.combo >= A.combo5At ? A.combo5 : A.base) * (q.item.type === 'tf' ? A.tfScale : 1));
    if (xp <= 0) return 0;
    const got = addXP(xp, 'answer'); S.xpAnsWave[w] = (S.xpAnsWave[w] || 0) + got;
    return got;
  }
  function onKill(e) {
    if (!perksOn()) return;
    addXP(B.xp.kill[e.type] || 0, 'kill');
    if (S.perks.length) applyPerks('kill', { enemy: e.type });
  }
  function inFlow() {
    const F = B.perk.flow, r = S.recent, c = r.filter(Boolean).length;
    return r.length >= F.window ? c >= F.minCorrect : r.length >= F.earlyMinAnswered && c / r.length >= F.earlyMinAcc;
  }
  const typeCount = type => S.towers.filter(t => t && t.type === type).length;
  const kindsCount = () => new Set(S.towers.filter(Boolean).map(t => t.type)).size;
  const neighborsPlaced = slot => SLOTS[slot].adj.filter(j => S.towers[j]).length;
  const elevKindsPlaced = () => new Set(S.towers.map((t, i) => t ? SLOTS[i].e : -1).filter(e => e >= 0)).size;
  const perkCount = id => { const o = S.perks.find(q => q.id === id); return o ? o.n : 0; };
  function meets(r) {
    switch (r.type) {
      case 'card': return typeCount(r.card) >= r.min;
      case 'cardKinds': return r.kinds.filter(k => typeCount(k) > 0).length >= r.min;
      case 'cardCount': return S.towers.filter(Boolean).length >= r.min;
      case 'sameAttr': return CARD_TYPES.some(k => typeCount(k) >= r.min);
      case 'allAttrs': return kindsCount() >= r.min;
      case 'slotElev': return S.towers.some((t, i) => t && SLOTS[i].e >= r.min);
      case 'stageElevKinds': return G.map.ec.filter(Boolean).length >= r.min;
      case 'stageHas': return B.waveList.some(w => w.some(g => g.type === r.enemy));
      case 'dueSealed': return false;   // 판 중 인라인 복습이 아직 없다(2D 3차와 같음) → D3 제외
      case 'packHasDifficulty': return QUESTIONS.some(q => q.d === r.d);
      case 'maxComboReached': return S.maxCombo >= r.min;
    }
    return false;
  }
  // 특성 효과 적용기: effects[].op 19종(09 §7.3). 수치형 hook 은 합계를 돌려주고 사건형 hook 은 직접 지급(G3~G6 상한)
  function applyPerks(hook, x) {
    x = x || {};
    let v = 0, flow = null;
    const flowOk = () => (flow === null ? (flow = inFlow()) : flow);
    for (const own of S.perks) {
      const p = PERK_BY_ID[own.id], n = own.n, use = S.perkUse[own.id];
      for (const ef of p.effects) {
        const gated = (ef.gate || p.gate) === 'flow' && !flowOk();
        if (gated && ef.op !== 'manaOnKill') continue;
        const hit = !ef.enemies || ef.enemies.includes(x.enemy);
        switch (ef.op) {
          case 'dmgVsEnemy': if (hook === 'dmg' && hit) v += ef.add * n; break;
          case 'dmgAll': if (hook === 'dmg') v += ef.add * n; break;
          case 'enemySpeed': if (hook === 'speed' && hit) { x.mult *= Math.pow(ef.mult, n); x.floor = Math.max(x.floor, ef.floorBaseSpeed); } break;
          case 'armorShred': if (hook === 'armor' && hit) v += ef.value * n; break;
          case 'bossTowerDamage': if (hook === 'towerDmg' && x.enemy === 'boss') v += ef.delta * n; break;
          case 'manaOnKill':
            if (hook === 'kill' && hit) {
              let pay = 0;
              if (ef.every) { use.cnt++; if (use.cnt % ef.every === 0) pay = ef.amount * n; }
              else if (rngPerk() < ef.chance) pay = ef.amount * n;
              if (pay && !gated) perkMana(p, use, pay, ef.capRun * n);
            } break;
          case 'towerHealOnKill': if (hook === 'kill' && hit) perkHeal(use, ef.amount * n, ef.capRun * n); break;
          case 'towerHealOnWaveClear': if (hook === 'waveClear' && S.hp <= ef.whenTowerHpAtMost) perkHeal(use, ef.amount * n, ef.capRun * n); break;
          case 'comboShield':
            if (hook === 'waveClear' && x.leaks === 0 && S.comboShield < ef.holdMax && use.used + S.comboShield < ef.useCapRun) { S.comboShield++; banner('콤보 방패 충전!'); }
            else if (hook === 'wrong' && S.comboShield > 0) { S.comboShield--; use.used++; v += 1; }
            break;
          case 'auraAdjacentDmg': if (hook === 'dmg') v += ef.perNeighbor * n * Math.min(ef.maxNeighbors, neighborsPlaced(x.slot)); break;
          case 'resonance': if (hook === 'dmg' && typeCount(x.card) >= ef.sameAttrMin) v += ef.dmgAdd * n; break;
          case 'rangeAddByElev': if (hook === 'range' && SLOTS[x.slot].e >= ef.elevMin) { v += ef.add * n; x.cap = Math.min(x.cap, ef.totalRangeCap); } break;
          case 'elevMixBonus': if (hook === 'dmg' && elevKindsPlaced() >= ef.kindsMin) v += ef.dmgAdd * n; break;
          case 'auraAdjacentAtkSpeed': if (hook === 'atkSpeed' && SLOTS[x.slot].adj.some(j => S.towers[j] && S.towers[j].type === ef.sourceCard)) v += ef.add * n; break;
          case 'allAttrBonus':
            if (kindsCount() >= ef.attrsMin) {
              if (hook === 'dmg') v += ef.dmgAdd * n;
              else if (hook === 'range') { v += ef.rangeAdd * n; x.cap = Math.min(x.cap, ef.totalRangeCap); }
            } break;
          case 'manaOnCorrect':
            if (hook === 'correct' && (ef.minCombo === undefined || S.combo >= ef.minCombo) && (ef.difficulty === undefined || x.q.item.d === ef.difficulty))
              perkMana(p, use, ef.amount * n, ef.capRun * n);
            break;
          case 'wrongLockReduce': if (hook === 'lock' && x.lock > ef.minLockSec) x.lock = Math.max(ef.minLockSec, x.lock - ef.seconds * n); break;
          case 'manaOnReviewPass': if (hook === 'reviewPass') perkMana(p, use, ef.amount * n, ef.capRun * n); break;
          case 'manaOnComboMilestone': if (hook === 'milestone' && ef.combos.includes(x.c)) perkMana(p, use, ef.amount * n, ef.capRun * n); break;
        }
      }
    }
    if (hook === 'dmg') v *= dmgScale();
    if (hook === 'atkSpeed') v = Math.min(v, B.perk.caps.atkSpeed);
    return v;
  }
  function dmgScale() {
    const eq = S.perks.reduce((a, o) => { const p = PERK_BY_ID[o.id]; return a + (p.caps.pool === 'dmgEq' ? (p.eq || 0) * o.n : 0); }, 0);
    return eq > B.perk.caps.dmgEq ? B.perk.caps.dmgEq / eq : 1;
  }
  function perkMana(p, use, amount, capRun) {
    const C = B.perk.caps, pool = p.caps.pool;
    const give = Math.min(amount, capRun - use.used, (C[pool] !== undefined ? C[pool] : Infinity) - S.pool[pool], C.totalMana - S.pool.totalMana);
    if (give <= 0) return 0;
    addMana(give, 'perk');
    use.used += give; S.pool[pool] += give; S.pool.totalMana += give;
    ev({ k: 'text', s: `✨+${give}💎`, color: '#c9a6ff' });
    return give;
  }
  function perkHeal(use, amount, capRun) {
    const give = Math.min(amount, capRun - use.used, B.perk.caps.towerHeal - S.pool.towerHeal, B.tower.hp - S.hp);
    if (give <= 0) return 0;
    S.hp += give; use.used += give; S.pool.towerHeal += give;
    ev({ k: 'text', s: `+${give}🏰`, color: '#38d996' });
    return give;
  }
  const capRunOf = p => { const ef = p.effects.find(e => e.capRun); return ef ? ef.capRun : 0; };
  function capRoom(p) {
    const C = B.perk.caps, pool = p.caps && p.caps.pool;
    const owned = f => S.perks.reduce((a, o) => a + f(PERK_BY_ID[o.id]) * o.n, 0);
    if (pool === 'dmgEq') return p.eq ? clamp((C.dmgEq - owned(q => q.caps.pool === 'dmgEq' ? q.eq || 0 : 0)) / p.eq, 0, 1) : 1;
    if (pool && C[pool] !== undefined && capRunOf(p)) return clamp((C[pool] - owned(q => q.caps.pool === pool ? capRunOf(q) : 0)) / capRunOf(p), 0, 1);
    return 1;
  }
  function perkLive(p) {
    if (p.gate === 'flow' && !inFlow()) return false;
    return p.effects.every(ef => {
      switch (ef.op) {
        case 'auraAdjacentDmg': return S.towers.some((t, i) => t && neighborsPlaced(i) > 0);
        case 'resonance': return CARD_TYPES.some(k => typeCount(k) >= ef.sameAttrMin);
        case 'rangeAddByElev': return S.towers.some((t, i) => t && t.type !== 'pentacle' && SLOTS[i].e >= ef.elevMin);
        case 'elevMixBonus': return elevKindsPlaced() >= ef.kindsMin;
        case 'auraAdjacentAtkSpeed': return S.towers.some((t, i) => t && SLOTS[i].adj.some(j => S.towers[j] && S.towers[j].type === ef.sourceCard));
        case 'allAttrBonus': return kindsCount() >= ef.attrsMin;
        default: return true;
      }
    });
  }
  const fit = p => perkLive(p) ? p.me.std : 0;
  function draftPerks(r) {
    r = r || rngDraft;
    const D = B.perk.draft, W = D.rarityWeight, no = S.draftNo;
    let ok = PERKS.filter(p => p.requires.every(meets) && perkCount(p.id) < p.stack.max && no >= p.minDraft && capRoom(p) >= D.capRoomMin);
    const picks = [];
    while (picks.length < D.choices && ok.length) {
      const rs = [...new Set(ok.map(p => p.rarity))];
      let x = r() * rs.reduce((a, k) => a + W[k], 0), rr = rs[rs.length - 1];
      for (const k of rs) { x -= W[k]; if (x < 0) { rr = k; break; } }
      let c = ok.filter(p => p.rarity === rr);
      if (picks.length === 2 && picks[0].family === picks[1].family) c = c.filter(p => p.family !== picks[0].family);
      if (!c.length) { ok = ok.filter(p => p.rarity !== rr); continue; }
      let y = r() * c.reduce((a, p) => a + (p.weight || 1), 0), p = c[c.length - 1];
      for (const q of c) { y -= q.weight || 1; if (y < 0) { p = q; break; } }
      picks.push(p); ok = ok.filter(q => q !== p);
    }
    return picks.sort((a, b) => fit(b) - fit(a) || RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]);
  }
  function updateDraft(dt) {   // 실제 시간으로 진행
    const D = B.perk.draft;
    if (S.draft) { S.draft.t += dt; if (S.draft.t >= D.windowSec) pickPerk(0, true); return; }
    if (S.draftGap > 0) { S.draftGap -= dt; if (S.draftGap > 0) return; }
    if (S.pendingDrafts > 0) {
      if (S.stats.correct >= B.xp.openDraftMinCorrect) { openDraft(); return; }
      if (!S.heldShown) { S.heldShown = true; banner('정답이 필요해요'); }
    }
    if (S.timeScale < 1) S.timeScale = Math.min(1, S.timeScale + dt * (1 - D.timeScale) / D.resumeSec);
  }
  function openDraft(forceIds) {
    const D = B.perk.draft;
    S.draftNo++; S.heldShown = false;
    const cards = forceIds ? forceIds.map(id => PERK_BY_ID[id]).filter(Boolean) : draftPerks();
    if (!cards.length) { S.pendingDrafts = Math.max(0, S.pendingDrafts - 1); addMana(D.emptyMana, 'perk'); banner(`레벨 업! 마나 +${D.emptyMana}`); return; }
    S.draft = { cards, t: 0, no: S.draftNo, level: S.level - S.pendingDrafts + 1 };
    S.timeScale = D.timeScale;
    if (cards.length === 1) { pickPerk(0, true); return; }
    banner(`레벨 업! Lv${S.draft.level}`);
    ev({ k: 'draft', open: true }); flash('시간이 느려져요', 'skip');
  }
  function gainPerk(p) {
    const own = S.perks.find(o => o.id === p.id);
    if (own) own.n++; else { S.perks.push({ id: p.id, n: 1 }); S.perkUse[p.id] = { used: 0, cnt: 0 }; }
    return own ? own.n : 1;
  }
  function pickPerk(i, auto, force) {
    const d = S && S.draft; if (!d) return false;
    if (!auto && !force && d.t < B.perk.draft.inputGuardSec) return false;   // 입력 가드 0.25초
    const p = d.cards[i]; if (!p) return false;
    const n = gainPerk(p);
    S.picks.push({ id: p.id, auto: !!auto, ms: Math.round(d.t * 1000), draftNo: d.no, offered: d.cards.map(c => c.id), t: +S.time.toFixed(1) });
    S.draft = null; S.pendingDrafts = Math.max(0, S.pendingDrafts - 1);
    if (S.pendingDrafts > 0) S.draftGap = B.perk.draft.chainGapSec;
    banner(auto ? `자동으로 골랐어요 · ${p.name}` : n > 1 ? `${n}중첩! ${p.name}` : `특성 장착! ${p.name}`);
    ev({ k: 'draft', open: false, id: p.id, auto: !!auto });
    return true;
  }

  /* ---- 게임 흐름 ---- */
  function startGame() {
    const bonus = session.pendingBonus; session.pendingBonus = 0;
    for (const v of session.sealed.values()) v.newThisGame = false;
    S = newState(bonus);
    nextQuestion();
    banner(bonus ? `준비! 해제 퀴즈 보너스 +${bonus} 마나` : '준비! 문제를 풀어 마나를 모으세요');
  }
  function tick(dt) {   // 2D update(dt) 와 같은 순서
    if (!canPlay()) return;
    tickNo++;
    const dReal = dt;
    if (perksOn()) updateDraft(dReal);
    dt *= S.timeScale;
    S.time += dt;
    S.regenT += dt;
    while (S.regenT >= B.mana.regenSec) { S.regenT -= B.mana.regenSec; addMana(B.mana.regenAmount, false); }
    if (S.buffT > 0) S.buffT = Math.max(0, S.buffT - dt);
    if (!S.draft) updateQuiz(dReal);
    if (S.phase === 'prep') { S.phaseT -= dt; if (S.phaseT <= 0) startWave(); }
    else if (S.phase === 'wave') {
      S.waveT += dt;
      while (S.spawnQ.length && S.spawnQ[0].t <= S.waveT) {
        const g = S.spawnQ.shift(), e = spawn(g.type);
        if (CARRY && e) { e.dist = enemySpeed(e) * (S.waveT - g.t); G.posAt(e.dist, e); }   // 이월: 틱 중간 스폰 시각부터 걸은 만큼
      }
    }
    updateEnemies(dt);
    updateTowers(dt);
    compact();
    if (S.hp <= 0) { endGame(false); return; }
    if (S.phase === 'wave' && !S.spawnQ.length && !S.enemies.length) {
      if (S.perks.length) applyPerks('waveClear', { leaks: S.waveLeaks });
      ev({ k: 'waveClear', wave: S.waveIdx, leaks: S.waveLeaks });
      if (S.waveIdx >= B.waves.count - 1) endGame(true);
      else { S.waveIdx++; S.phase = 'prep'; S.phaseT = B.waves.breakSec; banner(`웨이브 ${S.waveIdx} 방어 성공! ${B.waves.breakSec}초 휴식`); }
    }
  }
  function step(dt) {   // 실제 경과 시간 → 0.1초 고정 틱
    if (!(dt > 0)) return 0;
    acc += dt; let n = 0;
    while (acc >= TICK - 1e-9) { acc -= TICK; tick(TICK); if (++n >= 40) { acc = 0; break; } }
    return n;
  }
  function endGame(win) {
    if (S.phase === 'result') return;
    S.phase = 'result';
    const hadDraft = !!S.draft;
    S.draft = null; S.pendingDrafts = 0; S.timeScale = 1;
    if (hadDraft) ev({ k: 'draft', open: false });
    const st = S.stats, SB = B.stars;
    const denom = st.answered + st.skipped, acc = denom ? st.correct / denom : 0;
    const crit = [
      { ok: win, label: '탑을 지켜냈다 (클리어)' },
      { ok: win && S.hp >= SB.hpFor2, label: `탑 HP ${S.hp}/${B.tower.hp} (≥ ${SB.hpFor2})` },
      { ok: win && acc >= SB.accFor3 && S.maxCombo >= SB.comboFor3, label: `정답률 ${Math.round(acc * 100)}% (≥ ${SB.accFor3 * 100}%) & 최대 콤보 ${S.maxCombo} (≥ ${SB.comboFor3})` },
    ];
    let stars = 0; if (crit[0].ok) { stars = 1; if (crit[1].ok) stars++; if (crit[2].ok) stars++; }
    S.result = { win, stars, acc, crit, wave: S.waveIdx + 1, time: S.time };
    ev({ k: 'end', win, stars });
  }
  // 해제 퀴즈(판이 끝난 뒤, 세션 단위): 봉인 1문항, 정답이면 다음 판 시작 마나 +3
  function reviewStart(id) {
    if (!S.result || S.reviewDone) return null;
    if (id === undefined || id === null) { const open = [...session.sealed.values()].filter(s => !s.freed); if (!open.length) return null; id = open[Math.floor(rng() * open.length)].item.id; }
    const s = session.sealed.get(id); if (!s || s.freed) return null;
    S.reviewDone = true;
    const order = shuffle([0, 1, 2, 3]);
    S.review = { id, item: s.item, opts: order.map(k => s.item.c[k]), correct: order.indexOf(0), answered: false, picked: -1 };
    return S.review;
  }
  function reviewAnswer(i) {
    const R = S.review; if (!R || R.answered) return null;
    R.answered = true; R.picked = i;
    const s = session.sealed.get(R.id);
    if (i === R.correct) { s.freed = true; session.pendingBonus += B.review.bonusMana; return true; }
    s.wrongs++; return false;
  }

  /* ---- 스냅샷: SoA 숫자 배열(재사용) + 이벤트 큐 flush ---- */
  const CAP = B.sim.enemyCap, NS = SLOTS.length;
  const SNAP = {
    tick: 0, time: 0, phase: '', waveIdx: 0, waveCount: B.waves.count, phaseT: 0, hp: 0, hpMax: B.tower.hp, shield: 0, mana: 0, regenFrac: 0,
    combo: 0, gauge: 0, maxCombo: 0, discountReady: false, buffT: 0, ultReady: false, level: 1, xp: 0, xpNeed: 0, pendingDrafts: 0,
    comboShield: 0, timeScale: 1, remaining: 0,
    enemies: { n: 0, id: new Int32Array(CAP), type: new Uint8Array(CAP), s: new Float32Array(CAP), ps: new Float32Array(CAP),
               x: new Float32Array(CAP), y: new Float32Array(CAP), hp: new Float32Array(CAP), flags: new Uint8Array(CAP) },   // flags: 1 둔화, 2 피격, 4 정예, 8 보스
    towers: { n: NS, type: new Int8Array(NS), lv: new Uint8Array(NS), cd: new Float32Array(NS) },                               // type: -1 빈 슬롯, 0~3 = CARD_TYPES
    events: [],
  };
  const ETYPE = { normal: 0, fast: 1, tank: 2, boss: 3 }, CTYPE = { wand: 0, cup: 1, sword: 2, pentacle: 3 };
  function snapshot() {
    const X = SNAP;
    X.tick = tickNo; X.time = S.time; X.phase = S.phase; X.waveIdx = S.waveIdx; X.phaseT = S.phaseT; X.hp = S.hp; X.shield = S.shield; X.mana = S.mana;
    X.regenFrac = S.regenT / B.mana.regenSec; X.combo = S.combo; X.gauge = S.gauge; X.maxCombo = S.maxCombo; X.discountReady = S.discountReady;
    X.buffT = S.buffT; X.ultReady = S.ultReady; X.level = S.level; X.xp = S.xp; X.xpNeed = S.level >= B.xp.maxLevel ? 0 : xpNeed(S.level);
    X.pendingDrafts = S.pendingDrafts; X.comboShield = S.comboShield; X.timeScale = S.timeScale; X.remaining = S.enemies.length + S.spawnQ.length;
    const E = X.enemies; let n = 0;
    for (const e of S.enemies) {
      if (e.dead || n >= CAP) continue;
      E.id[n] = e.id; E.type[n] = ETYPE[e.type]; E.s[n] = e.dist; E.ps[n] = e.ps; E.x[n] = e.x; E.y[n] = e.y; E.hp[n] = clamp(e.hp / e.maxHp, 0, 1);
      E.flags[n] = (e.slowT > 0 ? 1 : 0) | (e.hitT > 0 ? 2 : 0) | (e.type === 'tank' ? 4 : 0) | (e.type === 'boss' ? 8 : 0); n++;
    }
    E.n = n;
    const T = X.towers;
    for (let i = 0; i < NS; i++) { const t = S.towers[i]; T.type[i] = t ? CTYPE[t.type] : -1; T.lv[i] = t ? t.lv : 0; T.cd[i] = t ? Math.max(0, t.cd) : 0; }
    X.events = events; events = [];
    return X;
  }

  startGame();
  return {
    get state() { return S; }, session, rng, geo: G, seed,
    get alpha() { return clamp(acc / TICK, 0, 1); },
    step, tick: () => tick(TICK), snapshot, answer, summon, upgrade, useUlt,
    pickPerk: (i, force) => pickPerk(i, false, !!force),
    canPlay, summonCost, upgradeCost: slot => S.towers[slot] ? upgradeCost(S.towers[slot]) : Infinity,
    towerRange, slotRangeMult, enemySpeed, enemyHp, wrongLockSec, xpNeed, inFlow, draftPerks, applyPerks, perksOn,
    addXP: n => addXP(n, 'hook'),
    openDraft(ids) { if (!S.draft) { if (S.level < B.xp.maxLevel) S.level++; S.pendingDrafts++; openDraft(ids); } return S.draft ? S.draft.cards.map(p => p.id) : null; },
    gainPerk: id => gainPerk(PERK_BY_ID[id]),
    endGame, reviewStart, reviewAnswer,
  };
}

return { BALANCE, QUESTIONS, PERKS, PERK_BY_ID, MAPS, COLS, ROWS, SUBJECTS, DIFFS, CARD_TYPES, ENEMY_TYPES, LIFT_2D,
         createRun, createSession, buildGeo, mulberry32, version: BALANCE.version };
}));
