import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRound, readSaved, saveState } from './storage.ts';

test('lifetime high scores and play counts survive trimming the recent-round history', () => {
  let state = readSaved(); // No browser storage: falls back to the initial state.
  for (let i = 0; i < 105; i++) {
    state = addRound(state, { game: 'math', score: i === 0 ? 99999 : 100, correct: 1, total: 1, combo: 1, date: new Date().toISOString() });
  }
  assert.equal(state.rounds.length, 100);
  assert.equal(state.stats.math.best, 99999);
  assert.equal(state.stats.math.plays, 105);
  assert.equal(state.stats.word.plays, 0);
});

test('new games preserve existing profiles, lifetime scores and validated race records', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored = JSON.stringify({ version: 1, name: '기존 플레이어', sound: false, rounds: [],
    stats: { math: { best: 9800, plays: 212 }, word: { best: 2300, plays: 8 }, memory: { best: 900, plays: 3 } } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; },
  } });
  try {
    let state = readSaved();
    assert.equal(state.name, '기존 플레이어');
    assert.equal(state.sound, false);
    assert.deepEqual(state.stats.math, { best: 9800, plays: 212 });
    assert.deepEqual(state.stats.quiz, { best: 0, plays: 0 });
    assert.deepEqual(state.stats.race, { best: 0, plays: 0 });
    assert.deepEqual(state.stats.defense, { best: 0, plays: 0 });
    state = addRound(state, { game: 'quiz', quizMode: 'flags', score: 1200, correct: 7, total: 8, combo: 4, date: '2026-10-26T12:00:00Z' });
    saveState(state);
    assert.deepEqual(readSaved(), state);
    assert.deepEqual(readSaved().stats.quiz, { best: 1200, plays: 1 });
    const raw = JSON.parse(stored);
    raw.rounds[0].quizMode = 'constructor';
    stored = JSON.stringify(raw);
    assert.equal(readSaved().rounds[0].quizMode, undefined);
    assert.equal(readSaved().rounds[0].score, 1200);
    state = addRound(readSaved(), { game: 'race', score: 5200, correct: 9, total: 9, combo: 9, date: '2026-10-26T13:00:00Z', racePlace: 1, raceTime: 91.5, raceFinished: true });
    saveState(state);
    assert.deepEqual(readSaved(), state);
    assert.deepEqual(readSaved().stats.math, { best: 9800, plays: 212 });
    assert.deepEqual(readSaved().stats.race, { best: 5200, plays: 1 });
    const badRace = JSON.parse(stored);
    Object.assign(badRace.rounds[1], { racePlace: 5, raceTime: -3, raceFinished: 'yes' });
    stored = JSON.stringify(badRace);
    assert.equal(readSaved().rounds[1].racePlace, undefined);
    assert.equal(readSaved().rounds[1].raceTime, undefined);
    assert.equal(readSaved().rounds[1].raceFinished, undefined);
    state = addRound(readSaved(), { game: 'defense', defenseDifficulty: 'veteran', defenseStage: 8, score: 3000, correct: 4, total: 4, combo: 90, date: '2026-10-28T13:00:00Z' });
    saveState(state);
    assert.deepEqual(readSaved(), state, 'difficulty and region survive a saved battle record');
    const oldDefense = JSON.parse(stored);
    delete oldDefense.rounds[2].defenseDifficulty;
    oldDefense.rounds[2].defenseStage = 99;
    oldDefense.rounds[0].defenseDifficulty = 'veteran';
    stored = JSON.stringify(oldDefense);
    assert.equal(readSaved().rounds[2].defenseDifficulty, 'standard');
    assert.equal(readSaved().rounds[2].defenseStage, undefined);
    assert.equal(readSaved().rounds[0].defenseDifficulty, undefined, 'other games cannot inherit defense labels');
    assert.deepEqual(readSaved().stats.defense, { best: 3000, plays: 1 });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
