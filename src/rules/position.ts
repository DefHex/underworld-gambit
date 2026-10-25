import {
  BISHOP_DIRS, KING, KNIGHT, QUEEN_DIRS, RAYS, ROOK_DIRS, attacked,
} from './tables';
import {
  BoardId, Color, DEFAULT_OPTIONS, Move, MoveInfo, OVER, Options, Piece, PieceType, UNDER,
  file, rank,
} from './types';

export interface EpState {
  board: BoardId;
  target: number; // square the capturing pawn moves to
  victim: number; // square of the pawn that just double-stepped
}

type JEntry =
  | { k: 0; b: number; sq: number; old: Piece | null }
  | { k: 1; p: Piece; type: PieceType; promoted: boolean; risen: boolean; hasMoved: boolean };

interface UndoRec {
  j: number;
  ep: EpState | null;
  halfmove: number;
  side: Color;
  info: MoveInfo;
}

const startRank = (c: Color) => (c === 0 ? 1 : 6);
const promoRank = (c: Color) => (c === 0 ? 7 : 0);
const backRank = (c: Color) => (c === 0 ? 0 : 7);
const PROMOS: PieceType[] = ['q', 'r', 'b', 'n'];

export class Position {
  boards: (Piece | null)[][] = [new Array(64).fill(null), new Array(64).fill(null)];
  side: Color = 0;
  ep: EpState | null = null;
  halfmove = 0; // plies since last capture or pawn move (either board)
  ply = 0;
  kingSq: [number, number] = [-1, -1];
  nextId = 1;
  options: Options;
  lastInfo: MoveInfo = {};

  private journal: JEntry[] = [];
  private undo: UndoRec[] = [];

