import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { makeQuizDeck } from './quiz.ts';
import { QUIZ_QUESTIONS, QUIZ_TOPICS, isQuizMode } from './quizData.ts';
import type { QuizTopic } from './quizData.ts';

test('quiz content has 16 questions per topic, one answer per question, and local flag assets', () => {
  assert.equal(QUIZ_QUESTIONS.length, 64);
  assert.equal(new Set(QUIZ_QUESTIONS.map(q => q.id)).size, 64);
  for (const topic of Object.keys(QUIZ_TOPICS)) {
    assert.equal(QUIZ_QUESTIONS.filter(q => q.topic === topic).length, 16);
  }
  for (const q of QUIZ_QUESTIONS) {
    assert(q.prompt.trim() && q.explanation.trim());
    assert.equal(q.choices.length, 4, q.id);
    assert.equal(new Set(q.choices).size, 4, q.id);
    assert.equal(q.choices.filter(choice => choice === q.answer).length, 1, q.id);
    if (q.topic === 'flags') {
      assert.match(q.flag!, /^[a-z]{2}$/);
      assert(q.flagDescription && !q.flagDescription.includes(q.answer), q.id);
      const file = new URL(`../../public/flags/${q.flag}.svg`, import.meta.url);
      assert(existsSync(file), q.id);
      assert.match(readFileSync(file, 'utf8'), /<svg/);
    }
  }
});

test('each topic deck is deterministic, finite, nonrepeating, and shuffles question and answer order', () => {
  const original = JSON.stringify(QUIZ_QUESTIONS);
  for (const topic of Object.keys(QUIZ_TOPICS) as QuizTopic[]) {
    const answerSlots = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const deck = makeQuizDeck(topic, seed);
      assert.deepEqual(deck, makeQuizDeck(topic, seed));
      assert.equal(deck.length, 16);
      assert.equal(new Set(deck.map(q => q.id)).size, 16);
      assert(deck.every(q => q.topic === topic));
      deck.forEach(q => answerSlots.add(q.choices.indexOf(q.answer)));
    }
    assert.equal(answerSlots.size, 4);
    assert.notDeepEqual(makeQuizDeck(topic, 1).map(q => q.id), makeQuizDeck(topic, 2).map(q => q.id));
  }
  assert.equal(JSON.stringify(QUIZ_QUESTIONS), original, 'deck generation must not mutate authored content');
});

test('mixed decks visit every subject in each four-question block without repeats', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const deck = makeQuizDeck('mixed', seed);
    assert.deepEqual(deck, makeQuizDeck('mixed', seed));
    assert.equal(new Set(deck.map(q => q.id)).size, 64);
    for (let i = 0; i < deck.length; i += 4) assert.equal(new Set(deck.slice(i, i + 4).map(q => q.topic)).size, 4);
  }
});

test('stored topic validation rejects unrelated keys and invalid values', () => {
  for (const mode of ['mixed', ...Object.keys(QUIZ_TOPICS)]) assert(isQuizMode(mode));
  for (const value of [null, undefined, 1, {}, 'constructor', '__proto__', 'science']) assert(!isQuizMode(value));
});
