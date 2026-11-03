import { holyBeam, slash } from './effects';
import { Kit, Style } from './kit';

// The King: crown, robe and broadsword. Cleaves, sweeps, and decrees.

/** Where the blade lands: on the victim, at chest height. */
const strikePoint = (k: Kit) => k.to.clone().setY(0.55);

/** Walks slowly and regally between fractions u0 and u1 of the path. */
const stride = (k: Kit, u0: number, u1: number, ms: number) => k.walk(ms, u0, u1, { stride: 0.45 });

const royalStride: Style = {
  name: 'Royal stride',
  async run(k) { await stride(k, 0, 1, 420 + k.dist * 320); },
};

const charge: Style = {
  name: 'Royal charge',
  async run(k) {
    k.every(300 + k.dist * 200, () => k.burst(k.a.position.clone().setY(0.05), 'smoke', 3, { life: 0.4, speed: 0.4, spread: Math.PI / 2 }), 2);
    await k.walk(300 + k.dist * 200, 0, 1, { stride: 0.7 });
  },
};

const cleave: Style = {
  name: 'Royal cleave',
  async run(k) {
    await stride(k, 0, 0.55, 420);
    await k.anim('atk_a', {
      ms: 420,
      onContact: () => {
        slash(k, strikePoint(k));
        void k.hit('die', {}, 0.2);
      },
    });
    await k.wait(520);
    await stride(k, 0.55, 1, 320);
  },
};

const sweep: Style = {
  name: 'Sweep',
  async run(k) {
    await stride(k, 0, 0.55, 420);
    await k.anim('atk_b', {
      ms: 380,
      onContact: () => {
        slash(k, strikePoint(k));
        void k.hit('launch', { power: 1.4 }, 0.2);
      },
    });
    await k.wait(420);
    await stride(k, 0.55, 1, 320);
  },
};

const decree: Style = {
  name: 'Royal decree',
  async run(k) {
    k.face();
    k.pose('atk_a', 0); // sword raised to the heavens
    k.sfx('whoosh');
    await k.wait(320);
    holyBeam(k, k.to.clone());
    void k.hit('burn', {}, 0.18);
    await k.anim('atk_a', { ms: 300 });
    await k.wait(420);
    await stride(k, 0, 1, 420 + k.dist * 320);
  },
};

export const king = {
  moves: [royalStride, charge],
  kills: [cleave, sweep, decree],
};
