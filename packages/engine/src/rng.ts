import type { RngState } from './types.ts';

/** Seeds xoshiro128** via splitmix32 so that small seeds still give good state. */
export function createRng(seed: number): RngState {
  let x = seed >>> 0;
  const next = (): number => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  return { s: [next(), next(), next(), next()] };
}

/** Advances `rng` in place (it lives inside a draft) and returns a uint32. */
export function nextU32(rng: RngState): number {
  const s = rng.s;
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] ^= s[0];
  s[3] ^= s[1];
  s[1] ^= s[2];
  s[0] ^= s[3];
  s[2] ^= t;
  s[3] = rotl(s[3], 11);
  s[0] >>>= 0;
  s[1] >>>= 0;
  s[2] >>>= 0;
  s[3] >>>= 0;
  return result;
}

/** Uniform integer in [0, n). */
export function nextInt(rng: RngState, n: number): number {
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(0x100000000 / n) * n;
  let x = nextU32(rng);
  while (x >= limit) x = nextU32(rng);
  return x % n;
}

export function shuffleInPlace<T>(rng: RngState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
