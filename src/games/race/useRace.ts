import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createRace, pauseRace, resumeRace, selectLane, startRace, stepRace, useRaceItem } from './engine';
import type { RaceInput, RaceState } from './engine';
import { drawRace, loadRaceAssets } from './render';
import type { RaceAssets } from './render';
import { playSound, unlockAudio } from '../../lib/sound';

const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export function useRace(canvas: RefObject<HTMLCanvasElement | null>, blocked: boolean) {
  const [initial] = useState(() => createRace(newSeed()));
  const stateRef = useRef(initial);
  const [state, setState] = useState(initial);
  const [assets, setAssets] = useState<RaceAssets | null>(null);
  const [assetError, setAssetError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const input = useRef<RaceInput>({ steer: 0, drift: false });
  const held = useRef(new Set<string>());
  const syncInput = useCallback(() => {
    input.current = { steer: Number(held.current.has('right')) - Number(held.current.has('left')), drift: held.current.has('drift') };
  }, []);
  const release = useCallback(() => { held.current.clear(); syncInput(); }, [syncInput]);
  const update = useCallback((fn: (s: RaceState) => RaceState) => { stateRef.current = fn(stateRef.current); setState(stateRef.current); }, []);
  const pause = useCallback(() => { release(); update(pauseRace); }, [release, update]);
  const resume = useCallback(() => { release(); update(resumeRace); }, [release, update]);
  const choose = useCallback((lane: number) => { release(); update(s => selectLane(s, lane)); }, [release, update]);
  const item = useCallback(() => {
    if (stateRef.current.phase === 'racing' && stateRef.current.inventory.length) { playSound('flip'); update(useRaceItem); }
  }, [update]);
  const hold = useCallback((key: string, down: boolean) => { if (down) held.current.add(key); else held.current.delete(key); syncInput(); }, [syncInput]);
  const nudge = useCallback((direction: number) => update(s => s.phase === 'racing' ? { ...s, targetLane: null, x: Math.max(-1.45, Math.min(1.45, s.x + direction * 0.32)) } : s), [update]);
  const start = () => { if (!assets) return; unlockAudio(); playSound('start'); release(); update(startRace); };
  const restart = () => { unlockAudio(); playSound('start'); release(); update(() => startRace(createRace(newSeed()))); };

  useEffect(() => {
    let cancelled = false;
    setAssetError(false);
    loadRaceAssets().then(value => { if (!cancelled) setAssets(value); }, () => { if (!cancelled) setAssetError(true); });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !assets) return;
    const ctx = el.getContext('2d');
    if (!ctx) { setAssetError(true); return; }
    let width = 0, height = 0, ratio = 1, needsDraw = true;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const resize = () => {
      const rect = el.getBoundingClientRect(); width = rect.width; height = rect.height;
      ratio = Math.min(2, window.devicePixelRatio || 1);
      const pixelsWide = Math.round(width * ratio), pixelsHigh = Math.round(height * ratio);
      if (el.width !== pixelsWide || el.height !== pixelsHigh) {
        el.width = pixelsWide; el.height = pixelsHigh;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      // Resizing clears the bitmap. Redraw synchronously, including when the race
      // or browser animation clock is paused, so rotation/capture never leaves a blank track.
      if (width > 0 && height > 0) drawRace(ctx, width, height, stateRef.current, assets, media.matches);
      needsDraw = false;
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let frame = 0, previous = performance.now(), lastUI = 0;
    const animate = (now: number) => {
      const before = stateRef.current;
      const next = stepRace(before, input.current, Math.min(0.1, (now - previous) / 1000));
      previous = now; stateRef.current = next;
      if (next.reviews.length > before.reviews.length) playSound(next.reviews.at(-1)!.correct ? 'correct' : 'wrong');
      if (next.phase === 'finished' && before.phase !== 'finished') { release(); playSound('finish'); }
      if (now - lastUI > 80 || next.phase !== before.phase || next.reviews.length !== before.reviews.length) { setState(next); lastUI = now; }
      if (needsDraw || next.phase === 'racing' || next.phase !== before.phase) {
        drawRace(ctx, width, height, next, assets, media.matches); needsDraw = false;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [assets, canvas, release]);

  useEffect(() => {
    const map: Record<string, string> = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', Shift: 'drift' };
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.key === 'Escape' && !event.repeat) { if (stateRef.current.phase === 'paused') resume(); else pause(); return; }
      if (stateRef.current.phase !== 'racing') return;
      if (map[event.key]) { event.preventDefault(); hold(map[event.key], true); }
      if (event.repeat) return;
      if (/^[1-3]$/.test(event.key)) { event.preventDefault(); choose(Number(event.key) - 1); }
      if (event.code === 'Space') { event.preventDefault(); item(); }
    };
    const keyup = (event: KeyboardEvent) => { if (map[event.key]) hold(map[event.key], false); };
    const hidden = () => { if (document.hidden) pause(); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', pause); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', hidden); release(); };
  }, [choose, hold, item, pause, release, resume]);
  useEffect(() => { if (blocked) pause(); }, [blocked, pause]);

  return { state, stateRef, ready: Boolean(assets), assetError, retry: () => setAttempt(n => n + 1), start, restart, pause, resume, choose, item, hold, nudge };
}
