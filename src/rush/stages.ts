// PvE stage ladder (pure). Higher stages scale enemy health, numbers and damage; the curve is tuned so the
// later stages need kingdom upgrades (see stages.test.ts for the locked-in progression).
import type { Cost } from './kingdom.ts';
import type { Difficulty, RushState } from './sim.ts';

export const STAGE_COUNT = 10;
const clampStage = (n: number) => Math.min(STAGE_COUNT, Math.max(1, Math.round(n)));

/** Stage 1 is the base game; stage 10 has +110% enemy health, +70% enemies and +50% enemy damage. */
export function stageDifficulty(n: number): Difficulty {
  const t = (clampStage(n) - 1) / (STAGE_COUNT - 1);
  return { enemyHp: 1 + 1.1 * t, enemyCount: 1 + 0.7 * t, enemyDamage: 1 + 0.5 * t, stage: clampStage(n) };
}
/** Battle rewards grow 15% per stage. */
export const stageRewardMul = (n: number) => 1 + 0.15 * (clampStage(n) - 1);

/** Stars for a finished battle: a win scores by the town health left (80% → 3, 40% → 2, else 1). */
export function starsFor(s: RushState): 0 | 1 | 2 | 3 {
  if (s.phase !== 'won') return 0;
  const left = s.town.hp / s.town.maxHp;
  return left >= 0.8 ? 3 : left >= 0.4 ? 2 : 1;
}
/** One-time bonus per newly earned star on a stage. */
export const starBonus = (n: number): Cost => ({ food: 20 + 6 * clampStage(n), wood: 15 + 5 * clampStage(n) });
