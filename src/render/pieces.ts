import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoardId, Piece, PieceType } from '../rules';

type G = THREE.BufferGeometry;

export interface Palette { base: number; trim: number; dark: number; accent: number; metal: number }
export const PAL: [Palette, Palette] = [
  { base: 0xf2e8cc, trim: 0xe0b040, dark: 0x7a5f35, accent: 0xc23b3b, metal: 0xd7dde6 },
  { base: 0x3d3b4c, trim: 0xb8c0e0, dark: 0x14131b, accent: 0xa05cff, metal: 0x8d96ad },
];

// ---------- tiny low-poly modelling kit ----------

interface Xf { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number }

/** Flat-shaded, colored, transformed copy of a primitive. */
export function part(geo: G, hex: number, t: Xf = {}): G {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(t.x ?? 0, t.y ?? 0, t.z ?? 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0)),
    new THREE.Vector3(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1),
  );
  g.applyMatrix4(m);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export const lathe = (pts: [number, number][], hex: number, seg = 12, t: Xf = {}) =>
  part(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), hex, t);
export const box = (w: number, h: number, d: number, hex: number, t: Xf = {}) => part(new THREE.BoxGeometry(w, h, d), hex, t);
export const cyl = (rt: number, rb: number, h: number, hex: number, t: Xf = {}, seg = 8) =>
  part(new THREE.CylinderGeometry(rt, rb, h, seg), hex, t);
export const cone = (r: number, h: number, hex: number, t: Xf = {}, seg = 6) => part(new THREE.ConeGeometry(r, h, seg), hex, t);
export const ball = (r: number, hex: number, t: Xf = {}, w = 8, h = 6) => part(new THREE.SphereGeometry(r, w, h), hex, t);
export const ring = (r: number, tube: number, hex: number, t: Xf = {}) => part(new THREE.TorusGeometry(r, tube, 5, 14), hex, { rx: Math.PI / 2, ...t });
export const merge = (parts: G[]): G => mergeGeometries(parts)!;

const around = (n: number, r: number, f: (x: number, z: number, a: number) => G): G[] =>
  Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return f(Math.sin(a) * r, Math.cos(a) * r, a); });

/** Keeps any piece within 1.2 squares tall and 0.9 wide. */
function fit(g: G): G {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const k = Math.min(1, 1.2 / (b.max.y - b.min.y), 0.92 / Math.max(b.max.x - b.min.x, b.max.z - b.min.z));
  if (k < 1) { g.scale(k, k, k); }
  return g;
}

// ---------- the six pieces (forward is +z) ----------

function baseDisc(p: Palette, r = 0.4): G[] {
  return [lathe([[0, 0], [r, 0], [r + 0.02, 0.07], [r - 0.08, 0.13], [0, 0.13]], p.base), ring(r - 0.03, 0.02, p.trim, { y: 0.07 })];
}

function buildPawn(p: Palette): G {
  return merge([
    ...baseDisc(p, 0.34),
    lathe([[0.2, 0.12], [0.14, 0.3], [0.1, 0.4]], p.base, 10),
    ring(0.15, 0.03, p.trim, { y: 0.36 }),
    ball(0.15, p.base, { y: 0.52 }, 10, 8),
  ]);
}

function buildRook(p: Palette): G {
  return merge([
    ...baseDisc(p, 0.4),
    cyl(0.27, 0.31, 0.52, p.base, { y: 0.4 }, 10),
    ring(0.29, 0.025, p.trim, { y: 0.5 }),
    lathe([[0.27, 0.62], [0.37, 0.72], [0.37, 0.78], [0, 0.78]], p.base, 10),
    ...around(8, 0.33, (x, z, a) => box(0.13, 0.13, 0.09, p.base, { x, z, y: 0.84, ry: a })),
    box(0.15, 0.24, 0.05, p.dark, { y: 0.32, z: 0.3 }),
    ...[0.9, 2.3, 3.9, 5.4].map((a) => box(0.045, 0.14, 0.04, p.dark, { x: Math.sin(a) * 0.285, z: Math.cos(a) * 0.285, y: 0.5, ry: a })),
    box(0.1, 0.03, 0.06, p.trim, { y: 0.45, z: 0.31 }),
  ]);
}

function buildBishop(p: Palette): G {
  return fit(merge([
    ...baseDisc(p, 0.38),
    lathe([[0.3, 0.12], [0.24, 0.3], [0.19, 0.5], [0.16, 0.64], [0.0, 0.64]], p.base, 10),
    ring(0.18, 0.03, p.trim, { y: 0.6 }),
    ring(0.26, 0.02, p.trim, { y: 0.24 }),
    ball(0.17, p.base, { y: 0.86, sy: 1.7 }, 10, 8),
    box(0.03, 0.26, 0.4, p.dark, { y: 0.92, rx: 0.0, rz: 0.55 }),
    ring(0.15, 0.022, p.trim, { y: 0.72 }),
    ball(0.055, p.trim, { y: 1.15 }),
    box(0.035, 0.14, 0.035, p.trim, { y: 1.27 }),
    box(0.11, 0.035, 0.035, p.trim, { y: 1.28 }),
    ball(0.06, p.base, { x: 0.15, y: 0.52, z: 0.12 }), ball(0.06, p.base, { x: -0.15, y: 0.52, z: 0.12 }),
  ]));
}

