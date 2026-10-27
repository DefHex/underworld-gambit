import * as THREE from 'three';
import { PAL } from '../pieces';
import { Easing } from '../tween';
import { Kit, Style } from './kit';
import { blade, crownProp, glow, hammer, mesh, sword, throne } from './props';
import { part } from '../pieces';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function stride(k: Kit, ms: number, u0: number, u1: number, ease: (n: number) => number = Easing.Cubic.InOut, stomps = true): Promise<void> {
  k.face();
  const steps = Math.max(2, Math.round(Math.abs(u1 - u0) * k.dist * 1.6));
  let last = 0;
  return k.tw(ms, (t) => {
    k.a.position.copy(k.at(u0 + (u1 - u0) * t));
    const ph = Math.abs(Math.sin(t * Math.PI * steps));
    k.a.position.y = 0.09 * ph;
    k.a.rotation.z = Math.cos(t * Math.PI * steps) * 0.06;
    const step = Math.floor(t * steps);
    if (stomps && step !== last && t < 0.98) { last = step; k.shake(0.03); k.burst(k.a.position.clone().setY(0.05), 'smoke', 3, { life: 0.4, speed: 0.3, spread: Math.PI / 2 }); }
  }, ease);
}

const hold = (k: Kit, o: THREE.Object3D, x = 0.3, y = 0.55, z = 0.1) => { const p = k.put(o, k.rig); p.position.set(x, y, z); return p; };

const move1: Style = {
  name: 'Royal stride',
  async run(k) { await stride(k, 420 + k.dist * 230, 0, 1); k.ring(k.to.clone(), 0xe0b040, 1.1, 360); },
};

const move2: Style = {
  name: 'Decree sweep',
  async run(k) {
    k.face();
    const base = k.a.rotation.y;
    k.every(520 + k.dist * 200, () => k.burst(k.a.position.clone().setY(0.9), 'gold', 4, { life: 0.8, speed: 0.5, spread: Math.PI }), 3);
    await k.tw(520 + k.dist * 200, (t) => {
      k.a.position.copy(k.at(t));
      k.a.rotation.y = base + t * Math.PI * 2;
      k.a.position.y = 0.06 * Math.sin(t * Math.PI * 3);
    }, Easing.Cubic.InOut);
    k.ring(k.to.clone(), 0xe0b040, 1.3, 360);
  },
};

const kill1: Style = {
  name: 'Royal stomp',
  async run(k) {
    await stride(k, 420, 0, 0.7, Easing.Quadratic.Out);
    await k.tw(260, (u) => { k.a.position.copy(k.at(0.7 + 0.3 * u)); k.a.position.y = 0.9 * 4 * u * (1 - u); }, Easing.Linear.None);
    void k.hit('squash', {}, 0.3);
    k.ring(k.to.clone(), 0xe0b040, 2.2, 520);
    await k.wait(200);
  },
};

const kill2: Style = {
  name: 'Scepter smash',
  async run(k) {
    const h = hold(k, hammer(), 0.32, 0.2, 0.15);
    if (k.dist > 1.7) await stride(k, 360, 0, 0.55, Easing.Cubic.Out);
    await k.tw(300, (u) => { h.rotation.x = -2.4 * u; k.a.position.y = 0.05 * u; }, Easing.Cubic.Out);
    await k.wait(100);
    await k.tw(130, (u) => { h.rotation.x = -2.4 + 3.3 * u; }, Easing.Quadratic.In);
    k.ring(k.to.clone(), 0xffffff, 2, 450);
    k.flash(k.to.clone().setY(0.4), 0xffe9c0, 1.2, 220);
    void k.hit('squash', {}, 0.34);
    await k.wait(260);
    await stride(k, 240, k.dist > 1.7 ? 0.55 : 0, 1, Easing.Cubic.Out, false);
  },
};

