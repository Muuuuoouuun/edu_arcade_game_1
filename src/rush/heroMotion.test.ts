import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClip, Group, VectorKeyframeTrack, BoxGeometry, Matrix4 } from 'three';
import { HeroMotion } from './heroMotion.ts';
import { bakeMatrices } from './look.ts';

function character() {
  const model = new Group(), body = new Group(), left = new Group(), right = new Group();
  body.name = 'body'; left.name = 'leg-left'; right.name = 'leg-right'; model.add(body, left, right);
  const track = (name: string, values: number[]) => new VectorKeyframeTrack(`${name}.position`, [0, .5, 1], values);
  const clips = [
    new AnimationClip('ranger-idle', 1, [track('body', [0,0,0, 0,.02,0, 0,0,0]), track('leg-left', [0,0,0, 0,0,0, 0,0,0])]),
    new AnimationClip('ranger-walk', 1, [track('leg-left', [0,0,.2, 0,0,-.2, 0,0,.2]), track('leg-right', [0,0,-.2, 0,.1,.2, 0,0,-.2]), track('body', [0,0,0, 0,.04,0, 0,0,0])]),
    new AnimationClip('gecko-seed-shot', 1, [track('body', [0,0,0, 0,0,-.3, 0,0,0])]),
  ];
  return { motion: new HeroMotion(model, clips, 'ranger'), model, body, left, right };
}

test('gait follows travelled distance and keeps the upper-body attack independent', () => {
  const { motion, body, left } = character(), battle = {};
  motion.sync(battle, 0, 0, .01);
  motion.sync(battle, .1, 0, .1);
  assert.ok(Math.abs(left.position.z - .1) < 1e-6, 'idle neutral leg keys must not dilute the walking stride');
  motion.shot!.reset().play();
  motion.sync(battle, .2, 0, .5);
  assert.equal(motion.info().phase, .25);
  assert.ok(Math.abs(body.position.z + .3) < 1e-6, 'walk/idle must not dilute shot recoil');
  assert.ok(Math.abs(left.position.z) < 1e-6, 'foot samples the quarter-cycle travel phase');
});

test('pause and hit-stop freeze the full pose; stop/reduced motion settle feet; a new battle resets the phase', () => {
  const { motion, model } = character(), battle = {};
  motion.sync(battle, 0, 0, .01); motion.sync(battle, .3, 0, .1);
  const pose = model.children.map(o => o.position.toArray()), info = motion.info();
  motion.sync(battle, .3, 0, 0);
  assert.deepEqual(model.children.map(o => o.position.toArray()), pose); assert.deepEqual(motion.info(), info);
  motion.sync(battle, .3, 0, .2); assert.equal(motion.info().gaitWeight, 0);
  motion.sync(battle, .6, 0, .1, true); assert.equal(motion.info().gaitWeight, 0);
  motion.sync({}, 7, 8, .1); assert.equal(motion.info().phase, 0); assert.equal(motion.info().moving, false);
});

test('textured batching keeps every UV and rejects untextured parts instead of silently discarding the atlas', () => {
  const geo = new BoxGeometry(), uv = geo.toNonIndexed().getAttribute('uv');
  const result = bakeMatrices([{ geo, color: 0xffffff, matrix: new Matrix4().makeTranslation(2,0,0) }], true);
  assert.deepEqual(Array.from(result.getAttribute('uv').array), Array.from(uv.array));
  geo.deleteAttribute('uv');assert.throws(() => bakeMatrices([{geo,color:0xffffff,matrix:new Matrix4()}],true),/missing UV/);
});
