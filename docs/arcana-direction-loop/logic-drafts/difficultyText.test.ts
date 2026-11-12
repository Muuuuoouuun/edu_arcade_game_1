// DRAFT test (cycle 85). Copy to src/games/defense/difficultyText.test.ts and add it to the npm test list. Checked on main b175a9f.
import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptionGaps, difficultyClaims, difficultyDescription } from './difficultyText.ts';
import { DIFFICULTIES, DIFFICULTY_ORDER } from './difficulty.ts';

test('claims are read from the tables the engine uses', () => {
  assert.deepEqual(difficultyClaims('standard'), {
    weaker: false, stronger: false, slower: false, faster: false, sparser: false, denser: false,
    moreEnemies: 0, startingCoins: 0, rewardPercent: 0,
  });
  const relaxed = difficultyClaims('relaxed'), veteran = difficultyClaims('veteran');
  assert.ok(relaxed.weaker && relaxed.slower && relaxed.sparser && relaxed.moreEnemies === 0);
  assert.equal(relaxed.startingCoins, DIFFICULTIES.relaxed.startingCoins);
  assert.equal(relaxed.rewardPercent, 0);
  assert.ok(veteran.stronger && veteran.faster && veteran.denser);
  assert.equal(veteran.moreEnemies, 12); // 2 + 3 + 3 + 4 per stage; the forest finale adds four more
  assert.equal(veteran.rewardPercent, 40);
});

test('the generated camp lines say everything the numbers change, and nothing else', () => {
  for (const mode of DIFFICULTY_ORDER) assert.deepEqual(descriptionGaps(difficultyDescription(mode), difficultyClaims(mode)), [], mode);
  assert.equal(difficultyDescription('relaxed'), '더 약하고 느린 적 · 시작 코인 +70 · 기본 보상');
  assert.equal(difficultyDescription('standard'), '익숙한 전투 균형 · 기본 보상');
  assert.equal(difficultyDescription('veteran'), '더 강하고 빠른 적, 더 많은 증원 · 기본 보상 +40%');
});

test('once first clears pay the same on every difficulty, only the replay reward carries the bonus', () => {
  assert.equal(difficultyDescription('veteran', true), '더 강하고 빠른 적, 더 많은 증원 · 재도전 보상 +40%');
  assert.equal(difficultyDescription('relaxed', true), difficultyDescription('relaxed'));
  assert.equal(difficultyDescription('standard', true), difficultyDescription('standard'));
});

// Documents main b175a9f. When DIFFICULTIES.description is replaced by difficultyDescription(), drop this test.
test('today only the veteran line leaves something out: the extra enemies', () => {
  assert.deepEqual(descriptionGaps(DIFFICULTIES.relaxed.description, difficultyClaims('relaxed')), []);
  assert.deepEqual(descriptionGaps(DIFFICULTIES.standard.description, difficultyClaims('standard')), []);
  assert.deepEqual(descriptionGaps(DIFFICULTIES.veteran.description, difficultyClaims('veteran')), ['더 많은 적: 빠짐']);
});
