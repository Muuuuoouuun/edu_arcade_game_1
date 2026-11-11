import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BoxGeometry, BufferAttribute, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TownView, townGeometry } from './townView.ts';
import { TOWN } from './data.ts';
import { outlineMaterial } from './look.ts';

function body(width = 2) {
  const g = new BoxGeometry(width, 3, 2).translate(0, 1.5, 0);
  g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(.5), 3));
  return new Mesh(g, new MeshBasicMaterial({ vertexColors: true }));
}

test('authored town loads as one grounded surface within the existing collision and triangle budget', async () => {
  const bytes = await readFile(new URL('./models/forest-town.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  assert.equal(gltf.animations.length, 0, 'landmark is static; never pretend it contains an attack clip');
  const g = townGeometry(gltf.scene);
  assert.ok(g.getAttribute('color').count > 0);
  assert.ok((g.index?.count ?? g.attributes.position.count) / 3 <= 4500);
  g.dispose();
});

test('invalid imported geometry cannot replace a playable fallback', () => {
  const town = new TownView(new BoxGeometry(2, 3, 2).translate(0, 1.5, 0));
  const fallback = town.root.children[0];
  for (const invalid of [body(12), new Group()]) {
    assert.throws(() => town.accept(invalid));
    town.fail();
    assert.equal(town.root.children[0], fallback);
    assert.equal(town.status, 'fallback');
  }
  const lifted = body(); lifted.position.y = 1;
  assert.throws(() => town.accept(lifted), /ground/);
});

test('town replaces only its owned geometry and uses private body and outline materials', () => {
  const first = new TownView(body().geometry), second = new TownView(body().geometry);
  const old = first.root.children[0] as Mesh;
  let disposed = 0; old.geometry.addEventListener('dispose', () => disposed++);
  first.accept(body());
  assert.equal(first.status, 'ready'); assert.equal(disposed, 1);
  assert.equal(first.root.children.length, 1);
  const a = first.root.children[0] as Mesh, b = second.root.children[0] as Mesh;
  assert.notEqual(a.material, b.material);
  assert.notEqual((a.children[0] as Mesh).material, outlineMaterial(.05));
  assert.deepEqual(first.root.position.toArray(), [TOWN.x, 0, TOWN.z]);
});

test('only town surfaces in front of the hero are masked, and the mask clears when no hero is present', () => {
  const town = new TownView(body().geometry);
  const camera = new PerspectiveCamera(32, 844 / 390, .5, 120);
  camera.position.set(0, 8, 20); camera.lookAt(0, 1, 7); camera.updateMatrixWorld();
  town.update(camera, new Vector3(0, 1, 7), 844, 390);
  assert.ok(town.occlusion.count > 0);
  town.update(camera, new Vector3(0, 1, 14), 844, 390);
  assert.equal(town.occlusion.count, 0);
  town.update(camera, undefined, 844, 390);
  assert.equal(town.occlusion.count, 0);
});
