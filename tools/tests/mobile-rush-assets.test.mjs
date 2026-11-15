import { readFile, readdir, stat } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const output = new URL('../../dist-mobile/', import.meta.url);
test('mobile package retains the Rush entry and all three imported hero models', async () => {
  assert.ok((await stat(new URL('rush.html', output))).size > 0);
  const assets = await readdir(new URL('assets/', output));
  for (const stem of ['gecko-ranger-', 'dwarf-guardian-', 'polar-bear-']) {
    const file = assets.find(name => name.startsWith(stem) && name.endsWith('.glb'));
    assert.ok(file, `missing mobile Rush model: ${stem}`);
    assert.ok((await stat(new URL(`assets/${file}`, output))).size > 0);
    const bytes = await readFile(new URL(`assets/${file}`, output));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.equal(gltf.images.length, 3, 'mobile delivery retains embedded material maps');
    assert.equal(gltf.animations.length, 3, 'mobile delivery retains idle, walk and attack');
    assert.ok(gltf.materials[0].normalTexture, 'mobile delivery retains normal mapping');
  }
  assert.ok(assets.some(name => name.startsWith('bagel-rush-') && name.endsWith('.woff2')), 'Rush font included');
  await assert.rejects(stat(new URL('defense/models/characters-v2/', output)), { code: 'ENOENT' }, 'workshop duplicate models and sheets are excluded');
});
