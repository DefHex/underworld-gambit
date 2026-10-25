import type { Color, Piece } from './types';

const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], // orthogonal (file, rank)
  [1, 1], [1, -1], [-1, 1], [-1, -1], // diagonal
];
export const ROOK_DIRS = [0, 1, 2, 3];
export const BISHOP_DIRS = [4, 5, 6, 7];
export const QUEEN_DIRS = [0, 1, 2, 3, 4, 5, 6, 7];

export const RAYS: number[][][] = DIRS.map(([df, dr]) => {
  const out: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const ray: number[] = [];
    let f = (sq & 7) + df, r = (sq >> 3) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) { ray.push(r * 8 + f); f += df; r += dr; }
    out.push(ray);
  }
  return out;
});

function jumps(deltas: [number, number][]): number[][] {
  const out: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const list: number[] = [];
    for (const [df, dr] of deltas) {
      const f = (sq & 7) + df, r = (sq >> 3) + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8) list.push(r * 8 + f);
    }
    out.push(list);
  }
  return out;
}
export const KNIGHT = jumps([[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]);
export const KING = jumps(DIRS);

export function attacked(board: (Piece | null)[], sq: number, by: Color): boolean {
  const f = sq & 7, r = sq >> 3;
  const pr = by === 0 ? r - 1 : r + 1;
  if (pr >= 0 && pr < 8) {
    if (f > 0) { const p = board[pr * 8 + f - 1]; if (p && p.color === by && p.type === 'p') return true; }
    if (f < 7) { const p = board[pr * 8 + f + 1]; if (p && p.color === by && p.type === 'p') return true; }
  }
  for (const t of KNIGHT[sq]) { const p = board[t]; if (p && p.color === by && p.type === 'n') return true; }
  for (const t of KING[sq]) { const p = board[t]; if (p && p.color === by && p.type === 'k') return true; }
  for (let d = 0; d < 4; d++) {
    for (const t of RAYS[d][sq]) {
      const p = board[t];
      if (p) { if (p.color === by && (p.type === 'r' || p.type === 'q')) return true; break; }
    }
  }
  for (let d = 4; d < 8; d++) {
    for (const t of RAYS[d][sq]) {
      const p = board[t];
      if (p) { if (p.color === by && (p.type === 'b' || p.type === 'q')) return true; break; }
    }
  }
  return false;
}
