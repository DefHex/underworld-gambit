import { Game, GameSave, Move, loadPosition } from '../rules';
import { LEVELS } from './levels';
import { Searcher, SearchResult, Limits } from './search';
import { hashPosition } from './zobrist';

/** Picks a move for the side to move in `save`. Shared by the Web Worker and the tests. */
export function chooseMove(searcher: Searcher, save: GameSave, level: 1 | 2 | 3 | 4, override?: Partial<Limits>, rand?: () => number): SearchResult {
  const pos = loadPosition(save.start);
  const history: number[] = [];
  for (const m of save.moves) {
    history.push(hashPosition(pos));
    pos.make(m);
    pos.commit();
  }
  return searcher.search(pos, history, { ...LEVELS[level], ...override }, rand);
}

export type { Move };
export { Game, Searcher, LEVELS };
