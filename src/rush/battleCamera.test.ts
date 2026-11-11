import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { battleFocus } from './battleCamera.ts';
import { HERO_SPAWN, TOWN } from './data.ts';

test('settled spawn camera includes the whole defended town on desktop and landscape phone', () => {
  for (const [width, height, zoom] of [[1280,720,1],[844,390,.8]]) {
    const focus = battleFocus(HERO_SPAWN, false, false);
    const camera = new PerspectiveCamera(32,width/height,.5,120);
    camera.position.set(focus.x,focus.y+23*zoom,focus.z+12.5*zoom);camera.lookAt(focus);camera.updateMatrixWorld();
    for (const x of [-2.56,2.56]) for(const z of [TOWN.z-2.56,TOWN.z+2.56]) for(const y of [1.2,6.72]) {
      const p = new Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(p.x)<1 && Math.abs(p.y)<.99, `${width}: town corner outside viewport ${p.toArray()}`);
    }
    const hero = new Vector3(HERO_SPAWN.x,1.2,HERO_SPAWN.z).project(camera);
    assert.ok(Math.abs(hero.x)<.8 && Math.abs(hero.y)<.8);
  }
});

test('forward exploration keeps the old look-ahead and follows the sloped ground', () => {
  const north = battleFocus({x:2,z:-10},false,false);
  assert.deepEqual(north.toArray(),[2,0,-13.5]);
  const mid = battleFocus({x:0,z:1},false,false);
  assert.ok(mid.y>0 && mid.y<1.2);
  const respawn = battleFocus({x:100,z:-100},true,false);
  assert.deepEqual(respawn.toArray(),[0,1.2,6.9]);
});
