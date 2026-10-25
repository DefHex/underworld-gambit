import * as THREE from 'three';
import { PAL } from '../pieces';
import { Easing } from '../tween';
import { Kit, Style } from './kit';
import { missile, shell, Tank, tank } from './props';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** The rook unfolds into a tank: tower hidden, tank popped in at its feet. */
async function morph(k: Kit): Promise<Tank> {
  k.face();
  const t = k.put(tank(PAL[k.a.userData.color].base), k.rig);
  k.bodyVisible(false);
  t.scale.setScalar(0.2);
  k.burst(k.from.clone().setY(0.2), 'smoke', 16, { spread: Math.PI / 2 });
  k.flash(k.from.clone().setY(0.4), 0xffe9c0, 0.7, 200);
  await k.tw(240, (u) => t.scale.setScalar(0.2 + 0.8 * u), Easing.Back.Out);
  return t;
}

async function unmorph(k: Kit, t: Tank): Promise<void> {
  k.a.rotation.set(0, k.a.rotation.y, 0);
  k.burst(k.to.clone().setY(0.2), 'smoke', 14, { spread: Math.PI / 2 });
  await k.tw(200, (u) => t.scale.setScalar(1 - 0.8 * u), Easing.Cubic.In);
  k.drop(t);
  k.bodyVisible(true);
}

function dust(k: Kit, ms: number): void {
  k.every(ms, () => k.burst(k.a.position.clone().setY(0.05).addScaledVector(k.dir, -0.4), 'smoke', 4, { life: 0.6, speed: 0.5, spread: Math.PI / 2 }), 3);
}

/** World position of an object, expressed in the board group's coordinates. */
function local(k: Kit, o: THREE.Object3D): THREE.Vector3 {
  return o.getWorldPosition(new THREE.Vector3()).sub(k.g.position);
}

/** Recoil, muzzle flash, and a shell flying to `target`. Resolves when it lands. */
async function fire(k: Kit, t: Tank, target: THREE.Vector3, ms = 240, hump = 0.25): Promise<void> {
  const m = local(k, t.userData.muzzle);
  k.flash(m, 0xffd070, 0.45, 160);
  k.burst(m, 'fire', 8, { speed: 1.2 });
  k.shake(0.06);
  void k.tw(220, (u) => { t.userData.barrel.position.z = 0.15 - 0.12 * Math.sin(u * Math.PI); });
  const s = k.put(shell());
  s.position.copy(m);
  s.lookAt(target);
  await k.proj(s, m, target, ms, hump, Easing.Linear.None);
  k.drop(s);
  k.flash(target, 0xffb050, 0.6, 180);
  k.burst(target, 'fire', 10);
}

/** Drives along the line, calling `at` for progress; good for timing the impact. */
function driveTo(k: Kit, ms: number, u0: number, u1: number, ease: (n: number) => number, at?: (u: number) => void, sway = 0): Promise<void> {
  const side = V(-k.dir.z, 0, k.dir.x);
  return k.tw(ms, (t) => {
    const u = u0 + (u1 - u0) * t;
    k.a.position.copy(k.at(u)).addScaledVector(side, Math.sin(t * Math.PI) * sway);
    k.a.rotation.y = Math.atan2(k.dir.x + side.x * Math.cos(t * Math.PI) * sway * 0.9, k.dir.z + side.z * Math.cos(t * Math.PI) * sway * 0.9) - k.rig.rotation.y;
    at?.(t);
  }, ease);
}

const move1: Style = {
  name: 'Tank roll',
  async run(k) {
    const t = await morph(k);
    dust(k, 400 + k.dist * 220);
    await driveTo(k, 380 + k.dist * 200, 0, 1, Easing.Quadratic.InOut);
    await unmorph(k, t);
  },
};

