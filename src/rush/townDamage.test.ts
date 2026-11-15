import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TownDamage, DAMAGE_REFRACTORY_TICKS } from './townDamage.ts';

test('first observation reports exact damage thresholds without inventing a hit', () => {
  for (const [hp, stage] of [[1000, 'healthy'], [651, 'healthy'], [650, 'damaged'], [301, 'damaged'], [300, 'critical'], [0, 'destroyed'], [-5, 'destroyed']] as const) {
    const v = new TownDamage().update({}, 500, hp, 1000);
    assert.equal(v.stage, stage);
    assert.equal(v.pulse, 0);
    assert.equal(v.emissiveIntensity, 0);
  }
});

test('actual damage produces warm cue, freezes on repeated tick, expires with simulation time', () => {
  const battle = Object.freeze({ seed: 7 });
  const cue = new TownDamage();
  cue.update(battle, 10, 1000, 1000);
  const hit = cue.update(battle, 11, 900, 1000);
  assert.equal(hit.pulse, 1);
  assert.equal(hit.emissive, 0xff762d);
  for (let frame = 0; frame < 100; frame++) assert.deepEqual(cue.update(battle, 11, 900, 1000), hit);
  assert.ok(cue.update(battle, 17, 900, 1000).pulse < hit.pulse);
  assert.ok(cue.update(battle, 24, 900, 1000).pulse > 0);
  assert.equal(cue.update(battle, 25, 900, 1000).pulse, 0);
});

test('speed/render frequency does not change a cue at the same simulation tick', () => {
  const battle = {};
  const smooth = new TownDamage(), jump = new TownDamage();
  for (const c of [smooth, jump]) { c.update(battle, 0, 1000, 1000); c.update(battle, 1, 600, 1000); }
  for (let t = 2; t < 10; t++) smooth.update(battle, t, 600, 1000);
  assert.deepEqual(smooth.update(battle, 10, 600, 1000), jump.update(battle, 10, 600, 1000));
  assert.equal(jump.update(battle, 500, 600, 1000).pulse, 0);
});

test('rapid consecutive attacks cannot continually reset or flash the pulse', () => {
  const b = {}, cue = new TownDamage();
  cue.update(b, 0, 1000, 1000);
  let previous = 1;
  for (let t = 1; t <= DAMAGE_REFRACTORY_TICKS; t++) {
    const v = cue.update(b, t, 1000 - t, 1000);
    assert.ok(v.pulse <= previous);
    previous = v.pulse;
  }
  assert.equal(previous, 0);
  assert.equal(cue.update(b, DAMAGE_REFRACTORY_TICKS + 1, 900, 1000).pulse, 1);
});

test('healing, new battle, tick rewind and respawn clear old damage responses', () => {
  const b = {}, cue = new TownDamage();
  cue.update(b, 0, 1000, 1000);
  assert.equal(cue.update(b, 10, 500, 1000).pulse, 1);
  assert.equal(cue.update(b, 11, 600, 1000).pulse, 0);
  assert.equal(cue.update(b, 12, 550, 1000).pulse, 0, 'healing cannot bypass the pulse rate limit');
  assert.equal(cue.update({}, 12, 550, 1000).pulse, 0);
  cue.update(b, 30, 550, 1000);
  cue.update(b, 31, 500, 1000);
  assert.equal(cue.update(b, 0, 400, 1000).pulse, 0);
  assert.equal(cue.update(b, 1, 0, 1000).stage, 'destroyed');
  assert.equal(cue.update(b, 2, 1000, 1000).pulse, 0);
});

test('reduced motion preserves static soot and cannot queue a later pulse', () => {
  const b = {}, cue = new TownDamage();
  cue.update(b, 0, 1000, 1000, true);
  const v = cue.update(b, 1, 250, 1000, true);
  assert.equal(v.stage, 'critical'); assert.notEqual(v.tint, 0xffffff); assert.equal(v.pulse, 0);
  assert.equal(cue.update(b, 2, 250, 1000, false).pulse, 0);
  assert.equal(cue.update(b, 80, 200, 1000, false).pulse, 1);
  assert.equal(cue.update(b, 80, 200, 1000, true).pulse, 0);
  assert.equal(cue.update(b, 80, 200, 1000, false).pulse, 0);
});

test('independent entities sharing a battle cannot change each other or the simulation', () => {
  const b = Object.freeze({ tick: 0, hp: 1000 }), town = new TownDamage(), hero = new TownDamage();
  town.update(b, 0, 1000, 1000); hero.update(b, 0, 420, 420);
  assert.equal(town.update(b, 1, 200, 1000).pulse, 1);
  assert.equal(hero.update(b, 1, 420, 420).stage, 'healthy');
  assert.equal(hero.update(b, 1, 420, 420).pulse, 0);
  assert.deepEqual(b, { tick: 0, hp: 1000 });
});

test('invalid intermediate samples cannot yield NaN or contaminate the next battle sample', () => {
  const b = {}, cue = new TownDamage();
  for (const args of [[NaN, 100, 100], [1, Infinity, 100], [1, 100, 0], [-1, 100, 100]]) {
    const v = cue.update(b, args[0], args[1], args[2]);
    assert.equal(v.pulse, 0); assert.equal(v.emissiveIntensity, 0);
  }
  assert.equal(cue.update(b, 4, 25, 100).stage, 'critical');
  assert.equal(cue.update(b, 4, 25, 100).pulse, 0);
});
