// Town (kingdom) screen: storage + DOM. Rules live in kingdom.ts.
import { STAGE_COUNT } from './stages.ts';
import { SPOTS, type TownView } from './townScene.ts';
import {
  canUpgrade, collect, createKingdom, latestStage, level, stageUnlocked, maxLevel, parseKingdom, pending, PERK_EFFECT, rate, serializeKingdom, storageFull,
  upgrade, upgradeCost, type Kingdom, type Upgrade,
} from './kingdom.ts';

const KEY = 'arcana-rush:kingdom:v1';

export function loadKingdom(now = Date.now()): Kingdom {
  try { return parseKingdom(localStorage.getItem(KEY), now); } catch { return createKingdom(now); }
}
export function saveKingdom(k: Kingdom): boolean {
  try { localStorage.setItem(KEY, serializeKingdom(k)); return true; } catch { return false; }
}

// Icons are lettered badges (no emoji font dependency on devices or headless browsers).
type Row = { id: Upgrade; name: string; badge: string; tone: string; label: string; value: (k: Kingdom) => string };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const ROWS: Row[] = [
  { id: 'castle', name: '성', badge: '성', tone: 'castle', label: '건물·강화 최대', value: k => `Lv ${k.castle}` },
  { id: 'farm', name: '농장', badge: '농', tone: 'food', label: '식량 분당', value: k => String(rate(k).food) },
  { id: 'mill', name: '제재소', badge: '목', tone: 'wood', label: '목재 분당', value: k => String(rate(k).wood) },
  { id: 'attack', name: '영웅 공격', badge: '공', tone: 'attack', label: '화살·필살기', value: k => `+${pct(PERK_EFFECT.attack * k.perks.attack)}` },
  { id: 'towerDiscount', name: '탑 설계도', badge: '탑', tone: 'tower', label: '탑 비용', value: k => `−${pct(PERK_EFFECT.towerDiscount * k.perks.towerDiscount)}` },
  { id: 'townHp', name: '성벽 보강', badge: '벽', tone: 'wall', label: '마을 체력', value: k => `+${pct(PERK_EFFECT.townHp * k.perks.townHp)}` },
];
/** The same kingdom one level higher in `u` (for the "now → next" preview only). */
function bumped(k: Kingdom, u: Upgrade): Kingdom {
  if (u === 'castle' || u === 'farm' || u === 'mill') return { ...k, [u]: k[u] + 1 };
  return { ...k, perks: { ...k.perks, [u]: k.perks[u] + 1 } };
}

export class TownScreen {
  private kingdom: Kingdom;
  private timer = 0;
  /** Stage the battle button will start (defaults to the furthest unlocked stage). */
  stage = 1;
  /** Building whose upgrade card is shown (picked by tapping its name tag in the 3D town). */
  selected: Upgrade = 'castle';
  private $ = (id: string) => document.getElementById(id)!;

