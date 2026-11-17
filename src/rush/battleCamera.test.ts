import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { battleCameraPose, battleEye, battleFocus, BATTLE_VIEW, screenToGround, VIEW_FORWARD, VIEW_RIGHT } from './battleCamera.ts';
import { HERO_SPAWN, TOWN } from './data.ts';

test('settled spawn camera includes the whole defended town on desktop and landscape phone', () => {
  for (const [width, height] of [[1280,720],[844,390]]) {
    const focus = battleFocus(HERO_SPAWN, false, false), pose = battleCameraPose(width, height);
    const camera = new PerspectiveCamera(pose.fov,width/height,.5,160);
    battleEye(focus, pose, camera.position);camera.lookAt(focus);camera.updateMatrixWorld();
    for (const x of [-2.56,2.56]) for(const z of [TOWN.z-2.56,TOWN.z+2.56]) for(const y of [1.2,6.72]) {
      const p = new Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(p.x)<1 && Math.abs(p.y)<.99, `${width}: town corner outside viewport ${p.toArray()}`);
    }
    const hero = new Vector3(HERO_SPAWN.x,1.2,HERO_SPAWN.z).project(camera);
    assert.ok(Math.abs(hero.x)<.8 && Math.abs(hero.y)<.8);
  }
});

test('forward exploration looks 3.5 m ahead along the view direction and follows the sloped ground', () => {
  const north = battleFocus({x:2,z:-10},false,false);
  assert.ok(Math.abs(north.x-(2+VIEW_FORWARD.x*3.5))<1e-9 && Math.abs(north.z-(-10+VIEW_FORWARD.z*3.5))<1e-9 && north.y===0, `focus ${north.toArray()}`);
  const mid = battleFocus({x:0,z:1},false,false);
  assert.ok(mid.y>0 && mid.y<1.2);
  // A fallen hero: the view rests by the town, a little up-field of it.
  const respawn = battleFocus({x:100,z:-100},true,false);
  assert.ok(Math.abs(respawn.x-(TOWN.x+.4))<1e-9 && Math.abs(respawn.z-(TOWN.z-3.6))<1e-9 && respawn.y===1.2, `rest ${respawn.toArray()}`);
});

test('three-quarter view: the camera stands south-west of its focus, and screen directions map onto the ground through its yaw', () => {
  const focus = battleFocus({x:0,z:-6},false,false), pose = battleCameraPose(915,412), eye = battleEye(focus,pose);
  assert.ok(eye.x < focus.x && eye.z > focus.z && eye.y > focus.y, 'south-west and above');
  const elevation = Math.atan2(pose.height,pose.back)*180/Math.PI;
  assert.ok(elevation > 30 && elevation < 40, `elevation ${elevation}`);
  assert.ok(Math.abs(BATTLE_VIEW.yaw*180/Math.PI-31) < 1e-9);
  // Stick up is up the screen (the view direction), stick right is screen right; lengths are kept.
  const up = screenToGround({x:0,z:-1}), right = screenToGround({x:1,z:0}), diag = screenToGround({x:.6,z:.8});
  assert.ok(Math.abs(up.x-VIEW_FORWARD.x)<1e-12 && Math.abs(up.z-VIEW_FORWARD.z)<1e-12);
  assert.ok(Math.abs(right.x-VIEW_RIGHT.x)<1e-12 && Math.abs(right.z-VIEW_RIGHT.z)<1e-12);
  assert.ok(Math.abs(Math.hypot(diag.x,diag.z)-1)<1e-12);
  // On screen: a point ahead along the view direction is straight above the focus, one to the right is level with it.
  const camera = new PerspectiveCamera(pose.fov,915/412,.5,160);
  camera.position.copy(eye);camera.lookAt(focus);camera.updateMatrixWorld();
  const ahead = new Vector3(focus.x+up.x*4,focus.y,focus.z+up.z*4).project(camera), side = new Vector3(focus.x+right.x*4,focus.y,focus.z+right.z*4).project(camera);
  assert.ok(Math.abs(ahead.x)<1e-6 && ahead.y>.1, `ahead ${ahead.toArray()}`);
  assert.ok(side.x>.1 && Math.abs(side.y)<1e-6, `side ${side.toArray()}`);
});

test('map size against the screen: from the start a landscape phone sees most of the arena (three-quarter view), and the enemy gates when the hero is north', async () => {
  const { viewFootprint } = await import('./battleCamera.ts');
  const { ARENA } = await import('./data.ts');
  const start = viewFootprint(HERO_SPAWN, 915, 412);
  // The low view reaches far up-field: 73% of the arena lies inside the frame (the straight-north view showed 33%).
  assert.ok(start.share > 0.65 && start.share < 0.82, `share at the start ${start.share}`);
  assert.ok(start.south > TOWN.z + 2.5 && start.north < 0, 'the town and the ground ahead of it');
  const north = viewFootprint({ x: 0, z: -18 }, 915, 412);
  // The gates stand on the north edge (z -26 to -27.4): the camera now goes far enough to show them whole.
  assert.ok(north.north < ARENA.minZ - 2.5, `north view reaches z ${north.north}`);
  const desktop = viewFootprint(HERO_SPAWN, 1280, 720);
  assert.ok(desktop.share > start.share);
});
