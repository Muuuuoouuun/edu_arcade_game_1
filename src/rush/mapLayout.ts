// Expedition map layout (2026-11-13 merge): village marker positions on the painted map (src/rush/art/expedition-map.webp),
// in percent of the map image (x from the left, y from the top), read off the path clearings by eye. The forest villages
// run from the home castle (lower left) over the bridge and up the far bank; the snow villages climb the switchbacks to
// the ice fortress, where the endless challenge waits.
export const MAP_NODES: readonly (readonly [number, number])[] = [
  [25.7, 75.0], [35.2, 71.3], [51.1, 61.0], [50.1, 45.4], [35.2, 33.7],
  [68.4, 55.5], [73.9, 47.4], [68.7, 39.1], [79.1, 26.6], [80.7, 18.1],
];
export const ENDLESS_NODE: readonly [number, number] = [83.6, 7.5];
/** The home castle on the map (closes the map). */
export const HOME_NODE: readonly [number, number] = [13.5, 82];
