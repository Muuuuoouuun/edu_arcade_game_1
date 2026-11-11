import { Group, Mesh, Vector2, type BufferGeometry, type Camera, type Object3D, type Vector3 } from 'three';
import { GateOcclusion } from '../games/frontier/gateOcclusion.ts';
import { TOWN } from './data.ts';
import { hullGeometry, outlineMaterial, toon } from './look.ts';

/** Accept only the authored, static single-surface landmark inside the existing collision cylinder. */
export function townGeometry(source: Object3D): BufferGeometry {
  source.updateWorldMatrix(true, true);
  const meshes: Mesh[] = [];
  source.traverse(o => { if (o instanceof Mesh) meshes.push(o); });
  if (meshes.length !== 1) throw new Error('Town must have one baked surface');
  const mesh = meshes[0], geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const position = geometry.getAttribute('position');
  const triangles = (geometry.index?.count ?? position.count) / 3;
  let minY = Infinity;
  let valid = triangles > 0 && triangles <= 4500 && !!geometry.getAttribute('color');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    minY = Math.min(minY, y);
    if (!Number.isFinite(x + y + z) || Math.hypot(x, z) > TOWN.radius + .001 || y < -.001 || y > 5.85) valid = false;
  }
  if (!valid || Math.abs(minY) > .001) { geometry.dispose(); throw new Error('Town geometry exceeds its ground, collision or rendering budget'); }
  return geometry;
}

/** One static body + outline in Rush's existing scene. Materials are private so the mask cannot affect cover. */
export class TownView {
  readonly root = new Group();
  readonly occlusion = new GateOcclusion(this.root, true);
  status: 'loading' | 'ready' | 'fallback' = 'loading';
  private bodyMaterial = toon(0xffffff, { vertexColors: true, rim: .3 });
  private hullMaterial = outlineMaterial(.05).clone();
  private viewport = new Vector2();
  constructor(fallback: BufferGeometry) {
    const outline = outlineMaterial(.05);
    // Three Material.clone does not preserve shader hooks.
    this.hullMaterial.onBeforeCompile = outline.onBeforeCompile;
    this.hullMaterial.customProgramCacheKey = outline.customProgramCacheKey;
    this.root.name = 'rush-town';
    this.root.position.set(TOWN.x, 0, TOWN.z);
    this.replace(fallback);
  }
  private replace(geometry: BufferGeometry) {
    this.occlusion.invalidate();
    for (const child of [...this.root.children]) {
      child.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); });
      this.root.remove(child);
    }
    const body = new Mesh(geometry, this.bodyMaterial);
    body.add(new Mesh(hullGeometry(geometry), this.hullMaterial));
    this.root.add(body);
  }
  accept(source: Object3D) { this.replace(townGeometry(source)); this.status = 'ready'; }
  fail() { this.status = 'fallback'; }
  update(camera: Camera, hero: Vector3 | undefined, width: number, height: number) {
    this.viewport.set(width, height);
    this.occlusion.update(camera, hero, this.viewport);
  }
}
