import { holyBeam, lightning } from './effects';
import { Kit, Style } from './kit';

// The Bishop: mitre, robes and crozier. Smites with the crozier and calls down holy light.

/** The raised hand, where the holy light gathers, at fraction `u` of the path. */
const hand = (k: Kit, u: number) => k.at(u, 1.05).addScaledVector(k.dir, 0.2);

const procession: Style = {
  name: 'Procession',
  async run(k) { await k.walk(380 + k.dist * 330, 0, 1, { stride: 0.45 }); },
};

const holyGlide: Style = {
  name: 'Holy glide',
  async run(k) {
    k.every(320 + k.dist * 260, () => k.burst(k.a.position.clone().setY(0.3), 'gold', 3, { life: 0.5, speed: 0.3 }), 3);
    await k.walk(320 + k.dist * 260, 0, 1, { hump: 0.06, stride: 0.9 });
  },
};

const smite: Style = {
  name: 'Smite',
  async run(k) {
    await k.walk(420, 0, 0.55, { stride: 0.45 });
    await k.anim('atk_a', {
      ms: 420,
      onContact: () => {
        k.sfx('clang');
        k.flash(k.to.clone().setY(0.4), 0xfff0a0, 0.8, 200);
        void k.hit('squash', {}, 0.2);
      },
    });
    await k.wait(300);
    await k.walk(300, 0.55, 1, { stride: 0.45 });
  },
};

const holyFire: Style = {
  name: 'Holy fire',
  async run(k) {
    k.face();
    await k.anim('atk_b', {
      ms: 520,
      onContact: () => {
        holyBeam(k, k.to.clone());
        void k.hit('burn', {}, 0.16);
      },
    });
    await k.wait(500);
    await k.walk(360 + k.dist * 300, 0, 1, { stride: 0.45 });
  },
};

const excommunicate: Style = {
  name: 'Excommunicate',
  async run(k) {
    k.face();
    await k.anim('atk_b', {
      ms: 480,
      onContact: () => {
        void lightning(k, hand(k, 0), k.to.clone().setY(0.45), 0xffe080);
        void k.hit('die', {}, 0.16);
      },
    });
    await k.wait(520);
    await k.walk(360 + k.dist * 300, 0, 1, { stride: 0.45 });
  },
};

export const bishop = {
  moves: [procession, holyGlide],
  kills: [smite, holyFire, excommunicate],
};
