// Publish only runtime previews. Editable .blend sources stay outside the app.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const ids = ['polar-bear', 'gecko-ranger'];
const destination = resolve(root, 'public/defense/models/prototypes');
// Check all inputs before changing any published preview.
for (const id of ids) {
  for (const suffix of ['.glb', '-idle.png']) {
    await readFile(resolve(root, `art-source/defense/prototypes/${id}/${id}${suffix}`));
  }
}
await mkdir(destination, { recursive: true });
for (const id of ids) {
  for (const [source, target] of [['.glb', '.glb'], ['-idle.png', '.png']]) {
    await copyFile(resolve(root, `art-source/defense/prototypes/${id}/${id}${source}`), resolve(destination, `${id}${target}`));
  }
}
console.log(`Published ${ids.length} model prototypes (GLB + idle PNG).`);
