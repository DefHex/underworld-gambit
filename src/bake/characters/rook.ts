import * as THREE from 'three';
import { around, box, cone, cyl, part, pleatedLathe } from '../../render/modeling';
import type { Character } from '../bake';
import { flinch, humanoid } from '../humanoid';
import { BAKE_GRADIENT, Pose, Rig, combine, glowBurst } from '../rig';

// The Rook: a hopping brick tower with a fire wizard on its battlements.

const MORTAR = '#4a3a2e', BRICKS = ['#9a5a3a', '#8a4e32', '#a8653f', '#93573a'];
const STONE = 0x8a7a6a, DOOR = 0x3a2414, SLIT = 0x101010, BANNER = 0x8a2a2a, POLE = 0x5a4a3a;
const ROBE = 0x3048a0, SKIN = 0xe8b898, BEARD = 0xeeeae2, STAR = 0xe8c840;
const FIRE = 0xff8a20, FIRE_TIPS = 0xffe060;
const TOWER_HEIGHT = 1.2, SPLIT = 0.62, RADIUS = 0.5;
const WIZARD = 0.62; // wizard size relative to a full figure

/** 32px brick wall texture: 8x4 bricks with 1px mortar, each row offset by half a brick. */
function brickTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = MORTAR;
  ctx.fillRect(0, 0, 32, 32);
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 4; col++) {
      ctx.fillStyle = BRICKS[(row * 3 + col + 4) % BRICKS.length];
      ctx.fillRect(col * 8 + (row % 2) * 4 + 1, row * 4 + 1, 7, 3);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function brickCylinder(texture: THREE.Texture, bottom: number, top: number, height: number, repeatY: number): THREE.Mesh {
  const map = texture.clone();
  map.repeat.set(1.8, repeatY);
  map.needsUpdate = true;
  const geometry = new THREE.CylinderGeometry(top, bottom, height, 16, 1, true).translate(0, height / 2, 0);
  return new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ map, gradientMap: BAKE_GRADIENT, side: THREE.DoubleSide }));
}

/** A mound of loose bricks for the end of the death (fixed layout, no randomness). */
function rubble(): THREE.BufferGeometry[] {
  const bricks = [
    [0, 0.05, 0, 0.3], [0.2, 0.05, 0.1, 1.2], [-0.22, 0.05, 0.05, 2.1], [0.05, 0.05, 0.25, 0.7], [-0.1, 0.05, -0.2, 1.7],
    [0.25, 0.05, -0.15, 2.6], [0.05, 0.15, 0.05, 0.9], [-0.12, 0.15, 0.1, 2.9], [0.15, 0.15, -0.05, 1.5], [0.35, 0.05, 0.2, 0.4],
    [-0.35, 0.05, -0.1, 1.1], [0, 0.24, 0, 2.3],
  ];
  return [
    cyl(0.2, 0.48, 0.14, 0x5a4a3e, { y: 0.07 }, 10),
    ...bricks.map(([x, y, z, turn], i) => box(0.22, 0.1, 0.12, Number.parseInt(BRICKS[i % BRICKS.length].slice(1), 16), { x, y, z, ry: turn })),
  ];
}

function build(): Rig {
  const rig = new Rig();
  const texture = brickTexture();
  rig.joint('tower', null);
  rig.joint('lower', 'tower');
  // The stone (bricks, plinth, battlements, rubble) takes the team color; the wizard keeps his blue.
  rig.attachObject('lower', brickCylinder(texture, RADIUS + 0.02, RADIUS, SPLIT, 0.4), { team: true });
  rig.attach('lower', [cyl(RADIUS + 0.08, RADIUS + 0.1, 0.1, STONE, { y: 0.05 }, 16)], { team: true });
  rig.attach('lower', [
    box(0.26, 0.36, 0.08, DOOR, { y: 0.18, z: RADIUS - 0.01 }),
    cyl(0.13, 0.13, 0.08, DOOR, { y: 0.36, z: RADIUS - 0.01, rx: Math.PI / 2 }, 8),
  ]);
  rig.joint('crack', 'lower', 0, 0, 0, true);
  rig.attach('crack', [
    box(0.04, 0.28, 0.04, SLIT, { x: 0.18, y: 0.45, z: RADIUS - 0.04, rz: 0.4 }),
    box(0.04, 0.22, 0.04, SLIT, { x: 0.12, y: 0.22, z: RADIUS - 0.01, rz: -0.3 }),
  ]);
  rig.joint('upper', 'tower', 0, SPLIT, 0);
  const upperHeight = TOWER_HEIGHT - SPLIT;
  rig.attachObject('upper', brickCylinder(texture, RADIUS, RADIUS - 0.02, upperHeight, 0.36), { team: true });
  rig.attach('upper', [
    cyl(RADIUS + 0.08, RADIUS - 0.02, 0.12, STONE, { y: upperHeight + 0.02 }, 16),
    cyl(RADIUS + 0.06, RADIUS + 0.06, 0.04, STONE, { y: upperHeight + 0.08 }, 16),
    ...around(8, RADIUS + 0.02, (x, z, angle) => box(0.2, 0.2, 0.14, STONE, { x, y: upperHeight + 0.2, z, ry: angle })),
  ], { team: true });
  rig.attach('upper', [
    box(0.06, 0.18, 0.04, SLIT, { y: 0.28, z: RADIUS - 0.01 }),
    cyl(0.025, 0.025, 0.7, POLE, { x: -0.3, y: upperHeight + 0.45, z: -0.3 }, 4),
    box(0.02, 0.18, 0.3, BANNER, { x: -0.3, y: upperHeight + 0.7, z: -0.15 }),
  ]);
  // The wizard stands on the battlements (on the tower, not the upper half, so he can fall clear of it).
  humanoid(rig, 'tower', { skin: SKIN, shirt: ROBE, pants: ROBE, boots: 0x20203a }, { y: TOWER_HEIGHT + 0.06, scale: WIZARD });
  const s = WIZARD;
  rig.joint('skirt', 'hips', 0, 0.06 * s, 0);
  rig.attach('skirt', [pleatedLathe([[0.2 * s, 0], [0.28 * s, -0.4 * s], [0.36 * s, -0.96 * s], [0, -0.96 * s]], ROBE, 7, 0.12)]);
  rig.joint('hat', 'head', 0, 0.36 * s, 0);
  rig.attach('hat', [
    cyl(0.36 * s, 0.36 * s, 0.04 * s, ROBE, {}, 12),
    cone(0.22 * s, 0.7 * s, ROBE, { y: 0.34 * s, z: -0.06 * s, rx: -0.25 }, 8),
    box(0.1 * s, 0.1 * s, 0.04 * s, STAR, { y: 0.18 * s, z: 0.17 * s }),
  ]);
  rig.attach('head', [cone(0.16 * s, 0.5 * s, BEARD, { y: -0.08 * s, z: 0.12 * s, rx: Math.PI })]);
  rig.joint('fire', 'handR', 0, -0.12 * s, 0.05 * s, true);
  rig.attachObject('fire', glowBurst(0.14, FIRE, FIRE_TIPS));
  rig.joint('meteor', 'tower', 0, TOWER_HEIGHT + 1.45, 0, true);
  rig.attachObject('meteor', glowBurst(0.3, FIRE, FIRE_TIPS));
  rig.joint('rubble', null, 0, 0, 0, true);
  rig.attach('rubble', rubble(), { team: true });
  return rig;
}

