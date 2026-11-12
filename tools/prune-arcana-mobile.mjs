import { readdir, rm, stat } from 'node:fs/promises';

// The battle/ subdirectory contains active GLBs and is retained.
// Only generated mobile output is pruned. Web/arcade/workshop sources stay intact.
const output = new URL('../dist-mobile/', import.meta.url);
await stat(new URL('index.html', output));
for (const path of ['art/', 'flags/', 'race/', 'defense/models/prototypes/']) {
  await rm(new URL(path, output), { recursive: true, force: true });
}
const models = new URL('defense/models/', output);
// The independent 3D training battlefield is linked from the village. Keep its
// authored models and its documented fallback chain in the offline Android app.
const frontierModels = new Set([
  'frontier-terrain.glb', 'frontier-frost-forest.glb', 'frontier-frost-cliffs.glb', 'frontier-frost.glb',
  'forest-gate.glb', 'frontier-frost-gate-impact.glb', 'frontier-forest-doors.glb',
  'frontier-kar-game.glb', 'kar-barbarian-walk.glb', 'kar-barbarian.glb',
  'kar-reset.glb', 'kar-stop.glb', 'kar-entry.glb',
  'frontier-wood-game.glb', 'frontier-wood-strike-game.glb', 'frost-wolf-stride.glb',
  'frontier-ballista-game.glb', 'frontier-beacon.glb', 'frontier-squad.glb', 'frontier-relic.glb',
]);
await stat(new URL('frontier.html', output));
for (const file of frontierModels) await stat(new URL(file, models));
for (const file of await readdir(models)) {
  if (file.endsWith('.glb') && !frontierModels.has(file)) await rm(new URL(file, models));
}
console.log('Arcana mobile output: offline frontier models kept; arcade and workshop-only models excluded.');
