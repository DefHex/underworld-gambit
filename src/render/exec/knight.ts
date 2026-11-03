import { gunshot } from './effects';
import { Kit, Style } from './kit';

// The Knight: a gunslinger cowboy on a horse. Knights jump, so every gallop arcs over the squares between.

/** Gallops (with a leap) between fractions u0 and u1 of the path. */
async function gallop(k: Kit, u0: number, u1: number, ms = 320 + k.dist * 170): Promise<void> {
  k.sfx('gallop');
  k.every(ms, () => k.burst(k.a.position.clone().setY(0.05), 'smoke', 3, { life: 0.4, speed: 0.4, spread: Math.PI / 2 }), 3);
  await k.walk(ms, u0, u1, { hump: 0.22 * (u1 - u0) * Math.min(2, k.dist), stride: 0.8 });
}

/** The revolver's muzzle when the rider is at fraction `u` of the path. */
const muzzle = (k: Kit, u: number) => k.at(u, 0.72).addScaledVector(k.dir, 0.42);

/** One revolver shot (draw, fire, kick); the last of a volley kills. */
function fire(k: Kit, u: number, fatal: boolean, ms = 300): Promise<void> {
  return k.anim('atk_a', {
    ms,
    onContact: () => {
      gunshot(k, muzzle(k, u), k.to.clone().setY(0.45));
      if (fatal) void k.hit('die', {}, 0.16);
    },
  });
}

const ride: Style = {
  name: 'Gallop',
  async run(k) { await gallop(k, 0, 1); },
};

const rearAndCharge: Style = {
  name: 'Rear and charge',
  async run(k) {
    k.face();
    await k.anim('atk_b', { ms: 420 });
    await gallop(k, 0, 1, 260 + k.dist * 150);
  },
};

const quickDraw: Style = {
  name: 'Quick draw',
  async run(k) {
    k.face();
    await fire(k, 0, true);
    await k.wait(560);
    await gallop(k, 0, 1);
  },
};

const fanTheHammer: Style = {
  name: 'Fan the hammer',
  async run(k) {
    await gallop(k, 0, 0.35);
    for (let shot = 0; shot < 4; shot++) await fire(k, 0.35, shot === 3, 170);
    await k.wait(520);
    await gallop(k, 0.35, 1, 300);
  },
};

const trample: Style = {
  name: 'Trample',
  async run(k) {
    await gallop(k, 0, 0.62);
    await k.anim('atk_b', {
      ms: 520,
      onContact: () => {
        k.sfx('stomp');
        k.ring(k.to.clone(), 0xffe9c0, 1.4);
        void k.hit('squash', {}, 0.22);
      },
    });
    await gallop(k, 0.62, 1, 260);
  },
};

export const knight = {
  moves: [ride, rearAndCharge],
  kills: [quickDraw, fanTheHammer, trample],
};
