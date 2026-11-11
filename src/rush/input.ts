// Touch twin-stick + keyboard/mouse input. Produces one sim Command per fixed step.
// Touch: drag on the left half to move; on the attack/super buttons, tap = auto-aim, drag = aim, release = fire,
// drag back to the centre before releasing = cancel.
import { HERO, HEROES, type HeroKind, type Vec } from './data.ts';
import type { Command } from './sim.ts';
import type { AimPreview } from './render.ts';

const DEADZONE = 14;
const STICK_RADIUS = 56;
const AIM_RADIUS = 70;

type Elements = {
  surface: HTMLElement; stick: HTMLElement; knob: HTMLElement;
  fire: HTMLElement; superBtn: HTMLElement; build: HTMLElement; buildFrost: HTMLElement; startWave: HTMLElement;
};
type ButtonDrag = { id: number; cx: number; cy: number; v: Vec; aimed: boolean };

export class RushInput {
  aim: AimPreview = null;
  enabled = true;
  private keys = new Set<string>();
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickVec: Vec = { x: 0, z: 0 };
  private fireDrag: ButtonDrag | null = null;
  private superDrag: ButtonDrag | null = null;
  private mouse: Vec | null = null;
  private mouseActive = false;
  private pending: Command = {};
  private cleanups: (() => void)[] = [];

