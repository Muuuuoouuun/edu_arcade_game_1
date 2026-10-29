import test from 'node:test';
import assert from 'node:assert/strict';
import { actDefense, actTacticalDefense, createDefense, positionOnPath, stepDefense, waveSize } from './engine.ts';
import type { TacticalAction } from './engine.ts';
import type { DefenseAction, DefenseState, Enemy, HeroId } from './types.ts';
import {
  addPauseReason, clearPauseReason, isPaused, canUseTactics,
  openTacticalSession, commitTacticalAction,
} from './tactics.ts';
import type { PauseReasons, TacticalContext, TacticalRequest, TacticalSession, TacticalTarget } from './tactics.ts';

const runId = 'run-current';
const context = (reasons: PauseReasons = ['tactical'], visitors: readonly HeroId[] = ['mage', 'elf', 'druid']): TacticalContext => ({ runId, active: true, reasons, visitors });
function session(state: DefenseState, id: string, target: TacticalTarget): TacticalSession {
  const opened = openTacticalSession(state, runId, id, target);
  assert.ok(opened); return opened;
}
const request = (id: string, action: TacticalAction, confirmSell = false): TacticalRequest => ({ runId, sessionId: id, action, confirmSell });
const prepared = (): DefenseState => ({ ...createDefense(4, 'mage'), paused: true, coins: 1000 });
function frozenCombat(): DefenseState {
  let s = actDefense(createDefense(8, 'druid', 1, 'veteran'), { type: 'build', slot: 2, kind: 'magic' });
  s = actDefense(s, { type: 'start-wave' });
  const boss: Enemy = {
    id: 100, kind: 'frostboss', hp: 10000, maxHp: 10000, progress: 500, path: 0,
    speed: 0, ...positionOnPath(0, 500, 8), wet: 1, burn: 0, slow: 0, hit: 0,
  };
  s = { ...s, spawned: waveSize(8, 1, 'veteran'), nextId: 101, enemies: [boss], bossCycle: .01, skillCooldown: 9 };
  for (let frame = 0; frame < 20 && s.projectiles.length === 0; frame++) s = stepDefense(s, .02);
  assert.ok(s.projectiles.length > 0); assert.ok(s.bossCharge > 0);
  s = actDefense(s, { type: 'dash', point: { x: 750, y: 390 } });
  return actDefense(s, { type: 'pause' });
}
function combatFrame(s: DefenseState) {
  return {
    phase: s.phase, stage: s.stage, difficulty: s.difficulty, speed: s.speed,
    time: s.time, wave: s.wave, hp: s.hp, outpostHp: s.outpostHp, kills: s.kills,
    leaks: s.leaks, questProgress: s.questProgress, enemies: s.enemies,
    projectiles: s.projectiles, attacks: s.attacks, heroPosition: s.heroPosition,
    heroTarget: s.heroTarget, heroVelocity: s.heroVelocity, pet: s.pet,
    heroCooldown: s.heroCooldown, mercCooldown: s.mercCooldown, petCooldown: s.petCooldown,
    skillCooldown: s.skillCooldown, dashCooldown: s.dashCooldown, dashTime: s.dashTime,
    bossCharge: s.bossCharge, bossCycle: s.bossCycle, freeze: s.freeze,
    spawned: s.spawned, spawnTimer: s.spawnTimer,
  };
}

test('a tactical purchase preserves live projectiles, boss charge, dash, timers and every existing effect', () => {
  const before = frozenCombat(), frozen = combatFrame(before);
  const result = commitTacticalAction(before, session(before, 'build', { kind: 'slot', slot: 3 }),
    request('build', { type: 'build', slot: 3, kind: 'cannon' }), context());
  assert.equal(result.ok, true); assert.equal(result.state.paused, true);
  assert.equal(result.state.coins, before.coins - 110); assert.equal(result.state.towers.length, 2);
  assert.deepEqual(combatFrame(result.state), frozen);
  assert.deepEqual(result.state.effects.slice(0, before.effects.length), before.effects);
  assert.equal(result.state.effects.at(-1)?.kind, 'build'); assert.equal(result.state.effects.at(-1)?.age, 0);
  assert.equal(stepDefense(result.state, 30), result.state, 'waiting in the sheet does not run any simulation');
  assert.equal(before.towers.length, 1); assert.equal(before.coins, 190, 'the original state remains unchanged');
});

