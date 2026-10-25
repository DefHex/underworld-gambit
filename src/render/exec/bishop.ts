import * as THREE from 'three';
import { Easing } from '../tween';
import { Kit, Style } from './kit';
import { bolt, missile, parachute, rocket, Rocket } from './props';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** How high the rocket takes the bishop: scaled so one-square hops stay a hop, not a space shot. */
const apex = (k: Kit) => Math.min(4.4, 1.1 + k.dist * 0.5);

function strap(k: Kit): Rocket {
  const r = k.put(rocket(), k.rig);
  r.position.set(0, 0.02, -0.34);
  return r;
}

async function ignite(k: Kit, r: Rocket, ms = 260): Promise<void> {
  k.face();
  k.burst(k.from.clone().setY(0.1), 'smoke', 20, { spread: Math.PI / 2 });
  k.shake(0.05);
  await k.tw(ms, (u) => {
    r.userData.flame.scale.set(1, 0.3 + 1.3 * u, 1);
    k.a.position.set(k.from.x + Math.sin(u * 70) * 0.012, 0, k.from.z);
  }, Easing.Linear.None);
}

function smokeTrail(k: Kit, ms: number): void {
  k.every(ms, () => k.burst(k.a.position.clone().add(V(0, 0.15, 0)).addScaledVector(k.dir, -0.3), 'smoke', 4, { life: 0.7, speed: 0.4 }), 2);
}

/** Lifts off along a steep curve toward the target; returns when the apex is reached. */
async function ascend(k: Kit, h: number, u1 = 0.3, ms = 440): Promise<void> {
  smokeTrail(k, ms + 300);
  await k.tw(ms, (t) => {
    k.a.position.copy(k.at(u1 * t));
    k.a.position.y = h * t;
    k.a.rotation.x = 0.25 * t;
  }, Easing.Quadratic.In);
}

/** The spent rocket leaves the bishop and becomes its own falling prop. */
function release(k: Kit): Rocket {
  const r = k.rig.children.find((c) => (c as Rocket).userData?.flame) as Rocket;
  const p = k.a.position.clone().add(V(0, 0.2, 0)).addScaledVector(k.dir, -0.34);
  k.rig.remove(r);
  k.g.add(r);
  r.position.copy(p);
  r.rotation.set(0, 0, 0);
  return r;
}

async function tumbleDown(k: Kit, r: Rocket): Promise<void> {
  const p0 = r.position.clone();
  const sp = rnd(3, 6);
  await k.tw(420, (u) => {
    r.position.set(p0.x - k.dir.x * 0.5 * u, Math.max(0.1, p0.y * (1 - u * u)), p0.z - k.dir.z * 0.5 * u);
    r.rotation.x = sp * u; r.userData.flame.scale.set(1, 1 - u, 1);
  }, Easing.Linear.None);
  k.burst(r.position.clone(), 'fire', 12);
  k.flash(r.position.clone(), 0xffb050, 0.5, 200);
  k.drop(r);
}

function chuteOpen(k: Kit): THREE.Group {
  const c = k.put(parachute(), k.a);
  c.position.y = 1.0;
  c.scale.setScalar(0.01);
  void k.tw(240, (u) => c.scale.setScalar(Math.max(0.01, u)), Easing.Back.Out);
  return c;
}

async function descend(k: Kit, u0: number, h: number, ms: number, sway = 0.12): Promise<void> {
  await k.tw(ms, (t) => {
    k.a.position.copy(k.at(u0 + (1 - u0) * t));
    k.a.position.y = h * (1 - t);
    k.a.rotation.set(0.25 * (1 - t), k.a.rotation.y, Math.sin(t * 9) * sway * (1 - t));
  }, Easing.Sinusoidal.Out);
}

async function foldChute(k: Kit, c: THREE.Object3D): Promise<void> {
  k.burst(k.to.clone().setY(0.1), 'smoke', 12, { spread: Math.PI / 2 });
  await k.tw(200, (u) => c.scale.set(1 - 0.6 * u, Math.max(0.01, 1 - u), 1 - 0.6 * u));
  k.drop(c);
}

