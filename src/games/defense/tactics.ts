import { actTacticalDefense, isTacticalAction, upgradeCost } from './engine.ts';
import type { TacticalAction } from './engine.ts';
import { getSlots, TOWERS } from './data.ts';
import type { DefenseState, HeroId, Tower } from './types.ts';

export type PauseReason = 'manual' | 'tactical' | 'system' | 'blocked';
export type PauseReasons = readonly PauseReason[];

export function addPauseReason(reasons: PauseReasons, reason: PauseReason): PauseReasons {
  return reasons.includes(reason) ? reasons : [...reasons, reason];
}
/** Clear only the named reason. Clear system explicitly after the return prompt;
 * merely becoming visible again must never clear its latch. */
export function clearPauseReason(reasons: PauseReasons, reason: PauseReason): PauseReasons {
  return reasons.includes(reason) ? reasons.filter(item => item !== reason) : reasons;
}
export const isPaused = (reasons: PauseReasons): boolean => reasons.length > 0;
export const canUseTactics = (reasons: PauseReasons): boolean =>
  reasons.includes('tactical') && !reasons.includes('system') && !reasons.includes('blocked');

export type TowerSnapshot = Readonly<Pick<Tower, 'kind' | 'level' | 'branch'>>;
export type TacticalTarget =
  | { kind: 'slot'; slot: number }
  | { kind: 'hire' }
  | { kind: 'scout' };
export type TacticalSession = Readonly<{
  id: string;
  runId: string;
  stage: number;
  wave: number;
  phase: DefenseState['phase'];
  target: TacticalTarget;
  expectedTower: TowerSnapshot | null;
  expectedMercenary: HeroId | null;
  consumed: boolean;
}>;
export type TacticalRequest = {
  runId: string;
  sessionId: string;
  action: TacticalAction;
  confirmSell?: boolean;
};
export type TacticalContext = {
  runId: string;
  active: boolean;
  reasons: PauseReasons;
  visitors: readonly HeroId[];
};
export type TacticalError =
  | 'inactive' | 'stale-session' | 'consumed' | 'paused-required' | 'blocked'
  | 'invalid-phase' | 'invalid-action' | 'stale-target' | 'locked-hero'
  | 'confirmation-required' | 'insufficient-coins';
export type TacticalResult = {
  state: DefenseState;
  session: TacticalSession | null;
  ok: boolean;
  error: TacticalError | null;
  missingCoins?: number;
};

const validPhase = (state: DefenseState) => ['prep', 'wave', 'intermission'].includes(state.phase);
const validId = (id: string) => typeof id === 'string' && id.trim().length > 0;
function towerSnapshot(tower: Tower | undefined): TowerSnapshot | null {
  return tower ? { kind: tower.kind, level: tower.level, branch: tower.branch } : null;
}
function sameTower(expected: TowerSnapshot | null, actual: Tower | undefined): boolean {
  return expected === null ? actual === undefined : Boolean(actual &&
    expected.kind === actual.kind && expected.level === actual.level && expected.branch === actual.branch);
}

/** IDs are supplied by the UI, which keeps the latest session in a synchronous ref.
 * Opening can precede adding the tactical pause; committing always requires it. */
export function openTacticalSession(
  state: DefenseState, runId: string, sessionId: string, target: TacticalTarget,
): TacticalSession | null {
  if (!validPhase(state) || !validId(runId) || !validId(sessionId)) return null;
  if (target.kind === 'slot' && !getSlots(state.stage).some(slot => slot.id === target.slot && slot.unlock <= state.stage)) return null;
  const tower = target.kind === 'slot' ? state.towers.find(item => item.slot === target.slot) : undefined;
  return {
    id: sessionId, runId, stage: state.stage, wave: state.wave, phase: state.phase,
    target: { ...target }, expectedTower: towerSnapshot(tower),
    expectedMercenary: state.mercenary, consumed: false,
  };
}

/** Apply at most one purchase to the current session. Publish both returned state
 * and session synchronously before allowing another callback to commit. Failures
 * keep the panel/session intact, so insufficient funds can be explained in place. */
export function commitTacticalAction(
  state: DefenseState, session: TacticalSession | null,
  request: TacticalRequest, context: TacticalContext,
): TacticalResult {
  const reject = (error: TacticalError, missingCoins?: number): TacticalResult => ({
    state, session, ok: false, error, ...(missingCoins === undefined ? {} : { missingCoins }),
  });
  if (!context.active) return reject('inactive');
  if (!session || session.runId !== context.runId || request.runId !== context.runId ||
      request.sessionId !== session.id) return reject('stale-session');
  if (session.consumed) return reject('consumed');
  if (!validPhase(state)) return reject('invalid-phase');
  if (session.stage !== state.stage || session.wave !== state.wave || session.phase !== state.phase) return reject('stale-session');
  if (!state.paused) return reject('paused-required');
  if (!canUseTactics(context.reasons)) return reject('blocked');
  const action = request.action;
  if (!isTacticalAction(action)) return reject('invalid-action');

  let cost = 0;
  if (action.type === 'hire') {
    if (session.target.kind !== 'hire') return reject('invalid-action');
    if (state.mercenary !== session.expectedMercenary) return reject('stale-target');
    if (!context.visitors.includes(action.hero)) return reject('locked-hero');
    if (state.mercenary || action.hero === state.hero) return reject('invalid-action');
    cost = 120;
  } else {
    if (session.target.kind !== 'slot' || session.target.slot !== action.slot) return reject('invalid-action');
    const tower = state.towers.find(item => item.slot === action.slot);
    if (!sameTower(session.expectedTower, tower)) return reject('stale-target');
    if (action.type === 'build') {
      if (tower) return reject('invalid-action');
      cost = TOWERS[action.kind]?.cost;
    } else {
      if (!tower) return reject('invalid-action');
      if (action.type === 'sell') {
        if (!request.confirmSell) return reject('confirmation-required');
      } else {
        cost = upgradeCost(tower);
        if (cost === 0) return reject('invalid-action');
      }
    }
  }
  if (!Number.isFinite(cost) || cost < 0) return reject('invalid-action');
  if (state.coins < cost) return reject('insufficient-coins', cost - state.coins);
  const next = actTacticalDefense(state, action);
  if (next === state || next.coins === state.coins) return reject('invalid-action');
  return { state: next, session: { ...session, consumed: true }, ok: true, error: null };
}
