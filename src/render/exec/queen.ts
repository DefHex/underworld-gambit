import { lightning, whipCrack } from './effects';
import { Kit, Style } from './kit';

// The Queen: a sorceress with a whip and lightning.

/** Her whip hand at fraction `u` of the path. */
const whipHand = (k: Kit, u: number) => k.at(u, 0.7).addScaledVector(k.dir, 0.25);
/** Her hands thrust forward for lightning. */
const castingHands = (k: Kit, u: number) => k.at(u, 0.75).addScaledVector(k.dir, 0.35);
const target = (k: Kit) => k.to.clone().setY(0.45);

const glide: Style = {
  name: 'Glide',
  async run(k) { await k.walk(340 + k.dist * 280, 0, 1, { stride: 0.5 }); },
};

const lightningStep: Style = {
  name: 'Lightning step',
  async run(k) {
    k.face();
    await k.anim('atk_b', { ms: 300 });
    k.flash(k.at(0, 0.6), 0x9fd8ff, 0.9, 200);
    k.bodyVisible(false);
    await lightning(k, k.at(1, 3), k.at(1, 0.1));
    k.a.position.copy(k.at(1));
    k.bodyVisible(true);
    k.pose('idle');
  },
};

const crack: Style = {
  name: 'Whip crack',
  async run(k) {
    await k.walk(380, 0, 0.42, { stride: 0.5 });
    await k.anim('atk_a', { ms: 220 });
    await whipCrack(k, whipHand(k, 0.42), target(k), () => { void k.hit('die', {}, 0.18); });
    await k.wait(420);
    await k.walk(320, 0.42, 1, { stride: 0.5 });
  },
};

const lash: Style = {
  name: 'Lash and hoist',
  async run(k) {
    await k.walk(340, 0, 0.35, { stride: 0.5 });
    await k.anim('atk_a', { ms: 220 });
    await whipCrack(k, whipHand(k, 0.35), target(k), () => { void k.hit('hoist', {}, 0.18); });
    await k.wait(700);
    await k.walk(360, 0.35, 1, { stride: 0.5 });
  },
};

const thunder: Style = {
  name: 'Lightning',
  async run(k) {
    k.face();
    await k.anim('atk_b', {
      ms: 420,
      onContact: () => {
        void lightning(k, castingHands(k, 0), target(k));
        void k.hit('zap', {}, 0.18);
      },
    });
    await k.wait(600);
    await k.walk(340 + k.dist * 280, 0, 1, { stride: 0.5 });
  },
};

export const queen = {
  moves: [glide, lightningStep],
  kills: [crack, lash, thunder],
};
