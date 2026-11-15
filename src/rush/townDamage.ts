/** Read-only damage cues shared by independently owned hero/town materials.
 * One controller per entity. Simulation ticks alone advance the cue: 60 ticks/s.
 */
export type DamageStage = 'healthy' | 'damaged' | 'critical' | 'destroyed';
export type DamageVisual = {
  stage: DamageStage;
  /** Neutral multipliers preserve the model's vertex/team colours. */
  tint: number;
  /** Warm orange only; never a full white flash. */
  emissive: number;
  emissiveIntensity: number;
  pulse: number;
};

export const DAMAGE_PULSE_SECONDS = .22;
/** At most 1.25 pulses/s even when many enemies attack together. */
export const DAMAGE_REFRACTORY_TICKS = 48;
const TINT: Record<DamageStage, number> = {
  healthy: 0xffffff, damaged: 0xc9c4be, critical: 0x9d9690, destroyed: 0x6e6864,
};

export class TownDamage {
  private battle: object | undefined;
  private previousTick = -1;
  private previousHp = 0;
  private hitTick = -Infinity;
  private lastPulseTick = -Infinity;

  /** `battle` is the stable simulation state object, not a per-frame wrapper. */
  update(battle: object, tick: number, hp: number, maxHp: number, reducedMotion = false): DamageVisual {
    // Invalid debug/loading samples must not poison later simulation samples.
    if (!Number.isFinite(tick) || tick < 0 || !Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
      this.battle = undefined;
      this.hitTick = this.lastPulseTick = -Infinity;
      return { stage: 'healthy', tint: TINT.healthy, emissive: 0xff762d, emissiveIntensity: 0, pulse: 0 };
    }
    const frame = Math.floor(tick);
    const reset = battle !== this.battle || frame < this.previousTick;
    if (reset) {
      this.hitTick = this.lastPulseTick = -Infinity;
    } else if (hp > this.previousHp) {
      this.hitTick = -Infinity; // Healing cancels the hit but cannot bypass the flash rate limit.
    } else if (hp < this.previousHp && hp > 0 && frame - this.lastPulseTick >= DAMAGE_REFRACTORY_TICKS) {
      this.lastPulseTick = frame;
      this.hitTick = reducedMotion ? -Infinity : frame;
    }
    this.battle = battle;
    this.previousTick = frame;
    this.previousHp = hp;
    // Enabling reduced motion cancels the current pulse; disabling it never revives a queued hit.
    if (reducedMotion || hp <= 0) this.hitTick = -Infinity;
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const stage: DamageStage = ratio <= 0 ? 'destroyed' : ratio <= .3 ? 'critical' : ratio <= .65 ? 'damaged' : 'healthy';
    const elapsed = (frame - this.hitTick) / 60;
    const pulse = Math.max(0, 1 - elapsed / DAMAGE_PULSE_SECONDS);
    return { stage, tint: TINT[stage], emissive: 0xff762d, emissiveIntensity: pulse * .38, pulse };
  }
}
