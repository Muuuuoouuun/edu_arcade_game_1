// Arcana Rush prototype bootstrap: fixed-step loop, HUD, screens, sound and the debug handle used by browser checks.
import './rush.css';
import { ECONOMY, HERO, TOWER_LEVELS } from './data.ts';
import { createRush, padCost, padInReach, stepRush, superReady, WAVE_COUNT, type RushEvent, type RushState } from './sim.ts';
import { guardBot } from './bot.ts';
import { RushView } from './render.ts';
import { RushInput } from './input.ts';
import { playCombatSound, unlockAudio, type CombatSoundKind } from '../lib/sound.ts';
import { playHaptic } from '../lib/haptic.ts';
import { collect, kingdomMods, settleBattle } from './kingdom.ts';
import { stageDifficulty } from './stages.ts';
import { advanceClock, createClock, hitStopFor, tryStop } from './clock.ts';
import { loadKingdom, saveKingdom, TownScreen } from './town.ts';
import { TownView } from './townScene.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const speed = Math.min(8, Math.max(0.25, Number(params.get('speed')) || 1));
const debug = params.has('debug');
/** ?freeze=N stops the simulation at tick N (rendering continues) for matched before/after screenshots. */
const freezeAt = Number(params.get('freeze')) || Infinity;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = $<HTMLCanvasElement>('rush-canvas');
const surface = $('rush');
const view = new RushView(canvas);
let state: RushState = createRush(Number(params.get('seed')) || 1);
let mode: 'title' | 'town' | 'play' | 'demo' | 'result' = 'title';
let paused = false;
/** Id of the battle in progress; a battle's kingdom reward is granted once per id. */
let battleId = '';
let stage = 1;
const townView = new TownView();
const town = new TownScreen($('screen-town'), townView);
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
  const where = mode === 'demo' ? '시연' : `스테이지 ${stage}`;
  setText('waveSub', hud.waveSub, s.phase === 'prep' ? `${where} · 준비 ${Math.ceil(s.prepT)}초` : s.phase === 'wave' ? `${where} · 남은 적 ${s.enemies.length}` : where);
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
function showScreen(id: 'title' | 'town' | 'result' | 'pause' | null) {
  for (const s of ['title', 'town', 'result', 'pause']) $(`screen-${s}`).hidden = s !== id;
  surface.classList.toggle('in-menu', id !== null);
  surface.classList.toggle('in-town', id === 'town');
}
function openTown(rewardText = '') {
  mode = 'town';
  paused = false;
  input.enabled = false;
  showScreen('town');
  town.show(rewardText);
}
function start(nextMode: 'play' | 'demo') {
  unlockAudio();
  const seed = Number(params.get('seed')) || (Math.floor(Math.random() * 1e9) | 1);
  // Permanent kingdom upgrades shape real battles; the demo always shows the base game.
  stage = nextMode === 'play' ? town.stage : 1;
  state = createRush(seed, nextMode === 'play' ? kingdomMods(loadKingdom()) : undefined, stageDifficulty(stage));
  battleId = `${Date.now().toString(36)}-${seed}`;
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
  $('result-title').textContent = won ? `스테이지 ${stage} 방어 성공!` : `스테이지 ${stage} 마을 함락`;
  $('screen-result').classList.toggle('won', won);
  const { kingdom, granted, reward } = settleBattle(collect(loadKingdom(), Date.now()), battleId, s, stage);
  $('result-stars').innerHTML = won
    ? `<span class="stars">${'<i class="on">★</i>'.repeat(reward.stars)}${'<i>★</i>'.repeat(3 - reward.stars)}</span>${reward.newStars ? `<small>새 별 +${reward.newStars}${reward.newStars === reward.stars && stage < 10 ? ` · 스테이지 ${stage + 1} 열림` : ''}</small>` : ''}`
    : '<small>남은 마을 체력에 따라 별 1~3개를 얻어요</small>';
  const saved = granted && saveKingdom(kingdom);
  const rewardEl = $('result-reward');
  rewardEl.hidden = !granted;
  rewardEl.innerHTML = `<i class="res-ico food"></i>식량 +${reward.food} <i class="res-ico wood"></i>목재 +${reward.wood}${saved ? '' : ' <small>(저장 실패: 이 기기에서 저장 공간을 쓸 수 없음)</small>'}`;
  lastReward = granted ? `방금 전투 보상: 식량 +${reward.food} · 목재 +${reward.wood}` : '';
  const accuracy = s.stats.shots ? Math.round((s.stats.hits / (s.stats.shots * HERO.bolts)) * 100) : 0;
  const towers = s.towers.filter(Boolean).map(t => `Lv${t!.level + 1}`).join(' · ') || '없음';
  $('result-stats').innerHTML = [
    ['도달 웨이브', `${s.wave + 1}/${WAVE_COUNT}`], ['전투 시간', `${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}`],
    ['처치', `${s.stats.kills}`], ['명중률', `${accuracy}%`], ['필살기', `${s.stats.supers}회`], ['마을 체력', `${Math.ceil(s.town.hp)}`],
    ['획득 골드', `${s.stats.goldEarned}G`], ['궁수탑', towers],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  window.setTimeout(() => showScreen('result'), 700);
}
let lastReward = '';
$('btn-play').addEventListener('click', () => { unlockAudio(); openTown(); });
$('btn-demo').addEventListener('click', () => start('demo'));
$('btn-battle').addEventListener('click', () => start('play'));
$('btn-again').addEventListener('click', () => start('play'));
$('btn-town').addEventListener('click', () => { openTown(lastReward); lastReward = ''; });
$('btn-town-title').addEventListener('click', () => { mode = 'title'; showScreen('title'); });
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
  townView.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
}
new ResizeObserver(resize).observe(surface);
resize();

let prev = performance.now(), fpsFrames = 0, fpsT = 0, fps = 0, hitStops = 0;
let clock = createClock(prev / 1000);
function frame(now: number) {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  const running = (mode === 'play' && !paused) || mode === 'demo';
  const seconds = now / 1000;
  if (running) {
    const r = advanceClock(clock, seconds, speed);
    clock = r.clock;
    for (let i = 0; i < Math.min(r.steps, 40) && state.tick < freezeAt; i++) {
      const cmd = mode === 'demo' ? guardBot(state) : input.command();
      stepRush(state, cmd);
      feedback(state.events);
      // A big moment freezes the world for a beat; the rest of this frame's steps are dropped, not replayed.
      const next = tryStop(clock, seconds, state.tick, hitStopFor(state.events), reducedMotion ? 0 : 1);
      if (next !== clock) { clock = next; hitStops++; break; }
    }
  } else clock = { ...clock, acc: 0, last: seconds };
  const stopped = running && seconds < clock.stopUntil;
  input.refreshAim();
  // Rendering keeps real time (camera settles, effects fade); during a hit-stop the world pose holds still.
  view.fxPaused = state.tick >= freezeAt;
  view.sync(state, running ? dt : 0, mode === 'play' ? input.aim : null, stopped);
  if (mode === 'town') {
    // The kingdom has its own island scene; the battle scene is not drawn behind it.
    townView.update(dt);
    view.renderer.render(townView.scene, townView.camera);
    town.layout(canvas.getBoundingClientRect());
  } else view.render();
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
Object.assign(window, { __rush: { get state() { return state; }, get mode() { return mode; }, get fps() { return fps; }, get frozen() { return state.tick >= freezeAt; }, get hitStops() { return hitStops; }, get stopUntil() { return clock.stopUntil; }, get kingdom() { return town.current; }, info: () => view.info(), towerLevels: TOWER_LEVELS.length } });
