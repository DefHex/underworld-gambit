import * as THREE from 'three';
import { Easing, tween, tweens } from './tween';
import type { BoardId, Piece, Position } from '../rules';
import { PieceView, createPieceView, makeGhost, updatePieceView } from './pieces';

export const GAP = 14; // vertical distance between the two boards in world space
const FRUSTUM_H = 8.2; // world units visible vertically in the main view

export const sqPos = (sq: number): [number, number] => [(sq & 7) - 3.5, 3.5 - (sq >> 3)];

export interface MarkerSet {
  selected?: { b: BoardId; sq: number };
  quiet: { b: BoardId; sq: number }[];
  capture: { b: BoardId; sq: number }[];
  attack: { b: BoardId; sq: number }[]; // squares the fallen victim will attack
  threat: { b: BoardId; sq: number }[]; // own pieces under attack
  ghosts: { b: BoardId; sq: number; type: Piece['type']; color: 0 | 1 }[];
  rise?: { b: BoardId; sq: number; check: boolean };
}
export const emptyMarkers = (): MarkerSet => ({ quiet: [], capture: [], attack: [], threat: [], ghosts: [] });

interface ViewState { yaw: number; pitch: number; cy: number }

const REALM = {
  0: { bg: 0xcfe3f5, fog: null as THREE.Fog | null },
  1: { bg: 0x120820, fog: new THREE.Fog(0x1a0a2a, 34, 64) },
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
  private dirty = true;
  private running = false;
  private tiles: THREE.Mesh[][] = [[], []];

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.add(...this.boards);
    this.boards[1].position.y = -GAP;
    this.buildBoard(0);
    this.buildBoard(1);
    this.boards.forEach((b, i) => b.add(this.markers[i]));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------- construction ----------

  private buildBoard(b: BoardId): void {
    const g = this.boards[b];
    const over = b === 0;
    const light = new THREE.MeshToonMaterial({ color: over ? 0xf3ead6 : 0x5a4670 });
    const dark = new THREE.MeshToonMaterial({ color: over ? 0xc9a24a : 0x2a1a3a });
    const tileGeo = new THREE.BoxGeometry(0.98, 0.3, 0.98);
    for (let sq = 0; sq < 64; sq++) {
      const t = new THREE.Mesh(tileGeo, ((sq & 7) + (sq >> 3)) & 1 ? light : dark);
      const [x, z] = sqPos(sq);
      t.position.set(x, -0.15, z);
      g.add(t);
      this.tiles[b].push(t);
    }
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(8.7, 0.5, 8.7),
      new THREE.MeshToonMaterial({ color: over ? 0x8a6a22 : 0x1d0f12 }),
    );
    frame.position.y = -0.42;
    g.add(frame);
    if (over) {
      g.add(new THREE.HemisphereLight(0xfff4de, 0xb0a080, 1.5));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(-6, 12, 5);
      g.add(sun);
    } else {
      g.add(new THREE.HemisphereLight(0xb090ff, 0x401020, 2.4));
      const ember = new THREE.PointLight(0xff5a1a, 55, 26, 1.4);
      ember.position.set(0, 3, 0);
      g.add(ember);
      const rim = new THREE.DirectionalLight(0xb080ff, 1.2);
      rim.position.set(5, 8, -4);
      g.add(rim);
    }
  }

  // ---------- pieces ----------

  syncPieces(pos: Position, animate: boolean): void {
    const seen = new Set<number>();
    for (const b of [0, 1] as BoardId[]) {
      for (let sq = 0; sq < 64; sq++) {
        const p = pos.boards[b][sq];
        if (!p) continue;
        seen.add(p.id);
        let v = this.views.get(p.id);
        const [x, z] = sqPos(sq);
        if (!v) {
          v = createPieceView(p, b);
          this.views.set(p.id, v);
          v.position.set(x, 0, z);
          this.boards[b].add(v);
        } else {
          updatePieceView(v, p, b);
          const moved = v.parent !== this.boards[b];
          if (moved) { this.boards[b].add(v); v.position.set(x, 0, z); v.scale.setScalar(1); }
          else if (animate && (v.position.x !== x || v.position.z !== z)) {
            tween(v.position).to({ x, z }, 260).easing(Easing.Cubic.Out).start();
          } else v.position.set(x, 0, z);
        }
      }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) { v.parent?.remove(v); this.views.delete(id); }
    }
    this.invalidate();
  }

  // ---------- markers ----------

  setMarkers(m: MarkerSet): void {
    for (const g of this.markers) g.clear();
    const flat = (geo: THREE.BufferGeometry, color: number, opacity = 0.9) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthTest: false, side: THREE.DoubleSide,
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 10;
      return mesh;
    };
    const at = (b: BoardId, sq: number, obj: THREE.Object3D, y = 0.04) => {
      const [x, z] = sqPos(sq);
      obj.position.set(x, y, z);
      this.markers[b].add(obj);
    };
    const disc = new THREE.CircleGeometry(0.17, 16);
    const ring = new THREE.RingGeometry(0.34, 0.45, 24);
    const sel = new THREE.RingGeometry(0.4, 0.49, 24);
    const sq4 = new THREE.PlaneGeometry(0.34, 0.34);
    for (const q of m.quiet) at(q.b, q.sq, flat(disc, 0x4cf0a0));
    for (const c of m.capture) at(c.b, c.sq, flat(ring, 0xff4040));
    for (const a of m.attack) at(a.b, a.sq, flat(sq4, 0xff3030, 0.6));
    for (const t of m.threat) at(t.b, t.sq, flat(new THREE.RingGeometry(0.3, 0.46, 4, 1, Math.PI / 4), 0xff2a2a, 0.95));
    if (m.selected) at(m.selected.b, m.selected.sq, flat(sel, 0xffe14a));
    if (m.rise) {
      at(m.rise.b, m.rise.sq, flat(new THREE.RingGeometry(0.3, 0.5, 24), m.rise.check ? 0xff4040 : 0x7ad0ff));
    }
    for (const g of m.ghosts) {
      const ghost = makeGhost(g, g.b);
      at(g.b, g.sq, ghost, 0);
    }
    this.invalidate();
  }

  // ---------- camera ----------

  private frame(cam: THREE.OrthographicCamera, aspect: number, state: ViewState, height: number): void {
    const yaw = THREE.MathUtils.degToRad(state.yaw);
    const pitch = THREE.MathUtils.degToRad(state.pitch);
    const center = new THREE.Vector3(0, state.cy, 0);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    cam.position.copy(center).addScaledVector(dir, 40);
    cam.up.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    cam.lookAt(center);
    cam.top = height / 2; cam.bottom = -height / 2;
    cam.left = -height * aspect / 2; cam.right = height * aspect / 2;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  private targetView(): ViewState {
    const base = this.tactical ? 0 : 45;
    return {
      yaw: base + this.rotation * 90,
      pitch: this.tactical ? 90 : 30,
      cy: this.active === 0 ? 0 : -GAP,
    };
  }

  /** Glides the camera to the current board / rotation / view mode. */
  applyView(animate = true): void {
    const t = this.targetView();
    if (!animate) { Object.assign(this.view, t); this.invalidate(); return; }
    this.gliding = true;
    tween(this.view)
      .to(t, 600)
      .easing(Easing.Cubic.InOut)
      .onComplete(() => { this.gliding = false; this.invalidate(); })
      .start();
    this.invalidate();
  }

  setActive(b: BoardId): void { this.active = b; this.applyView(); }
  rotate(): void { this.rotation++; this.applyView(); }
  toggleTactical(): void { this.tactical = !this.tactical; this.applyView(); }

  // ---------- picking ----------

  /** Projects a screen point onto a board's plane and snaps to the nearest square center. */
  pickSquare(clientX: number, clientY: number, board: BoardId): number | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.mainCam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), board === 0 ? 0 : GAP);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    const f = Math.round(hit.x + 3.5);
    const rk = Math.round(3.5 - hit.z);
    // Forgiving: accept up to a third of a square beyond the edge, snapping inward.
    if (f < -0.34 || f > 7.34 || rk < -0.34 || rk > 7.34) return null;
    return Math.min(7, Math.max(0, rk)) * 8 + Math.min(7, Math.max(0, f));
  }

  /** Screen position (css px) of a square's center on the active board, for HUD anchoring. */
  inPortal(clientX: number, clientY: number): boolean {
    if (!this.portalEnabled) return false;
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
    const pw = Math.min(230, Math.round(w * 0.27));
    const ph = Math.round(pw * 0.58);
    this.portalRect = { x: w - pw - 14, y: h - ph - 14, w: pw, h: ph };
    this.invalidate();
  }

  invalidate(): void {
    this.dirty = true;
    if (this.running) return;
    this.running = true;
    const tick = (time: number) => {
      tweens.update(time);
      this.render();
      if (tweens.getAll().some((t) => t.isPlaying()) || this.dirty) {
        this.dirty = false;
        requestAnimationFrame(tick);
      } else this.running = false;
    };
    requestAnimationFrame(tick);
  }

  private render(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const r = this.renderer;
    const other = (1 - this.active) as BoardId;
    this.frame(this.mainCam, w / h, this.view, FRUSTUM_H);

    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    const mainRealm = this.gliding ? (this.view.cy > -GAP / 2 ? 0 : 1) : this.active;
    this.boards[0].visible = this.gliding || this.active === 0;
    this.boards[1].visible = this.gliding || this.active === 1;
    this.scene.fog = this.gliding ? null : REALM[mainRealm].fog;
    this.scene.background = new THREE.Color(REALM[mainRealm].bg);
    r.render(this.scene, this.mainCam);

    if (this.portalEnabled) {
      const p = this.portalRect;
      const pv: ViewState = { yaw: this.view.yaw, pitch: this.tactical ? 90 : 30, cy: other === 0 ? 0 : -GAP };
      this.frame(this.portalCam, p.w / p.h, pv, FRUSTUM_H + 0.6);
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
