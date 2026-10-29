import { QUIZ_QUESTIONS, QUIZ_TOPICS } from './quizData.ts';
import type { QuizMode, QuizQuestion, QuizTopic } from './quizData.ts';
import { random, shuffle } from './random.ts';

export function makeQuizDeck(mode: QuizMode, seed: number): QuizQuestion[] {
  const rng = random(seed);
  let ordered: QuizQuestion[];
  if (mode === 'mixed') {
    const topics = Object.keys(QUIZ_TOPICS) as QuizTopic[];
    const pools = topics.map(topic => shuffle(QUIZ_QUESTIONS.filter(q => q.topic === topic), rng));
    ordered = [];
    // Every four questions visit all four subjects, even in a short round.
    for (let i = 0; i < Math.max(...pools.map(pool => pool.length)); i++) {
      ordered.push(...shuffle(pools.map(pool => pool[i]).filter(Boolean), rng));
    }
  } else {
    ordered = shuffle(QUIZ_QUESTIONS.filter(q => q.topic === mode), rng);
  }
  return ordered.map(question => ({ ...question, choices: shuffle(question.choices, rng) }));
}
