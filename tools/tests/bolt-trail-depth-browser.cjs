// Run against Vite with Playwright installed: BASE_URL=http://127.0.0.1:3100 node ...
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 500, height: 400 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3100/');
    const result = await page.evaluate(async () => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const { BoltTrail } = await import('/src/games/frontier/boltTrail.ts');
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#dce5e8');
      const camera = new THREE.OrthographicCamera(-2, 3, 2, -2, .1, 20);
      camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0);
      const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1); renderer.setSize(500, 400);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(.4, 1), new THREE.MeshBasicMaterial({ color: '#264a6b', side: THREE.DoubleSide }));
      wall.position.set(.685, 0, 1); scene.add(wall);
      const trail = new BoltTrail(); scene.add(trail.mesh);
      trail.update([{ id: 1, pad: 0, targetId: 1, position: { x: 2.56, y: 0, z: 0 }, previous: { x: 2, y: 0, z: 0 }, damage: 1, life: 1.92 }], false);
      const gl = renderer.getContext();
      const pixel = x => { const value = new Uint8Array(4); gl.readPixels(x, 200, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value); return [...value]; };
      renderer.render(scene, camera);
      const on = { wall: pixel(268), exposed: pixel(235) };
      trail.mesh.visible = false; renderer.render(scene, camera);
      const off = { wall: pixel(268), exposed: pixel(235) };
      trail.dispose(); wall.geometry.dispose(); wall.material.dispose(); renderer.dispose();
      return { on, off };
    });
    assert.deepEqual(result.on.wall, result.off.wall, 'opaque geometry occludes the wake');
    assert.notDeepEqual(result.on.exposed, result.off.exposed, 'wake is visible outside the obstacle');
    assert.deepEqual(errors, []);
    console.log('PASS WebGL depth occlusion', result);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
