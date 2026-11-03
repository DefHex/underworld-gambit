import * as THREE from 'three';
import { OVER } from '../rules';
import type { BoardId } from '../rules';
import { squareToXZ } from './coords';
import { buildGildedFrame, buildHeavenGround, buildHellFrame, buildHellGround } from './decor';
import { addBoneFieldModels, buildTerrainProps, tileMaterial } from './terrain';

const tileGeometry = new THREE.BoxGeometry(0.98, 0.3, 0.98);

/** The parts of a board that never change: frame, ground and lights. */
export function buildBoardScene(board: THREE.Group, boardId: BoardId): void {
  if (boardId === OVER) {
    board.add(buildGildedFrame(), buildHeavenGround());
    board.add(new THREE.HemisphereLight(0xfff4de, 0xb0a080, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-6, 12, 5);
    board.add(sun);
  } else {
    board.add(buildHellFrame(), buildHellGround());
    board.add(new THREE.HemisphereLight(0xa890d8, 0x301018, 1.5));
    const ember = new THREE.PointLight(0xff5a1a, 32, 26, 1.4);
    ember.position.set(0, 3, 0);
    board.add(ember);
    const rim = new THREE.DirectionalLight(0xb080ff, 1.2);
    rim.position.set(5, 8, -4);
    board.add(rim);
  }
}

/**
 * The 64 tiles and terrain features of a board painted from a terrain map. `onLoaded` runs when
 * the Underworld's bone-field models have streamed in.
 */
export function buildTerrain(boardId: BoardId, map: string[], onLoaded: () => void): THREE.Group {
  const isOverworld = boardId === OVER;
  const terrain = new THREE.Group();
  for (let square = 0; square < 64; square++) {
    const tile = new THREE.Mesh(tileGeometry, tileMaterial(isOverworld, map, square));
    const [x, z] = squareToXZ(square);
    tile.position.set(x, -0.15, z);
    terrain.add(tile);
  }
  terrain.add(buildTerrainProps(isOverworld, map));
  if (!isOverworld) void addBoneFieldModels(terrain, map).then(onLoaded);
  return terrain;
}

/** Frees the geometry a terrain built for itself (tiles, materials and models are shared). */
export function disposeTerrain(terrain: THREE.Group): void {
  terrain.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.ownsGeometry) object.geometry.dispose();
  });
}
