import { Mesh, type BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { townGeometry } from './townView.ts';

/** The same authored castle at three sizes; these are not separately authored growth models. */
export const castleScale = (stage: number) => stage <= 0 ? .72 : stage === 1 ? .86 : 1;
export type TownCastleLoader = (ready: (geometry: BufferGeometry) => void, failed: () => void) => void;

export const loadTownCastle: TownCastleLoader = (ready, failed) => {
  new GLTFLoader().load(new URL('./models/forest-town.glb', import.meta.url).href, gltf => {
    try { ready(townGeometry(gltf.scene)); }
    catch { failed(); }
    finally {
      gltf.scene.traverse(o => {
        if (!(o instanceof Mesh)) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
    }
  }, undefined, failed);
};

export function townCastleGeometry(source: BufferGeometry, stage: number) {
  const scale = castleScale(stage);
  // The town camera faces the front gate (+z), whereas the battle asset is authored toward -z.
  return source.clone().rotateY(Math.PI).scale(scale, scale, scale);
}
