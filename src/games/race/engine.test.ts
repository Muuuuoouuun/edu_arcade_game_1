import test from 'node:test';
import assert from 'node:assert/strict';
import { SCIENCE_QUESTIONS, scienceDeck } from './science.ts';
import { activeGate, CHOICE_DISTANCE, choicesVisible, createRace, LANES, pauseRace, raceLap, racePlace, raceScore, RACE_LENGTH, resumeRace, selectLane, startRace, stepRace, useRaceItem } from './engine.ts';
import type { RaceState } from './engine.ts';

const neutral = { steer: 0, drift: false };
const running = (seed = 42): RaceState => ({ ...createRace(seed), phase: 'racing', speed: 100 });
const advance = (state: RaceState, seconds: number, input = neutral) => {
  for (let i = 0; i < Math.round(seconds / 0.05); i++) state = stepRace(state, input, 0.05);
  return state;
};

test('science races use nine distinct, balanced questions with three unambiguous choices', () => {
  assert.equal(SCIENCE_QUESTIONS.length, 24);
  assert.equal(new Set(SCIENCE_QUESTIONS.map(q => q.id)).size, 24);
  for (let seed = 1; seed <= 50; seed++) {
    const deck = scienceDeck(seed);
    assert.deepEqual(deck, scienceDeck(seed));
    assert.equal(new Set(deck.map(q => q.id)).size, 9);
    assert.equal(new Set(deck.slice(0, 4).map(q => q.topic)).size, 4);
    for (const q of deck) {
      assert.equal(new Set(q.choices).size, 3); assert.equal(q.choices.filter(c => c === q.answer).length, 1);
      assert(q.explanation.length > 10);
    }
  }
});

test('question precedes choices; selecting a lane does not award an item until the physical gate crossing', () => {
  let s = running();
  const gate = s.gates[0];
  s.distance = gate.at - 600;
  assert.equal(activeGate(s), gate); assert.equal(choicesVisible(s), false);
  assert.equal(selectLane(s, 0), s);
  s.distance = gate.at - CHOICE_DISTANCE;
  assert(choicesVisible(s));
  const lane = gate.question.choices.indexOf(gate.question.answer);
  s = selectLane(s, lane); assert.equal(s.inventory.length, 0); assert.equal(s.reviews.length, 0);
  s = { ...s, distance: gate.at - 1, x: LANES[lane] };
  s = stepRace(s, neutral, 0.05);
  assert.equal(s.reviews[0].correct, true); assert.deepEqual(s.inventory, [gate.reward]);
  assert.equal(s.gateIndex, 1); assert.equal(s.combo, 1); assert.equal(s.targetLane, null);
  assert.equal(advance(s, 0.2).inventory.length, 1, 'crossing must only award once');
});

test('wrong and missed boxes give no items and explain the correct science; slowdown is real', () => {
  for (const penalty of ['empty', 'slow'] as const) {
    let s = running(); const gate = { ...s.gates[0], penalty };
    const lane = gate.question.choices.findIndex(c => c !== gate.question.answer);
    s = { ...s, gates: [gate, ...s.gates.slice(1)], distance: gate.at - 1, x: LANES[lane], combo: 3 };
    s = stepRace(s, neutral, 0.05);
    assert.equal(s.inventory.length, 0); assert.equal(s.reviews[0].correct, false); assert.equal(s.combo, 0);
    assert.equal(s.reviews[0].outcome, penalty); assert(s.notice!.body.includes(gate.question.answer));
    assert(s.notice!.body.includes(gate.question.explanation));
    assert.equal(s.slow, penalty === 'slow' ? 2.8 : 0);
    if (penalty === 'slow') assert(advance(s, 0.5).speed < 70);
  }
  let s = running(); s = { ...s, distance: s.gates[0].at - 0.1, x: 1.4 };
  s = stepRace(s, neutral, 0.05);
  assert.equal(s.reviews[0].outcome, 'miss'); assert.equal(s.reviews[0].selected, null); assert.equal(s.inventory.length, 0);
});

