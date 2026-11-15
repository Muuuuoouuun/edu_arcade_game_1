import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Mesh, type BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TownView } from './townScene.ts';
import { townGeometry } from './townView.ts';
import { createKingdom } from './kingdom.ts';

async function castle() {
  const bytes = await readFile(new URL('./models/forest-town.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return townGeometry(gltf.scene);
}

test('late castle load replaces fallback without an upgrade and growth stays grounded inside its plot', async () => {
  let ready!: (geometry: BufferGeometry) => void;
  const view = new TownView(success => { ready = success; });
  const k = createKingdom(0);
  view.sync(k);
  const group = view.scene.getObjectByName('town-castle')!;
  const fallback = group.children[0];
  assert.equal(view.castleModel, 'loading');
  ready(await castle());
  assert.equal(view.castleModel, 'ready');
  assert.notEqual(group.children[0], fallback);
  const heights: number[] = [];
  for (const lv of [1, 2, 4]) {
    view.sync({ ...k, castle: lv });
    view.update(0);
    const box = new Box3().setFromObject(group.children[0]);
    assert.ok(Math.abs(box.min.y) < .001);
    assert.ok(box.max.x <= 2.56 && box.min.x >= -2.56);
    heights.push(box.max.y);
  }
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2]);
  const current = group.children[0] as Mesh;
  view.sync({ ...k, castle: 4 });
  assert.equal(group.children[0], current, 'same stage does not rebuild the geometry');
});

test('a failed castle request keeps the visible fallback through upgrades and re-entry', () => {
  let fail!: () => void;
  const view = new TownView((_ready, failed) => { fail = failed; });
  const k = createKingdom(0);
  view.sync(k); fail();
  const group = view.scene.getObjectByName('town-castle')!;
  assert.equal(view.castleModel, 'fallback');
  for (const lv of [1, 2, 4, 1]) {
    view.sync({ ...k, castle: lv });
    assert.equal(group.children.length, 2);
    assert.ok((group.children[0] as Mesh).geometry.attributes.position.count > 0);
  }
});