function buildKnight(p: Palette): G {
  const tilt = (a: number) => ({ rx: a });
  return fit(merge([
    ...baseDisc(p, 0.4),
    ball(0.5, p.base, { y: 0.44, z: -0.04, sx: 0.36, sy: 0.4, sz: 0.74 }, 10, 8), // barrel
    ...[[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.24], [0.09, -0.24]].map(([x, z]) => cyl(0.035, 0.045, 0.32, p.base, { x, z, y: 0.28 })),
    ...[[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.24], [0.09, -0.24]].map(([x, z]) => box(0.08, 0.04, 0.1, p.dark, { x, z, y: 0.14 })), // hooves
    box(0.15, 0.4, 0.17, p.base, { y: 0.7, z: 0.22, ...tilt(0.45) }), // neck
    box(0.13, 0.13, 0.3, p.base, { y: 0.88, z: 0.4, ...tilt(0.5) }), // head
    box(0.11, 0.1, 0.1, p.dark, { y: 0.8, z: 0.55, ...tilt(0.5) }), // muzzle
    cone(0.035, 0.1, p.base, { x: 0.05, y: 0.99, z: 0.3 }), cone(0.035, 0.1, p.base, { x: -0.05, y: 0.99, z: 0.3 }), // ears
    ball(0.02, p.dark, { x: 0.07, y: 0.9, z: 0.42 }), ball(0.02, p.dark, { x: -0.07, y: 0.9, z: 0.42 }), // eyes
    ...[0, 1, 2, 3].map((i) => box(0.04, 0.1, 0.07, p.accent, { y: 0.9 - i * 0.1, z: 0.1 - i * 0.015, ...tilt(0.5) })), // mane
    cone(0.07, 0.34, p.accent, { y: 0.44, z: -0.38, rx: -2.4 }), // tail
    box(0.26, 0.04, 0.26, p.trim, { y: 0.63, z: -0.02 }), // saddle
    cyl(0.1, 0.12, 0.26, p.metal, { y: 0.78, z: -0.02 }), // rider torso
    ball(0.085, p.metal, { y: 0.97, z: -0.02 }, 8, 6), // helmet
    box(0.1, 0.025, 0.03, p.dark, { y: 0.97, z: 0.06 }), // visor
    cone(0.03, 0.14, p.accent, { y: 1.06, z: -0.07, rx: -0.5 }), // plume
    cyl(0.012, 0.012, 0.8, p.dark, { x: 0.15, y: 0.9, z: 0.0, rz: -0.06 }, 4), // lance
    box(0.01, 0.09, 0.16, p.accent, { x: 0.15, y: 1.25, z: -0.07 }), // pennant
    cone(0.025, 0.1, p.metal, { x: 0.145, y: 1.34 }, 4),
    cyl(0.1, 0.1, 0.025, p.trim, { x: -0.16, y: 0.76, rz: Math.PI / 2 }, 8), // shield
  ]));
}

function buildQueen(p: Palette): G {
  return fit(merge([
    ...baseDisc(p, 0.4),
    lathe([[0.34, 0.12], [0.3, 0.26], [0.22, 0.46], [0.13, 0.64], [0.15, 0.7], [0, 0.72]], p.base, 12),
    ring(0.15, 0.03, p.trim, { y: 0.62 }),
    ring(0.29, 0.02, p.trim, { y: 0.24 }),
    cone(0.07, 0.34, p.base, { x: 0.17, y: 0.58, rz: -0.4 }), cone(0.07, 0.34, p.base, { x: -0.17, y: 0.58, rz: 0.4 }),
    ball(0.11, p.base, { y: 0.86 }, 10, 8),
    cyl(0.12, 0.1, 0.09, p.trim, { y: 0.97 }, 12),
    ...around(7, 0.115, (x, z) => cone(0.035, 0.15, p.trim, { x, z, y: 1.07 })),
    ...around(7, 0.115, (x, z) => ball(0.03, p.accent, { x, z, y: 1.17 }, 6, 4)),
    ball(0.045, p.accent, { y: 1.1 }),
    // whip: handle in hand and a coiled lash at the hip
    cyl(0.022, 0.026, 0.2, p.dark, { x: 0.27, y: 0.46, z: 0.12, rz: -0.3 }, 5),
    ring(0.1, 0.014, p.dark, { x: 0.31, y: 0.34, z: 0.1, ry: Math.PI / 2, rx: 0 }),
    ring(0.07, 0.012, p.dark, { x: 0.32, y: 0.34, z: 0.1, ry: Math.PI / 2 }),
    ball(0.035, p.base, { x: 0.25, y: 0.5, z: 0.12 }),
  ]));
}

