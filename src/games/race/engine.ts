import { random, shuffle } from '../random.ts';
import { scienceDeck } from './science.ts';
import type { ScienceQuestion } from './science.ts';

export const LAP_LENGTH = 3000;
export const LAPS = 3;
export const RACE_LENGTH = LAP_LENGTH * LAPS;
export const RACE_LIMIT = 180;
// A track unit is 0.47 m, keeping the distance labels and km/h display consistent.
export const METERS_PER_UNIT = 0.47;
export const PREVIEW_DISTANCE = 700;
export const CHOICE_DISTANCE = 520;
export const LANES = [-0.66, 0, 0.66] as const;
export type Item = 'boost' | 'shield' | 'lightning';
export const ITEM_INFO = {
  boost: { name: '로켓 부스터', short: '부스터', description: '3.2초 동안 빠르게 질주!' },
  shield: { name: '자기장 쉴드', short: '쉴드', description: '8초 동안 충돌과 잔디 감속 방어!' },
  lightning: { name: '찌릿 번개', short: '번개', description: '라이벌 모두 3초 감속!' },
} as const;
export type Gate = { at: number; question: ScienceQuestion; reward: Item; penalty: 'empty' | 'slow' };
export type Rival = { name: string; distance: number; x: number; pace: number; slow: number; finishTime: number | null };
export type RaceReview = { question: ScienceQuestion; selected: string | null; correct: boolean; outcome: Item | 'empty' | 'slow' | 'miss' };
export type Notice = { id: number; kind: 'correct' | 'wrong' | 'collision'; title: string; body: string; ttl: number };
export type RaceState = {
  phase: 'ready' | 'countdown' | 'racing' | 'paused' | 'finished'; resumePhase: 'countdown' | 'racing'; countdown: number;
  distance: number; x: number; speed: number; elapsed: number; gates: Gate[]; gateIndex: number;
  targetLane: number | null; inventory: Item[]; boost: number; shield: number; lightning: number; slow: number; invulnerable: number;
  driftCharge: number; wasDrifting: boolean; steering: number; rivals: Rival[];
  obstacles: { at: number; x: number }[]; obstacleIndex: number;
  reviews: RaceReview[]; combo: number; maxCombo: number; notice: Notice | null;
  finishTime: number | null; finishReason: 'finish' | 'timeout' | null; place: number | null;
};
export type RaceInput = { steer: number; drift: boolean };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function createRace(seed: number): RaceState {
  const rng = random(seed);
  const rewards = Array.from({ length: 3 }, () => shuffle<Item>(['boost', 'shield', 'lightning'], rng)).flat();
  const gates = scienceDeck(seed).map((question, index) => ({
    at: 750 + index * 1000, question, reward: rewards[index], penalty: rng() > 0.5 ? 'slow' as const : 'empty' as const,
  }));
  return {
    phase: 'ready', resumePhase: 'racing', countdown: 3, distance: 0, x: 0, speed: 0, elapsed: 0,
    gates, gateIndex: 0, targetLane: null, inventory: [], boost: 0, shield: 0, lightning: 0, slow: 0, invulnerable: 0,
    driftCharge: 0, wasDrifting: false, steering: 0,
    rivals: ['라임', '코코', '루키'].map((name, i) => ({ name, distance: 75 + i * 65, x: LANES[i], pace: 94 + i * 3, slow: 0, finishTime: null })),
    obstacles: Array.from({ length: 9 }, (_, i) => ({ at: 430 + i * 1000, x: LANES[Math.floor(rng() * 3)] })), obstacleIndex: 0,
    reviews: [], combo: 0, maxCombo: 0, notice: null, finishTime: null, finishReason: null, place: null,
  };
}

