import { Game, Move, parseSq, setup } from '../rules';

/**
 * The fixed tutorial game: White to move, mate in three using the Underworld.
 *  1. Qd3!   a sacrifice: Bxd3 and the queen falls to d3 below.
 *  2. u:Qxd8 ↑d8+   the queen takes the rook that fell earlier and rises with check.
 *  3. Qxe8#  after the forced Be8 block.
 * tests/tutorial.test.ts replays this line against the real rules, so it cannot go stale.
 */
export const TUTORIAL_SPEC = {
  over: [
    'wKg1', 'wQd1', 'wRa1', 'wPa2', 'wPb2', 'wPf2', 'wPg2', 'wPh2',
    'bKg8', 'bPf7', 'bPg7', 'bPh7', 'bPa7', 'bPb7', 'bBb5', 'bBc6',
  ],
  under: ['bRd8'],
};

export interface Mv { b: 0 | 1; from: string; to: string }

export const LINE = {
  sacrifice: { b: 0, from: 'd1', to: 'd3' } as Mv,
  take: { b: 0, from: 'b5', to: 'd3' } as Mv,
  rise: { b: 1, from: 'd3', to: 'd8' } as Mv,
  block: { b: 0, from: 'c6', to: 'e8' } as Mv,
  mate: { b: 0, from: 'd8', to: 'e8' } as Mv,
};

export const tutorialGame = (): Game => new Game(setup(TUTORIAL_SPEC));

export function findMove(game: Game, mv: Mv): Move | undefined {
  return game.legalMoves().find((m) => m.board === mv.b && m.from === parseSq(mv.from) && m.to === parseSq(mv.to));
}
