import type { Limits } from './search';

/** Four levels by think time (0.2, 0.5, 1.5, 3 s), with some randomness on the lowest. */
export const LEVELS: Record<1 | 2 | 3 | 4, Limits> = {
  1: { timeMs: 200, maxDepth: 2, noise: 70 },
  2: { timeMs: 500, maxDepth: 6 },
  3: { timeMs: 1500, maxDepth: 9 },
  4: { timeMs: 3000, maxDepth: 12 },
};
