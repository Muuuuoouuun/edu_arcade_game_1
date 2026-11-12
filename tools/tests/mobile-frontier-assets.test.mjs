import { stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The village's offline 3D training link must work for either theme and when
// the compact hero or the detailed frost terrain fails to load.
const output = new URL('../../dist-mobile/', import.meta.url);
test('mobile package retains every active campaign GLB with its verified bytes', async () => {
  const manifest = JSON.parse(await readFile(new URL('defense/models/battle/manifest.json', output), 'utf8'));
  assert.equal(manifest.models.length, 8);
  for (const model of manifest.models) {
    const data = await readFile(new URL(`defense/models/battle/${model.file}`, output));
    assert.equal(data.length, model.bytes, model.id);
    assert.equal(createHash('sha256').update(data).digest('hex'), model.sha256, model.id);
  }
  await assert.rejects(stat(new URL('defense/models/prototypes/', output)), { code: 'ENOENT' });
});
test('mobile package retains both 3D battlefields and authored fallbacks', async () => {
  const paths = [
    'index.html', 'frontier.html',
    'defense/models/frontier-terrain.glb', 'defense/models/frontier-frost-forest.glb', 'defense/models/frontier-frost-cliffs.glb',
    'defense/models/frontier-frost.glb', 'defense/models/forest-gate.glb',
    'defense/models/frontier-frost-gate-impact.glb',
    'defense/models/frontier-forest-doors.glb', 'defense/models/frontier-kar-game.glb',
    'defense/models/kar-barbarian-walk.glb', 'defense/models/kar-barbarian.glb',
    'defense/models/kar-reset.glb', 'defense/models/kar-stop.glb', 'defense/models/kar-entry.glb',
    'defense/models/frontier-wood-game.glb', 'defense/models/frontier-wood-strike-game.glb', 'defense/models/frost-wolf-stride.glb',
    'defense/models/frontier-ballista-game.glb', 'defense/models/frontier-beacon.glb', 'defense/models/frontier-squad.glb', 'defense/models/frontier-relic.glb',
  ];
  for (const path of paths) {
    const entry = await stat(new URL(path, output));
    assert.ok(entry.isFile() && entry.size > 0, `missing mobile asset: ${path}`);
  }
  await assert.rejects(stat(new URL('model-lab.html', output)), { code: 'ENOENT' });
});

test('mobile package keeps the Legion terrain and wolf gait and hit fallbacks', async () => {
  for (const path of [
    'defense/legion/forest-arena.webp',
    'defense/models/frost-wolf-trot-atlas.webp',
    'defense/models/frost-wolf-atlas.webp',
    ...[0,1,7].flatMap(direction=>[
      `defense/models/frost-stride-${direction}-atlas.webp`,
      `defense/models/frost-flinch-${direction}-atlas.webp`,
    ]),
    'defense/models/legion-shield-atlas.webp',
    'defense/models/legion-shield-walk-atlas.webp',
    'defense/snow-atlas.png',
  ]) {
    const entry = await stat(new URL(path, output));
    assert.ok(entry.isFile() && entry.size > 0, `missing mobile asset: ${path}`);
  }
  await assert.rejects(stat(new URL('defense/models/legion-shield.glb', output)), { code: 'ENOENT' });
});
