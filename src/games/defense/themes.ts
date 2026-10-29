/** Cosmetic settlement styles. Combat data and campaign saves never depend on these. */
export type DefenseThemeId = 'verdant' | 'steel' | 'unryeong' | 'twilight';
export const THEME_ORDER: DefenseThemeId[] = ['verdant', 'steel', 'unryeong', 'twilight'];
type DefenseTheme = {
  id: DefenseThemeId; name: string; description: string; unlockStage: number;
  image: string; thumbnail: string; accent: string; ink: string;
};
function theme(id: DefenseThemeId, name: string, description: string, unlockStage: number, accent: string, ink: string): DefenseTheme {
  return { id, name, description, unlockStage, accent, ink,
    image: `/defense/themes/${id}.webp`, thumbnail: `/defense/themes/${id}-small.webp` };
}
export const DEFENSE_THEMES: Record<DefenseThemeId, DefenseTheme> = {
  verdant: theme('verdant', '녹음 성채', '거목 아래 모이는 수비대 · 뿌리벽과 초록 깃발', 0, '#a9cd8a', '#193d37'),
  steel: theme('steel', '청강 요새', '대장장이의 손길 · 강철 성문과 황동 장식', 2, '#e3bd79', '#273a47'),
  unryeong: theme('unryeong', '운령 산성', '산등성이를 두른 성벽 · 기와와 주홍 부적', 3, '#efa07c', '#243e46'),
  twilight: theme('twilight', '황혼성', '두 지역을 지킨 기념 · 달빛 첨탑과 수정', 8, '#cbb5ef', '#36334e'),
};
export function isDefenseTheme(value: unknown): value is DefenseThemeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DEFENSE_THEMES, value);
}
export function themeUnlocked(id: DefenseThemeId, cleared: readonly number[]): boolean {
  const stage = DEFENSE_THEMES[id].unlockStage;
  return stage === 0 || cleared.includes(stage);
}
export function availableTheme(value: unknown, cleared: readonly number[]): DefenseThemeId {
  return isDefenseTheme(value) && themeUnlocked(value, cleared) ? value : 'verdant';
}

export const THEME_STORAGE_KEY = 'playground:defense:appearance:v1';
type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;
/** Separate versioned preference: old campaign data remains byte-for-byte intact. */
export function readDefenseTheme(storage?: ThemeStorage): DefenseThemeId {
  try {
    const data: unknown = JSON.parse((storage ?? localStorage).getItem(THEME_STORAGE_KEY) || 'null');
    if (data && typeof data === 'object' && 'version' in data && data.version === 1 && 'theme' in data && isDefenseTheme(data.theme)) return data.theme;
  } catch { /* Missing/restricted storage keeps the default appearance playable. */ }
  return 'verdant';
}
export function writeDefenseTheme(id: DefenseThemeId, storage?: ThemeStorage): boolean {
  try { (storage ?? localStorage).setItem(THEME_STORAGE_KEY, JSON.stringify({ version: 1, theme: id })); return true; }
  catch { return false; }
}
