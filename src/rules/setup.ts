import { Position } from './position';
import { BoardId, Color, Options, PieceType, parseSq } from './types';

/**
 * Builds a position from compact piece tokens, e.g. "wKe1", "bPe7", "wNe5:r".
 * Flags after ':' are r (risen), m (hasMoved), p (promoted), u (unmoved).
 * Kings and rooks count as having moved unless given the 'u' flag, so test positions
 * have no castling rights by default.
 */
export interface Spec {
  over: string[];
  under?: string[];
  side?: 'w' | 'b';
}

export function setup(spec: Spec, options: Partial<Options> = {}): Position {
  const pos = new Position(options);
  const place = (b: BoardId, tokens: string[]) => {
    for (const tok of tokens) {
      const [body, flags = ''] = tok.split(':');
      const color: Color = body[0] === 'w' ? 0 : 1;
      const type = body[1].toLowerCase() as PieceType;
      const sq = parseSq(body.slice(2));
      pos.add(b, sq, color, type, {
        risen: flags.includes('r'),
        promoted: flags.includes('p'),
        hasMoved: flags.includes('m') || ((type === 'k' || type === 'r') && !flags.includes('u')),
      });
    }
  };
  place(0, spec.over);
  place(1, spec.under ?? []);
  pos.side = spec.side === 'b' ? 1 : 0;
  return pos;
}

/** FEN placement goes on the Overworld; used for classic-mode perft. */
export function fromFen(fen: string, options: Partial<Options> = {}): Position {
  const [placement, stm, castling = '-', ep = '-'] = fen.split(' ');
  const pos = new Position(options);
  const rows = placement.split('/');
  for (let i = 0; i < 8; i++) {
    const r = 7 - i;
    let f = 0;
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '8') { f += +ch; continue; }
      const color: Color = ch === ch.toUpperCase() ? 0 : 1;
      const type = ch.toLowerCase() as PieceType;
      let hasMoved = false;
      if (type === 'k') hasMoved = !(color === 0 ? /[KQ]/ : /[kq]/).test(castling);
      if (type === 'r') {
        const homeRank = color === 0 ? 0 : 7;
        const letter = f === 7 ? (color === 0 ? 'K' : 'k') : f === 0 ? (color === 0 ? 'Q' : 'q') : '';
        hasMoved = !(r === homeRank && letter !== '' && castling.includes(letter));
      }
      pos.add(0, r * 8 + f, color, type, { hasMoved });
      f++;
    }
  }
  pos.side = stm === 'b' ? 1 : 0;
  if (ep !== '-') {
    const target = parseSq(ep);
    const victim = pos.side === 0 ? target - 8 : target + 8;
    pos.ep = { board: 0, target, victim };
  }
  return pos;
}
