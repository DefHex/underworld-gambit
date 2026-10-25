import type { Color, PieceType, Position } from '../rules';

export const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const centerDist = (sq: number) => Math.abs((sq & 7) - 3.5) + Math.abs((sq >> 3) - 3.5);

/**
 * Static evaluation from the side to move's point of view.
 * Material counts fully above and at half value below, plus a bonus for pieces below that can
 * capture next move (a capture below is a rise). Mobility and king safety on the Overworld.
 */
export function evaluate(pos: Position): number {
  let s = 0; // white's point of view
  for (let bd = 0; bd < 2; bd++) {
    const board = pos.boards[bd];
    const scale = bd === 0 ? 1 : 0.5;
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p) continue;
      let v = VALUE[p.type] * scale;
      if (bd === 0) {
        const adv = p.color === 0 ? sq >> 3 : 7 - (sq >> 3);
        if (p.type === 'p') v += adv * 6 + (3.5 - Math.abs((sq & 7) - 3.5)) * 2;
        else if (p.type === 'n' || p.type === 'b') v += (7 - centerDist(sq)) * 4;
        if (p.risen) v += 15; // a piece that is already used its second chance is worth more standing
      }
      s += p.color === 0 ? v : -v;
    }
  }
  for (const c of [0, 1] as Color[]) {
    const sign = c === 0 ? 1 : -1;
    let mob = 0, rises = 0;
    for (const m of pos.pseudoMoves(c)) {
      if (m.board === 0) mob++;
      else if (m.capture) rises += 18 + VALUE[pos.boards[1][m.to]?.type ?? 'p'] * 0.12;
    }
    s += sign * (mob * 2 + rises);
    s += sign * kingSafety(pos, c);
  }
  return (pos.side === 0 ? s : -s) + 10;
}

function kingSafety(pos: Position, c: Color): number {
  const k = pos.kingSq[c];
  if (k < 0) return 0;
  const board = pos.boards[0];
  const f = k & 7, r = k >> 3;
  const fwd = c === 0 ? 1 : -1;
  let score = 0;
  for (let df = -1; df <= 1; df++) {
    if (f + df < 0 || f + df > 7) continue;
    for (const [step, pts] of [[1, 12], [2, 6]]) {
      const rr = r + fwd * step;
      if (rr < 0 || rr > 7) continue;
      const p = board[rr * 8 + f + df];
      if (p && p.color === c && p.type === 'p') score += pts;
    }
  }
  if (r === (c === 0 ? 0 : 7) && (f === 6 || f === 2 || f === 1)) score += 20; // castled-ish
  return score;
}
