// The same minimal scene in Three.js: ground + 40 instanced enemies, MeshToonMaterial (3 bands), inverted-hull outline.
import { WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Mesh, PlaneGeometry, MeshLambertMaterial, SphereGeometry, BoxGeometry,
  InstancedMesh, MeshToonMaterial, MeshBasicMaterial, BackSide, Matrix4, Color, DataTexture, RedFormat, NearestFilter } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const canvas = document.getElementById('c');
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight, false);
const scene = new Scene(); scene.background = new Color(0x3fb4d8);
const cam = new PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 200); cam.position.set(0, 16, 14); cam.lookAt(0, 0, -2);
scene.add(new HemisphereLight(0xe6f6ff, 0x9c8a62, 1.1)); const sun = new DirectionalLight(0xffffff, 2.2); sun.position.set(-7, 16, 9); scene.add(sun);
const ground = new Mesh(new PlaneGeometry(30, 30), new MeshLambertMaterial({ color: 0x86d35a })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const g = mergeGeometries([new SphereGeometry(0.5, 12, 10).translate(0, 0.5, 0), new BoxGeometry(0.2, 1, 0.2).translate(0.4, 0.9, 0.3)]);
const grad = new DataTexture(new Uint8Array([105, 185, 255]), 3, 1, RedFormat); grad.minFilter = grad.magFilter = NearestFilter; grad.needsUpdate = true;
const body = new InstancedMesh(g, new MeshToonMaterial({ color: 0xe2463f, gradientMap: grad }), 40);
const ink = new MeshBasicMaterial({ color: 0x1d1433, side: BackSide });
ink.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.05;'); };
const hull = new InstancedMesh(g, ink, 40);
const m = new Matrix4();
for (let i = 0; i < 40; i++) { m.makeTranslation(-9 + (i % 8) * 2.6, 0, -8 + Math.floor(i / 8) * 2.6); body.setMatrixAt(i, m); hull.setMatrixAt(i, m); }
scene.add(body, hull);
let frames = 0;
renderer.setAnimationLoop(() => { renderer.render(scene, cam); if (++frames === 30) window.__stats = { calls: renderer.info.render.calls }; });
