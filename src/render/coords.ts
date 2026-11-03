import * as THREE from 'three';
import type { BoardId } from '../rules';

/** Vertical distance between the two boards in world space. */
export const BOARD_GAP = 14;

/** World-space x/z of a square's center. */
export const squareToXZ = (square: number): [number, number] => [(square & 7) - 3.5, 3.5 - (square >> 3)];

/** World-space y of a board's surface. */
export const boardY = (board: BoardId): number => (board === 1 ? -BOARD_GAP : 0);

/** World-space point above a square. */
export function squarePoint(board: BoardId, square: number, height = 0): THREE.Vector3 {
  const [x, z] = squareToXZ(square);
  return new THREE.Vector3(x, boardY(board) + height, z);
}

export interface Rect { x: number; y: number; w: number; h: number }
