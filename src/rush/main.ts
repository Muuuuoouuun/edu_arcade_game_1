// Arcana Rush bootstrap: fixed-step loop, HUD, screens, sound and the debug handle used by browser checks.
import './rush.css';
import { ECONOMY, ENEMIES, HEROES, TOWER_LEVELS, type HeroKind } from './data.ts';
import { createRush, padCost, padInReach, stepRush, superReady, wardBreakBurst, WAVE_COUNT, type LapTwist, type RushEvent, type RushState } from './sim.ts';
import { guardBot } from './bot.ts';
import { RushView } from './render.ts';
import { RushInput } from './input.ts';
import { playCombatSound, setSound, unlockAudio, type CombatSoundKind } from '../lib/sound.ts';
import { readSaved } from '../lib/storage.ts';
import { playHaptic } from '../lib/haptic.ts';
import { NATIVE_BACKGROUND } from '../lib/nativeEvents.ts';
import { collect, ENDLESS_STAGE, kingdomMods, settleBattle, settleEndless } from './kingdom.ts';
import { stageDifficulty, STAGE_COUNT } from './stages.ts';
import { createMusic } from './music.ts';
import { parseSettings, RUSH_KINGDOM_KEY, RUSH_SETTINGS_KEY, serializeSettings, type RushSettings } from './storage.ts';
import { advanceClock, createClock, hitStopFor, tryStop } from './clock.ts';
import { COMPANION_FACE, keeperNote, loadKingdom, saveKingdom, today, TownScreen } from './town.ts';
import { COMPANIONS, expeditionStage, firstClearNews, importLegacyCampaign, LEGACY_CAMPAIGN_KEY, LEGACY_IMPORT_KEY } from './expedition.ts';
import { TownView } from './townScene.ts';
import { addHit, POP_LIFE, popKey, type PopSlot } from './pops.ts';
import { createFrameWatch, nextPref, parsePref, PREF_LABEL, resolveQuality, watchFrame, type QualityPref } from './quality.ts';
import { mapFor } from './maps.ts';
import { CRATE } from './data.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
// Rush's own settings (1.0, completion C3): effects, music, vibration. The first run follows the arcade mode screen's
// sound choice; after that the rush settings screen owns them.
const settingsFallback = (): RushSettings => ({ sfx: readSaved().sound, music: true, haptics: true });
let settings: RushSettings = (() => { try { return parseSettings(localStorage.getItem(RUSH_SETTINGS_KEY), settingsFallback()); } catch { return settingsFallback(); } })();
let feedbackEnabled = settings.haptics;
setSound(settings.sfx);
// Procedural music (completion C4, src/rush/music.ts): starts on the first gesture, follows the screen each frame.
const music = createMusic();
music.setEnabled(settings.music);
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => music.unlock(), { passive: true });
function applySettings() {
  feedbackEnabled = settings.haptics;
  setSound(settings.sfx);
  music.setEnabled(settings.music);
}
window.addEventListener('storage', event => {
  if (event.key !== RUSH_SETTINGS_KEY) return;
  settings = parseSettings(event.newValue, settings);
  applySettings();
});
const speed = Math.min(8, Math.max(0.25, Number(params.get('speed')) || 1));
const debug = params.has('debug');
/** ?freeze=N stops the simulation at tick N (rendering continues) for matched before/after screenshots. */
const freezeAt = Number(params.get('freeze')) || Infinity;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Graphics quality (cycle 12): saved preference, or ?quality=high|low to pin one run for matched captures. */
const QUALITY_KEY = 'arcana-rush:quality:v1';
const BRANCH_NAME = { fire: '화염', frost: '냉기' } as const;
const pinnedQuality = params.get('quality') === 'high' || params.get('quality') === 'low' ? params.get('quality') as QualityPref : null;
let qualityPref: QualityPref = pinnedQuality ?? (() => { try { return parsePref(localStorage.getItem(QUALITY_KEY)); } catch { return 'auto'; } })();
const frameWatch = createFrameWatch();

