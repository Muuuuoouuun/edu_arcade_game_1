import test from 'node:test';
import assert from 'node:assert/strict';
import { hapticPattern, playHaptic } from './haptic.ts';

test('only costly or heavy moments vibrate; routine shots stay quiet', () => {
  assert.deepEqual(hapticPattern('breach'), [45, 35, 70]);
  assert.equal(hapticPattern('skill'), 22);
  assert.equal(hapticPattern('freeze'), 16);
  assert.deepEqual(hapticPattern('surge'), [30, 50, 50]);
  for (const kind of ['arrow', 'cast', 'cannon', 'impact', 'slash'] as const) assert.equal(hapticPattern(kind), null);
});

test('playHaptic respects the toggle and tolerates missing or throwing vibrate', () => {
  const calls: unknown[] = [];
  const g = globalThis as { navigator?: unknown };
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const set = (value: unknown) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true });
  try {
    set({ vibrate: (p: unknown) => { calls.push(p); return true; } });
    playHaptic('breach', false); assert.equal(calls.length, 0);
    playHaptic('arrow', true); assert.equal(calls.length, 0);
    playHaptic('breach', true, 1000); assert.deepEqual(calls, [[45, 35, 70]]);
    playHaptic('breach', true, 1100); assert.equal(calls.length, 1);
    playHaptic('skill', true, 1250); assert.deepEqual(calls[1], 22);
    set({}); assert.doesNotThrow(() => playHaptic('breach', true, 5000));
    set({ vibrate: () => { throw new Error('denied'); } }); assert.doesNotThrow(() => playHaptic('breach', true, 9000));
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete g.navigator;
  }
});
