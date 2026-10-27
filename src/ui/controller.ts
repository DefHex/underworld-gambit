import { BoardId, Game, Move, PieceType, Position, attacked, sqName } from '../rules';
import { MarkerSet, World, emptyMarkers } from '../render/world';
import * as audio from '../audio/audio';
import { buzz } from '../platform/haptics';

interface Preview {
  fell?: { type: PieceType; color: 0 | 1; sq: number };
  destroyed?: boolean;
  rose?: { sq: number };
  check: boolean;
  attacks: number[];
}

/** Turns taps, drags and swipes into moves, previews and board switches. */
export class Controller {
  game: Game;
  selected: { b: BoardId; sq: number } | null = null;
  targets: Move[] = [];
  pending: Move | null = null;
  onChange: () => void = () => {};
  onPromotion: (choose: (p: PieceType) => void) => void = (c) => c('q');
  locked = false;
  /** Extra input lock, e.g. while the AI is thinking. */
  blocked: () => boolean = () => false;
  onMoved: () => void = () => {};
  /** Tutorial: when set, only this move can be made, and it is highlighted. */
  guide: { b: BoardId; from: number; to: number } | null = null;
  onWrong: (why: 'piece' | 'target' | 'empty') => void = () => {};

  private down: { x: number; y: number; hit: { b: BoardId; sq: number } | null; own: boolean } | null = null;

  constructor(private world: World, game: Game, private canvas: HTMLCanvasElement) {
    this.game = game;
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    canvas.addEventListener('pointerup', (e) => this.pointerUp(e));
    canvas.addEventListener('pointercancel', () => { this.down = null; });
  }

  setGame(g: Game): void {
    this.game = g;
    this.deselect();
    this.world.reset(g.pos);
    this.refresh();
  }

  get pos(): Position { return this.game.pos; }

  // ---------- input ----------

  private ownPieceAt(sq: number | null, b: BoardId = this.world.active): boolean {
    if (sq === null) return false;
    const p = this.pos.boards[b][sq];
    return !!p && p.color === this.pos.side;
  }

