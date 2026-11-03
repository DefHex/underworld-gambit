import * as THREE from 'three';
import type { BoardId, Piece, PieceType } from '../rules';
import { spriteSheet } from './sprites/sheets';
import { SpriteBody } from './sprites/sprite-body';

// A piece on the board: its pixel-art sprite, a soft blob shadow and the ring that marks a risen piece.

/** Flat team colors for effects that need one (debris and the like). */
export interface Palette { base: number; trim: number; dark: number; accent: number; metal: number }
export const PAL: [Palette, Palette] = [
  { base: 0xf2e8cc, trim: 0xe0b040, dark: 0x7a5f35, accent: 0xc23b3b, metal: 0xd7dde6 },
  { base: 0x3d3b4c, trim: 0xb8c0e0, dark: 0x14131b, accent: 0xa05cff, metal: 0x8d96ad },
];

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

export interface PieceView extends THREE.Group {
  userData: { type: PieceType; color: 0 | 1; body: SpriteBody; ring: THREE.Mesh; blob: THREE.Mesh };
}

/** Everything faces the opponent: white looks toward -z, black toward +z. */
const facingYaw = (color: 0 | 1) => (color === 0 ? Math.PI : 0);

export function createPieceView(piece: Piece, board: BoardId): PieceView {
  const group = new THREE.Group() as PieceView;
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05;
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.position.y = 0.012;
  const body = new SpriteBody(spriteSheet(piece.type));
  group.add(blob, body, ring);
  group.userData = { type: piece.type, color: piece.color, body, ring, blob };
  updatePieceView(group, piece, board);
  return group;
}

/** Brings a view in line with the piece (type after promotion, realm look, risen ring). */
export function updatePieceView(view: PieceView, piece: Piece, board: BoardId): void {
  const u = view.userData;
  if (u.type !== piece.type) {
    view.remove(u.body);
    u.body = new SpriteBody(spriteSheet(piece.type));
    view.add(u.body);
  }
  u.type = piece.type;
  u.color = piece.color;
  u.body.setLook(piece.color, board);
  u.body.pose('idle');
  u.body.rotation.y = facingYaw(piece.color);
  u.ring.visible = piece.risen;
}

/** See-through preview of where a captured piece will land. */
export function makeGhost(piece: { type: PieceType; color: 0 | 1 }, board: BoardId): THREE.Group {
  const group = new THREE.Group();
  const ghost = new SpriteBody(spriteSheet(piece.type), { ghost: true });
  ghost.setLook(piece.color, board);
  ghost.pose('idle');
  ghost.rotation.y = facingYaw(piece.color);
  group.add(ghost);
  return group;
}
