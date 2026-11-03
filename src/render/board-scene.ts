import * as THREE from 'three';
import { OVER } from '../rules';
import type { BoardId } from '../rules';
import { squareToXZ } from './coords';
import { buildGildedFrame, buildHeavenGround, buildHellFrame, buildHellGround } from './decor';
import { buildTerrainProps, tileMaterial } from './terrain';

function addOverworldScenery(board: THREE.Group): void {
  board.add(buildGildedFrame(), buildHeavenGround(), buildTerrainProps(true));
  board.add(new THREE.HemisphereLight(0xfff4de, 0xb0a080, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-6, 12, 5);
  board.add(sun);
}

function addUnderworldScenery(board: THREE.Group): void {
  board.add(buildHellFrame(), buildHellGround(), buildTerrainProps(false));
  board.add(new THREE.HemisphereLight(0xa890d8, 0x301018, 1.5));
  const ember = new THREE.PointLight(0xff5a1a, 32, 26, 1.4);
  ember.position.set(0, 3, 0);
  board.add(ember);
  const rim = new THREE.DirectionalLight(0xb080ff, 1.2);
  rim.position.set(5, 8, -4);
  board.add(rim);
}

/** Fills a board group with its 64 tiles, frame, ground and lights. */
export function buildBoardScene(board: THREE.Group, boardId: BoardId): void {
  const isOverworld = boardId === OVER;
  const tileGeometry = new THREE.BoxGeometry(0.98, 0.3, 0.98);
  for (let square = 0; square < 64; square++) {
    const tile = new THREE.Mesh(tileGeometry, tileMaterial(isOverworld, square));
    const [x, z] = squareToXZ(square);
    tile.position.set(x, -0.15, z);
    board.add(tile);
  }
  if (isOverworld) addOverworldScenery(board);
  else addUnderworldScenery(board);
}
