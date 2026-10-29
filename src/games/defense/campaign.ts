import type { Campaign, DefenseState, Difficulty, HeroId } from './types.ts';
import { getStage, HERO_ORDER, STAGE_COUNT, STAGES } from './data.ts';
import { DIFFICULTIES, getDifficulty } from './difficulty.ts';

const KEY = 'playground:defense:v1';
const MAX_GOLD = 1_000_000;
const RUN_HISTORY = 100;

/** The village starts small; clear rewards bring its inhabitants and facilities. */
export function createCampaign(): Campaign {
  return {
    version: 1, gold: 0, cleared: [], questClaimed: [], visitors: ['mage'],
    seenVisitors: ['mage'], training: 0, selectedHero: 'mage', difficulty: 'standard', processedRuns: [],
  };
}

function isHero(value: unknown): value is HeroId {
  return typeof value === 'string' && HERO_ORDER.includes(value as HeroId);
}

function validInteger(value: unknown, max: number, fallback = 0): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : fallback;
}

function validRunId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value;
}

/** Sanitize old/incomplete saves without granting out-of-order campaign progress. */
function normalize(raw: unknown): Campaign {
  if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== 1) return createCampaign();
  const value = raw as Record<string, unknown>;
  const incomingClears: unknown[] = Array.isArray(value.cleared) ? value.cleared : [];
  const cleared: number[] = [];
  for (let stage = 1; stage <= STAGE_COUNT && incomingClears.includes(stage); stage++) cleared.push(stage);
  // Arrivals are earned facts, derived from clears so a partial save cannot lose a hero.
  const visitors: HeroId[] = ['mage', ...cleared.flatMap(stage => {
    const visitor = getStage(stage).visitor;
    return visitor ? [visitor] : [];
  })];
  const incomingSeen: unknown[] = Array.isArray(value.seenVisitors) ? value.seenVisitors : [];
  const seenVisitors = visitors.filter(hero => hero === 'mage' || incomingSeen.includes(hero));
  const incomingQuests: unknown[] = Array.isArray(value.questClaimed) ? value.questClaimed : [];
  const questClaimed = cleared.filter(stage => incomingQuests.includes(stage));
  const incomingRuns: unknown[] = Array.isArray(value.processedRuns) ? value.processedRuns : [];
  const processedRuns = [...new Set(incomingRuns.filter(validRunId))].slice(-RUN_HISTORY);
  return {
    version: 1, gold: validInteger(value.gold, MAX_GOLD), cleared, questClaimed, visitors, seenVisitors,
    training: visitors.includes('dwarf') ? validInteger(value.training, 5) : 0,
    selectedHero: isHero(value.selectedHero) && visitors.includes(value.selectedHero) ? value.selectedHero : 'mage',
    difficulty: getDifficulty(value.difficulty),
    processedRuns,
  };
}

export function readCampaign(): Campaign {
  try {
    const saved = localStorage.getItem(KEY);
    // A normal save is a few KB; reject a corrupted oversized payload before parsing.
    return !saved || saved.length > 65_536 ? createCampaign() : normalize(JSON.parse(saved));
  } catch { return createCampaign(); }
}

/** Storage failures do not interrupt combat; the caller can show a save notice. */
export function writeCampaign(campaign: Campaign): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalize(campaign)));
    return true;
  } catch { return false; }
}

export function stageUnlocked(campaign: Campaign, stage: number): boolean {
  return Number.isInteger(stage) && stage >= 1 && stage <= STAGE_COUNT &&
    STAGES.filter(previous => previous.id < stage).every(previous => campaign.cleared.includes(previous.id));
}

export type CampaignReward = {
  campaign: Campaign;
  goldEarned: number;
  firstClear: boolean;
  questReward: number;
  difficultyBonus: number;
  visitor: HeroId | null;
};

