import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldNotesForStage } from './fieldGuide.ts';
import { getWavePlan } from './difficulty.ts';
import { damageMultiplier } from './engine.ts';
import type { Difficulty } from './types.ts';

test('the first outing explains only wood, without revealing later material counters', () => {
  const notes = fieldNotesForStage(1);
  assert.deepEqual(notes.map(note => note.id), ['wood']);
  assert.deepEqual(notes[0].kinds, ['sprout', 'wood']);
});

test('rainy second outing introduces conduction and insulation together', () => {
  assert.deepEqual(fieldNotesForStage(2).map(note => note.id), ['wood', 'metal', 'insulator']);
});

test('a wave-specific guide never claims a boss or material outside the actual roster', () => {
  for (const difficulty of ['relaxed', 'standard', 'veteran'] as Difficulty[]) {
    for (let stage = 1; stage <= 8; stage++) for (let wave = 1; wave <= 4; wave++) {
      const roster = getWavePlan(stage, wave, difficulty);
      for (const note of fieldNotesForStage(stage, wave, difficulty)) {
        assert.ok(note.kinds.length > 0);
        assert.ok(note.kinds.every(kind => roster.includes(kind)));
      }
    }
  }
  assert.ok(!fieldNotesForStage(4, 1).flatMap(note => note.kinds).includes('boss'));
  assert.ok(fieldNotesForStage(4, 4).flatMap(note => note.kinds).includes('boss'));
});

test('fictional frostwolf weakness is not presented as a fact about ice or real wolves', () => {
  assert.ok(getWavePlan(5, 1).includes('frostwolf'));
  assert.ok(!fieldNotesForStage(5).flatMap(note => note.kinds).includes('frostwolf'));
});

test('material counter explanations agree with actual damage rules', () => {
  const notes = fieldNotesForStage(4);
  for (const kind of notes.find(note => note.id === 'wood')!.kinds) {
    assert.ok(damageMultiplier(kind, 'fire') > 1);
    assert.ok(damageMultiplier(kind, 'water') < 1);
  }
  for (const kind of fieldNotesForStage(8).find(note => note.id === 'ice')!.kinds) {
    assert.ok(damageMultiplier(kind, 'fire') > 1);
    assert.ok(damageMultiplier(kind, 'impact') > 1);
  }
  assert.ok(damageMultiplier('stone', 'impact') > 1);
  assert.ok(damageMultiplier('stone', 'fire') < 1);
  assert.ok(damageMultiplier('insulator', 'lightning') < 1);
  // Metal's lesson is conduction, not an invented direct-damage weakness.
  assert.equal(damageMultiplier('metal', 'lightning'), 1);
});

test('invalid stages and waves yield no invented field notes', () => {
  for (const stage of [0, -1, 9, 1.5, NaN]) assert.deepEqual(fieldNotesForStage(stage), []);
  for (const wave of [0, -1, 5, 1.5, NaN]) assert.deepEqual(fieldNotesForStage(1, wave), []);
});