function buildKing(p: Palette): G {
  return fit(merge([
    ...baseDisc(p, 0.42),
    lathe([[0.36, 0.12], [0.3, 0.3], [0.22, 0.52], [0.18, 0.7], [0.0, 0.7]], p.base, 12),
    ring(0.2, 0.05, p.trim, { y: 0.7 }),
    ring(0.31, 0.02, p.trim, { y: 0.22 }),
    box(0.46, 0.55, 0.05, p.accent, { y: 0.45, z: -0.22, rx: -0.12 }), // cape
    ball(0.115, p.base, { y: 0.9 }, 10, 8),
    box(0.11, 0.03, 0.08, p.dark, { y: 0.93, z: 0.09 }), // brow
    cyl(0.135, 0.125, 0.1, p.trim, { y: 1.03 }, 12),
    ...around(4, 0.13, (x, z) => cone(0.04, 0.12, p.trim, { x, z, y: 1.12 })),
    ball(0.055, p.accent, { y: 1.12 }),
    box(0.045, 0.2, 0.045, p.trim, { y: 1.26 }), box(0.15, 0.045, 0.045, p.trim, { y: 1.28 }),
    cyl(0.016, 0.016, 0.6, p.dark, { x: 0.3, y: 0.55, z: 0.1 }, 5), ball(0.05, p.trim, { x: 0.3, y: 0.88, z: 0.1 }),
    ball(0.04, p.base, { x: 0.27, y: 0.52, z: 0.1 }),
  ]));
}

const BUILDERS: Record<PieceType, (p: Palette) => G> = {
  p: buildPawn, r: buildRook, b: buildBishop, n: buildKnight, q: buildQueen, k: buildKing,
};
const geoCache = new Map<string, G>();
export function pieceGeometry(type: PieceType, color: 0 | 1): G {
  const key = type + color;
  let g = geoCache.get(key);
  if (!g) { g = BUILDERS[type](PAL[color]); geoCache.set(key, g); }
  return g;
}

// ---------- materials & views ----------

export const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([100, 180, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const blobTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const blobGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false });
const ringGeo = new THREE.TorusGeometry(0.44, 0.035, 6, 24).rotateX(Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });

interface Realm { tint: number; emissive: number; intensity: number }
const LOOK: Record<BoardId, [Realm, Realm]> = {
  0: [
    { tint: 0xffffff, emissive: 0x000000, intensity: 0 },
    { tint: 0xffffff, emissive: 0x000000, intensity: 0 },
  ],
  1: [
    { tint: 0xffd9a0, emissive: 0xff6a1a, intensity: 0.5 },
    { tint: 0xb592ff, emissive: 0x6a1fd0, intensity: 0.75 },
  ],
};
const OUTLINE = [0xfff2b0, 0xb08cff];

export interface PieceView extends THREE.Group {
  userData: { type: PieceType; color: 0 | 1; body: THREE.Mesh; outline: THREE.Mesh; ring: THREE.Mesh; blob: THREE.Mesh };
}

export function createPieceView(piece: Piece, board: BoardId): PieceView {
  const group = new THREE.Group() as PieceView;
  const body = new THREE.Mesh(
    pieceGeometry(piece.type, piece.color),
    new THREE.MeshToonMaterial({ gradientMap: gradient, vertexColors: true }),
  );
  const outline = new THREE.Mesh(
    body.geometry,
    new THREE.MeshBasicMaterial({
      color: OUTLINE[piece.color], transparent: true, opacity: 0.14,
      depthFunc: THREE.GreaterDepth, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, // pulled forward so a piece never outlines itself
    }),
  );
  outline.renderOrder = 5;
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05;
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.position.y = 0.012;
  group.add(blob, body, outline, ring);
  group.userData = { type: piece.type, color: piece.color, body, outline, ring, blob };
  updatePieceView(group, piece, board);
  return group;
}

/** Brings a view in line with the piece (type after promotion, realm look, risen ring). */
export function updatePieceView(view: PieceView, piece: Piece, board: BoardId): void {
  const u = view.userData;
  if (u.type !== piece.type || u.color !== piece.color) {
    u.type = piece.type; u.color = piece.color;
    u.body.geometry = pieceGeometry(piece.type, piece.color);
    u.outline.geometry = u.body.geometry;
  }
  const look = LOOK[board][piece.color];
  const m = u.body.material as THREE.MeshToonMaterial;
  m.color.setHex(look.tint);
  m.emissive.setHex(look.emissive);
  m.emissiveIntensity = look.intensity;
  u.ring.visible = piece.risen;
  // Everything faces the opponent: white looks toward -z, black toward +z.
  u.body.rotation.y = u.outline.rotation.y = piece.color === 0 ? Math.PI : 0;
}

export function makeGhost(piece: { type: PieceType; color: 0 | 1 }, board: BoardId): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: LOOK[board][piece.color].tint === 0xffffff ? PAL[piece.color].base : LOOK[board][piece.color].tint,
    transparent: true, opacity: 0.45, depthTest: false,
  });
  const mesh = new THREE.Mesh(pieceGeometry(piece.type, piece.color), mat);
  mesh.renderOrder = 20;
  mesh.rotation.y = piece.color === 0 ? Math.PI : 0;
  g.add(mesh);
  return g;
}