  constructor(private root: HTMLElement, private view: TownView) {
    this.kingdom = loadKingdom();
    const tags = this.$('town-tags');
    tags.innerHTML = SPOTS.map(p => {
      const row = ROWS.find(r => r.id === p.id)!;
      return `<button class="town-tag" data-select="${p.id}" aria-label="${row.name}"><b>${row.name}</b><em data-tag-level></em><i class="up" aria-hidden="true">▲</i></button>`;
    }).join('');
    tags.addEventListener('click', e => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-select]')?.dataset.select as Upgrade | undefined;
      if (id) { this.selected = id; this.render(); }
    });
    const list = this.$('town-list');
    list.innerHTML = ROWS.map(r => `
      <li class="town-row" data-id="${r.id}">
        <span class="town-icon tone-${r.tone}" aria-hidden="true">${r.badge}</span>
        <div class="town-info"><b>${r.name} <em data-level></em></b><small data-effect></small></div>
        <button class="town-up" data-up="${r.id}" aria-label="${r.name} 강화"><span data-cost></span></button>
      </li>`).join('');
    list.addEventListener('click', e => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-up]')?.dataset.up as Upgrade | undefined;
      if (!id) return;
      const before = this.kingdom;
      this.kingdom = upgrade(before, id, Date.now());
      saveKingdom(this.kingdom);
      if (level(this.kingdom, id) > level(before, id)) {
        this.view.bump(id);
        const row = list.querySelector<HTMLElement>(`[data-id="${id}"]`);
        row?.classList.remove('bump'); void row?.offsetWidth; row?.classList.add('bump');
      }
      this.render();
    });
    const strip = this.$('stage-strip');
    strip.innerHTML = Array.from({ length: STAGE_COUNT }, (_, i) =>
      `<button class="stage-chip" role="radio" data-stage="${i + 1}"><b>${i + 1}</b><span data-stars></span></button>`).join('');
    strip.addEventListener('click', e => {
      const n = Number((e.target as HTMLElement).closest<HTMLElement>('[data-stage]')?.dataset.stage);
      if (n && stageUnlocked(this.kingdom, n)) { this.stage = n; this.render(); }
    });
    this.$('btn-collect').addEventListener('click', () => {
      this.kingdom = collect(this.kingdom, Date.now());
      saveKingdom(this.kingdom);
      this.render();
    });
  }

  get current(): Kingdom { return this.kingdom; }
  /** Pin the name tags over their buildings (call every frame while the town is shown). */
  layout(rect: { width: number; height: number }) {
    for (const p of SPOTS) {
      const tag = this.root.querySelector<HTMLElement>(`[data-select="${p.id}"]`);
      if (!tag) continue;
      const at = this.view.labelAt(p.id, rect);
      tag.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -100%)`;
    }
  }
  /** Replace the kingdom (e.g. after a battle reward) and persist it. */
  set(k: Kingdom) { this.kingdom = k; saveKingdom(k); this.render(); }
  reload() { this.kingdom = loadKingdom(); }

  show(rewardText = '') {
    this.reload();
    this.stage = latestStage(this.kingdom);
    const note = this.$('town-reward');
    note.textContent = rewardText;
    note.hidden = !rewardText;
    this.render();
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => { if (!this.root.hidden) this.render(); else window.clearInterval(this.timer); }, 1000);
  }

  render() {
    const k = this.kingdom, now = Date.now(), wait = pending(k, now);
    if (!stageUnlocked(k, this.stage)) this.stage = latestStage(k);
    this.root.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(chip => {
      const n = Number(chip.dataset.stage), open = stageUnlocked(k, n), stars = k.stars[n - 1];
      chip.disabled = !open;
      chip.setAttribute('aria-checked', String(n === this.stage));
      chip.setAttribute('aria-label', open ? `스테이지 ${n}, 별 ${stars}개` : `스테이지 ${n}, 잠김`);
      chip.querySelector('[data-stars]')!.textContent = open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '잠김';
    });
    this.$('btn-battle').textContent = `스테이지 ${this.stage} 출전`;
    this.view.sync(k);
    for (const r of ROWS) {
      const tag = this.root.querySelector<HTMLElement>(`[data-select="${r.id}"]`)!;
      tag.querySelector('[data-tag-level]')!.textContent = `Lv ${level(k, r.id)}`;
      tag.classList.toggle('can', canUpgrade(k, r.id));
      tag.classList.toggle('on', r.id === this.selected);
      this.root.querySelector<HTMLElement>(`[data-id="${r.id}"]`)!.classList.toggle('selected', r.id === this.selected);
    }
    this.$('res-food').textContent = String(k.food);
    this.$('res-wood').textContent = String(k.wood);
    const collectBtn = this.$('btn-collect') as HTMLButtonElement;
    collectBtn.disabled = wait.food + wait.wood === 0;
    this.$('collect-amount').textContent = wait.food + wait.wood === 0 ? '생산 중…' : `식량 +${wait.food} · 목재 +${wait.wood}${storageFull(k, now) ? ' (창고 가득)' : ''}`;
    for (const r of ROWS) {
      const row = this.root.querySelector<HTMLElement>(`[data-id="${r.id}"]`)!;
      const cost = upgradeCost(k, r.id), btn = row.querySelector<HTMLButtonElement>('[data-up]')!;
      row.querySelector('[data-level]')!.textContent = `Lv ${level(k, r.id)}/${maxLevel(k, r.id)}`;
      row.querySelector('[data-effect]')!.textContent = `${r.label} ${r.value(k)}${cost ? ` → ${r.value(bumped(k, r.id))}` : ''}`;
      btn.disabled = !cost || !canUpgrade(k, r.id);
      btn.querySelector('[data-cost]')!.innerHTML = cost
        ? `<i class="res-ico food"></i>${cost.food} <i class="res-ico wood"></i>${cost.wood}`
        : r.id === 'castle' ? '최대' : '성 Lv 필요';
      btn.classList.toggle('capped', !cost);
    }
  }
}
