import { Position } from './position';
import { Move, PieceType, UNDER, file, rank, sqName } from './types';

const LETTER: Record<PieceType, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

export function sameMove(a: Move, b: Move): boolean {
  return a.board === b.board && a.from === b.from && a.to === b.to && a.promo === b.promo;
}

/**
 * Standard SAN, prefixed "u:" for Underworld moves, with the transfer appended:
 * "Bxf7 ↓f7" (the captured piece falls) and "u:Nxe5 ↑e5" (the capturer rises).
 * Call before making the move; the position is restored afterwards.
 */
export function moveToSan(pos: Position, m: Move, legal: Move[] = pos.legalMoves()): string {
  const piece = pos.boards[m.board][m.from]!;
  let s = m.board === UNDER ? 'u:' : '';
  if (m.castle) s += m.castle === 'k' ? 'O-O' : 'O-O-O';
  else {
    if (piece.type === 'p') {
      if (m.capture) s += 'abcdefgh'[file(m.from)];
    } else {
      s += LETTER[piece.type];
      const rivals = legal.filter((o) =>
        o.board === m.board && o.to === m.to && o.from !== m.from
        && pos.boards[o.board][o.from]!.type === piece.type);
      if (rivals.length) {
        if (rivals.every((o) => file(o.from) !== file(m.from))) s += 'abcdefgh'[file(m.from)];
        else if (rivals.every((o) => rank(o.from) !== rank(m.from))) s += String(rank(m.from) + 1);
        else s += sqName(m.from);
      }
    }
    if (m.capture) s += 'x';
    s += sqName(m.to);
    if (m.promo) s += '=' + LETTER[m.promo];
  }
  const info = pos.make(m);
  let suffix = '';
  if (pos.inCheck(pos.side)) suffix = pos.hasLegalMove() ? '+' : '#';
  pos.unmake();
  s += suffix;
  if (info.fell) s += ' ↓' + sqName(info.fell.to);
  if (info.rose) s += ' ↑' + sqName(info.rose.to);
  return s;
}
