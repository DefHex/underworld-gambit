import * as THREE from 'three';
import { around, ball, box, cone, cyl, lathe, part, pleat, pleatedLathe, ring } from '../../render/modeling';
import type { Character } from '../bake';
import { collapse, flinch, humanoid, robeSway, walkCycle } from '../humanoid';
import { Pose, Rig, combine } from '../rig';

// The King: crown, ermine-trimmed robe and cape, white beard and a broadsword.

const ROBE = 0x8a1c24, ERMINE = 0xf4f0e8, SPOT = 0x18141a, GOLD = 0xe8b830, SKIN = 0xe0b090;
const BEARD = 0xdedad2, STEEL = 0xd8dde6, GRIP = 0x5a3a22, JEWEL = 0x3050c0;
const FACE_Y = 0.22; // head center, in head-joint coordinates

/** Ermine: white fur with black tail tips, as a band of spots around radius r. */
const ermineSpots = (count: number, r: number, y: number) => around(count, r, (x, z) => box(0.05, 0.06, 0.05, SPOT, { x, y, z }));

function build(): Rig {
  const rig = new Rig();
  humanoid(rig, null, { skin: SKIN, shirt: ROBE, pants: ROBE, boots: 0x3a2418, hair: BEARD, team: ['shirt', 'sleeves', 'pants'] });
  rig.joint('skirt', 'hips', 0, 0.06, 0);
  rig.attach('skirt', [pleatedLathe([[0.2, 0], [0.26, -0.26], [0.34, -0.66], [0.4, -0.96], [0, -0.96]], ROBE, 8, 0.1)], { team: true });
  rig.attach('skirt', [
    lathe([[0.405, -0.82], [0.415, -0.96], [0.3, -0.96], [0.31, -0.82]], ERMINE, 12),
    ...ermineSpots(8, 0.41, -0.89),
  ]);
  rig.attach('hips', [box(0.42, 0.07, 0.26, GOLD, { y: 0.05 })]);
  const cape = pleat(new THREE.CylinderGeometry(0.26, 0.48, 1.3, 24, 1, true, Math.PI / 2, Math.PI), 7, 0.08);
  rig.attach('spine', [part(cape, ROBE, { y: -0.12, z: -0.02 })], { team: true });
  rig.attach('spine', [
    ring(0.22, 0.08, ERMINE, { y: 0.52 }),
    ...ermineSpots(6, 0.26, 0.52),
  ]);
  rig.attach('head', [
    cone(0.15, 0.32, BEARD, { y: FACE_Y - 0.24, z: 0.11, rx: Math.PI }),
    box(0.22, 0.05, 0.05, BEARD, { y: FACE_Y - 0.06, z: 0.17 }),
  ]);
  rig.joint('crown', 'head', 0, FACE_Y + 0.15, 0);
  rig.attach('crown', [
    cyl(0.2, 0.19, 0.11, GOLD, {}, 10),
    ...around(5, 0.18, (x, z) => cone(0.05, 0.16, GOLD, { x, y: 0.12, z }, 4)),
    ...around(5, 0.2, (x, z) => ball(0.03, JEWEL, { x, z }, 4, 3)),
  ]);
  rig.joint('sword', 'handR', 0, -0.05, 0);
  rig.attach('sword', [
    box(0.06, 0.75, 0.1, STEEL, { y: 0.5 }),
    cone(0.06, 0.14, STEEL, { y: 0.94 }, 4),
    box(0.32, 0.06, 0.08, GOLD, { y: 0.1 }),
    cyl(0.035, 0.035, 0.16, GRIP, {}, 5),
    ball(0.05, GOLD, { y: -0.1 }, 5, 4),
  ]);
  rig.setRest('sword', 90, 0, 0); // blade forward when the arm hangs
  return rig;
}

const hold: Pose = { armR: { rx: -10 }, foreR: { rx: -75 } };
const idle = combine(hold, { armL: { rx: -5 } });
const walk = robeSway(walkCycle(18, 14)).map((frame) => combine(frame, hold));
const cleave: Pose[] = [
  { armR: { rx: -175, rz: 10 }, foreR: { rx: -35 }, spine: { rx: -12 }, armL: { rx: -35 }, head: { rx: -8 } },
  { armR: { rx: -85 }, foreR: { rx: -15 }, sword: { rx: -25 }, spine: { rx: 22 }, armL: { rx: 25 }, hips: { y: -0.04 } },
  { armR: { rx: -35 }, foreR: { rx: -5 }, sword: { rx: -55 }, spine: { rx: 28 }, armL: { rx: 30 }, hips: { y: -0.06 } },
];
const sweep: Pose[] = [
  { spine: { ry: 45 }, armR: { rx: -60, rz: -70 }, foreR: { rx: -10 }, armL: { rx: -20, rz: 20 } },
  { spine: { ry: -10 }, armR: { rx: -90 }, foreR: { rx: -5 }, sword: { rx: -20 }, armL: { rz: 30 } },
  { spine: { ry: -50 }, armR: { rx: -75, rz: 55 }, foreR: { rx: -10 }, armL: { rz: 35 } },
];
const hurt = combine(flinch, { foreR: { rx: -40 } });
const [fold, kneel, slump, flat] = collapse();
const death: Pose[] = [
  hurt,
  combine(fold, { foreR: { rx: -30 }, crown: { y: 0.05, rx: -20 } }),
  combine(kneel, { sword: { show: false }, crown: { y: 0.1, z: 0.15, rx: -40 } }),
  combine(slump, { sword: { show: false }, crown: { y: -0.4, z: 0.55, rx: -80 } }),
  combine(flat, { sword: { show: false }, crown: { y: -0.6, z: 0.3, rx: -95 } }),
  combine(flat, { sword: { show: false }, hips: { y: -0.8 }, crown: { y: -0.62, z: 0.25, rx: -100 } }),
];

export const king: Character = {
  name: 'king',
  height: 1.15,
  build,
  rows: [
    { pose: idle }, ...walk.map((pose) => ({ pose })),
    ...cleave.map((pose) => ({ pose })), ...sweep.map((pose) => ({ pose })),
    { pose: hurt }, { poses: death },
  ],
  tags: { idle: [1], move: [2, 3, 4, 5], atk_a: [6, 7, 8], atk_b: [9, 10, 11], hurt: [12], death: [13] },
  contact: { atk_a: 1, atk_b: 1 },
  keep: [],
};
