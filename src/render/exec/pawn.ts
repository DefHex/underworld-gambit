import { gunshot } from './effects';
import { Kit, Reaction, Style } from './kit';

// The Pawn: a rifle guard. Marches, and shoots: aim, fire (contact), lower.

const SHOT_MS = 300;

/** The rifle's muzzle when the guard stands at fraction `u` of its path. */
const muzzle = (k: Kit, u: number) => k.at(u, 0.5).addScaledVector(k.dir, 0.4);

/** One rifle shot from fraction `u` of the path; `reaction` (if given) is how the victim takes it. */
function shoot(k: Kit, u: number, reaction?: Reaction): Promise<void> {
  return k.anim('atk_a', {
    ms: SHOT_MS,
    onContact: () => {
      gunshot(k, muzzle(k, u), k.to.clone().setY(0.45));
      if (reaction) void k.hit(reaction, { power: 1.2 }, 0.16);
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
    await k.walk(420, 0, 0.5);
    await shoot(k, 0.5, 'launch');
    await k.wait(260);
    await k.walk(280, 0.5, 1);
  },
};

const firingLine: Style = {
  name: 'Firing line',
  async run(k) {
    k.face();
    await shoot(k, 0);
    await shoot(k, 0);
    await shoot(k, 0, 'die');
    await k.wait(500);
    await k.walk(300 + k.dist * 260, 0, 1);
  },
};

const execution: Style = {
  name: 'Execution',
  async run(k) {
    await k.walk(520, 0, 0.72);
    await shoot(k, 0.72);
    await k.wait(140);
    await shoot(k, 0.72, 'die');
    await k.wait(520);
    await k.walk(220, 0.72, 1);
  },
};

export const pawn = {
  moves: [march, doubleTime],
  kills: [pointBlank, firingLine, execution],
};
