import * as THREE from 'three';
import { Kit, Reaction, Style } from './kit';
import { glow } from './props';

// The pawn is the Stability Officer sprite: a walk cycle, an aim / fire / aim attack and Doom death frames.

const SHOT_MS = 300;

/** The pistol's muzzle when the pawn stands at fraction `u` of its path. */
const muzzle = (k: Kit, u: number) => k.at(u, 0.48).addScaledVector(k.dir, 0.3);

/** Sprite victims die Doom style; 3D victims use the given reaction. */
const finisher = (k: Kit, fallback: Reaction): Reaction => (k.victimSprite ? 'die' : fallback);

/** A bright streak from the muzzle to the target. */
function tracer(k: Kit, from: THREE.Vector3, to: THREE.Vector3): void {
  const streak = k.put(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.3), glow(0xfff2b0, 1)));
  streak.position.copy(from);
  streak.lookAt(k.world(to));
  void k.proj(streak, from, to, 70).then(() => k.drop(streak));
}

/** Aim, fire, lower: one pistol shot from fraction `u` of the path. `onHit` runs as the bullet lands. */
function shoot(k: Kit, u: number, onHit?: () => void): Promise<void> {
  return k.anim('atk_a', {
    ms: SHOT_MS,
    onContact: () => {
      k.sfx('smack');
      const from = muzzle(k, u), target = k.to.clone().setY(0.45);
      k.flash(from, 0xfff0a0, 0.35, 90);
      tracer(k, from, target);
      k.burst(target, 'white', 5, { speed: 1.1, life: 0.4 });
      onHit?.();
    },
  });
}

const march: Style = {
  name: 'March',
  async run(k) { await k.walk(320 + k.dist * 300, 0, 1); },
};

const doubleTime: Style = {
  name: 'Double time',
  async run(k) {
    k.every(260 + k.dist * 170, () => k.burst(k.a.position.clone().setY(0.05), 'smoke', 3, { life: 0.4, speed: 0.4, spread: Math.PI / 2 }), 2);
    await k.walk(260 + k.dist * 170, 0, 1);
  },
};

const pointBlank: Style = {
  name: 'Point-blank shot',
  async run(k) {
    await k.walk(420, 0, 0.55);
    await shoot(k, 0.55, () => { void k.hit(finisher(k, 'launch'), { power: 1.2 }, 0.16); });
    await k.wait(260);
    await k.walk(260, 0.55, 1);
  },
};

const firingLine: Style = {
  name: 'Firing line',
  async run(k) {
    k.face();
    await shoot(k, 0);
    await shoot(k, 0);
    await shoot(k, 0, () => { void k.hit(finisher(k, 'spin'), {}, 0.18); });
    await k.wait(320);
    await k.walk(300 + k.dist * 260, 0, 1);
  },
};

const execution: Style = {
  name: 'Execution',
  async run(k) {
    await k.walk(520, 0, 0.78);
    await shoot(k, 0.78);
    await k.wait(140);
    await shoot(k, 0.78, () => { void k.hit(finisher(k, 'topple'), {}, 0.2); });
    await k.wait(420);
    await k.walk(200, 0.78, 1);
  },
};

export const pawn = {
  moves: [march, doubleTime],
  kills: [pointBlank, firingLine, execution],
};
