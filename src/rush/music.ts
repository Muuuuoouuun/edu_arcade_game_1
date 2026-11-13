// Arcana Rush procedural background music (rush-only; the shared lib/sound.ts is untouched).
// Pure Web Audio synthesis: no samples, no dependencies. The module does not touch window,
// document or AudioContext at import time, so musicBar() can be tested in plain Node.
//
// Layout: musicBar() is the score (pure data), createMusic() is the player. The player
// schedules exactly the notes musicBar() returns, so tests on musicBar describe the real music.

export type MusicMood = 'off' | 'title' | 'town' | 'battle' | 'boss';
export type MusicVoice = 'lead' | 'bass' | 'pad' | 'kick' | 'hat' | 'snare';
export interface MusicNote { t: number; dur: number; midi: number; voice: MusicVoice }
export interface MusicBarData { tempo: number; notes: MusicNote[] }
export interface Music {
  unlock(): void;
  setMood(mood: MusicMood): void;
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
  readonly mood: MusicMood;
  dispose(): void;
}

type PlayMood = Exclude<MusicMood, 'off'>;

// ---------------------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------------------

/** The score repeats every MUSIC_LOOP_BARS bars: an 8-bar chord cycle played as pass A, then pass B. */
export const MUSIC_LOOP_BARS = 16;
export const MUSIC_BEATS_PER_BAR = 4;
/** Beats per minute. battle and boss share a tempo so a boss wave can take over mid-bar. */
export const MUSIC_TEMPO: Record<PlayMood, number> = { town: 100, title: 104, battle: 128, boss: 128 };

// General MIDI style drum note numbers, only informative (drums are unpitched here).
const KICK = 36;
const SNARE = 38;
const HAT = 42;

type Chord = readonly [pitchClass: number, minor: boolean];
const MAJ = false;
const MIN = true;

// 8-bar chord cycles.
const CHORDS: Record<PlayMood, readonly Chord[]> = {
  // C major: I V vi IV / I V IV V
  town: [[0, MAJ], [7, MAJ], [9, MIN], [5, MAJ], [0, MAJ], [7, MAJ], [5, MAJ], [7, MAJ]],
  // D major: I IV vi V / I IV V I
  title: [[2, MAJ], [7, MAJ], [11, MIN], [9, MAJ], [2, MAJ], [7, MAJ], [9, MAJ], [2, MAJ]],
  // D major: I I IV V / vi IV V V
  battle: [[2, MAJ], [2, MAJ], [7, MAJ], [9, MAJ], [11, MIN], [7, MAJ], [9, MAJ], [9, MAJ]],
  // D minor: i i VI VII / i i VI V(major, for tension)
  boss: [[2, MIN], [2, MIN], [10, MAJ], [0, MAJ], [2, MIN], [2, MIN], [10, MAJ], [9, MAJ]],
};

type Triple = readonly [t: number, dur: number, midi: number];

