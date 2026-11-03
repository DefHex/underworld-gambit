import { ball, box, cyl } from '../render/modeling';
import { Pose, Rig } from './rig';

/** Colors of a plain body; characters dress it up afterwards. */
export interface BodyLook {
  skin: number;
  shirt: number;
  sleeves?: number;
  pants: number;
  boots: number;
  hair?: number;
  eyes?: number;
}

export interface BodyShape {
  /** Height of the parent origin the feet stand on. */
  y?: number;
  scale?: number;
  /** Head and limb thickness multipliers: sprites this small need a big head and chunky limbs to read. */
  head?: number;
  limbs?: number;
}

/**
 * A humanoid of about 2 units, feet at the parent's origin, facing +z. Its right side is -x.
 * Joints: hips > spine > head; spine > armL/armR > foreL/foreR > handL/handR; hips > legL/legR > shinL/shinR.
 */
export function humanoid(rig: Rig, parent: string | null, look: BodyLook, { y = 0, scale = 1, head = 1.35, limbs = 1.35 }: BodyShape = {}): void {
  const s = scale, h = s * head, l = s * limbs;
  const sleeves = look.sleeves ?? look.shirt;
  const eyes = look.eyes ?? 0x1a1010;
  rig.joint('hips', parent, 0, y + 0.92 * s, 0);
  rig.attach('hips', [box(0.34 * s, 0.18 * s, 0.22 * s, look.pants)]);

  rig.joint('spine', 'hips', 0, 0.06 * s, 0);
  rig.attach('spine', [
    box(0.38 * s, 0.5 * s, 0.24 * s, look.shirt, { y: 0.26 * s }),
    box(0.32 * s, 0.1 * s, 0.22 * s, look.shirt, { y: 0.5 * s }),
  ]);

  rig.joint('head', 'spine', 0, 0.56 * s, 0);
  rig.attach('head', [
    cyl(0.07 * l, 0.08 * l, 0.1 * s, look.skin, { y: 0.02 * s }),
    ball(0.15 * h, look.skin, { y: 0.06 * s + 0.12 * h }, 10, 8),
    box(0.045 * h, 0.05 * h, 0.03 * h, eyes, { x: 0.055 * h, y: 0.06 * s + 0.14 * h, z: 0.135 * h }),
    box(0.045 * h, 0.05 * h, 0.03 * h, eyes, { x: -0.055 * h, y: 0.06 * s + 0.14 * h, z: 0.135 * h }),
    ...(look.hair === undefined ? [] : [ball(0.155 * h, look.hair, { y: 0.06 * s + 0.15 * h, z: -0.025 * h, sy: 0.85 }, 10, 6)]),
  ]);

  for (const [side, x] of [['L', 1], ['R', -1]] as const) {
    rig.joint(`arm${side}`, 'spine', x * 0.25 * s, 0.48 * s, 0);
    rig.attach(`arm${side}`, [ball(0.075 * l, sleeves), cyl(0.058 * l, 0.052 * l, 0.3 * s, sleeves, { y: -0.15 * s })]);
    rig.joint(`fore${side}`, `arm${side}`, 0, -0.3 * s, 0);
    rig.attach(`fore${side}`, [cyl(0.05 * l, 0.045 * l, 0.27 * s, sleeves, { y: -0.135 * s })]);
    rig.joint(`hand${side}`, `fore${side}`, 0, -0.27 * s, 0);
    rig.attach(`hand${side}`, [ball(0.06 * l, look.skin, { y: -0.04 * s })]);
    rig.setRest(`arm${side}`, 0, 0, x * 8);

    rig.joint(`leg${side}`, 'hips', x * 0.1 * s, -0.06 * s, 0);
    rig.attach(`leg${side}`, [cyl(0.085 * l, 0.07 * l, 0.42 * s, look.pants, { y: -0.21 * s })]);
    rig.joint(`shin${side}`, `leg${side}`, 0, -0.42 * s, 0);
    rig.attach(`shin${side}`, [
      cyl(0.068 * l, 0.058 * l, 0.38 * s, look.pants, { y: -0.19 * s }),
      box(0.13 * l, 0.1 * s, 0.24 * s, look.boots, { y: -0.4 * s, z: 0.04 * s }),
    ]);
  }
}