const move1: Style = {
  name: 'Rocket hop',
  async run(k) {
    const h = apex(k);
    const r = strap(k);
    await ignite(k, r);
    await ascend(k, h, 0.35, 380 + h * 40);
    void tumbleDown(k, release(k));
    const c = chuteOpen(k);
    await descend(k, 0.35, h, 520 + h * 200);
    await foldChute(k, c);
  },
};

const move2: Style = {
  name: 'Corkscrew glide',
  async run(k) {
    const h = apex(k) * 0.9;
    const r = strap(k);
    await ignite(k, r, 200);
    smokeTrail(k, 900);
    await k.tw(520 + h * 60, (t) => {
      k.a.position.copy(k.at(0.7 * t));
      k.a.position.y = h * Math.sin(t * Math.PI * 0.5);
      k.a.rotation.y += 0.45;
    }, Easing.Quadratic.Out);
    void tumbleDown(k, release(k));
    const c = chuteOpen(k);
    k.face();
    await descend(k, 0.7, k.a.position.y, 420 + h * 160, 0.18);
    await foldChute(k, c);
  },
};

// ---------- the ten kills ----------

const kill1: Style = {
  name: 'Orbital strike',
  async run(k) {
    const r = strap(k);
    await ignite(k, r);
    await ascend(k, 3.8, 0.05, 420);
    const rk = release(k);
    const c = chuteOpen(k);
    const tgt = k.to.clone().setY(0.1);
    rk.rotation.x = Math.PI; // nose down
    const start = rk.position.clone();
    const dive = k.proj(rk, start, tgt, 360, 0, Easing.Quadratic.In);
    await dive;
    k.drop(rk);
    k.flash(tgt, 0xffd070, 1.4);
    void k.hit('explode', {}, 0.22);
    await descend(k, 0.05, 3.8, 900, 0.1);
    await foldChute(k, c);
  },
};

const kill2: Style = {
  name: 'Rocket ram',
  async run(k) {
    const r = strap(k);
    await ignite(k, r, 200);
    smokeTrail(k, 600);
    k.a.rotation.x = 0;
    await k.tw(380, (u) => {
      k.a.position.copy(k.at(0.92 * u)); k.a.position.y = 0.25 * Math.sin(u * Math.PI);
      k.a.rotation.x = 1.1 * Math.min(1, u * 4);
    }, Easing.Quadratic.In);
    void k.hit('launch', { power: 1.3 }, 0.2);
    k.flash(k.to.clone().setY(0.4), 0xffffff, 1.1);
    // the bishop ejects, the rocket flies off on its own
    void tumbleDown(k, release(k));
    const c = chuteOpen(k);
    await k.tw(420, (u) => {
      k.a.position.copy(k.at(0.92 + 0.08 * u)); k.a.position.y = 0.9 * Math.sin(u * Math.PI);
      k.a.rotation.x = 1.1 * (1 - u);
    }, Easing.Cubic.Out);
    await foldChute(k, c);
  },
};

const kill3: Style = {
  name: 'Paratrooper stomp',
  async run(k) {
    const h = 3.2;
    const r = strap(k);
    await ignite(k, r);
    await ascend(k, h, 0.0, 400);
    await k.tw(320, (u) => { k.a.position.copy(k.at(0.97 * u)); k.a.position.y = h; k.a.rotation.x = 0; }, Easing.Cubic.InOut);
    void tumbleDown(k, release(k));
    await k.wait(120);
    await k.tw(280, (u) => { k.a.position.y = h * (1 - u); k.a.scale.set(1 - 0.12 * u, 1 + 0.2 * u, 1 - 0.12 * u); }, Easing.Quadratic.In);
    k.a.scale.setScalar(1);
    void k.hit('squash', {}, 0.24);
    k.ring(k.to.clone(), 0xffe9c0, 2);
    await k.tw(380, (u) => { k.a.position.copy(k.at(0.97 + 0.03 * u)); k.a.position.y = 0.5 * Math.sin(u * Math.PI); }, Easing.Cubic.Out);
  },
};

