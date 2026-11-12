import { readdir, rm, stat } from 'node:fs/promises';

// The battle/ subdirectory contains active GLBs and is retained.
// Only generated mobile output is pruned. Web/arcade/workshop sources stay intact.
const output = new URL('../dist-mobile/', import.meta.url);
await stat(new URL('index.html', output));
for (const path of ['art/', 'flags/', 'race/', 'defense/models/prototypes/']) {
  await rm(new URL(path, output), { recursive: true, force: true });
}
const models = new URL('defense/models/', output);
for (const file of await readdir(models)) {
  if (file.endsWith('.glb')) await rm(new URL(file, models));
}
console.log('Arcana mobile output: arcade assets and workshop-only 3D models excluded.');