test('items consume one queue entry, boost speed, protect collisions, and slow rival progress', () => {
  let s = running(); s.inventory = ['boost', 'shield', 'lightning'];
  s = useRaceItem(s); assert.deepEqual(s.inventory, ['shield', 'lightning']); assert(s.boost > 3);
  assert(advance(s, 0.5).speed > 120);
  s = useRaceItem(s); assert.equal(s.shield, 8); assert.deepEqual(s.inventory, ['lightning']);
  const cone = s.obstacles[0]; s = { ...s, distance: cone.at - 1, x: cone.x, boost: 0 };
  assert.equal(stepRace(s, neutral, 0.05).slow, 0);
  assert(stepRace({ ...s, shield: 0 }, neutral, 0.05).slow > 0);
  const unstruck = advance(s, 1);
  const struck = advance(useRaceItem(s), 1);
  assert.equal(struck.inventory.length, 0);
  assert(struck.rivals.every((r, i) => r.distance < unstruck.rivals[i].distance));
  assert.equal(useRaceItem({ ...s, inventory: [] }).inventory.length, 0);
});

test('steering affects position and off-road speed; sustained drifting releases a short boost', () => {
  const s = running();
  assert(advance(s, 0.5, { steer: 1, drift: false }).x > 0.4);
  assert(advance({ ...s, x: 1.4 }, 1).speed < advance(s, 1).speed);
  const charged = advance(s, 1, { steer: 1, drift: true });
  assert(charged.driftCharge >= 0.85);
  assert(stepRace(charged, neutral, 0.05).boost > 1);
  assert.equal(stepRace(advance(s, 0.2, { steer: 1, drift: true }), neutral, 0.05).boost, 0);
});

test('pause freezes countdown, player, rivals, item effects and explanation time', () => {
  const countdown = pauseRace(startRace(createRace(42)));
  assert.equal(stepRace(countdown, neutral, 0.1), countdown);
  assert.equal(resumeRace(countdown).phase, 'countdown');
  const s = pauseRace({ ...running(), shield: 5, boost: 2, slow: 1, notice: { id: 1, kind: 'wrong', title: '꽝', body: '해설', ttl: 4 } });
  assert.equal(advance(s, 10), s); assert.equal(useRaceItem(s), s);
  assert.equal(resumeRace(s).phase, 'racing');
});

test('finish order is based on crossing times; timeouts do not receive a completion bonus', () => {
  let s = running(); s = { ...s, distance: RACE_LENGTH - 1, elapsed: 100,
    rivals: s.rivals.map((r, i) => ({ ...r, distance: i === 0 ? RACE_LENGTH : 8000, finishTime: i === 0 ? 99 : null })) };
  s = stepRace(s, neutral, 0.05);
  assert.equal(s.phase, 'finished'); assert.equal(s.finishReason, 'finish'); assert.equal(racePlace(s), 2); assert.equal(raceLap(s), 3); assert(raceScore(s) >= 2250);
  assert.equal(advance(s, 1), s);
  const timeout = stepRace({ ...running(), elapsed: 179.99 }, neutral, 0.05);
  assert.equal(timeout.finishReason, 'timeout'); assert.equal(timeout.elapsed, 180); assert.equal(raceScore(timeout), 0);
});

test('a full race can be won by choosing correct lanes and using items, with no repeat gate awards', () => {
  for (const seed of [1, 42, 2026]) {
    let s = startRace(createRace(seed));
    for (let tick = 0; tick < 4000 && s.phase !== 'finished'; tick++) {
      if (choicesVisible(s)) { const gate = activeGate(s)!; s = selectLane(s, gate.question.choices.indexOf(gate.question.answer)); }
      if (s.inventory.length) s = useRaceItem(s);
      s = stepRace(s, neutral, 0.05);
    }
    assert.equal(s.finishReason, 'finish'); assert.equal(s.reviews.length, 9); assert.equal(s.reviews.filter(r => r.correct).length, 9);
    assert.equal(racePlace(s), 1); assert.equal(s.gateIndex, 9); assert(s.elapsed < 120);
  }
});
