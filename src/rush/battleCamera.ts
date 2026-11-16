import { Vector3 } from 'three';
import { ARENA, TOWN, type Vec } from './data.ts';
import { heightAt } from './terrainElevation.ts';

/** Near the defended town, include its rear footing instead of looking past it at empty lanes. */
export function battleFocus(hero: Vec, down: boolean, portrait: boolean, out = new Vector3()) {
  const x = down ? TOWN.x : hero.x, z = down ? TOWN.z - 4 : hero.z;
  const townWeight = Math.max(0, Math.min(1, (11 - Math.hypot(x - TOWN.x, z - TOWN.z)) / 4));
  const ahead = z - (portrait ? 2.5 : 3.5);
  // North limit 3.5 m from the edge (was 6): near the enemy gates the camera shows them whole, not their feet.
  const focusZ = Math.max(ARENA.minZ + 3.5, Math.min(ARENA.maxZ - 6, ahead + (6.9 - ahead) * townWeight));
  const focusX = Math.max(ARENA.minX + 6, Math.min(ARENA.maxX - 6, x));
  return out.set(focusX, heightAt(focusX, focusZ), focusZ);
}

/** Battle camera pose for a viewport (the numbers render.ts uses): short phone screens pull the camera in. */
export function battleCameraPose(width: number, height: number) {
  const portrait = height > width, short = Math.min(width, height);
  const zoom = short >= 720 ? 1 : short <= 420 ? 0.8 : 0.8 + ((short - 420) / 300) * 0.2;
  return { portrait, fov: portrait ? 46 : 32, height: (portrait ? 30 : 23) * zoom, back: (portrait ? 14 : 12.5) * zoom };
}
/** Ground the settled camera shows for a hero position: the screen's four corners cast onto the ground plane at the
 * focus height (west-north, east-north, east-south, west-south), its area, and how much of that lies in the arena.
 * Map-size measurements (docs/rush/map-metrics.md) and their tests use this. */
export function viewFootprint(hero: Vec, width: number, height: number) {
  const pose = battleCameraPose(width, height), focus = battleFocus(hero, false, pose.portrait);
  const eye = new Vector3(focus.x, focus.y + pose.height, focus.z + pose.back);
  const forward = focus.clone().sub(eye).normalize(), right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize(), up = new Vector3().crossVectors(right, forward);
  const ty = Math.tan((pose.fov * Math.PI) / 360), tx = ty * (width / height);
  const corners: Vec[] = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
    const d = forward.clone().addScaledVector(right, sx * tx).addScaledVector(up, sy * ty), t = (focus.y - eye.y) / d.y;
    return { x: eye.x + d.x * t, z: eye.z + d.z * t };
  });
  const area = (poly: Vec[]) => Math.abs(poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p.x * q.z - q.x * p.z; }, 0)) / 2;
  // Clip to the arena rectangle (Sutherland-Hodgman, one edge at a time).
  let inside = corners;
  const clip = (keep: (p: Vec) => boolean, cut: (a: Vec, b: Vec) => Vec) => {
    const out: Vec[] = [];
    inside.forEach((a, i) => { const b = inside[(i + 1) % inside.length]; if (keep(a)) out.push(a); if (keep(a) !== keep(b)) out.push(cut(a, b)); });
    inside = out;
  };
  const atX = (x: number) => (a: Vec, b: Vec) => ({ x, z: a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x) });
  const atZ = (z: number) => (a: Vec, b: Vec) => ({ x: a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z), z });
  clip(p => p.x >= ARENA.minX, atX(ARENA.minX)); clip(p => p.x <= ARENA.maxX, atX(ARENA.maxX));
  clip(p => p.z >= ARENA.minZ, atZ(ARENA.minZ)); clip(p => p.z <= ARENA.maxZ, atZ(ARENA.maxZ));
  const arena = (ARENA.maxX - ARENA.minX) * (ARENA.maxZ - ARENA.minZ), inArena = inside.length ? area(inside) : 0;
  return { corners, area: area(corners), inArena, share: inArena / arena, north: Math.min(...corners.map(c => c.z)), south: Math.max(...corners.map(c => c.z)) };
}
