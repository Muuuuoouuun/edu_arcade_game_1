import { createKingdom, parseKingdom, serializeKingdom, type Kingdom } from './kingdom.ts';

export const RUSH_KINGDOM_KEY = 'arcana-rush:kingdom:v1';
export type KingdomStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Keep an independent snapshot: callers own their copy and commit it explicitly. */
function copy(k: Kingdom): Kingdom {
  return { ...k, perks: { ...k.perks }, battles: { ...k.battles }, stars: [...k.stars], heroLv: { ...k.heroLv }, talent: { ...k.talent }, rewarded: [...k.rewarded] };
}

/**
 * Preserve unsaved progress in this page when storage is blocked. The browser
 * can recover later; a subsequent successful save clears the warning. When the
 * very first read failed, never overwrite an unseen existing save automatically.
 */
export function createKingdomStore(getStorage: () => KingdomStorage) {
  let memory: Kingdom | null = null;
  let pending = false;
  let unavailable = false;
  let unknownInitialSave = true;

  function loadKingdom(now = Date.now()): Kingdom {
    if (pending && memory) return copy(memory);
    try {
      const k = parseKingdom(getStorage().getItem(RUSH_KINGDOM_KEY), now);
      memory = copy(k);
      unavailable = false;
      unknownInitialSave = false;
      return k;
    } catch {
      unavailable = true;
      pending = true;
      if (!memory) {
        memory = createKingdom(now);
        unknownInitialSave = true;
      }
      return copy(memory);
    }
  }

  function saveKingdom(k: Kingdom): boolean {
    const encoded = serializeKingdom(k);
    memory = copy(k);
    try {
      const storage = getStorage();
      if (unknownInitialSave) {
        const existing = storage.getItem(RUSH_KINGDOM_KEY);
        if (existing !== null && existing !== encoded) {
          pending = true;
          unavailable = true;
          return false;
        }
      }
      storage.setItem(RUSH_KINGDOM_KEY, encoded);
      pending = false;
      unavailable = false;
      unknownInitialSave = false;
      return true;
    } catch {
      pending = true;
      unavailable = true;
      return false;
    }
  }

  return { loadKingdom, saveKingdom, storageUnavailable: () => unavailable };
}
