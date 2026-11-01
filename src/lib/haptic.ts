import type { CombatSoundKind } from './sound.ts';

// Only the moments that matter get a buzz; frequent shots stay silent so it never turns into noise.
const PATTERNS: Partial<Record<CombatSoundKind, number | number[]>> = {
  breach: [45, 35, 70],
  skill: 22,
  freeze: 16,
};

export function hapticPattern(kind: CombatSoundKind): number | number[] | null {
  return PATTERNS[kind] ?? null;
}

/** Best-effort touch feedback; unsupported browsers (iOS Safari, desktop) simply do nothing. */
export function playHaptic(kind: CombatSoundKind, enabled: boolean) {
  const pattern = hapticPattern(kind);
  if (!enabled || pattern === null || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate(pattern);
  } catch { /* Haptics are optional. */ }
}
