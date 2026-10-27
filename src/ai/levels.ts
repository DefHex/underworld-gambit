import type { Limits } from './search';

/**
 * Four levels. The lower two are deliberately weak: shallow search, noisy move choice and a chance
 * of a plain blunder, so a new player can beat Level 1. The upper two think by the clock.
 */
export const LEVELS: Record<1 | 2 | 3 | 4, Limits> = {
  1: { timeMs: 150, maxDepth: 1, noise: 260, blunder: 0.4 },
  2: { timeMs: 400, maxDepth: 2, noise: 100, blunder: 0.1 },
  3: { timeMs: 1500, maxDepth: 6, noise: 20 },
  4: { timeMs: 3000, maxDepth: 12 },
};

export const LEVEL_INFO: Record<1 | 2 | 3 | 4, { name: string; blurb: string }> = {
  1: { name: 'Apprentice', blurb: 'Easy. Plays fast and makes plenty of mistakes.' },
  2: { name: 'Soldier', blurb: 'Casual. Sees simple tactics, still slips up.' },
  3: { name: 'Knight', blurb: 'Challenging. Plans several moves ahead.' },
  4: { name: 'Warlord', blurb: 'Hard. Thinks for three seconds and rarely errs.' },
};
