#!/usr/bin/env node
// Objective audio check for Arcana Rush (completion C4), no listener needed. Every AudioContext the page creates gets a
// tap: its `destination` getter returns a GainNode that feeds the real destination and an AudioWorklet recorder
// (peak and mean square per 128-frame block, timed by the audio clock). Contexts are tagged by the creating module
// (music.ts = music, sound.ts = sfx). The script drives the real game (title, town, battle with shots, injected boss,
// settings music off / sfx off, both back on) and reports levels (dBFS), music tempo (autocorrelation of an onset
// envelope), music-vs-SFX margin and the mood timeline.
// Usage: start the Vite dev server first (repo root): npx vite --port 3140 --strictPort   (the SFX catalogue imports
//        /src/lib/sound.ts, so a dev server, not a build), then: node tools/rush-audio-check.cjs [out.json]
// Exit code 1 when a check fails. Software rendering slows the game simulation (few shots); audio runs on its own clock.
const { writeFileSync } = require('node:fs');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:3140/rush.html';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
const DESIGN = { title: 104, town: 100, battle: 128, boss: 128 };

function tapInit() {
  const Orig = window.AudioContext, realDest = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'destination').get;
  const src = `registerProcessor('tap', class extends AudioWorkletProcessor {
    constructor() { super(); this.b = []; this.f0 = 0; }
    process(inputs) {
      const ch = inputs[0] || []; let pk = 0, ss = 0, n = 0;
      for (const c of ch) { for (let i = 0; i < c.length; i++) { const v = c[i], a = v < 0 ? -v : v; if (a > pk) pk = a; ss += v * v; } n += c.length; }
      if (!this.b.length) this.f0 = currentFrame;
      this.b.push(pk, n ? ss / n : 0);
      if (this.b.length >= 128) { this.port.postMessage({ f0: this.f0, b: this.b }); this.b = []; }
      return true;
    }
  });`;
  const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
  window.__audio = []; window.__marks = []; window.__moods = [];
  class Tapped extends Orig {
    constructor(...a) {
      super(...a);
      const stack = new Error().stack || '';
      const rec = { tag: /music\.ts/.test(stack) ? 'music' : /sound\.ts/.test(stack) ? 'sfx' : 'other', sr: this.sampleRate, chunks: [], ctx: this };
      window.__audio.push(rec);
      const tap = this.createGain(), real = realDest.call(this);
      tap.connect(real);
      Object.defineProperty(this, 'destination', { get: () => tap });
      this.audioWorklet.addModule(url).then(() => {
        const node = new AudioWorkletNode(this, 'tap', { numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit' });
        node.port.onmessage = e => rec.chunks.push(e.data);
        tap.connect(node); node.connect(real);
      }).catch(e => { rec.err = String(e); });
    }
  }
  window.AudioContext = Tapped;
  const now = () => window.__audio.map(r => [r.tag, r.ctx.currentTime, r.ctx.state]);
  window.__mark = name => window.__marks.push({ name, t: now(), shots: window.__rush?.state.stats.shots });
  let last = '';
  setInterval(() => {
    const m = window.__rush?.music; if (!m) return;
    const key = `${m.mood}/${m.enabled ? 'on' : 'off'}`;
    if (key !== last) { last = key; window.__moods.push({ key, ms: Math.round(performance.now()), t: now() }); }
  }, 50);
}

const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const fmt = x => (Number.isFinite(x) ? x.toFixed(1) : '-inf');
const blocks = (rec, t0, t1) => rec.f.flatMap((f, i) => (f / rec.sr >= t0 && f / rec.sr < t1 ? [i] : []));
function levels(rec, t0, t1) {
  const ix = blocks(rec, t0, t1); let pk = 0, ss = 0;
  for (const i of ix) { pk = Math.max(pk, rec.pk[i]); ss += rec.ms[i]; }
  // SFX events: runs of active blocks (peak > 1e-4) split by >= 20 ms of silence; per-event peak.
  const ev = []; let cur = 0, quiet = 99;
  for (const i of ix) {
    if (rec.pk[i] > 1e-4) { cur = Math.max(cur, rec.pk[i]); quiet = 0; }
    else if (++quiet * 128 / rec.sr >= 0.02 && cur) { ev.push(cur); cur = 0; }
  }
  if (cur) ev.push(cur);
  ev.sort((a, b) => a - b);
  return { n: ix.length, seconds: ix.length * 128 / rec.sr, peak: pk, rms: ix.length ? Math.sqrt(ss / ix.length) : 0, events: ev.length, evMedian: ev[ev.length >> 1] || 0 };
}
/** Tempo: 4-block RMS frames -> positive-difference onset envelope -> autocorrelation. Each candidate beat period P
 * in 0.3-0.8 s (75-200 BPM) scores the mean ACF at P, 2P, ... 8P (a comb); on windows >= 6 s this keeps the battle
 * score's dotted (3-eighth) kick/bass figure, 85.3 BPM, from beating the 128 BPM beat (it can on shorter windows). */
function tempo(rec, t0, t1) {
  const ix = blocks(rec, t0, t1), env = [], hop = 512 / rec.sr;
  for (let j = 0; j + 4 <= ix.length; j += 4) env.push(Math.sqrt((rec.ms[ix[j]] + rec.ms[ix[j + 1]] + rec.ms[ix[j + 2]] + rec.ms[ix[j + 3]]) / 4));
  const on = env.map((v, j) => (j ? Math.max(0, v - env[j - 1]) : 0));
  const mean = on.reduce((a, b) => a + b, 0) / (on.length || 1), o = on.map(v => v - mean), N = o.length;
  if (N < 200) return { bpm: NaN, conf: 0 };
  const acf = L => { const a = Math.floor(L), f = L - a; let s0 = 0, s1 = 0; for (let j = 0; j + a + 1 < N; j++) { s0 += o[j] * o[j + a]; s1 += o[j] * o[j + a + 1]; } return (s0 * (1 - f) + s1 * f) / (N - a); };
  let best = { bpm: NaN, sc: -Infinity };
  for (let bpm = 75; bpm <= 200; bpm += 0.1) {
    const P = 60 / bpm / hop; let s = 0, n = 0;
    for (let k = 1; k <= 8 && k * P < N * 0.75; k++) { s += acf(k * P); n++; }
    if (s / n > best.sc) best = { bpm, sc: s / n };
  }
  return { bpm: best.bpm, conf: best.sc / (acf(0) || 1) };
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(tapInit);
  await page.addInitScript(() => localStorage.setItem('arcana-rush:settings:v1', JSON.stringify({ sfx: true, music: true, haptics: true })));
  const mark = name => page.evaluate(n => window.__mark(n), name);
  const wait = ms => page.waitForTimeout(ms);
  const shoot = async ms => { const end = Date.now() + ms; while (Date.now() < end) { await page.keyboard.press('KeyF'); await wait(200); } };
  const phase = async (name, ms, fn) => { await mark(name); await (fn ? fn(ms) : wait(ms)); await mark(name + ':end'); };

  await page.goto(BASE);
  await page.waitForFunction(() => window.__rush);
  await wait(800);
  await page.click('.title-logo h1'); // first gesture: music.unlock()
  await phase('title', 7000);
  await page.click('#btn-play');
  await phase('town', 7000);
  await page.click('#btn-battle');
  await wait(300);
  await page.keyboard.press('Enter'); // start the first wave so shots can hit
  await phase('battle', 9000, shoot);
  // A living boss in front of the hero (shots hit it, so impact sounds join the arrows).
  await page.evaluate(() => { const h = __rush.state.hero; __rush.state.enemies.push({ id: 90001, kind: 'boss', x: h.x, z: h.z - 7, kx: 0, kz: 0, hp: 1e6, maxHp: 1e6, lane: 0, wp: 1, cd: 99, flash: 0, chasing: false, facing: 0, windup: null }); });
  await phase('boss', 7000, shoot);
  // Settings: music off on the title, then sfx off and a battle with shots, then both back on from the pause menu.
  await page.keyboard.press('Escape'); await wait(200); await page.click('#btn-quit'); await wait(1500);
  await page.click('#btn-settings');
  await page.click('#set-music');
  await phase('musicOff', 3000);
  await page.click('#set-sfx'); await page.click('#set-close');
  await page.click('#btn-play'); await wait(500); await page.click('#btn-battle'); await wait(300);
  await phase('sfxOff', 5000, shoot);
  await page.keyboard.press('Escape'); await wait(200); await page.click('#btn-pause-settings');
  await page.click('#set-music'); await page.click('#set-sfx'); await page.click('#set-close'); await page.click('#btn-resume');
  await phase('backOn', 8000, shoot);
  // SFX catalogue on the quiet title: every combat sound once, through the game's own sound.ts instance.
  await page.keyboard.press('Escape'); await wait(200); await page.click('#btn-quit'); await wait(1000);
  const catalog = await page.evaluate(async () => {
    const m = await import('/src/lib/sound.ts'), rec = __audio.find(r => r.tag === 'sfx'), out = [];
    for (const kind of ['arrow', 'impact', 'slash', 'cast', 'freeze', 'cannon', 'breach', 'surge', 'skill']) {
      out.push([kind, rec.ctx.currentTime]); m.playCombatSound(kind); await new Promise(r => setTimeout(r, 700));
    }
    return out;
  });

  const dump = await page.evaluate(() => ({
    recs: __audio.map(r => {
      const f = [], pk = [], ms = [];
      for (const c of r.chunks) for (let i = 0; i < c.b.length; i += 2) { f.push(c.f0 + (i / 2) * 128); pk.push(c.b[i]); ms.push(c.b[i + 1]); }
      return { tag: r.tag, sr: r.sr, err: r.err, state: r.ctx.state, f, pk, ms };
    }),
    marks: __marks, moods: __moods,
  }));
  await browser.close();

  const recs = dump.recs, music = recs.find(r => r.tag === 'music'), sfx = recs.find(r => r.tag === 'sfx');
  const at = (name, rec) => { const m = dump.marks.find(x => x.name === name); const e = m && m.t.find(x => x[0] === rec.tag); return e ? e[1] : NaN; };
  const span = (name, rec, skip = 1) => [at(name, rec) + skip, at(name + ':end', rec)];
  const results = { contexts: recs.map(r => `${r.tag}@${r.sr}Hz ${r.state}${r.err ? ' ERR ' + r.err : ''} (${r.f.length} blocks)`), moods: [], errors };
  const fails = [];
  const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) fails.push(label); };
  if (!music || !sfx) { console.log('missing context', results.contexts); process.exit(1); }
  console.log('contexts:', results.contexts.join(' | '));
  const t0 = dump.moods[0] ? dump.moods[0].ms : 0;
  console.log('mood timeline:', dump.moods.map(m => `${((m.ms - t0) / 1000).toFixed(1)}s ${m.key}`).join(' -> '));
  results.moods = dump.moods.map(m => m.key);
  const shots = n => dump.marks.find(m => m.name === n + ':end').shots - dump.marks.find(m => m.name === n).shots;
  results.shots = Object.fromEntries(['battle', 'boss', 'sfxOff', 'backOn'].map(n => [n, shots(n)]));
  console.log('hero shots per phase:', JSON.stringify(results.shots));

  console.log('\nphase     | music peak dBFS | music RMS dBFS | BPM (design) conf | SFX peak dBFS | SFX events, median peak dBFS | SFX median - music RMS dB');
  results.phases = {};
  for (const name of ['title', 'town', 'battle', 'boss', 'backOn']) {
    const m = levels(music, ...span(name, music)), s = levels(sfx, ...span(name, sfx, 0.3)), tp = tempo(music, ...span(name, music));
    const design = DESIGN[name] ?? 128, margin = db(s.evMedian) - db(m.rms);
    results.phases[name] = { music: { peak: db(m.peak), rms: db(m.rms), seconds: m.seconds }, bpm: tp.bpm, conf: tp.conf, sfx: { peak: db(s.peak), events: s.events, median: db(s.evMedian) }, margin };
    console.log(`${name.padEnd(9)} | ${fmt(db(m.peak)).padStart(15)} | ${fmt(db(m.rms)).padStart(14)} | ${tp.bpm.toFixed(1).padStart(6)} (${design}) ${tp.conf.toFixed(2)} | ${fmt(db(s.peak)).padStart(13)} | ${String(s.events).padStart(3)}, ${fmt(db(s.evMedian)).padStart(6)} | ${s.events ? fmt(margin) : 'n/a'}`);
  }
  const P = results.phases;
  // Music off: what the music context sends after the 0.3 s fade (it is suspended at 0.7 s, so later blocks are absent).
  const off = levels(music, at('musicOff', music) + 0.35, at('sfxOff:end', music) + 1e-3);
  const fade = levels(music, at('musicOff', music) - 1, at('musicOff', music));
  const sfxOff = levels(sfx, ...span('sfxOff', sfx, 0));
  results.musicOff = { before: db(fade.rms), afterPeak: db(off.peak), afterBlocks: off.n, state: dump.marks.find(m => m.name === 'musicOff:end').t.find(x => x[0] === 'music')[2] };
  results.sfxOff = { peak: db(sfxOff.peak), blocks: sfxOff.n };
  console.log(`\nmusic off: RMS before ${fmt(results.musicOff.before)} dBFS; after fade peak ${fmt(results.musicOff.afterPeak)} dBFS over ${off.n} blocks; context ${results.musicOff.state}`);
  console.log(`sfx off battle: SFX peak ${fmt(results.sfxOff.peak)} dBFS over ${sfxOff.n} blocks (${sfxOff.seconds.toFixed(1)} s of running context)`);
  const allMusic = levels(music, 0, 1e9), allSfx = levels(sfx, 0, 1e9);
  console.log(`whole run: music peak ${fmt(db(allMusic.peak))} dBFS, SFX peak ${fmt(db(allSfx.peak))} dBFS, worst-case sum ${fmt(db(allMusic.peak + allSfx.peak))} dBFS`);
  const ref = Math.max(P.battle.music.rms, P.boss.music.rms);
  results.catalog = catalog.map(([kind, t]) => { const l = levels(sfx, t, t + 0.65); return { kind, peak: db(l.peak), overMusicRms: db(l.peak) - ref }; });
  console.log(`SFX catalogue (peak dBFS, dB over loudest combat music RMS ${fmt(ref)}): ${results.catalog.map(c => `${c.kind} ${fmt(c.peak)} (${c.overMusicRms >= 0 ? '+' : ''}${fmt(c.overMusicRms)})`).join(', ')}`);
  const need = 6 - Math.min(...results.catalog.map(c => c.overMusicRms));
  if (need > 0) console.log(`music would need ${fmt(need)} dB less gain (x${Math.pow(10, -need / 20).toFixed(2)}) for every SFX peak to clear its RMS by 6 dB`);
  console.log(`page errors: ${errors.join(' | ') || 'none'}\n`);

  check(['title', 'town', 'battle', 'boss'].every(n => P[n].music.rms > -60 && P[n].music.seconds > 3), '(1) music sounds in title, town, battle, boss');
  check(['title', 'town', 'battle', 'boss'].every(n => Math.abs(P[n].bpm - DESIGN[n]) <= 2), '(2) tempo within 2 BPM of design per mood');
  check(allMusic.peak + allSfx.peak < 0.9, '(3a) no clipping (music + SFX worst-case peak < 0.9)');
  const quiet = results.catalog.filter(c => !(c.overMusicRms >= 6)).map(c => c.kind);
  check(['battle', 'boss'].every(n => P[n].sfx.events > 0) && !quiet.length, `(3b) every SFX peak >= 6 dB above combat music RMS${quiet.length ? ` (short: ${quiet.join(', ')})` : ''}`);
  check(fade.n > 0 && off.peak < 1e-3 && results.sfxOff.peak < -90 && sfxOff.n > 0 && results.shots.sfxOff > 0, '(4) music off silences music, sfx off silences SFX');
  const order = ['title/on', 'town/on', 'battle/on', 'boss/on'].map(k => results.moods.indexOf(k));
  check(order.every((v, i) => v >= 0 && (!i || v > order[i - 1])), '(5) mood switches title -> town -> battle -> boss');
  check(errors.length === 0 && recs.every(r => !r.err), 'no page or recorder errors');
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
