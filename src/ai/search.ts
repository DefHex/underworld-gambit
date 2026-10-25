import { Move, Position, UNDER, sameMove } from '../rules';
import { VALUE, evaluate } from './eval';
import { hashPosition } from './zobrist';

export interface Limits {
  timeMs: number;
  maxDepth: number;
  maxNodes?: number;
  /** Centipawns of random noise added to each root move (lowest level only). */
  noise?: number;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
}

const MATE = 100000;
const INF = 1e9;
const MAX_QDEPTH = 6;
/** Quiet Underworld moves are tempo moves; only the most promising few are searched. */
const MAX_QUIET_BELOW = 3;

interface TTEntry { depth: number; score: number; flag: 0 | 1 | 2; move: Move | null } // 0 exact, 1 lower, 2 upper

class Stop extends Error {}

/** Negamax alpha-beta over both boards with iterative deepening, quiescence and a Zobrist table. */
export class Searcher {
  private tt = new Map<number, TTEntry>();
  private killers: (Move | null)[][] = [];
  private path: number[] = [];
  private nodes = 0;
  private deadline = Infinity;
  private maxNodes = Infinity;

  clear(): void { this.tt.clear(); this.killers = []; }

  /**
   * `history` holds hashes of earlier positions in the game (for repetition).
   * The position is left exactly as it was found.
   */
  search(pos: Position, history: number[], limits: Limits, rand: () => number = Math.random): SearchResult {
    this.nodes = 0;
    this.deadline = performance.now() + limits.timeMs;
    this.maxNodes = limits.maxNodes ?? Infinity;
    this.path = history.slice();
    this.killers = [];
    if (this.tt.size > 400000) this.tt.clear();

    const root = pos.legalMoves();
    if (!root.length) return { move: null, score: pos.inCheck() ? -MATE : 0, depth: 0, nodes: 0 };
    let best: Move = root[0];
    let bestScore = -INF;
    let done = 0;
    const rootHash = hashPosition(pos);
    const startPly = pos.ply;

    try {
      for (let depth = 1; depth <= limits.maxDepth; depth++) {
        const ordered = this.order(pos, root, this.tt.get(rootHash)?.move ?? best, 0);
        let alpha = -INF;
        let iterBest = ordered[0];
        let iterScore = -INF;
        this.path.push(rootHash);
        for (const m of ordered) {
          pos.make(m);
          let score: number;
          if (limits.noise) {
            score = -this.negamax(pos, depth - 1, -INF, INF, 1) + (rand() - 0.5) * 2 * limits.noise;
          } else {
            score = -this.negamax(pos, depth - 1, -INF, -alpha, 1);
          }
          pos.unmake();
          if (score > iterScore) { iterScore = score; iterBest = m; }
          if (score > alpha) alpha = score;
        }
        this.path.pop();
        best = iterBest; bestScore = iterScore; done = depth;
        this.tt.set(rootHash, { depth, score: iterScore, flag: 0, move: iterBest });
        if (Math.abs(iterScore) > MATE - 100) break; // forced mate found
      }
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      // Search was cut short: the half-finished iteration is discarded and the position unwound.
      while (pos.ply > startPly) pos.unmake();
    }
    return { move: best, score: bestScore, depth: done, nodes: this.nodes };
  }

  private tick(): void {
    if ((++this.nodes & 1023) === 0 && (performance.now() > this.deadline || this.nodes > this.maxNodes)) throw new Stop();
    if (this.nodes > this.maxNodes) throw new Stop();
  }

  private negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    if (pos.halfmove >= 100 || pos.isDeadDraw()) return 0;
    const hash = hashPosition(pos);
    if (this.path.includes(hash)) return 0;

    const inCheck = pos.inCheck();
    if (inCheck && ply < 40) depth++;
    if (depth <= 0) return this.quiesce(pos, alpha, beta, ply, 0);

    const entry = this.tt.get(hash);
    if (entry && entry.depth >= depth) {
      if (entry.flag === 0) return entry.score;
      if (entry.flag === 1 && entry.score >= beta) return entry.score;
      if (entry.flag === 2 && entry.score <= alpha) return entry.score;
    }