  constructor(private el: Elements, private groundPoint: (x: number, y: number) => Vec | null, private heroPos: () => Vec & { kind: HeroKind }) {
    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    // Movement stick and mouse aim share the play surface.
    on(el.surface, 'pointerdown', e => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') {
        this.mouseActive = true;
        this.updateMouse(e);
        if (e.button === 0) this.queueFireAtMouse();
        else if (e.button === 2) this.queueSuperAtMouse();
        return;
      }
      const rect = el.surface.getBoundingClientRect();
      if (this.stickId !== null || e.clientX - rect.left > rect.width * 0.55) return;
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      el.surface.setPointerCapture?.(e.pointerId);
      el.stick.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`;
      el.stick.classList.add('active');
      this.setKnob(0, 0);
      e.preventDefault();
    });
    on(el.surface, 'pointermove', e => {
      if (e.pointerType === 'mouse') { this.mouseActive = true; this.updateMouse(e); return; }
      if (e.pointerId !== this.stickId) return;
      const dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y, d = Math.hypot(dx, dy);
      const k = d > STICK_RADIUS ? STICK_RADIUS / d : 1;
      this.setKnob(dx * k, dy * k);
      this.stickVec = d < 6 ? { x: 0, z: 0 } : { x: (dx * k) / STICK_RADIUS, z: (dy * k) / STICK_RADIUS };
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.stickVec = { x: 0, z: 0 };
      el.stick.classList.remove('active');
    };
    on(el.surface, 'pointerup', endStick);
    on(el.surface, 'pointercancel', endStick);
    on(el.surface, 'contextmenu', e => e.preventDefault());
    on(el.surface, 'pointerleave', e => { if (e.pointerType === 'mouse') this.mouse = null; });

    this.bindAimButton(el.fire, 'fire', on);
    this.bindAimButton(el.superBtn, 'super', on);
    on(el.build, 'click', () => { this.pending.build = true; });
    on(el.buildFrost, 'click', () => { this.pending.build = 'frost'; });
    on(el.startWave, 'click', () => { this.pending.startWave = true; });

    on(window, 'keydown', e => {
      if (!this.enabled) return;
      if (e.repeat) { this.keys.add(e.code); return; }
      this.keys.add(e.code);
      if (e.code === 'Space') { this.queueSuperAtMouse(); e.preventDefault(); }
      else if (e.code === 'KeyE' || e.code === 'KeyB') this.pending.build = true;
      else if (e.code === 'KeyR') this.pending.build = 'frost'; // Lv1 → Lv2: E picks fire, R picks frost
      else if (e.code === 'Enter') this.pending.startWave = true;
      else if (e.code === 'KeyJ' || e.code === 'KeyF') this.pending.fire = 'auto';
    });
    on(window, 'keyup', e => this.keys.delete(e.code));
    on(window, 'blur', () => this.reset());
  }

  private bindAimButton(button: HTMLElement, kind: 'fire' | 'super', on: (t: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', fn: (e: PointerEvent) => void) => void) {
    const get = () => (kind === 'fire' ? this.fireDrag : this.superDrag);
    const set = (v: ButtonDrag | null) => { if (kind === 'fire') this.fireDrag = v; else this.superDrag = v; };
    on(button, 'pointerdown', e => {
      if (!this.enabled || get()) return;
      const r = button.getBoundingClientRect();
      set({ id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, v: { x: 0, z: 0 }, aimed: false });
      button.setPointerCapture?.(e.pointerId);
      button.classList.add('pressed');
      e.preventDefault();
      e.stopPropagation();
    });
    on(button, 'pointermove', e => {
      const d = get();
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.cx, dy = e.clientY - d.cy;
      d.v = { x: dx, z: dy };
      if (Math.hypot(dx, dy) > DEADZONE) d.aimed = true;
    });
    const release = (e: PointerEvent, cancelled: boolean) => {
      const d = get();
      if (!d || d.id !== e.pointerId) return;
      set(null);
      button.classList.remove('pressed');
      if (cancelled) return;
      const len = Math.hypot(d.v.x, d.v.z);
      if (!d.aimed) { if (kind === 'fire') this.pending.fire = 'auto'; else this.pending.super = 'auto'; return; }
      if (len <= DEADZONE) return; // dragged back to the centre: cancel
      // The fire command is an offset (cycle 40): drag length sets the distance (only a lob uses it).
      if (kind === 'fire') this.pending.fire = this.fireOffset(d.v, len);
      else { const k = Math.min(1, len / AIM_RADIUS) * HERO.superRange / len; this.pending.super = { x: d.v.x * k, z: d.v.z * k }; }
    };
    on(button, 'pointerup', e => release(e, false));
    on(button, 'pointercancel', e => release(e, true));
  }

  /** Drag → offset from the hero: the direction, and the drag length as a share of the hero's range. */
  private fireOffset(v: Vec, len: number): Vec {
    const k = Math.min(1, len / AIM_RADIUS) * HEROES[this.heroPos().kind].range / len;
    return { x: v.x * k, z: v.z * k };
  }
  private lobber() { return HEROES[this.heroPos().kind].attack === 'lob'; }

  private setKnob(x: number, y: number) { this.el.knob.style.transform = `translate(${x}px, ${y}px)`; }
  private updateMouse(e: PointerEvent) { this.mouse = this.groundPoint(e.clientX, e.clientY); }
  private queueFireAtMouse() {
    const h = this.heroPos();
    if (!this.mouse) { this.pending.fire = 'auto'; return; }
    const dx = this.mouse.x - h.x, dz = this.mouse.z - h.z, l = Math.hypot(dx, dz);
    this.pending.fire = l > 0.01 ? { x: dx, z: dz } : 'auto'; // the cursor point itself (a lob lands there)
  }
  private queueSuperAtMouse() {
    const h = this.heroPos();
    this.pending.super = this.mouse ? { x: this.mouse.x - h.x, z: this.mouse.z - h.z } : 'auto';
  }

  private keyMove(): Vec {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const z = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    return { x, z };
  }

  /** Called once per sim step. One-shot actions are consumed by the first step that sees them. */
  command(): Command {
    if (!this.enabled) { this.pending = {}; return {}; }
    const km = this.keyMove();
    const move = km.x || km.z ? km : this.stickVec;
    const cmd: Command = { ...this.pending, move };
    this.pending = {};
    return cmd;
  }

  /** Refresh the aim preview for rendering (once per frame). */
  refreshAim() {
    const h = this.heroPos();
    const drag = this.superDrag ?? this.fireDrag;
    if (drag && drag.aimed && Math.hypot(drag.v.x, drag.v.z) > DEADZONE) {
      const len = Math.hypot(drag.v.x, drag.v.z);
      this.aim = drag === this.superDrag
        ? { kind: 'super', offset: { x: (drag.v.x / len) * Math.min(1, len / AIM_RADIUS) * HERO.superRange, z: (drag.v.z / len) * Math.min(1, len / AIM_RADIUS) * HERO.superRange } }
        : this.lobber() ? { kind: 'lob', offset: this.fireOffset(drag.v, len) } : { kind: 'fire', dir: { x: drag.v.x / len, z: drag.v.z / len } };
    } else if (this.mouseActive && this.mouse) {
      const dx = this.mouse.x - h.x, dz = this.mouse.z - h.z, l = Math.hypot(dx, dz);
      this.aim = l > 0.3 ? (this.lobber() ? { kind: 'lob', offset: { x: dx, z: dz } } : { kind: 'fire', dir: { x: dx / l, z: dz / l } }) : null;
    } else this.aim = null;
  }

  reset() {
    this.pending = {}; this.fireDrag = this.superDrag = null; this.aim = null;
    this.keys.clear(); this.stickId = null; this.stickVec = { x: 0, z: 0 };
    this.el.stick.classList.remove('active'); this.el.fire.classList.remove('pressed'); this.el.superBtn.classList.remove('pressed');
    this.mouse = null; this.mouseActive = false;
  }
  dispose() { this.cleanups.forEach(f => f()); }
}
