import { Vector3 } from 'three';
import { ARENA, TOWN, type Vec } from './data.ts';
import { heightAt } from './terrainElevation.ts';

/** The battle view (2026-11-16, user request "this angle"): a three-quarter view from the south-west, the angle of the battlefield
 * model render in docs/arcana-3d-modeling (camera yawed 31 degrees off north, about 35 degrees above the ground). Enemies
 * come down from the upper left, the town sits toward the lower right. `yaw` 0 would be the old straight-north view.
 * Everything that turns a screen direction into a ground direction (stick, aim drags, keys) goes through `screenToGround`. */
export const BATTLE_VIEW = { yaw: (31 * Math.PI) / 180 } as const;
const SIN = Math.sin(BATTLE_VIEW.yaw), COS = Math.cos(BATTLE_VIEW.yaw);
/** Ground direction the camera looks along (screen up), and the one to its right (screen right). */
export const VIEW_FORWARD: Vec = { x: SIN, z: -COS }, VIEW_RIGHT: Vec = { x: COS, z: SIN };
/** A screen-space vector (x right, z down, as the stick and the aim drags give it) as a ground vector. */
export function screenToGround(v: Vec): Vec { return { x: v.x * COS - v.z * SIN, z: v.x * SIN + v.z * COS }; }

/** Where the view rests while the hero is by the town. */
const HOME: Vec = { x: TOWN.x + 0.4, z: TOWN.z - 3.6 };
/** Near the defended town, include its rear footing instead of looking past it at empty lanes. */
export function battleFocus(hero: Vec, down: boolean, portrait: boolean, out = new Vector3()) {
  const x = down ? TOWN.x : hero.x, z = down ? TOWN.z - 4 : hero.z;
  const townWeight = Math.max(0, Math.min(1, (11 - Math.hypot(x - TOWN.x, z - TOWN.z)) / 4));
  // Look ahead along the view direction (up the screen), not straight north.
  const lead = portrait ? 2.5 : 3.5, aheadX = x + VIEW_FORWARD.x * lead, aheadZ = z + VIEW_FORWARD.z * lead;
  // North limit 3.5 m from the edge (was 6): near the enemy gates the camera shows them whole, not their feet.
  // By the town the view settles a little up-field and to the west of it: the town stays whole in the lower right and
  // the screen shows the lanes coming in, not the hedge and the sea behind the town.
  const focusZ = Math.max(ARENA.minZ + 3.5, Math.min(ARENA.maxZ - 6, aheadZ + (HOME.z - aheadZ) * townWeight));
  const focusX = Math.max(ARENA.minX + 6, Math.min(ARENA.maxX - 6, aheadX + (HOME.x - aheadX) * townWeight));
  return out.set(focusX, heightAt(focusX, focusZ), focusZ);
}

/** Battle camera pose for a viewport (the numbers render.ts uses): short phone screens pull the camera in.
 * `height` above the focus and `back` along the ground behind it give about 35 degrees of elevation. */
export function battleCameraPose(width: number, height: number) {
  const portrait = height > width, short = Math.min(width, height);
  const zoom = short >= 720 ? 1 : short <= 420 ? 0.8 : 0.8 + ((short - 420) / 300) * 0.2;
  return { portrait, fov: portrait ? 46 : 32, height: (portrait ? 24 : 18) * zoom, back: (portrait ? 32 : 26) * zoom };
}
/** Where the camera stands for a focus point: behind it against the view direction, `height` up. */
export function battleEye(focus: Vector3, pose: { height: number; back: number }, out = new Vector3()) {
  return out.set(focus.x - VIEW_FORWARD.x * pose.back, focus.y + pose.height, focus.z - VIEW_FORWARD.z * pose.back);
}
/** Ground the settled camera shows for a hero position: the screen's four corners cast onto the ground plane at the
 * focus height (west-north, east-north, east-south, west-south), its area, and how much of that lies in the arena.
 * Map-size measurements (docs/rush/map-metrics.md) and their tests use this. */
export function viewFootprint(hero: Vec, width: number, height: number) {
  const pose = battleCameraPose(width, height), focus = battleFocus(hero, false, pose.portrait);
  const eye = battleEye(focus, pose);
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
