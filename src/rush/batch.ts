// One InstancedMesh per (geometry, material): rebuilt every frame from the simulation, so any number of
// enemies, shots or coins costs a fixed number of draw calls. Hidden when empty (no draw call at all).
import { BatchedMesh, Color, DynamicDrawUsage, InstancedMesh, type BufferGeometry, type Material, type Matrix4, type Scene } from 'three';

export class Batch {
  /** Instances refused because a batch was full (cycle 49): debug info reports it, so an overflow is never silent. */
  static dropped = 0;
  readonly mesh: InstancedMesh;
  private n = 0;
  private warned = false;

  readonly capacity: number;

  constructor(scene: Scene, geo: BufferGeometry, mat: Material, capacity: number, opts: { colors?: boolean; order?: number } = {}) {
    this.capacity = capacity;
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

/** Spike (cycle 108): many shapes in one draw. A three.js BatchedMesh that is refilled every frame like a Batch, but each
 * pushed instance names its geometry, so the seven enemy kinds share one draw call (one multi-draw). Only worth it with
 * the WEBGL_multi_draw extension: without it three.js draws every visible instance separately, so the caller keeps the
 * per-kind Batches then. Geometries are added on first use (region looks, named bosses); all must carry the same
 * attributes and indexing. */
export class KindBatch {
  readonly mesh: BatchedMesh;
  private ids = new Map<BufferGeometry, number>();
  private n = 0;
  private shown = 0;
  private instances = 0;
  private verts = 0;
  private indices = 0;

  readonly capacity: number;
  private maxVerts: number;
  private maxIndices: number;

  constructor(scene: Scene, mat: Material, capacity: number, maxVerts: number, maxIndices: number) {
    this.capacity = capacity; this.maxVerts = maxVerts; this.maxIndices = maxIndices;
    this.mesh = new BatchedMesh(capacity, maxVerts, maxIndices, mat);
    this.mesh.frustumCulled = false;
    this.mesh.perObjectFrustumCulled = false; // the caller culls per enemy already
    this.mesh.sortObjects = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private idOf(geo: BufferGeometry): number {
    let id = this.ids.get(geo);
    if (id !== undefined) return id;
    const v = geo.attributes.position.count, i = geo.index ? geo.index.count : 0;
    if (this.verts + v > this.maxVerts || this.indices + i > this.maxIndices) {
      this.maxVerts = Math.max(this.maxVerts * 2, this.verts + v);
      this.maxIndices = Math.max(this.maxIndices * 2, this.indices + i);
      this.mesh.setGeometrySize(this.maxVerts, this.maxIndices);
    }
    id = this.mesh.addGeometry(geo);
    this.verts += v; this.indices += i;
    this.ids.set(geo, id);
    return id;
  }

  begin() { this.n = 0; }
  push(geo: BufferGeometry, matrix: Matrix4) {
    if (this.n >= this.capacity) { Batch.dropped++; return; }
    const id = this.idOf(geo), i = this.n++;
    if (i >= this.instances) { this.mesh.addInstance(id); this.instances++; } else this.mesh.setGeometryIdAt(i, id);
    this.mesh.setMatrixAt(i, matrix);
    if (i >= this.shown) this.mesh.setVisibleAt(i, true);
  }
  end() {
    for (let i = this.n; i < this.shown; i++) this.mesh.setVisibleAt(i, false);
    this.shown = this.n;
    this.mesh.visible = this.n > 0;
  }
  get size() { return this.n; }
}