export function startRace(s: RaceState): RaceState { return s.phase === 'ready' ? { ...s, phase: 'countdown' } : s; }
export function pauseRace(s: RaceState): RaceState {
  return s.phase === 'racing' || s.phase === 'countdown' ? { ...s, resumePhase: s.phase, phase: 'paused', wasDrifting: false, driftCharge: 0 } : s;
}
export function resumeRace(s: RaceState): RaceState { return s.phase === 'paused' ? { ...s, phase: s.resumePhase } : s; }
export function activeGate(s: RaceState): Gate | null {
  const gate = s.gates[s.gateIndex];
  return gate && gate.at - s.distance <= PREVIEW_DISTANCE ? gate : null;
}
export function choicesVisible(s: RaceState): boolean {
  const gate = activeGate(s);
  return s.phase === 'racing' && Boolean(gate && gate.at - s.distance <= CHOICE_DISTANCE);
}
export function currentLane(x: number): number { return x < -0.33 ? 0 : x > 0.33 ? 2 : 1; }
export function selectLane(s: RaceState, lane: number): RaceState {
  return choicesVisible(s) && Number.isInteger(lane) && lane >= 0 && lane <= 2 ? { ...s, targetLane: lane } : s;
}
export function racePlace(s: RaceState): number {
  if (s.place !== null) return s.place;
  return 1 + s.rivals.filter(r => r.finishTime !== null || r.distance > s.distance).length;
}
export function raceLap(s: RaceState): number { return Math.min(LAPS, Math.floor(s.distance / LAP_LENGTH) + 1); }
export function raceScore(s: RaceState): number {
  const correct = s.reviews.filter(r => r.correct).length;
  return correct * 180 + s.maxCombo * 80 + (s.finishReason === 'finish' ? (5 - racePlace(s)) * 750 + Math.round(Math.max(0, 120 - s.elapsed) * 15) : 0);
}
export function trackCurve(distance: number): number {
  const angle = distance / LAP_LENGTH * Math.PI * 2;
  return Math.sin(angle) * 0.65 + Math.sin(angle * 2) * 0.2;
}

export function useRaceItem(s: RaceState): RaceState {
  if (s.phase !== 'racing' || !s.inventory.length) return s;
  const [item, ...inventory] = s.inventory;
  if (item === 'boost') return { ...s, inventory, boost: Math.max(s.boost, 3.2) };
  if (item === 'shield') return { ...s, inventory, shield: 8 };
  return { ...s, inventory, lightning: 3, rivals: s.rivals.map(r => r.finishTime === null ? { ...r, slow: 3 } : r) };
}

function collectGate(s: RaceState, gate: Gate): RaceState {
  const missed = Math.abs(s.x) > 1.12;
  const selected = missed ? null : gate.question.choices[currentLane(s.x)];
  const correct = selected === gate.question.answer;
  const outcome = correct ? gate.reward : missed ? 'miss' : gate.penalty;
  const combo = correct ? s.combo + 1 : 0;
  return {
    ...s, gateIndex: s.gateIndex + 1, targetLane: null, combo, maxCombo: Math.max(s.maxCombo, combo),
    inventory: correct ? [...s.inventory, gate.reward] : s.inventory,
    slow: outcome === 'slow' ? Math.max(s.slow, 2.8) : s.slow,
    reviews: [...s.reviews, { question: gate.question, selected, correct, outcome }],
    notice: { id: s.gateIndex + 1, kind: correct ? 'correct' : 'wrong', ttl: correct ? 2.8 : 4.2,
      title: correct ? `${ITEM_INFO[gate.reward].name} 획득!` : missed ? '상자를 놓쳤어요!' : outcome === 'slow' ? '앗! 2.8초 감속' : '꽝! 빈 상자예요',
      body: correct ? `${ITEM_INFO[gate.reward].description} 아이템 버튼으로 사용해요.` : `정답: ${gate.question.answer}. ${gate.question.explanation}` },
  };
}