    const side = pos.side;
    const moves = this.order(pos, pos.pseudoMoves(), entry?.move ?? null, ply, true, inCheck);
    this.path.push(hash);
    const origAlpha = alpha;
    let best = -INF;
    let bestMove: Move | null = null;
    let legal = 0;
    for (const m of moves) {
      if (m.board === UNDER && !m.capture) { if (inCheck) continue; pos.make(m); }
      else { pos.make(m); if (pos.inCheck(side)) { pos.unmake(); continue; } }
      legal++;
      const score = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1);
      pos.unmake();
      if (score > best) { best = score; bestMove = m; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!m.capture) {
          const k = (this.killers[ply] ??= [null, null]);
          if (!k[0] || !sameMove(k[0], m)) { k[1] = k[0]; k[0] = m; }
        }
        break;
      }
    }
    this.path.pop();
    if (!legal) return inCheck ? -MATE + ply : 0;
    const flag = best <= origAlpha ? 2 : best >= beta ? 1 : 0;
    this.tt.set(hash, { depth, score: best, flag, move: bestMove });
    return best;
  }

  private quiesce(pos: Position, alpha: number, beta: number, ply: number, qd: number): number {
    this.tick();
    const side = pos.side;
    const inCheck = pos.inCheck();
    let best = -INF;
    if (!inCheck) {
      best = evaluate(pos);
      if (best >= beta || qd >= MAX_QDEPTH) return best;
      if (best > alpha) alpha = best;
    }
    const moves = this.order(pos, pos.pseudoMoves(), null, ply, false, inCheck);
    let legal = 0;
    for (const m of moves) {
      if (!inCheck && !m.capture && !m.promo) continue;
      if (m.board === UNDER && !m.capture) { if (inCheck) continue; pos.make(m); }
      else { pos.make(m); if (pos.inCheck(side)) { pos.unmake(); continue; } }
      legal++;
      const score = -this.quiesce(pos, -beta, -alpha, ply + 1, qd + 1);
      pos.unmake();
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    if (inCheck && !legal) return -MATE + ply;
    return best;
  }

  /** TT move first, then captures by MVV-LVA, promotions, killers, quiet moves; tempo moves below last. */
  private order(pos: Position, moves: Move[], ttMove: Move | null, ply: number, prune = false, inCheck = false): Move[] {
    const scored: { m: Move; s: number }[] = [];
    const k = this.killers[ply];
    const enemyBelow: number[] = [];
    if (prune) pos.boards[UNDER].forEach((p, sq) => { if (p && p.color !== pos.side) enemyBelow.push(sq); });
    for (const m of moves) {
      let s = 0;
      if (ttMove && sameMove(ttMove, m)) s = 1e7;
      else if (m.capture) {
        const victim = m.ep ? 'p' : pos.boards[m.board][m.to]?.type ?? 'p';
        const attacker = pos.boards[m.board][m.from]!.type;
        s = 1e5 + VALUE[victim] * 10 - VALUE[attacker] / 10 + (m.board === UNDER ? 3000 : 0);
      } else if (m.promo) s = 9e4 + VALUE[m.promo];
      else if (k && ((k[0] && sameMove(k[0], m)) || (k[1] && sameMove(k[1], m)))) s = 5e4;
      else if (m.board === UNDER) {
        // Closer to enemy pieces below is more promising; used only to choose which few to keep.
        let near = 0;
        for (const e of enemyBelow) {
          const d = Math.max(Math.abs((e & 7) - (m.to & 7)), Math.abs((e >> 3) - (m.to >> 3)));
          near += 8 - d;
        }
        s = -1e4 + near;
      }
      scored.push({ m, s });
    }
    scored.sort((a, b) => b.s - a.s);
    if (!prune || inCheck) return scored.map((x) => x.m);
    let quiet = 0;
    const out: Move[] = [];
    for (const { m, s } of scored) {
      if (s < -5000) { if (++quiet > MAX_QUIET_BELOW) continue; }
      out.push(m);
    }
    return out;
  }
}
