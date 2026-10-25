import type { GameSave, Move } from '../rules';
import type { ThinkResponse } from './worker';

/** Runs the search in a background thread so the board stays smooth. */
export class AiPlayer {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;

  think(save: GameSave, level: 1 | 2 | 3 | 4): Promise<Move | null> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      const onMsg = (e: MessageEvent<ThinkResponse>) => {
        if (e.data.id !== id) return;
        this.worker.removeEventListener('message', onMsg);
        resolve(e.data.move);
      };
      this.worker.addEventListener('message', onMsg);
      this.worker.postMessage({ id, save, level });
    });
  }

  /** Abandons any search in flight (new game, undo). */
  reset(): void {
    this.worker.terminate();
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }
}
