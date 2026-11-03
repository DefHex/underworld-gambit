import * as THREE from 'three';
import { ball, box, cone, cyl, ring } from '../../render/modeling';
import type { Character } from '../bake';
import { humanoid } from '../humanoid';
import { Pose, Rig, combine, glowMaterial } from '../rig';

// The Knight: a gunslinger cowboy on a horse. Gallops, quick-draws a revolver, rears and stomps.

const COAT = 0x8a5434, MANE = 0x2a1810, MARKINGS = 0xece4d4, SADDLE = 0x4a2a14, BLANKET = 0x7a3a3a;
const SKIN = 0xe0a878, SHIRT = 0xd8c8a8, VEST = 0x5a3a20, JEANS = 0x3a5a8a, BOOTS = 0x4a2a14;
const HAT = 0xc8a070, HAT_BAND = 0x3a2414, BANDANA = 0xa04040, GUN = 0x2a2a30, ROPE = 0xb89a60;
const FLASH = 0xffe060, FLASH_EDGE = 0xffa020, BLOOD = 0xa00808;
const RIDER = 0.85; // rider size relative to a full figure
const SADDLE_TOP = 0.45; // in horse-body coordinates
const LEGS: [name: string, x: number, z: number][] = [['FL', 0.2, 0.48], ['FR', -0.2, 0.48], ['BL', 0.2, -0.5], ['BR', -0.2, -0.5]];

function buildHorse(rig: Rig): void {
  rig.joint('horse', null, 0, 1.05, 0);
  rig.attach('horse', [
    ball(0.5, COAT, { sx: 0.75, sy: 0.78, sz: 1.45 }, 12, 8),
    ball(0.34, COAT, { y: 0.04, z: 0.48 }),
    ball(0.36, COAT, { y: 0.06, z: -0.48 }),
    box(0.62, 0.06, 0.62, BLANKET, { y: 0.37, z: 0.02 }),
    box(0.44, 0.1, 0.44, SADDLE, { y: 0.41, z: 0.02 }),
    cyl(0.04, 0.05, 0.14, SADDLE, { y: 0.48, z: 0.22 }, 5),
    ring(0.12, 0.03, ROPE, { x: 0.33, y: 0.26, z: 0.22, ry: Math.PI / 2, rx: 0 }),
  ]);
  rig.joint('neck', 'horse', 0, 0.2, 0.62);
  rig.attach('neck', [
    box(0.24, 0.66, 0.3, COAT, { y: 0.3 }),
    ...[0.1, 0.25, 0.4, 0.55].map((y) => box(0.07, 0.16, 0.12, MANE, { y, z: -0.16 })),
  ]);
  rig.setRest('neck', 35, 0, 0);
  rig.joint('horseHead', 'neck', 0, 0.6, 0.02);
  rig.attach('horseHead', [
    box(0.22, 0.24, 0.5, COAT, { y: 0.0, z: 0.18 }),
    box(0.18, 0.18, 0.16, 0x5a3420, { y: -0.02, z: 0.44 }),
    box(0.07, 0.03, 0.38, MARKINGS, { y: 0.125, z: 0.22 }),
    cone(0.04, 0.12, COAT, { x: 0.07, y: 0.17, z: -0.04 }, 4),
    cone(0.04, 0.12, COAT, { x: -0.07, y: 0.17, z: -0.04 }, 4),
    box(0.03, 0.04, 0.04, 0x101010, { x: 0.115, y: 0.05, z: 0.1 }),
    box(0.03, 0.04, 0.04, 0x101010, { x: -0.115, y: 0.05, z: 0.1 }),
  ]);
  rig.setRest('horseHead', 20, 0, 0);
  rig.joint('tail', 'horse', 0, 0.16, -0.72);
  rig.attach('tail', [cone(0.1, 0.62, MANE, { y: 0.3 }, 5)]);
  rig.setRest('tail', -145, 0, 0);
  for (const [name, x, z] of LEGS) {
    rig.joint(`leg${name}`, 'horse', x, -0.15, z);
    rig.attach(`leg${name}`, [cyl(0.1, 0.08, 0.45, COAT, { y: -0.22 }, 6)]);
    rig.joint(`knee${name}`, `leg${name}`, 0, -0.45, 0);
    rig.attach(`knee${name}`, [
      cyl(0.065, 0.06, 0.4, COAT, { y: -0.2 }, 5),
      cyl(0.07, 0.07, 0.14, MARKINGS, { y: -0.36 }, 5),
      box(0.14, 0.08, 0.16, MANE, { y: -0.46, z: 0.01 }),
    ]);
  }
}

