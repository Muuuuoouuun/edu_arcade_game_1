import type { BufferGeometry } from 'three';
import { loadForestTown } from './townModel.ts';
import { townGeometry } from './townView.ts';

/** The same authored castle at three sizes; these are not separately authored growth models. */
export const castleScale = (stage: number) => stage <= 0 ? .72 : stage === 1 ? .86 : 1;
export type TownCastleLoader = (ready: (geometry: BufferGeometry) => void, failed: () => void) => void;

export const loadTownCastle: TownCastleLoader = (ready, failed) => {
  // Cycle 66: the shared meshopt web copy (townModel.ts), one request with the battle town; the scene is not disposed here.
  loadForestTown().then(scene => { try { ready(townGeometry(scene)); } catch { failed(); } }, failed);
};

export function townCastleGeometry(source: BufferGeometry, stage: number) {
  const scale = castleScale(stage);
  // The town camera faces the front gate (+z), whereas the battle asset is authored toward -z.
  return source.clone().rotateY(Math.PI).scale(scale, scale, scale);
}