const kill4: Style = {
  name: 'Divine smite',
  async run(k) {
    const r = strap(k);
    await ignite(k, r);
    await ascend(k, 3.4, 0.2, 420);
    void tumbleDown(k, release(k));
    const c = chuteOpen(k);
    await k.wait(200);
    const top = k.to.clone().setY(4.6);
    for (let i = 0; i < 4; i++) {
      const b = k.put(bolt(top, k.to.clone().setY(0.1)));
      await k.wait(70);
      k.drop(b);
      await k.wait(40);
    }
    k.flash(k.to.clone().setY(0.4), 0xcfe8ff, 1.5);
    void k.hit('zap', {}, 0.2);
    await descend(k, 0.2, 3.4, 950, 0.1);
    await foldChute(k, c);
  },
};

const kill5: Style = {
  name: 'Cluster barrage',
  async run(k) {
    const r = strap(k);
    await ignite(k, r);
    await ascend(k, 3.2, 0.1, 420);
    const rk = release(k);
    k.burst(rk.position.clone(), 'fire', 20); k.flash(rk.position.clone(), 0xffe0a0, 0.8);
    k.drop(rk);
    const c = chuteOpen(k);
    const origin = k.a.position.clone().add(V(0, 0.3, 0));
    const shots = [V(0.4, 0, 0.2), V(-0.35, 0, 0.3), V(0.05, 0, -0.4), V(0, 0, 0)].map((o) => k.to.clone().add(o).setY(0.1));
    const ms = shots.map((t, i) => {
      const m = k.put(missile());
      m.position.copy(origin);
      m.lookAt(t);
      k.every(380 + i * 90, () => k.burst(m.position.clone(), 'smoke', 3, { life: 0.5, speed: 0.3 }), 2);
      return k.wait(i * 90).then(() => k.proj(m, origin, t, 380, 0.4, Easing.Quadratic.In)).then(() => {
        k.drop(m); k.flash(t.clone().setY(0.3), 0xffb050, 0.7, 220); k.burst(t.clone(), 'fire', 12);
      });
    });
    await Promise.all(ms.slice(0, 3));
    void k.hit('explode', {}, 0.2);
    await Promise.all(ms);
    await descend(k, 0.1, 3.2, 800, 0.1);
    await foldChute(k, c);
  },
};

const kill6: Style = {
  name: 'Spiral dive kick',
  async run(k) {
    const h = 3;
    const r = strap(k);
    await ignite(k, r, 220);
    await ascend(k, h, 0.25, 380);
    void tumbleDown(k, release(k));
    const c = chuteOpen(k);
    const side = V(-k.dir.z, 0, k.dir.x);
    await k.tw(1100, (t) => {
      const radius = 0.9 * (1 - t);
      const ang = t * Math.PI * 4;
      const p = k.to.clone().addScaledVector(side, Math.sin(ang) * radius).addScaledVector(k.dir, -Math.cos(ang) * radius * 0.6);
      k.a.position.set(p.x, h * (1 - t * t), p.z);
      k.a.rotation.z = Math.sin(ang) * 0.2;
    }, Easing.Quadratic.InOut);
    void k.hit('launch', { power: 1.1 }, 0.16);
    k.flash(k.to.clone().setY(0.4), 0xffffff, 0.9);
    k.a.position.set(k.to.x, 0, k.to.z);
    await foldChute(k, c);
  },
};

