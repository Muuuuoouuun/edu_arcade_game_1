import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefense, SURGE_NOTICE } from '../games/defense/engine.ts';
import type { DefenseState, Effect } from '../games/defense/types.ts';
import { combatCueFor } from './defenseSound.ts';

const at = (x: number) => ({ x, y: 300 });
function withEffects(kinds: Effect['kind'][], patch: Partial<DefenseState> = {}) {
  const before = createDefense(1, 'mage');
  const effects = kinds.map((kind, i): Effect => ({ id: before.nextId + i, from: at(100), to: at(800), element: 'physical', life: 1, kind }));
  return { before, next: { ...before, ...patch, effects: [...before.effects, ...effects], nextId: before.nextId + kinds.length } };
}

test('a village breach outranks a dash or skill landing on the same frame', () => {
  for (const other of ['dash', 'skill', 'freeze'] as const) {
    const { before, next } = withEffects([other, 'breach']);
    assert.deepEqual(combatCueFor(before, next), { kind: 'breach', pan: (800 - 450) / 450 });
  }
});

test('without a breach the previous priority holds and silent frames give no cue', () => {
  const dash = withEffects(['skill', 'dash'], { heroPosition: at(90) });
  assert.deepEqual(combatCueFor(dash.before, dash.next), { kind: 'slash', pan: (90 - 450) / 450 });
  const skill = withEffects(['impact', 'skill']);
  assert.equal(combatCueFor(skill.before, skill.next)?.kind, 'skill');
  const quiet = createDefense(1, 'mage');
  assert.equal(combatCueFor(quiet, quiet), null);
  assert.equal(combatCueFor(quiet, { ...quiet, time: quiet.time + 0.1 }), null);
});

test('a paused frame stays silent even if effects exist', () => {
  const { before, next } = withEffects(['breach'], { paused: true });
  assert.equal(combatCueFor(before, next), null);
});

test('the surge horn plays once when the notice appears, yields to a breach, and not on later frames', () => {
  const before = createDefense(1, 'mage');
  const opened = { ...before, notice: SURGE_NOTICE };
  assert.deepEqual(combatCueFor(before, opened), { kind: 'surge', pan: 0 });
  assert.equal(combatCueFor(opened, { ...opened, time: opened.time + 0.1 }), null);
  const breach = withEffects(['breach'], { notice: SURGE_NOTICE });
  assert.equal(combatCueFor(breach.before, breach.next)?.kind, 'breach');
});
