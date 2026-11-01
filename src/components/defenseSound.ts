import type { DefenseState } from '../games/defense/types.ts';
import type { CombatSoundKind } from '../lib/sound.ts';

export type CombatCue = { kind: CombatSoundKind; pan: number };
const pan = (x: number) => (x - 450) / 450;

/**
 * One cue per frame, highest priority first. A village breach is the only event
 * that costs the player progress, so it must never be masked by a dash or skill
 * landing on the same frame.
 */
export function combatCueFor(before: DefenseState, next: DefenseState): CombatCue | null {
  if (before === next || next.paused) return null;
  const fresh = next.effects.filter(effect => effect.id >= before.nextId);
  const breach = fresh.find(effect => effect.kind === 'breach');
  if (breach) return { kind: 'breach', pan: pan(breach.to.x) };
  if (fresh.some(effect => effect.kind === 'dash')) return { kind: 'slash', pan: pan(next.heroPosition.x) };
  const heavy = fresh.find(effect => effect.kind === 'skill' || effect.kind === 'interrupt' || effect.kind === 'freeze' || effect.kind === 'shockwave');
  if (heavy) return { kind: heavy.kind === 'freeze' ? 'freeze' : heavy.kind === 'shockwave' ? 'impact' : 'skill', pan: pan(heavy.to.x) };
  const shell = next.projectiles.find(projectile => projectile.id >= before.nextId && projectile.kind === 'shell');
  if (shell) return { kind: 'cannon', pan: pan(shell.from.x) };
  const strike = next.attacks.find(attack => attack.fired && (attack.kind === 'melee' || attack.kind === 'slam') && !before.attacks.find(old => old.id === attack.id)?.fired);
  if (strike) return { kind: strike.element === 'impact' ? 'impact' : 'slash', pan: pan(strike.to.x) };
  const hit = fresh.find(effect => effect.kind === 'impact' || effect.kind === 'chain');
  if (hit) return { kind: hit.element === 'impact' || hit.element === 'physical' ? 'impact' : 'cast', pan: pan(hit.to.x) };
  const shot = next.projectiles.find(projectile => projectile.id >= before.nextId);
  if (shot) return { kind: shot.kind === 'arrow' ? 'arrow' : 'cast', pan: pan(shot.from.x) };
  return null;
}
