import { Vector3 } from 'three';
import { ARENA, TOWN, type Vec } from './data.ts';
import { heightAt } from './terrainElevation.ts';

/** Near the defended town, include its rear footing instead of looking past it at empty lanes. */
export function battleFocus(hero: Vec, down: boolean, portrait: boolean, out = new Vector3()) {
  const x = down ? TOWN.x : hero.x, z = down ? TOWN.z - 4 : hero.z;
  const townWeight = Math.max(0, Math.min(1, (11 - Math.hypot(x - TOWN.x, z - TOWN.z)) / 4));
  const ahead = z - (portrait ? 2.5 : 3.5);
  const focusZ = Math.max(ARENA.minZ + 6, Math.min(ARENA.maxZ - 6, ahead + (6.9 - ahead) * townWeight));
  const focusX = Math.max(ARENA.minX + 6, Math.min(ARENA.maxX - 6, x));
  return out.set(focusX, heightAt(focusX, focusZ), focusZ);
}
