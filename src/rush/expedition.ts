// Expedition (merge of the old 원정 campaign into Rush, 2026-11-13). Pure data and rules: the ten Rush stages are the
// villages of two regions, each with a letter before the fight, a companion who arrives after the first clear and
// becomes the keeper of a town building, and a one-time import of the old campaign save. No DOM, no storage access.
import { STAGE_COUNT } from './stages.ts';
import type { Kingdom, Upgrade } from './kingdom.ts';

export type Region = 'forest' | 'snow';
export const REGIONS: Record<Region, { name: string; blurb: string; sender: string; stages: readonly [number, number] }> = {
  forest: { name: '청록의 숲', blurb: '숲길과 물길을 따라 이웃 마을을 지켜요.', sender: '청록 마을의 촌장', stages: [1, 5] },
  snow: { name: '서리산맥', blurb: '빙판을 달리는 적들과 서리군주가 기다려요.', sender: '서리산맥의 전령', stages: [6, 10] },
};
export const regionOf = (stage: number): Region => (stage >= REGIONS.snow.stages[0] && stage <= STAGE_COUNT ? 'snow' : 'forest');

export type Companion = 'ian' | 'riel' | 'bron' | 'cheongun' | 'popo' | 'kar' | 'luna';
/** Companions of the expedition. `keeper`: the town building they look after (story only, no stat change).
 * `face`: portrait under `src/rush/art/` (unified style). Bron and Popo are also playable heroes (`HERO_JOINS`). */
export const COMPANIONS: Record<Companion, { name: string; role: string; keeper: Upgrade; line: string; greeting: string }> = {
  ian: { name: '이안', role: '마법사 · 수비대장', keeper: 'castle', line: '작은 마을부터 함께 지켜요. 성이 크면 모두가 강해져요.', greeting: '작은 마을부터 함께 지켜 봐요. 우리의 이야기는 이제 시작이에요.' },
  riel: { name: '리엘', role: '엘프 명사수', keeper: 'towerDiscount', line: '탑 자리는 제가 골라 둘게요. 더 싸게 세울 수 있어요.', greeting: '마을을 지켰다는 이야기를 들었어요. 제 활도 수비대에 보태고 싶어요.' },
  bron: { name: '브론', role: '드워프 대장장이', keeper: 'forge', line: '다음 방어는 더 든든하게 준비하지.', greeting: '목숨을 구해 준 은혜는 갚아야지! 대장간을 열겠네. 장비는 내게 맡기게.' },
  cheongun: { name: '청운', role: '동방의 도사', keeper: 'attack', line: '부적 수련을 거르지 마세요. 모든 공격이 날카로워집니다.', greeting: '숲의 기운이 심상치 않군요. 강 건너 마을까지, 제 부적으로 돕겠습니다.' },
  popo: { name: '눈곰 포포', role: '서리산맥의 전령', keeper: 'mill', line: '통나무는 내가 나를게! 목재 걱정은 하지 마.', greeting: '서리산맥에서 왔어! 산 위 마을들이 위험해. 내 눈덩이로 같이 싸울게.' },
  kar: { name: '카르', role: '바바리안 전사', keeper: 'townHp', line: '성벽은 내가 지킨다. 아무도 못 넘어와.', greeting: '서리산맥까지 올라왔다고? 마음에 드는군! 내 전투 망치로 앞길을 열어 주지.' },
  luna: { name: '루나', role: '드루이드 · 달빛 늑대', keeper: 'farm', line: '밭은 숲의 친구들이 돌봐요. 식량이 넉넉해질 거예요.', greeting: '다친 숲의 친구들을 돌봐 주셨군요. 저와 달빛 늑대도 함께하겠어요.' },
};

export interface ExpeditionStage {
  /** Rush stage number (1-10). */
  stage: number;
  label: string;
  name: string;
  /** Letter shown before the first attempt. */
  story: string;
  /** Who leads the last wave: every Rush stage ends with a boss wave; only 5 and 10 are named bosses. */
  boss: string;
  /** Companion who arrives after the first clear. */
  visitor?: Companion;
}
export const EXPEDITION: readonly ExpeditionStage[] = [
  { stage: 1, label: '1-1', name: '숲 가장자리', story: '작은 마을의 첫 방어. 길목에 탑을 세우고 수비대의 이름을 알려요.', boss: '도적 두목', visitor: 'riel' },
  { stage: 2, label: '1-2', name: '제재소 구조 작전', story: '대장장이 브론이 제재소에 고립됐어요. 길을 열고 제재소를 지켜 주세요.', boss: '나무 병사 대장', visitor: 'bron' },
  { stage: 3, label: '1-3', name: '서리 낀 옛길', story: '차가운 옛길로 갑옷 입은 적들이 내려와요. 길을 지키면 낯선 도사가 찾아옵니다.', boss: '돌 갑옷 대장', visitor: 'cheongun' },
  { stage: 4, label: '1-4', name: '설산에서 온 손님', story: '서리산맥에서 눈곰 한 마리가 도움을 청하러 내려오고 있어요. 길목을 지켜 손님을 맞이해요.', boss: '숲 도적 대장', visitor: 'popo' },
  { stage: 5, label: '1-5', name: '강 건너의 불빛', story: '강 건너 마을의 구조 요청! 숲의 주인 고목왕이 깨어났어요. 마지막 웨이브를 버텨 주세요.', boss: '고목왕' },
  { stage: 6, label: '2-1', name: '눈꽃 고갯길', story: '설산에서 구조 요청이 왔어요. 방패 든 적이 처음 나타나요. 고갯길을 지키면 바바리안 전사가 찾아옵니다.', boss: '서리 기사', visitor: 'kar' },
  { stage: 7, label: '2-2', name: '늑대 무리의 습격', story: '서리늑대 무리가 협곡으로 몰려와요. 빠른 적을 탑과 함께 끊어 주세요.', boss: '늑대 우두머리' },
  { stage: 8, label: '2-3', name: '영물의 발자국', story: '길을 잃은 드루이드와 달빛 늑대가 마을로 향하고 있어요. 주술사의 보호막을 먼저 깨 주세요.', boss: '눈보라 주술사', visitor: 'luna' },
  { stage: 9, label: '2-4', name: '서리 왕좌로 가는 길', story: '눈보라가 짙어져요. 서리군주의 성으로 가는 마지막 고개를 열어 주세요.', boss: '왕좌의 문지기' },
  { stage: 10, label: '2-5', name: '서리 왕좌의 결전', story: '서리군주가 왕좌에서 내려왔어요. 두 지역의 수비대를 모두 모아 마지막 결전을 치러요.', boss: '서리군주' },
];
export const expeditionStage = (stage: number): ExpeditionStage => EXPEDITION[Math.min(STAGE_COUNT, Math.max(1, stage)) - 1];