const kill7: Style = {
  name: 'Human cannonball',
  async run(k) {
    const r = strap(k);
    await ignite(k, r, 300);
    k.burst(k.from.clone().setY(0.2), 'fire', 24, { speed: 1.6 });
    smokeTrail(k, 700);
    await k.tw(420, (u) => {
      k.a.position.copy(k.at(u)); k.a.position.y = 0.4 + 1.1 * 4 * u * (1 - u);
      k.a.rotation.x = u * Math.PI * 4;
    }, Easing.Linear.None);
    k.a.rotation.x = 0;
    void tumbleDown(k, release(k));
    void k.hit('topple', {}, 0.22);
    k.burst(k.to.clone().setY(0.2), 'smoke', 22);
    await k.tw(300, (u) => { k.a.position.y = 0.3 * Math.sin(u * Math.PI); }, Easing.Cubic.Out);
  },
};

const kill8: Style = {
  name: 'Fireworks finale',
  async run(k) {
    const r = strap(k);
    await ignite(k, r);
    await ascend(k, 3.6, 0.1, 440);
    const rk = release(k);
    const top = rk.position.clone();
    await k.tw(200, (u) => { rk.position.y = top.y + 0.8 * u; }, Easing.Quadratic.Out);
    k.drop(rk);
    for (const [pal, hex] of [['gold', 0xffd060], ['violet', 0xb080ff], ['white', 0xffffff]] as const) {
      k.burst(top.clone().add(V(rnd(-0.4, 0.4), 0.6, rnd(-0.4, 0.4))), pal, 40, { speed: 1.5, spread: Math.PI, life: 1.2 });
      k.ring(top.clone().setY(top.y + 0.6), hex, 2.2, 600);
      await k.wait(120);
    }
    const c = chuteOpen(k);
    k.every(1100, () => k.burst(k.to.clone().setY(0.6), 'fire', 6, { speed: 0.4 }), 3);
    void k.hit('burn', {}, 0.1);
    await descend(k, 0.1, 3.6, 1000, 0.1);
    await foldChute(k, c);
  },
};

const kill9: Style = {
  name: 'Glide-in landing',
  async run(k) {
    const r = strap(k);
    await ignite(k, r, 220);
    await ascend(k, 2.4, 0.3, 380);
    void tumbleDown(k, release(k));
    const c = chuteOpen(k);
    k.face();
    await k.tw(760, (t) => {
      k.a.position.copy(k.at(0.3 + 0.62 * t)); k.a.position.y = 2.4 * (1 - t);
      k.a.rotation.z = Math.sin(t * 6) * 0.15 * (1 - t);
    }, Easing.Linear.None);
    void k.hit('squash', {}, 0.2);
    k.ring(k.to.clone(), 0xffe9c0, 1.6);
    await k.tw(260, (u) => { k.a.position.copy(k.at(0.92 + 0.08 * u)); k.a.position.y = 0; });
    await foldChute(k, c);
  },
};

const kill10: Style = {
  name: 'Drag-chute ram',
  async run(k) {
    const r = strap(k);
    await ignite(k, r, 220);
    smokeTrail(k, 800);
    k.every(800, () => k.burst(k.a.position.clone().setY(0.05), 'gold', 5, { speed: 0.8, spread: Math.PI / 2 }), 2);
    let hitDone = false;
    await k.tw(640, (u) => {
      k.a.position.copy(k.at(u)); k.a.position.y = 0.05;
      k.a.rotation.x = 1.25;
      if (!hitDone && u > 0.72) { hitDone = true; void k.hit('launch', { power: 1.6 }, 0.22); }
    }, Easing.Quadratic.Out);
    void tumbleDown(k, release(k));
    const c = k.put(parachute(), k.a);
    c.position.set(0, 0.5, -0.1);
    c.rotation.x = -1.2;
    await k.tw(300, (u) => { c.scale.setScalar(Math.max(0.01, u)); k.a.rotation.x = 1.25 * (1 - u); }, Easing.Back.Out);
    await foldChute(k, c);
  },
};

export const bishop = { moves: [move1, move2], kills: [kill1, kill2, kill3, kill4, kill5, kill6, kill7, kill8, kill9, kill10] };
