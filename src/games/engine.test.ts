import test from 'node:test';
import assert from 'node:assert/strict';
import { isMatchingPair, makeMemoryCards, makeQuestion, pointsForAnswer } from './engine.ts';

test('math stays deterministic, offers one correct answer, and reaches all ten mobile-engine levels', () => {
  const levels = new Set<number>();
  for (let i = 0; i < 120; i++) {
    const q = makeQuestion('math', 20261026, i);
    assert.deepEqual(q, makeQuestion('math', 20261026, i));
    assert.equal(new Set(q.choices).size, 4);
    assert.equal(q.choices.filter(choice => choice === q.answer).length, 1);
    assert(Number.isFinite(Number(q.answer)));
    const arithmetic = q.prompt.replaceAll('×', '*').replaceAll('÷', '/');
    assert(/^[\d\s+*/()-]+$/.test(arithmetic));
    assert.equal(Number(q.answer), Function(`return (${arithmetic})`)(), q.prompt);
    levels.add(q.level);
  }
  assert.equal(levels.size, 10);
  for (let seed = 1; seed <= 100; seed++) {
    const q = makeQuestion('math', seed, 48);
    const terms = q.prompt.match(/\d+/g)!.map(Number);
    assert.equal((terms[0] * terms[1]) % terms[2], 0, q.prompt);
    assert.equal(Number(q.answer), (terms[0] * terms[1]) / terms[2]);
  }
});

test('word rounds contain distinct choices and avoid repeats before the vocabulary cycle', () => {
  const answers = new Set<string>();
  for (let i = 0; i < 24; i++) {
    const q = makeQuestion('word', 42, i);
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4);
    assert(q.choices.includes(q.answer));
    answers.add(q.answer);
  }
  assert.equal(answers.size, 24);
});

test('score rewards speed, combo and fever; incorrect answers never earn points', () => {
  assert.equal(pointsForAnswer(false, 10, 10, true), -50);
  assert(pointsForAnswer(true, 3, 500, false) > pointsForAnswer(true, 0, 4000, false));
  assert.equal(pointsForAnswer(true, 5, 500, true), 2 * pointsForAnswer(true, 5, 500, false));
  assert.equal(pointsForAnswer(true, 10, 500, false), pointsForAnswer(true, 100, 500, false));
});

test('memory deck has six unique pairs; a tile cannot match itself', () => {
  const cards = makeMemoryCards(42);
  assert.equal(cards.length, 12);
  assert.equal(new Set(cards.map(c => c.id)).size, 12);
  for (const card of cards) {
    assert(!isMatchingPair(card, card));
    assert.equal(cards.filter(other => isMatchingPair(card, other)).length, 1);
  }
  assert.deepEqual(cards, makeMemoryCards(42));
});