const ready: Pose = { armR: { rx: -25 }, foreR: { rx: -70 }, fire: { show: true, s: 0.55 }, armL: { rz: 20 }, foreL: { rx: -30 } };
const holdHat: Pose = { armL: { rx: -170, rz: 10 }, foreL: { rx: -50 } };
const idle = ready;
const hop: Pose[] = [
  combine(ready, { tower: { sy: 0.86, sx: 1.07, sz: 1.07 }, hips: { y: -0.04 } }),
  combine(ready, holdHat, { tower: { y: 0.14, sy: 1.08, sx: 0.95, sz: 0.95 } }),
  combine(ready, holdHat, { tower: { y: 0.3 }, legL: { rx: -20 }, shinL: { rx: 30 } }),
  combine(ready, { tower: { y: 0.03, sy: 0.92, sx: 1.05, sz: 1.05 }, hips: { y: -0.02 } }),
];
const fireball: Pose[] = [
  { armR: { rx: 45, rz: -15 }, foreR: { rx: -70 }, fire: { show: true }, spine: { ry: 25, rx: -8 }, armL: { rx: -60 } },
  { armR: { rx: -105 }, foreR: { rx: -5 }, fire: { show: true, s: 1.2 }, spine: { ry: -12, rx: 14 }, armL: { rx: 20 } },
  { armR: { rx: -70 }, foreR: { rx: -10 }, spine: { rx: 10 } },
];
const meteor: Pose[] = [
  { armL: { rx: -172, rz: 15 }, armR: { rx: -172, rz: -15 }, meteor: { show: true }, head: { rx: -15 } },
  { armL: { rx: -100 }, armR: { rx: -100 }, meteor: { show: true, z: 0.55, y: -0.5, s: 1.15 }, spine: { rx: 15 } },
  { armL: { rx: -45 }, armR: { rx: -45 }, spine: { rx: 8 } },
];
const hurt = combine(flinch, { tower: { rz: 7 }, crack: { show: true } });
const death: Pose[] = [
  combine(flinch, { crack: { show: true }, upper: { rz: -4 } }),
  { crack: { show: true }, upper: { rz: -14, x: 0.06 }, armL: { rx: -160 }, armR: { rx: -160 }, hips: { x: 0.08 } },
  { crack: { show: true }, upper: { rz: -40, x: 0.25, y: -0.1 }, hips: { x: 0.45, y: -0.3, rz: -50 }, armL: { rx: -150 }, armR: { rx: -120 } },
  { crack: { show: true }, upper: { rz: -82, x: 0.55, y: -0.45 }, lower: { sy: 0.85 }, rubble: { show: true, s: 0.6 }, hips: { x: 0.7, y: -0.85, rz: -85 }, hat: { x: 0.2, y: -0.2 } },
  { upper: { show: false }, lower: { sy: 0.45 }, rubble: { show: true }, hips: { x: 0.55, y: -1.0, rz: -90 }, hat: { x: 0.35, y: -0.45, rz: -60 } },
  { upper: { show: false }, lower: { sy: 0.35 }, rubble: { show: true, sy: 0.9 }, hips: { x: 0.55, y: -1.05, rz: -90 }, hat: { x: 0.45, y: -0.55, rz: -80 } },
];

export const rook: Character = {
  name: 'rook',
  height: 1.15,
  build,
  rows: [
    { pose: idle }, ...hop.map((pose) => ({ pose })),
    ...fireball.map((pose) => ({ pose })), ...meteor.map((pose) => ({ pose })),
    { pose: hurt }, { poses: death },
  ],
  tags: { idle: [1], move: [2, 3, 4, 5], atk_a: [6, 7, 8], atk_b: [9, 10, 11], hurt: [12], death: [13] },
  contact: { atk_a: 1, atk_b: 1 },
  keep: [FIRE, FIRE_TIPS],
};
