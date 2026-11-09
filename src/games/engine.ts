import { generateSessionProblems } from '../../../math_speed/functions/src/mathEngine.ts';
import { random, shuffle } from './random.ts';

export type GameId = 'math' | 'word' | 'memory' | 'quiz' | 'race' | 'defense';
export type Question = {
  prompt: string;
  answer: string;
  choices: string[];
  explanation: string;
  level: number;
};

const vocabulary = [
  ['apple', '사과'], ['book', '책'], ['chair', '의자'], ['dance', '춤추다'],
  ['garden', '정원'], ['honest', '정직한'], ['island', '섬'], ['journey', '여행'],
  ['energy', '에너지'], ['future', '미래'], ['language', '언어'], ['knowledge', '지식'],
  ['cloud', '구름'], ['dream', '꿈'], ['forest', '숲'], ['bright', '밝은'],
  ['ocean', '바다'], ['rocket', '로켓'], ['brave', '용감한'], ['friend', '친구'],
  ['smile', '미소'], ['star', '별'], ['wonder', '놀라움'], ['catch', '잡다'],
] as const;

export function makeQuestion(game: 'math' | 'word', seed: number, index: number): Question {
  const rng = random(seed + index * 7919);
  if (game === 'word') {
    const order = shuffle(vocabulary, random(seed));
    const [answer, meaning] = order[index % order.length];
    const distractors = shuffle(vocabulary.filter(([word]) => word !== answer), rng)
      .slice(0, 3).map(([word]) => word);
    return {
      prompt: meaning, answer, choices: shuffle([answer, ...distractors], rng),
      explanation: `${answer} = ${meaning}`, level: 1,
    };
  }
  // Reuse the mobile app's deterministic domain engine: one source for all ten levels.
  const level = Math.min(10, Math.floor(index / 6) + 1);
  let [problem] = generateSessionProblems(seed + index * 101, level, 1);
  // The source engine truncates level-9 division, even when it has a remainder.
  // Practice questions must have mathematically exact integer answers.
  if (level === 9) {
    const terms = problem.prompt.match(/^\((\d+) × (\d+)\) ÷ (\d+)$/);
    if (terms) {
      const a = Number(terms[1]), divisor = Number(terms[3]);
      let b = Number(terms[2]);
      while ((a * b) % divisor !== 0) b++;
      problem = { ...problem, prompt: `(${a} × ${b}) ÷ ${divisor}`, answer: (a * b) / divisor };
    }
  }
  const choices = new Set<number>([problem.answer]);
  const radius = Math.max(3, Math.min(12, Math.abs(problem.answer) / 4));
  while (choices.size < 4) {
    const offset = Math.floor(rng() * radius) + 1;
    const candidate = problem.answer + (rng() > 0.5 ? offset : -offset);
    if (candidate >= 0 || problem.answer < 0) choices.add(candidate);
  }
  return {
    prompt: problem.prompt, answer: String(problem.answer),
    choices: shuffle([...choices].map(String), rng),
    explanation: `${problem.prompt} = ${problem.answer}`, level,
  };
}

export function pointsForAnswer(correct: boolean, combo: number, elapsedMs: number, fever: boolean): number {
  if (!correct) return -50;
  const speedBonus = Math.round(Math.max(0, 75 * (1 - Math.max(0, elapsedMs) / 5000)));
  return (100 + Math.min(15 * Math.max(0, combo), 150) + speedBonus) * (fever ? 2 : 1);
}

export type MemoryCard = { id: number; pair: number; label: string };
export function makeMemoryCards(seed: number): MemoryCard[] {
  const pairs = shuffle(vocabulary.slice(0, 12), random(seed)).slice(0, 6);
  return shuffle(pairs.flatMap(([word, meaning], pair) => [
    { id: pair * 2, pair, label: word },
    { id: pair * 2 + 1, pair, label: meaning },
  ]), random(seed + 13));
}

export function isMatchingPair(a: MemoryCard, b: MemoryCard): boolean {
  return a.id !== b.id && a.pair === b.pair;
}

export const GAME_INFO = {
  defense: { title: '아르카나 수비대', category: '디펜스', description: '판타지 · 타워 디펜스', caption: '작은 마을에서 시작하는 수비대의 모험', art: 'defense', color: 'forest' },
  math: { title: '숫자 팡팡', category: '수학', description: '수학 · 스피드', caption: '정답을 터뜨려, 콤보를 이어가요!', art: 'mascot', color: 'peach' },
  word: { title: '워드 캐치', category: '단어', description: '영어 · 순발력', caption: '딱 맞는 단어를 잡아라!', art: 'cat', color: 'mint' },
  memory: { title: '짝꿍 찾기', category: '기억력', description: '기억력 · 집중력', caption: '영어와 뜻, 숨은 짝꿍을 찾아요!', art: 'tiles', color: 'butter' },
  quiz: { title: '상식 팡팡', category: '상식', description: '국기 · 역사 · 사자성어', caption: '아는 만큼 팡! 콤보로 세계 정복!', art: 'quiz', color: 'sky' },
  race: { title: '사이언스 카트', category: '레이싱', description: '과학 · 아이템 레이싱', caption: '정답을 잡고, 짜릿하게 추월!', art: 'race', color: 'coral' },
} as const;