const canvas = $<HTMLCanvasElement>('rush-canvas');
const surface = $('rush');
function showRendererFailure(lost:boolean) {
  $('rush-render-error-detail').textContent = lost
    ? '그래픽 연결이 끊겨 전투를 멈췄어요. 다시 시도하면 현재 전투가 종료되며 저장되지 않은 진행이 사라질 수 있어요.'
    : '그래픽 기능을 사용할 수 없어 러시를 시작하지 못했어요. 다른 전투 모드는 시작 화면에서 선택할 수 있어요.';
  surface.inert = true;
  const dialog=$('rush-render-error');dialog.hidden=false;dialog.focus();
}
$('rush-render-retry').addEventListener('click',()=>location.reload());
$('rush-render-error').addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const first=$('rush-render-retry'),last=$<HTMLAnchorElement>('rush-render-back'),active=document.activeElement;
  if(event.shiftKey&&(active===first||active===$('rush-render-error'))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
});
const candidateView = (() => { try { return new RushView(canvas); } catch { showRendererFailure(false); return null; } })();
if (candidateView) {
const view: RushView = candidateView;
view.setQuality(resolveQuality(qualityPref, false));
let state: RushState = createRush(Number(params.get('seed')) || 1);
let mode: 'title' | 'town' | 'play' | 'demo' | 'result' = 'title';
let paused = false;
/** Id of the battle in progress; a battle's kingdom reward is granted once per id. */
let battleId = '';
let stage = 1;
const townView = new TownView();
const town = new TownScreen($('screen-town'), townView);
// One front door (2026-11-13 merge): a returning 원정 player brings their villages, gold and training along, once.
// The old save is only read, never changed; the marker is set once the import is saved (or there was nothing to bring).
let legacyNote = '';
try {
  if (!localStorage.getItem(LEGACY_IMPORT_KEY)) {
    const got = importLegacyCampaign(loadKingdom(), localStorage.getItem(LEGACY_CAMPAIGN_KEY));
    const saved = got ? saveKingdom(got.kingdom) : true;
    if (got && saved) {
      const r = got.report;
      legacyNote = `원정 기록을 가져왔어요: 마을 ${r.villages}곳 · 식량 +${r.food} · 목재 +${r.wood}${r.shards ? ` · 조각 +${r.shards}` : ''}`;
    }
    if (saved) localStorage.setItem(LEGACY_IMPORT_KEY, String(Date.now()));
  }
} catch { /* storage blocked: try again next visit */ }
const input = new RushInput({
  surface: $('rush-surface'), stick: $('stick'), knob: $('stick-knob'),
  fire: $('fire'), superBtn: $('super'), build: $('build'), buildFrost: $('build-frost'), startWave: $('start-wave'),
}, (x, y) => view.groundPoint(x, y, canvas.getBoundingClientRect()), () => state.hero);
let rendererLost=false;
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();rendererLost=true;paused=true;input.enabled=false;input.reset();showRendererFailure(true);
});
const portrait = matchMedia('(orientation: portrait)');
const orientationGate = $('orientation-gate');
function updateOrientation() {
  const blocked = portrait.matches && (mode === 'play' || mode === 'demo');
  orientationGate.hidden = !blocked;
  if (blocked) {
    paused = true;
    input.enabled = false;
    input.reset();
    showScreen('pause');
    orientationGate.focus();
  }
}
portrait.addEventListener('change', updateOrientation);
orientationGate.addEventListener('keydown', e => {
  if (e.key === 'Tab' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); orientationGate.focus(); }
});

// ---------- floating numbers ----------
const fxLayer = $('rush-fx');
type Pop = PopSlot<HTMLSpanElement> & { y: number; jitter: number; bumpAge: number };
let pops: Pop[] = [];
function popEl(text: string, cls: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = `pop ${cls}`;
  el.textContent = text;
  fxLayer.append(el);
  return el;
}
function trimPops() { while (pops.length > 40) { pops[0].view?.remove(); pops.shift(); } }
/** A floating label that never merges (hero hurt, coins). */
function pop(text: string, x: number, z: number, cls: string, y = 1.6) {
  pops.push({ key: '', value: 0, x, z, age: 0, life: POP_LIFE, bumps: 0, lift: 0, view: popEl(text, cls), y, jitter: (Math.random() - 0.5) * 0.4, bumpAge: 0 });
  trimPops();
}
/** Damage on an enemy (cycle 22): one number per enemy and attacker kind that adds up over a short window. */
function hitPop(owner: string, id: number | undefined, damage: number, x: number, z: number) {
  const { slot, merged } = addHit(pops as PopSlot<HTMLSpanElement>[], popKey(owner, id), damage, x, z);
  const p = slot as Pop;
  if (merged) { p.view!.textContent = String(Math.round(p.value)); p.bumpAge = 0; return; }
  p.view = popEl(String(Math.round(damage)), owner === 'super' ? 'big' : owner === 'tower' ? 'tower' : '');
  p.y = 1.6; p.jitter = (Math.random() - 0.5) * 0.4; p.bumpAge = 0;
  trimPops();
}
// Boss arrival (cycle 67): while a boss that just walked in is off screen, a red chevron on the screen edge points at
// it for a few seconds; no text (the battle HUD and toasts are hidden since #107). Gone once the boss is on screen.
const BOSS_EDGE_TIME = 2.5;
const bossEdge = Object.assign(document.createElement('span'), { className: 'boss-edge', hidden: true });
bossEdge.setAttribute('aria-hidden', 'true');
fxLayer.append(bossEdge);
let bossEdgeFor: { id: number; left: number } | null = null;
function updateBossEdge(dt: number) {
  if (!bossEdgeFor) return;
  bossEdgeFor.left -= dt;
  const boss = state.enemies.find(e => e.id === bossEdgeFor!.id && e.hp > 0);
  const sp = boss && view.screenPoint(boss.x, 1, boss.z, canvasRect);
  const rect = canvasRect, onScreen = sp && sp.x >= 0 && sp.x <= rect.width && sp.y >= 0 && sp.y <= rect.height;
  if (!boss || !sp || onScreen || bossEdgeFor.left <= 0) {
    setFlag('bossEdgeHidden', bossEdge, 'hidden', true);
    if (!boss || onScreen || bossEdgeFor.left <= 0) bossEdgeFor = null;
    return;
  }
  // Clamp the direction from the screen centre to the edge, inset so the chevron stays whole.
  const cx = rect.width / 2, cy = rect.height / 2, dx = sp.x - cx, dy = sp.y - cy, inset = 34;
  const k = Math.min((cx - inset) / Math.max(1e-6, Math.abs(dx)), (cy - inset) / Math.max(1e-6, Math.abs(dy)));
  setFlag('bossEdgeHidden', bossEdge, 'hidden', false);
  bossEdge.style.transform = `translate(${Math.round(cx + dx * k)}px, ${Math.round(cy + dy * k)}px) translate(-50%, -50%) rotate(${Math.atan2(dy, dx)}rad)`;
}

