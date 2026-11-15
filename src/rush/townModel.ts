// The authored forest town, as the game loads it (cycle 66). The Blender output `forest-town.glb` stays the source for
// its tests, tools/check-rush-town.mjs and the model lab; the game loads the meshopt copy made by tools/rush-glb.sh
// (402 KB -> 51.5 KB), decoded once and shared by the battle town and the town-screen castle (one request, not two).
import { BufferAttribute, Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Meshopt copies carry quantized positions and normals (normalized Int16/Int8, often interleaved). Baking writes
 * transformed values back into the same array type, which would clip them (cycle 31: broken parts), so imported
 * meshes go back to plain float32 before anything else touches them. */
export function toFloat32(mesh: Mesh) {
  for (const name of ['position', 'normal'] as const) {
    const a = mesh.geometry.getAttribute(name);
    if (!a || (a.array instanceof Float32Array && !('isInterleavedBufferAttribute' in a))) continue;
    const f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
    mesh.geometry.setAttribute(name, new BufferAttribute(f, 3));
  }
}

/** Decode a meshopt GLB's scene and restore float32 positions and normals (also used by the town test). */
export async function parseTownScene(data: ArrayBuffer): Promise<Object3D> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, '');
  gltf.scene.traverse(o => { if (o instanceof Mesh) toFloat32(o); });
  return gltf.scene;
}

let town: Promise<Object3D> | null = null;
/** The town scene, fetched and decoded once. Callers bake their own geometry from it and must not dispose it. */
export function loadForestTown(): Promise<Object3D> {
  town ??= fetch(new URL('./models/forest-town.web.glb', import.meta.url).href)
    .then(r => { if (!r.ok) throw new Error(`forest town: HTTP ${r.status}`); return r.arrayBuffer(); })
    .then(parseTownScene);
  return town;
}
