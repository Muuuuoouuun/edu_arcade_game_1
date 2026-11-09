// Arcana Rush prototype bootstrap: fixed-step loop, HUD, screens, sound and the debug handle used by browser checks.
import './rush.css';
import { ECONOMY, HERO, STEP, TOWER_LEVELS } from './data.ts';
import { createRush, padCost, padInReach, stepRush, superReady, WAVE_COUNT, type RushEvent, type RushState } from './sim.ts';
import { guardBot } from './bot.ts';
import { RushView } from './render.ts';
import { RushInput } from './input.ts';
import { playCombatSound, unlockAudio, type CombatSoundKind } from '../lib/sound.ts';
import { playHaptic } from '../lib/haptic.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const speed = Math.min(8, Math.max(0.25, Number(params.get('speed')) || 1));
const debug = params.has('debug');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = $<HTMLCanvasElement>('rush-canvas');
const surface = $('rush');
const view = new RushView(canvas);
let state: RushState = createRush(Number(params.get('seed')) || 1);
let mode: 'title' | 'play' | 'demo' | 'result' = 'title';
let paused = false;
const input = new RushInput({
  surface: $('rush-surface'), stick: $('stick'), knob: $('stick-knob'),
  fire: $('fire'), superBtn: $('super'), build: $('build'), startWave: $('start-wave'),
}, (x, y) => view.groundPoint(x, y, canvas.getBoundingClientRect()), () => state.hero);

// ---------- floating numbers ----------
const fxLayer = $('rush-fx');
type Pop = { el: HTMLSpanElement; x: number; y: number; z: number; age: number; life: number };
let pops: Pop[] = [];
function pop(text: string, x: number, z: number, cls: string, y = 1.6) {
  if (pops.length > 40) { pops[0].el.remove(); pops.shift(); }
  const el = document.createElement('span');
  el.className = `pop ${cls}`;
  el.textContent = text;
  fxLayer.append(el);
  pops.push({ el, x: x + (Math.random() - 0.5) * 0.4, y, z, age: 0, life: 0.75 });
}
function updatePops(dt: number) {
  const rect = canvas.getBoundingClientRect();
  pops = pops.filter(p => {
    p.age += dt;
    if (p.age >= p.life) { p.el.remove(); return false; }
    const sp = view.screenPoint(p.x, p.y + p.age * 1.4, p.z, rect);
    p.el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.25 - p.age) * 2})`;
    p.el.style.opacity = String(1 - Math.max(0, p.age / p.life - 0.6) / 0.4);
    return true;
  });
}

// ---------- events → feedback ----------
const SOUND: Partial<Record<RushEvent['type'], CombatSoundKind>> = {
  fire: 'arrow', burst: 'skill', slam: 'cannon', townHit: 'breach', heroDown: 'breach', build: 'cast', waveStart: 'surge', superReady: 'freeze',
};
let toastTimer = 0;
function toast(text: string, cls = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast show ${cls}`;
  toastTimer = 1.6;
}
function feedback(events: RushEvent[]) {
  view.applyEvents(events, reducedMotion);
  for (const ev of events) {
    const sound = SOUND[ev.type];
    if (sound) playCombatSound(sound);
    if (ev.type === 'hit') { if (ev.owner !== 'tower') playCombatSound('impact'); pop(String(Math.round(ev.damage)), ev.x, ev.z, ev.owner === 'super' ? 'big' : ev.owner === 'tower' ? 'tower' : ''); }
    else if (ev.type === 'heroHit') pop(String(Math.round(ev.damage)), state.hero.x, state.hero.z, 'hurt', 2.2);
    else if (ev.type === 'coin') pop(`+${ev.value}`, state.hero.x, state.hero.z, 'gold', 2.4);
    else if (ev.type === 'burst') playHaptic('skill', true);
    else if (ev.type === 'heroDown') { playHaptic('breach', true); toast(`쓰러졌다! ${HERO.respawn}초 뒤 마을에서 복귀`, 'bad'); }
    else if (ev.type === 'superReady') toast('필살기 준비 완료!', 'super');
    else if (ev.type === 'waveStart') { playHaptic('surge', true); toast(ev.wave === WAVE_COUNT - 1 ? `마지막 웨이브 · 보스 출현!` : `웨이브 ${ev.wave + 1} 시작`, ev.wave === WAVE_COUNT - 1 ? 'bad' : ''); }
    else if (ev.type === 'waveClear') toast(`웨이브 ${ev.wave + 1} 방어 성공 · +${ev.bonus}G`, 'good');
    else if (ev.type === 'build') toast(ev.level === 0 ? '궁수탑 건설!' : `궁수탑 Lv${ev.level + 1}`, 'good');
    else if (ev.type === 'won' || ev.type === 'lost') showResult();
  }
}

