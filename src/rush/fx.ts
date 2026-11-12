// Effect grammar: flat-colour chunky particles with an ink outline, drawn as two instanced meshes (2 draw calls
// no matter how many particles). View-only: uses Math.random freely, never touches the simulation.
import {
  BackSide, Color, DynamicDrawUsage, Euler, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3,
  type Scene,
} from 'three';
import { PAL } from './look.ts';

/** shard: thrown chips with gravity and a bounce · puff: cartoon smoke that swells then shrinks · spark: quick glints */
export type Kind = 'shard' | 'puff' | 'spark';
type P = {
  kind: Kind; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; size: number; spin: number; rx: number; ry: number; color: Color;
};
export type Emit = {
  kind: Kind; n: number; color: number; at: [number, number, number];
  speed?: number; up?: number; size?: number; life?: number; dir?: number; cone?: number;
};

/** Ink outline thickness per kind: chips get a bold rim, smoke only a hairline so it never reads as a rock. */
const INK_SCALE: Record<Kind, number> = { shard: 1.35, puff: 1.1, spark: 1.25 };

export class Particles {
  private body: InstancedMesh;
  private ink: InstancedMesh;
  private list: P[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private p = new Vector3();
  private s = new Vector3();
  /** Fewer particles for reduced-motion players. */
  density = 1;

  constructor(scene: Scene, private capacity = 360, private groundHeight: (x:number,z:number)=>number = () => 0) {
    const geo = new IcosahedronGeometry(1, 0);
    this.body = new InstancedMesh(geo, new MeshBasicMaterial({ color: 0xffffff }), capacity);
    this.ink = new InstancedMesh(geo, new MeshBasicMaterial({ color: PAL.ink, side: BackSide }), capacity);
    const white = new Color(0xffffff);
    for (let i = 0; i < capacity; i++) this.body.setColorAt(i, white);
    for (const mesh of [this.body, this.ink]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
    }
  }

  get active() { return this.list.length; }

  clear() { this.list=[];this.body.count=this.ink.count=0; }

  emit(o: Emit) {
    const n = Math.max(1, Math.round(o.n * this.density));
    const speed = o.speed ?? 4, up = o.up ?? 3, size = o.size ?? 0.12, life = o.life ?? 0.5;
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.capacity) this.list.shift();
      const a = o.dir === undefined ? Math.random() * Math.PI * 2 : o.dir + (Math.random() - 0.5) * (o.cone ?? 0.8);
      const v = speed * (0.55 + Math.random() * 0.6);
      this.list.push({
        kind: o.kind, x: o.at[0], y: o.at[1] + this.groundHeight(o.at[0],o.at[2]), z: o.at[2],
        vx: Math.cos(a) * v, vy: up * (0.6 + Math.random() * 0.7), vz: Math.sin(a) * v,
        age: 0, life: life * (0.75 + Math.random() * 0.5), size: size * (0.7 + Math.random() * 0.6),
        spin: (Math.random() - 0.5) * 14, rx: Math.random() * 6, ry: Math.random() * 6, color: new Color(o.color),
      });
    }
  }

  update(dt: number) {
    const keep: P[] = [];
    for (const p of this.list) {
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.kind === 'shard') {
        p.vy -= 18 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const floor = this.groundHeight(p.x,p.z)+.06;
        if (p.y < floor) { p.y = floor; p.vy *= -0.35; p.vx *= 0.55; p.vz *= 0.55; }
      } else {
        const drag = Math.exp(-(p.kind === 'puff' ? 3 : 7) * dt);
        p.vx *= drag; p.vz *= drag; p.vy *= drag;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      }
      keep.push(p);
    }
    this.list = keep;
    this.list.forEach((p, i) => {
      const t = p.age / p.life;
      const scale = p.kind === 'puff' ? p.size * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.75)) * 1.2
        : p.kind === 'spark' ? p.size * (1 - t) : p.size * (1 - t * t);
      this.e.set(p.rx + p.spin * p.age, p.ry + p.spin * 0.6 * p.age, 0);
      this.q.setFromEuler(this.e);
      this.p.set(p.x, p.y, p.z);
      this.m.compose(this.p, this.q, this.s.setScalar(Math.max(0.001, scale)));
      this.body.setMatrixAt(i, this.m);
      this.body.setColorAt(i, p.color);
      this.m.compose(this.p, this.q, this.s.setScalar(Math.max(0.001, scale * INK_SCALE[p.kind])));
      this.ink.setMatrixAt(i, this.m);
    });
    this.body.count = this.ink.count = this.list.length;
    this.body.instanceMatrix.needsUpdate = this.ink.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
  }
}
