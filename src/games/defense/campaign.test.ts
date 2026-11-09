import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Campaign, DefenseState } from './types.ts';
import { getStage, STAGE_COUNT, STAGES } from './data.ts';
import { createDefense } from './engine.ts';
import {
  acknowledgeVisitor, campaignFacilities, campaignRequest, completeRun, createCampaign, readCampaign, selectDifficulty, selectHero,
  stageUnlocked, trainCampaign, trainingCost, writeCampaign,
} from './campaign.ts';

function result(stage = 1, overrides: Partial<DefenseState> = {}): DefenseState {
  return {
    ...createDefense(stage, 'mage'),
    stage, phase: 'won', paused: false, speed: 1, time: 100, wave: 4, coins: 30,
    hp: 20, outpostHp: 12, kills: 40, leaks: 0, enemies: [], towers: [], effects: [],
    hero: 'mage', heroPosition: { x: 300, y: 300 }, heroCooldown: 0,
    mercenary: null, mercCooldown: 0, skillCooldown: 0, promotion: 'power',
    spawned: 10, spawnTimer: 0, nextId: 50, training: 0, notice: '', questProgress: 100,
    petCooldown: 0, bossCharge: 0, freeze: 0, bossCycle: 0,
    ...overrides,
  };
}

function withStorage(run: (storage: Map<string, string>) => void) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
  });
  try { run(storage); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('campaign starts in a small village and its own save preserves the existing arcade profile', () => {
  assert.deepEqual(readCampaign(), createCampaign());
  const first = createCampaign();
  first.visitors.push('elf');
  assert.deepEqual(createCampaign().visitors, ['mage']);
  withStorage(storage => {
    storage.set('playground:v1', '{"name":"기존 플레이어"}');
    const progressed = completeRun(createCampaign(), 'first-clear', result()).campaign;
    assert.equal(writeCampaign(progressed), true);
    assert.deepEqual(readCampaign(), progressed);
    assert.equal(storage.get('playground:v1'), '{"name":"기존 플레이어"}');
    storage.set('playground:defense:v1', '{"version":0,"gold":900}');
    assert.deepEqual(readCampaign(), createCampaign());
    storage.set('playground:defense:v1', '{bad JSON');
    assert.deepEqual(readCampaign(), createCampaign());
    storage.set('playground:defense:v1', ' '.repeat(70_000));
    assert.deepEqual(readCampaign(), createCampaign());
  });
});

test('corrupt saves cannot grant missing-stage unlocks, unearned heroes or invalid growth', () => {
  withStorage(storage => {
    storage.set('playground:defense:v1', JSON.stringify({
      version: 1, gold: 1e100, cleared: [4, 1, 3, 3, '2'], questClaimed: [1, 3, -1],
      visitors: ['tao', 'constructor'], seenVisitors: ['mage', 'tao'], selectedHero: 'tao',
      training: 5, processedRuns: ['', 'valid', 'valid', 12, ' bad ', 'x'.repeat(129)],
    }));
    const clean = readCampaign();
    assert.equal(clean.gold, 0);
    assert.deepEqual(clean.cleared, [1]);
    assert.deepEqual(clean.visitors, ['mage', 'elf']);
    assert.deepEqual(clean.seenVisitors, ['mage']);
    assert.deepEqual(clean.questClaimed, [1]);
    assert.equal(clean.selectedHero, 'mage');
    assert.equal(clean.training, 0);
    assert.deepEqual(clean.processedRuns, ['valid']);
    assert.equal(stageUnlocked(clean, 2), true);
    assert.equal(stageUnlocked(clean, 3), false);
    storage.set('playground:defense:v1', JSON.stringify({ version: 1, cleared: [1, 2], training: 9, gold: -1 }));
    assert.equal(readCampaign().training, 0);
    assert.equal(readCampaign().gold, 0);
    assert.deepEqual(readCampaign().visitors, ['mage', 'elf', 'dwarf']);
  });
});

test('clears attract visitors in order and retain unacknowledged arrivals across sessions', () => {
  let campaign = createCampaign();
  assert.equal(stageUnlocked(campaign, 1), true);
  for (const stage of [-1, 0, 1.5, 2, 5, NaN]) assert.equal(stageUnlocked(campaign, stage), false);
  assert.equal(selectHero(campaign, 'tao'), campaign);
  assert.equal(acknowledgeVisitor(campaign, 'elf'), campaign);
  const arrivals = ['elf', 'dwarf', 'tao', null];
  for (let stage = 1; stage <= 4; stage++) {
    const reward = completeRun(campaign, `stage-${stage}`, result(stage));
    assert.equal(reward.firstClear, true);
    assert.equal(reward.visitor, arrivals[stage - 1]);
    assert.equal(reward.goldEarned, 100 + stage * 40 + 80);
    campaign = reward.campaign;
    if (reward.visitor) {
      assert.equal(campaign.seenVisitors.includes(reward.visitor), false);
      withStorage(() => { writeCampaign(campaign); assert.deepEqual(readCampaign(), campaign); });
      campaign = acknowledgeVisitor(campaign, reward.visitor);
      assert.equal(campaign.seenVisitors.includes(reward.visitor), true);
      assert.equal(acknowledgeVisitor(campaign, reward.visitor), campaign);
      campaign = selectHero(campaign, reward.visitor);
      assert.equal(campaign.selectedHero, reward.visitor);
    }
  }
  assert.deepEqual(campaign.cleared, [1, 2, 3, 4]);
  assert.deepEqual(campaign.visitors, ['mage', 'elf', 'dwarf', 'tao']);
});

test('settlement is idempotent; failed or unfinished runs do not unlock regions', () => {
  const start = createCampaign();
  const won = completeRun(start, 'run-1', result());
  assert.equal(won.goldEarned, 220);
  assert.equal(start.gold, 0);
  const duplicate = completeRun(won.campaign, 'run-1', result());
  assert.equal(duplicate.campaign, won.campaign);
  assert.equal(duplicate.goldEarned, 0);
  assert.equal(duplicate.visitor, null);
  for (const phase of ['prep', 'wave', 'intermission', 'promotion'] as const) {
    assert.equal(completeRun(start, 'ongoing', result(1, { phase })).campaign, start);
  }
  assert.equal(completeRun(start, 'locked', result(3)).campaign, start);
  assert.equal(completeRun(start, '', result()).campaign, start);
  assert.equal(completeRun(start, 'impossible', result(1, { wave: 1 })).campaign, start);
  assert.equal(completeRun(start, 'invalid', result(1, { kills: NaN })).campaign, start);
  const loss = completeRun(start, 'lost', result(1, { phase: 'lost', hp: 0, kills: 9, wave: 2 }));
  assert.equal(loss.goldEarned, 18);
  assert.equal(loss.questReward, 0);
  assert.equal(loss.firstClear, false);
  assert.equal(loss.visitor, null);
  assert.deepEqual(loss.campaign.cleared, []);
  assert.equal(completeRun(loss.campaign, 'lost', result(1, { phase: 'lost' })).goldEarned, 0);
  assert.equal(completeRun(start, 'big-loss', result(1, { phase: 'lost', hp: 0, kills: 500 })).goldEarned, 40);
});

test('optional quest rewards can be earned on a later replay, but never farmed twice', () => {
  const first = completeRun(createCampaign(), 'weak-clear', result(1, { hp: 12 }));
  assert.equal(first.goldEarned, 140);
  assert.equal(first.questReward, 0);
  const better = completeRun(first.campaign, 'better-clear', result(1, { hp: 15 }));
  assert.equal(better.firstClear, false);
  assert.equal(better.questReward, 80);
  assert.equal(better.goldEarned, 120);
  assert.equal(better.visitor, null);
  const replay = completeRun(better.campaign, 'repeat-clear', result());
  assert.equal(replay.goldEarned, 40);
  assert.equal(replay.questReward, 0);
  let campaign = replay.campaign;
  for (const stage of [2, 3]) campaign = completeRun(campaign, `unlock-${stage}`, result(stage)).campaign;
  const outpostLost = completeRun(campaign, 'outpost-lost', result(4, { hp: 20, outpostHp: 0 }));
  assert.equal(outpostLost.firstClear, true);
  assert.equal(outpostLost.questReward, 0);
  const outpostSaved = completeRun(outpostLost.campaign, 'outpost-saved', result(4, { hp: 3, outpostHp: 1 }));
  assert.equal(outpostSaved.questReward, 80);
  assert.equal(outpostSaved.goldEarned, 150);
});

test('training requires the visiting dwarf, deducts the visible price and stops at level five', () => {
  let campaign: Campaign = { ...createCampaign(), gold: 2000 };
  assert.equal(trainCampaign(campaign), campaign);
  campaign = completeRun(campaign, 'unlock-elf', result()).campaign;
  assert.equal(trainCampaign(campaign), campaign);
  campaign = completeRun(campaign, 'unlock-dwarf', result(2)).campaign;
  for (let level = 0; level < 5; level++) {
    assert.equal(trainingCost(campaign), 100 + level * 80);
    const before = campaign;
    campaign = trainCampaign(campaign);
    assert.equal(campaign.training, level + 1);
    assert.equal(campaign.gold, before.gold - trainingCost(before));
    assert.equal(before.training, level);
  }
  assert.equal(trainCampaign(campaign), campaign);
  const poor = { ...campaign, gold: 99, training: 0 };
  assert.equal(trainCampaign(poor), poor);
});

test('storage denial is nonfatal and the persisted processed-run history stays bounded', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, get: () => { throw new Error('Storage unavailable'); },
  });
  try {
    assert.deepEqual(readCampaign(), createCampaign());
    assert.equal(writeCampaign(createCampaign()), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
  let campaign = createCampaign();
  for (let i = 0; i < 105; i++) campaign = completeRun(campaign, `run-${i}`, result(1, { phase: 'lost', hp: 0 })).campaign;
  assert.equal(campaign.processedRuns.length, 100);
  assert.equal(campaign.processedRuns[0], 'run-5');
  assert.equal(campaign.processedRuns.at(-1), 'run-104');
});