  private pointerDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    const hit = this.world.pick(e.clientX, e.clientY);
    this.down = { x: e.clientX, y: e.clientY, hit, own: !!hit && this.ownPieceAt(hit.sq, hit.b) };
  }

  private pointerUp(e: PointerEvent): void {
    const d = this.down;
    this.down = null;
    if (!d || this.locked || this.world.gliding || this.world.busy || this.blocked()) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) {
      if (this.world.inPortal(e.clientX, e.clientY)) return this.switchBoard();
      const hit = this.world.pick(e.clientX, e.clientY);
      return this.tap(hit ? hit.sq : null, hit ? hit.b : undefined);
    }
    if (d.own && d.hit && this.guide && !(d.hit.b === this.guide.b && d.hit.sq === this.guide.from)) { this.onWrong('piece'); return; }
    if (d.own && d.hit) {
      // Drag and drop: pick up, drop on a target (on the same board).
      this.select(d.hit.sq, d.hit.b);
      const to = this.world.pick(e.clientX, e.clientY);
      if (to && to.b === d.hit.b && to.sq !== d.hit.sq) this.attempt(to.sq, true);
      return;
    }
    if (!this.world.dual && Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      // Swipe up goes to the board above, down to the board below.
      this.goTo(dy < 0 ? 0 : 1);
    }
  }

  tap(sq: number | null, b: BoardId = this.world.active): void {
    if (sq === null) return this.deselect();
    if (this.guide) return this.guidedTap(sq, b);
    if (this.selected && this.selected.b === b && this.attempt(sq, false)) return;
    if (this.ownPieceAt(sq, b)) this.select(sq, b);
    else this.deselect();
  }

  /** In the tutorial only the guided move is allowed; anything else just nudges the player. */
  private guidedTap(sq: number, b: BoardId): void {
    const g = this.guide!;
    if (this.selected) {
      if (b === g.b && sq === g.to && this.attempt(sq, false)) return;
      if (b === g.b && sq === g.from) return;
      this.onWrong('target');
      return;
    }
    if (b === g.b && sq === g.from) { this.select(sq, b); return; }
    this.onWrong(this.ownPieceAt(sq, b) ? 'piece' : 'empty');
  }

  switchBoard(): void { this.goTo((1 - this.world.active) as BoardId); }

  goTo(b: BoardId): void {
    if (this.world.dual || b === this.world.active) return;
    this.deselect();
    this.world.setActive(b);
    audio.setRealm(b);
    audio.play('ui');
    this.refresh();
  }

  // ---------- selection & moves ----------

  private select(sq: number, b: BoardId = this.world.active): void {
    this.selected = { b, sq };
    this.targets = this.game.legalMoves().filter((m) => m.board === b && m.from === sq && (!this.guide || m.to === this.guide.to));
    this.pending = null;
    audio.play('select');
    buzz('select');
    this.refresh();
  }

  deselect(): void {
    this.selected = null;
    this.targets = [];
    this.pending = null;
    this.refresh();
  }

  /** Tries to play to `sq`. Returns true if the tap was consumed. */
  private attempt(sq: number, confirmed: boolean): boolean {
    const moves = this.targets.filter((m) => m.to === sq);
    if (!moves.length) return false;
    const first = moves[0];
    if (first.capture && !confirmed && !(this.pending && this.pending.to === sq)) {
      this.pending = first;
      this.refresh();
      return true;
    }
    if (moves.some((m) => m.promo)) {
      this.onPromotion((p) => {
        const m = moves.find((x) => x.promo === p);
        if (m) this.play(m);
      });
      return true;
    }
    this.play(first);
    return true;
  }

  play(move: Move): void {
    const { info } = this.game.play(move);
    this.selected = null;
    this.targets = [];
    this.pending = null;
    audio.play(info.fell || info.rose || info.destroyed ? 'capture' : 'move');
    this.world.playMove(move, info, this.pos);
    this.afterMove();
    this.refresh();
    this.onMoved();
  }

  /** Check flash and checkmate slow motion, once the slide and transfer have played. */
  afterMove(): void {
    const s = this.game.status();
    setTimeout(() => {
      if (s.state === 'ongoing' && s.check) this.world.checkFlash(this.pos.kingSq[this.pos.side]);
      if (s.state === 'checkmate') { audio.play('mate'); this.world.mateSlowmo(); }
    }, 700);
  }

  undo(): void {
    if (this.world.busy) return;
    if (this.game.undo()) {
      this.deselect();
      this.world.reset(this.pos);
      this.refresh();
    }
  }

  // ---------- previews & markers ----------

  private preview(m: Move): Preview {
    const pos = this.pos;
    const info = pos.make(m);
    const res: Preview = { check: pos.inCheck(pos.side), attacks: [] };
    if (info.fell) {
      const f = info.fell;
      res.fell = { type: f.piece.type, color: f.piece.color, sq: f.to };
      for (const mv of pos.pseudoMoves(f.piece.color)) {
        if (mv.board === 1 && mv.from === f.to) res.attacks.push(mv.to);
      }
    } else if (info.destroyed && m.board === 0 && m.capture) res.destroyed = true;
    if (info.rose) res.rose = { sq: info.rose.to };
    pos.unmake();
    return res;
  }

  /** Recomputes markers and notifies the HUD. */
  refresh(): void {
    const w = this.world, pos = this.pos;
    const mk: MarkerSet = emptyMarkers();
    const b = this.selected?.b ?? w.active;
    let preview: Preview | null = null;
    if (this.selected) {
      mk.selected = this.selected;
      for (const m of this.targets) (m.capture ? mk.capture : mk.quiet).push({ b, sq: m.to });
      if (this.pending) {
        preview = this.preview(this.pending);
        if (preview.fell) mk.ghosts.push({ b: 1, sq: preview.fell.sq, type: preview.fell.type, color: preview.fell.color });
        for (const sq of preview.attacks) mk.attack.push({ b: 1, sq });
        if (preview.rose) mk.rise = { b: 0, sq: preview.rose.sq, check: preview.check };
      }
    }
    // Threat markers go on the other board, where the portal shows them.
    const other = (w.dual ? 1 : 1 - b) as BoardId;
    const me = pos.side;
    pos.boards[other].forEach((p, sq) => {
      if (p && p.color === me && p.type !== 'k' && attacked(pos.boards[other], sq, (1 - me) as 0 | 1)) {
        mk.threat.push({ b: other, sq });
      }
    });
    if (this.guide) mk.hints.push({ b: this.guide.b, sq: this.selected ? this.guide.to : this.guide.from });
    w.setMarkers(mk);
    this.hint = preview ? this.describe(preview) : '';
    this.onChange();
  }

  hint = '';

  private describe(p: Preview): string {
    const parts: string[] = [];
    if (p.fell) parts.push(`falls to ${sqName(p.fell.sq)} below${p.attacks.length ? `, then attacks ${p.attacks.length} squares` : ''}`);
    if (p.destroyed) parts.push('destroyed for good');
    if (p.rose) parts.push(`rises to ${sqName(p.rose.sq)}`);
    if (p.check) parts.push('gives check');
    return parts.join(' · ') + ' — tap again to confirm';
  }

  /** What the portal should flag for the side to move. */
  portalAlert(): 'check' | 'threat' | 'rise' | null {
    const pos = this.pos;
    if (pos.inCheck()) return 'check';
    const other = (1 - this.world.active) as BoardId;
    const me = pos.side;
    let threatened = false;
    pos.boards[other].forEach((p, sq) => {
      if (p && p.color === me && attacked(pos.boards[other], sq, (1 - me) as 0 | 1)) threatened = true;
    });
    if (threatened) return 'threat';
    if (this.world.active === 0 && this.game.legalMoves().some((m) => m.board === 1 && m.capture)) return 'rise';
    return null;
  }
}
