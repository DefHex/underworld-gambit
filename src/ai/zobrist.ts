import type { Position } from '../rules';

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0);
  };
}

// Per piece state: type(6) x color(2) x risen(2) x promoted(2) = 48, on each of 2 x 64 squares.
const STATES = 48;
const rnd = mulberry32(0x5eed1234);
const Z1 = new Int32Array(2 * 64 * STATES);
const Z2 = new Int32Array(2 * 64 * STATES);
for (let i = 0; i < Z1.length; i++) { Z1[i] = rnd() | 0; Z2[i] = rnd() | 0; }
const SIDE = [rnd() | 0, rnd() | 0];
const CASTLE = Array.from({ length: 16 }, () => [rnd() | 0, rnd() | 0]);
const EP = Array.from({ length: 128 }, () => [rnd() | 0, rnd() | 0]);
const TYPE = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 } as const;

/** 53-bit hash of the full two-board state: pieces with risen and promoted marks, side, castling, en passant. */
export function hashPosition(pos: Position): number {
  let a = 0, b = 0;
  for (let bd = 0; bd < 2; bd++) {
    const board = pos.boards[bd];
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p) continue;
      const s = (((TYPE[p.type] * 2 + p.color) * 2 + (p.risen ? 1 : 0)) * 2 + (p.promoted ? 1 : 0));
      const i = (bd * 64 + sq) * STATES + s;
      a ^= Z1[i]; b ^= Z2[i];
    }
  }
  if (pos.side) { a ^= SIDE[0]; b ^= SIDE[1]; }
  const cw = pos.castlingRights(0), cb = pos.castlingRights(1);
  const c = (cw.k ? 1 : 0) | (cw.q ? 2 : 0) | (cb.k ? 4 : 0) | (cb.q ? 8 : 0);
  a ^= CASTLE[c][0]; b ^= CASTLE[c][1];
  if (pos.ep) { const e = EP[pos.ep.board * 64 + pos.ep.target]; a ^= e[0]; b ^= e[1]; }
  return (a & 0x1fffff) * 4294967296 + (b >>> 0);
}