function buildRider(rig: Rig): void {
  const s = RIDER;
  humanoid(rig, 'horse', { skin: SKIN, shirt: SHIRT, pants: JEANS, boots: BOOTS }, { y: SADDLE_TOP - 0.92 * s, scale: s });
  rig.attach('spine', [
    box(0.42 * s, 0.42 * s, 0.27 * s, VEST, { y: 0.28 * s }),
    box(0.2 * s, 0.12 * s, 0.06 * s, BANDANA, { y: 0.5 * s, z: 0.13 * s }),
  ]);
  rig.joint('hat', 'head', 0, 0.37 * s, 0);
  rig.attach('hat', [
    cyl(0.4 * s, 0.4 * s, 0.05 * s, HAT, {}, 12),
    cyl(0.18 * s, 0.22 * s, 0.24 * s, HAT, { y: 0.13 * s }, 8),
    cyl(0.225 * s, 0.225 * s, 0.05 * s, HAT_BAND, { y: 0.04 * s }, 8),
  ]);
  rig.joint('gun', 'handR', 0, -0.06 * s, 0.02);
  rig.attach('gun', [
    box(0.06 * s, 0.3 * s, 0.07 * s, GUN, { y: -0.12 * s }),
    box(0.06 * s, 0.1 * s, 0.14 * s, 0x4a3020, { y: 0.02 * s, z: -0.05 * s }),
  ]);
  rig.joint('flash', 'gun', 0, -0.32 * s, 0, true);
  rig.attachObject('flash', new THREE.Mesh(new THREE.OctahedronGeometry(0.13), glowMaterial(FLASH)));
  rig.attachObject('flash', new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4).translate(0, -0.15, 0), glowMaterial(FLASH_EDGE)));
}

function build(): Rig {
  const rig = new Rig();
  buildHorse(rig);
  buildRider(rig);
  rig.joint('blood', null, 0.1, 0.01, 0, true);
  rig.attachObject('blood', new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 10), glowMaterial(BLOOD)));
  return rig;
}

