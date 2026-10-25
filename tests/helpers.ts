import { Move, Position, PieceType, parseSq, sqName } from '../src/rules';

/** Finds a legal move like find(pos, 'o', 'c4f7') or find(pos, 'u', 'a7a8', 'q'). */
export function find(pos: Position, board: 'o' | 'u', uci: string, promo?: PieceType): Move {
  const from = parseSq(uci.slice(0, 2));
  const to = parseSq(uci.slice(2, 4));
  const m = pos.legalMoves().find((x) =>
    x.board === (board === 'o' ? 0 : 1) && x.from === from && x.to === to && x.promo === promo);
  if (!m) throw new Error(`no legal move ${board}:${uci}`);
  return m;
}

export function go(pos: Position, board: 'o' | 'u', uci: string, promo?: PieceType) {
  const info = pos.make(find(pos, board, uci, promo));
  pos.commit();
  return info;
}

export function at(pos: Position, board: 'o' | 'u', name: string) {
  return pos.boards[board === 'o' ? 0 : 1][parseSq(name)];
}

export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = pos.legalMoves();
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) { pos.make(m); n += perft(pos, depth - 1); pos.unmake(); }
  return n;
}

export { sqName };
