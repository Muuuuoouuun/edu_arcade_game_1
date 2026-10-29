import { getStage, STAGE_COUNT } from './data.ts';
import type { Difficulty, EnemyKind } from './types.ts';

export type { Difficulty } from './types.ts';

export const DIFFICULTY_ORDER: Difficulty[] = ['relaxed', 'standard', 'veteran'];
export const DIFFICULTIES: Record<Difficulty, {
  name: string; description: string; enemyHp: number; enemySpeed: number;
  spawnInterval: number; startingCoins: number; rewardMultiplier: number;
}> = {
  relaxed: {
    name: '여유롭게', description: '더 약하고 느린 적 · 시작 코인 +70',
    enemyHp: 0.8, enemySpeed: 0.9, spawnInterval: 1.15, startingCoins: 70, rewardMultiplier: 1,
  },
  standard: {
    name: '기본 원정', description: '익숙한 전투 균형 · 기본 보상',
    enemyHp: 1, enemySpeed: 1, spawnInterval: 1, startingCoins: 0, rewardMultiplier: 1,
  },
  veteran: {
    name: '정예 원정', description: '강한 적과 빠른 증원 · 기본 보상 +40%',
    enemyHp: 1.3, enemySpeed: 1.12, spawnInterval: 0.78, startingCoins: 0, rewardMultiplier: 1.4,
  },
};

/** Older saved profiles and unknown values retain the original standard rules. */
export function getDifficulty(input?: unknown): Difficulty {
  return typeof input === 'string' && DIFFICULTY_ORDER.includes(input as Difficulty) ? input as Difficulty : 'standard';
}

// Keep standard enemy order in one place: both forecasts and actual spawning use it.
const ENEMY_POOLS: Record<number, EnemyKind[]> = {
  1: ['sprout', 'sprout', 'wood'],
  2: ['sprout', 'metal', 'wood', 'metal', 'insulator'],
  3: ['ice', 'sprout', 'stone', 'ice', 'wood'],
  4: ['wood', 'ice', 'metal', 'stone', 'insulator', 'sprout'],
  5: ['frostwolf', 'ice', 'frostwolf', 'wood'],
  6: ['frostwolf', 'frostwolf', 'stone', 'ice', 'insulator'],
  7: ['ice', 'metal', 'frostwolf', 'stone', 'ice'],
  8: ['frostwolf', 'ice', 'stone', 'metal', 'insulator', 'ice'],
};

/** A fresh deterministic array; callers can inspect it without changing future waves. */
export function getWavePlan(stage: number, wave: number, difficulty: Difficulty = 'standard'): EnemyKind[] {
  if (!Number.isInteger(stage) || stage < 1 || stage > STAGE_COUNT ||
    !Number.isInteger(wave) || wave < 1 || wave > 4) return [];
  const data = getStage(stage), pool = ENEMY_POOLS[stage];
  const boss = data.expanded && wave === 4 ? data.region === 'snow' ? 'frostboss' : 'boss' : null;
  const count = (data.region === 'snow' ? 12 : 8) + wave * 2 + (data.order - 1) * 2 + (boss ? 1 : 0);
  const plan: EnemyKind[] = Array.from({ length: count - (boss ? 1 : 0) }, (_, index) => pool[(index + wave - 1) % pool.length]);
  if (getDifficulty(difficulty) === 'veteran') {
    const extras = [2, 3, 3, 4][wave - 1] + (stage === 4 && wave <= 2 ? 2 : 0), originalCount = plan.length;
    // The forest finale gets two extra flankers in each of the first two veteran waves: in a replay,
    // the high-area barbarian could hold the main road without towers while the
    // optional outpost absorbed the other lane. Keep its boss last. The shared
    // plan also keeps the pre-battle forecast identical to actual spawns.
    for (let i = extras - 1; i >= 0; i--) {
      const extra: EnemyKind = i % 3 === 2 && stage > 1 ? 'insulator' : data.region === 'snow' ? 'frostwolf' : 'sprout';
      plan.splice(Math.floor((i + 1) * originalCount / (extras + 1)), 0, extra);
    }
  }
  if (boss) plan.push(boss);
  return plan;
}
