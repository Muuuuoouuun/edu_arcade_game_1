// Floating damage numbers (cycle 22): hits on the same enemy from the same kind of attacker, within a short
// window, add into one number instead of stacking new ones. Pure: main.ts owns the DOM side.

export const MERGE_WINDOW = 0.35; // seconds since the number appeared
export const POP_LIFE = 0.75;
/**
 * Numbers that would appear on top of a fresh one stack upward instead (area hits on a crowd). The area is an
 * ellipse because a number is wider than tall on screen (about 1.7 x 1 m at the phone camera).
 */
export const STACK = { rx: 1.6, rz: 1.0, recent: 0.3, step: 0.6, max: 4 } as const;
export const crowded = (ax: number, az: number, bx: number, bz: number) => ((ax - bx) / STACK.rx) ** 2 + ((az - bz) / STACK.rz) ** 2 < 1;

export interface PopSlot<T = unknown> {
  key: string; value: number; x: number; z: number; age: number; life: number; bumps: number;
  /** Extra height (m) so this number does not sit on top of a recent neighbour. */
  lift: number;
  /** Renderer handle (DOM element); untouched here. */
  view?: T;
}

/** Key for merging: attacker kind + enemy id. Hits without an enemy id never merge. */
export const popKey = (owner: string, enemyId: number | undefined) => (enemyId === undefined ? '' : `${owner}:${enemyId}`);

/**
 * Add one hit. Returns the slot that now shows it and whether it merged into an existing number.
 * A merged number keeps its age (so it still fades on time) but follows the enemy's latest position.
 */
export function addHit<T>(slots: PopSlot<T>[], key: string, damage: number, x: number, z: number): { slot: PopSlot<T>; merged: boolean } {
  if (key) {
    const open = slots.find(p => p.key === key && p.age < MERGE_WINDOW);
    if (open) { open.value += damage; open.x = x; open.z = z; open.bumps++; return { slot: open, merged: true }; }
  }
  const near = slots.filter(p => p.age < STACK.recent && crowded(p.x, p.z, x, z)).length;
  const slot: PopSlot<T> = { key, value: damage, x, z, age: 0, life: POP_LIFE, bumps: 0, lift: Math.min(near, STACK.max) * STACK.step };
  slots.push(slot);
  return { slot, merged: false };
}