const move2: Style = {
  name: 'Turbo drift',
  async run(k) {
    const t = await morph(k);
    dust(k, 500 + k.dist * 220);
    void k.tw(520 + k.dist * 200, (u) => { t.userData.turret.rotation.y = u * Math.PI * 4; }, Easing.Cubic.Out);
    await driveTo(k, 520 + k.dist * 200, 0, 1, Easing.Cubic.InOut, undefined, Math.min(0.5, 0.15 + k.dist * 0.08));
    await unmorph(k, t);
  },
};

const kill1: Style = {
  name: 'Run over',
  async run(k) {
    const t = await morph(k);
    dust(k, 800);
    let hit = false;
    await driveTo(k, 640 + k.dist * 120, 0, 1, Easing.Quadratic.In, (u) => { if (!hit && u > 0.86) { hit = true; void k.hit('squash', {}, 0.2); } });
    await k.tw(140, () => {}, Easing.Linear.None);
    await unmorph(k, t);
  },
};

const kill2: Style = {
  name: 'Cannon shell',
  async run(k) {
    const t = await morph(k);
    k.face();
    if (k.dist > 1.7) { dust(k, 400); await driveTo(k, 380, 0, 0.45, Easing.Cubic.Out); }
    await k.wait(150);
    await fire(k, t, k.to.clone().setY(0.3), 260, 0.5);
    void k.hit('explode', {}, 0.22);
    dust(k, 700);
    await driveTo(k, 560, k.dist > 1.7 ? 0.45 : 0, 1, Easing.Quadratic.InOut);
    await unmorph(k, t);
  },
};

const kill3: Style = {
  name: 'Battering ram',
  async run(k) {
    const t = await morph(k);
    dust(k, 800);
    let hit = false;
    await driveTo(k, 360 + k.dist * 70, 0, 0.88, Easing.Quadratic.In, (u) => { if (!hit && u > 0.95) { hit = true; void k.hit('launch', { power: 1.6 }, 0.25); } });
    k.flash(k.to.clone().setY(0.4), 0xffffff, 1);
    await driveTo(k, 160, 0.88, 0.8, Easing.Cubic.Out);
    await driveTo(k, 260, 0.8, 1, Easing.Cubic.InOut);
    await unmorph(k, t);
  },
};

const kill4: Style = {
  name: 'Drift crush',
  async run(k) {
    const t = await morph(k);
    dust(k, 900);
    let hit = false;
    await driveTo(k, 760, 0, 1, Easing.Cubic.InOut, (u) => { if (!hit && u > 0.62) { hit = true; void k.hit('topple', { dir: V(-k.dir.z, 0, k.dir.x) }, 0.2); } }, 0.75);
    void t;
    await unmorph(k, t);
  },
};

const kill5: Style = {
  name: 'Turret barrage',
  async run(k) {
    const t = await morph(k);
    if (k.dist > 1.7) { dust(k, 380); await driveTo(k, 360, 0, 0.5, Easing.Cubic.Out); }
    const tgt = k.to.clone().setY(0.3);
    void k.tw(560, (u) => { t.userData.turret.rotation.y = u * Math.PI * 4; }, Easing.Linear.None);
    for (let i = 0; i < 3; i++) { void fire(k, t, tgt.clone().add(V((i - 1) * 0.2, 0, 0)), 200, 0.2); await k.wait(190); }
    void k.hit('burn', {}, 0.18);
    t.userData.turret.rotation.y = 0;
    dust(k, 600);
    await driveTo(k, 500, k.dist > 1.7 ? 0.5 : 0, 1, Easing.Quadratic.InOut);
    await unmorph(k, t);
  },
};

const kill6: Style = {
  name: 'Double tap',
  async run(k) {
    const t = await morph(k);
    k.face();
    await fire(k, t, k.to.clone().setY(0.3), 220);
    void k.hit('explode', {}, 0.2);
    await k.wait(220);
    dust(k, 700);
    let ring = false;
    await driveTo(k, 560, 0, 1, Easing.Quadratic.In, (u) => { if (!ring && u > 0.85) { ring = true; k.ring(k.to.clone(), 0xffd070, 1.6); k.burst(k.to.clone().setY(0.2), 'fire', 14); } });
    await unmorph(k, t);
  },
};

