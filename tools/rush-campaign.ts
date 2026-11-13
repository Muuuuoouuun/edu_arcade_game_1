// Campaign pace (C7, docs/rush/completion.md): can a fresh kingdom reach a stage-10 win without stalling, and how
// long does it take? Plays whole campaigns with the guard bot and a fixed town policy, applying every battle through
// the same kingdom.ts calls as main.ts / town.ts: settleBattle(collect(k, now), id, s, stage, day), claimGoal,
// upgrade, train, learnTalent.
// Usage: node --experimental-strip-types tools/rush-campaign.ts [seeds=8] [sN=power ...] [-v]
//   sN=power overrides STAGE_POWER[N-1] in memory only (e.g. s6=900) to try a recommended-power change; -v prints
//   every battle of seed 1.
//
// Player policy (deterministic per seed):
// - Battle: the target is the first stage without a star (the newest one open). Play it when kingdom power is at
//   least its recommended power (the town's green pill), unless the last try on it was lost and power has not grown
//   since; otherwise replay the highest cleared stage for resources and stars. After FLAT_TRIES battles in a row with
//   no power growth (nothing left to buy), try the target anyway. Battle n of seed S uses sim seed S*1000+n.
//   Hero: ranger throughout. Heroes level separately, so a switch would start over at Lv1, and STAGE_POWER is
//   measured with the ranger. Only the active hero is trained (others would add power but nothing to battle).
// - Clock: a fake clock advances by the battle's ticks (60/s) plus MENU_MS of town time per battle; production is
//   collected with the real collect() on it. It starts at 09:00 UTC, so the daily first win pays on the first win.
// - Town (also once before the first battle, as the game opens in town): collect, claim every met goal, then repeat
//   until nothing more is bought:
//   1) learn the active hero's next talent when ready (costs shards only);
//   2) the castle, if affordable and it is capping something (an upgrade or the hero sits at its castle limit);
//   3) else the cheapest affordable by food + wood of: farm, mill, the five perks, the castle when it caps nothing,
//      training the active hero. Ties keep that order. Everything bought raises kingdom power; perks and hero
//      levels also raise battle mods.
import { createRush, stepRush } from '../src/rush/sim.ts';
import { guardBot } from '../src/rush/bot.ts';
import { STAGE_COUNT, stageDifficulty } from '../src/rush/stages.ts';
import {
  canLearnTalent, canTrain, canUpgrade, claimGoal, collect, createKingdom, currentGoal, dayIndex, heroMaxLevel, kingdomMods,
  kingdomPower, learnTalent, level, maxLevel, recommendedPower, settleBattle, STAGE_POWER, train, trainCost, upgrade,
  upgradeCost, type Kingdom, type Upgrade,
} from '../src/rush/kingdom.ts';

const START = Date.UTC(2026, 10, 13, 9), MENU_MS = 60_000, CAP = 400, MAX_TICKS = 60 * 60 * 8, FLAT_TRIES = 3;
const OTHERS: Upgrade[] = ['farm', 'mill', 'attack', 'towerDiscount', 'townHp', 'forge', 'vault'];

const args = process.argv.slice(2);
for (const a of args) { const m = /^s(\d+)=(\d+)$/.exec(a); if (m) (STAGE_POWER as number[])[Number(m[1]) - 1] = Number(m[2]); }
const SEEDS = Number(args.find(a => /^\d+$/.test(a)) ?? 8), VERBOSE = args.includes('-v');

/** Town step (policy 1-3 above): returns the kingdom and how many things were bought. */
function spend(k: Kingdom, now: number): { k: Kingdom; bought: number } {
  let bought = 0;
  for (;;) {
    if (canLearnTalent(k, k.hero)) { k = learnTalent(k, k.hero); bought++; continue; }
    const capping = OTHERS.some(u => level(k, u) >= maxLevel(k, u)) || k.heroLv[k.hero] >= heroMaxLevel(k);
    if (capping && canUpgrade(k, 'castle')) { k = upgrade(k, 'castle', now); bought++; continue; }
    const cur = k, options: [number, () => Kingdom][] = [];
    for (const u of [...OTHERS, ...(capping ? [] : ['castle' as const])]) {
      const c = upgradeCost(cur, u);
      if (c && canUpgrade(cur, u)) options.push([c.food + c.wood, () => upgrade(cur, u, now)]);
    }
    const t = trainCost(cur, cur.hero);
    if (t && canTrain(cur, cur.hero)) options.push([t.food + t.wood, () => train(cur, cur.hero, now)]);
    if (!options.length) return { k, bought };
    k = options.sort((a, b) => a[0] - b[0])[0][1]();
    bought++;
  }
}
function town(k: Kingdom, now: number) {
  k = collect(k, now);
  while (currentGoal(k)?.done) k = claimGoal(k);
  return spend(k, now);
}

