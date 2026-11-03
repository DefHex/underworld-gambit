import { Easing } from '../tween';
import { fireball } from './effects';
import { Kit, Style } from './kit';

// The Rook: a brick tower that hops square by square, with a fire wizard on top.

const HOP_MS = 300;

/** Hops from fraction u0 to u1 of the path, one hop per square: crouch, launch, fly, land. */
async function hop(k: Kit, u0: number, u1: number): Promise<void> {
  k.face();
  const hops = Math.max(1, Math.round(Math.abs(u1 - u0) * k.dist));
  for (let i = 0; i < hops; i++) {
    const from = u0 + ((u1 - u0) * i) / hops, to = u0 + ((u1 - u0) * (i + 1)) / hops;
    await k.tw(HOP_MS, (t) => {
      const flight = Math.min(1, Math.max(0, (t - 0.2) / 0.65));
      k.a.position.copy(k.at(from + (to - from) * flight));
      k.a.position.y += 0.35 * Math.sin(flight * Math.PI);
      let step = 0;
      if (t >= 0.85) step = 3;
      else if (t >= 0.45) step = 2;
      else if (t >= 0.2) step = 1;
      k.pose('move', step);
    }, Easing.Linear.None);
    k.sfx('thud');
    k.burst(k.a.position.clone().setY(0.05), 'smoke', 6, { life: 0.4, speed: 0.5, spread: Math.PI / 2 });
    k.shake(0.05);
  }
}

/** The wizard's throwing hand, on top of the tower at fraction `u` of the path. */
const throwingHand = (k: Kit, u: number) => k.at(u, 1.15).addScaledVector(k.dir, 0.15);
const target = (k: Kit) => k.to.clone().setY(0.35);

const hopAlong: Style = {
  name: 'Hop',
  async run(k) { await hop(k, 0, 1); },
};

const rumble: Style = {
  name: 'Rumble',
  async run(k) {
    k.face();
    k.sfx('engine');
    k.every(400 + k.dist * 220, () => k.burst(k.a.position.clone().setY(0.05), 'smoke', 4, { life: 0.5, speed: 0.5, spread: Math.PI / 2 }), 2);
    await k.tw(400 + k.dist * 220, (t) => {
      k.a.position.copy(k.at(t));
      k.a.rotation.z = Math.sin(t * Math.PI * 10) * 0.05;
      k.pose('move', 0);
    });
    k.a.rotation.z = 0;
  },
};

const fireballThrow: Style = {
  name: 'Fireball',
  async run(k) {
    k.face();
    let flight: Promise<void> = Promise.resolve();
    await k.anim('atk_a', { ms: 360, onContact: () => { flight = fireball(k, throwingHand(k, 0), target(k)); } });
    await flight;
    await k.hit('burn', {}, 0.18);
    await hop(k, 0, 1);
  },
};

const meteor: Style = {
  name: 'Meteor',
  async run(k) {
    k.face();
    let flight: Promise<void> = Promise.resolve();
    await k.anim('atk_b', {
      ms: 560,
      onContact: () => { flight = fireball(k, throwingHand(k, 0).setY(1.6), target(k), { size: 2.2, hump: 0.8, ms: 620 }); },
    });
    await flight;
    k.sfx('explosion');
    void k.hit('explode', {}, 0.3);
    await k.wait(500);
    await hop(k, 0, 1);
  },
};

const fireVolley: Style = {
  name: 'Fire volley',
  async run(k) {
    k.face();
    for (let shot = 0; shot < 3; shot++) {
      const last = shot === 2;
      await k.anim('atk_a', {
        ms: 240,
        onContact: () => {
          void fireball(k, throwingHand(k, 0), target(k), { size: 0.7, hump: 0.25, ms: 300 }).then(() => {
            if (last) void k.hit('die', {}, 0.16);
          });
        },
      });
    }
    await k.wait(900);
    await hop(k, 0, 1);
  },
};

export const rook = {
  moves: [hopAlong, rumble],
  kills: [fireballThrow, meteor, fireVolley],
};
