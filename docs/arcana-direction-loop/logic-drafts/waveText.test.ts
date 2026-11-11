// DRAFT test (cycle 88). Copy to src/games/defense/waveText.test.ts and add it to the npm test list. Checked on main b175a9f.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bossApproachNotice, forecastTip, josa, nextVisitorLine, waveHasSurge } from './waveText.ts';
import { ENEMIES, HEROES, STAGES } from './data.ts';
import { DIFFICULTY_ORDER } from './difficulty.ts';
import { actDefense, createDefense } from './engine.ts';

test('the particle follows the last syllable of every hero and enemy name', () => {
  assert.deepEqual(Object.values(HEROES).map(hero => josa(hero.name, '이/가')), ['이안이', '리엘이', '브론이', '청운이', '카르가', '루나가']);
  assert.deepEqual(Object.values(ENEMIES).map(enemy => josa(enemy.name, '이/가')),
    ['새싹 도적이', '나무 병사가', '빙결 기사가', '돌 갑옷병이', '금속 병사가', '절연 슬라임이', '고목왕이', '서리늑대가', '서리군주가']);
  assert.equal(josa('고목왕', '을/를'), '고목왕을');
  assert.equal(josa('서리군주', '은/는'), '서리군주는');
  assert.equal(josa('루나', '과/와'), '루나와');
  assert.deepEqual(['리엘', '청운', '루나'].map(name => josa(name, '으로/로')), ['리엘로', '청운으로', '루나로']);
  assert.equal(josa('2-1', '이/가'), '2-1가'); // not Hangul: no final consonant assumed
});

test('the boss notice and the village line read correctly for every name they can carry', () => {
  assert.equal(bossApproachNotice(ENEMIES.boss.name), '고목왕이 다가옵니다. 두 거점을 지켜주세요!');
  assert.equal(bossApproachNotice(ENEMIES.frostboss.name), '서리군주가 다가옵니다. 두 거점을 지켜주세요!');
  const lines = STAGES.filter(stage => stage.visitor).map(stage => nextVisitorLine(stage.label, HEROES[stage.visitor!].name));
  assert.deepEqual(lines, ['1-1 방어 후 리엘이 찾아옵니다.', '1-2 방어 후 브론이 찾아옵니다.', '1-3 방어 후 청운이 찾아옵니다.',
    '2-1 방어 후 카르가 찾아옵니다.', '2-3 방어 후 루나가 찾아옵니다.']);
});

test('the scout tip announces the surge exactly on the waves that have one', () => {
  for (let stage = 1; stage <= STAGES.length; stage++) for (let wave = 1; wave <= 4; wave++) for (const difficulty of DIFFICULTY_ORDER) {
    const tip = forecastTip(stage, wave, difficulty), bossWave = STAGES[stage - 1].expanded && wave === 4;
    assert.equal(waveHasSurge(stage, wave, difficulty), wave === 2 || wave === 3, `${stage}-${wave} ${difficulty}`);
    assert.equal(tip.includes('무리'), !bossWave && (wave === 2 || wave === 3), `${stage}-${wave} ${difficulty}: ${tip}`);
    assert.equal(tip.endsWith('출현'), bossWave);
    if (difficulty === 'veteran' && !bossWave) assert.match(tip, /빠른 증원/);
  }
  assert.equal(forecastTip(1, 1), '적 편성과 약점 확인');
  assert.equal(forecastTip(1, 2), '후반에 무리가 몰려와요');
  assert.equal(forecastTip(4, 4), '고목왕 출현');
});

// Documents main b175a9f. Drop this test when engine.ts uses bossApproachNotice().
test('today the forest finale prints the wrong particle', () => {
  let state = createDefense(4, 'mage');
  state = actDefense({ ...state, phase: 'intermission', wave: 3 }, { type: 'start-wave' });
  assert.equal(state.notice, '고목왕가 다가옵니다. 두 거점을 지켜주세요!');
});
