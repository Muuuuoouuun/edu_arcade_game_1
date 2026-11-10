import { stat } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The village's offline 3D training link must work for either theme and when
// the compact hero or the detailed frost terrain fails to load.
const output = new URL('../../dist-mobile/', import.meta.url);
test('mobile package retains both 3D battlefields and authored fallbacks', async () => {
  const paths = [
    'index.html', 'frontier.html',
    'defense/models/frontier-terrain.glb', 'defense/models/frontier-frost-forest.glb', 'defense/models/frontier-frost-cliffs.glb',
    'defense/models/frontier-frost.glb', 'defense/models/forest-gate.glb',
    'defense/models/frontier-frost-gate-impact.glb',
    'defense/models/frontier-forest-doors.glb', 'defense/models/frontier-kar-game.glb',
    'defense/models/kar-barbarian-walk.glb', 'defense/models/kar-barbarian.glb',
    'defense/models/kar-reset.glb', 'defense/models/kar-stop.glb', 'defense/models/kar-entry.glb',
    'defense/models/frontier-wood-game.glb', 'defense/models/frontier-wood-strike-game.glb',
    'defense/models/frontier-ballista-game.glb', 'defense/models/frontier-beacon.glb',
  ];
  for (const path of paths) {
    const entry = await stat(new URL(path, output));
    assert.ok(entry.isFile() && entry.size > 0, `missing mobile asset: ${path}`);
  }
  await assert.rejects(stat(new URL('model-lab.html', output)), { code: 'ENOENT' });
});
