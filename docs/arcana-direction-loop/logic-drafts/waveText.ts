// DRAFT from the direction loop (cycle 88). Copy to src/games/defense/waveText.ts; checked against main b175a9f in a scratch copy.
// Wave texts that depend on an inserted name or on the wave's real spawn rhythm:
// - josa(): the Korean particle that fits the name, so a template cannot print "고목왕가" or "루나이".
// - forecastTip(): the scout tip follows the surge rule (waves 2-3 on every difficulty), not only the difficulty.
import { ENEMIES } from './data.ts';
import { getWavePlan } from './difficulty.ts';
import { inSurge } from './engine.ts';
import type { Difficulty } from './types.ts';

export type JosaPair = '이/가' | '을/를' | '은/는' | '과/와' | '으로/로';

/** Final consonant index (0 = none) of the last Hangul syllable; other characters count as none. */
const lastJong = (word: string): number => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 ? code % 28 : 0;
};

/** `word` plus the particle that fits its last syllable. ㄹ takes 로, as in 리엘로. */
export function josa(word: string, pair: JosaPair): string {
  const [withFinal, without] = pair.split('/'), jong = lastJong(word);
  if (pair === '으로/로') return word + (jong !== 0 && jong !== 8 ? withFinal : without);
  return word + (jong !== 0 ? withFinal : without);
}

/** engine.ts wave-4 notice of the two-road stages (today: `${name}가 다가옵니다.` for both bosses). */
export const bossApproachNotice = (bossName: string) => `${josa(bossName, '이/가')} 다가옵니다. 두 거점을 지켜주세요!`;

/** DefenseCamp.tsx village line (today: `${name}이 찾아옵니다.` for every visitor). */
export const nextVisitorLine = (stageLabel: string, heroName: string) => `${stageLabel} 방어 후 ${josa(heroName, '이/가')} 찾아옵니다.`;

/** True when the wave ends with the faster pack (engine.ts inSurge), whatever the difficulty. */
export function waveHasSurge(stage: number, wave: number, difficulty: Difficulty = 'standard'): boolean {
  const size = getWavePlan(stage, wave, difficulty).length;
  for (let spawned = 1; spawned <= size; spawned++) if (inSurge(wave, spawned, size)) return true;
  return false;
}

/** Scout tip shown before a wave (DefenseForecast.tsx). Boss first, then the surge, then the difficulty. */
export function forecastTip(stage: number, wave: number, difficulty: Difficulty = 'standard'): string {
  const boss = getWavePlan(stage, wave, difficulty).find(kind => kind === 'boss' || kind === 'frostboss');
  if (boss) return `${ENEMIES[boss].name} 출현`;
  if (waveHasSurge(stage, wave, difficulty)) return difficulty === 'veteran' ? '빠른 증원 · 후반에 무리' : '후반에 무리가 몰려와요';
  return difficulty === 'veteran' ? '빠른 증원 주의' : '적 편성과 약점 확인';
}
