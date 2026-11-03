import * as THREE from 'three';
import { Pose, Rig } from './rig';

/**
 * Sprite baker: renders a posed low-poly model from the 8 Doom viewing angles at pixel-art
 * resolution (no antialiasing, toon bands), Dead Cells style. The output sheet has the same layout
 * as the CC0 sheets in art/sprites: one row per frame, one 128px cell per angle, cyan background.
 */

export type Row = { pose: Pose } | { poses: Pose[] };

export interface Character {
  /** Sheet name: art/sprites/baked/<name>.png */
  name: string;
  /** On-board height of the standing front view, in squares. */
  height: number;
  build(): Rig;
  /** Top to bottom. `pose`: one frame drawn from all 8 angles. `poses`: single-angle frames (deaths). */
  rows: Row[];
  /** Animations as lists of 1-based rows, and the step where each attack lands. */
  tags: Record<string, number[]>;
  contact: Record<string, number>;
  /** Unlit colors that keep their own color on every team: fire, flashes, blood. */
  keep: number[];
}

/** Sidecar data the sprite builder needs to cut the sheet. */
export interface BakedSheetMeta {
  cell: { w: number; h: number };
  anchor: { x: number; y: number };
  rows: number[];
  tags: Record<string, number[]>;
  contact: Record<string, number>;
  keep: string[];
  height: number;
}

const CELL = 64; // Wolfenstein's sprite size
const ANCHOR = { x: 32, y: 59 }; // where the feet land in every cell
const PIXELS_PER_SQUARE = 36; // matches the game's PixelPass, so a texel is about one screen pixel
const ELEVATION = 25 * (Math.PI / 180);
const DEATH_VIEW = 1; // single-angle frames are drawn from the front-left
const CYAN = '#00ffff';

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(CELL, CELL);
renderer.setClearColor(0x000000, 0);

// The lights stay put while the model turns, so every angle is lit from the viewer's upper left
// (warm key) with a cool rim from behind on the right, which keeps silhouettes readable.
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const key = new THREE.DirectionalLight(0xfff2e0, 3.1);
key.position.set(-2, 1.7, 1.3);
const rim = new THREE.DirectionalLight(0xa8c0ff, 1.1);
rim.position.set(1.8, 1.2, -1.4);
scene.add(key, rim);

function cameraFor(pixelsPerUnit: number): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(
    -ANCHOR.x / pixelsPerUnit, (CELL - ANCHOR.x) / pixelsPerUnit,
    ANCHOR.y / pixelsPerUnit, -(CELL - ANCHOR.y) / pixelsPerUnit, 0.1, 100,
  );
  camera.position.set(0, Math.sin(ELEVATION) * 30, Math.cos(ELEVATION) * 30);
  camera.lookAt(0, 0, 0);
  return camera;
}

const toHex = (color: number) => '#' + color.toString(16).padStart(6, '0');

/** Bounds of the visible meshes only (hidden props such as a raised meteor must not change the scale). */
function visibleBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
  });
  return bounds;
}

export function bakeCharacter(character: Character): { png: string; meta: BakedSheetMeta } {
  const rig = character.build();
  rig.freeze();
  scene.add(rig.root);

  // Scale so the standing pose comes out `height` squares tall at the game's pixel density.
  const idle = character.rows[character.tags.idle[0] - 1] as { pose: Pose };
  rig.pose(idle.pose);
  const bounds = visibleBounds(rig.root);
  const camera = cameraFor((PIXELS_PER_SQUARE * character.height) / (bounds.max.y - bounds.min.y));

  const sheet = document.createElement('canvas');
  sheet.width = CELL * 8;
  sheet.height = CELL * character.rows.length;
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = CYAN;
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  const draw = (pose: Pose, view: number, column: number, row: number) => {
    rig.pose(pose);
    rig.root.rotation.y = -view * (Math.PI / 4);
    renderer.render(scene, camera);
    ctx.drawImage(renderer.domElement, column * CELL, row * CELL);
  };
  character.rows.forEach((row, r) => {
    if ('pose' in row) for (let view = 0; view < 8; view++) draw(row.pose, view, view, r);
    else row.poses.forEach((pose, i) => draw(pose, DEATH_VIEW, i, r));
  });
  scene.remove(rig.root);

  return {
    png: sheet.toDataURL('image/png'),
    meta: {
      cell: { w: CELL, h: CELL },
      anchor: ANCHOR,
      rows: character.rows.map((row) => ('pose' in row ? 8 : 0)),
      tags: character.tags,
      contact: character.contact,
      keep: character.keep.map(toHex),
      height: character.height,
    },
  };
}
