import * as THREE from 'three';
import { Easing } from '../tween';
import { Kit, Style } from './kit';
import { lance, sword } from './props';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Gallop along the line between two fractions, with hoof bounces and a rocking body. */
function gallop(k: Kit, ms: number, u0: number, u1: number, hop = 0.16, ease: (n: number) => number = Easing.Quadratic.InOut): Promise<void> {
  k.face();
  k.sfx('gallop');
  const beats = Math.max(2, Math.round(Math.abs(u1 - u0) * k.dist * 2.2));
  const dustAt = Math.max(2, Math.round(ms / 90));
  let n = 0;
  return k.tw(ms, (t) => {
    const u = u0 + (u1 - u0) * t;
    k.a.position.copy(k.at(u));
    k.a.position.y = hop * Math.abs(Math.sin(t * Math.PI * beats));
    k.a.rotation.x = Math.cos(t * Math.PI * beats * 2) * 0.07;
    if (++n % dustAt === 0) k.burst(k.a.position.clone().setY(0.05), 'smoke', 3, { life: 0.5, speed: 0.4, spread: Math.PI / 2 });
  }, ease);
}

function rear(k: Kit, ms: number, angle = -0.95): Promise<void> {
  return k.tw(ms, (u) => { k.a.rotation.x = angle * u; k.a.position.y = 0.05 * u; }, Easing.Back.Out);
}
function drop(k: Kit, ms: number, from = -0.95): Promise<void> {
  return k.tw(ms, (u) => { k.a.rotation.x = from * (1 - u); k.a.position.y = 0.05 * (1 - u); }, Easing.Quadratic.In);
}

function holdLance(k: Kit) {
  const l = k.put(lance(), k.rig);
  l.position.set(0.15, 0.78, 0.08);
  return l;
}
function holdSword(k: Kit) {
  const s = k.put(sword(), k.rig);
  s.position.set(0.17, 0.78, 0.1);
  s.rotation.x = -0.3;
  return s;
}
const slash = (k: Kit, p: THREE.Vector3, hex = 0xffffff) => { k.sfx('slash'); k.flash(p, hex, 0.5, 140); k.burst(p, 'white', 8, { speed: 1.3 }); };

const move1: Style = {
  name: 'Gallop leap',
  async run(k) {
    await gallop(k, 260 + k.dist * 150, 0, 0.78, 0.14, Easing.Quadratic.In);
    await k.tw(380, (u) => {
      k.a.position.copy(k.at(0.78 + 0.22 * u));
      k.a.position.y = 0.9 * 4 * u * (1 - u);
      k.a.rotation.x = -0.5 * Math.sin(u * Math.PI);
    }, Easing.Linear.None);
    k.burst(k.to.clone().setY(0.05), 'smoke', 14, { spread: Math.PI / 2 });
    k.shake(0.04);
  },
};

const move2: Style = {
  name: 'Rear and charge',
  async run(k) {
    k.face();
    await rear(k, 260);
    k.burst(k.from.clone().setY(0.5), 'smoke', 8);
    await drop(k, 140);
    await gallop(k, 360 + k.dist * 150, 0, 1, 0.12, Easing.Quadratic.Out);
  },
};

