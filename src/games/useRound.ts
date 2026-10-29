import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { isMatchingPair, makeMemoryCards, makeQuestion, pointsForAnswer } from './engine';
import type { GameId } from './engine';
import { playSound } from '../lib/sound';
import { makeQuizDeck } from './quiz';
import type { QuizMode, QuizQuestion } from './quizData';

type Feedback = { correct: boolean; selected: string; answer: string; points: number };
type State = {
  phase: 'countdown' | 'playing' | 'paused' | 'result'; countdown: number;
  remaining: number; score: number; combo: number; maxCombo: number;
  correct: number; total: number; index: number; feedback: Feedback | null;
  mistakes: string[]; flipped: number[]; matched: number[];
  reviews: { question: QuizQuestion; selected: string; correct: boolean }[];
};
type Action = { type: 'count' } | { type: 'tick'; delta: number } | { type: 'pause' } | { type: 'resume' }
  | { type: 'answer'; correct: boolean; selected: string; answer: string; explanation: string; elapsed: number; quizQuestion?: QuizQuestion }
  | { type: 'next'; complete: boolean } | { type: 'flip'; id: number }
  | { type: 'resolve'; match: boolean; pair: number };

function initial(): State {
  return { phase: 'countdown', countdown: 3, remaining: 60000, score: 0, combo: 0, maxCombo: 0,
    correct: 0, total: 0, index: 0, feedback: null, mistakes: [], flipped: [], matched: [], reviews: [] };
}

function reducer(s: State, a: Action): State {
  if (a.type === 'count' && s.phase === 'countdown') {
    return s.countdown > 1 ? { ...s, countdown: s.countdown - 1 } : { ...s, phase: 'playing' };
  }
  if (a.type === 'pause' && s.phase === 'playing') return { ...s, phase: 'paused' };
  if (a.type === 'resume' && s.phase === 'paused') return { ...s, phase: 'playing' };
  if (s.phase !== 'playing') return s;
  if (a.type === 'tick') {
    const remaining = Math.max(0, s.remaining - a.delta);
    return { ...s, remaining, phase: remaining === 0 ? 'result' : s.phase };
  }
  if (a.type === 'answer' && !s.feedback) {
    const combo = a.correct ? s.combo + 1 : 0;
    const points = pointsForAnswer(a.correct, combo, a.elapsed, s.combo >= 5);
    return { ...s, combo, maxCombo: Math.max(s.maxCombo, combo), score: Math.max(0, s.score + points),
      correct: s.correct + Number(a.correct), total: s.total + 1,
      mistakes: a.correct ? s.mistakes : [...s.mistakes, a.explanation],
      reviews: a.quizQuestion ? [...s.reviews, { question: a.quizQuestion, selected: a.selected, correct: a.correct }] : s.reviews,
      feedback: { correct: a.correct, selected: a.selected, answer: a.answer, points } };
  }
  if (a.type === 'next') return a.complete ? { ...s, feedback: null, phase: 'result' } : { ...s, feedback: null, index: s.index + 1 };
  if (a.type === 'flip' && s.flipped.length < 2 && !s.flipped.includes(a.id)) {
    return { ...s, flipped: [...s.flipped, a.id] };
  }
  if (a.type === 'resolve' && s.flipped.length === 2) {
    const combo = a.match ? s.combo + 1 : 0;
    const matched = a.match ? [...s.matched, a.pair] : s.matched;
    const complete = matched.length === 6;
    return { ...s, flipped: [], matched, combo, maxCombo: Math.max(s.maxCombo, combo),
      correct: s.correct + Number(a.match), total: s.total + 1,
      score: s.score + (a.match ? 300 + combo * 30 : 0) + (complete ? Math.ceil(s.remaining / 1000) * 20 : 0),
      phase: complete ? 'result' : s.phase };
  }
  return s;
}

export function useRound(game: GameId, seed: number, quizMode: QuizMode = 'mixed') {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const quizDeck = useMemo(() => game === 'quiz' ? makeQuizDeck(quizMode, seed) : [], [game, quizMode, seed]);
  const quizQuestion = quizDeck[state.index];
  const question = useMemo(() => quizQuestion ?? makeQuestion(game === 'word' ? 'word' : 'math', seed, state.index), [game, seed, state.index, quizQuestion]);
  const cards = useMemo(() => makeMemoryCards(seed), [seed]);
  const questionStart = useRef(0);
  const questionElapsed = useRef(0);

  useEffect(() => { questionElapsed.current = 0; questionStart.current = performance.now(); }, [state.index]);
  useEffect(() => {
    if (state.phase !== 'countdown') return;
    const timer = window.setInterval(() => dispatch({ type: 'count' }), 850);
    return () => clearInterval(timer);
  }, [state.phase]);
  useEffect(() => {
    if (state.phase !== 'playing') return;
    questionStart.current = performance.now();
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'tick', delta: now - previous });
      previous = now;
    }, 100);
    const hidden = () => { if (document.hidden) dispatch({ type: 'pause' }); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      questionElapsed.current += performance.now() - questionStart.current;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [state.phase]);
  useEffect(() => {
    if (!state.feedback || state.phase !== 'playing') return;
    const complete = game === 'quiz' && state.index + 1 === quizDeck.length;
    const timer = window.setTimeout(() => dispatch({ type: 'next', complete }), state.feedback.correct ? 280 : 850);
    return () => clearTimeout(timer);
  }, [state.feedback, state.phase, state.index, game, quizDeck.length]);
  useEffect(() => {
    if (state.flipped.length !== 2 || state.phase !== 'playing') return;
    const first = cards.find(c => c.id === state.flipped[0])!;
    const second = cards.find(c => c.id === state.flipped[1])!;
    const match = isMatchingPair(first, second);
    const timer = window.setTimeout(() => {
      playSound(match ? 'correct' : 'wrong');
      dispatch({ type: 'resolve', match, pair: first.pair });
    }, match ? 350 : 850);
    return () => clearTimeout(timer);
  }, [state.flipped, state.phase, cards]);
  useEffect(() => { if (state.phase === 'result') playSound('finish'); }, [state.phase]);

  const answer = useCallback((selected: string) => {
    if (state.phase !== 'playing' || state.feedback) return;
    const correct = selected === question.answer;
    playSound(correct ? 'correct' : 'wrong');
    dispatch({ type: 'answer', correct, selected, answer: question.answer, explanation: question.explanation, quizQuestion,
      elapsed: questionElapsed.current + performance.now() - questionStart.current });
  }, [state.phase, state.feedback, question.answer, question.explanation, quizQuestion]);

  const flip = (id: number) => {
    const card = cards.find(c => c.id === id)!;
    if (state.phase !== 'playing' || state.matched.includes(card.pair) || state.flipped.includes(id) || state.flipped.length === 2) return;
    playSound('flip'); dispatch({ type: 'flip', id });
  };

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.repeat || (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      if (e.key === 'Escape') {
        if (state.phase === 'playing') dispatch({ type: 'pause' });
        else if (state.phase === 'paused') dispatch({ type: 'resume' });
      }
      if (game !== 'memory' && /^[1-4]$/.test(e.key)) {
        e.preventDefault(); answer(question.choices[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [answer, question.choices, state.phase, game]);

  return { state, question, quizQuestion, quizCount: quizDeck.length, cards, answer, flip,
    pause: () => dispatch({ type: 'pause' }), resume: () => dispatch({ type: 'resume' }) };
}
