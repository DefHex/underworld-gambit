import * as THREE from 'three';
import { around, ball, box, cone, cyl, lathe, part, pleatedLathe } from '../../render/modeling';
import type { Character } from '../bake';
import { collapse, flinch, humanoid, robeSway, walkCycle } from '../humanoid';
import { JointPose, Pose, Rig, combine, glowBurst } from '../rig';

// The Queen: a sorceress in a wide gown with a high collar and crown, a whip and lightning in her hands.

const GOWN = 0x6a3088, BODICE = 0x3a1a4c, GOLD = 0xe0c060, SKIN = 0xf0c8a8, HAIR = 0x2a1810;
const WHIP = 0x2a1a14, JEWEL = 0xb03060;
const SPARK = 0x60c8ff, SPARK_TIPS = 0xd8f4ff;
const FACE_Y = 0.22;
const WHIP_LINKS = 6;

function build(): Rig {
  const rig = new Rig();
  humanoid(rig, null, { skin: SKIN, shirt: BODICE, sleeves: BODICE, pants: GOWN, boots: BODICE, hair: HAIR, eyes: 0x200a20 });
  rig.joint('skirt', 'hips', 0, 0.06, 0);
  rig.attach('skirt', [
    pleatedLathe([[0.2, 0], [0.3, -0.3], [0.46, -0.7], [0.56, -0.96], [0, -0.96]], GOWN, 10, 0.12),
    lathe([[0.565, -0.86], [0.57, -0.96], [0.45, -0.96], [0.46, -0.86]], GOLD, 14),
  ]);
  rig.attach('hips', [box(0.4, 0.07, 0.26, GOLD, { y: 0.07 })]);
  const collar = new THREE.CylinderGeometry(0.34, 0.16, 0.36, 12, 1, true, Math.PI / 2, Math.PI);
  rig.attach('spine', [
    part(collar, GOLD, { y: 0.66, z: -0.04 }),
    box(0.12, 0.2, 0.02, SKIN, { y: 0.44, z: 0.125, rz: Math.PI / 4 }), // neckline
    ball(0.12, GOWN, { x: 0.27, y: 0.47 }), ball(0.12, GOWN, { x: -0.27, y: 0.47 }), // puffed sleeves
  ]);
  rig.attach('head', [box(0.4, 0.6, 0.14, HAIR, { y: FACE_Y - 0.18, z: -0.12 })]);
  rig.joint('crown', 'head', 0, FACE_Y + 0.15, 0);
  rig.attach('crown', [
    cyl(0.18, 0.17, 0.07, GOLD, {}, 10),
    cone(0.06, 0.28, GOLD, { y: 0.17, z: 0.1 }, 4),
    ...around(4, 0.16, (x, z) => cone(0.04, 0.16, GOLD, { x, y: 0.1, z: z - 0.02 }, 4)),
    ball(0.045, JEWEL, { y: 0.06, z: 0.17 }),
  ]);
  // Whip: a chain of links hanging from the right hand.
  let parent = 'handR';
  for (let i = 1; i <= WHIP_LINKS; i++) {
    const link = `whip${i}`;
    rig.joint(link, parent, 0, i === 1 ? -0.06 : -0.2, 0);
    rig.attach(link, [cyl(0.035, 0.03, 0.2, WHIP, { y: -0.1 }, 4)]);
    parent = link;
  }
  for (const side of ['L', 'R']) {
    rig.joint(`spark${side}`, `hand${side}`, 0, -0.08, 0.04, true);
    rig.attachObject(`spark${side}`, glowBurst(0.13, SPARK, SPARK_TIPS));
  }
  return rig;
}

/** Same rotation on every whip link: curls the whip (or straightens it with 0). */
const whip = (pose: JointPose): Pose =>
  Object.fromEntries(Array.from({ length: WHIP_LINKS }, (_, i) => [`whip${i + 1}`, pose]));

const holdWhip: Pose = combine({ armR: { rx: -18 }, foreR: { rx: -35 }, armL: { rz: 25 }, foreL: { rx: -55 } }, whip({ rx: 22, rz: 12 }));
const idle = holdWhip;
const walk = robeSway(walkCycle(14, 16)).map((frame) => combine(frame, holdWhip));
const crack: Pose[] = [
  combine({ armR: { rx: -165, rz: 15 }, foreR: { rx: -25 }, spine: { rx: -10 }, armL: { rx: -30 } }, whip({ rx: 28 })),
  combine({ armR: { rx: -95 }, foreR: { rx: 0 }, spine: { rx: 14 }, armL: { rx: 20, rz: 20 } }, whip({ rx: 0 })),
  combine({ armR: { rx: -50 }, foreR: { rx: -10 }, spine: { rx: 8 } }, whip({ rx: 24 })),
];
const lightning: Pose[] = [
  { armL: { rx: -170, rz: 15 }, armR: { rx: -170, rz: -15 }, foreL: { rx: -10 }, foreR: { rx: -10 }, sparkL: { show: true }, sparkR: { show: true }, head: { rx: -12 } },
  { armL: { rx: -88, rz: -12 }, armR: { rx: -88, rz: 12 }, sparkL: { show: true, s: 1.4 }, sparkR: { show: true, s: 1.4 }, spine: { rx: 10 } },
  { armL: { rx: -40 }, armR: { rx: -40 }, spine: { rx: 5 } },
];
const hurt = combine(flinch, whip({ rx: 30 }));
const [fold, kneel, slump, flat] = collapse();
const death: Pose[] = [
  hurt,
  combine(fold, { crown: { rx: -15 } }),
  combine(kneel, { crown: { y: 0.08, z: 0.1, rx: -45 } }),
  combine(slump, { crown: { y: -0.4, z: 0.5, rx: -85 } }),
  combine(flat, { crown: { y: -0.6, z: 0.35, rx: -95 } }),
  combine(flat, { hips: { y: -0.8 }, crown: { y: -0.62, z: 0.3, rx: -100 } }),
];

export const queen: Character = {
  name: 'queen',
  height: 1.05,
  build,
  rows: [
    { pose: idle }, ...walk.map((pose) => ({ pose })),
    ...crack.map((pose) => ({ pose })), ...lightning.map((pose) => ({ pose })),
    { pose: hurt }, { poses: death },
  ],
  tags: { idle: [1], move: [2, 3, 4, 5], atk_a: [6, 7, 8], atk_b: [9, 10, 11], hurt: [12], death: [13] },
  contact: { atk_a: 1, atk_b: 1 },
  keep: [SPARK, SPARK_TIPS],
};