const kill1: Style = {
  name: 'Lance impale',
  async run(k) {
    const l = holdLance(k);
    await gallop(k, 520, 0, 0.78, 0.12, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    await k.tw(140, (u) => { l.position.z = 0.08 + 0.25 * u; }, Easing.Quadratic.Out); // couch the lance
    const v = k.v;
    const p = k.to.clone();
    await k.tw(300, (u) => {
      k.a.position.copy(k.at(0.78 + 0.12 * u));
      if (v) v.position.set(p.x, 0.6 * u, p.z).addScaledVector(k.dir, -(0.1 - 0.5 * u * 0));
    }, Easing.Quadratic.In);
    slash(k, k.to.clone().setY(0.6), 0xffe0a0);
    // carry the victim up on the lance, then fling it
    await k.tw(320, (u) => {
      k.a.position.copy(k.at(0.9 + 0.1 * u));
      if (v) v.position.copy(k.at(0.9 + 0.1 * u)).addScaledVector(k.dir, 0.9).setY(0.6 + 1.1 * u);
      l.rotation.x = -0.5 * u;
    }, Easing.Cubic.Out);
    void k.hit('launch', { power: 1.4 }, 0.2);
    await k.tw(220, (u) => { l.rotation.x = -0.5 * (1 - u); });
  },
};

const kill2: Style = {
  name: 'Trample',
  async run(k) {
    await gallop(k, 420, 0, 0.72, 0.12, Easing.Quadratic.In);
    for (let i = 0; i < 3; i++) {
      await rear(k, 170, -0.75);
      await drop(k, 110, -0.75);
      k.ring(k.at(0.78), 0xffe9c0, 1.1, 300);
      k.shake(0.1);
      if (i === 1) void k.hit('squash', {}, 0.2);
    }
    await gallop(k, 260, 0.72, 1, 0.1, Easing.Cubic.Out);
  },
};

const kill3: Style = {
  name: 'Sword flurry',
  async run(k) {
    const s = holdSword(k);
    await gallop(k, 460, 0, 0.74, 0.12, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    for (let i = 0; i < 3; i++) {
      await k.tw(110, (u) => { s.position.z = 0.1 + 0.4 * u; s.rotation.x = -0.3 + 0.3 * u; }, Easing.Quadratic.Out);
      slash(k, k.to.clone().setY(0.5 + i * 0.1), 0xff9a7a);
      k.shake(0.05);
      if (i === 2) void k.hit('topple', {}, 0.18);
      await k.tw(110, (u) => { s.position.z = 0.5 - 0.4 * u; });
    }
    await gallop(k, 260, 0.74, 1, 0.1, Easing.Cubic.Out);
  },
};

const kill4: Style = {
  name: 'Pole-vault',
  async run(k) {
    const l = holdLance(k);
    await gallop(k, 420, 0, 0.45, 0.1, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    await k.tw(160, (u) => { l.rotation.x = 1.0 * u; }, Easing.Quadratic.Out); // point it at the ground
    k.shake(0.06);
    await k.tw(560, (u) => {
      k.a.position.copy(k.at(0.45 + 0.55 * u));
      k.a.position.y = 2.2 * 4 * u * (1 - u);
      k.a.rotation.x = -0.9 * Math.sin(u * Math.PI) + 0.8 * u * u;
    }, Easing.Linear.None);
    k.a.rotation.x = 0;
    void k.hit('squash', {}, 0.3);
    k.ring(k.to.clone(), 0xffe9c0, 2);
  },
};

const kill5: Style = {
  name: 'Rearing strike',
  async run(k) {
    await gallop(k, 400, 0, 0.78, 0.12, Easing.Quadratic.Out);
    await rear(k, 320, -1.0);
    k.burst(k.at(0.78, 0.9), 'smoke', 10);
    await k.wait(160);
    await drop(k, 120, -1.0);
    void k.hit('squash', {}, 0.28);
    k.ring(k.at(0.88), 0xffe9c0, 1.8);
    await gallop(k, 260, 0.78, 1, 0.08, Easing.Cubic.Out);
  },
};

const kill6: Style = {
  name: 'Joust sweep',
  async run(k) {
    const l = holdLance(k);
    const side = V(-k.dir.z, 0, k.dir.x);
    let hit = false;
    k.face();
    await k.tw(300, (u) => { l.rotation.y = -1.45 * u; l.position.set(0.15 - 0.1 * u, 0.78, 0.08); }, Easing.Cubic.Out);
    await k.tw(700, (t) => {
      const u = t;
      const off = 0.8 * (1 - u) * Math.sin(u * Math.PI * 0.5 + 1.2);
      k.a.position.copy(k.at(u)).addScaledVector(side, 0.7 * (1 - t));
      k.a.position.y = 0.12 * Math.abs(Math.sin(t * Math.PI * 4));
      k.a.rotation.y = Math.atan2(k.dir.x - side.x * 0.7 * (1 - t), k.dir.z - side.z * 0.7 * (1 - t)) - k.rig.rotation.y;
      void off;
      if (!hit && t > 0.78) { hit = true; slash(k, k.to.clone().setY(0.6), 0xffe0a0); void k.hit('launch', { dir: side.clone().negate(), power: 1.3 }, 0.18); }
    }, Easing.Quadratic.In);
  },
};

const kill7: Style = {
  name: 'Buck kick',
  async run(k) {
    await gallop(k, 420, 0, 0.68, 0.12, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    const yaw0 = k.a.rotation.y;
    await k.tw(220, (u) => { k.a.rotation.y = yaw0 + Math.PI * u; }, Easing.Cubic.InOut);
    await k.tw(160, (u) => { k.a.rotation.x = 0.8 * u; k.a.position.y = 0.04; }, Easing.Quadratic.Out); // hind quarters up, kick
    k.flash(k.at(0.78, 0.5), 0xffffff, 0.7, 180);
    void k.hit('launch', { power: 2 }, 0.26);
    await k.tw(200, (u) => { k.a.rotation.x = 0.8 * (1 - u); });
    await k.tw(200, (u) => { k.a.rotation.y = yaw0 + Math.PI * (1 - u); }, Easing.Cubic.InOut);
    await gallop(k, 240, 0.68, 1, 0.08, Easing.Cubic.Out);
  },
};

const kill8: Style = {
  name: 'Whirlwind',
  async run(k) {
    const s = holdSword(k);
    await gallop(k, 420, 0, 0.8, 0.12, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    const yaw0 = k.a.rotation.y;
    s.position.set(0.3, 0.7, 0.1);
    s.rotation.set(0, Math.PI / 2, 0);
    let hit = false;
    k.every(640, () => k.burst(k.a.position.clone().setY(0.6), 'white', 4, { life: 0.4, spread: Math.PI }), 2);
    await k.tw(640, (u) => {
      k.a.rotation.y = yaw0 + u * Math.PI * 6;
      k.a.position.copy(k.at(0.8 + 0.1 * u));
      if (!hit && u > 0.45) { hit = true; k.ring(k.to.clone().setY(0.4), 0xffffff, 1.8, 400); void k.hit('explode', {}, 0.22); }
    }, Easing.Cubic.InOut);
    k.a.rotation.y = yaw0;
    await gallop(k, 200, 0.9, 1, 0.06, Easing.Cubic.Out);
  },
};

const kill9: Style = {
  name: 'Lance throw',
  async run(k) {
    const l = holdLance(k);
    k.face();
    await k.wait(120);
    k.rig.remove(l);
    k.g.add(l);
    const p0 = k.from.clone().setY(0.85).addScaledVector(k.dir, 0.4);
    const p1 = k.to.clone().setY(0.45);
    l.position.copy(p0);
    l.lookAt(p1);
    k.shake(0.04);
    await k.proj(l, p0, p1, 260, 0.35, Easing.Quadratic.In);
    slash(k, p1, 0xffe0a0);
    const v = k.v;
    await k.tw(120, (u) => { if (v) v.position.x = k.to.x + Math.sin(u * 60) * 0.03; }, Easing.Linear.None);
    await gallop(k, 460, 0, 0.92, 0.12, Easing.Quadratic.In);
    k.drop(l);
    k.flash(k.to.clone().setY(0.5), 0xffffff, 0.8);
    void k.hit('launch', { power: 1.6 }, 0.2);
    await gallop(k, 160, 0.92, 1, 0.05, Easing.Cubic.Out);
  },
};

const kill10: Style = {
  name: 'Leap and plunge',
  async run(k) {
    const l = holdLance(k);
    await gallop(k, 320, 0, 0.3, 0.1, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    await k.tw(660, (u) => {
      k.a.position.copy(k.at(0.3 + 0.7 * u));
      k.a.position.y = 3.2 * 4 * u * (1 - u);
      k.a.rotation.x = u < 0.5 ? -0.5 * (u * 2) : -0.5 + 1.9 * (u - 0.5) * 2 * 0.5 + 0.5 * (u - 0.5) * 0;
      l.rotation.x = u > 0.45 ? 1.0 * Math.min(1, (u - 0.45) * 5) : 0;
    }, Easing.Linear.None);
    k.a.rotation.x = 0;
    l.rotation.x = 0;
    void k.hit('explode', {}, 0.32);
    k.ring(k.to.clone(), 0xffd070, 2.4);
    await k.tw(260, (u) => { k.a.position.y = 0.4 * Math.sin(u * Math.PI); }, Easing.Cubic.Out);
  },
};

export const knight = { moves: [move1, move2], kills: [kill1, kill2, kill3, kill4, kill5, kill6, kill7, kill8, kill9, kill10] };