test('the ordinary pause gate stays closed; the explicit tactical path permits only purchases', () => {
  const s = prepared();
  for (const action of [
    { type: 'build', slot: 0, kind: 'magic' }, { type: 'upgrade', slot: 0, branch: 'fire' },
    { type: 'hire', hero: 'elf' }, { type: 'sell', slot: 0 },
  ] as TacticalAction[]) assert.equal(actDefense(s, action), s);
  for (const action of [
    { type: 'start-wave' }, { type: 'skill' }, { type: 'move', point: { x: 500, y: 300 } },
    { type: 'dash', point: { x: 500, y: 300 } }, { type: 'speed' }, { type: 'pause' },
    { type: 'resume' }, { type: 'promote', choice: 'power' },
  ] as DefenseAction[]) {
    assert.equal(actTacticalDefense(s, action as TacticalAction), s);
    const result = commitTacticalAction(s, session(s, 'slot', { kind: 'slot', slot: 0 }),
      request('slot', action as TacticalAction), context());
    assert.equal(result.ok, false); assert.equal(result.state, s);
  }
  const playing = { ...s, paused: false };
  assert.equal(actTacticalDefense(playing, { type: 'build', slot: 0, kind: 'magic' }), playing);
  for (const phase of ['promotion', 'won', 'lost'] as const) {
    const locked = { ...s, phase };
    assert.equal(actTacticalDefense(locked, { type: 'build', slot: 0, kind: 'magic' }), locked);
  }
});

test('closing a sheet or return prompt clears only its own pause reason', () => {
  const original: PauseReasons = Object.freeze(['manual']);
  const sheet = addPauseReason(original, 'tactical');
  assert.deepEqual(original, ['manual']); assert.equal(isPaused(sheet), true); assert.equal(canUseTactics(sheet), true);
  assert.equal(addPauseReason(sheet, 'tactical'), sheet, 'opening twice cannot add duplicate reasons');
  const interrupted = addPauseReason(addPauseReason(sheet, 'system'), 'blocked');
  assert.equal(canUseTactics(interrupted), false);
  const modalClosed = clearPauseReason(interrupted, 'blocked');
  assert.equal(canUseTactics(modalClosed), false, 'closing a modal cannot clear a hidden-app/rotation latch');
  const returned = clearPauseReason(modalClosed, 'system');
  assert.deepEqual(returned, ['manual', 'tactical']); assert.equal(canUseTactics(returned), true);
  const sheetClosed = clearPauseReason(returned, 'tactical');
  assert.deepEqual(sheetClosed, ['manual']); assert.equal(isPaused(sheetClosed), true);
  assert.equal(isPaused(clearPauseReason(sheetClosed, 'manual')), false);
  assert.deepEqual(clearPauseReason(clearPauseReason(modalClosed, 'tactical'), 'system'), ['manual'], 'the reverse close order preserves manual pause too');
  assert.equal(clearPauseReason(original, 'system'), original);
});

test('system/blocked pauses lock purchases, while a manually paused tactical session can buy', () => {
  const s = prepared(), opened = session(s, 'buy', { kind: 'slot', slot: 0 });
  const command = request('buy', { type: 'build', slot: 0, kind: 'magic' });
  for (const reasons of [['manual'], ['tactical', 'system'], ['tactical', 'blocked']] as PauseReasons[]) {
    const result = commitTacticalAction(s, opened, command, context(reasons));
    assert.equal(result.error, 'blocked'); assert.equal(result.state, s); assert.equal(result.session, opened);
  }
  const manual: PauseReasons = ['manual', 'tactical'];
  const bought = commitTacticalAction(s, opened, command, context(manual));
  assert.equal(bought.ok, true); assert.equal(bought.state.paused, true); assert.deepEqual(manual, ['manual', 'tactical']);
  assert.equal(isPaused(clearPauseReason(manual, 'tactical')), true);
  const unpaused = { ...s, paused: false };
  assert.equal(commitTacticalAction(unpaused, opened, command, context()).error, 'paused-required');
});

