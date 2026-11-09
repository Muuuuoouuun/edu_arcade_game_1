import type { GameId } from '../games/engine';
import { isQuizMode } from '../games/quizData.ts';
import type { QuizMode } from '../games/quizData.ts';
import type { Difficulty } from '../games/defense/types.ts';

const GAME_IDS: GameId[] = ['math', 'word', 'memory', 'quiz', 'race', 'defense'];

export type RoundRecord = {
  game: GameId; quizMode?: QuizMode; racePlace?: number; raceTime?: number; raceFinished?: boolean; defenseDifficulty?: Difficulty; defenseStage?: number; score: number; correct: number; total: number; combo: number; date: string;
};
export type GameStats = Record<GameId, { best: number; plays: number }>;
export type SavedState = { version: 1; name: string; sound: boolean; rounds: RoundRecord[]; stats: GameStats };
const KEY = 'playground:v1';
const DEFAULT: SavedState = { version: 1, name: '플레이어', sound: true, rounds: [], stats: { math: { best: 0, plays: 0 }, word: { best: 0, plays: 0 }, memory: { best: 0, plays: 0 }, quiz: { best: 0, plays: 0 }, race: { best: 0, plays: 0 }, defense: { best: 0, plays: 0 } } };

export function readSaved(): SavedState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw?.version !== 1) return DEFAULT;
    const rounds: RoundRecord[] = Array.isArray(raw.rounds) ? raw.rounds.filter((r: RoundRecord) =>
      GAME_IDS.includes(r?.game) &&
      [r.score, r.correct, r.total, r.combo].every(n => Number.isFinite(n) && n >= 0) &&
      typeof r.date === 'string' && Number.isFinite(Date.parse(r.date)),
    ).slice(-100).map((r: RoundRecord) => {
      const { quizMode, racePlace, raceTime, raceFinished, defenseDifficulty, defenseStage, ...round } = r;
      if (r.game === 'defense') return { ...round,
        defenseDifficulty: defenseDifficulty === 'relaxed' || defenseDifficulty === 'veteran' ? defenseDifficulty : 'standard',
        ...(Number.isInteger(defenseStage) && defenseStage! >= 1 && defenseStage! <= 8 ? { defenseStage } : {}),
      };
      if (r.game === 'race') return { ...round,
        ...(Number.isInteger(racePlace) && racePlace! >= 1 && racePlace! <= 4 ? { racePlace } : {}),
        ...(typeof raceTime === 'number' && Number.isFinite(raceTime) && raceTime >= 0 && raceTime <= 180 ? { raceTime } : {}),
        ...(typeof raceFinished === 'boolean' ? { raceFinished } : {}),
      };
      return r.game === 'quiz' && isQuizMode(quizMode) ? { ...round, quizMode } : round;
    }) : [];
    const stats = Object.fromEntries(GAME_IDS.map(game => {
      const stored = raw.stats?.[game];
      const safe = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
      return [game, { best: Math.max(safe(stored?.best), bestScore(rounds, game)), plays: Math.max(safe(stored?.plays), rounds.filter(r => r.game === game).length) }];
    })) as GameStats;
    return {
      version: 1,
      name: typeof raw.name === 'string' ? raw.name.slice(0, 12) : DEFAULT.name,
      sound: typeof raw.sound === 'boolean' ? raw.sound : true,
      rounds, stats,
    };
  } catch { return DEFAULT; }
}

export function addRound(state: SavedState, round: RoundRecord): SavedState {
  const previous = state.stats[round.game];
  return { ...state, rounds: [...state.rounds, round].slice(-100), stats: { ...state.stats,
    [round.game]: { best: Math.max(previous.best, round.score), plays: previous.plays + 1 } } };
}

export function saveState(state: SavedState): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Games remain playable in private/restricted storage. */ }
}

export function bestScore(rounds: RoundRecord[], game: GameId): number {
  return rounds.reduce((best, round) => round.game === game ? Math.max(best, round.score) : best, 0);
}