function updatePops(dt: number) {
  const rect = canvasRect;
  pops = pops.filter(p => {
    p.age += dt; p.bumpAge += dt;
    if (p.age >= p.life) { p.view?.remove(); return false; }
    const sp = view.screenPoint(p.x + p.jitter, p.y + p.lift + p.age * 1.4, p.z, rect);
    // Pop-in on appear, and a smaller kick each time more damage is added.
    const kick = Math.max(Math.max(0, 0.25 - p.age) * 2, Math.max(0, 0.15 - p.bumpAge) * 2.2);
    p.view!.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -50%) scale(${1 + kick})`;
    p.view!.style.opacity = String(1 - Math.max(0, p.age / p.life - 0.6) / 0.4);
    return true;
  });
}

// Boss rally warning (cycle 35): a callout pinned just under the roaring boss (its camera side), so the warning reads
// where the eye already is and never covers the boss it warns about. Off screen, the toast strip says it instead.
// One callout per roaring boss (cycle 53: twin-boss laps can have two roaring at once).
const callouts = new Map<number, HTMLSpanElement>();
/** Pin a callout on the boss that just roared (the roaring boss nearest the event); false = off screen, use the toast. */
function bossCallout(at: { x: number; z: number }): boolean {
  let boss: (typeof state.enemies)[number] | null = null, best = Infinity;
  for (const e of state.enemies) {
    if (e.kind !== 'boss' || !((e.roarT ?? 0) > 0)) continue;
    const d = Math.hypot(e.x - at.x, e.z - at.z);
    if (d < best) { best = d; boss = e; }
  }
  if (!boss || !view.screenPoint(boss.x, 1, boss.z, canvasRect).visible) return false;
  if (!callouts.has(boss.id)) callouts.set(boss.id, popEl('부하를 부른다!', 'callout'));
  updateCallout();
  return true;
}
function updateCallout() {
  for (const [id, el] of callouts) {
    const boss = state.enemies.find(e => e.id === id);
    if (!boss || boss.hp <= 0 || !((boss.roarT ?? 0) > 0)) { el.remove(); callouts.delete(id); continue; }
    const sp = view.screenPoint(boss.x, 0, boss.z + ENEMIES.boss.radius + 0.4, canvasRect);
    el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, 0)`;
  }
}

