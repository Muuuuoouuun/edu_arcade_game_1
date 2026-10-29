import { cp, mkdir } from 'node:fs/promises';

// These standalone experiments use classic scripts and their own renderer.
// Keep their relative URLs intact instead of bundling them into the React app.
const root = new URL('../', import.meta.url);
const destination = new URL('dist/prototype/', root);
await mkdir(destination, { recursive: true });
for (const entry of ['index.html', '3d_game.html', '3d_spike.html', 'bg_demo.html', 'core', 'vendor', 'graphics']) {
  await cp(new URL(`prototype/${entry}`, root), new URL(entry, destination), { recursive: true });
}
console.log('Standalone defense prototypes copied to dist/prototype');