// Lead melodies: 16 bars per mood, [beat, length in beats, midi]. Kept sparse on purpose so
// the lead never masks gameplay sounds; pass B (bars 8-15) is thinner than pass A.
const LEADS: Record<PlayMood, readonly (readonly Triple[])[]> = {
  // C major pentatonic (C D E G A)
  town: [
    [[0, 0.5, 76], [1, 0.5, 79], [1.5, 1, 81], [3, 1, 79]],
    [[0, 1, 74], [1.5, 0.5, 79], [2, 1.5, 74]],
    [[0, 0.5, 72], [1, 0.5, 76], [1.5, 1, 81], [3, 0.5, 79]],
    [[0, 1.5, 81], [2, 0.5, 79], [2.5, 0.5, 76], [3, 1, 72]],
    [[0.5, 0.5, 76], [1, 0.5, 79], [2, 1, 84], [3.5, 0.5, 81]],
    [[0, 1.5, 79], [2, 0.5, 74], [3, 0.5, 79]],
    [[0, 0.5, 81], [0.5, 0.5, 79], [1, 1, 72], [2.5, 0.5, 74], [3, 1, 76]],
    [[0, 2, 74], [3, 0.5, 67], [3.5, 0.5, 69]],
    [[0, 1, 72], [1.5, 0.5, 76], [2, 1.5, 79]],
    [[3, 1, 74]],
    [[0, 0.5, 81], [0.5, 0.5, 84], [1.5, 1.5, 81]],
    [[2, 0.5, 79], [2.5, 0.5, 76], [3, 1, 72]],
    [[0, 1, 76], [1, 0.5, 74], [1.5, 1.5, 72]],
    [[1, 0.5, 74], [2, 1.5, 79]],
    [[0, 0.5, 81], [1, 0.5, 79], [2, 0.5, 76], [3, 0.5, 74]],
    [[0, 3, 72]],
  ],
  // D major pentatonic (D E F# A B)
  title: [
    [[0, 0.5, 78], [0.5, 0.5, 81], [1, 1, 86], [2.5, 0.5, 83], [3, 1, 81]],
    [[0, 1.5, 83], [2, 0.5, 81], [3, 0.5, 78]],
    [[0, 0.5, 78], [0.5, 0.5, 81], [1, 1, 83], [2.5, 0.5, 81], [3, 1, 78]],
    [[0, 2, 76], [3, 0.5, 69], [3.5, 0.5, 74]],
    [[0, 0.5, 78], [0.5, 0.5, 81], [1, 1, 86], [2.5, 0.5, 83], [3, 1, 81]],
    [[0, 1, 83], [1.5, 0.5, 86], [2, 1.5, 83]],
    [[0, 0.5, 81], [1, 0.5, 78], [2, 0.5, 76], [3, 0.5, 78]],
    [[0, 3, 74]],
    [[1, 1, 86], [3, 1, 81]],
    [[0, 1.5, 83]],
    [[1, 1, 83], [3, 1, 78]],
    [[0, 2, 76]],
    [[0, 0.5, 74], [0.5, 0.5, 78], [1, 1, 81], [3, 0.5, 83]],
    [[0, 1.5, 86], [2.5, 0.5, 83]],
    [[0, 1, 81], [1.5, 0.5, 78], [2, 1, 76]],
    [[0, 3, 74]],
  ],
  // D major, mostly pentatonic, with the leading tone (C#) over the V chord
  battle: [
    [[0, 0.5, 81], [0.5, 0.25, 78], [0.75, 0.75, 81], [2, 0.5, 86], [2.5, 1, 83]],
    [[3, 0.5, 81], [3.5, 0.5, 83]],
    [[0, 1, 86], [1.5, 0.5, 83], [2, 1, 81]],
    [[0, 0.5, 76], [1, 0.5, 76], [1.5, 1.5, 81]],
    [[0, 0.5, 78], [0.5, 0.25, 74], [0.75, 0.75, 78], [2, 0.5, 83], [2.5, 1, 81]],
    [],
    [[0, 0.5, 76], [0.5, 0.5, 78], [1, 1, 81], [2.5, 0.5, 83], [3, 1, 85]],
    [[0, 1.5, 81]],
    [],
    [[2.5, 0.5, 74], [3, 0.5, 78], [3.5, 0.5, 81]],
    [[0, 1.5, 83]],
    [],
    [[0, 0.5, 78], [0.5, 0.25, 81], [0.75, 0.75, 83], [2, 0.5, 86], [2.5, 1, 83]],
    [[0, 1, 81]],
    [[0, 0.5, 85], [0.5, 0.5, 83], [1, 0.5, 81], [2, 0.5, 76], [2.5, 0.5, 78], [3, 1, 81]],
    [[0, 2, 86]],
  ],
  // D natural minor, harmonic minor (C#) over the closing V chord
  boss: [
    [[0, 0.5, 74], [0.5, 0.5, 77], [1, 1, 81], [2.5, 0.5, 79], [3, 1, 77]],
    [[0, 1.5, 74]],
    [[0, 0.5, 77], [0.5, 0.5, 82], [1, 1, 86], [2.5, 0.5, 84], [3, 1, 82]],
    [[0, 1.5, 84], [2, 0.5, 79], [3, 0.5, 76]],
    [[0, 0.5, 86], [0.75, 0.25, 84], [1, 1, 81], [2.5, 0.5, 77], [3, 1, 81]],
    [],
    [[0, 1, 82], [1.5, 0.5, 81], [2, 1, 77]],
    [[0, 0.5, 76], [1, 0.5, 81], [2, 1.5, 85]],
    [],
    [[2, 0.5, 81], [2.5, 0.5, 84], [3, 1, 86]],
    [[0, 2, 82]],
    [[3, 0.5, 76], [3.5, 0.5, 79]],
    [[0, 0.5, 74], [0.5, 0.5, 77], [1, 1, 81], [3, 0.5, 84]],
    [[0, 1.5, 86]],
    [[0, 0.5, 82], [0.5, 0.5, 81], [1, 0.5, 77], [2, 1, 74]],
    [[0, 0.5, 73], [1, 0.5, 76], [2, 2, 81]],
  ],
};