const kill3: Style = {
  name: 'Decree beam',
  async run(k) {
    if (k.dist > 1.7) await stride(k, 360, 0, 0.55, Easing.Cubic.Out);
    k.face();
    await k.tw(260, (u) => { k.a.rotation.x = -0.25 * u; k.a.position.y = 0.1 * u; }, Easing.Cubic.Out);
    const mat = glow(0xffe08a, 0.85);
    const beam = k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 14, 1, true), mat));
    beam.position.set(k.to.x, 3.5, k.to.z);
    k.flash(k.a.position.clone().setY(1.3), 0xffe08a, 0.9, 260);
    void k.hit('burn', {}, 0.16);
    await k.tw(700, (u) => { mat.opacity = 0.85 * (1 - u * u); beam.scale.set(1 + 0.4 * Math.sin(u * 30) * 0.1, 1, 1 + 0.4 * Math.sin(u * 30) * 0.1); }, Easing.Linear.None);
    k.a.rotation.x = 0;
    await stride(k, 260, k.dist > 1.7 ? 0.55 : 0, 1, Easing.Cubic.Out, false);
  },
};

const kill4: Style = {
  name: 'Executioner cleave',
  async run(k) {
    const s = hold(k, sword(), 0.3, 0.6, 0.1);
    s.scale.setScalar(1.4);
    if (k.dist > 1.7) await stride(k, 360, 0, 0.6, Easing.Cubic.Out);
    await stride(k, 220, k.dist > 1.7 ? 0.6 : 0, 0.75, Easing.Cubic.Out, false);
    await k.tw(300, (u) => { s.rotation.x = -2.5 * u; }, Easing.Cubic.Out);
    await k.tw(110, (u) => { s.rotation.x = -2.5 + 3.4 * u; }, Easing.Quadratic.In);
    k.flash(k.to.clone().setY(0.6), 0xffffff, 1, 180);
    k.burst(k.to.clone().setY(0.6), 'white', 14, { speed: 1.5 });
    void k.hit('topple', {}, 0.22);
    await k.wait(240);
    await stride(k, 220, 0.75, 1, Easing.Cubic.Out, false);
  },
};

const kill5: Style = {
  name: 'Throne drop',
  async run(k) {
    k.face();
    const t = k.put(throne());
    t.position.set(k.to.x, 6, k.to.z);
    t.rotation.y = Math.atan2(-k.dir.x, -k.dir.z);
    await k.tw(540, (u) => { t.position.y = 6 * (1 - u); }, Easing.Quadratic.In);
    void k.hit('squash', {}, 0.34);
    k.ring(k.to.clone(), 0xe0b040, 2.4, 520);
    k.burst(k.to.clone().setY(0.2), 'smoke', 28, { spread: Math.PI / 2 });
    await k.wait(280);
    await stride(k, 520, 0, 1, Easing.Cubic.InOut);
    await k.tw(320, (u) => t.scale.setScalar(Math.max(0.01, 1 - u)), Easing.Cubic.In);
    k.drop(t);
  },
};

const kill6: Style = {
  name: 'Shield bash',
  async run(k) {
    const sh = hold(k, mesh(part(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 10), PAL[k.a.userData.color].trim, { rx: Math.PI / 2 })), 0, 0.55, 0.38);
    await stride(k, 360, 0, 0.7, Easing.Quadratic.In);
    k.a.rotation.x = 0.35;
    let hit = false;
    await k.tw(200, (u) => {
      k.a.position.copy(k.at(0.7 + 0.25 * u));
      if (!hit && u > 0.7) { hit = true; void k.hit('launch', { power: 1.5 }, 0.26); k.flash(k.to.clone().setY(0.6), 0xffffff, 1, 200); }
    }, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    void sh;
    await stride(k, 220, 0.95, 1, Easing.Cubic.Out, false);
  },
};

