import * as THREE from 'three';
import { Easing, animating, clock, resetClockGap, start, tickTweens, tween, tweens } from './tween';
import type { BoardId, Move, MoveInfo, Piece, Position } from '../rules';
import { Fx } from './fx';
import { addBoneFieldModels } from './terrain';
import { buildBoardScene } from './board-scene';
import { BOARD_GAP, Rect, boardY, squarePoint, squareToXZ } from './coords';
import { dualBoardRects, portalRectFor } from './layout';
import { MarkerSet, fillMarkers } from './markers';
import { Kit, pickStyle, restoreView } from './exec';
import { settings } from '../platform/settings';
import { PieceView, createPieceView, makeGhost, updatePieceView } from './pieces';

const FRUSTUM_HEIGHT = 8.2; // world units visible vertically in the main view

interface ViewState { yaw: number; pitch: number; cy: number }

const REALM = {
  0: { bg: 0xcfe3f5, fog: null as THREE.Fog | null },
  1: { bg: 0x0b0507, fog: new THREE.Fog(0x120609, 40, 80) },
};

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  boards: THREE.Group[] = [new THREE.Group(), new THREE.Group()];
  markers: THREE.Group[] = [new THREE.Group(), new THREE.Group()];
  views = new Map<number, PieceView>();
  mainCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  portalCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  view: ViewState = { yaw: 45, pitch: 30, cy: 0 };
  active: BoardId = 0;
  rotation = 0;
  tactical = false;
  gliding = false;
  portalEnabled = true;
  portalRect = { x: 0, y: 0, w: 220, h: 124 }; // css pixels, top-left origin
  fx: Fx;
  /** Fired at the impact moment of an effect, for sound and haptics. */
  onEvent: (e: 'fall' | 'rise' | 'destroy' | 'move' | 'check' | 'promote') => void = () => {};
  shakeAmp = 0;
  zoom = 1;
  pending = 0;
  lastStyle = '';
  /** Animations in flight, so a reset can clear their props. */
  private kits = new Set<Kit>();
  private lastPortrait = false;
  private dirty = true;
  private running = false;
  private lastT = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.add(...this.boards);
    this.fx = new Fx(this.scene);
    this.boards[1].position.y = boardY(1);
    buildBoardScene(this.boards[0], 0);
    buildBoardScene(this.boards[1], 1);
    void addBoneFieldModels(this.boards[1]).then(() => this.invalidate());
    this.boards.forEach((b, i) => b.add(this.markers[i]));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------- pieces ----------

  /** Makes the piece views match `pos`. Ids in `skip` are left alone (they are mid-animation). */
  syncPieces(pos: Position, animate: boolean, skip?: Set<number>): void {
    const livePieceIds = new Set<number>();
    for (const boardId of [0, 1] as BoardId[]) {
      for (let square = 0; square < 64; square++) {
        const piece = pos.boards[boardId][square];
        if (!piece) continue;
        livePieceIds.add(piece.id);
        if (skip?.has(piece.id)) continue;
        this.syncPieceView(piece, boardId, square, animate);
      }
    }
    for (const id of [...this.views.keys()]) {
      if (!livePieceIds.has(id) && !skip?.has(id)) this.removeView(id);
    }
    this.invalidate();
  }

  private syncPieceView(piece: Piece, boardId: BoardId, square: number, animate: boolean): void {
    const [x, z] = squareToXZ(square);
    let view = this.views.get(piece.id);
    if (!view) {
      view = createPieceView(piece, boardId);
      this.views.set(piece.id, view);
      view.position.set(x, 0, z);
      this.boards[boardId].add(view);
      return;
    }
    updatePieceView(view, piece, boardId);
    const changedBoard = view.parent !== this.boards[boardId];
    if (changedBoard) {
      this.boards[boardId].add(view);
      view.position.set(x, 0, z);
      view.scale.setScalar(1);
    } else if (animate && (view.position.x !== x || view.position.z !== z)) {
      start(tween(view.position).to({ x, z }, 260).easing(Easing.Cubic.Out));
    } else {
      view.position.set(x, 0, z);
    }
  }

  private removeView(pieceId: number): void {
    const view = this.views.get(pieceId);
    view?.parent?.remove(view);
    this.views.delete(pieceId);
  }

  // ---------- move animation ----------

  get busy(): boolean { return this.pending > 0; }

  /** Kills running animations and snaps to the position (undo, new game, load). */
  reset(pos: Position): void {
    tweens.removeAll();
    for (const kit of this.kits) kit.cleanup();
    this.kits.clear();
    for (const view of this.views.values()) view.parent?.remove(view);
    this.views.clear();
    clock.scale = 1;
    this.pending = 0;
    this.zoom = 1;
    this.shakeAmp = 0;
    this.gliding = false;
    this.syncPieces(pos, false);
    this.applyView(false);
  }

  shake(amplitude: number): void {
    this.shakeAmp = amplitude;
    const decay = { amplitude };
    start(tween(decay).to({ amplitude: 0 }, 340).onUpdate(() => { this.shakeAmp = decay.amplitude; }));
  }

  /**
   * Plays a move that has just been made: a cinematic move or capture style for the piece,
   * then the victim's fate (fall, or destruction) or the attacker's rise.
   * `pos` is the position after the move; the view is reconciled with it at the end.
   */
  async playMove(move: Move, info: MoveInfo, pos: Position): Promise<void> {
    const { fell, rose, destroyed } = info;
    const victimPiece = fell?.piece ?? destroyed ?? null;
    const moverPiece = rose ? rose.piece : pos.boards[move.board][move.to]!;
    const attackerView = this.views.get(moverPiece.id);
    const victimView = victimPiece ? this.views.get(victimPiece.id) : undefined;

    const animatedIds = new Set<number>();
    if (victimPiece) animatedIds.add(victimPiece.id);
    if (rose) animatedIds.add(rose.piece.id);
    if (attackerView) animatedIds.add(moverPiece.id);

    this.pending++;
    this.syncPieces(pos, true, animatedIds);
    const finish = () => {
      this.syncPieces(pos, false);
      if (move.promo) {
        this.onEvent('promote');
        this.fx.burst(squarePoint(move.board, move.to, 0.3), 'gold', 30);
      }
      this.pending--;
      this.invalidate();
    };
    if (!attackerView) { finish(); return; }

    await this.playMoveStyle(move, attackerView, victimView ?? null, !!victimPiece, () => this.onEvent(fell ? 'fall' : 'destroy'));

    if (rose) {
      this.playRise(attackerView, rose, victimPiece?.id, finish);
    } else if (fell && victimView) {
      this.playFall(victimView, fell, move.to, finish);
    } else {
      if (victimPiece) this.removeView(victimPiece.id);
      finish();
    }
    this.invalidate();
  }

  /** Runs the piece's cinematic (or plain slide) up to and including the victim's reaction. */
  private async playMoveStyle(
    move: Move, attackerView: PieceView, victimView: PieceView | null, isCapture: boolean, onImpact: () => void,
  ): Promise<void> {
    const [fromX, fromZ] = squareToXZ(move.from);
    const [toX, toZ] = squareToXZ(move.to);
    const kit = new Kit(
      this, this.boards[move.board], attackerView, victimView,
      new THREE.Vector3(fromX, 0, fromZ), new THREE.Vector3(toX, 0, toZ), onImpact,
    );
    const pieceType = attackerView.userData.type;
    const style = pickStyle(pieceType, isCapture, settings.cinematic && !move.castle);
    this.lastStyle = `${pieceType}${isCapture ? ' kill' : ' move'}: ${style.name}`;
    if (style.zoom) start(tween(this).to({ zoom: style.zoom }, 280).easing(Easing.Cubic.Out));
    this.kits.add(kit);
    try {
      await style.run(kit);
      if (isCapture && victimView && !kit.hitCalled) await kit.hit('squash');
      await kit.reaction;
    } finally {
      kit.cleanup();
      this.kits.delete(kit);
      if (style.zoom) start(tween(this).to({ zoom: 1 }, 320).easing(Easing.Cubic.InOut));
    }
  }

  /** Underworld capture: the capturer bursts up out of the ground on the Overworld. */
  private playRise(attackerView: PieceView, rose: NonNullable<MoveInfo['rose']>, victimId: number | undefined, onDone: () => void): void {
    this.onEvent('rise');
    const [x, z] = squareToXZ(rose.to);
    this.fx.column(this.boards[0], x, z);
    this.fx.burst(squarePoint(0, rose.to, 0.1), 'gold', 46, { speed: 1.2 });
    this.shake(0.1);
    if (victimId !== undefined) this.removeView(victimId);
    this.boards[0].add(attackerView);
    attackerView.position.set(x, -1.8, z);
    attackerView.scale.setScalar(0.7);
    updatePieceView(attackerView, rose.piece, 0);
    start(tween(attackerView.scale).to({ x: 1, y: 1, z: 1 }, 520).easing(Easing.Cubic.Out));
    start(tween(attackerView.position).to({ y: 0 }, 520).easing(Easing.Back.Out).onComplete(onDone));
  }

  /** Overworld capture: the victim drops through a crack onto the Underworld. */
  private playFall(victimView: PieceView, fell: NonNullable<MoveInfo['fell']>, crackSquare: number, onDone: () => void): void {
    restoreView(victimView);
    const [crackX, crackZ] = squareToXZ(crackSquare);
    this.fx.crack(this.boards[0], crackX, crackZ);
    this.fx.burst(squarePoint(0, fell.from, 0.1), 'ember', 30);
    const [landX, landZ] = squareToXZ(fell.to);
    this.boards[1].add(victimView);
    updatePieceView(victimView, fell.piece, 1);
    victimView.position.set(landX, 0, landZ);
    victimView.scale.setScalar(0.01);
    this.fx.burst(squarePoint(1, fell.to, 0.1), 'ember', 28, { speed: 0.7 });
    start(tween(victimView.scale).to({ x: 1, y: 1, z: 1 }, 380).easing(Easing.Back.Out).onComplete(onDone));
  }

  /** Pulses the checked king's tile. */
  checkFlash(sq: number): void {
    const [x, z] = squareToXZ(sq);
    this.fx.flashTile(this.boards[0], x, z);
    this.onEvent('check');
    this.invalidate();
  }

  /** Slow motion and a slow push-in for checkmate. */
  mateSlowmo(): void {
    clock.scale = 0.3;
    start(tween(this).to({ zoom: 0.78 }, 500).easing(Easing.Cubic.Out));
    setTimeout(() => { clock.scale = 1; }, 1500);
    this.invalidate();
  }

  // ---------- markers ----------

  setMarkers(markers: MarkerSet): void {
    fillMarkers(this.markers, markers);
    this.invalidate();
  }

  // ---------- camera ----------

  private frame(cam: THREE.OrthographicCamera, aspect: number, state: ViewState, height: number): void {
    const yaw = THREE.MathUtils.degToRad(state.yaw);
    const pitch = THREE.MathUtils.degToRad(state.pitch);
    const center = new THREE.Vector3(0, state.cy, 0);
    if ((cam === this.mainCam || this.tactical) && this.shakeAmp > 0.001) {
      center.x += (Math.random() - 0.5) * this.shakeAmp;
      center.y += (Math.random() - 0.5) * this.shakeAmp;
    }
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    cam.position.copy(center).addScaledVector(dir, 40);
    cam.up.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    cam.lookAt(center);
    // On narrow (portrait) screens fit the board by width so it is never cut off at the sides.
    const h = Math.max(height, (this.tactical ? 9.4 : this.portrait ? 9.8 : 13) / aspect);
    // Top view shows both boards at once; clip each camera to its own slab so the other board's particles never show through.
    cam.near = this.tactical ? 33 : 0.1;
    cam.far = this.tactical ? 46 : 200;
    cam.top = h / 2; cam.bottom = -h / 2;
    cam.left = -h * aspect / 2; cam.right = h * aspect / 2;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Tall screens: a portrait phone. */
  get portrait(): boolean { return this.canvas.clientHeight > this.canvas.clientWidth; }
  private pitch(): number { return this.tactical ? 90 : this.portrait ? 42 : 30; }

  private targetView(): ViewState {
    // Landscape uses the 2:1 isometric diamond; portrait looks square-on so the board uses the width.
    const base = this.tactical || this.portrait ? 0 : 45;
    return {
      yaw: base + this.rotation * 90,
      pitch: this.pitch(),
      cy: boardY(this.active),
    };
  }

  /** Glides the camera to the current board / rotation / view mode. */
  applyView(animate = true): void {
    const t = this.targetView();
    if (!animate) { Object.assign(this.view, t); this.invalidate(); return; }
    this.gliding = true;
    const tw = tween(this.view)
      .to(t, 600)
      .easing(Easing.Cubic.InOut)
      .onComplete(() => { this.gliding = false; this.invalidate(); });
    start(tw);
    this.invalidate();
  }

  setActive(b: BoardId): void { this.active = b; this.applyView(); }
  rotate(): void { this.rotation++; this.applyView(); }
  toggleTactical(): void {
    this.tactical = !this.tactical;
    this.applyView(!this.tactical);
    this.invalidate();
  }

  /** Camera push-in when a game starts. */
  intro(): void {
    this.zoom = 1.45;
    start(tween(this).to({ zoom: 1 }, 1100).easing(Easing.Cubic.Out));
    this.invalidate();
  }

  /** Top view shows both boards at once, so nothing needs switching. */
  get dual(): boolean { return this.tactical; }

  /** Screen rectangles (css px) for the Overworld and Underworld in top view: side by side on wide screens, stacked on tall ones. */
  dualRects(): [Rect, Rect] {
    return dualBoardRects(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  private dualCam(b: BoardId): THREE.OrthographicCamera {
    const rc = this.dualRects()[b];
    const cam = b === 0 ? this.mainCam : this.portalCam;
    this.frame(cam, rc.w / rc.h, { yaw: this.rotation * 90, pitch: 70, cy: boardY(b) }, 9.4 * this.zoom);
    return cam;
  }

  // ---------- picking ----------

  /** Projects a screen point onto a board's plane and snaps to the nearest square center. */
  pickSquare(clientX: number, clientY: number, board: BoardId, cam: THREE.OrthographicCamera = this.mainCam, rect?: Rect): number | null {
    const r = this.canvas.getBoundingClientRect();
    const rc = rect ?? { x: 0, y: 0, w: r.width, h: r.height };
    const ndc = new THREE.Vector2(((clientX - r.left - rc.x) / rc.w) * 2 - 1, -((clientY - r.top - rc.y) / rc.h) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -boardY(board));
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    const f = Math.round(hit.x + 3.5);
    const rk = Math.round(3.5 - hit.z);
    // Forgiving: accept up to a third of a square beyond the edge, snapping inward.
    if (f < -0.34 || f > 7.34 || rk < -0.34 || rk > 7.34) return null;
    return Math.min(7, Math.max(0, rk)) * 8 + Math.min(7, Math.max(0, f));
  }

  /** Which board and square a screen point is on. In top view that can be either board. */
  pick(clientX: number, clientY: number): { b: BoardId; sq: number } | null {
    if (this.dual) {
      const r = this.canvas.getBoundingClientRect();
      const px = clientX - r.left, py = clientY - r.top;
      const rects = this.dualRects();
      for (const b of [0, 1] as BoardId[]) {
        const rc = rects[b];
        if (px < rc.x || px > rc.x + rc.w || py < rc.y || py > rc.y + rc.h) continue;
        const sq = this.pickSquare(clientX, clientY, b, this.dualCam(b), rc);
        return sq === null ? null : { b, sq };
      }
      return null;
    }
    if (this.inPortal(clientX, clientY)) return null;
    const sq = this.pickSquare(clientX, clientY, this.active);
    return sq === null ? null : { b: this.active, sq };
  }

  /** True when a point is inside the corner portal. */
  inPortal(clientX: number, clientY: number): boolean {
    if (!this.portalEnabled || this.dual) return false;
    const r = this.canvas.getBoundingClientRect();
    const p = this.portalRect;
    const x = clientX - r.left, y = clientY - r.top;
    return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
  }

  // ---------- rendering ----------

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const portrait = h > w;
    if (portrait !== this.lastPortrait) { this.lastPortrait = portrait; this.applyView(false); }
    this.portalRect = portalRectFor(w, h);
    this.invalidate();
  }

  /** Test hook: steps the animations forward by `ms` without waiting for browser frames, then draws. */
  advance(ms: number): void {
    const step = 16;
    let t = this.lastT || performance.now();
    for (let done = 0; done < ms; done += step) {
      t += step;
      tickTweens(t);
      this.fx.update((step / 1000) * clock.scale);
    }
    this.lastT = t;
    this.render();
  }

  /** Test hook: animation clock state. */
  debugState() { return { t: clock.t, last: clock.last, tweens: tweens.getAll().length, playing: tweens.getAll().filter((x) => x.isPlaying()).length }; }

  invalidate(): void {
    this.dirty = true;
    if (this.running) return;
    this.running = true;
    resetClockGap();
    this.lastT = performance.now();
    const tick = (time: number) => {
      const dt = Math.max(0, Math.min((time - this.lastT) / 1000, 0.05));
      this.lastT = time;
      tickTweens(time);
      this.fx.update(dt * clock.scale);
      this.render();
      if (animating() || this.fx.active || this.dirty) {
        this.dirty = false;
        requestAnimationFrame(tick);
      } else this.running = false;
    };
    requestAnimationFrame(tick);
  }

  private renderDual(w: number, h: number): void {
    const r = this.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.setClearColor(0x0b0710, 1);
    r.clear();
    const rects = this.dualRects();
    for (const b of [0, 1] as BoardId[]) {
      const rc = rects[b];
      const cam = this.dualCam(b);
      const y = h - rc.y - rc.h;
      r.setScissorTest(true);
      r.setViewport(rc.x, y, rc.w, rc.h);
      r.setScissor(rc.x, y, rc.w, rc.h);
      this.boards[0].visible = b === 0;
      this.boards[1].visible = b === 1;
      this.scene.fog = REALM[b].fog;
      this.scene.background = new THREE.Color(REALM[b].bg);
      r.render(this.scene, cam);
    }
    r.setScissorTest(false);
  }

  private render(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const r = this.renderer;
    if (this.dual) { this.renderDual(w, h); return; }
    const other = (1 - this.active) as BoardId;
    this.frame(this.mainCam, w / h, this.view, FRUSTUM_HEIGHT * this.zoom);

    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    const mainRealm = this.gliding ? (this.view.cy > -BOARD_GAP / 2 ? 0 : 1) : this.active;
    this.boards[0].visible = this.gliding || this.active === 0;
    this.boards[1].visible = this.gliding || this.active === 1;
    this.scene.fog = this.gliding ? null : REALM[mainRealm].fog;
    this.scene.background = new THREE.Color(REALM[mainRealm].bg);
    r.render(this.scene, this.mainCam);

    if (this.portalEnabled) {
      const p = this.portalRect;
      const pv: ViewState = { yaw: this.view.yaw, pitch: this.pitch(), cy: boardY(other) };
      this.frame(this.portalCam, p.w / p.h, pv, FRUSTUM_HEIGHT + 0.6);
      r.setScissorTest(true);
      const y = h - p.y - p.h;
      r.setViewport(p.x, y, p.w, p.h);
      r.setScissor(p.x, y, p.w, p.h);
      this.boards[0].visible = other === 0;
      this.boards[1].visible = other === 1;
      this.scene.fog = REALM[other].fog;
      this.scene.background = new THREE.Color(REALM[other].bg);
      r.render(this.scene, this.portalCam);
      r.setScissorTest(false);
    }
  }
}