test('a successful session is consumed once; rapid upgrade repeats cannot buy the next level', () => {
  const s = prepared(), opened = session(s, 'build', { kind: 'slot', slot: 0 });
  const command = request('build', { type: 'build', slot: 0, kind: 'magic' });
  const built = commitTacticalAction(s, opened, command, context());
  assert.equal(built.ok, true); assert.equal(built.state.coins, 910); assert.equal(built.session?.consumed, true);
  const repeated = commitTacticalAction(built.state, built.session, command, context());
  assert.equal(repeated.error, 'consumed'); assert.equal(repeated.state, built.state);
  const upgrading = session(built.state, 'upgrade', { kind: 'slot', slot: 0 });
  assert.equal(commitTacticalAction(built.state, upgrading, command, context()).error, 'stale-session');
  const upgrade = request('upgrade', { type: 'upgrade', slot: 0, branch: 'fire' });
  const improved = commitTacticalAction(built.state, upgrading, upgrade, context());
  assert.equal(improved.ok, true); assert.equal(improved.state.coins, 830); assert.equal(improved.state.towers[0].level, 2);
  const doubleTap = commitTacticalAction(improved.state, improved.session, upgrade, context());
  assert.equal(doubleTap.error, 'consumed'); assert.equal(doubleTap.state.coins, 830); assert.equal(doubleTap.state.towers[0].level, 2);
  assert.equal(upgrading.consumed, false, 'pure helpers return the new session without mutating their input');
});

test('a late callback from another run, screen, session or wave cannot purchase', () => {
  const s = prepared(), opened = session(s, 'buy', { kind: 'slot', slot: 0 });
  const command = request('buy', { type: 'build', slot: 0, kind: 'magic' });
  assert.equal(commitTacticalAction(s, opened, command, { ...context(), active: false }).error, 'inactive');
  assert.equal(commitTacticalAction(s, opened, command, { ...context(), runId: 'new-run' }).error, 'stale-session');
  assert.equal(commitTacticalAction(s, opened, { ...command, runId: 'old-run' }, context()).error, 'stale-session');
  assert.equal(commitTacticalAction(s, opened, { ...command, sessionId: 'old-sheet' }, context()).error, 'stale-session');
  assert.equal(commitTacticalAction(s, null, command, context()).error, 'stale-session');
  for (const changed of [{ ...s, stage: 5 }, { ...s, wave: 1 }, { ...s, phase: 'intermission' as const }]) {
    const result = commitTacticalAction(changed, opened, command, context());
    assert.equal(result.error, 'stale-session'); assert.equal(result.state, changed);
  }
  for (const phase of ['promotion', 'won', 'lost'] as const) {
    const changed = { ...s, phase };
    assert.equal(commitTacticalAction(changed, opened, command, context()).error, 'invalid-phase');
    assert.equal(openTacticalSession(changed, runId, 'locked', { kind: 'scout' }), null);
  }
});

test('expected tower snapshots reject occupied, removed, changed-level and changed-branch targets', () => {
  const s = prepared(), empty = session(s, 'empty', { kind: 'slot', slot: 0 });
  const built = actTacticalDefense(s, { type: 'build', slot: 0, kind: 'magic' });
  assert.equal(commitTacticalAction(built, empty, request('empty', { type: 'build', slot: 0, kind: 'cannon' }), context()).error, 'stale-target');
  const improved = actTacticalDefense(built, { type: 'upgrade', slot: 0, branch: 'fire' });
  const opened = session(improved, 'upgrade', { kind: 'slot', slot: 0 });
  const command = request('upgrade', { type: 'upgrade', slot: 0 });
  for (const changed of [
    { ...improved, towers: [] },
    { ...improved, towers: [{ ...improved.towers[0], level: 3 }] },
    { ...improved, towers: [{ ...improved.towers[0], branch: 'lightning' as const }] },
    { ...improved, towers: [{ ...improved.towers[0], kind: 'crossbow' as const }] },
  ]) {
    const result = commitTacticalAction(changed, opened, command, context());
    assert.equal(result.error, 'stale-target'); assert.equal(result.state, changed);
  }
  assert.deepEqual(opened.expectedTower, { kind: 'magic', level: 2, branch: 'fire' });
  assert.equal(commitTacticalAction(improved, opened, request('upgrade', { type: 'upgrade', slot: 1 }), context()).error, 'invalid-action');
  assert.equal(openTacticalSession(createDefense(1, 'mage'), runId, 'locked-slot', { kind: 'slot', slot: 6 }), null);
  assert.equal(openTacticalSession(s, '', 'bad-run', { kind: 'scout' }), null);
});