test('the original four-clear v1 profile opens the snowy chapter without losing progress', () => {
  withStorage(storage => {
    const legacy: Omit<Campaign, 'difficulty'> = {
      version: 1, gold: 579, cleared: [1, 2, 3, 4], questClaimed: [1, 4],
      visitors: ['mage', 'elf', 'dwarf', 'tao'], seenVisitors: ['mage', 'elf', 'dwarf', 'tao'],
      training: 2, selectedHero: 'tao', processedRuns: ['original-clear-4', 'original-replay-1'],
    };
    storage.set('playground:defense:v1', JSON.stringify(legacy));
    const restored = readCampaign();
    assert.deepEqual(restored, { ...legacy, difficulty: 'standard' });
    assert.equal(stageUnlocked(restored, 5), true);
    assert.equal(stageUnlocked(restored, 6), false);
    assert.equal(campaignRequest(restored)?.stage, 5);
    assert.equal(campaignRequest(restored)?.region, 'snow');
    assert.equal(completeRun(restored, 'original-clear-4', result(4)).goldEarned, 0);
    assert.equal(writeCampaign(restored), true);
    assert.deepEqual(readCampaign(), { ...legacy, difficulty: 'standard' });
  });
});

test('all eight stages share quest and visitor data, and repeat rewards do not duplicate arrivals', () => {
  assert.equal(STAGE_COUNT, 8);
  let campaign = createCampaign();
  for (const stage of STAGES) {
    const first = completeRun(campaign, `all-first-${stage.id}`, result(stage.id));
    assert.equal(first.firstClear, true);
    assert.equal(first.questReward, stage.questReward);
    assert.equal(first.goldEarned, 100 + stage.id * 40 + stage.questReward);
    assert.equal(first.visitor, stage.visitor);
    assert.equal(first.campaign.cleared.includes(stage.id), true);
    const replay = completeRun(first.campaign, `all-replay-${stage.id}`, result(stage.id));
    assert.equal(replay.firstClear, false);
    assert.equal(replay.visitor, null);
    assert.equal(replay.questReward, 0);
    assert.equal(replay.goldEarned, 30 + stage.id * 10);
    campaign = replay.campaign;
    if (stage.id === 5 || stage.id === 6) {
      assert.equal(campaign.visitors.includes('barbarian'), true);
      assert.equal(campaign.visitors.includes('druid'), false);
    }
    if (stage.id >= 7) assert.equal(campaign.visitors.includes('druid'), true);
  }
  assert.deepEqual(campaign.cleared, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(campaign.visitors, ['mage', 'elf', 'dwarf', 'tao', 'barbarian', 'druid']);
  assert.deepEqual(campaign.questClaimed, campaign.cleared);
  assert.equal(campaignRequest(campaign), null);
  assert.equal(stageUnlocked(campaign, 9), false);
});

test('snow quests use configured health, outpost and hunt thresholds instead of forest defaults', () => {
  let campaign = createCampaign();
  for (let stage = 1; stage <= 4; stage++) campaign = completeRun(campaign, `forest-${stage}`, result(stage)).campaign;
  for (let id = 5; id <= 8; id++) {
    const stage = getStage(id);
    const field = stage.questType === 'hunt' ? 'questProgress' : stage.questType === 'outpost' ? 'outpostHp' : 'hp';
    const missed = completeRun(campaign, `miss-${id}`, result(id, { [field]: stage.questGoal - 1 }));
    assert.equal(missed.questReward, 0);
    assert.equal(missed.firstClear, true);
    const exact = completeRun(missed.campaign, `exact-${id}`, result(id, { [field]: stage.questGoal }));
    assert.equal(exact.questReward, stage.questReward);
    assert.equal(exact.firstClear, false);
    assert.equal(completeRun(exact.campaign, `again-${id}`, result(id)).questReward, 0);
    campaign = exact.campaign;
  }
});

test('facilities and requests reflect clears, and invalid saves cannot skip to the druid', () => {
  let campaign = createCampaign();
  assert.deepEqual(campaignFacilities(campaign).filter(f => f.unlocked).map(f => f.id), ['lodge']);
  const original = JSON.stringify(campaign);
  assert.equal(campaignRequest(campaign)?.stage, 1);
  campaignFacilities(campaign);
  assert.equal(JSON.stringify(campaign), original);
  for (const stage of STAGES) {
    assert.equal(campaignRequest(campaign)?.stage, stage.id);
    assert.equal(campaignRequest(campaign)?.body, stage.story);
    assert.equal(campaignRequest(campaign)?.region, stage.region);
    campaign = completeRun(campaign, `facilities-${stage.id}`, result(stage.id)).campaign;
    for (const facility of campaignFacilities(campaign)) {
      assert.equal(facility.unlocked, facility.unlockStage <= stage.id);
    }
  }
  const facilities = campaignFacilities(campaign);
  assert.deepEqual(facilities.map(f => f.sprite), [7, 4, 22, 23, 24]);
  assert.equal(facilities.every(f => f.unlocked), true);
  assert.equal(campaignRequest(campaign), null);
  campaign = selectHero(campaign, 'druid');
  assert.equal(campaign.selectedHero, 'druid');
  campaign = acknowledgeVisitor(campaign, 'druid');
  assert.equal(campaign.seenVisitors.includes('druid'), true);
  withStorage(storage => {
    writeCampaign(campaign);
    assert.deepEqual(readCampaign(), campaign);
    storage.set('playground:defense:v1', JSON.stringify({ ...campaign, cleared: [1, 2, 3, 4, 8] }));
    const repaired = readCampaign();
    assert.deepEqual(repaired.cleared, [1, 2, 3, 4]);
    assert.equal(repaired.visitors.includes('barbarian'), false);
    assert.equal(repaired.visitors.includes('druid'), false);
    assert.equal(repaired.seenVisitors.includes('druid'), false);
    assert.equal(repaired.selectedHero, 'mage');
    assert.equal(stageUnlocked(repaired, 8), false);
    assert.equal(campaignRequest(repaired)?.stage, 5);
    assert.equal(campaignFacilities(repaired).find(f => f.id === 'beast')?.unlocked, false);
    assert.equal(selectHero(repaired, 'druid'), repaired);
  });
});

test('difficulty choice persists without changing gold or unlocks; invalid saves use standard', () => {
  const start = createCampaign();
  assert.equal(start.difficulty, 'standard');
  const veteran = selectDifficulty(start, 'veteran');
  assert.equal(veteran.difficulty, 'veteran');
  assert.equal(start.difficulty, 'standard');
  assert.equal(veteran.gold, start.gold);
  assert.equal(veteran.cleared, start.cleared);
  assert.equal(veteran.visitors, start.visitors);
  assert.equal(selectDifficulty(veteran, 'veteran'), veteran);
  assert.equal(selectDifficulty(veteran, 'constructor' as Campaign['difficulty']), veteran);
  withStorage(storage => {
    assert.equal(writeCampaign(veteran), true);
    assert.deepEqual(readCampaign(), veteran);
    storage.set('playground:defense:v1', JSON.stringify({ ...veteran, difficulty: 'impossible' }));
    assert.equal(readCampaign().difficulty, 'standard');
    storage.set('playground:defense:v1', JSON.stringify({ ...veteran, difficulty: null }));
    assert.equal(readCampaign().difficulty, 'standard');
    const relaxed = selectDifficulty(veteran, 'relaxed');
    writeCampaign(relaxed);
    assert.equal(readCampaign().difficulty, 'relaxed');
  });
});

test('veteran multiplies only clear rewards using the completed run difficulty', () => {
  const standardCamp = createCampaign();
  const veteranWin = completeRun(standardCamp, 'veteran-first', result(1, { difficulty: 'veteran' }));
  assert.equal(veteranWin.goldEarned, 196 + 80);
  assert.equal(veteranWin.difficultyBonus, 56);
  assert.equal(veteranWin.questReward, 80);
  assert.equal(veteranWin.visitor, 'elf');
  const duplicate = completeRun(veteranWin.campaign, 'veteran-first', result(1, { difficulty: 'veteran' }));
  assert.equal(duplicate.goldEarned, 0);
  assert.equal(duplicate.difficultyBonus, 0);
  assert.equal(duplicate.questReward, 0);
  const replay = completeRun(veteranWin.campaign, 'veteran-replay', result(1, { difficulty: 'veteran' }));
  assert.equal(replay.goldEarned, 56);
  assert.equal(replay.difficultyBonus, 16);
  assert.equal(replay.questReward, 0);
  assert.equal(replay.firstClear, false);
  const relaxedReplay = completeRun(replay.campaign, 'relaxed-replay', result(1, { difficulty: 'relaxed' }));
  assert.equal(relaxedReplay.goldEarned, 40);
  assert.equal(relaxedReplay.questReward, 0);
  assert.equal(relaxedReplay.difficultyBonus, 0);
  const veteranCamp = selectDifficulty(standardCamp, 'veteran');
  const standardRun = completeRun(veteranCamp, 'standard-run', result(1, { difficulty: 'standard' }));
  assert.equal(standardRun.goldEarned, 220);
  assert.equal(standardRun.difficultyBonus, 0);
  const relaxedRun = completeRun(veteranCamp, 'relaxed-run', result(1, { difficulty: 'relaxed' }));
  assert.equal(relaxedRun.goldEarned, 220);
  assert.equal(relaxedRun.difficultyBonus, 0);
  const loss = completeRun(veteranCamp, 'veteran-loss', result(1, { difficulty: 'veteran', phase: 'lost', hp: 0, kills: 40 }));
  assert.equal(loss.goldEarned, 40);
  assert.equal(loss.difficultyBonus, 0);
  assert.equal(loss.questReward, 0);
});
