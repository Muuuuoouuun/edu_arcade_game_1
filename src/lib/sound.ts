let context: AudioContext | null = null;
let enabled = true;
let noiseBuffer: AudioBuffer | null = null;
const activeVoices = new Set<() => void>();

export type CombatSoundKind = 'arrow' | 'cast' | 'cannon' | 'impact' | 'slash' | 'freeze' | 'skill';
type Layer = {
  from: number; to: number; gain: number; duration: number;
  wave?: OscillatorType; noise?: BiquadFilterType; delay?: number; attack?: number;
};
type CombatSound = { cooldown: number; layers: Layer[] };

// Short, soft transients leave room for the existing arcade melodies and UI sounds.
const COMBAT_SOUNDS: Record<CombatSoundKind, CombatSound> = {
  arrow: { cooldown: 0.08, layers: [
    { noise: 'highpass', from: 2400, to: 1000, gain: 0.018, duration: 0.065 },
    { wave: 'triangle', from: 900, to: 400, gain: 0.009, duration: 0.045 },
  ] },
  cast: { cooldown: 0.11, layers: [
    { wave: 'sine', from: 560, to: 860, gain: 0.02, duration: 0.14 },
    { wave: 'triangle', from: 1120, to: 700, gain: 0.007, duration: 0.1, delay: 0.018 },
  ] },
  cannon: { cooldown: 0.2, layers: [
    { wave: 'sine', from: 100, to: 38, gain: 0.045, duration: 0.21 },
    { noise: 'lowpass', from: 780, to: 100, gain: 0.025, duration: 0.14 },
  ] },
  impact: { cooldown: 0.08, layers: [
    { wave: 'triangle', from: 180, to: 58, gain: 0.028, duration: 0.105 },
    { noise: 'bandpass', from: 1100, to: 400, gain: 0.017, duration: 0.065 },
  ] },
  slash: { cooldown: 0.095, layers: [
    { noise: 'bandpass', from: 3000, to: 900, gain: 0.023, duration: 0.09 },
    { wave: 'triangle', from: 560, to: 120, gain: 0.009, duration: 0.07 },
  ] },
  freeze: { cooldown: 0.3, layers: [
    { wave: 'sine', from: 1800, to: 1000, gain: 0.014, duration: 0.19 },
    { wave: 'triangle', from: 2400, to: 1600, gain: 0.006, duration: 0.14, delay: 0.03 },
    { noise: 'highpass', from: 4000, to: 1800, gain: 0.008, duration: 0.09 },
  ] },
  skill: { cooldown: 0.45, layers: [
    { wave: 'sine', from: 130, to: 54, gain: 0.035, duration: 0.24 },
    { wave: 'triangle', from: 740, to: 410, gain: 0.012, duration: 0.19, delay: 0.02 },
    { noise: 'lowpass', from: 1400, to: 240, gain: 0.025, duration: 0.19 },
  ] },
};
const combatStarts: number[] = [];
const lastKindStart: Partial<Record<CombatSoundKind, number>> = {};
let lastCombatStart = -Infinity;

export function setSound(value: boolean) {
  enabled = value;
  if (!value) for (const stop of [...activeVoices]) stop();
}
export function unlockAudio() {
  if (!enabled) return;
  try {
    if (!context || context.state === 'closed') {
      context = new AudioContext();
      noiseBuffer = null;
      combatStarts.length = 0;
      lastCombatStart = -Infinity;
      for (const kind of Object.keys(lastKindStart) as CombatSoundKind[]) delete lastKindStart[kind];
    }
    // A browser may deny resume; that rejection must not become an unhandled promise.
    if (context.state !== 'running') void context.resume().catch(() => {});
  } catch { /* Audio is optional. */ }
}