type Battle = { stage: number; target: boolean; won: boolean; stars: number; min: number; power: number; bought: number; food: number; wood: number; shards: number };
function campaign(seed: number) {
  let now = START, flat = 0, lossPower = -1, { k } = town(createKingdom(START), START);
  const log: Battle[] = [], clear: (number | null)[] = Array(STAGE_COUNT).fill(null);
  while (log.length < CAP && k.stars[STAGE_COUNT - 1] === 0) {
    const target = k.stars.indexOf(0) + 1, power = kingdomPower(k);
    const ready = power >= recommendedPower(target)! && !(lossPower >= 0 && power <= lossPower);
    const stage = target === 1 || ready || flat >= FLAT_TRIES ? target : target - 1;
    const id = seed * 1000 + log.length + 1, s = createRush(id, kingdomMods(k), stageDifficulty(stage), k.hero);
    while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < MAX_TICKS) stepRush(s, guardBot(s));
    now += Math.round((s.tick / 60) * 1000);
    const min = (now - START) / 60000, { kingdom, reward } = settleBattle(collect(k, now), `${now.toString(36)}-${id}`, s, stage, dayIndex(now));
    if (stage === target) { if (reward.won) { clear[stage - 1] = log.length; lossPower = -1; } else lossPower = power; }
    now += MENU_MS;
    const after = town(kingdom, now);
    k = after.k;
    flat = kingdomPower(k) > power ? 0 : flat + 1;
    log.push({ stage, target: stage === target, won: reward.won, stars: reward.stars, min, power: kingdomPower(k), bought: after.bought, food: k.food, wood: k.wood, shards: k.shards });
  }
  return { log, clear, k, min: (now - START) / 60000 };
}

const med = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b), h = v.length >> 1; return v.length ? (v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2) : NaN; };
const span = (xs: number[], d = 0) => xs.length ? `${med(xs).toFixed(d)} (${Math.min(...xs).toFixed(d)}-${Math.max(...xs).toFixed(d)})` : '-';
const pad = (v: string | number, n: number) => String(v).padStart(n);

const runs = Array.from({ length: SEEDS }, (_, i) => campaign(i + 1));
if (VERBOSE) for (const [i, b] of runs[0].log.entries())
  console.log(`#${i + 1} st${b.stage}${b.target ? '*' : ' '} ${b.won ? `won ${b.stars}★` : 'lost  '} ${b.min.toFixed(1)}m power ${b.power} bought ${b.bought} left ${b.food}/${b.wood}/${b.shards}`);
const overrides = args.filter(a => /^s\d+=/.test(a));
console.log(`seeds 1-${SEEDS}, cap ${CAP} battles, menu ${MENU_MS / 1000}s per battle${overrides.length ? `, overrides ${overrides.join(' ')}` : ''}`);
console.log(`STAGE_POWER ${STAGE_POWER.join(' ')}\n`);
console.log('stage | rec  | first clear (battle #) | clock minutes   | losses on it | replays before');
for (let st = 1; st <= STAGE_COUNT; st++) {
  const done = runs.filter(r => r.clear[st - 1] !== null), at = done.map(r => r.clear[st - 1]!);
  const prev = done.map(r => (st === 1 ? -1 : r.clear[st - 2] ?? -1));
  const between = done.map((r, i) => r.log.slice(prev[i] + 1, at[i]));
  const losses = between.map(bs => bs.filter(b => b.stage === st).length), replays = between.map(bs => bs.filter(b => b.stage !== st).length);
  console.log(`${pad(st, 5)} | ${pad(recommendedPower(st)!, 4)} | ${pad(span(at.map(n => n + 1)), 22)} | ${pad(span(done.map(r => r.log[r.clear[st - 1]!].min), 0), 15)} | ${pad(span(losses), 12)} | ${pad(span(replays), 14)}${done.length < runs.length ? `  (${runs.length - done.length} seeds never)` : ''}`);
}
console.log('\nseed | battles | minutes | W/L     | longest gap between clears | no-buy streak | max left f/w/sh | end: castle perks heroLv talent power goal');
for (const [i, r] of runs.entries()) {
  let gap = 0, gapStage = 0, last = -1, streak = 0, run = 0, left = [0, 0, 0];
  r.clear.forEach((c, st) => { if (c !== null) { if (c - last > gap) { gap = c - last; gapStage = st + 1; } last = c; } });
  for (const b of r.log) { run = b.bought ? 0 : run + 1; streak = Math.max(streak, run); left = [Math.max(left[0], b.food), Math.max(left[1], b.wood), Math.max(left[2], b.shards)]; }
  const w = r.log.filter(b => b.won).length, k = r.k, perks = Object.values(k.perks).join('');
  console.log(`${pad(i + 1, 4)} | ${pad(r.log.length, 7)} | ${pad(r.min.toFixed(0), 7)} | ${pad(`${w}/${r.log.length - w}`, 7)} | ${pad(`${gap} (stage ${gapStage})`, 26)} | ${pad(streak, 13)} | ${pad(left.join('/'), 15)} | ${k.castle} ${perks} ${k.heroLv.ranger} ${k.talent.ranger} ${kingdomPower(k)} ${k.goal}`);
}
const fin = runs.filter(r => r.k.stars[STAGE_COUNT - 1] > 0);
console.log(`\nstage 10 cleared by ${fin.length}/${runs.length} seeds: battles ${span(fin.map(r => r.log.length))}, minutes ${span(fin.map(r => r.min))}`);
