import * as THREE from 'three';
import type { BoardId, Piece } from '../rules';
import { squareToXZ } from './coords';
import { makeGhost } from './pieces';

interface BoardSquare { b: BoardId; sq: number }

/** Everything the board highlights: selection, move targets, previews and tutorial hints. */
export interface MarkerSet {
  selected?: BoardSquare;
  quiet: BoardSquare[];
  capture: BoardSquare[];
  /** Squares the fallen victim will attack. */
  attack: BoardSquare[];
  /** Own pieces under attack. */
  threat: BoardSquare[];
  ghosts: { b: BoardId; sq: number; type: Piece['type']; color: 0 | 1 }[];
  rise?: { b: BoardId; sq: number; check: boolean };
  /** Tutorial hints: the square to tap next. */
  hints: BoardSquare[];
}

export const emptyMarkers = (): MarkerSet => ({ quiet: [], capture: [], attack: [], threat: [], ghosts: [], hints: [] });

const COLOR = {
  quiet: 0x4cf0a0,
  capture: 0xff4040,
  attack: 0xff3030,
  threat: 0xff2a2a,
  selected: 0xffe14a,
  hint: 0xffd24a,
  riseSafe: 0x7ad0ff,
  riseCheck: 0xff4040,
};

/** A flat, always-on-top decal lying on the board. */
function flatDecal(geometry: THREE.BufferGeometry, color: number, opacity = 0.9): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 10;
  return mesh;
}

/** Rebuilds the marker meshes for each board from scratch. */
export function fillMarkers(markerGroups: THREE.Group[], markers: MarkerSet): void {
  for (const group of markerGroups) group.clear();

  const place = (target: BoardSquare, object: THREE.Object3D, height = 0.04) => {
    const [x, z] = squareToXZ(target.sq);
    object.position.set(x, height, z);
    markerGroups[target.b].add(object);
  };

  const dot = new THREE.CircleGeometry(0.17, 16);
  const captureRing = new THREE.RingGeometry(0.34, 0.45, 24);
  const selectionRing = new THREE.RingGeometry(0.4, 0.49, 24);
  const attackSquare = new THREE.PlaneGeometry(0.34, 0.34);
  const threatDiamond = new THREE.RingGeometry(0.3, 0.46, 4, 1, Math.PI / 4);
  const hintRing = new THREE.RingGeometry(0.43, 0.56, 28);
  const hintDisc = new THREE.CircleGeometry(0.43, 24);
  const riseRing = new THREE.RingGeometry(0.3, 0.5, 24);

  for (const target of markers.quiet) place(target, flatDecal(dot, COLOR.quiet));
  for (const target of markers.capture) place(target, flatDecal(captureRing, COLOR.capture));
  for (const target of markers.attack) place(target, flatDecal(attackSquare, COLOR.attack, 0.6));
  for (const target of markers.threat) place(target, flatDecal(threatDiamond, COLOR.threat, 0.95));
  if (markers.selected) place(markers.selected, flatDecal(selectionRing, COLOR.selected));
  for (const target of markers.hints) {
    place(target, flatDecal(hintRing, COLOR.hint, 1), 0.05);
    place(target, flatDecal(hintDisc, COLOR.hint, 0.25), 0.045);
  }
  if (markers.rise) {
    place(markers.rise, flatDecal(riseRing, markers.rise.check ? COLOR.riseCheck : COLOR.riseSafe));
  }
  for (const ghost of markers.ghosts) place(ghost, makeGhost(ghost, ghost.b), 0);
}