const kill7: Style = {
  name: 'Tank drop',
  async run(k) {
    const t = await morph(k);
    dust(k, 400);
    await driveTo(k, 340, 0, 0.35, Easing.Quadratic.In);
    await k.tw(520, (u) => {
      k.a.position.copy(k.at(0.35 + 0.65 * u));
      k.a.position.y = 2.2 * 4 * u * (1 - u);
      k.a.rotation.x = -0.5 * Math.sin(u * Math.PI) + 0.4 * u * u;
    }, Easing.Linear.None);
    k.a.rotation.x = 0;
    void k.hit('squash', {}, 0.3);
    k.ring(k.to.clone(), 0xffe9c0, 2.2);
    k.burst(k.to.clone().setY(0.1), 'smoke', 30, { spread: Math.PI / 2 });
    await k.wait(200);
    await unmorph(k, t);
  },
};

const kill8: Style = {
  name: 'Flamethrower',
  async run(k) {
    const t = await morph(k);
    k.face();
    if (k.dist > 1.7) { dust(k, 380); await driveTo(k, 360, 0, 0.45, Easing.Cubic.Out); }
    const m = () => local(k, t.userData.muzzle);
    k.every(800, () => {
      const p = m();
      k.burst(p, 'fire', 10, { speed: 1.5, spread: Math.PI / 10, life: 0.7 });
    }, 2);
    await k.wait(320);
    void k.hit('burn', {}, 0.14);
    await k.wait(560);
    dust(k, 500);
    await driveTo(k, 480, k.dist > 1.7 ? 0.45 : 0, 1, Easing.Quadratic.InOut);
    await unmorph(k, t);
  },
};

const kill9: Style = {
  name: 'Bulldoze',
  async run(k) {
    const t = await morph(k);
    dust(k, 1100);
    const v = k.v;
    const vp = v?.position.clone();
    await driveTo(k, 760, 0, 0.92, Easing.Quadratic.In, (u) => {
      if (v && vp) {
        const front = k.a.position.clone().addScaledVector(k.dir, 0.8);
        if (front.distanceTo(k.from) > vp.distanceTo(k.from)) v.position.set(front.x, 0, front.z);
      }
    });
    void k.hit('launch', { power: 1.2 }, 0.2);
    await driveTo(k, 220, 0.92, 1, Easing.Cubic.Out);
    await unmorph(k, t);
  },
};

const kill10: Style = {
  name: 'Rocket pod',
  async run(k) {
    const t = await morph(k);
    k.face();
    const base = local(k, t.userData.turret).add(V(0, 0.3, 0));
    const tgt = k.to.clone().setY(0.2);
    const flights: Promise<void>[] = [];
    for (let i = 0; i < 6; i++) {
      const m = k.put(missile());
      m.position.copy(base);
      const end = tgt.clone().add(V((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7));
      m.lookAt(end);
      k.every(420, () => k.burst(m.position.clone(), 'smoke', 3, { life: 0.5, speed: 0.3 }), 2);
      k.burst(base, 'white', 4);
      flights.push(k.wait(i * 70).then(() => k.proj(m, base, end, 380, 1.4, Easing.Quadratic.In)).then(() => {
        k.drop(m); k.flash(end, 0xffb050, 0.6, 200); k.burst(end, 'fire', 8);
      }));
      await k.wait(70);
    }
    await Promise.all(flights);
    void k.hit('explode', {}, 0.25);
    dust(k, 600);
    await driveTo(k, 520, 0, 1, Easing.Quadratic.InOut);
    await unmorph(k, t);
  },
};

export const rook = { moves: [move1, move2], kills: [kill1, kill2, kill3, kill4, kill5, kill6, kill7, kill8, kill9, kill10] };
