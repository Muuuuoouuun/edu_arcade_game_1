import { getWavePlan } from './difficulty.ts';
import type { Difficulty, EnemyKind } from './types.ts';

export type FieldNote = Readonly<{
  id: 'wood' | 'ice' | 'stone' | 'metal' | 'insulator';
  material: string;
  title: string;
  combat: string;
  nature: string;
  kinds: readonly EnemyKind[];
}>;

/** These are optional explanations, never combat modifiers or learning gates.
 * Fictional creatures such as frostwolves are deliberately not material facts. */
const NOTES: readonly FieldNote[] = [
  {
    id: 'wood', material: '나무', title: '불꽃이 통하는 상대',
    combat: '나무와 식물 적은 불에 약하고 물 공격에는 강해요.',
    nature: '나무는 충분한 열과 산소가 있으면 타요. 수분과 상태에 따라 잘 타는 정도가 달라져요.',
    kinds: ['sprout', 'wood', 'boss'],
  },
  {
    id: 'ice', material: '얼음', title: '얼음 갑옷을 깨는 법',
    combat: '얼음 갑옷을 입은 기사와 군주에게는 불과 충격 공격이 잘 통해요.',
    nature: '얼음은 열을 받아 녹을 수 있고, 충분한 충격을 받으면 깨질 수 있어요.',
    kinds: ['ice', 'frostboss'],
  },
  {
    id: 'stone', material: '돌', title: '단단한 갑옷의 빈틈',
    combat: '돌 갑옷병은 불에 강하지만 충격 공격에 약해요.',
    nature: '돌은 나무처럼 타지 않지만, 큰 온도 변화나 충격으로 갈라질 수 있어요.',
    kinds: ['stone'],
  },
  {
    id: 'metal', material: '금속', title: '번개를 잇는 연결점',
    combat: '금속이나 젖은 적을 맞힌 연쇄 번개는 가까운 적에게 한 번 더 이어져요. 절연 슬라임은 젖어도 연결을 끊어요.',
    nature: '대부분의 금속은 전기가 잘 통하는 도체예요. 아주 순수한 물은 전기가 잘 통하지 않지만, 소금·미네랄이 녹으면 더 잘 통해요.',
    kinds: ['metal'],
  },
  {
    id: 'insulator', material: '절연', title: '연쇄를 끊는 상대',
    combat: '절연 슬라임은 번개 피해를 덜 받고, 젖어도 연쇄 번개를 막아요.',
    nature: '고무와 유리 같은 절연 재료는 전류가 잘 흐르지 않아요. 전기가 통하는 정도는 재료와 상태에 따라 달라요.',
    kinds: ['insulator'],
  },
];

/** Match the real wave roster, so a new region does not reveal unrelated notes.
 * No wave means the current stage's roster, rather than future stages or saves. */
export function fieldNotesForStage(stage: number, wave?: number, difficulty: Difficulty = 'standard'): FieldNote[] {
  const waves = wave === undefined ? [1, 2, 3, 4] : [wave];
  const roster = new Set(waves.flatMap(index => getWavePlan(stage, index, difficulty)));
  return NOTES.flatMap(note => {
    const kinds = note.kinds.filter(kind => roster.has(kind));
    return kinds.length ? [{ ...note, kinds }] : [];
  });
}
