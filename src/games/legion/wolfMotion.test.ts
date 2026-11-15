import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spriteAsset } from '../defense/art.ts';
import { legionWolfAsset, legionWolfDirectionalAsset, legionWolfFrame, legionWolfPathPose, LEGION_WOLF_DIRECTIONS, LEGION_WOLF_SIZE, WOLF_BASE, WOLF_GROUND_Y, WOLF_ILLUSTRATION, WOLF_WALK } from './wolfMotion.ts';
import { LANES } from './data.ts';
import { FROST_WOLF_STRIDE } from '../defense/frostWolfGait.ts';

test('Legion wolf gait follows travelled distance with a size-scaled eight-pose cycle', () => {
  const size = LEGION_WOLF_SIZE, stride = 40 * size / 68;
  for (let frame = 0; frame < 8; frame++) assert.equal(legionWolfFrame(stride * (frame + .1) / 8, size, false), frame);
  assert.equal(legionWolfFrame(stride, size, false), 0);
  assert.equal(legionWolfFrame(stride / 2, size, true), legionWolfFrame(stride * 7, size, true));
  assert.equal(legionWolfFrame(Number.NaN, size, false), 0);
});

test('Legion hit and loading fallback preserve the modeled wolf ground anchor', () => {
  const walk = legionWolfAsset(12, 0, 43, false, true);
  const hit = legionWolfAsset(12, .1, 43, false, true);
  const fallback = legionWolfAsset(12, 0, 43, false, false);
  assert.equal(walk.src, WOLF_WALK);
  assert.equal(hit.src, WOLF_BASE);
  assert.equal(fallback.src, WOLF_BASE);
  assert.equal(hit.viewBox, '776 100 368 228');
  assert.equal(walk.groundY, WOLF_GROUND_Y);
  assert.equal(hit.groundY, walk.groundY);
  assert.equal(fallback.groundY, walk.groundY);
  assert.deepEqual(legionWolfAsset(12, .1, 43, true, true), legionWolfAsset(60, 0, 43, true, true));
  assert.deepEqual(legionWolfAsset(12, .1, 43, true, false), legionWolfAsset(60, 0, 43, true, false));
  assert.deepEqual(WOLF_ILLUSTRATION, spriteAsset(19), 'the fallback stays aligned with the original snow atlas');
});

test('three actual paths select authored directions and retain accumulated gait phase across turns', () => {
  assert.deepEqual([...LEGION_WOLF_DIRECTIONS].sort(),[0,1,7]);
  const size=LEGION_WOLF_SIZE;
  for(const lane of [0,1,2]) {
    const [start,corner]=LANES[lane];
    const length=Math.hypot(corner.x-start.x,corner.y-start.y);
    assert.equal(legionWolfPathPose(lane,0,size,false)?.direction,0);
    const after=legionWolfPathPose(lane,length+.001,size,false)!;
    assert.equal(after.direction,[1,0,7][lane]);
    const expected=Math.floor((length/(FROST_WOLF_STRIDE[0]*size)+.001/(FROST_WOLF_STRIDE[after.direction]*size)+1e-9)*8)%8;
    assert.equal(after.frame,expected,'the old segment is not recalculated at the new angle');
    assert.equal(legionWolfPathPose(lane,length+40,size,true)?.frame,4,'reduced motion uses the grounded pose');
  }
  assert.equal(legionWolfPathPose(-1,0,size,false),null);
  assert.equal(legionWolfPathPose(0,NaN,size,false),null);
});

test('directional hit keeps the same grounded camera and incomplete atlases fall back safely', () => {
  const p=400,size=LEGION_WOLF_SIZE;
  const walk=legionWolfDirectionalAsset(0,p,0,size,false,true,true)!;
  const hit=legionWolfDirectionalAsset(0,p,.12,size,false,true,true)!;
  assert.match(walk.src,/frost-stride-1-atlas/);
  assert.match(hit.src,/frost-flinch-1-atlas/);
  const frame=legionWolfPathPose(0,p,size,false)!.frame;
  assert.equal(Number(hit.viewBox.split(' ')[0]),frame*2*192+4);
  const recovery=legionWolfDirectionalAsset(0,p,.04,size,false,true,true)!;
  assert.equal(Number(recovery.viewBox.split(' ')[0]),(frame*2+1)*192+4,'late hit uses recovery, not the initial contact pose');
  assert.equal(hit.groundY!/.75,walk.groundY);
  assert.equal(hit.displayScale,walk.displayScale);
  assert.equal(walk.oriented,true);
  assert.equal(legionWolfDirectionalAsset(0,p,0,size,false,false,true),null);
  assert.equal(legionWolfDirectionalAsset(0,p,.12,size,false,true,false),null);
  assert.match(legionWolfDirectionalAsset(0,p,.12,size,true,true,false)!.src,/frost-stride/);
});
