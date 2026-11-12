import { AnimationClip, AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type Object3D } from 'three';
import type { HeroKind } from './data.ts';

export const HERO_ATTACK: Record<HeroKind, string> = {
  ranger: 'gecko-seed-shot', bron: 'dwarf-hammer-attack', bear: 'polar-bear-attack',
};
/** Distance-driven lower body, independent of the upper-body attack. Shared GLB clips also play in the workshop. */
export class HeroMotion {
  readonly mixer: AnimationMixer;
  readonly shot: AnimationAction | null;
  private idle: AnimationAction | null;
  private gait: AnimationAction | null;
  private battle: object | undefined;
  private last = { x: 0, z: 0 };
  private phase = 0;
  private weight = 0;
  moving = false;
  constructor(model: Object3D, clips: AnimationClip[], kind: HeroKind) {
    this.mixer = new AnimationMixer(model);
    const attack = clips.find(c => c.name === HERO_ATTACK[kind]);
    this.shot = attack ? this.mixer.clipAction(attack).setLoop(LoopOnce, 1) : null;
    const idle = clips.find(c => c.name === `${kind}-idle`);
    // Exported idle clips include neutral leg keys. Exclude them so they cannot halve the gait's stride/lift.
    const idleUpper = idle ? new AnimationClip(idle.name, idle.duration, idle.tracks.filter(t => !/^leg-(left|right)\./.test(t.name))) : null;
    this.idle = idleUpper ? this.mixer.clipAction(idleUpper).setLoop(LoopRepeat, Infinity).play() : null;
    const walk = clips.find(c => c.name === `${kind}-walk`);
    // Only the legs own locomotion during a shot; duplicate body/head tracks would dilute its authored recoil.
    const legTracks = walk?.tracks.filter(t => /^leg-(left|right)\./.test(t.name)) ?? [];
    this.gait = legTracks.length ? this.mixer.clipAction(new AnimationClip(`${kind}-gait`, walk!.duration, legTracks)) : null;
    if (this.gait) { this.gait.play(); this.gait.paused = true; this.gait.setEffectiveWeight(0); }
  }
  sync(battle: object, x: number, z: number, dt: number, reduced = false, alive = true) {
    if (battle !== this.battle) {
      this.battle = battle; this.last = { x, z }; this.phase = 0; this.weight = 0;
      this.shot?.stop(); this.idle?.reset().play();
    }
    // Pauses and hit-stop preserve the exact pose, including the walking phase.
    if (dt <= 0) return;
    const distance = Math.hypot(x - this.last.x, z - this.last.z);
    this.last = { x, z };
    this.moving = alive && distance > .0001 && distance < 2;
    // 0.8 game metres per two-foot cycle. Input speed and slope traversal therefore cannot make feet idle in motion.
    if (this.moving && !reduced) this.phase = (this.phase + distance / .8) % 1;
    this.weight = reduced || !alive ? 0 : this.moving ? 1 : Math.max(0, this.weight - dt * 10);
    if (this.gait) { this.gait.time = this.phase * this.gait.getClip().duration; this.gait.setEffectiveWeight(this.weight); }
    this.idle?.setEffectiveWeight(reduced || !alive || this.shot?.isRunning() ? 0 : 1);
    this.mixer.update(dt);
  }
  info() { return { moving: this.moving, phase: this.phase, gaitWeight: this.weight, idle: !!this.idle, walk: !!this.gait, attack: !!this.shot }; }
}