// ---------- events → feedback ----------
// A melee swing sounds like an impact rather than a bowstring.
const SOUND: Partial<Record<RushEvent['type'], CombatSoundKind>> = {
  bossEnter: 'cannon', fire: 'arrow', swing: 'slash', burst: 'skill', slam: 'cannon', roar: 'surge', lap: 'surge', summon: 'cast', townHit: 'breach', heroDown: 'breach', build: 'cast', waveStart: 'surge', superReady: 'freeze',
};
/** Endless lap twists (cycle 52), as the player reads them. */
const TWIST_NAME: Record<LapTwist, string> = { swift: '빠른 걸음', shields: '방패 행렬', twin: '쌍둥이 보스' };
let toastTimer = 0;
function toast(text: string, cls = '', seconds = 1.6) {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast show ${cls}`;
  toastTimer = seconds;
}
function feedback(events: RushEvent[]) {
  view.applyEvents(events, reducedMotion);
  // Ward breaks (cycle 91): a glassy crack instead of the plain hit thud; a buzz only when one swing clears several.
  const wards = wardBreakBurst(events);
  if (wards) { playCombatSound('freeze'); if (wards.count >= 2) playHaptic('skill', feedbackEnabled); }
  for (const ev of events) {
    const sound = SOUND[ev.type];
    if (sound) playCombatSound(sound);
    if (ev.type === 'hit') { if (ev.owner !== 'tower') playCombatSound('impact'); hitPop(ev.owner, ev.id, ev.damage, ev.x, ev.z); }
    // Shaman heal (cycle 60): a green number over each ally it restored, beside the ring the renderer draws.
    else if (ev.type === 'healed') pop(`+${Math.round(ev.amount)}`, ev.x, ev.z, 'heal', 2.1);
    else if (ev.type === 'block') { playCombatSound('cannon'); pop('막힘', ev.x, ev.z, 'blocked', 2.1); } // a heavier clank than a flesh hit
    else if (ev.type === 'heroHit') pop(String(Math.round(ev.damage)), state.hero.x, state.hero.z, 'hurt', 2.2);
    else if (ev.type === 'coin') pop(`+${ev.value}`, state.hero.x, state.hero.z, 'gold', 2.4);
    else if (ev.type === 'burst') playHaptic('skill', feedbackEnabled);
    else if (ev.type === 'heroDown') { playHaptic('breach', feedbackEnabled); toast(`쓰러졌다! ${HEROES[state.hero.kind].respawn}초 뒤 마을에서 복귀`, 'bad'); }
    else if (ev.type === 'superReady') toast('필살기 준비 완료!', 'super');
    else if (ev.type === 'roar') { playHaptic('surge', feedbackEnabled); if (!bossCallout(ev)) toast('보스가 부하를 부른다!', 'bad'); }
    else if (ev.type === 'bossEnter') { playHaptic('breach', feedbackEnabled); bossEdgeFor = { id: ev.id, left: BOSS_EDGE_TIME }; }
    else if (ev.type === 'waveStart') {
      playHaptic('surge', feedbackEnabled);
      const boss = ev.wave % WAVE_COUNT === WAVE_COUNT - 1;
      toast(boss ? (state.diff.endless ? `웨이브 ${ev.wave + 1} · 보스 출현!` : `마지막 웨이브 · 보스 출현!`) : `웨이브 ${ev.wave + 1} 시작`, boss ? 'bad' : '');
    }
    else if (ev.type === 'waveClear') {
      // Cycle 79: the toast (and every floating number) is hidden since #107, so the held wave also sounds bright
      // and buzzes lightly; the renderer adds a gold ring and sparks around the town.
      toast(`웨이브 ${ev.wave + 1} 방어 성공 · +${ev.bonus}G`, 'good');
      playCombatSound('skill'); playHaptic('cast', feedbackEnabled);
    }
    else if (ev.type === 'lap') {
      // Endless lap (cycle 47): comes right after the fifth wave's clear, so this toast replaces that one.
      playHaptic('surge', feedbackEnabled);
      toast(`${ev.lap}바퀴째 · ${ev.twist ? `${TWIST_NAME[ev.twist]}!` : '적이 강해졌다!'}`, 'bad', 2.6);
      const box = hud.wave.parentElement!;
      box.classList.remove('lap-flash'); void box.offsetWidth; box.classList.add('lap-flash');
    }
    else if (ev.type === 'build') toast(ev.level === 0 ? '궁수탑 건설!' : `${ev.branch ? BRANCH_NAME[ev.branch] : '궁수'}탑 Lv${ev.level + 1}`, 'good');
    else if (ev.type === 'won' || ev.type === 'lost') showResult();
  }
}

// ---------- HUD ----------
const hud = {
  wave: $('wave-label'), waveSub: $('wave-sub'), townFill: $('town-fill'), townHp: $('town-hp'), gold: $('gold'),
  startWave: $<HTMLButtonElement>('start-wave'), build: $<HTMLButtonElement>('build'), buildFrost: $<HTMLButtonElement>('build-frost'), fire: $('fire'), superBtn: $('super'),
  ammo: [...document.querySelectorAll<HTMLElement>('#fire .ammo i')], superRing: $('super-ring'), debug: $('debug'),
};
const last: Record<string, string> = {};
const setText = (key: string, el: HTMLElement, text: string) => { if (last[key] !== text) { el.textContent = text; last[key] = text; } };
/** Inline style and flags are written only when they change (cycle 36): an unchanged write still costs a style pass. */
const setStyle = (key: string, el: HTMLElement, prop: string, value: string) => { if (last[key] !== value) { el.style.setProperty(prop, value); last[key] = value; } };
const setFlag = (key: string, el: HTMLButtonElement | HTMLElement, flag: 'hidden' | 'disabled', on: boolean) => {
  const v = on ? '1' : '0';
  if (last[key] !== v) { (el as HTMLButtonElement)[flag] = on; last[key] = v; }
};
// ---------- see-through HUD (cycle 23) ----------
// Enemies enter at the top of the screen, right where the HUD sits: a HUD box with an enemy under it fades.
const hudParts = [...document.querySelectorAll<HTMLElement>('.hud-top > button')];
const noFade = params.has('nofade'); // matched captures of the old behaviour
// ---------- layout reads (cycle 36) ----------
// DOM geometry is read at the start of a frame, before anything is written (no forced layout), and only every
// READ_EVERY frames or after a resize: the canvas and the HUD boxes rarely move, and a fade a few frames late is fine.
const READ_EVERY = 12;
let canvasRect = canvas.getBoundingClientRect(), hudBoxes: DOMRect[] = [], readAge = READ_EVERY, layoutStale = true;
function readLayout(fight: boolean) {
  // Entering a battle (HUD boxes still empty or measured while hidden) reads at once.
  const unmeasured = fight && (hudBoxes.length !== hudParts.length || hudBoxes.some(b => b.width === 0));
  if (!layoutStale && !unmeasured && ++readAge < READ_EVERY) return;
  readAge = 0; layoutStale = false;
  canvasRect = canvas.getBoundingClientRect();
  hudBoxes = fight ? hudParts.map(el => el.getBoundingClientRect()) : [];
}
/** Screen points (page CSS px) of each live enemy's body and head. */
function enemyScreen(rect: DOMRect = canvas.getBoundingClientRect()): { id: number; pts: { x: number; y: number }[] }[] {
  return state.enemies.filter(e => e.hp > 0).map(e => {
    const r = ENEMIES[e.kind].radius;
    return { id: e.id, pts: [r * 1.2, e.kind === 'boss' ? r * 3.6 : r * 2.6].map(h => { const p = view.screenPoint(e.x, h, e.z, rect); return { x: p.x + rect.left, y: p.y + rect.top }; }) };
  });
}
function seeThroughHud() {
  const fight = (mode === 'play' || mode === 'demo') && !noFade && hudBoxes.length === hudParts.length;
  const boxes = hudBoxes;
  const under = hudParts.map(() => false);
  if (fight) for (const e of enemyScreen(canvasRect)) for (const p of e.pts) boxes.forEach((b, i) => {
    if (p.x > b.left - 8 && p.x < b.right + 8 && p.y > b.top - 8 && p.y < b.bottom + 12) under[i] = true;
  });
  hudParts.forEach((el, i) => el.classList.toggle('see-through', under[i]));
}

function updateHud() {
  const s = state;
  setText('wave', hud.wave, s.diff.endless ? `웨이브 ${s.wave + 1}` : `웨이브 ${Math.min(s.wave + 1, WAVE_COUNT)}/${WAVE_COUNT}`);
  const lap = Math.floor(s.wave / WAVE_COUNT) + 1;
  const where = mode === 'demo' ? '시연' : s.diff.endless ? `끝없는 도전${lap > 1 ? ` ${lap}바퀴` : ''}${s.diff.twist ? ` · ${TWIST_NAME[s.diff.twist]}` : ''}` : expeditionStage(stage).label;
  setText('waveSub', hud.waveSub, s.phase === 'prep' ? `${where} · 준비 ${Math.ceil(s.prepT)}초` : s.phase === 'wave' ? `${where} · 남은 적 ${s.enemies.length}` : where);
  setStyle('townFill', hud.townFill, 'transform', `scaleX(${s.town.hp / s.town.maxHp})`);
  setText('townHp', hud.townHp, String(Math.ceil(s.town.hp)));
  setText('gold', hud.gold, String(s.gold));
  const bonus = Math.floor(s.prepT) * ECONOMY.earlyBonusPerSecond;
  setFlag('startWaveHidden', hud.startWave, 'hidden', s.phase !== 'prep' || mode !== 'play');
  setText('startWave', hud.startWave, `웨이브 시작 +${bonus}G`);
  const pad = s.hero.downT > 0 ? -1 : padInReach(s);
  const cost = pad >= 0 ? padCost(s, pad) : null;
  const buildHidden = pad < 0 || mode !== 'play';
  setFlag('buildHidden', hud.build, 'hidden', buildHidden);
  // Lv1 → Lv2 is a choice (cycle 15): the build button splits into fire and frost.
  const tower = pad >= 0 ? s.towers[pad] : null, choose = !!tower && tower.level === 0 && cost !== null;
  setFlag('buildFrostHidden', hud.buildFrost, 'hidden', buildHidden || !choose);
  hud.build.classList.toggle('fire', choose);
  hud.build.classList.toggle('split-l', choose);
  if (pad >= 0) {
    const level = tower ? tower.level + 1 : 0, branch = tower?.branch ? BRANCH_NAME[tower.branch] : '';
    setText('build', hud.build, cost === null ? '최대 강화' : level === 0 ? `궁수탑 건설 ${cost}G` : choose ? `화염 Lv2 · ${cost}G` : `${branch} Lv${level + 1} · ${cost}G`);
    setFlag('buildDisabled', hud.build, 'disabled', cost === null || s.gold < cost);
    if (choose) { setText('buildFrost', hud.buildFrost, `냉기 Lv2 · ${cost}G`); setFlag('buildFrostDisabled', hud.buildFrost, 'disabled', s.gold < cost!); }
  }
  hud.ammo.forEach((el, i) => {
    const fill = s.hero.ammo > i ? 1 : s.hero.ammo === i ? s.hero.reloadT / HEROES[s.hero.kind].reload : 0;
    setStyle(`ammo${i}`, el, '--fill', fill.toFixed(3));
  });
  hud.fire.classList.toggle('empty', s.hero.ammo < 1);
  const charge = s.hero.superCharge / HEROES[s.hero.kind].superHits;
  setStyle('charge', hud.superRing, '--charge', charge.toFixed(3));
  hud.superBtn.classList.toggle('ready', superReady(s));
  surface.classList.toggle('hero-down', s.hero.downT > 0);
}

// ---------- screens ----------
function showScreen(id: 'title' | 'town' | 'result' | 'pause' | 'settings' | null) {
  if(rendererLost)return;
  for (const s of ['title', 'town', 'result', 'pause', 'settings']) $(`screen-${s}`).hidden = s !== id;
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
  if(rendererLost)return;
  unlockAudio();
  const seed = Number(params.get('seed')) || (Math.floor(Math.random() * 1e9) | 1);
  // Permanent kingdom upgrades shape real battles; the demo always shows the base game.
  stage = nextMode === 'play' ? town.stage : 1;
  const kingdom = loadKingdom();
  // Endless challenge (cycle 46): stage-10 difficulty, the five waves on a loop.
  // Endless keeps stage 10's numbers but reports its own stage, so endless-only groups (cycle 59: shamans) appear.
  const diff = stage === ENDLESS_STAGE ? { ...stageDifficulty(10), stage: ENDLESS_STAGE, endless: true } : stageDifficulty(stage);
  state = createRush(seed, nextMode === 'play' ? kingdomMods(kingdom) : undefined, diff, nextMode === 'play' ? kingdom.hero : 'ranger');
  battleId = `${Date.now().toString(36)}-${seed}`;
  mode = nextMode;
  paused = false;
  input.reset();
  input.enabled = nextMode === 'play';
  surface.classList.toggle('demo', nextMode === 'demo');
  town.closeMap();
  showScreen(null);
  toast(nextMode === 'demo' ? '자동 시연 · 화면을 누르면 타이틀로' : '노란 원 위에서 탑을 세우고 마을을 지키세요');
  updateOrientation();
}
function showResult() {
  const s = state, won = s.phase === 'won';
  if (mode === 'demo') { window.setTimeout(() => { if (mode === 'demo') start('demo'); }, 2500); return; }
  mode = 'result';
  input.enabled = false;
  if (s.diff.endless) { showEndlessResult(); return; }
  // Campaign ending (1.0, completion C6): read before settling, so only the very first stage-10 win shows it.
  const ending = won && stage === STAGE_COUNT && (loadKingdom().stars[STAGE_COUNT - 1] ?? 0) === 0;
  // Expedition (2026-11-13 merge): a first clear brings that village's companion; stage 5 closes the forest chapter.
  const firstClear = won && (loadKingdom().stars[stage - 1] ?? 0) === 0, news = firstClear ? firstClearNews(stage) : {};
  showVisitor(news.visitor);
  const chapter = ending ? undefined : news.chapter;
  $('result-chapter').hidden = !chapter;
  $('screen-result').classList.toggle('has-news', !!(news.visitor || chapter));
  if (chapter) { $('result-chapter').querySelector('[data-chapter-title]')!.textContent = chapter.title; $('result-chapter').querySelector('[data-chapter-text]')!.textContent = chapter.text; }
  $('result-title').textContent = ending ? '캠페인 완료!' : won ? `${expeditionStage(stage).name} 방어 성공!` : `${expeditionStage(stage).name} 함락`;
  $('screen-result').classList.toggle('won', won);
  $('screen-result').classList.toggle('ending', ending);
  $('result-ending').hidden = !ending;
  const { kingdom, granted, reward } = settleBattle(collect(loadKingdom(), Date.now()), battleId, s, stage, today());
  $('result-stars').innerHTML = won
    ? `<span class="stars">${'<i class="on">★</i>'.repeat(reward.stars)}${'<i>★</i>'.repeat(3 - reward.stars)}</span>${reward.newStars ? `<small>새 별 +${reward.newStars}${reward.newStars === reward.stars && stage < 10 ? ` · ${expeditionStage(stage + 1).label} ${expeditionStage(stage + 1).name} 열림` : ''}</small>` : ''}`
    : '<small>남은 마을 체력에 따라 별 1~3개를 얻어요</small>';
  const saved = granted && saveKingdom(kingdom);
  const rewardEl = $('result-reward');
  rewardEl.hidden = !granted;
  const shardText = reward.shards ? ` <i class="res-ico shard"></i>조각 +${reward.shards}` : '';
  const d = reward.daily, dailyText = d ? `<small class="daily-note">오늘의 첫 승리 보너스 포함: 식량 +${d.food} · 목재 +${d.wood} · 조각 +${d.shards}</small>` : '';
  rewardEl.innerHTML = `<i class="res-ico food"></i>식량 +${reward.food} <i class="res-ico wood"></i>목재 +${reward.wood}${shardText}${dailyText}${saved ? '' : ' <small>(저장되지 않아 이번 창에서만 유지돼요)</small>'}`;
  lastReward = granted ? `방금 전투 보상: 식량 +${reward.food} · 목재 +${reward.wood}${reward.shards ? ` · 영웅 조각 +${reward.shards}` : ''}${d ? ' (첫 승리 보너스 포함)' : ''}` : '';
  const accuracy = s.stats.shots ? Math.min(100, Math.round((s.stats.hits / (s.stats.shots * HEROES[s.hero.kind].bolts)) * 100)) : 0;
  const towers = s.towers.filter(Boolean).map(t => `Lv${t!.level + 1}`).join(' · ') || '없음';
  $('result-stats').innerHTML = [
    ['도달 웨이브', `${s.wave + 1}/${WAVE_COUNT}`], ['전투 시간', `${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}`],
    ['처치', `${s.stats.kills}`], ['명중률', `${accuracy}%`], ['필살기', `${s.stats.supers}회`], ['마을 체력', `${Math.ceil(s.town.hp)}`],
    ['획득 골드', `${s.stats.goldEarned}G`], ['궁수탑', towers],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  window.setTimeout(() => showScreen('result'), 700);
}
/** Endless challenge result (cycle 46): waves held, best record, rewards. */
function showEndlessResult() {
  const s = state, { kingdom, granted, reward } = settleEndless(collect(loadKingdom(), Date.now()), battleId, s);
  $('result-title').textContent = `끝없는 도전 · 웨이브 ${reward.waves}`;
  $('screen-result').classList.remove('won', 'ending');
  $('result-ending').hidden = true;
  showVisitor(undefined);
  $('result-chapter').hidden = true;
  $('screen-result').classList.remove('has-news');
  const passed = reward.milestones.map(m => `${m.waves}웨이브 돌파 <i class="res-ico shard"></i>+${m.shards}`).join(' · ');
  $('result-stars').innerHTML = (reward.newBest ? `<small class="best">새 최고 기록! ${reward.waves}웨이브</small>` : `<small>최고 기록 ${reward.best}웨이브</small>`)
    + (passed ? `<small class="milestone">기록 보상: ${passed}</small>` : '');
  const saved = granted && saveKingdom(kingdom), rewardEl = $('result-reward');
  rewardEl.hidden = !granted;
  rewardEl.innerHTML = `<i class="res-ico food"></i>식량 +${reward.food} <i class="res-ico wood"></i>목재 +${reward.wood}${reward.shards ? ` <i class="res-ico shard"></i>조각 +${reward.shards}` : ''}${saved ? '' : ' <small>(저장되지 않아 이번 창에서만 유지돼요)</small>'}`;
  lastReward = granted ? `끝없는 도전 ${reward.waves}웨이브: 식량 +${reward.food} · 목재 +${reward.wood}${reward.shards ? ` · 영웅 조각 +${reward.shards}` : ''}` : '';
  $('result-stats').innerHTML = [
    ['막아 낸 웨이브', `${reward.waves}`], ['전투 시간', `${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}`],
    ['처치', `${s.stats.kills}`], ['필살기', `${s.stats.supers}회`], ['획득 골드', `${s.stats.goldEarned}G`], ['최고 기록', `${reward.best}웨이브`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  window.setTimeout(() => showScreen('result'), 700);
}
/** The companion card on the result screen (none: hidden). */
function showVisitor(c: keyof typeof COMPANIONS | undefined) {
  const el = $('result-visitor');
  el.hidden = !c;
  if (!c) return;
  const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
  (q('[data-visitor-face]') as HTMLImageElement).src = COMPANION_FACE[c];
  q('[data-visitor-head]').textContent = `새 동료 합류 · ${COMPANIONS[c].role}`;
  q('[data-visitor-name]').textContent = COMPANIONS[c].name;
  q('[data-visitor-line]').textContent = `“${COMPANIONS[c].greeting}”`;
  q('[data-visitor-keeper]').textContent = c === 'bron' || c === 'popo' ? `출전 영웅으로 고를 수 있어요 · 마을의 ${keeperNote(c)}` : `마을의 ${keeperNote(c)}`;
}
let lastReward = '';
$('btn-play').addEventListener('click', () => { unlockAudio(); openTown(legacyNote); legacyNote = ''; });
$('map-battle').addEventListener('click', () => start('play'));
// The title buttons ship disabled so a tap before this script runs is not silently lost.
for (const id of ['btn-play', 'btn-demo']) ($(id) as HTMLButtonElement).disabled = false;
$('btn-demo').addEventListener('click', () => start('demo'));
$('btn-battle').addEventListener('click', () => start('play'));
$('btn-again').addEventListener('click', () => start('play'));
$('btn-town').addEventListener('click', () => { openTown(lastReward); lastReward = ''; });
$('btn-town-title').addEventListener('click', () => { mode = 'title'; showScreen('title'); });
$('pause').addEventListener('click', () => { if (mode === 'play') { paused = true; input.enabled = false; input.reset(); showScreen('pause'); } });
$('btn-resume').addEventListener('click', () => { if (portrait.matches || document.hidden) return; paused = false; input.enabled = mode === 'play'; input.reset(); showScreen(null); });
function qualityLabel() {
  const auto = qualityPref === 'auto' ? `(${PREF_LABEL[view.quality]})` : '';
  for (const id of ['btn-quality', 'btn-quality-2']) $(id).textContent = `그래픽: ${PREF_LABEL[qualityPref]}${auto}`;
}
function applyQuality() { view.setQuality(resolveQuality(qualityPref, frameWatch.dropped)); qualityLabel(); forceDraw = true; }
function cycleQuality() {
  qualityPref = nextPref(qualityPref);
  if (!pinnedQuality) try { localStorage.setItem(QUALITY_KEY, qualityPref); } catch { /* private mode: keep it for this session */ }
  applyQuality();
}
$('btn-quality').addEventListener('click', cycleQuality);
$('btn-quality-2').addEventListener('click', cycleQuality);
qualityLabel();
// Settings screen (1.0, completion C3): opened from the title or the pause card, returns where it came from.
let settingsBack: 'title' | 'pause' = 'title', resetArmedUntil = 0, resetTimer = 0;
function settingsLabels() {
  for (const [id, key, name] of [['set-sfx', 'sfx', '효과음'], ['set-music', 'music', '배경 음악'], ['set-haptics', 'haptics', '진동']] as const) {
    $(id).textContent = `${name}: ${settings[key] ? '켬' : '끔'}`;
    $(id).setAttribute('aria-pressed', String(settings[key]));
  }
}
function disarmReset() { resetArmedUntil = 0; window.clearTimeout(resetTimer); $('set-reset').classList.remove('armed'); $('set-reset').textContent = '진행 초기화'; }
function openSettings(from: 'title' | 'pause') { settingsBack = from; settingsLabels(); qualityLabel(); disarmReset(); showScreen('settings'); }
$('btn-settings').addEventListener('click', () => openSettings('title'));
// The standalone app (1.0, tools/rush-app) has no arcade to go back to: drop the mode-select link there.
if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) document.querySelector('.rush-back')?.remove();
$('btn-pause-settings').addEventListener('click', () => openSettings('pause'));
$('set-close').addEventListener('click', () => { disarmReset(); showScreen(settingsBack); });
for (const [id, key] of [['set-sfx', 'sfx'], ['set-music', 'music'], ['set-haptics', 'haptics']] as const) {
  $(id).addEventListener('click', () => {
    settings = { ...settings, [key]: !settings[key] };
    try { localStorage.setItem(RUSH_SETTINGS_KEY, serializeSettings(settings)); } catch { /* private mode: this session only */ }
    applySettings();
    settingsLabels();
  });
}
// Reset needs a second press within 4 s; it clears only the kingdom save (settings stay) and reloads.
$('set-reset').addEventListener('click', () => {
  if (Date.now() < resetArmedUntil) {
    try { localStorage.removeItem(RUSH_KINGDOM_KEY); } catch { /* nothing saved to clear */ }
    location.reload();
    return;
  }
  resetArmedUntil = Date.now() + 4000;
  $('set-reset').classList.add('armed');
  $('set-reset').textContent = '한 번 더 누르면 마을이 지워져요';
  resetTimer = window.setTimeout(disarmReset, 4000);
});
$('btn-quit').addEventListener('click', () => { paused = false; mode = 'title'; showScreen('title'); });
$('rush-surface').addEventListener('pointerdown', () => { if (mode === 'demo') { mode = 'title'; showScreen('title'); } });
function pauseForBackground() { if (mode === 'play') { paused = true; input.enabled = false; input.reset(); showScreen('pause'); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseForBackground(); });
window.addEventListener(NATIVE_BACKGROUND, pauseForBackground);
window.addEventListener('blur', pauseForBackground);
window.addEventListener('keydown', e => { if (e.code === 'Escape' && mode === 'town' && town.mapOpen) town.closeMap(); });
window.addEventListener('keydown', e => { if (!rendererLost && e.code === 'Escape' && mode === 'play' && !portrait.matches && !document.hidden) { paused = !paused; input.enabled = !paused; input.reset(); showScreen(paused ? 'pause' : null); } });

// ---------- loop ----------
// Menus (title, result, pause) sit over a still battlefield: redraw it every MENU_DRAW_EVERY frames (cycle 30).
// The first menu frame, a resize and a quality change (both clear the canvas) draw at once.
// The town island is just as still (cycle 87): the same rule, plus every frame while a building pop runs.
const MENU_DRAW_EVERY = 4;
let menuFrames = 0, townFrames = 0, forceDraw = true, drawnFrames = 0;
function resize() {
  forceDraw = true;
  layoutStale = true;
  const r = surface.getBoundingClientRect();
  view.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
  townView.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
}
new ResizeObserver(resize).observe(surface);
resize();

let prev = performance.now(), fpsFrames = 0, fpsT = 0, fps = 0, hitStops = 0;
const PRELOAD_AFTER = 0.5;
let townPick: HeroKind | null = null, townPickAt = 0;
let clock = createClock(prev / 1000);
function frame(now: number) {
  if(rendererLost)return;
  readLayout((mode === 'play' || mode === 'demo') && !noFade);
  const rawDt = (now - prev) / 1000;
  const dt = Math.min(0.1, rawDt);
  prev = now;
  const running = (mode === 'play' || mode === 'demo') && !paused;
  // Auto quality: a slow battle drops to low once per session; the player can override it in the pause menu.
  if (running && qualityPref === 'auto' && watchFrame(frameWatch, rawDt)) {
    applyQuality();
    if (mode === 'play') toast('그래픽을 낮춤으로 바꿨어요 · 일시정지에서 변경');
  }
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
  view.sync(state, running ? dt : 0, mode === 'play' ? input.aim : null, stopped, reducedMotion);
  // Music follows the screen; a living boss turns battle music to the boss mood (same tempo, so it stays in step).
  music.setMood(mode === 'town' ? 'town' : mode === 'play' || mode === 'demo' ? (state.enemies.some(e => e.kind === 'boss' && e.hp > 0) ? 'boss' : 'battle') : 'title');
  if (mode === 'town') {
    // The chosen hero's model downloads while the player is still in town (cycle 42), not at the start of the battle.
    // Only once the choice has held for PRELOAD_AFTER s: cycling past Bron must not start his 1.3 MB download.
    const pick = town.current.hero;
    if (pick !== townPick) { townPick = pick; townPickAt = seconds; }
    else if (seconds - townPickAt >= PRELOAD_AFTER) view.preloadHero(pick);
    // The kingdom has its own island scene; the battle scene is not drawn behind it.
    townView.update(dt);
    townFrames++;
    if (forceDraw || townView.animating || townFrames % MENU_DRAW_EVERY === 1) { view.renderer.render(townView.scene, townView.camera); drawnFrames++; forceDraw = false; }
    town.layout(canvasRect);
  } else {
    townFrames = 0;
    const menu = mode === 'title' || mode === 'result' || (mode === 'play' && paused);
    menuFrames = menu ? menuFrames + 1 : 0;
    if (!menu || forceDraw || menuFrames % MENU_DRAW_EVERY === 1) { view.render(); drawnFrames++; forceDraw = false; }
  }
  updatePops(dt);
  updateBossEdge(dt);
  updateCallout();
  updateHud();
  seeThroughHud();
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.remove('show');
  fpsFrames++; fpsT += dt;
  if (fpsT >= 0.5) { fps = Math.round(fpsFrames / fpsT); fpsFrames = 0; fpsT = 0; }
  if (debug) { const i = view.info(); hud.debug.textContent = `${fps}fps · draw ${i.calls} · tri ${i.triangles} · 적 ${i.enemies} · 탄 ${i.shots}`; }
  requestAnimationFrame(frame);
}
hud.debug.hidden = !debug;
requestAnimationFrame(frame);
showScreen('title');
if (params.has('sheet')) {
  // Model sheet (cycle 11): the enemies and the hero, front-facing, frozen on a flat background. ?hero=bron shows Bron.
  state = createRush(1, undefined, undefined, (['bron', 'bear'] as const).find(h => h === params.get('hero')) ?? 'ranger');
  state.crates = [];
  // ?back=1 turns the hero away from the camera, as in battle where it faces the enemies at the top.
  Object.assign(state.hero, { x: 9.4, z: 2, facing: params.has('back') ? -Math.PI / 2 : Math.PI / 2 });
  // The shaman (cycle 59) stands at the left end so the earlier sheet positions stay comparable.
  (['grunt', 'skirmisher', 'brute', 'shield', 'boss', 'shaman'] as const).forEach((kind, i) => state.enemies.push({
    id: 900 + i, kind, x: [-6.4, -4, -1.2, 1.4, 5, -8.8][i], z: 2, kx: 0, kz: 0, hp: 1, maxHp: 1, lane: 0, wp: 1, cd: 0, flash: 0, chasing: false, facing: Math.PI / 2, windup: null,
    // ?frost=1 shows the frost shell (cycle 16) on every enemy.
    ...(params.has('frost') ? { slowT: 99 } : {}),
  }));
  view.sheet();
  showScreen(null);
  surface.classList.add('sheet');
} else if (params.has('demo')) start('demo');
else if (params.has('play')) start('play');

// Read-only handle for automated browser checks.
Object.assign(window, { __rush: { get state() { return state; }, get mode() { return mode; }, get fps() { return fps; }, get frozen() { return state.tick >= freezeAt; }, get hitStops() { return hitStops; }, get stopUntil() { return clock.stopUntil; }, get kingdom() { return town.current; }, get quality() { return { pref: qualityPref, tier: view.quality, autoDropped: frameWatch.dropped }; }, get drawnFrames() { return drawnFrames; }, get music() { return { mood: music.mood, enabled: music.enabled }; }, info: () => view.info(), enemyScreen, towerLevels: TOWER_LEVELS.length } });
// Debug only (map checks): dress the running battle as another stage's layout, and an overhead camera on the whole arena.
Object.assign((window as unknown as { __rush: object }).__rush, {
  setStage(n: number) { const map = mapFor(n); state.diff.stage = n; state.map = map; state.crates = map.crates.map((c, i) => ({ id: 1 + i, x: c.x, z: c.z, hp: CRATE.hp, ...(c.gold ? { gold: c.gold } : {}) })); },
  overhead(on: boolean) { view.overhead = on; },
});
if (params.has('overhead')) view.overhead = true;
}
