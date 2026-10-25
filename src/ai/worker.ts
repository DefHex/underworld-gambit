import type { GameSave, Move } from '../rules';
import { Searcher, chooseMove } from './index';

export interface ThinkRequest { id: number; save: GameSave; level: 1 | 2 | 3 | 4 }
export interface ThinkResponse { id: number; move: Move | null; score: number; depth: number; nodes: number }

const searcher = new Searcher();

self.onmessage = (e: MessageEvent<ThinkRequest>) => {
  const { id, save, level } = e.data;
  const r = chooseMove(searcher, save, level);
  (self as unknown as Worker).postMessage({ id, ...r } satisfies ThinkResponse);
};
