import { describe, expect, it } from 'vitest';
import { Position } from '../src/rules';

/** Cheap seeded RNG so failures are reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe('make/unmake invariants over random playouts', () => {
  it('unmake restores the exact position and no piece is ever created', () => {
    const rand = rng(42);
    for (let g = 0; g < 25; g++) {
      const pos = Position.standard();
      let total = 32;
      for (let ply = 0; ply < 160; ply++) {
        const moves = pos.legalMoves();
        if (!moves.length) break;
        // every legal move must unmake cleanly
        const key = pos.positionKey();
        for (const m of moves.slice(0, 6)) {
          pos.make(m);
          pos.unmake();
          expect(pos.positionKey()).toBe(key);
        }
        pos.make(moves[Math.floor(rand() * moves.length)]);
        pos.commit();
        const count = pos.pieceCount(0) + pos.pieceCount(1);
        expect(count).toBeLessThanOrEqual(total);
        total = count;
        // kings never fall: both are always on the Overworld
        expect(pos.kingSq[0]).toBeGreaterThanOrEqual(0);
        expect(pos.kingSq[1]).toBeGreaterThanOrEqual(0);
        expect(pos.boards[1].some((p) => p && p.type === 'k')).toBe(false);
        // no pawn on rank 1 or 8, on either board
        for (const b of pos.boards) {
          for (let sq = 0; sq < 64; sq++) {
            const p = b[sq];
            if (p && p.type === 'p') expect([0, 7]).not.toContain(sq >> 3);
          }
        }
        // the side to move is never left able to capture a king
        expect(pos.inCheck((1 - pos.side) as 0 | 1)).toBe(false);
      }
    }
  }, 120_000);
});