test('insufficient current coins keep the sheet reusable and return the exact shortfall', () => {
  const s = { ...prepared(), coins: 69 }, opened = session(s, 'buy', { kind: 'slot', slot: 0 });
  const command = request('buy', { type: 'build', slot: 0, kind: 'crossbow' });
  const failed = commitTacticalAction(s, opened, command, context());
  assert.equal(failed.error, 'insufficient-coins'); assert.equal(failed.missingCoins, 1);
  assert.equal(failed.state, s); assert.equal(failed.session, opened); assert.equal(opened.consumed, false);
  const funded = { ...s, coins: 70 };
  const bought = commitTacticalAction(funded, opened, command, context());
  assert.equal(bought.ok, true); assert.equal(bought.state.coins, 0); assert.equal(bought.session?.consumed, true);
  const invalidBranch = session(bought.state, 'branch', { kind: 'slot', slot: 0 });
  const invalid = commitTacticalAction({ ...bought.state, coins: 1000 }, invalidBranch,
    request('branch', { type: 'upgrade', slot: 0, branch: 'water' }), context());
  assert.equal(invalid.error, 'invalid-action'); assert.equal(invalid.session, invalidBranch);
});

test('hiring rechecks visitor unlock and current mercenary without consuming a failed session', () => {
  const s = prepared(), opened = session(s, 'hire', { kind: 'hire' });
  const command = request('hire', { type: 'hire', hero: 'druid' });
  const locked = commitTacticalAction(s, opened, command, context(['tactical'], ['mage']));
  assert.equal(locked.error, 'locked-hero'); assert.equal(locked.state, s); assert.equal(locked.session, opened);
  const hired = commitTacticalAction(s, opened, command, context(['manual', 'tactical']));
  assert.equal(hired.ok, true); assert.equal(hired.state.coins, 880); assert.equal(hired.state.mercenary, 'druid');
  assert.equal(hired.state.paused, true); assert.ok(hired.state.pet); assert.equal(hired.state.time, s.time);
  assert.equal(commitTacticalAction(hired.state, opened, command, context()).error, 'stale-target');
  const scout = session(s, 'scout', { kind: 'scout' });
  assert.equal(commitTacticalAction(s, scout, request('scout', { type: 'hire', hero: 'elf' }), context()).error, 'invalid-action');
});

test('selling requires an explicit confirmation and uses the original refund and shot cancellation rules', () => {
  const s = frozenCombat(), opened = session(s, 'sell', { kind: 'slot', slot: 2 });
  const blocked = commitTacticalAction(s, opened, request('sell', { type: 'sell', slot: 2 }), context());
  assert.equal(blocked.error, 'confirmation-required'); assert.equal(blocked.state, s);
  const sold = commitTacticalAction(s, opened, request('sell', { type: 'sell', slot: 2 }, true), context());
  assert.equal(sold.ok, true); assert.equal(sold.state.coins, s.coins + 67); assert.equal(sold.state.towers.length, 0);
  assert.equal(sold.state.paused, true); assert.equal(sold.state.time, s.time); assert.equal(sold.state.bossCharge, s.bossCharge);
  assert.deepEqual(sold.state.projectiles, s.projectiles, 'already airborne shots are not advanced or deleted by a sale');
  assert.deepEqual(sold.state.attacks, s.attacks.filter(a => a.source !== 'tower' || a.sourceSlot !== 2 || a.fired));
  const repeat = commitTacticalAction(sold.state, sold.session, request('sell', { type: 'sell', slot: 2 }, true), context());
  assert.equal(repeat.error, 'consumed'); assert.equal(repeat.state.coins, sold.state.coins);
});
