const SPEED_KEY = 'arcana.battle-speed';

/** Speed a battle starts at. Only a stage the player has already cleared may
 * start fast, so first clears keep the 1x pace for new enemies and allies. */
export function startingSpeed(stage: number, cleared: readonly number[], stored: string | null): 1 | 2 {
  return cleared.includes(stage) && stored === '2' ? 2 : 1;
}

export function readSpeedPreference(): string | null {
  try { return localStorage.getItem(SPEED_KEY); } catch { return null; }
}

export function writeSpeedPreference(speed: number) {
  try { localStorage.setItem(SPEED_KEY, speed === 2 ? '2' : '1'); } catch { /* preference only */ }
}
