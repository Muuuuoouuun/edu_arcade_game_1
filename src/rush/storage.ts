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

/** Rush's own settings (1.0, completion C3): effects, music and vibration, saved apart from the kingdom. */
export const RUSH_SETTINGS_KEY = 'arcana-rush:settings:v1';
export type RushSettings = { sfx: boolean; music: boolean; haptics: boolean };
export const DEFAULT_SETTINGS: RushSettings = { sfx: true, music: true, haptics: true };
/** Unknown, broken or partial saves fall back field by field, so one bad value never resets the rest. */
export function parseSettings(raw: string | null, fallback: RushSettings = DEFAULT_SETTINGS): RushSettings {
  let v: unknown = null;
  try { v = JSON.parse(raw ?? 'null'); } catch { v = null; }
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof RushSettings, unknown>>;
  const pick = (key: keyof RushSettings) => (typeof o[key] === 'boolean' ? o[key] as boolean : fallback[key]);
  return { sfx: pick('sfx'), music: pick('music'), haptics: pick('haptics') };
}
export const serializeSettings = (s: RushSettings) => JSON.stringify({ sfx: s.sfx, music: s.music, haptics: s.haptics });
