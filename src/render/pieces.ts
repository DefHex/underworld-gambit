import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoardId, Piece, PieceType } from '../rules';

// Lathe profiles as [radius, height]. Squat on purpose: nothing is taller than 1.2 squares.
const PROFILES: Record<Exclude<PieceType, 'n'>, [number, number][]> = {
  p: [[0, 0], [0.34, 0], [0.36, 0.06], [0.26, 0.14], [0.14, 0.26], [0.13, 0.34], [0.22, 0.4], [0.22, 0.48], [0.14, 0.56], [0.06, 0.6], [0, 0.6]],
  r: [[0, 0], [0.38, 0], [0.4, 0.08], [0.28, 0.18], [0.24, 0.55], [0.34, 0.62], [0.34, 0.8], [0.24, 0.8], [0.24, 0.72], [0, 0.72]],
  b: [[0, 0], [0.37, 0], [0.38, 0.08], [0.25, 0.18], [0.15, 0.45], [0.26, 0.55], [0.2, 0.75], [0.1, 0.92], [0.05, 1.0], [0, 1.02]],
  q: [[0, 0], [0.4, 0], [0.42, 0.09], [0.28, 0.2], [0.17, 0.55], [0.3, 0.72], [0.34, 0.92], [0.2, 0.9], [0.1, 1.0], [0.1, 1.1], [0, 1.14]],
  k: [[0, 0], [0.41, 0], [0.43, 0.09], [0.3, 0.2], [0.19, 0.55], [0.3, 0.7], [0.3, 0.84], [0.16, 0.86], [0, 0.88]],
};

function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal') out.deleteAttribute(name);
  }
  out.computeVertexNormals(); // non-indexed: flat, low-poly shading
  return out;
}

function lathe(type: Exclude<PieceType, 'n'>): THREE.BufferGeometry {
  const pts = PROFILES[type].map(([r, y]) => new THREE.Vector2(r, y));
  return clean(new THREE.LatheGeometry(pts, 12));
}

function knightGeometry(): THREE.BufferGeometry {
  // Horse silhouette facing +x, drawn in the x/y plane, extruded sideways.
  const s = new THREE.Shape();
  s.moveTo(-0.28, 0.12);
  s.lineTo(-0.2, 0.5);
  s.lineTo(-0.1, 0.82);
  s.lineTo(0.0, 0.92);
  s.lineTo(0.08, 1.0);
  s.lineTo(0.14, 0.9);
  s.lineTo(0.42, 0.68);
  s.lineTo(0.44, 0.56);
  s.lineTo(0.2, 0.52);
  s.lineTo(0.08, 0.38);
  s.lineTo(0.3, 0.12);
  s.closePath();
  const body = new THREE.ExtrudeGeometry(s, {
    depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 1,
  });
  body.translate(0, 0.1, -0.11);
  const base = new THREE.LatheGeometry(
    [[0, 0], [0.38, 0], [0.4, 0.08], [0.3, 0.16], [0, 0.18]].map(([r, y]) => new THREE.Vector2(r, y)),
    12,
  );
  return mergeGeometries([clean(body), clean(base)])!;
}

function kingGeometry(): THREE.BufferGeometry {
  const parts = [lathe('k')];
  const v = new THREE.BoxGeometry(0.1, 0.32, 0.1); v.translate(0, 1.04, 0);
  const h = new THREE.BoxGeometry(0.28, 0.1, 0.1); h.translate(0, 1.06, 0);
  parts.push(clean(v), clean(h));
  return mergeGeometries(parts)!;
}

const geoCache = new Map<PieceType, THREE.BufferGeometry>();
export function pieceGeometry(type: PieceType): THREE.BufferGeometry {
  let g = geoCache.get(type);
  if (!g) {
    g = type === 'n' ? knightGeometry() : type === 'k' ? kingGeometry() : lathe(type);
    geoCache.set(type, g);
  }
  return g;
}

const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 175, 255]), 3, 1, THREE.RedFormat);
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
  const t = new THREE.CanvasTexture(c);
  return t;
})();
const blobGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false });
const ringGeo = new THREE.TorusGeometry(0.42, 0.035, 6, 24).rotateX(Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });

interface Realm { color: number; emissive: number; intensity: number }
const LOOK: Record<BoardId, [Realm, Realm]> = {
  0: [
    { color: 0xf1e6c8, emissive: 0x000000, intensity: 0 },
    { color: 0x34343f, emissive: 0x000000, intensity: 0 },
  ],
  1: [
    { color: 0xffd9a0, emissive: 0xff6a1a, intensity: 0.65 },
    { color: 0x8a52ff, emissive: 0x6a1fd0, intensity: 0.85 },
  ],
};
const OUTLINE = [0xfff2b0, 0xb08cff];

export interface PieceView extends THREE.Group {
  userData: { type: PieceType; body: THREE.Mesh; outline: THREE.Mesh; ring: THREE.Mesh };
}

export function createPieceView(piece: Piece, board: BoardId): PieceView {
  const group = new THREE.Group() as PieceView;
  const body = new THREE.Mesh(
    pieceGeometry(piece.type),
    new THREE.MeshToonMaterial({ gradientMap: gradient }),
  );
  const outline = new THREE.Mesh(
    body.geometry,
    new THREE.MeshBasicMaterial({
      color: OUTLINE[piece.color], transparent: true, opacity: 0.3,
      depthFunc: THREE.GreaterDepth, depthWrite: false,
    }),
  );
  outline.renderOrder = 5;
  outline.scale.setScalar(1.03);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05;
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.position.y = 0.012;
  group.add(blob, body, outline, ring);
  group.userData = { type: piece.type, body, outline, ring };
  updatePieceView(group, piece, board);
  return group;
}

/** Brings a view in line with the piece (type after promotion, realm look, risen ring). */
export function updatePieceView(view: PieceView, piece: Piece, board: BoardId): void {
  const u = view.userData;
  if (u.type !== piece.type) {
    u.type = piece.type;
    u.body.geometry = pieceGeometry(piece.type);
    u.outline.geometry = u.body.geometry;
  }
  const look = LOOK[board][piece.color];
  const m = u.body.material as THREE.MeshToonMaterial;
  m.color.setHex(look.color);
  m.emissive.setHex(look.emissive);
  m.emissiveIntensity = look.intensity;
  u.ring.visible = piece.risen;
  // Knights face the opponent.
  u.body.rotation.y = u.outline.rotation.y = piece.type === 'n' ? (piece.color === 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
}

export function makeGhost(piece: { type: PieceType; color: 0 | 1 }, board: BoardId): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: LOOK[board][piece.color].color, transparent: true, opacity: 0.45,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(pieceGeometry(piece.type), mat);
  mesh.renderOrder = 20;
  if (piece.type === 'n') mesh.rotation.y = piece.color === 0 ? Math.PI / 2 : -Math.PI / 2;
  g.add(mesh);
  return g;
}
