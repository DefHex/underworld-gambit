import * as THREE from 'three';
import { box, cyl, part } from '../../render/modeling';
import type { Character } from '../bake';
import { fallBack, flinch, humanoid, walkCycle } from '../humanoid';
import { Pose, Rig, combine, glowMaterial } from '../rig';

// The Pawn: a helmeted guard with a rifle, Wolfenstein style.

const UNIFORM = 0x8a7040, TROUSERS = 0x6e5a32, HELMET = 0x5a4c2a, SKIN = 0xe0a878, LEATHER = 0x2a1a10;
const WOOD = 0x6a3a1a, METAL = 0x40404a, BRASS = 0xd8b040;
const FLASH = 0xffe060, FLASH_EDGE = 0xffa020, BLOOD = 0xa00808;
const FACE_Y = 0.22;

function build(): Rig {
  const rig = new Rig();
  humanoid(rig, null, { skin: SKIN, shirt: UNIFORM, pants: TROUSERS, boots: LEATHER, team: ['shirt', 'sleeves', 'pants'] });
  rig.attach('hips', [
    box(0.42, 0.07, 0.27, LEATHER, { y: 0.08 }),
    box(0.06, 0.05, 0.03, BRASS, { y: 0.08, z: 0.14 }),
    box(0.1, 0.09, 0.06, LEATHER, { x: 0.13, y: 0.04, z: 0.14 }),
    box(0.1, 0.09, 0.06, LEATHER, { x: -0.13, y: 0.04, z: 0.14 }),
  ]);
  rig.attach('spine', [box(0.08, 0.5, 0.26, LEATHER, { y: 0.27, rz: 0.5 })]); // shoulder strap
  rig.attach('head', [
    part(new THREE.SphereGeometry(0.235, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), HELMET, { y: FACE_Y + 0.02 }),
    cyl(0.27, 0.27, 0.035, HELMET, { y: FACE_Y + 0.02 }, 12),
  ], { team: true });
  // Rifle along +z, carried by the torso so poses only need to aim it.
  rig.joint('rifle', 'spine', 0, 0.28, 0.17);
  rig.attach('rifle', [
    box(0.08, 0.13, 0.3, WOOD, { y: -0.03, z: -0.18 }),
    box(0.07, 0.08, 0.55, WOOD, { z: 0.2 }),
    cyl(0.03, 0.03, 0.5, METAL, { y: 0.03, z: 0.65, rx: Math.PI / 2 }, 5),
    box(0.03, 0.05, 0.05, METAL, { y: 0.07, z: 0.84 }),
  ]);
  rig.joint('flash', 'rifle', 0, 0.03, 0.98, true);
  rig.attachObject('flash', new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), glowMaterial(FLASH)));
  rig.attachObject('flash', new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4).rotateX(Math.PI / 2).translate(0, 0, 0.15), glowMaterial(FLASH_EDGE)));
  rig.joint('blood', null, 0, 0.01, -0.3, true);
  rig.attachObject('blood', new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 10), glowMaterial(BLOOD)));
  return rig;
}

/** Rifle held across the chest. */
const portArms: Pose = {
  rifle: { rx: -55, rz: 35 },
  armR: { rx: -35, rz: -5 }, foreR: { rx: -55 },
  armL: { rx: -55, rz: -15 }, foreL: { rx: -75 },
};
/** Rifle at the right shoulder, aimed straight ahead. */
const aiming: Pose = {
  rifle: { x: -0.12, y: 0.15, z: -0.05 },
  armR: { rx: -60, rz: 15 }, foreR: { rx: -70 },
  armL: { rx: -80, rz: -30 }, foreL: { rx: -25 },
  head: { rx: 8 },
};

const idle = portArms;
const walk = walkCycle(26, 0).map((frame) => combine(frame, portArms));
const fire: Pose[] = [
  aiming,
  combine(aiming, { flash: { show: true }, spine: { rx: -6 }, rifle: { rx: -6 } }),
  combine(aiming, { rifle: { rx: -14 }, spine: { rx: -3 } }),
];
const hurt = combine(flinch, portArms, { armL: { rx: -40, rz: 30 } });
const [stagger, buckle, falling, flat] = fallBack();
const death: Pose[] = [
  hurt,
  combine(stagger, { rifle: { rx: -80 } }),
  combine(buckle, { rifle: { rx: -100, rz: 60 } }),
  combine(falling, { rifle: { rx: -120, rz: 80 } }),
  combine(flat, { rifle: { rx: -150, rz: 90 }, blood: { show: true, s: 0.6 } }),
  combine(flat, { rifle: { rx: -150, rz: 90 }, blood: { show: true } }),
];

export const pawn: Character = {
  name: 'pawn',
  height: 0.72,
  build,
  rows: [{ pose: idle }, ...walk.map((pose) => ({ pose })), ...fire.map((pose) => ({ pose })), { pose: hurt }, { poses: death }],
  tags: { idle: [1], move: [2, 3, 4, 5], atk_a: [6, 7, 8], hurt: [9], death: [10] },
  contact: { atk_a: 1 },
  keep: [FLASH, FLASH_EDGE, BLOOD],
};