const VOICE_ORDER: Record<MusicVoice, number> = { kick: 0, snare: 1, hat: 2, bass: 3, pad: 4, lead: 5 };

function padNotes(chord: Chord): number[] {
  // Close-voiced triad kept inside G3..G4 so chord changes move smoothly.
  const root = 48 + chord[0];
  return [root, root + (chord[1] ? 3 : 4), root + 7].map((m) => (m > 67 ? m - 12 : m)).sort((a, b) => a - b);
}

/**
 * One bar of music as plain data. Pure and deterministic: no DOM, no audio, no randomness.
 * t and dur are in beats (4 beats per bar). The score loops every MUSIC_LOOP_BARS bars.
 */
export function musicBar(mood: PlayMood, bar: number): MusicBarData {
  const b = (((Math.floor(Number.isFinite(bar) ? bar : 0) % MUSIC_LOOP_BARS) + MUSIC_LOOP_BARS) % MUSIC_LOOP_BARS);
  const chord = CHORDS[mood][b % 8];
  const passB = b >= 8;
  const notes: MusicNote[] = [];
  const add = (voice: MusicVoice, t: number, dur: number, midi: number) => { notes.push({ t, dur, midi, voice }); };

  for (const midi of padNotes(chord)) add('pad', 0, 4, midi);
  for (const [t, dur, midi] of LEADS[mood][b]) add('lead', t, dur, midi);

  if (mood === 'town' || mood === 'title') {
    // Gentle bass around C3..G3; no kick, no snare.
    let r = 48 + chord[0];
    if (r > 55) r -= 12;
    if (mood === 'town') {
      if (!passB) { add('bass', 0, 1.5, r); add('bass', 2, 1, r + 7); add('bass', 3, 1, r); }
      else { add('bass', 0, 2, r); add('bass', 2.5, 0.5, r + 7); add('bass', 3, 1, r + 12); }
    } else {
      add('bass', 0, 1, r); add('bass', 1.5, 0.5, r); add('bass', 2, 1, r + 7);
      add('bass', 3, 0.5, r); add('bass', 3.5, 0.5, r + 7);
      // A soft off-beat shaker joins after a 4-bar intro and rests on the last bar.
      if (b >= 4 && b !== 15) for (let i = 0; i < 4; i++) add('hat', i + 0.5, 0.25, HAT);
    }
  } else {
    const r = 36 + chord[0];
    const breakdown = b === 8 || b === 9; // two thinner bars open pass B
    const fill = b % 4 === 3;
    if (mood === 'battle') {
      if (breakdown) {
        add('bass', 0, 1.5, r); add('bass', 2, 1.5, r);
        add('kick', 0, 0.25, KICK); add('kick', 2, 0.25, KICK);
        for (let i = 0; i < 4; i++) add('hat', i, 0.25, HAT);
      } else {
        if (b % 2 === 0) {
          add('bass', 0, 0.5, r); add('bass', 0.75, 0.25, r); add('bass', 1.5, 0.5, r);
          add('bass', 2, 0.5, r); add('bass', 2.75, 0.25, r); add('bass', 3.5, 0.5, r + 12);
          add('kick', 0, 0.25, KICK); add('kick', 2, 0.25, KICK); add('kick', 2.5, 0.25, KICK);
        } else {
          add('bass', 0, 0.5, r); add('bass', 1, 0.5, r); add('bass', 1.5, 0.5, r + 7);
          add('bass', 2, 0.5, r); add('bass', 3, 0.5, r); add('bass', 3.5, 0.5, r + 7);
          add('kick', 0, 0.25, KICK); add('kick', 1.5, 0.25, KICK); add('kick', 2, 0.25, KICK);
        }
        add('snare', 1, 0.25, SNARE); add('snare', 3, 0.25, SNARE);
        if (fill) { add('snare', 3.5, 0.25, SNARE); add('snare', 3.75, 0.25, SNARE); }
        if (b === 15) add('snare', 3.25, 0.25, SNARE);
        for (let i = 0; i < 8; i++) add('hat', i * 0.5, 0.25, HAT);
      }
    } else {
      // boss: straight eighth-note bass and a four-on-the-floor stomp
      for (let i = 0; i < 8; i++) {
        const midi = i === 7 ? r + 12 : i === 6 && b % 2 === 1 ? r + 7 : r;
        add('bass', i * 0.5, 0.5, midi);
      }
      for (let i = 0; i < 4; i++) add('kick', i, 0.25, KICK);
      if (!breakdown) {
        add('snare', 1, 0.25, SNARE); add('snare', 3, 0.25, SNARE);
        if (fill) { add('snare', 3.5, 0.25, SNARE); add('snare', 3.75, 0.25, SNARE); }
        for (let i = 0; i < 4; i++) {
          add('hat', i + 0.5, 0.25, HAT);
          if (passB && i % 2 === 1) add('hat', i + 0.75, 0.25, HAT);
        }
      }
    }
  }

  notes.sort((x, y) => x.t - y.t || VOICE_ORDER[x.voice] - VOICE_ORDER[y.voice] || x.midi - y.midi);
  return { tempo: MUSIC_TEMPO[mood], notes };
}