/** Legs around the horse, left hand on the reins. */
const seated: Pose = {
  legL: { rx: -60, rz: 32 }, shinL: { rx: 72 }, legR: { rx: -60, rz: -32 }, shinR: { rx: 72 },
  armL: { rx: -40 }, foreL: { rx: -50 },
};
const idle = combine(seated, { armR: { rx: -12, rz: -12 }, foreR: { rx: -20 } });
type LegAngles = [hipOrShoulder: number, knee: number];
/** Swing of each leg and bend of its knee: front left, front right, back left, back right. */
const legs = (fl: LegAngles, fr: LegAngles, bl: LegAngles, br: LegAngles): Pose => Object.fromEntries(
  ([["FL", fl], ["FR", fr], ["BL", bl], ["BR", br]] as const).flatMap(([name, [swing, knee]]) => [[`leg${name}`, { rx: swing }], [`knee${name}`, { rx: knee }]]),
);
const gallop: Pose[] = [
  combine(idle, legs([-50, 0], [-32, 10], [42, -10], [28, 0]), { horse: { rx: -4, y: 0.03 }, neck: { rx: -8 }, tail: { rx: -15 }, hips: { y: -0.03 } }),
  combine(idle, legs([30, 70], [18, 50], [-28, 30], [-18, 20]), { horse: { rx: 3, y: -0.03 }, neck: { rx: 6 }, hips: { y: 0.03 } }),
  combine(idle, legs([-12, 20], [8, 30], [14, 10], [32, 0]), { horse: { y: 0.0 }, neck: { rx: 2 }, tail: { rx: -25 } }),
  combine(idle, legs([22, 85], [30, 90], [-32, 45], [-26, 40]), { horse: { y: 0.09 }, neck: { rx: -4 }, tail: { rx: -30 }, hips: { y: -0.02 } }),
];
const quickDraw: Pose[] = [
  combine(seated, { armR: { rx: -50, rz: -10 }, foreR: { rx: -85 } }),
  combine(seated, { armR: { rx: -88, rz: 4 }, foreR: { rx: 0 }, flash: { show: true }, spine: { rx: -5 } }),
  combine(seated, { armR: { rx: -135, rz: 4 }, foreR: { rx: -25 }, spine: { rx: -3 } }),
];
const rear: Pose[] = [
  combine(idle, legs([-70, 100], [-55, 110], [38, 0], [34, 0]), { horse: { rx: -38, y: 0.3, z: -0.25 }, neck: { rx: -25 }, spine: { rx: 28 }, armR: { rx: -160 }, hat: { y: -0.05 } }),
  combine(idle, legs([-18, 10], [-10, 5], [0, 0], [4, 0]), { horse: { rx: 7, y: -0.04 }, neck: { rx: 12 }, spine: { rx: -10 } }),
  combine(idle, legs([-5, 5], [0, 0], [5, 0], [0, 0]), { horse: { rx: 2 }, neck: { rx: 4 } }),
];
const hurt = combine(seated, { horse: { rx: -6 }, neck: { rx: -28 }, spine: { rx: -16 }, armR: { rx: -40, rz: -40 }, head: { rx: -20 } });
const death: Pose[] = [
  combine(hurt, { neck: { rx: -35 }, armL: { rx: -150 } }),
  combine(seated, legs([-15, 105], [-10, 110], [0, 0], [0, 0]), { horse: { rx: 16, y: -0.28 }, neck: { rx: 25 }, spine: { rx: 30 } }),
  combine(seated, { horse: { rz: 42, y: -0.38 }, hips: { x: 0.3, y: 0.12, rz: -30 }, hat: { x: 0.25, y: 0.45, rz: -60 }, armL: { rx: -150 } }),
  combine(seated, { horse: { rz: 80, y: -0.6 }, hips: { x: 0.65, y: -0.5, rz: -70 }, hat: { x: 0.5, y: 0.1, rz: -80 } }),
  combine(seated, legs([10, 10], [15, 5], [-10, 10], [-5, 5]), { horse: { rz: 88, y: -0.66 }, hips: { x: 0.8, y: -0.82, rz: -88 }, hat: { x: 0.9, y: -0.95, rz: -90 } }),
  combine(seated, legs([10, 10], [15, 5], [-10, 10], [-5, 5]), { horse: { rz: 89, y: -0.68 }, hips: { x: 0.8, y: -0.84, rz: -89 }, hat: { x: 0.9, y: -0.97, rz: -90 }, blood: { show: true } }),
];

export const knight: Character = {
  name: 'knight',
  height: 0.95,
  build,
  rows: [
    { pose: idle }, ...gallop.map((pose) => ({ pose })),
    ...quickDraw.map((pose) => ({ pose })), ...rear.map((pose) => ({ pose })),
    { pose: hurt }, { poses: death },
  ],
  tags: { idle: [1], move: [2, 3, 4, 5], atk_a: [6, 7, 8], atk_b: [9, 10, 11], hurt: [12], death: [13] },
  contact: { atk_a: 1, atk_b: 1 },
  keep: [FLASH, FLASH_EDGE, BLOOD],
};
