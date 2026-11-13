import { Group, Mesh, Vector2, type BufferAttribute, type BufferGeometry, type Camera, type Object3D, type Vector3 } from 'three';
import { GateOcclusion } from '../games/frontier/gateOcclusion.ts';
import type { DamageVisual } from './townDamage.ts';
import { TOWN } from './data.ts';
import { capColors, hullGeometry, outlineMaterial, toon } from './look.ts';

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
  /** Roof snow (snow region): a second colour set for the same mesh, swapped in per battle. No extra draw call. */
  private cap: number | null = null;
  private body: Mesh | null = null;
  private plain: BufferAttribute | null = null;
  private capped: BufferAttribute | null = null;
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
    this.body = body; this.plain = geometry.getAttribute('color') as BufferAttribute; this.capped = null;
    this.setSnow(this.cap);
  }
  /** Snow caps on roofs and wall tops (colour `cap`), or null for the plain town. Survives a later model swap. */
  setSnow(cap: number | null) {
    const body = this.body, plain = this.plain;
    if (body && plain && cap !== null && (!this.capped || cap !== this.cap)) {
      this.capped = plain.clone();
      // Above the plinth only, and a light dusting (30%): at 60% the near-flat castle roof went grey and lost the fixed
      // team blue (art direction rule 5), so the main session lowered it after looking at the stage-6 screenshots.
      capColors(body.geometry, this.capped, cap, .35, 1.3, .3);
    }
    this.cap = cap;
    if (body && plain) body.geometry.setAttribute('color', cap !== null && this.capped ? this.capped : plain);
  }
  accept(source: Object3D) { this.replace(townGeometry(source)); this.status = 'ready'; }
  fail() { this.status = 'fallback'; }
  /** Damage belongs to this landmark's private material, including the loading fallback. */
  setDamage(damage: DamageVisual) {
    this.bodyMaterial.color.setHex(damage.tint);
    this.bodyMaterial.emissive.setHex(damage.emissive);
    this.bodyMaterial.emissiveIntensity = damage.emissiveIntensity;
  }
  update(camera: Camera, hero: Vector3 | undefined, width: number, height: number) {
    this.viewport.set(width, height);
    this.occlusion.update(camera, hero, this.viewport);
  }
}
