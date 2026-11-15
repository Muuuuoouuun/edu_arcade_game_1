// Graphics quality tiers and the auto-drop rule (cycle 12). Pure: no DOM, no clock; main.ts feeds frame times.

export type Quality = 'high' | 'low';
export type QualityPref = 'auto' | Quality;

export interface QualitySpec {
  /** Upper bound on the renderer pixel ratio (device pixels per CSS pixel). */
  pixelRatio: number;
  /** Ink hulls on walls, hedges and bushes. Characters, towers, crates and the town always keep theirs. */
  terrainOutlines: boolean;
  /** Decor outside the fence (pure scenery). */
  decor: boolean;
  /** Multiplier on particle counts. */
  particles: number;
}

export const QUALITY: Record<Quality, QualitySpec> = {
  high: { pixelRatio: 2, terrainOutlines: true, decor: true, particles: 1 },
  low: { pixelRatio: 1.25, terrainOutlines: false, decor: false, particles: 0.5 },
};

export const PREFS: readonly QualityPref[] = ['auto', 'high', 'low'];
export const PREF_LABEL: Record<QualityPref, string> = { auto: '자동', high: '높음', low: '낮음' };

/** Auto rule: start high; drop once if the average frame over a window is slower than the floor. */
export const AUTO = { warmup: 2, window: 3, floorFps: 40, maxGap: 0.25 } as const;

export interface FrameWatch { warm: number; sum: number; frames: number; dropped: boolean }

export function createFrameWatch(): FrameWatch {
  return { warm: 0, sum: 0, frames: 0, dropped: false };
}

/**
 * Feed one rendered battle frame (seconds since the previous one). Returns true exactly once, on the frame
 * where the window average falls below AUTO.floorFps. Long gaps (tab switch, loading) are ignored.
 */
export function watchFrame(w: FrameWatch, dt: number): boolean {
  if (w.dropped || !(dt > 0) || dt > AUTO.maxGap) return false;
  if (w.warm < AUTO.warmup) { w.warm += dt; return false; }
  w.sum += dt; w.frames++;
  if (w.sum < AUTO.window) return false;
  const slow = w.sum / w.frames > 1 / AUTO.floorFps;
  w.sum = 0; w.frames = 0;
  if (slow) w.dropped = true;
  return slow;
}

export function nextPref(p: QualityPref): QualityPref {
  return PREFS[(PREFS.indexOf(p) + 1) % PREFS.length];
}

export function parsePref(raw: unknown): QualityPref {
  return raw === 'high' || raw === 'low' || raw === 'auto' ? raw : 'auto';
}

/** The tier to render with: a fixed preference wins; auto is high until the watch drops it. */
export function resolveQuality(pref: QualityPref, autoDropped: boolean): Quality {
  return pref === 'auto' ? (autoDropped ? 'low' : 'high') : pref;
}