function noise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.4), ctx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Each event owns its graph; the final source ending releases every transient node. */
function synthesize(ctx: AudioContext, layers: Layer[], level = 1, pan?: number): boolean {
  const nodes: AudioNode[] = [];
  const sources: { node: AudioScheduledSourceNode; start: number; stop: number }[] = [];
  let remaining = 0, disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const { node } of sources) node.onended = null;
    for (const node of nodes) { try { node.disconnect(); } catch { /* Already detached. */ } }
    activeVoices.delete(stop);
  };
  const stop = () => {
    for (const { node } of sources) { try { node.stop(); } catch { /* Ended or not started. */ } }
    dispose();
  };
  try {
    const output = ctx.createGain(); nodes.push(output);
    output.gain.setValueAtTime(level, ctx.currentTime);
    if (pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner(); nodes.push(panner);
      panner.pan.setValueAtTime(Math.max(-0.75, Math.min(0.75, Number.isFinite(pan) ? pan : 0)), ctx.currentTime);
      output.connect(panner); panner.connect(ctx.destination);
    } else output.connect(ctx.destination);

    for (const layer of layers) {
      const start = ctx.currentTime + (layer.delay ?? 0), end = start + layer.duration;
      const gain = ctx.createGain(); nodes.push(gain);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(layer.gain, start + (layer.attack ?? 0.004));
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      gain.connect(output);
      let source: AudioScheduledSourceNode;
      if (layer.noise) {
        const buffer = ctx.createBufferSource(); source = buffer; nodes.push(buffer);
        buffer.buffer = noise(ctx);
        const filter = ctx.createBiquadFilter(); nodes.push(filter);
        filter.type = layer.noise;
        filter.Q.setValueAtTime(0.7, start);
        filter.frequency.setValueAtTime(layer.from, start);
        filter.frequency.exponentialRampToValueAtTime(layer.to, end);
        buffer.connect(filter); filter.connect(gain);
      } else {
        const osc = ctx.createOscillator(); source = osc; nodes.push(osc);
        osc.type = layer.wave ?? 'sine';
        osc.frequency.setValueAtTime(layer.from, start);
        osc.frequency.exponentialRampToValueAtTime(layer.to, end);
        osc.connect(gain);
      }
      remaining++;
      source.onended = () => { if (--remaining === 0) dispose(); };
      sources.push({ node: source, start, stop: end + 0.01 });
    }
    activeVoices.add(stop);
    for (const source of sources) { source.node.start(source.start); source.node.stop(source.stop); }
    return true;
  } catch {
    stop();
    return false;
  }
}

export function playSound(kind: 'correct' | 'wrong' | 'start' | 'finish' | 'flip') {
  if (!enabled) return;
  try {
    unlockAudio();
    if (!context) return;
    const ctx = context;
    const notes = kind === 'wrong' ? [180, 130] : kind === 'finish' ? [523, 659, 784, 1047]
      : kind === 'start' ? [440, 660] : kind === 'flip' ? [330] : [660, 880];
    synthesize(ctx, notes.map((freq, i) => ({ from: freq, to: freq, wave: 'sine', gain: 0.075, duration: 0.15, delay: i * 0.09, attack: 0.01 })));
  } catch { /* A browser audio restriction never blocks a round. */ }
}

/** Call once for a new engine hit/event. This never creates or resumes an audio context. */
export function playCombatSound(kind: CombatSoundKind, pan = 0): void {
  try {
    if (!enabled || !context || context.state !== 'running' ||
      (typeof document !== 'undefined' && document.hidden)) return;
    if (!Object.hasOwn(COMBAT_SOUNDS, kind)) return;
    const sound = COMBAT_SOUNDS[kind], now = context.currentTime;
    if (!Number.isFinite(now) || now - lastCombatStart < 0.05 ||
      now - (lastKindStart[kind] ?? -Infinity) < sound.cooldown) return;
    while (combatStarts.length && combatStarts[0] <= now - 1) combatStarts.shift();
    if (combatStarts.length >= 14) return;
    if (synthesize(context, sound.layers, 0.7, pan)) {
      combatStarts.push(now);
      lastCombatStart = now;
      lastKindStart[kind] = now;
    }
  } catch { /* Hidden tabs, unsupported nodes and audio restrictions never block combat. */ }
}