const kill7: Style = {
  name: 'Royal charge',
  async run(k) {
    k.face();
    k.every(700, () => k.burst(k.a.position.clone().setY(0.05).addScaledVector(k.dir, -0.3), 'smoke', 5, { life: 0.5, speed: 0.5, spread: Math.PI / 2 }), 2);
    let hit = false;
    await k.tw(620, (u) => {
      k.a.position.copy(k.at(u * 0.95));
      k.a.rotation.x = 0.3 * Math.min(1, u * 4);
      k.a.position.y = 0.1 * Math.abs(Math.sin(u * Math.PI * 6));
      if (!hit && u > 0.88) { hit = true; void k.hit('launch', { power: 2 }, 0.28); k.flash(k.to.clone().setY(0.5), 0xffe9c0, 1.1); }
    }, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    await stride(k, 200, 0.95, 1, Easing.Cubic.Out, false);
  },
};

const kill8: Style = {
  name: 'Guillotine',
  async run(k) {
    if (k.dist > 1.7) await stride(k, 360, 0, 0.55, Easing.Cubic.Out);
    k.face();
    const b = k.put(blade());
    b.position.set(k.to.x, 4.5, k.to.z);
    b.rotation.y = Math.atan2(k.dir.x, k.dir.z);
    const frame = k.put(mesh(part(new THREE.BoxGeometry(0.7, 0.05, 0.08), 0x6a4a2a, { y: 4.9 })));
    frame.position.set(k.to.x, 0, k.to.z);
    await k.tw(260, (u) => { k.a.rotation.x = -0.3 * u; }, Easing.Cubic.Out); // king raises a hand
    await k.wait(180);
    await k.tw(220, (u) => { b.position.y = 4.5 - 4.2 * u; }, Easing.Quadratic.In);
    k.sfx('clang');
    k.flash(k.to.clone().setY(0.4), 0xffffff, 1, 180);
    void k.hit('topple', {}, 0.3);
    await k.wait(300);
    await k.tw(220, (u) => { b.position.y = 0.3 + 4.2 * u; b.scale.setScalar(1 - 0.9 * u); }, Easing.Quadratic.Out);
    k.a.rotation.x = 0;
    await stride(k, 260, k.dist > 1.7 ? 0.55 : 0, 1, Easing.Cubic.Out, false);
  },
};

const kill9: Style = {
  name: 'Crown toss',
  async run(k) {
    k.face();
    const c = k.put(crownProp(PAL[k.a.userData.color].trim));
    const p0 = k.from.clone().setY(1.3);
    const p1 = k.to.clone().setY(0.5);
    c.position.copy(p0);
    await k.tw(200, (u) => { k.a.rotation.x = -0.3 * u; }, Easing.Cubic.Out);
    k.every(700, () => k.burst(c.position.clone(), 'gold', 3, { life: 0.4, speed: 0.3 }), 2);
    await k.proj(c, p0, p1, 280, 0.5, Easing.Quadratic.In);
    void k.hit('zap', {}, 0.2);
    await k.tw(300, (u) => { c.position.copy(p1).lerp(p0, u); c.position.y += 0.5 * Math.sin(u * Math.PI); c.rotation.y += 0.7; }, Easing.Quadratic.Out);
    k.drop(c);
    k.a.rotation.x = 0;
    k.burst(k.from.clone().setY(1.3), 'gold', 12);
    await stride(k, 420 + k.dist * 80, 0, 1, Easing.Cubic.InOut, false);
  },
};

const kill10: Style = {
  name: 'Cape sweep',
  async run(k) {
    if (k.dist > 1.7) await stride(k, 360, 0, 0.7, Easing.Cubic.Out);
    k.face();
    const base = k.a.rotation.y;
    let hit = false;
    k.every(520, () => k.burst(k.a.position.clone().setY(0.6), 'white', 4, { life: 0.4, spread: Math.PI }), 2);
    await k.tw(520, (u) => {
      k.a.position.copy(k.at((k.dist > 1.7 ? 0.7 : 0) + (k.dist > 1.7 ? 0.25 : 0.9) * u));
      k.a.rotation.y = base + u * Math.PI * 4;
      if (!hit && u > 0.55) { hit = true; k.ring(k.to.clone().setY(0.3), 0xffffff, 1.8, 400); void k.hit('launch', { power: 1.4 }, 0.2); }
    }, Easing.Cubic.InOut);
    k.a.rotation.y = base;
    await stride(k, 220, 0.95, 1, Easing.Cubic.Out, false);
    void V;
  },
};

export const king = { moves: [move1, move2], kills: [kill1, kill2, kill3, kill4, kill5, kill6, kill7, kill8, kill9, kill10] };