export function stepRace(previous: RaceState, input: RaceInput, delta: number): RaceState {
  if (previous.phase !== 'racing' && previous.phase !== 'countdown') return previous;
  const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.1);
  if (!dt) return previous;
  if (previous.phase === 'countdown') {
    const countdown = Math.max(0, previous.countdown - dt);
    return { ...previous, countdown, phase: countdown <= 0.00001 ? 'racing' : 'countdown' };
  }
  let s: RaceState = { ...previous,
    boost: Math.max(0, previous.boost - dt), shield: Math.max(0, previous.shield - dt), lightning: Math.max(0, previous.lightning - dt), slow: Math.max(0, previous.slow - dt),
    invulnerable: Math.max(0, previous.invulnerable - dt), elapsed: previous.elapsed + dt,
    notice: previous.notice && previous.notice.ttl > dt ? { ...previous.notice, ttl: previous.notice.ttl - dt } : null,
  };
  const steer = clamp(input.steer, -1, 1);
  if (steer) s.targetLane = null;
  const drifting = input.drift && Math.abs(steer) > 0 && s.speed > 45;
  s.driftCharge = drifting ? Math.min(1.4, s.driftCharge + dt) : Math.max(0, s.driftCharge - dt * 2);
  if (previous.wasDrifting && !input.drift && previous.driftCharge >= 0.85) { s.boost = Math.max(s.boost, 1.25); s.driftCharge = 0; }
  s.wasDrifting = drifting;
  const laneSteer = s.targetLane !== null ? clamp((LANES[s.targetLane] - s.x) * 4, -1.5, 1.5) : 0;
  s.steering = steer || laneSteer;
  s.x = clamp(s.x + (steer * (drifting ? 1.25 : 0.95) + laneSteer) * dt - trackCurve(s.distance) * 0.035 * dt, -1.45, 1.45);
  const offRoad = Math.abs(s.x) > 1.04 && s.shield === 0;
  const targetSpeed = (s.boost > 0 ? 145 : 100) * (s.slow > 0 ? 0.52 : 1) * (offRoad ? 0.5 : 1);
  s.speed += (targetSpeed - s.speed) * Math.min(1, dt * (targetSpeed < s.speed ? 4 : 1.8));
  s.distance = Math.min(RACE_LENGTH, s.distance + s.speed * dt);
  s.rivals = previous.rivals.map((r, i) => {
    if (r.finishTime !== null) return r;
    const speed = (r.pace + Math.sin(s.elapsed * 0.37 + i * 2) * 4) * (r.slow > 0 ? 0.43 : 1);
    const distance = Math.min(RACE_LENGTH, r.distance + speed * dt);
    return { ...r, distance, x: clamp(LANES[i] + Math.sin(s.elapsed * 0.21 + i) * 0.2, -0.85, 0.85), slow: Math.max(0, r.slow - dt),
      finishTime: distance === RACE_LENGTH ? previous.elapsed + (RACE_LENGTH - r.distance) / speed : null };
  });
  const obstacle = s.obstacles[s.obstacleIndex];
  const hitObstacle = obstacle && previous.distance < obstacle.at && s.distance >= obstacle.at && Math.abs(s.x - obstacle.x) < 0.26;
  if (obstacle && s.distance >= obstacle.at) s.obstacleIndex++;
  const hitRival = s.rivals.some(r => r.finishTime === null && Math.abs(r.distance - s.distance) < 14 && Math.abs(r.x - s.x) < 0.25);
  if ((hitObstacle || hitRival) && s.invulnerable === 0) {
    s.invulnerable = 1.6;
    if (!s.shield) s.slow = Math.max(s.slow, 1.25);
    if (!s.notice) s.notice = { id: -Math.round(s.elapsed * 1000), kind: 'collision', title: s.shield ? '쉴드가 막아줬어요!' : '쿵! 조심조심!', body: s.shield ? '그대로 달려요!' : '고깔과 다른 카트를 피해 달려요.', ttl: 1.4 };
  }
  const gate = s.gates[s.gateIndex];
  if (gate && previous.distance < gate.at && s.distance >= gate.at) s = collectGate(s, gate);
  if (s.distance >= RACE_LENGTH || s.elapsed >= RACE_LIMIT) {
    const finished = s.distance >= RACE_LENGTH;
    const finishTime = finished ? previous.elapsed + (RACE_LENGTH - previous.distance) / Math.max(1, s.speed) : null;
    const place = finished ? 1 + s.rivals.filter(r => r.finishTime !== null && r.finishTime < finishTime!).length : racePlace(s);
    s = { ...s, phase: 'finished', elapsed: finished ? finishTime! : RACE_LIMIT, finishTime, finishReason: finished ? 'finish' : 'timeout', place, speed: 0 };
  }
  return s;
}
