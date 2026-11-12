// Town (kingdom) screen: storage + DOM. Rules live in kingdom.ts.
import { STAGE_COUNT } from './stages.ts';
import { SPOTS, type TownView } from './townScene.ts';
import { FORGE, HEROES, TALENT_MAX, TALENTS, type HeroKind } from './data.ts';
import { claimGoal, currentGoal, GOALS,
  CASTLE_MAX, DAILY_WIN, ENDLESS_STAGE, nextMilestone, HERO_JOINS, VAULT_GOLD, HERO_LV_PER_CASTLE, canLearnTalent, canTrain, learnTalent, talentCost, dailyReady, dayIndex, canUpgrade, chooseHero, collect, heroGrowth, heroMaxLevel, heroUnlocked, latestStage, level, stageUnlocked, maxLevel, pending, PERK_EFFECT, rate,
  storageFull, train, trainCost, upgrade, upgradeCost, type Kingdom, type Upgrade,
} from './kingdom.ts';
import { createKingdomStore } from './storage.ts';

const store = createKingdomStore(() => localStorage);
export const { loadKingdom, saveKingdom, storageUnavailable } = store;
/** Today's local day number (the daily first-win bonus resets at local midnight). */
export const today = (now = Date.now()) => dayIndex(now, new Date(now).getTimezoneOffset());

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
  { id: 'forge', name: '대장간', badge: '철', tone: 'forge', label: '화염 범위·냉기 시간', value: k => `+${pct(FORGE.splashShare * k.perks.forge)}·+${(FORGE.slowTime * k.perks.forge).toFixed(2)}초` },
  { id: 'vault', name: '금고', badge: '금', tone: 'vault', label: '전투 시작 골드', value: k => `+${VAULT_GOLD * k.perks.vault}G` },
];
/** The same kingdom one level higher in `u` (for the "now → next" preview only). */
function bumped(k: Kingdom, u: Upgrade): Kingdom {
  if (u === 'castle' || u === 'farm' || u === 'mill') return { ...k, [u]: k[u] + 1 };
  return { ...k, perks: { ...k.perks, [u]: k.perks[u] + 1 } };
}

/** Town tag box size (CSS px, `.town-tag` in rush.css). */
const TAG_SIZE = 44;

/** Goal rewards (cycle 64): icons for the card, words for the note and screen readers. */
type Reward = { food?: number; wood?: number; shards?: number };
const rewardHtml = (r: Reward) => (['food', 'wood', 'shard'] as const).map(kind => { const n = kind === 'shard' ? r.shards : r[kind]; return n ? `<i class="res-ico ${kind}"></i>+${n}` : ''; }).join(' ');
const rewardText = (r: Reward) => [r.food ? `식량 +${r.food}` : '', r.wood ? `목재 +${r.wood}` : '', r.shards ? `조각 +${r.shards}` : ''].filter(Boolean).join(' · ');

export class TownScreen {
  private kingdom: Kingdom;
  private timer = 0;
  /** Stage the battle button will start (defaults to the furthest unlocked stage). */
  stage = 1;
  /** Card shown: a building (picked by tapping its name tag in the 3D town) or the hero (hero button). */
  selected: Upgrade | 'hero' = 'castle';
  private $ = (id: string) => document.getElementById(id)!;
  /** Bottom edge (page CSS px) of the top bar, re-measured only when the bar changes size (cycle 61). */
  private barBottom = 0;

