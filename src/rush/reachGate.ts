// Build-pill gate (cycle 149). The pills show while the hero is within reach of a tower or barricade site. Brushing a
// site's edge mid-fight flashed them for a few frames (half of all contacts in bot runs lasted under 0.15 s), so a site
// must hold for REACH_SHOW s of game time before its pills appear. Leaving or changing site hides them at once, so a
// pill on screen can always act. Display only: the sim's reach (and the E key) is unchanged.

export const REACH_SHOW = 0.2;

export class ReachGate {
  private key = '';
  private since = 0;
  /** `key`: the site in reach ('' for none) at game time `t`; true when its pills may show. */
  update(key: string, t: number): boolean {
    if (key !== this.key) { this.key = key; this.since = t; }
    return key !== '' && t - this.since >= REACH_SHOW - 1e-9;
  }
  reset() { this.key = ''; this.since = 0; }
}