// ---------- HUD ----------
const hud = {
  wave: $('wave-label'), waveSub: $('wave-sub'), townFill: $('town-fill'), townHp: $('town-hp'), gold: $('gold'),
  startWave: $<HTMLButtonElement>('start-wave'), build: $<HTMLButtonElement>('build'), fire: $('fire'), superBtn: $('super'),
  ammo: [...document.querySelectorAll<HTMLElement>('#fire .ammo i')], superRing: $('super-ring'), debug: $('debug'),
};
const last: Record<string, string> = {};
const setText = (key: string, el: HTMLElement, text: string) => { if (last[key] !== text) { el.textContent = text; last[key] = text; } };
function updateHud() {
  const s = state;
  setText('wave', hud.wave, `웨이브 ${Math.min(s.wave + 1, WAVE_COUNT)}/${WAVE_COUNT}`);
  setText('waveSub', hud.waveSub, s.phase === 'prep' ? `준비 ${Math.ceil(s.prepT)}초` : s.phase === 'wave' ? `남은 적 ${s.enemies.length}` : '');
  hud.townFill.style.transform = `scaleX(${s.town.hp / s.town.maxHp})`;
  setText('townHp', hud.townHp, String(Math.ceil(s.town.hp)));
  setText('gold', hud.gold, String(s.gold));
  const bonus = Math.floor(s.prepT) * ECONOMY.earlyBonusPerSecond;
  hud.startWave.hidden = s.phase !== 'prep' || mode !== 'play';
  setText('startWave', hud.startWave, `웨이브 시작 +${bonus}G`);
  const pad = s.hero.downT > 0 ? -1 : padInReach(s);
  const cost = pad >= 0 ? padCost(s, pad) : null;
  hud.build.hidden = pad < 0 || mode !== 'play';
  if (pad >= 0) {
    const level = s.towers[pad] ? s.towers[pad]!.level + 1 : 0;
    setText('build', hud.build, cost === null ? '최대 강화' : level === 0 ? `궁수탑 건설 ${cost}G` : `강화 Lv${level + 1} · ${cost}G`);
    hud.build.disabled = cost === null || s.gold < cost;
  }
  hud.ammo.forEach((el, i) => {
    const fill = s.hero.ammo > i ? 1 : s.hero.ammo === i ? s.hero.reloadT / HERO.reload : 0;
    el.style.setProperty('--fill', String(fill));
  });
  hud.fire.classList.toggle('empty', s.hero.ammo < 1);
  const charge = s.hero.superCharge / HERO.superHits;
  hud.superRing.style.setProperty('--charge', String(charge));
  hud.superBtn.classList.toggle('ready', superReady(s));
  surface.classList.toggle('hero-down', s.hero.downT > 0);
}

