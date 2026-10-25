export type Color = 0 | 1; // 0 = white, 1 = black
export const WHITE: Color = 0;
export const BLACK: Color = 1;

export type BoardId = 0 | 1; // 0 = Overworld, 1 = Underworld
export const OVER: BoardId = 0;
export const UNDER: BoardId = 1;

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  id: number;
  color: Color;
  type: PieceType;
  promoted: boolean;
  risen: boolean;
  hasMoved: boolean; // for kings and rooks: false means the castling right is still alive
}

export interface Options {
  /** Disables falls and rises: captures simply remove pieces. */
  classic: boolean;
  /** Rule 6: a risen piece captured again is destroyed instead of falling. */
  secondChance: boolean;
}

export const DEFAULT_OPTIONS: Options = { classic: false, secondChance: true };

/** Squares are 0..63, sq = rank * 8 + file, rank 0 is rank "1", file 0 is file "a". */
export interface Move {
  board: BoardId;
  from: number;
  to: number;
  capture: boolean;
  promo?: PieceType;
  ep?: boolean;
  double?: boolean;
  castle?: 'k' | 'q';
}

export interface Transfer {
  piece: Piece;
  from: number; // square it left (same square name on the other board)
  to: number; // square it landed on after the landing search
}

/** What a move did beyond the plain slide. Used by notation, AI and renderer. */
export interface MoveInfo {
  fell?: Transfer;
  rose?: Transfer;
  destroyed?: Piece;
}

export const file = (sq: number) => sq & 7;
export const rank = (sq: number) => sq >> 3;
export const sqName = (sq: number) => 'abcdefgh'[sq & 7] + String((sq >> 3) + 1);
export const parseSq = (s: string) => (s.charCodeAt(0) - 97) + (s.charCodeAt(1) - 49) * 8;
