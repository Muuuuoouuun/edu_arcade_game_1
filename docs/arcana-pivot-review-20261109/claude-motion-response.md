## Recommendations (model‑lab only)

1. **Single owner for the dwarf's nodes.** `'none' | 'idle' | 'mixer'`. The idle controller only writes while it owns; before any `play()` or scrub it `restore()`s rest values, then the mixer claims. Reason: three's mixer calls `PropertyMixer.saveOriginalState()` when an action activates and `restoreOriginalState()` on `stop()`, so whatever idle left on `body.position.y` at activation would be "restored" later as if it were rest. Restoring first keeps the saved state = authored rest.
2. **Rest capture happens once, at load, before any mixer action**, from the real nodes (`body`, `head`, `guard-arm`, `hammer-arm`). Store scalars (y, rx, ry, rz), not Vector3s. `hammer` stays untouched — it is a child of `hammer-forearm` → `hammer-arm`, so attachment is preserved by hierarchy. Feet are siblings under the root, so they are never moved.
3. **Idle is opt‑in, off under reduced motion, and is just a weight 0→1 ramp over a phase accumulated from frame `dt`.** rAF already stops on hidden tabs; add a `visibilitychange` reset of `last` so the clamp doesn't inject a 1 s step on return.
4. **Review poses reuse the authored clip** — named percentages into `dwarf-hammer-attack`, routed through the existing scrub path (`reset().play(); paused=true; time=…; mixer.update(0)`), so no second clip, no extraction. The numbers below are placeholders to tune against the GLB.
5. **Tower recoil**: leave the current procedural envelope as is; it only touches tower `parts`, and dwarf has none. Don't route it through the owner — no shared nodes, nothing to gain.
6. **Reset safety**: idle is created inside `select` after the `ticket===generation` check and nulled in `clearModel`. Render gating adds `idleMoving` so the 30 Hz throttle still applies.

## `model-lab-idle.ts`

```ts
import type { Object3D } from 'three';

export type IdleRig = { body: Object3D; head: Object3D; guardArm: Object3D; hammerArm: Object3D };
type Rest = { object: Object3D; y: number; rx: number; ry: number; rz: number };

const TAU = Math.PI * 2;
// Authoring units (body y≈1.15). Keep these tiny: the lab normalizes height to 4.6.
const BREATH_HZ = .21, SWAY_HZ = .12, LIFT = .011, LEAN = .016, NOD = .012, ARM = .022, FADE = .4;

export class IdleController {
  private readonly rest: Rest[];
  private phase = 0;
  private weight = 0;
  enabled = false;

  constructor(private readonly rig: IdleRig) {
    // Capture rest BEFORE any mixer action activates.
    this.rest = [rig.body, rig.head, rig.guardArm, rig.hammerArm].map(object => ({
      object, y: object.position.y, rx: object.rotation.x, ry: object.rotation.y, rz: object.rotation.z,
    }));
  }

  /** Returns true when something was written this frame. No allocations. */
  update(dt: number): boolean {
    const target = this.enabled ? 1 : 0;
    if (this.weight === target && target === 0) return false;
    this.weight += Math.sign(target - this.weight) * Math.min(Math.abs(target - this.weight), dt / FADE);
    this.phase += dt;
    const w = this.weight;
    if (w <= 0) { this.restore(); return true; }

    const breath = Math.sin(this.phase * TAU * B