// ---------------------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------------------

const TICK_MS = 25;
const LOOKAHEAD = 0.12;
const CROSSFADE = 0.6;
const DEFAULT_VOLUME = 0.12;
const SILENT = 0.0001;
const PLAY_MOODS: readonly PlayMood[] = ['title', 'town', 'battle', 'boss'];

interface Timbre {
  leadWave: OscillatorType; leadGain: number; leadCut: number; leadBell: boolean;
  bassWave: OscillatorType; bassGain: number; bassCut: number;
  padGain: number; padOscs: number;
  kickGain: number; snareGain: number; hatGain: number;
}
// Gains are relative to the master volume. Cut = low-pass cutoff in Hz (0 = no filter).
const TIMBRES: Record<PlayMood, Timbre> = {
  town: { leadWave: 'triangle', leadGain: 0.3, leadCut: 0, leadBell: true, bassWave: 'triangle', bassGain: 0.3, bassCut: 0,
    padGain: 0.075, padOscs: 2, kickGain: 0, snareGain: 0, hatGain: 0.04 },
  title: { leadWave: 'triangle', leadGain: 0.3, leadCut: 0, leadBell: true, bassWave: 'triangle', bassGain: 0.32, bassCut: 0,
    padGain: 0.075, padOscs: 2, kickGain: 0, snareGain: 0, hatGain: 0.045 },
  battle: { leadWave: 'square', leadGain: 0.13, leadCut: 2400, leadBell: false, bassWave: 'square', bassGain: 0.2, bassCut: 520,
    padGain: 0.05, padOscs: 1, kickGain: 0.45, snareGain: 0.2, hatGain: 0.07 },
  boss: { leadWave: 'sawtooth', leadGain: 0.13, leadCut: 1900, leadBell: false, bassWave: 'sawtooth', bassGain: 0.27, bassCut: 460,
    padGain: 0.055, padOscs: 1, kickGain: 0.5, snareGain: 0.2, hatGain: 0.065 },
};

