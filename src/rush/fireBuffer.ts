// Fire tap buffer (cycle 131). A tap reaches the sim on one step only; between shots (fireGap) or with an empty quiver
// that step cannot fire and the tap used to vanish, so fast tapping fired about every other tap. The buffer holds the
// last tap for a short time of game time and offers it again each step until the hero actually fires.
import type { Vec } from './data.ts';

/** How long a tap may wait, in game seconds: longer than a frame hitch, shorter than any hero's fire gap plus a beat. */
export const FIRE_BUFFER = 0.25;

type Aim = Vec | 'auto';
export class FireBuffer {
  private held: { aim: Aim; at: number } | null = null;
  private lapsed = false;
  /** This step's fire: a fresh tap (which replaces the held one), else the held tap while it is young enough. */
  take(fresh: Aim | undefined, t: number): Aim | undefined {
    if (fresh) this.held = { aim: fresh, at: t };
    else if (this.held && t - this.held.at > FIRE_BUFFER + 1e-9) { this.held = null; this.lapsed = true; }
    return this.held?.aim;
  }
  /** After the step: a shot spends the held tap. */
  settle(fired: boolean) { if (fired) this.held = null; }
  /** Cycle 137: whether a tap ran out without firing since the last call (empty quiver, hero down), so the button can
   * show that the press arrived but could not act. Reading it clears it. */
  expired() { const e = this.lapsed; this.lapsed = false; return e; }
  reset() { this.held = null; this.lapsed = false; }
}
