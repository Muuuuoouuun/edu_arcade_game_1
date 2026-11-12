// One InstancedMesh per (geometry, material): rebuilt every frame from the simulation, so any number of
// enemies, shots or coins costs a fixed number of draw calls. Hidden when empty (no draw call at all).
import { Color, DynamicDrawUsage, InstancedMesh, type BufferGeometry, type Material, type Matrix4, type Scene } from 'three';

export class Batch {
  /** Instances refused because a batch was full (cycle 49): debug info reports it, so an overflow is never silent. */
  static dropped = 0;
  readonly mesh: InstancedMesh;
  private n = 0;
  private warned = false;

  constructor(scene: Scene, geo: BufferGeometry, mat: Material, readonly capacity: number, opts: { colors?: boolean; order?: number } = {}) {
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    if (opts.colors) { const white = new Color(0xffffff); for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, white); }
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    if (opts.order !== undefined) this.mesh.renderOrder = opts.order;
    scene.add(this.mesh);
  }

  begin() { this.n = 0; }
  push(matrix: Matrix4, color?: Color) {
    if (this.n >= this.capacity) {
      Batch.dropped++;
      if (!this.warned && import.meta.env?.DEV) { this.warned = true; console.warn(`rush batch full (${this.capacity}): extra instances are not drawn`); }
      return;
    }
    this.mesh.setMatrixAt(this.n, matrix);
    if (color) this.mesh.setColorAt(this.n, color);
    this.n++;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  get size() { return this.n; }
}
