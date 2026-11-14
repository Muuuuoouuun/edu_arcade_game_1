import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO, createFrameWatch, nextPref, parsePref, QUALITY, resolveQuality, watchFrame } from './quality.ts';

const feed = (fps: number, seconds: number, w = createFrameWatch()) => {
  let drops = 0;
  for (let t = 0; t < seconds; t += 1 / fps) if (watchFrame(w, 1 / fps)) drops++;
  return { w, drops };
};

test('auto quality drops once on a slow device and never on a fast one', () => {
  assert.equal(feed(60, 30).drops, 0);
  assert.equal(feed(45, 30).drops, 0);
  const slow = feed(25, 30);
  assert.equal(slow.drops, 1, 'drops exactly once');
  assert.ok(slow.w.dropped);
});

test('auto quality ignores the warm-up and long gaps', () => {
  // Slow only during warm-up (loading, shader compile), then fast: no drop.
  const w = createFrameWatch();
  feed(10, AUTO.warmup - 0.2, w);
  assert.equal(feed(60, 20, w).drops, 0);
  // Tab switches and hitches longer than maxGap are not frames.
  const g = createFrameWatch();
  let drops = 0;
  for (let i = 0; i < 400; i++) { if (watchFrame(g, 1 / 60)) drops++; if (i % 50 === 0 && watchFrame(g, 1.5)) drops++; }
  assert.equal(drops, 0);
  assert.equal(watchFrame(createFrameWatch(), Number.NaN), false);
});

test('auto quality also drops when every frame is a long gap (a device that cannot draw the high tier)', () => {
  // Under 4 fps each frame is longer than maxGap, so the window average never fills: a run of such frames drops.
  const crawl = createFrameWatch();
  let drops = 0, at = -1;
  for (let i = 0; i < 40; i++) if (watchFrame(crawl, 0.33)) { drops++; at = i; }
  assert.equal(drops, 1, 'drops exactly once');
  assert.equal(at, AUTO.gapFrames - 1, 'after gapFrames long frames in a row');
  // A few long frames between normal ones (loading, a hitch) never add up.
  const hitchy = createFrameWatch();
  drops = 0;
  for (let i = 0; i < 600; i++) { if (watchFrame(hitchy, 1 / 60)) drops++; if (i % 20 === 0) for (let k = 0; k < AUTO.gapFrames - 1; k++) if (watchFrame(hitchy, 0.4)) drops++; }
  assert.equal(drops, 0);
});

test('quality preference cycles, parses safely and resolves', () => {
  assert.equal(nextPref('auto'), 'high');
  assert.equal(nextPref('high'), 'low');
  assert.equal(nextPref('low'), 'auto');
  assert.equal(parsePref('low'), 'low');
  assert.equal(parsePref('ultra'), 'auto');
  assert.equal(parsePref(null), 'auto');
  assert.equal(resolveQuality('auto', false), 'high');
  assert.equal(resolveQuality('auto', true), 'low');
  assert.equal(resolveQuality('high', true), 'high');
  assert.ok(QUALITY.low.pixelRatio < QUALITY.high.pixelRatio);
  assert.ok(!QUALITY.low.terrainOutlines && QUALITY.high.terrainOutlines);
});

test('frame look: every per-pixel or per-pass cost is high tier only', () => {
  assert.equal(QUALITY.low.shadowMap, 0, 'low keeps blob shadows');
  assert.equal(QUALITY.low.post, false, 'low draws straight to the canvas');
  assert.equal(QUALITY.low.surfaceDetail, false);
  assert.ok(QUALITY.high.shadowMap >= 1024 && QUALITY.high.shadowMap <= 2048, 'one shadow map, 1024-2048');
  assert.ok(QUALITY.high.post && QUALITY.high.surfaceDetail);
});