  constructor(options: Partial<Options> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ---------- setup ----------

  static standard(options: Partial<Options> = {}): Position {
    const pos = new Position(options);
    const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (const c of [0, 1] as Color[]) {
      for (let f = 0; f < 8; f++) {
        pos.add(OVER, backRank(c) * 8 + f, c, back[f]);
        pos.add(OVER, startRank(c) * 8 + f, c, 'p');
      }
    }
    return pos;
  }

  /** Adds a fresh piece (used by setup code and tests). */
  add(b: BoardId, sq: number, color: Color, type: PieceType, flags: Partial<Piece> = {}): Piece {
    const p: Piece = {
      id: this.nextId++, color, type, promoted: false, risen: false, hasMoved: false, ...flags,
    };
    this.put(b, sq, p);
    this.journal.length = 0;
    return p;
  }

  clone(): Position {
    const c = new Position(this.options);
    for (const b of [0, 1] as BoardId[]) {
      for (let sq = 0; sq < 64; sq++) {
        const p = this.boards[b][sq];
        if (p) c.put(b, sq, { ...p });
      }
    }
    c.journal.length = 0;
    c.side = this.side;
    c.ep = this.ep ? { ...this.ep } : null;
    c.halfmove = this.halfmove;
    c.ply = this.ply;
    c.nextId = this.nextId;
    return c;
  }

  // ---------- journaled mutation ----------

  private put(b: number, sq: number, p: Piece | null): void {
    this.journal.push({ k: 0, b, sq, old: this.boards[b][sq] });
    this.boards[b][sq] = p;
    if (p && p.type === 'k' && b === OVER) this.kingSq[p.color] = sq;
  }

  private snap(p: Piece): void {
    this.journal.push({
      k: 1, p, type: p.type, promoted: p.promoted, risen: p.risen, hasMoved: p.hasMoved,
    });
  }

  // ---------- queries ----------

  inCheck(side: Color = this.side): boolean {
    const k = this.kingSq[side];
    return k >= 0 && attacked(this.boards[OVER], k, (1 - side) as Color);
  }

  pieceCount(b: BoardId): number {
    let n = 0;
    for (const p of this.boards[b]) if (p) n++;
    return n;
  }

  /** Castling rights are derived from piece flags, so they travel with the piece. */
  castlingRights(c: Color): { k: boolean; q: boolean } {
    const board = this.boards[OVER];
    const base = backRank(c) * 8;
    const king = board[base + 4];
    if (!king || king.type !== 'k' || king.color !== c || king.hasMoved) return { k: false, q: false };
    const ok = (sq: number) => {
      const r = board[sq];
      return !!r && r.type === 'r' && r.color === c && !r.hasMoved;
    };
    return { k: ok(base + 7), q: ok(base) };
  }

  // ---------- landing search (rule 9) ----------

  /**
   * Nearest empty square to `target` on board `b` for `piece`:
   * (a) king-step distance, (b) orthogonal-step distance, (c) closeness to the owner's
   * back rank, (d) file a to h. Pawns never take rank 1 or 8; bishops keep square color.
   * Returns -1 when the board has no room.
   */
  landing(b: BoardId, piece: Piece, target: number): number {
    const board = this.boards[b];
    const tf = file(target), tr = rank(target);
    const parity = (tf + tr) & 1;
    const isPawn = piece.type === 'p';
    const isBishop = piece.type === 'b';
    const back = backRank(piece.color);
    let best = -1;
    let bestKey = Infinity;
    for (let sq = 0; sq < 64; sq++) {
      if (board[sq]) continue;
      const f = sq & 7, r = sq >> 3;
      if (isPawn && (r === 0 || r === 7)) continue;
      if (isBishop && ((f + r) & 1) !== parity) continue;
      const df = Math.abs(f - tf), dr = Math.abs(r - tr);
      const key = (((Math.max(df, dr) * 16 + (df + dr)) * 16 + Math.abs(r - back)) * 8) + f;
      if (key < bestKey) { bestKey = key; best = sq; }
    }
    return best;
  }

  // ---------- move generation ----------

  pseudoMoves(side: Color = this.side): Move[] {
    const out: Move[] = [];
    this.genBoard(OVER, side, out);
    if (!this.options.classic) this.genBoard(UNDER, side, out);
    return out;
  }

  legalMoves(side: Color = this.side): Move[] {
    const check = this.inCheck(side);
    const out: Move[] = [];
    for (const m of this.pseudoMoves(side)) {
      if (m.board === UNDER && !m.capture) {
        // Nothing on the Overworld changes, so it is legal exactly when we are not in check.
        if (!check) out.push(m);
        continue;
      }
      this.make(m);
      const bad = this.inCheck(side);
      this.unmake();
      if (!bad) out.push(m);
    }
    return out;
  }

  hasLegalMove(side: Color = this.side): boolean {
    return this.legalMoves(side).length > 0;
  }

  private genBoard(b: BoardId, side: Color, out: Move[]): void {
    const board = this.boards[b];
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p || p.color !== side) continue;
      switch (p.type) {
        case 'p': this.genPawn(b, sq, side, out); break;
        case 'n': this.genJumps(b, sq, side, KNIGHT[sq], out); break;
        case 'k':
          this.genJumps(b, sq, side, KING[sq], out);
          if (b === OVER) this.genCastle(side, out);
          break;
        case 'b': this.genSlide(b, sq, side, BISHOP_DIRS, out); break;
        case 'r': this.genSlide(b, sq, side, ROOK_DIRS, out); break;
        case 'q': this.genSlide(b, sq, side, QUEEN_DIRS, out); break;
      }
    }
  }

  private genJumps(b: BoardId, sq: number, side: Color, targets: number[], out: Move[]): void {
    const board = this.boards[b];
    for (const t of targets) {
      const o = board[t];
      if (!o) out.push({ board: b, from: sq, to: t, capture: false });
      else if (o.color !== side) out.push({ board: b, from: sq, to: t, capture: true });
    }
  }

  private genSlide(b: BoardId, sq: number, side: Color, dirs: number[], out: Move[]): void {
    const board = this.boards[b];
    for (const d of dirs) {
      for (const t of RAYS[d][sq]) {
        const o = board[t];
        if (!o) { out.push({ board: b, from: sq, to: t, capture: false }); continue; }
        if (o.color !== side) out.push({ board: b, from: sq, to: t, capture: true });
        break;
      }
    }
  }

  private genPawn(b: BoardId, sq: number, side: Color, out: Move[]): void {
    const board = this.boards[b];
    const fwd = side === 0 ? 8 : -8;
    const one = sq + fwd;
    if (one < 0 || one > 63) return;
    const lastRank = rank(one) === promoRank(side);
    if (!board[one]) {
      if (lastRank) for (const promo of PROMOS) out.push({ board: b, from: sq, to: one, capture: false, promo });
      else {
        out.push({ board: b, from: sq, to: one, capture: false });
        if (rank(sq) === startRank(side) && !board[one + fwd]) {
          out.push({ board: b, from: sq, to: one + fwd, capture: false, double: true });
        }
      }
    }
    const f = file(sq);
    for (const df of [-1, 1]) {
      if (f + df < 0 || f + df > 7) continue;
      const t = one + df;
      const o = board[t];
      if (o && o.color !== side) {
        // An Underworld capture never promotes: the pawn rises as a pawn instead.
        if (lastRank && b === OVER) {
          for (const promo of PROMOS) out.push({ board: b, from: sq, to: t, capture: true, promo });
        } else out.push({ board: b, from: sq, to: t, capture: true });
      } else if (!o && this.ep && this.ep.board === b && this.ep.target === t) {
        const v = board[this.ep.victim];
        if (v && v.type === 'p' && v.color !== side) {
          out.push({ board: b, from: sq, to: t, capture: true, ep: true });
        }
      }
    }
  }

  private genCastle(side: Color, out: Move[]): void {
    const rights = this.castlingRights(side);
    if (!rights.k && !rights.q) return;
    const board = this.boards[OVER];
    const base = backRank(side) * 8;
    const opp = (1 - side) as Color;
    if (attacked(board, base + 4, opp)) return;
    if (rights.k && !board[base + 5] && !board[base + 6]
      && !attacked(board, base + 5, opp) && !attacked(board, base + 6, opp)) {
      out.push({ board: OVER, from: base + 4, to: base + 6, capture: false, castle: 'k' });
    }
    if (rights.q && !board[base + 1] && !board[base + 2] && !board[base + 3]
      && !attacked(board, base + 3, opp) && !attacked(board, base + 2, opp)) {
      out.push({ board: OVER, from: base + 4, to: base + 2, capture: false, castle: 'q' });
    }
  }

  // ---------- make / unmake ----------

  make(m: Move): MoveInfo {
    const side = this.side;
    const b = m.board;
    const { classic, secondChance } = this.options;
    const info: MoveInfo = {};
    this.undo.push({ j: this.journal.length, ep: this.ep, halfmove: this.halfmove, side, info });

    const p = this.boards[b][m.from]!;
    const wasPawn = p.type === 'p';
    const capSq = m.ep ? (side === 0 ? m.to - 8 : m.to + 8) : m.to;
    const captured = m.capture ? this.boards[b][capSq]! : null;

    this.snap(p);
    p.hasMoved = true;
    if (m.promo) { p.type = m.promo; p.promoted = true; }
    this.put(b, m.from, null);

    if (m.castle) {
      const base = backRank(side) * 8;
      const rookFrom = base + (m.castle === 'k' ? 7 : 0);
      const rookTo = base + (m.castle === 'k' ? 5 : 3);
      const rook = this.boards[OVER][rookFrom]!;
      this.snap(rook);
      rook.hasMoved = true;
      this.put(OVER, rookFrom, null);
      this.put(OVER, rookTo, rook);
    }

    if (!captured) {
      this.put(b, m.to, p);
    } else {
      this.put(b, capSq, null);
      if (classic) {
        this.put(b, m.to, p);
        info.destroyed = captured;
      } else if (b === OVER) {
        this.put(OVER, m.to, p);
        if (captured.risen && secondChance) {
          info.destroyed = captured;
        } else {
          this.snap(captured);
          if (captured.promoted) { captured.type = 'p'; captured.promoted = false; }
          if (captured.type === 'r') captured.hasMoved = true; // a fallen rook loses its castling right
          captured.risen = false;
          const to = this.landing(UNDER, captured, capSq);
          if (to < 0) info.destroyed = captured;
          else {
            this.put(UNDER, to, captured);
            info.fell = { piece: captured, from: capSq, to };
          }
        }
      } else {
        // Underworld capture: victim destroyed for good, capturer rises.
        info.destroyed = captured;
        if (p.promoted) { p.type = 'p'; p.promoted = false; }
        if (secondChance) p.risen = true;
        const to = this.landing(OVER, p, m.to);
        this.put(OVER, to, p);
        info.rose = { piece: p, from: m.to, to };
      }
    }

    this.ep = m.double
      ? { board: b, target: (m.from + m.to) >> 1, victim: m.to }
      : null;
    this.halfmove = wasPawn || m.capture ? 0 : this.halfmove + 1;
    this.side = (1 - side) as Color;
    this.ply++;
    this.lastInfo = info;
    return info;
  }

  unmake(): void {
    const u = this.undo.pop()!;
    while (this.journal.length > u.j) {
      const e = this.journal.pop()!;
      if (e.k === 0) {
        this.boards[e.b][e.sq] = e.old;
        if (e.old && e.old.type === 'k' && e.b === OVER) this.kingSq[e.old.color] = e.sq;
      } else {
        e.p.type = e.type; e.p.promoted = e.promoted; e.p.risen = e.risen; e.p.hasMoved = e.hasMoved;
      }
    }
    this.ep = u.ep;
    this.halfmove = u.halfmove;
    this.side = u.side;
    this.ply--;
  }

  /** Drops undo history so long games don't hold on to it (after a move is final). */
  commit(): void {
    this.journal.length = 0;
    this.undo.length = 0;
  }

  // ---------- draws / keys ----------

  /** Rule 13: bare kings above while the Underworld is empty or holds a single color. */
  isDeadDraw(): boolean {
    if (this.pieceCount(OVER) !== 2) return false;
    let seen = -1;
    for (const p of this.boards[UNDER]) {
      if (!p) continue;
      if (seen === -1) seen = p.color;
      else if (seen !== p.color) return false;
    }
    return true;
  }

  /** Full-state key for repetition: both boards, side, castling, en passant, risen marks. */
  positionKey(): string {
    const parts: string[] = [];
    for (const b of [0, 1] as BoardId[]) {
      let s = '';
      for (let sq = 0; sq < 64; sq++) {
        const p = this.boards[b][sq];
        if (!p) { s += '.'; continue; }
        let ch = p.type as string;
        if (p.color === 0) ch = ch.toUpperCase();
        if (p.promoted) ch += '+';
        if (p.risen) ch += '^';
        s += ch;
      }
      parts.push(s);
    }
    const cw = this.castlingRights(0), cb = this.castlingRights(1);
    parts.push(
      String(this.side),
      (cw.k ? 'K' : '') + (cw.q ? 'Q' : '') + (cb.k ? 'k' : '') + (cb.q ? 'q' : '') || '-',
      this.epKey(),
    );
    return parts.join('|');
  }

  /** En passant counts toward repetition only if a capture is actually possible. */
  private epKey(): string {
    const ep = this.ep;
    if (!ep) return '-';
    const board = this.boards[ep.board];
    const mover = this.side;
    for (const df of [-1, 1]) {
      const f = file(ep.victim) + df;
      if (f < 0 || f > 7) continue;
      const q = board[rank(ep.victim) * 8 + f];
      if (q && q.type === 'p' && q.color === mover) return `${ep.board}${ep.target}`;
    }
    return '-';
  }
}
