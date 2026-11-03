import * as THREE from 'three';
import { box, cyl, lathe, part, pleatedLathe } from '../../render/modeling';
import type { Character } from '../bake';
import { collapse, flinch, humanoid, robeSway, walkCycle } from '../humanoid';
import { Pose, Rig, combine, glowBurst } from '../rig';

// The Bishop: mitre, white alb, a chasuble with a gold cross, and a crozier; smites and calls down holy light.

const ALB = 0xf0ece0, CHASUBLE = 0x7a2050, GOLD = 0xe0b040, SKIN = 0xe8b898, HAIR = 0xb0aca4, MITRE = 0xf4f0e6;
const HOLY = 0xffd040, HOLY_TIPS = 0xfff8a0;
const FACE_Y = 0.22;

/** Tall pointed hat, seen from the front as an arch; gold bands front and back. */
function mitre(): THREE.BufferGeometry[] {
  const shape = new THREE.Shape();
  shape.moveTo(-0.2, 0);
  shape.lineTo(-0.2, 0.22);
  shape.quadraticCurveTo(-0.17, 0.46, 0, 0.56);
  shape.quadraticCurveTo(0.17, 0.46, 0.2, 0.22);
  shape.lineTo(0.2, 0);
  shape.lineTo(-0.2, 0);
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: false }).translate(0, 0, -0.12);
  return [
    part(body, MITRE),
    box(0.07, 0.5, 0.26, GOLD, { y: 0.25 }),
    box(0.41, 0.07, 0.26, GOLD, { y: 0.04 }),
  ];
}

function build(): Rig {
  const rig = new Rig();
  humanoid(rig, null, { skin: SKIN, shirt: CHASUBLE, sleeves: ALB, pants: ALB, boots: 0x3a2030, hair: HAIR, team: ['shirt'] });
  rig.joint('skirt', 'hips', 0, 0.06, 0);
  rig.attach('skirt', [pleatedLathe([[0.2, 0], [0.25, -0.3], [0.32, -0.7], [0.36, -0.96], [0, -0.96]], ALB, 8, 0.1)]);
  // Chasuble: a bell from the shoulders to the knees with a gold hem and a big gold cross on the front.
  rig.attach('spine', [lathe([[0.16, 0.6], [0.3, 0.5], [0.38, 0.1], [0.44, -0.45], [0, -0.45]], CHASUBLE, 12)], { team: true });
  rig.attach('spine', [
    lathe([[0.445, -0.36], [0.45, -0.45], [0.38, -0.45], [0.39, -0.36]], GOLD, 12),
    box(0.09, 0.72, 0.03, GOLD, { y: 0.06, z: 0.4, rx: -0.12 }),
    box(0.4, 0.09, 0.03, GOLD, { y: 0.3, z: 0.355, rx: -0.12 }),
  ]);
  rig.joint('mitre', 'head', 0, FACE_Y + 0.07, 0);
  rig.attach('mitre', mitre());
  // Crozier: a gold staff with a crook, held in the left hand (carried by the torso, like the guard's rifle).
  rig.joint('crozier', 'spine', 0.34, 0.25, 0.2);
  const crook = new THREE.TorusGeometry(0.13, 0.035, 4, 10, Math.PI * 1.3).rotateY(Math.PI / 2).rotateX(-0.3);
  rig.attach('crozier', [
    cyl(0.035, 0.035, 2.0, GOLD, { y: -0.2 }, 5),
    part(crook, GOLD, { y: 0.9, z: 0.1 }),
    cyl(0.06, 0.06, 0.08, GOLD, { y: 0.78 }, 6),
  ]);
  rig.joint('holy', 'handR', 0, -0.1, 0.05, true);
  rig.attachObject('holy', glowBurst(0.14, HOLY, HOLY_TIPS));
  return rig;
}

/** Left hand on the crozier, right hand raised in blessing. */
const stance: Pose = { armL: { rx: -45, rz: 10 }, foreL: { rx: -45 }, armR: { rx: -30 }, foreR: { rx: -90 } };
const idle = stance;
const walk = robeSway(walkCycle(14, 0)).map((frame, i) => combine(frame, stance, { crozier: { rx: i % 2 ? 0 : 5 } }));
const smite: Pose[] = [
  { crozier: { rx: -45, y: 0.15 }, armL: { rx: -150 }, foreL: { rx: -20 }, spine: { rx: -10 }, armR: { rx: -20 } },
  { crozier: { rx: 80, y: 0.05 }, armL: { rx: -70 }, foreL: { rx: -10 }, spine: { rx: 22 }, armR: { rx: 15 }, hips: { y: -0.04 } },
  { crozier: { rx: 62 }, armL: { rx: -55 }, spine: { rx: 15 }, hips: { y: -0.03 } },
];
const holyLight: Pose[] = [
  combine(stance, { armR: { rx: -172, rz: -10 }, foreR: { rx: -5 }, holy: { show: true }, head: { rx: -12 } }),
  combine(stance, { armR: { rx: -95 }, foreR: { rx: 0 }, holy: { show: true, s: 1.5 }, spine: { rx: 10 } }),
  combine(stance, { armR: { rx: -40 }, foreR: { rx: -20 } }),
];
const hurt = combine(flinch, { crozier: { rx: -15 } });
const [fold, kneel, slump, flat] = collapse();
const death: Pose[] = [
  hurt,
  combine(fold, { crozier: { rz: -15 }, mitre: { rx: -20 } }),
  combine(kneel, { crozier: { rz: -40 }, mitre: { y: 0.05, z: 0.1, rx: -40 } }),
  combine(slump, { crozier: { rz: -75, y: -0.3 }, mitre: { y: -0.4, z: 0.5, rx: -85 } }),
  combine(flat, { crozier: { show: false }, mitre: { y: -0.6, z: 0.35, rx: -95 } }),
  combine(flat, { crozier: { show: false }, hips: { y: -0.8 }, mitre: { y: -0.62, z: 0.3, rx: -100 } }),
];

export const bishop: Character = {
  name: 'bishop',
  height: 1.0,
  build,
  rows: [
    { pose: idle }, ...walk.map((pose) => ({ pose })),
    ...smite.map((pose) => ({ pose })), ...holyLight.map((pose) => ({ pose })),
    { pose: hurt }, { poses: death },
  ],
  tags: { idle: [1], move: [2, 3, 4, 5], atk_a: [6, 7, 8], atk_b: [9, 10, 11], hurt: [12], death: [13] },
  contact: { atk_a: 1, atk_b: 1 },
  keep: [HOLY, HOLY_TIPS],
};
