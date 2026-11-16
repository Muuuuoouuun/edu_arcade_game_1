// Expedition map layout (2026-11-13 merge): village marker positions on the painted map (src/rush/art/expedition-map.webp),
// in percent of the map image (x from the left, y from the top), read off the path clearings by eye. The forest villages
// run from the home castle (lower left) over the bridge and up the far bank; the snow villages climb the switchbacks to
// the ice fortress, where the endless challenge waits.
export const MAP_NODES: readonly (readonly [number, number])[] = [
  [25.7, 75.0], [35.2, 71.3], [51.1, 61.0], [50.1, 45.4], [35.2, 33.7],
  [68.9, 55.4], [77.5, 49.5], [68.9, 38.1], [78.1, 35.1], [78.6, 19.9],
];
/** Cycle 144: the snow villages moved within their clearings (2-4 to the clearing below its old one, on the same path)
 * so the 44 px markers (50 px for 2-5) no longer overlap on a 480×320 board (iPhone SE); before, 2-4 and 2-5 overlapped
 * by 39×20 px. */
export const ENDLESS_NODE: readonly [number, number] = [83.6, 7.2];
/** The home castle on the map (closes the map). */
export const HOME_NODE: readonly [number, number] = [13.5, 82];
