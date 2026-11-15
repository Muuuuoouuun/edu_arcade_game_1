import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALLS } from './data.ts';
import { wallParts } from './look.ts';

test('every stone and timber cover part remains inside the existing wall collider', () => {
  for (const wall of WALLS) {
    const parts = wallParts(wall);
    assert.ok(parts.length >= 8, 'each wall has structural courses and posts');
    for (const part of parts) {
      const at=part.at!;
      part.geo.computeBoundingBox();
      const bounds=part.geo.boundingBox!;
      const epsilon=1e-6;
      assert.ok(at[0]+bounds.min.x>=wall.x-wall.w/2-epsilon && at[0]+bounds.max.x<=wall.x+wall.w/2+epsilon, 'mesh stays inside x collider');
      assert.ok(at[2]+bounds.min.z>=wall.z-wall.d/2-epsilon && at[2]+bounds.max.z<=wall.z+wall.d/2+epsilon, 'mesh stays inside z collider');
      assert.ok(at[1]+bounds.min.y>=-epsilon && at[1]+bounds.max.y<=1.42+epsilon, 'cover stays grounded and no taller than before');
      part.geo.dispose();
    }
  }
});
