import { moveToSan, sameMove } from './notation';
import { Position } from './position';
import { Color, DEFAULT_OPTIONS, Move, MoveInfo, Options, Piece } from './types';

export type Status =
  | { state: 'ongoing'; check: boolean }
  | { state: 'checkmate'; winner: Color }
  | { state: 'resigned'; winner: Color }
  | { state: 'stalemate' }
  | { state: 'draw'; reason: 'repetition' | 'fifty' | 'insufficient' };

export interface Played { move: Move; san: string; info: MoveInfo }

export interface PositionSave {
  options: Options;
  side: Color;
  ply: number;
  halfmove: number;
  nextId: number;
  ep: Position['ep'];
  boards: { sq: number; piece: Piece }[][];
}

export interface GameSave {
  version: 1;
  start: PositionSave;
  moves: Move[];
  resigned: Color | null;
}

export function savePosition(pos: Position): PositionSave {
  return {
    options: { ...pos.options },
    side: pos.side, ply: pos.ply, halfmove: pos.halfmove, nextId: pos.nextId,
    ep: pos.ep ? { ...pos.ep } : null,
    boards: pos.boards.map((b) => {
      const out: { sq: number; piece: Piece }[] = [];
      b.forEach((p, sq) => { if (p) out.push({ sq, piece: { ...p } }); });
      return out;
    }),
  };
}

export function loadPosition(s: PositionSave): Position {
  const pos = new Position(s.options);
  s.boards.forEach((list, b) => {
    for (const { sq, piece } of list) pos.add(b as 0 | 1, sq, piece.color, piece.type, piece);
  });
  pos.side = s.side; pos.ply = s.ply; pos.halfmove = s.halfmove; pos.nextId = s.nextId;
  pos.ep = s.ep ? { ...s.ep } : null;
  return pos;
}

/** A game in progress: move history, repetition, draws, resignation, undo, save/load. */
export class Game {
  pos: Position;
  history: Played[] = [];
  private start: PositionSave;
  private keys: string[] = [];
  private resigned: Color | null = null;

  constructor(from: Partial<Options> | Position = {}) {
    this.pos = from instanceof Position ? from : Position.standard({ ...DEFAULT_OPTIONS, ...from });
    this.start = savePosition(this.pos);
    this.keys = [this.pos.positionKey()];
  }

  legalMoves(): Move[] { return this.pos.legalMoves(); }

  /** Plays `move` (matched against the legal moves) and returns its record. */
  play(move: Move): Played {
    if (this.status().state !== 'ongoing') throw new Error('game is over');
    const legal = this.pos.legalMoves();
    const m = legal.find((o) => sameMove(o, move));
    if (!m) throw new Error('illegal move');
    const san = moveToSan(this.pos, m, legal);
    const info = this.pos.make(m);
    this.pos.commit();
    this.keys.push(this.pos.positionKey());
    const rec = { move: m, san, info };
    this.history.push(rec);
    return rec;
  }

  resign(color: Color): void { this.resigned = color; }

  /** Undo by replaying from the start, so it also works after a save/load. */
  undo(): boolean {
    if (!this.history.length) return false;
    const moves = this.history.slice(0, -1).map((h) => h.move);
    this.pos = loadPosition(this.start);
    this.history = [];
    this.keys = [this.pos.positionKey()];
    this.resigned = null;
    for (const m of moves) this.play(m);
    return true;
  }

  repetitions(): number {
    const k = this.keys[this.keys.length - 1];
    return this.keys.filter((x) => x === k).length;
  }

  status(): Status {
    if (this.resigned !== null) return { state: 'resigned', winner: (1 - this.resigned) as Color };
    const pos = this.pos;
    const check = pos.inCheck();
    if (!pos.hasLegalMove()) {
      return check ? { state: 'checkmate', winner: (1 - pos.side) as Color } : { state: 'stalemate' };
    }
    if (pos.isDeadDraw()) return { state: 'draw', reason: 'insufficient' };
    if (this.repetitions() >= 3) return { state: 'draw', reason: 'repetition' };
    if (pos.halfmove >= 100) return { state: 'draw', reason: 'fifty' };
    return { state: 'ongoing', check };
  }

  save(): GameSave {
    return {
      version: 1, start: this.start,
      moves: this.history.map((h) => h.move), resigned: this.resigned,
    };
  }

  static load(s: GameSave): Game {
    const g = new Game(loadPosition(s.start));
    for (const m of s.moves) g.play(m);
    if (s.resigned !== null) g.resign(s.resigned);
    return g;
  }
}
