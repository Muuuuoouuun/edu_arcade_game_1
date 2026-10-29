import test from 'node:test';
import assert from 'node:assert/strict';
import { availableTheme, isDefenseTheme, readDefenseTheme, themeUnlocked, THEME_STORAGE_KEY, writeDefenseTheme } from './themes.ts';

test('cosmetics unlock at their completed expedition without changing progress', () => {
  const cleared = [1, 2, 3];
  assert.equal(themeUnlocked('verdant', []), true);
  assert.equal(themeUnlocked('steel', [1]), false);
  assert.equal(themeUnlocked('steel', cleared), true);
  assert.equal(themeUnlocked('unryeong', [1, 2]), false);
  assert.equal(availableTheme('unryeong', cleared), 'unryeong');
  assert.equal(availableTheme('twilight', cleared), 'verdant');
  assert.equal(availableTheme('twilight', [1, 2, 3, 4, 5, 6, 7, 8]), 'twilight');
  assert.deepEqual(cleared, [1, 2, 3]);
});

test('theme preference never writes campaign or reward storage', () => {
  const original = '{"version":1,"gold":520,"cleared":[1,2,3]}';
  const data = new Map([['playground:defense:v1', original]]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  assert.equal(writeDefenseTheme('steel', storage), true);
  assert.equal(readDefenseTheme(storage), 'steel');
  assert.equal(data.get('playground:defense:v1'), original);
  assert.deepEqual([...data.keys()], ['playground:defense:v1', THEME_STORAGE_KEY]);
});

test('invalid, legacy and object-prototype preference names safely fall back', () => {
  for (const raw of ['garbage', 'null', '[]', '"steel"', '{"version":2,"theme":"steel"}', '{"version":1,"theme":"constructor"}', '{"version":1,"theme":"__proto__"}']) {
    assert.equal(readDefenseTheme({ getItem: () => raw, setItem() {} }), 'verdant');
  }
  assert.equal(isDefenseTheme('toString'), false);
  assert.equal(availableTheme({ theme: 'steel' }, [1, 2]), 'verdant');
});

test('unavailable storage cannot block entering camp or changing the current appearance', () => {
  const storage = { getItem(): string { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(readDefenseTheme(storage), 'verdant');
  assert.equal(writeDefenseTheme('verdant', storage), false);
});