/** Four-frame walk: contact, passing, contact, passing (Doom and Wolfenstein frames A-D). */
export function walkCycle(stride = 28, armSwing = 22): Pose[] {
  const contact = (lead: 'L' | 'R'): Pose => {
    const back = lead === 'L' ? 'R' : 'L';
    return {
      [`leg${lead}`]: { rx: -stride }, [`leg${back}`]: { rx: stride }, [`shin${back}`]: { rx: 18 },
      [`arm${lead}`]: { rx: armSwing }, [`arm${back}`]: { rx: -armSwing }, hips: { y: -0.03 },
    };
  };
  const passing = (lifting: 'L' | 'R'): Pose => ({
    [`leg${lifting}`]: { rx: -12 }, [`shin${lifting}`]: { rx: 40 }, hips: { y: 0.015 },
  });
  return [contact('L'), passing('R'), contact('R'), passing('L')];
}

/** Adds a swing of the long skirt (joint `skirt`) to a 4-frame walk, so robed walkers read as walking. */
export function robeSway(walk: Pose[], angle = 6): Pose[] {
  const sway: Pose[] = [{ skirt: { rz: angle } }, { skirt: { rx: -angle / 2 } }, { skirt: { rz: -angle } }, { skirt: { rx: -angle / 2 } }];
  return walk.map((frame, i) => ({ ...frame, ...sway[i] }));
}

/** Recoils from a hit. */
export const flinch: Pose = { spine: { rx: -18 }, head: { rx: -22 }, armL: { rx: -40, rz: 35 }, armR: { rx: -30, rz: -40 }, hips: { z: -0.05 } };

/** Doubles over, drops to the knees and falls forward flat. */
export function collapse(): Pose[] {
  return [
    { spine: { rx: 25 }, head: { rx: 20 }, armL: { rx: -20 }, armR: { rx: -30 }, hips: { y: -0.04 } },
    { hips: { y: -0.32 }, legL: { rx: -80 }, legR: { rx: -70 }, shinL: { rx: 100 }, shinR: { rx: 95 }, spine: { rx: 35 }, armL: { rx: -10, rz: 20 }, armR: { rx: -10, rz: -20 } },
    { hips: { y: -0.42, z: 0.1 }, legL: { rx: -60 }, legR: { rx: -60 }, shinL: { rx: 110 }, shinR: { rx: 110 }, spine: { rx: 70 }, head: { rx: 10 }, armL: { rx: -60 }, armR: { rx: -50 } },
    { hips: { y: -0.78, z: 0.25, rx: 85 }, legL: { rx: -5 }, legR: { rx: 0 }, spine: { rx: 5 }, armL: { rx: -160, rz: 15 }, armR: { rx: -165, rz: -15 } },
  ];
}

/** Staggers back and falls flat on the back. */
export function fallBack(): Pose[] {
  return [
    { spine: { rx: -25 }, head: { rx: -30 }, armL: { rx: -60, rz: 40 }, armR: { rx: -50, rz: -40 }, hips: { z: -0.08 } },
    { hips: { y: -0.25, z: -0.2, rx: -25 }, legL: { rx: -50 }, shinL: { rx: 70 }, legR: { rx: -20 }, shinR: { rx: 40 }, spine: { rx: -20 }, armL: { rz: 70 }, armR: { rz: -70 } },
    { hips: { y: -0.6, z: -0.45, rx: -65 }, legL: { rx: -40 }, shinL: { rx: 50 }, legR: { rx: -15 }, spine: { rx: -10 }, head: { rx: -20 }, armL: { rz: 90 }, armR: { rz: -90 } },
    { hips: { y: -0.8, z: -0.55, rx: -88 }, legL: { rx: -10 }, legR: { rx: 5 }, head: { rx: -10 }, armL: { rz: 100, rx: -20 }, armR: { rz: -100, rx: -10 } },
  ];
}