// ---------- screens ----------
function showScreen(id: 'title' | 'result' | 'pause' | null) {
  for (const s of ['title', 'result', 'pause']) $(`screen-${s}`).hidden = s !== id;
  surface.classList.toggle('in-menu', id !== null);
}
function start(nextMode: 'play' | 'demo') {
  unlockAudio();
  state = createRush(Number(params.get('seed')) || (Math.floor(Math.random() * 1e9) | 1));
  mode = nextMode;
  paused = false;
  input.reset();
  input.enabled = nextMode === 'play';
  surface.classList.toggle('demo', nextMode === 'demo');
  showScreen(null);
  toast(nextMode === 'demo' ? '자동 시연 · 화면을 누르면 타이틀로' : '노란 원 위에서 탑을 세우고 마을을 지키세요');
}
function showResult() {
  const s = state, won = s.phase === 'won';
  if (mode === 'demo') { window.setTimeout(() => { if (mode === 'demo') start('demo'); }, 2500); return; }
  mode = 'result';
  input.enabled = false;
  $('result-title').textContent = won ? '마을을 지켰다!' : '마을이 함락됐다';
  $('screen-result').classList.toggle('won', won);
  const accuracy = s.stats.shots ? Math.round((s.stats.hits / (s.stats.shots * HERO.bolts)) * 100) : 0;
  const towers = s.towers.filter(Boolean).map(t => `Lv${t!.level + 1}`).join(' · ') || '없음';
  $('result-stats').innerHTML = [
    ['도달 웨이브', `${s.wave + 1}/${WAVE_COUNT}`], ['전투 시간', `${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}`],
    ['처치', `${s.stats.kills}`], ['명중률', `${accuracy}%`], ['필살기', `${s.stats.supers}회`], ['마을 체력', `${Math.ceil(s.town.hp)}`],
    ['획득 골드', `${s.stats.goldEarned}G`], ['궁수탑', towers],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  window.setTimeout(() => showScreen('result'), 700);
}
$('btn-play').addEventListener('click', () => start('play'));
$('btn-demo').addEventListener('click', () => start('demo'));
$('btn-again').addEventListener('click', () => start('play'));
$('btn-title').addEventListener('click', () => { mode = 'title'; showScreen('title'); });
$('pause').addEventListener('click', () => { if (mode === 'play') { paused = true; showScreen('pause'); } });
$('btn-resume').addEventListener('click', () => { paused = false; showScreen(null); });
$('btn-quit').addEventListener('click', () => { paused = false; mode = 'title'; showScreen('title'); });
$('rush-surface').addEventListener('pointerdown', () => { if (mode === 'demo') { mode = 'title'; showScreen('title'); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') { paused = true; showScreen('pause'); } });
window.addEventListener('keydown', e => { if (e.code === 'Escape' && mode === 'play') { paused = !paused; showScreen(paused ? 'pause' : null); } });

// ---------- loop ----------
function resize() {
  const r = surface.getBoundingClientRect();
  view.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
}
new ResizeObserver(resize).observe(surface);
resize();

let prev = performance.now(), acc = 0, fpsFrames = 0, fpsT = 0, fps = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  const running = (mode === 'play' && !paused) || mode === 'demo';
  if (running) {
    acc += dt * speed;
    let guard = 0;
    while (acc >= STEP && guard++ < 40) {
      const cmd = mode === 'demo' ? guardBot(state) : input.command();
      stepRush(state, cmd);
      feedback(state.events);
      acc -= STEP;
    }
  } else acc = 0;
  input.refreshAim();
  view.sync(state, running ? dt : 0, mode === 'play' ? input.aim : null);
  view.render();
  updatePops(dt);
  updateHud();
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.remove('show');
  fpsFrames++; fpsT += dt;
  if (fpsT >= 0.5) { fps = Math.round(fpsFrames / fpsT); fpsFrames = 0; fpsT = 0; }
  if (debug) { const i = view.info(); hud.debug.textContent = `${fps}fps · draw ${i.calls} · tri ${i.triangles} · 적 ${i.enemies} · 탄 ${i.shots}`; }
  requestAnimationFrame(frame);
}
hud.debug.hidden = !debug;
requestAnimationFrame(frame);
showScreen('title');
if (params.has('demo')) start('demo');
else if (params.has('play')) start('play');

// Read-only handle for automated browser checks.
Object.assign(window, { __rush: { get state() { return state; }, get mode() { return mode; }, get fps() { return fps; }, info: () => view.info(), towerLevels: TOWER_LEVELS.length } });