const isCombat = (mood: MusicMood): boolean => mood === 'battle' || mood === 'boss';
const midiHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

export function createMusic(opts?: { volume?: number }): Music {
  const volume = Math.max(0, Math.min(1, opts?.volume ?? DEFAULT_VOLUME));
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let buses: Record<PlayMood, GainNode> | null = null;
  let noise: AudioBuffer | null = null;
  let enabled = true;
  let mood: MusicMood = 'off';
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let listening = false;

  // Transport: which mood is sounding, where its current bar started, how far we scheduled.
  let playing: PlayMood | null = null;
  let barIndex = 0;
  let barStart = 0;
  let horizon = 0;
  let cursor = 0;
  let barData: MusicBarData | null = null;
  const barCache = new Map<string, MusicBarData>();

  const hidden = (): boolean => typeof document !== 'undefined' && document.hidden;

  function getBar(m: PlayMood, bar: number): MusicBarData {
    const key = `${m}:${bar % MUSIC_LOOP_BARS}`;
    let data = barCache.get(key);
    if (!data) { data = musicBar(m, bar); barCache.set(key, data); }
    return data;
  }

  function ramp(param: AudioParam, target: number, at: number, seconds: number) {
    try {
      param.cancelScheduledValues(at);
      param.setValueAtTime(param.value, at);
      param.linearRampToValueAtTime(target, at + seconds);
    } catch { /* audio must never break the game */ }
  }

  // --- voices -----------------------------------------------------------------------

  function tone(
    ac: AudioContext, out: AudioNode, wave: OscillatorType, hz: number, detune: number, cut: number,
    at: number, attack: number, hold: number, release: number, peak: number, pluck: boolean,
  ) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    let filter: BiquadFilterNode | null = null;
    osc.type = wave;
    osc.frequency.value = hz;
    if (detune) osc.detune.value = detune;
    const end = at + attack + hold + release;
    gain.gain.setValueAtTime(SILENT, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    if (pluck) gain.gain.exponentialRampToValueAtTime(SILENT, end);
    else {
      gain.gain.linearRampToValueAtTime(peak * 0.8, at + attack + hold);
      gain.gain.linearRampToValueAtTime(SILENT, end);
    }
    if (cut > 0) {
      filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cut;
      osc.connect(filter); filter.connect(gain);
    } else osc.connect(gain);
    gain.connect(out);
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); filter?.disconnect(); } catch { /* already gone */ }
    };
    osc.start(at);
    osc.stop(end + 0.02);
  }

  function noiseHit(
    ac: AudioContext, out: AudioNode, type: BiquadFilterType, hz: number, at: number, seconds: number, peak: number,
  ) {
    if (!noise) {
      noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    src.buffer = noise;
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(SILENT, at + seconds);
    src.connect(filter); filter.connect(gain); gain.connect(out);
    src.onended = () => {
      try { src.disconnect(); filter.disconnect(); gain.disconnect(); } catch { /* already gone */ }
    };
    src.start(at, Math.random() * 0.3);
    src.stop(at + seconds + 0.02);
  }

  function kick(ac: AudioContext, out: AudioNode, at: number, peak: number) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.11);
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(SILENT, at + 0.17);
    osc.connect(gain); gain.connect(out);
    osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch { /* already gone */ } };
    osc.start(at);
    osc.stop(at + 0.19);
  }

  function playNote(ac: AudioContext, out: AudioNode, m: PlayMood, note: MusicNote, at: number, beat: number) {
    const tb = TIMBRES[m];
    const seconds = note.dur * beat;
    switch (note.voice) {
      case 'lead': {
        const hz = midiHz(note.midi);
        const ring = Math.min(0.7, Math.max(0.18, seconds * 0.9 + 0.1));
        tone(ac, out, tb.leadWave, hz, 0, tb.leadCut, at, 0.008, 0, ring, tb.leadGain, true);
        if (tb.leadBell) tone(ac, out, 'sine', hz * 2, 0, 0, at, 0.005, 0, ring * 0.6, tb.leadGain * 0.3, true);
        break;
      }
      case 'bass':
        tone(ac, out, tb.bassWave, midiHz(note.midi), 0, tb.bassCut, at, 0.012, Math.max(0.03, seconds * 0.85 - 0.012), 0.06,
          tb.bassGain, false);
        break;
      case 'pad': {
        const hz = midiHz(note.midi);
        const each = tb.padGain / tb.padOscs;
        const hold = Math.max(0.05, seconds - 0.3);
        if (tb.padOscs > 1) {
          tone(ac, out, 'triangle', hz, -6, 0, at, 0.3, hold, 0.35, each, false);
          tone(ac, out, 'triangle', hz, 6, 0, at, 0.3, hold, 0.35, each, false);
        } else tone(ac, out, 'triangle', hz, 0, 0, at, 0.3, hold, 0.35, each, false);
        break;
      }
      case 'kick':
        if (tb.kickGain > 0) kick(ac, out, at, tb.kickGain);
        break;
      case 'snare':
        if (tb.snareGain > 0) {
          noiseHit(ac, out, 'bandpass', 1800, at, 0.12, tb.snareGain);
          tone(ac, out, 'triangle', 190, 0, 0, at, 0.003, 0, 0.07, tb.snareGain * 0.5, true);
        }
        break;
      case 'hat':
        if (tb.hatGain > 0) noiseHit(ac, out, 'highpass', 7000, at, 0.04, tb.hatGain);
        break;
    }
  }

  // --- scheduler --------------------------------------------------------------------

  function tick() {
    const ac = ctx;
    const m = playing;
    if (!ac || !buses || !m) return;
    try {
      const now = ac.currentTime;
      const until = now + LOOKAHEAD;
      const beat = 60 / MUSIC_TEMPO[m];
      const barLen = beat * MUSIC_BEATS_PER_BAR;
      // A long stall (throttled timer, debugger): drop the backlog and restart on the next bar.
      if (barStart + barLen < now - 0.25) {
        barIndex += 1;
        barStart = now + 0.05;
        cursor = 0;
        barData = null;
      }
      for (let guard = 0; guard < 8; guard++) {
        if (!barData) barData = getBar(m, barIndex);
        const notes = barData.notes;
        while (cursor < notes.length) {
          const note = notes[cursor];
          const at = barStart + note.t * beat;
          if (at >= until) break;
          cursor += 1;
          if (at >= now - 0.02) {
            try { playNote(ac, buses[m], m, note, Math.max(at, now), beat); } catch { /* skip this note */ }
          }
        }
        if (cursor < notes.length || barStart + barLen >= until) break;
        barIndex += 1;
        barStart += barLen;
        cursor = 0;
        barData = null;
      }
      horizon = until;
    } catch { /* audio must never break the game */ }
  }

  function stopTimer() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  function startTimer() {
    if (timer !== null || disposed || !ctx || !playing || !enabled || hidden()) return;
    timer = setInterval(tick, TICK_MS);
    tick();
  }

  function fadeBuses(target: PlayMood | null, at: number) {
    if (!buses) return;
    for (const m of PLAY_MOODS) ramp(buses[m].gain, m === target ? 1 : 0, at, CROSSFADE);
  }

  /** Bring the audio in line with the requested mood. Call after any state change. */
  function apply() {
    const ac = ctx;
    if (!ac || !buses || disposed) return;
    const now = ac.currentTime;
    if (!enabled || mood === 'off') {
      fadeBuses(null, now);
      playing = null;
      stopTimer();
      return;
    }
    const next: PlayMood = mood;
    if (playing === next) { startTimer(); return; }
    if (playing && timer !== null && isCombat(playing) && isCombat(next)) {
      // battle <-> boss: keep the bar counter and the position inside the bar. Notes already
      // scheduled finish on the old bus as it fades; everything after the horizon uses the new score.
      const oldBeat = 60 / MUSIC_TEMPO[playing];
      const newBeat = 60 / MUSIC_TEMPO[next];
      const from = Math.max(horizon, now);
      const posBeats = Math.max(0, (from - barStart) / oldBeat);
      barStart = from - posBeats * newBeat;
      barData = getBar(next, barIndex);
      cursor = 0;
      while (cursor < barData.notes.length && barStart + barData.notes[cursor].t * newBeat < from - 1e-6) cursor += 1;
    } else {
      barIndex = 0;
      barStart = now + 0.08;
      horizon = now;
      cursor = 0;
      barData = null;
    }
    playing = next;
    fadeBuses(next, now);
    startTimer();
  }

  function resume() {
    const ac = ctx;
    if (!ac || disposed || !enabled || hidden()) return;
    if (suspendTimer !== null) { clearTimeout(suspendTimer); suspendTimer = null; }
    try {
      if (ac.state !== 'running') void ac.resume().then(() => { startTimer(); }, () => { /* stays silent */ });
    } catch { /* stays silent */ }
  }

  function suspend() {
    stopTimer();
    try { if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => { /* ignore */ }); } catch { /* ignore */ }
  }

  function onVisibility() {
    if (disposed || !ctx) return;
    if (hidden()) suspend();
    else if (enabled) { resume(); startTimer(); }
  }

  return {
    /** Call from a user gesture (pointerdown / click / keydown). Safe to call repeatedly. */
    unlock() {
      if (disposed) return;
      try {
        if (!ctx) {
          if (typeof window === 'undefined') return;
          const Ctor = window.AudioContext
            ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctor) return;
          const ac = new Ctor();
          const out = ac.createGain();
          out.gain.value = enabled ? volume : 0;
          out.connect(ac.destination);
          const made = {} as Record<PlayMood, GainNode>;
          for (const m of PLAY_MOODS) {
            const bus = ac.createGain();
            bus.gain.value = 0;
            bus.connect(out);
            made[m] = bus;
          }
          ctx = ac; master = out; buses = made;
          if (!listening && typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', onVisibility);
            listening = true;
          }
        }
        if (enabled && !hidden()) { resume(); apply(); }
      } catch { /* no audio available: stay silent */ }
    },
    setMood(next: MusicMood) {
      if (disposed || next === mood) return;
      mood = next;
      try { apply(); } catch { /* ignore */ }
    },
    setEnabled(on: boolean) {
      if (disposed || on === enabled) return;
      enabled = on;
      const ac = ctx;
      if (!ac || !master) return;
      try {
        if (on) {
          resume();
          ramp(master.gain, volume, ac.currentTime, 0.3);
          apply();
        } else {
          ramp(master.gain, 0, ac.currentTime, 0.3);
          apply();
          if (suspendTimer !== null) clearTimeout(suspendTimer);
          suspendTimer = setTimeout(() => { suspendTimer = null; if (!enabled && !disposed) suspend(); }, 700);
        }
      } catch { /* ignore */ }
    },
    get enabled() { return enabled; },
    get mood() { return mood; },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopTimer();
      if (suspendTimer !== null) { clearTimeout(suspendTimer); suspendTimer = null; }
      try { if (listening) document.removeEventListener('visibilitychange', onVisibility); } catch { /* ignore */ }
      listening = false;
      try { if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => { /* ignore */ }); } catch { /* ignore */ }
      ctx = null; master = null; buses = null; noise = null; playing = null; barData = null;
      barCache.clear();
    },
  };
}