  constructor(private root: HTMLElement, private view: TownView) {
    this.kingdom = loadKingdom();
    const bar = root.querySelector<HTMLElement>('.town-bar');
    if (bar && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { this.barBottom = bar.getBoundingClientRect().bottom; }).observe(bar);
    // Kingdom goal (cycle 64): a met goal glows; a tap pays its reward and shows the next one.
    this.$('town-goal').addEventListener('click', () => {
      const g = currentGoal(this.kingdom);
      if (!g?.done) return;
      this.kingdom = claimGoal(this.kingdom);
      saveKingdom(this.kingdom);
      this.render();
      this.note(`목표 달성! ${g.goal.text} · ${rewardText(g.goal.reward)}`);
    });
    const tags = this.$('town-tags');
    tags.innerHTML = SPOTS.map(p => {
      const row = ROWS.find(r => r.id === p.id)!;
      // Icon badge (cycle 17): the card below names the building, so the tag keeps only its icon, level and upgrade dot.
      return `<button class="town-tag tone-${row.tone}" data-select="${p.id}" aria-label="${row.name}"><span class="tag-ico" aria-hidden="true">${row.badge}</span><em data-tag-level></em><i class="up" aria-hidden="true">▲</i></button>`;
    }).join('') +
      // Endless record flag (cycle 57): best waves in the pill, the next milestone in the corner; a tap picks ∞.
      `<button class="town-tag tone-endless" data-endless hidden><span class="tag-ico" aria-hidden="true">∞</span><em data-tag-level></em><i class="goal" aria-hidden="true"></i></button>`;
    tags.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('[data-endless]')) {
        if (stageUnlocked(this.kingdom, ENDLESS_STAGE)) { this.stage = ENDLESS_STAGE; this.render(); }
        return;
      }
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-select]')?.dataset.select as Upgrade | undefined;
      if (id) { this.selected = id; this.render(); }
    });
    const list = this.$('town-list');
    list.innerHTML = ROWS.map(r => `
      <li class="town-row" data-id="${r.id}">
        <span class="town-icon tone-${r.tone}" aria-hidden="true">${r.badge}</span>
        <div class="town-info"><b>${r.name} <em data-level></em></b><small data-effect></small></div>
        <button class="town-up" data-up="${r.id}" aria-label="${r.name} 강화"><span data-cost></span></button>
      </li>`).join('') + `
      <li class="town-row" data-id="hero">
        <span class="town-icon tone-hero" aria-hidden="true">영</span>
        <div class="town-info"><b><span data-hero-name></span> <em data-level></em></b><small data-effect></small><small class="talent-line" data-talent-effect></small></div>
        <div class="hero-ups">
          <button class="town-up" data-train aria-label="영웅 훈련"><span data-cost></span></button>
          <button class="town-up talent" data-talent aria-label="영웅 특기"><span data-talent-cost></span></button>
        </div>
      </li>`;
    list.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('[data-talent]')) {
        // Hero talent (cycle 45): shards into the chosen hero's own stat.
        const before = this.kingdom, hero = before.hero;
        this.kingdom = learnTalent(before, hero);
        saveKingdom(this.kingdom);
        if (this.kingdom.talent[hero] > before.talent[hero]) {
          const row = list.querySelector<HTMLElement>('[data-id="hero"]');
          row?.classList.remove('bump'); void row?.offsetWidth; row?.classList.add('bump');
        }
        this.render();
        return;
      }
      if ((e.target as HTMLElement).closest('[data-train]')) {
        // Hero training (cycle 14): levels the hero taken into battle; the castle caps it.
        const before = this.kingdom, hero = before.hero;
        this.kingdom = train(before, hero, Date.now());
        saveKingdom(this.kingdom);
        if (this.kingdom.heroLv[hero] > before.heroLv[hero]) {
          const row = list.querySelector<HTMLElement>('[data-id="hero"]');
          row?.classList.remove('bump'); void row?.offsetWidth; row?.classList.add('bump');
        }
        this.render();
        return;
      }
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
      `<button class="stage-chip" role="radio" data-stage="${i + 1}"><b>${i + 1}</b><span data-stars></span></button>`).join('') +
      // Endless challenge (cycle 46): opens with a star on the last stage; shows the best record instead of stars.
      `<button class="stage-chip endless" role="radio" data-stage="${ENDLESS_STAGE}"><b>∞</b><span data-stars></span></button>`;
    strip.addEventListener('click', e => {
      const n = Number((e.target as HTMLElement).closest<HTMLElement>('[data-stage]')?.dataset.stage);
      if (n && stageUnlocked(this.kingdom, n)) { this.stage = n; this.render(); }
    });
    // Hero choice: cycle through unlocked heroes; a locked one explains how it joins.
    this.$('btn-hero').addEventListener('click', () => {
      // The hero card opens on the first tap; later taps also switch heroes.
      if (this.selected !== 'hero') { this.selected = 'hero'; this.render(); return; }
      const order: HeroKind[] = ['ranger', 'bron', 'bear'];
      // The next unlocked hero after the current one; if none, explain how the next locked one joins.
      const after = [1, 2].map(i => order[(order.indexOf(this.kingdom.hero) + i) % order.length]);
      const next = after.find(h => heroUnlocked(this.kingdom, h)), skipped = after.find(h => !heroUnlocked(this.kingdom, h));
      const hint = (h: HeroKind) => this.note(`${HEROES[h].name}: 스테이지 ${HERO_JOINS[h]}에서 별을 얻으면 합류해요`);
      if (!next) { hint(after[0]); return; }
      // Passing over a hero who has not joined yet still says how they join.
      if (skipped && after.indexOf(skipped) < after.indexOf(next)) hint(skipped);
      this.kingdom = chooseHero(this.kingdom, next);
      saveKingdom(this.kingdom);
      this.render();
    });
    this.$('btn-collect').addEventListener('click', () => {
      this.kingdom = collect(this.kingdom, Date.now());
      saveKingdom(this.kingdom);
      this.render();
    });
    this.$('retry-storage').addEventListener('click', () => { saveKingdom(this.kingdom); this.render(); });
  }

  get current(): Kingdom { return this.kingdom; }
  /** Short message in the reward line (reused for hints). */
  private note(text: string) { const el = this.$('town-reward'); el.textContent = text; el.hidden = false; }
  /** Pin the name tags over their buildings (call every frame while the town is shown). */
  layout(rect: { width: number; height: number; top?: number }) {
    // A tag's foot sits on its anchor; keep its top at least 8px under the top bar (cycle 61: on some aspect ratios the
    // castle, forge and vault tags slid under it). A pushed tag overlaps its own roof a little more.
    const minY = this.barBottom > 0 ? this.barBottom - (rect.top ?? 0) + 8 + TAG_SIZE : -Infinity;
    const place = (tag: HTMLElement, at: { x: number; y: number }) => {
      tag.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(Math.max(at.y, minY))}px) translate(-50%, -100%)`;
    };
    for (const p of SPOTS) {
      const tag = this.root.querySelector<HTMLElement>(`[data-select="${p.id}"]`);
      if (tag) place(tag, this.view.labelAt(p.id, rect));
    }
    const flag = this.root.querySelector<HTMLElement>('[data-endless]');
    if (flag && !flag.hidden) place(flag, this.view.flagLabelAt(rect));
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
    this.$('town-storage-warning').hidden = !storageUnavailable();
    const k = this.kingdom, now = Date.now(), wait = pending(k, now);
    if (!stageUnlocked(k, this.stage)) this.stage = latestStage(k);
    this.root.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(chip => {
      const n = Number(chip.dataset.stage), open = stageUnlocked(k, n), stars = k.stars[n - 1];
      chip.disabled = !open;
      chip.setAttribute('aria-checked', String(n === this.stage));
      if (n === ENDLESS_STAGE) {
        chip.setAttribute('aria-label', open ? `끝없는 도전, 최고 ${k.endlessBest}웨이브` : '끝없는 도전, 스테이지 10에서 별을 얻으면 열림');
        chip.querySelector('[data-stars]')!.textContent = open ? `최고 ${k.endlessBest}` : '잠김';
        return;
      }
      chip.setAttribute('aria-label', open ? `스테이지 ${n}, 별 ${stars}개` : `스테이지 ${n}, 잠김`);
      chip.querySelector('[data-stars]')!.textContent = open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '잠김';
    });
    // Daily first win (cycle 32): a small badge on the battle button while today's bonus is waiting.
    // Endless never ends in a win, so it shows the next record milestone (cycle 51) instead of the daily first-win badge.
    const endless = this.stage === ENDLESS_STAGE, daily = !endless && dailyReady(k, today(now)), goal = endless ? nextMilestone(k.endlessBest) : null;
    const label = endless ? '끝없는 도전' : `스테이지 ${this.stage}`;
    const badge = daily ? `<span class="daily-badge">첫 승리 <i class="res-ico shard"></i>+${DAILY_WIN.shards}</span>`
      : goal ? `<span class="daily-badge goal">목표 ${goal.waves} <i class="res-ico shard"></i>+${goal.shards}</span>` : '';
    this.$('btn-battle').innerHTML = `${label} 출전${badge}`;
    this.$('btn-battle').setAttribute('aria-label', `${label} 출전${daily ? ', 오늘의 첫 승리 보상 대기 중' : goal ? `, 다음 목표 ${goal.waves}웨이브, 조각 ${goal.shards}개` : ''}`);
    this.$('hero-name').textContent = `${HEROES[k.hero].name} Lv${k.heroLv[k.hero]}`;
    const heroRow = this.root.querySelector<HTMLElement>('[data-id="hero"]')!;
    const lv = k.heroLv[k.hero], g = heroGrowth(lv), tc = trainCost(k, k.hero), trainBtn = heroRow.querySelector<HTMLButtonElement>('[data-train]')!;
    const growth = (x: { hp: number; damage: number }) => x.hp === x.damage ? `+${pct(x.hp - 1)}` : `체력 +${pct(x.hp - 1)} · 공격 +${pct(x.damage - 1)}`;
    heroRow.classList.toggle('selected', this.selected === 'hero');
    heroRow.querySelector('[data-hero-name]')!.textContent = HEROES[k.hero].name;
    heroRow.querySelector('[data-level]')!.textContent = `Lv ${lv}/${heroMaxLevel(k)}`;
    heroRow.querySelector('[data-effect]')!.textContent = `${g.hp === g.damage ? '체력·공격 ' : ''}${growth(g)}${tc ? ` → ${growth(heroGrowth(lv + 1))}` : ''}`;
    trainBtn.disabled = !tc || !canTrain(k, k.hero);
    trainBtn.querySelector('[data-cost]')!.innerHTML = tc
      ? `훈련 <i class="res-ico food"></i>${tc.food} <i class="res-ico wood"></i>${tc.wood}${tc.shards ? ` <i class="res-ico shard"></i>${tc.shards}` : ''}`
      : k.heroLv[k.hero] >= CASTLE_MAX * HERO_LV_PER_CASTLE ? '최대' : '성 Lv 필요';
    trainBtn.classList.toggle('capped', !tc);
    // Talent (cycle 45): effect now → next, and a button with its shard cost or what it still needs.
    const t = TALENTS[k.hero], tl = k.talent[k.hero], tcost = talentCost(k, k.hero), talentBtn = heroRow.querySelector<HTMLButtonElement>('[data-talent]')!;
    const tval = (n: number) => t.stat === 'spread' ? `−${Math.abs(t.per * n * 180 / Math.PI).toFixed(1)}°` : `+${(t.per * n).toFixed(2)}m`;
    heroRow.querySelector('[data-talent-effect]')!.textContent = `${t.name} ${tl}/${TALENT_MAX} · ${t.label} ${tval(tl)}${tcost ? ` → ${tval(tl + 1)}` : ''}`;
    talentBtn.disabled = !canLearnTalent(k, k.hero);
    talentBtn.querySelector('[data-talent-cost]')!.innerHTML = !tcost ? '특기 최대' : !tcost.ready ? `특기 Lv${tcost.needLv}↑` : `특기 <i class="res-ico shard"></i>${tcost.shards}`;
    talentBtn.classList.toggle('capped', !tcost || !tcost.ready);
    this.$('btn-hero').classList.toggle('can', canTrain(k, k.hero));
    this.$('btn-hero').classList.toggle('has-more', heroUnlocked(k, 'bron') || heroUnlocked(k, 'bear'));
    this.view.sync(k);
    for (const r of ROWS) {
      const tag = this.root.querySelector<HTMLElement>(`[data-select="${r.id}"]`)!;
      tag.querySelector('[data-tag-level]')!.textContent = String(level(k, r.id));
      tag.setAttribute('aria-label', `${r.name} Lv ${level(k, r.id)}${canUpgrade(k, r.id) ? ', 강화 가능' : ''}`);
      tag.classList.toggle('can', canUpgrade(k, r.id));
      tag.classList.toggle('on', r.id === this.selected);
      this.root.querySelector<HTMLElement>(`[data-id="${r.id}"]`)!.classList.toggle('selected', r.id === this.selected);
    }
    const flag = this.root.querySelector<HTMLElement>('[data-endless]')!, open = stageUnlocked(k, ENDLESS_STAGE), next = nextMilestone(k.endlessBest);
    flag.hidden = !open;
    flag.querySelector('[data-tag-level]')!.textContent = String(k.endlessBest);
    flag.querySelector('.goal')!.textContent = next ? `→${next.waves}` : '';
    flag.classList.toggle('on', this.stage === ENDLESS_STAGE);
    flag.setAttribute('aria-label', `끝없는 도전 기록 ${k.endlessBest}웨이브${next ? `, 다음 목표 ${next.waves}웨이브` : ''}. 누르면 끝없는 도전을 골라요`);
    const goalEl = this.$('town-goal') as HTMLButtonElement, cur = currentGoal(k);
    goalEl.hidden = !cur;
    if (cur) {
      goalEl.classList.toggle('done', cur.done);
      goalEl.disabled = !cur.done;
      goalEl.querySelector('[data-goal-head]')!.textContent = cur.done ? `목표 ${cur.index + 1}/${GOALS.length} · 받기` : `목표 ${cur.index + 1}/${GOALS.length}`;
      goalEl.querySelector('[data-goal-text]')!.textContent = cur.need > 1 && !cur.done ? `${cur.goal.text} (${cur.have}/${cur.need})` : cur.goal.text;
      goalEl.querySelector('[data-goal-reward]')!.innerHTML = rewardHtml(cur.goal.reward);
      goalEl.setAttribute('aria-label', `목표 ${cur.index + 1}: ${cur.goal.text}, ${cur.done ? '달성, 눌러서 보상 받기' : `진행 ${cur.have}/${cur.need}`}, 보상 ${rewardText(cur.goal.reward)}`);
    }
    this.$('res-food').textContent = String(k.food);
    this.$('res-wood').textContent = String(k.wood);
    this.$('res-shard').textContent = String(k.shards);
    const collectBtn = this.$('btn-collect') as HTMLButtonElement;
    collectBtn.disabled = wait.food + wait.wood === 0;
    // Icons and numbers only (cycle 58): the full sentence goes to the accessible name.
    const full = storageFull(k, now), idle = wait.food + wait.wood === 0;
    this.$('collect-amount').innerHTML = idle ? '생산 중…' : `<i class="res-ico food"></i>+${wait.food}<i class="res-ico wood"></i>+${wait.wood}${full ? ' 가득' : ''}`;
    collectBtn.setAttribute('aria-label', idle ? '수확: 생산 중' : `수확: 식량 +${wait.food}, 목재 +${wait.wood}${full ? ', 창고 가득' : ''}`);
    for (const r of ROWS) {
      const row = this.root.querySelector<HTMLElement>(`[data-id="${r.id}"]`)!;
      const cost = upgradeCost(k, r.id), btn = row.querySelector<HTMLButtonElement>('[data-up]')!;
      row.querySelector('[data-level]')!.textContent = `Lv ${level(k, r.id)}/${maxLevel(k, r.id)}`;
      row.querySelector('[data-effect]')!.textContent = `${r.label} ${r.value(k)}${cost ? ` → ${r.value(bumped(k, r.id))}` : ''}`;
      btn.disabled = !cost || !canUpgrade(k, r.id);
      btn.querySelector('[data-cost]')!.innerHTML = cost
        ? `<i class="res-ico food"></i>${cost.food} <i class="res-ico wood"></i>${cost.wood}`
        : r.id === 'castle' || level(k, r.id) >= CASTLE_MAX ? '최대' : '성 Lv 필요';
      btn.classList.toggle('capped', !cost);
    }
  }
}