export function completeRun(campaign: Campaign, runId: string, state: DefenseState): CampaignReward {
  const unchanged: CampaignReward = { campaign, goldEarned: 0, firstClear: false, questReward: 0, difficultyBonus: 0, visitor: null };
  if (!validRunId(runId) || campaign.processedRuns.includes(runId) ||
    !stageUnlocked(campaign, state.stage) || !['won', 'lost'].includes(state.phase) ||
    !Number.isSafeInteger(state.kills) || state.kills < 0 ||
    !Number.isInteger(state.wave) || state.wave < 0 || state.wave > 4 ||
    (state.phase === 'won' && (state.wave !== 4 || !Number.isFinite(state.hp) || state.hp <= 0))) return unchanged;

  const won = state.phase === 'won';
  const firstClear = won && !campaign.cleared.includes(state.stage);
  const stage = getStage(state.stage);
  const questValue = stage.questType === 'outpost' ? state.outpostHp : stage.questType === 'hunt' ? state.questProgress : state.hp;
  const questMet = won && Number.isFinite(questValue) && questValue >= stage.questGoal;
  const questReward = questMet && !campaign.questClaimed.includes(state.stage) ? stage.questReward : 0;
  const baseReward = won ? firstClear ? 100 + state.stage * 40 : 30 + state.stage * 10 : Math.min(40, state.kills * 2);
  // The completed run's difficulty owns its reward, regardless of camp selections later.
  const clearReward = won ? Math.round(baseReward * DIFFICULTIES[getDifficulty(state.difficulty)].rewardMultiplier) : baseReward;
  const difficultyBonus = clearReward - baseReward;
  const goldEarned = clearReward + questReward;
  const arrival = firstClear ? stage.visitor : null;
  const visitor = arrival && !campaign.visitors.includes(arrival) ? arrival : null;
  return {
    goldEarned, firstClear, questReward, difficultyBonus, visitor,
    campaign: {
      ...campaign,
      gold: Math.min(MAX_GOLD, campaign.gold + goldEarned),
      cleared: firstClear ? [...campaign.cleared, state.stage].sort((a, b) => a - b) : campaign.cleared,
      questClaimed: questReward ? [...campaign.questClaimed, state.stage].sort((a, b) => a - b) : campaign.questClaimed,
      visitors: visitor ? [...campaign.visitors, visitor] : campaign.visitors,
      processedRuns: [...campaign.processedRuns, runId].slice(-RUN_HISTORY),
    },
  };
}

export function acknowledgeVisitor(campaign: Campaign, hero: HeroId): Campaign {
  return campaign.visitors.includes(hero) && !campaign.seenVisitors.includes(hero)
    ? { ...campaign, seenVisitors: [...campaign.seenVisitors, hero] } : campaign;
}

export function selectHero(campaign: Campaign, hero: HeroId): Campaign {
  return campaign.visitors.includes(hero) && campaign.selectedHero !== hero
    ? { ...campaign, selectedHero: hero } : campaign;
}

export function selectDifficulty(campaign: Campaign, difficulty: Difficulty): Campaign {
  return getDifficulty(difficulty) === difficulty && campaign.difficulty !== difficulty
    ? { ...campaign, difficulty } : campaign;
}

export function trainingCost(campaign: Campaign): number {
  return 100 + campaign.training * 80;
}

export function trainCampaign(campaign: Campaign): Campaign {
  const cost = trainingCost(campaign);
  return campaign.visitors.includes('dwarf') && campaign.training < 5 && campaign.gold >= cost
    ? { ...campaign, training: campaign.training + 1, gold: campaign.gold - cost } : campaign;
}

export type CampaignFacility = {
  id: 'lodge' | 'ranger' | 'forge' | 'shrine' | 'beast';
  name: string;
  unlocked: boolean;
  unlockStage: number;
  description: string;
  sprite: number | null;
};

const FACILITIES: Omit<CampaignFacility, 'unlocked'>[] = [
  { id: 'lodge', name: '수비대 숙소', unlockStage: 0, description: '영웅을 편성하고 다음 방어를 준비해요.', sprite: 7 },
  { id: 'ranger', name: '리엘의 정찰 초소', unlockStage: 1, description: '엘프 리엘이 수비대에 합류하고 원거리 전투를 도와요.', sprite: 4 },
  { id: 'forge', name: '브론의 대장간', unlockStage: 2, description: '장비를 강화해 수비대의 공격력을 높여요.', sprite: 22 },
  { id: 'shrine', name: '청운의 도원', unlockStage: 3, description: '도사 청운을 영웅이나 용병으로 편성할 수 있어요.', sprite: 23 },
  { id: 'beast', name: '영물의 쉼터', unlockStage: 7, description: '드루이드와 펫이 함께 수비대에 합류해요.', sprite: 24 },
];

/** Facilities reflect earned arrivals; viewing the camp never spends currency. */
export function campaignFacilities(campaign: Campaign): CampaignFacility[] {
  return FACILITIES.map(facility => ({
    ...facility,
    unlocked: facility.unlockStage === 0 ||
      (stageUnlocked(campaign, facility.unlockStage) && campaign.cleared.includes(facility.unlockStage)),
  }));
}

export type CampaignRequest = {
  stage: number;
  title: string;
  from: string;
  body: string;
  region: 'forest' | 'snow';
};

/** The next request follows the same order as combat, including old four-clear saves. */
export function campaignRequest(campaign: Campaign): CampaignRequest | null {
  const stage = STAGES.find(candidate => !campaign.cleared.includes(candidate.id) && stageUnlocked(campaign, candidate.id));
  return stage ? {
    stage: stage.id,
    title: stage.name,
    from: stage.region === 'snow' ? '서리산맥의 전령' : '청록 마을의 촌장',
    body: stage.story,
    region: stage.region,
  } : null;
}
