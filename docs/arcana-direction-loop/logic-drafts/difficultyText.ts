// DRAFT from the direction loop (cycle 85). Copy to src/games/defense/difficultyText.ts; checked against main b175a9f in a scratch copy.
// What each difficulty really changes, read from the tables the engine uses (DIFFICULTIES, getWavePlan),
// so the camp description cannot drift from the numbers when they are tuned.
import { DIFFICULTIES, getWavePlan } from './difficulty.ts';
import { STAGE_COUNT } from './data.ts';
import type { Difficulty } from './types.ts';

export type DifficultyClaims = {
  weaker: boolean; stronger: boolean; // enemy HP below / above standard
  slower: boolean; faster: boolean;   // enemy speed below / above standard
  sparser: boolean; denser: boolean;  // spawn interval above / below standard
  moreEnemies: number;                // extra enemies per stage (smallest over the campaign), 0 when none
  startingCoins: number;              // extra battle coins at the start
  rewardPercent: number;              // extra percent on the clear reward
};

const stageSize = (stage: number, mode: Difficulty) =>
  [1, 2, 3, 4].reduce((sum, wave) => sum + getWavePlan(stage, wave, mode).length, 0);

export function difficultyClaims(mode: Difficulty): DifficultyClaims {
  const d = DIFFICULTIES[mode];
  const extra = Array.from({ length: STAGE_COUNT }, (_, i) => stageSize(i + 1, mode) - stageSize(i + 1, 'standard'));
  return {
    weaker: d.enemyHp < 1, stronger: d.enemyHp > 1,
    slower: d.enemySpeed < 1, faster: d.enemySpeed > 1,
    sparser: d.spawnInterval > 1, denser: d.spawnInterval < 1,
    moreEnemies: Math.max(0, Math.min(...extra)),
    startingCoins: d.startingCoins,
    rewardPercent: Math.round((d.rewardMultiplier - 1) * 100),
  };
}

/** One camp line built from the numbers. `firstClearCommon` is rules v1 P1 (first clear pays the same on every
 * difficulty): once that lands, the multiplier only applies to replays and the line has to say so. */
export function difficultyDescription(mode: Difficulty, firstClearCommon = false): string {
  const c = difficultyClaims(mode);
  const strength = c.weaker ? ['약하고', '약한'] : c.stronger ? ['강하고', '강한'] : null;
  const pace = c.slower ? '느린' : c.faster ? '빠른' : null;
  const enemy = strength && pace ? `더 ${strength[0]} ${pace} 적` : strength ? `더 ${strength[1]} 적` : pace ? `더 ${pace} 적` : '익숙한 전투 균형';
  const parts = [enemy + (c.moreEnemies > 0 ? ', 더 많은 증원' : '')];
  if (c.startingCoins > 0) parts.push(`시작 코인 +${c.startingCoins}`);
  parts.push(c.rewardPercent > 0 ? `${firstClearCommon ? '재도전 보상' : '기본 보상'} +${c.rewardPercent}%` : '기본 보상');
  return parts.join(' · ');
}

/** What a hand-written description gets wrong or leaves out. Empty = the text matches the numbers. */
export function descriptionGaps(text: string, c: DifficultyClaims): string[] {
  const gaps: string[] = [];
  const check = (claim: boolean, word: RegExp, label: string) => {
    if (claim && !word.test(text)) gaps.push(`${label}: 빠짐`);
    if (!claim && word.test(text)) gaps.push(`${label}: 수치에 없음`);
  };
  check(c.weaker, /약하|약한/, '약한 적');
  check(c.stronger, /강하|강한/, '강한 적');
  check(c.slower || c.sparser, /느린|느리/, '느린 적·증원');
  check(c.faster || c.denser, /빠른|빠르/, '빠른 적·증원');
  check(c.moreEnemies > 0, /많은|많아/, '더 많은 적');
  const coins = /코인 \+(\d+)/.exec(text), reward = /\+(\d+)%/.exec(text);
  if ((coins ? Number(coins[1]) : 0) !== c.startingCoins) gaps.push('시작 코인: 수치와 다름');
  if ((reward ? Number(reward[1]) : 0) !== c.rewardPercent) gaps.push('보상 배율: 수치와 다름');
  return gaps;
}
