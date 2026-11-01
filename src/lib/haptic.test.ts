import test from 'node:test';
import assert from 'node:assert/strict';
import { hapticPattern, playHaptic } from './haptic.ts';

test('only costly or heavy moments vibrate; routine shots stay quiet', () => {
  assert.deepEqual(hapticPattern('breach'), [45, 35, 70]);
  assert.equal(hapticPattern('skill'), 22);
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
    playHaptic('breach', true); assert.deepEqual(calls, [[45, 35, 70]]);
    set({}); assert.doesNotThrow(() => playHaptic('breach', true));
    set({ vibrate: () => { throw new Error('denied'); } }); assert.doesNotThrow(() => playHaptic('breach', true));
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete g.navigator;
  }
});