/** Kingdom data still says '스테이지 N' (goal texts); the screens say the village label instead ('1-1'). */
export const villageText = (t: string) => t.replace(/스테이지 (\d+)/g, (_, n: string) => expeditionStage(Number(n)).label);

/** Companions present in a kingdom: Ian from the start, then each visitor once their stage has a star. */
export function companionsOf(k: Pick<Kingdom, 'stars'>): Companion[] {
  return ['ian' as Companion, ...EXPEDITION.filter(s => s.visitor && (k.stars[s.stage - 1] ?? 0) > 0).map(s => s.visitor!)];
}
/** Keeper of a town building, if they have arrived. */
export function keeperOf(k: Pick<Kingdom, 'stars'>, building: Upgrade): Companion | null {
  return companionsOf(k).find(c => COMPANIONS[c].keeper === building) ?? null;
}

/** What a first clear of `stage` tells the player: the visitor, and the chapter or campaign end. */
export function firstClearNews(stage: number): { visitor?: Companion; chapter?: { title: string; text: string } } {
  const s = expeditionStage(stage);
  const chapter = stage === REGIONS.forest.stages[1]
    ? { title: '청록의 숲을 지켰어요!', text: '거점에 서리산맥의 새로운 구조 요청이 도착했어요.' }
    : stage === STAGE_COUNT ? { title: '서리산맥을 지켰어요!', text: '두 지역에 평화가 찾아왔어요. 두 지역 원정 완료!' } : undefined;
  return { visitor: s.visitor, chapter };
}

// ---------- one-time import of the old 원정 save ----------
export const LEGACY_CAMPAIGN_KEY = 'playground:defense:v1';
export const LEGACY_IMPORT_KEY = 'arcana-rush:legacy-import:v1';
/** Old village id (1-8) → Rush stage. Old 1-4 (고목왕) is Rush 5; old 2-4 (서리군주) is Rush 10. */
export const LEGACY_STAGE: readonly number[] = [1, 2, 3, 5, 6, 7, 8, 10];
/** Imported stars stop at the end of the forest so nobody lands in front of the stage-6 wall without the growth for it. */
export const LEGACY_STAR_CAP = REGIONS.forest.stages[1];
export const LEGACY_GOLD_CAP = 800;
export const LEGACY_SHARDS_PER_TRAINING = 3;

export interface LegacyImport { villages: number; stagesStarred: number; food: number; wood: number; shards: number }
const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : lo);

/** Fold an old campaign save into a kingdom. Returns null when there is nothing to bring over (no save, malformed, or
 * no progress). Never lowers anything: stars only rise to 1, resources and shards only add. Perks are not touched
 * (a perk above the castle level would make the kingdom parser reset the save). */
export function importLegacyCampaign(k: Kingdom, raw: string | null): { kingdom: Kingdom; report: LegacyImport } | null {
  if (!raw) return null;
  let v: { version?: unknown; gold?: unknown; cleared?: unknown; training?: unknown; selectedHero?: unknown };
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v !== 'object' || v.version !== 1) return null;
  const cleared = Array.isArray(v.cleared) ? v.cleared.filter((x): x is number => Number.isInteger(x) && x >= 1 && x <= LEGACY_STAGE.length) : [];
  const villages = new Set(cleared).size;
  const gold = int(v.gold, 0, 1e7), training = int(v.training, 0, 5);
  if (villages === 0 && gold === 0 && training === 0) return null;
  const furthest = villages ? Math.max(...cleared.map(c => LEGACY_STAGE[c - 1])) : 0;
  const upto = Math.min(furthest, LEGACY_STAR_CAP);
  const stars = k.stars.map((s, i) => (i < upto ? Math.max(s, 1) : s));
  const stagesStarred = stars.filter((s, i) => s > 0 && k.stars[i] === 0).length;
  const res = Math.min(gold, LEGACY_GOLD_CAP), shards = training * LEGACY_SHARDS_PER_TRAINING;
  const hero = v.selectedHero === 'dwarf' && stars[1] > 0 ? 'bron' : k.hero;
  return {
    kingdom: { ...k, stars, food: k.food + res, wood: k.wood + res, shards: k.shards + shards, hero, perks: { ...k.perks }, battles: { ...k.battles }, heroLv: { ...k.heroLv }, talent: { ...k.talent }, rewarded: [...k.rewarded] },
    report: { villages, stagesStarred, food: res, wood: res, shards },
  };
}
