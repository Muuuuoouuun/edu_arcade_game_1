import test from 'node:test';
import assert from 'node:assert/strict';
import { createKingdom, serializeKingdom, settleBattle, settleEndless, upgrade } from './kingdom.ts';
import { createRush } from './sim.ts';
import { createKingdomStore, RUSH_KINGDOM_KEY } from './storage.ts';

function memoryStorage(initial: string | null = null) {
  let raw = initial;
  let readsBlocked = false;
  let writesBlocked = false;
  return {
    getItem(key: string) { assert.equal(key, RUSH_KINGDOM_KEY); if (readsBlocked) throw new Error('read blocked'); return raw; },
    setItem(key: string, value: string) { assert.equal(key, RUSH_KINGDOM_KEY); if (writesBlocked) throw new Error('write blocked'); raw = value; },
    blockReads(value: boolean) { readsBlocked = value; },
    blockWrites(value: boolean) { writesBlocked = value; },
    get raw() { return raw; },
  };
}

test('write failure keeps upgrades in the session instead of reloading older storage', () => {
  const initial = createKingdom(0), storage = memoryStorage(serializeKingdom(initial));
  const store = createKingdomStore(() => storage);
  const upgradeResult = upgrade(store.loadKingdom(0), 'attack', 0);
  storage.blockWrites(true);
  assert.equal(store.saveKingdom(upgradeResult), false);
  assert.equal(store.storageUnavailable(), true);
  assert.equal(store.loadKingdom(0).perks.attack, 1);
  assert.equal(JSON.parse(storage.raw!).perks.attack, 0, 'old disk data was not treated as current');
  const outside = store.loadKingdom(0); outside.perks.attack = 5;
  assert.equal(store.loadKingdom(0).perks.attack, 1, 'the caller cannot mutate the saved snapshot');
  storage.blockWrites(false);
  assert.equal(store.saveKingdom(store.loadKingdom(0)), true);
  assert.equal(store.storageUnavailable(), false);
  assert.equal(createKingdomStore(() => storage).loadKingdom(0).perks.attack, 1);
});

test('unreadable initial storage never causes an unseen save to be overwritten', () => {
  const original = createKingdom(0); original.food = 500;
  const storage = memoryStorage(serializeKingdom(original)); storage.blockReads(true);
  const store = createKingdomStore(() => storage);
  const session = upgrade(store.loadKingdom(0), 'attack', 0);
  assert.equal(store.storageUnavailable(), true);
  assert.equal(store.saveKingdom(session), false);
  storage.blockReads(false);
  assert.equal(store.loadKingdom(0).perks.attack, 1, 'session work survives read access returning');
  assert.equal(store.saveKingdom(session), false, 'an unknown previous save requires reconciliation');
  assert.equal(storage.raw, serializeKingdom(original));
  assert.equal(store.storageUnavailable(), true);
});

test('saving before the initial read does not overwrite an unseen existing save', () => {
  const original = createKingdom(0); original.food = 500;
  const storage = memoryStorage(serializeKingdom(original));
  const store = createKingdomStore(() => storage);
  const session = upgrade(createKingdom(0), 'attack', 0);
  assert.equal(store.saveKingdom(session), false);
  assert.equal(store.storageUnavailable(), true);
  assert.equal(storage.raw, serializeKingdom(original));
  assert.equal(store.loadKingdom(0).perks.attack, 1);
});

test('new empty storage can recover after an initial read failure', () => {
  const storage = memoryStorage(); storage.blockReads(true);
  const store = createKingdomStore(() => storage);
  const k = upgrade(store.loadKingdom(0), 'attack', 0);
  assert.equal(store.saveKingdom(k), false);
  storage.blockReads(false);
  assert.equal(store.saveKingdom(store.loadKingdom(0)), true);
  assert.equal(store.storageUnavailable(), false);
  assert.equal(createKingdomStore(() => storage).loadKingdom(0).perks.attack, 1);
});

test('battle and endless rewards are each paid once when storage fails then recovers', () => {
  const storage = memoryStorage(serializeKingdom(createKingdom(0)));
  const store = createKingdomStore(() => storage);
  store.loadKingdom(0);
  storage.blockWrites(true);
  const battle = createRush(1); battle.phase = 'lost'; battle.wave = 2;
  const first = settleBattle(store.loadKingdom(0), 'battle-1', battle, 1);
  assert.equal(first.granted, true);
  assert.equal(store.saveKingdom(first.kingdom), false);
  const duplicate = settleBattle(store.loadKingdom(0), 'battle-1', battle, 1);
  assert.equal(duplicate.granted, false);
  assert.equal(duplicate.kingdom.food, first.kingdom.food);
  const endless = createRush(2); endless.phase = 'lost'; endless.wave = 6;
  const firstEndless = settleEndless(store.loadKingdom(0), 'endless-1', endless);
  assert.equal(firstEndless.granted, true);
  assert.equal(store.saveKingdom(firstEndless.kingdom), false);
  assert.equal(settleEndless(store.loadKingdom(0), 'endless-1', endless).granted, false);
  storage.blockWrites(false);
  assert.equal(store.saveKingdom(store.loadKingdom(0)), true);
  const restored = createKingdomStore(() => storage).loadKingdom(0);
  assert.equal(settleBattle(restored, 'battle-1', battle, 1).granted, false);
  assert.equal(settleEndless(restored, 'endless-1', endless).granted, false);
});

test('rush settings (1.0): defaults, field-by-field fallback, round trip', async () => {
  const { parseSettings, serializeSettings, DEFAULT_SETTINGS } = await import('./storage.ts');
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('not json'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"music":false,"sfx":"loud"}'), { sfx: true, music: false, haptics: true }, 'a bad field falls back alone');
  const fallback = { sfx: false, music: true, haptics: false };
  assert.deepEqual(parseSettings(null, fallback), fallback, 'first run follows the given fallback');
  const s = { sfx: false, music: false, haptics: true };
  assert.deepEqual(parseSettings(serializeSettings(s)), s);
});
