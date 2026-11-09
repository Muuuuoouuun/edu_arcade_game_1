export type MathProblem = {
  index: number;
  level: number;
  prompt: string;
  answer: number;
};

class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed === 0 ? 0x6d2b79f5 : seed >>> 0;
  }

  nextInt(maxExclusive: number): number {
    this.state ^= (this.state << 13) >>> 0;
    this.state ^= this.state >>> 17;
    this.state ^= (this.state << 5) >>> 0;
    const value = this.state & 0x7fffffff;
    return maxExclusive === 0 ? 0 : value % maxExclusive;
  }

  between(minInclusive: number, maxInclusive: number): number {
    return minInclusive + this.nextInt((maxInclusive - minInclusive) + 1);
  }
}

// Linearly interpolates a bound from `start` (first problem of a session) to `end` (last
// problem), so a session's difficulty ramps up gradually instead of holding one fixed range
// for every problem at a given level.
function ramp(start: number, end: number, t: number): number {
  return Math.round(start + (end - start) * t);
}

export function generateSessionProblems(seed: number, level: number, count: number): MathProblem[] {
  const rng = new DeterministicRng((seed ^ (level * 7919) ^ (count * 104729)) >>> 0);
  return Array.from({ length: count }, (_, index) => {
    const t = count <= 1 ? 0 : index / (count - 1);
    return buildProblem(rng, level, index, t);
  });
}

function buildProblem(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  switch (level) {
    case 1:
      return singleDigitAdd(rng, level, index, t);
    case 2:
      return within20Mix(rng, level, index, t);
    case 3:
      return twoDigitMix(rng, level, index, t);
    case 4:
      return twoDigitFull(rng, level, index, t);
    case 5:
      return tableMultiplication(rng, level, index, t);
    case 6:
      return exactDivision(rng, level, index, t);
    case 7:
      return twoStepMixed(rng, level, index, t);
    case 8:
      return threeNumberMixed(rng, level, index, t);
    case 9:
      return multiMultiplyDivide(rng, level, index, t);
    default:
      return bossRound(rng, level, index, t);
  }
}

function singleDigitAdd(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  const a = rng.between(1, 9);
  const b = rng.between(1, ramp(5, 9, t));
  return { index, level, prompt: `${a} + ${b}`, answer: a + b };
}

function within20Mix(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  const add = rng.nextInt(2) === 0;
  if (add) {
    const a = rng.between(3, ramp(9, 15, t));
    const b = rng.between(1, 20 - a);
    return { index, level, prompt: `${a} + ${b}`, answer: a + b };
  }

  const a = rng.between(8, ramp(14, 20, t));
  const b = rng.between(1, a - 1);
  return { index, level, prompt: `${a} - ${b}`, answer: a - b };
}

function twoDigitMix(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  const add = rng.nextInt(2) === 0;
  if (add) {
    const a = rng.between(10, ramp(19, 34, t));
    const b = rng.between(10, ramp(19, 29, t));
    return { index, level, prompt: `${a} + ${b}`, answer: a + b };
  }

  const a = rng.between(20, ramp(34, 54, t));
  const b = rng.between(10, a - 5);
  return { index, level, prompt: `${a} - ${b}`, answer: a - b };
}

function twoDigitFull(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  const add = rng.nextInt(2) === 0;
  if (add) {
    const a = rng.between(35, ramp(59, 89, t));
    const b = rng.between(25, ramp(49, 69, t));
    return { index, level, prompt: `${a} + ${b}`, answer: a + b };
  }

  const a = rng.between(50, ramp(79, 99, t));
  const b = rng.between(20, a - 15);
  return { index, level, prompt: `${a} - ${b}`, answer: a - b };
}

function tableMultiplication(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  const a = rng.between(2, ramp(5, 9, t));
  const b = rng.between(2, 9);
  return { index, level, prompt: `${a} × ${b}`, answer: a * b };
}

function exactDivision(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  const divisor = rng.between(2, ramp(5, 9, t));
  const quotient = rng.between(2, 9);
  const dividend = divisor * quotient;
  return { index, level, prompt: `${dividend} ÷ ${divisor}`, answer: quotient };
}

function twoStepMixed(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  const left = rng.between(2, 9);
  const right = rng.between(2, 9);
  const tail = rng.between(5, ramp(15, 30, t));
  const multiplyFirst = rng.nextInt(2) === 0;

  if (multiplyFirst) {
    return { index, level, prompt: `(${left} × ${right}) + ${tail}`, answer: (left * right) + tail };
  }

  // tail + left - right stays non-negative for every draw (grade 1-6 math never expects signed results).
  const bigger = Math.max(left, right);
  const smaller = Math.min(left, right);
  return { index, level, prompt: `${tail} + ${bigger} - ${smaller}`, answer: tail + bigger - smaller };
}

function threeNumberMixed(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  const a = rng.between(10, ramp(29, 49, t));
  const b = rng.between(5, ramp(19, 29, t));
  const addLast = rng.nextInt(2) === 0;

  if (addLast) {
    const bigger = Math.max(a, b);
    const smaller = Math.min(a, b);
    const c = rng.between(3, ramp(9, 19, t));
    return { index, level, prompt: `${bigger} - ${smaller} + ${c}`, answer: (bigger - smaller) + c };
  }

  // Bound c by a + b so a + b - c never goes negative.
  const maxC = Math.min(ramp(9, 19, t), a + b - 1);
  const c = rng.between(3, maxC);
  return { index, level, prompt: `${a} + ${b} - ${c}`, answer: a + b - c };
}

function multiMultiplyDivide(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  const a = rng.between(2, 9);
  const c = rng.between(2, 6);
  // Pick b as a multiple of c/gcd(a, c) so c divides (a x b) exactly, matching exactDivision's guarantee.
  const step = c / gcd(a, c);
  const multiplier = rng.between(1, ramp(2, 4, t));
  const b = step * multiplier;
  return { index, level, prompt: `(${a} × ${b}) ÷ ${c}`, answer: (a * b) / c };
}

function bossRound(rng: DeterministicRng, level: number, index: number, t: number): MathProblem {
  const a = rng.between(10, ramp(15, 24, t));
  const b = rng.between(4, ramp(7, 12, t));
  const c = rng.between(2, ramp(4, 8, t));
  const d = rng.between(8, ramp(15, 29, t));
  // Display the larger product first so the subtraction never goes negative.
  const first = { left: a, right: b, product: a * b };
  const second = { left: c, right: d, product: c * d };
  const [minuend, subtrahend] = first.product >= second.product ? [first, second] : [second, first];
  return {
    index,
    level,
    prompt: `(${minuend.left} × ${minuend.right}) - (${subtrahend.left} × ${subtrahend.right})`,
    answer: minuend.product - subtrahend.product,
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