test('frame look: the toon shader patches still fit the installed three.js', async () => {
  const { toonShaderHooks, patchToon, patchOutline, setToonDetail, TOON_BANDS } = await import('./toonShader.ts');
  const { ShaderLib } = await import('three');
  // If a three.js update rewords these lines the look silently falls back to stock shading: fail here instead.
  assert.deepEqual(toonShaderHooks(), { anchors: true, shadow: true, outline: true });
  const solid = { uniforms: {}, vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
  patchToon(solid, 0.32, false);
  assert.ok(solid.fragmentShader.includes('rushCastShadow') && solid.fragmentShader.includes('rushShade'), 'stepped shadow in the cool shade band');
  assert.ok(solid.fragmentShader.includes('rushShadow = ( directLight.visible && receiveShadow ) ? rushCastShadow('), 'the cast shadow feeds the band, not a grey multiply');
  assert.ok(!solid.fragmentShader.includes('rushGround'), 'actors carry no ground detail');
  assert.equal((solid.uniforms as Record<string, { value: number }>).rimStrength.value, 0.32);
  assert.ok(!solid.fragmentShader.includes('#define RUSH_DETAIL'), 'low tier: hard band steps, no derivative');
  // Low tier: the ground program is the plain toon program (nothing of the painted detail is compiled in).
  const plain = { uniforms: {}, vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
  patchToon(plain, 0, true);
  assert.ok(!plain.fragmentShader.includes('rushGround') && !plain.vertexShader.includes('vRushWorld'), 'low tier ground carries no detail code');
  // High tier: anti-aliased bands everywhere, painted detail on the ground only.
  setToonDetail(true);
  const ground = { uniforms: {}, vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
  patchToon(ground, 0, true);
  assert.ok(ground.fragmentShader.includes('rushGround') && ground.vertexShader.includes('vRushWorld'), 'high tier ground gets the painted detail');
  assert.ok(ground.fragmentShader.startsWith('#define RUSH_DETAIL'), 'high tier: anti-aliased bands');
  assert.ok(!ground.fragmentShader.includes('rimF'), 'no rim on flat scenery');
  const actor = { uniforms: {}, vertexShader: ShaderLib.toon.vertexShader, fragmentShader: ShaderLib.toon.fragmentShader };
  patchToon(actor, 0.32, false);
  assert.ok(!actor.fragmentShader.includes('rushGround'), 'actors never carry ground detail');
  setToonDetail(false);
  assert.ok(TOON_BANDS.mid < 0 && TOON_BANDS.lit > 0 && Math.abs(TOON_BANDS.mid + TOON_BANDS.lit) < 1e-9, 'three bands, symmetric steps');
  const hull = { uniforms: {}, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader };
  patchOutline(hull, 0.05);
  assert.ok(hull.vertexShader.includes('outlineView') && !hull.vertexShader.includes('#include <begin_vertex>'), 'outline keeps a minimum screen thickness');
});

test('frame look: shadow box, light table and who casts', async () => {
  const { shadowHalfExtent, snapToTexel, FRAME_LOOK, SUN_DIR, markShadows } = await import('./frame.ts');
  const { toon } = await import('./look.ts');
  const { Group, InstancedMesh, Mesh, BoxGeometry, MeshBasicMaterial } = await import('three');
  // The box covers the furthest visible ground corner plus room for tall casters, on a half-metre grid.
  const corners = [{ x: -11, z: 8 }, { x: 11, z: 8 }, { x: 14, z: -9 }, { x: -14, z: -9 }];
  const half = shadowHalfExtent(corners, { x: 0, z: 0 });
  assert.ok(half >= Math.hypot(14, 9) + 3 && half <= Math.hypot(14, 9) + 4.5 && (half * 2) % 1 === 0);
  // Texel snapping: the centre moves in whole texels, never by a fraction (no swimming shadow edges).
  const texel = (2 * half) / 2048;
  for (const v of [0.013, 3.7777, -12.345]) { const s = snapToTexel(v, half, 2048); assert.ok(Math.abs(s - v) <= texel / 2 + 1e-9 && Math.abs(s / texel - Math.round(s / texel)) < 1e-6); }
  // Sun from the upper left behind the field: tops lit, camera-facing (+z) faces in the mid band, shadows toward +x.
  assert.ok(SUN_DIR.y > 0.6 && SUN_DIR.x < -0.5 && Math.abs(SUN_DIR.z) < 1 / 3);
  for (const [name, look] of Object.entries(FRAME_LOOK)) {
    assert.ok(look.shade[2] > look.shade[0] + 0.3, `${name}: the shade band is cool (blue above red), not grey`);
    assert.ok(look.mid.every((v, i) => v > look.shade[i]), `${name}: mid is lighter than shade`);
    assert.ok(look.grade.saturation <= 1.12 && look.grade.contrast <= 0.3 && look.grade.vignette <= 0.25, `${name}: the grade stays gentle`);
  }
  // Who casts and who receives comes from the material alone.
  const box = new BoxGeometry(1, 1, 1), root = new Group(), hero = new Group();
  const wall = new Mesh(box, toon(0xffffff, { vertexColors: true })), hull = new Mesh(box, new MeshBasicMaterial());
  const ground = new Mesh(box, toon(0xffffff, { vertexColors: true, rim: 0 })), enemy = new InstancedMesh(box, toon(), 2), part = new Mesh(box, toon());
  const streak = new InstancedMesh(box, toon(), 2); streak.userData.noShadow = true;
  hero.add(part); wall.add(hull); root.add(wall, ground, enemy, hero, streak);
  markShadows(root, hero);
  assert.deepEqual([wall.castShadow, wall.receiveShadow], [true, true], 'scenery casts and receives');
  assert.deepEqual([hull.castShadow, hull.receiveShadow], [false, false], 'ink hulls do neither');
  assert.deepEqual([ground.castShadow, ground.receiveShadow], [false, true], 'the ground only receives');
  assert.deepEqual([enemy.castShadow, enemy.receiveShadow], [true, false], 'instanced actors cast but stay bright');
  assert.deepEqual([part.castShadow, part.receiveShadow], [true, false], 'the hero casts but stays bright');
  assert.deepEqual([streak.castShadow, streak.receiveShadow], [false, false], 'opted-out effects');
});

test('frame look: glow sources only touch alpha while the finishing pass is on', async () => {
  const { glow, setGlowMask } = await import('./toonShader.ts');
  const { MeshBasicMaterial, OneFactor, ZeroFactor } = await import('three');
  const ring = glow(new MeshBasicMaterial({ transparent: true, opacity: 0.8 }));
  assert.equal(ring.blendSrcAlpha, OneFactor, 'mask off: ordinary blending, the canvas alpha stays 1');
  setGlowMask(true);
  assert.equal(ring.blendSrcAlpha, ZeroFactor, 'mask on: the target alpha is multiplied down');
  setGlowMask(false);
  assert.equal(ring.blendSrcAlpha, OneFactor);
});

test('music score (1.0, completion C4): moods, tempos, drums only where they belong, a 16-bar loop', async () => {
  const { musicBar } = await import('./music.ts');
  const moods = ['title', 'town', 'battle', 'boss'] as const;
  for (const mood of moods) {
    for (let bar = 0; bar < 16; bar++) {
      const b = musicBar(mood, bar);
      assert.ok(b.notes.every(n => n.t >= 0 && n.t < 4 && n.t + n.dur <= 4 + 1e-9), `${mood} ${bar}: notes stay in the bar`);
      assert.ok(b.notes.every((n, i) => i === 0 || b.notes[i - 1].t <= n.t), `${mood} ${bar}: sorted`);
      assert.deepEqual(musicBar(mood, bar + 16), b, `${mood}: a 16-bar loop`);
    }
  }
  const voices = (mood: typeof moods[number]) => new Set(Array.from({ length: 16 }, (_, b) => musicBar(mood, b).notes.map(n => n.voice)).flat());
  assert.ok(!voices('town').has('kick') && !voices('town').has('snare') && !voices('town').has('hat'), 'town is calm: no drums');
  for (const mood of ['battle', 'boss'] as const) assert.ok(voices(mood).has('kick') && voices(mood).has('snare'), `${mood} drives with kick and snare`);
  assert.equal(musicBar('battle', 0).tempo, musicBar('boss', 0).tempo, 'battle and boss share a tempo so a boss arrival stays in step');
  assert.ok(musicBar('town', 0).tempo < musicBar('battle', 0).tempo, 'town is slower than battle');
  // Mix (95, tools/rush-audio-check.cjs): combat music sits about 10.5 dB under the calm moods so the shared combat
  // effects clear its RMS by 6 dB or more.
  const { MOOD_LEVEL } = await import('./music.ts');
  assert.ok(20 * Math.log10(MOOD_LEVEL.town / MOOD_LEVEL.battle) >= 10, 'battle music at least 10 dB under town');
  assert.equal(MOOD_LEVEL.battle, MOOD_LEVEL.boss, 'boss keeps the battle level so the switch is seamless');
});
