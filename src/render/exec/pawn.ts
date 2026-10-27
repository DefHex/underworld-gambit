import * as THREE from 'three';
import { pieceGeometry } from '../pieces';
import { Easing } from '../tween';
import { Kit, Style } from './kit';
import { dagger, mesh, pitchfork, torch } from './props';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function march(k: Kit, ms: number, u0: number, u1: number, hop = 0.14, ease: (n: number) => number = Easing.Quadratic.InOut): Promise<void> {
  k.face();
  const beats = Math.max(2, Math.round(Math.abs(u1 - u0) * k.dist * 2));
  return k.tw(ms, (t) => {
    k.a.position.copy(k.at(u0 + (u1 - u0) * t));
    k.a.position.y = hop * Math.abs(Math.sin(t * Math.PI * beats));
    k.a.rotation.z = Math.sin(t * Math.PI * beats) * 0.08;
  }, ease);
}
const hold = (k: Kit, o: THREE.Object3D, x = 0.22, y = 0.35, z = 0.1) => { const p = k.put(o, k.rig); p.position.set(x, y, z); return p; };
const spark = (k: Kit, p: THREE.Vector3, hex = 0xffffff) => { k.sfx('slash'); k.flash(p, hex, 0.45, 140); k.burst(p, 'white', 6, { speed: 1.2 }); };

const move1: Style = {
  name: 'Soldier march',
  async run(k) { await march(k, 300 + k.dist * 220, 0, 1); },
};

const move2: Style = {
  name: 'Sprint and skid',
  async run(k) {
    k.face();
    k.every(300 + k.dist * 150, () => k.burst(k.a.position.clone().setY(0.05), 'smoke', 3, { life: 0.4, speed: 0.4, spread: Math.PI / 2 }), 2);
    await k.tw(300 + k.dist * 150, (u) => {
      k.a.position.copy(k.at(u));
      k.a.rotation.x = 0.35 * Math.sin(u * Math.PI);
    }, Easing.Quadratic.Out);
    k.a.rotation.x = 0;
  },
};

const kill1: Style = {
  name: 'Pitchfork stab',
  async run(k) {
    const f = hold(k, pitchfork(), 0.2, 0.3, 0.05);
    await march(k, 340, 0, 0.72, 0.1, Easing.Quadratic.In);
    await k.tw(100, (u) => { f.position.z = 0.05 + 0.4 * u; }, Easing.Quadratic.Out);
    spark(k, k.to.clone().setY(0.4), 0xffd0a0);
    void k.hit('topple', {}, 0.15);
    await k.wait(160);
    await march(k, 200, 0.72, 1, 0.06, Easing.Cubic.Out);
  },
};

const kill2: Style = {
  name: 'Dagger flurry',
  async run(k) {
    const d = hold(k, dagger(), 0.2, 0.3, 0.1);
    d.scale.setScalar(1.6);
    await march(k, 320, 0, 0.74, 0.1, Easing.Quadratic.In);
    for (let i = 0; i < 4; i++) {
      await k.tw(70, (u) => { d.position.z = 0.1 + 0.3 * u; }, Easing.Quadratic.Out);
      spark(k, k.to.clone().setY(0.3 + (i % 2) * 0.2), 0xff9a7a);
      if (i === 3) void k.hit('spin', {}, 0.15);
      await k.tw(70, (u) => { d.position.z = 0.4 - 0.3 * u; });
    }
    await march(k, 200, 0.74, 1, 0.06, Easing.Cubic.Out);
  },
};

const kill3: Style = {
  name: 'Headbutt',
  async run(k) {
    await march(k, 300, 0, 0.6, 0.1, Easing.Quadratic.In);
    await k.tw(150, (u) => { k.a.rotation.x = -0.5 * u; }, Easing.Cubic.Out); // wind back
    await k.tw(110, (u) => { k.a.rotation.x = -0.5 + 1.1 * u; k.a.position.copy(k.at(0.6 + 0.32 * u)); }, Easing.Quadratic.In);
    spark(k, k.to.clone().setY(0.5), 0xffffff);
    k.ring(k.to.clone(), 0xffffff, 1.2, 300);
    void k.hit('launch', { power: 1.3 }, 0.22);
    await k.tw(220, (u) => { k.a.rotation.x = 0.6 * (1 - u); k.a.position.copy(k.at(0.92 + 0.08 * u)); });
  },
};

const kill4: Style = {
  name: 'Sling stone',
  async run(k) {
    k.face();
    const s = k.put(mesh(new THREE.SphereGeometry(0.07, 6, 5).toNonIndexed()));
    s.material = new THREE.MeshToonMaterial({ color: 0x8a8a90 });
    const home = hold(k, new THREE.Object3D(), 0.2, 0.7, 0.1);
    void home;
    const p0 = k.from.clone().setY(0.8);
    const p1 = k.to.clone().setY(0.45);
    s.position.copy(p0);
    await k.tw(380, (u) => { s.position.set(k.from.x + Math.sin(u * 28) * 0.18, 0.8 + Math.cos(u * 28) * 0.18, k.from.z); k.a.rotation.y += 0.0; }, Easing.Linear.None);
    await k.proj(s, p0, p1, 240, 0.3, Easing.Quadratic.In);
    k.drop(s);
    spark(k, p1, 0xffffff);
    void k.hit('spin', {}, 0.16);
    await k.wait(200);
    await march(k, 480, 0, 1, 0.1);
  },
};

const kill5: Style = {
  name: 'Tackle',
  async run(k) {
    k.face();
    let hit = false;
    k.every(420, () => k.burst(k.a.position.clone().setY(0.05), 'smoke', 3, { life: 0.4, speed: 0.4, spread: Math.PI / 2 }), 2);
    await k.tw(420 + k.dist * 40, (u) => {
      k.a.position.copy(k.at(u * 0.95));
      k.a.rotation.x = 0.9 * Math.min(1, u * 3);
      k.a.position.y = 0.06;
      if (!hit && u > 0.9) { hit = true; spark(k, k.to.clone().setY(0.4)); void k.hit('launch', { power: 1.2 }, 0.2); }
    }, Easing.Quadratic.In);
    await k.tw(220, (u) => { k.a.rotation.x = 0.9 * (1 - u); k.a.position.copy(k.at(0.95 + 0.05 * u)); k.a.position.y = 0; });
  },
};

const kill6: Style = {
  name: 'Spear throw',
  async run(k) {
    k.face();
    const sp = hold(k, pitchfork(), 0.2, 0.55, 0.05);
    await k.tw(220, (u) => { sp.rotation.x = -0.6 * u; k.a.rotation.x = -0.15 * u; }, Easing.Cubic.Out);
    k.rig.remove(sp);
    k.g.add(sp);
    const p0 = k.from.clone().setY(0.7).addScaledVector(k.dir, 0.3);
    const p1 = k.to.clone().setY(0.4);
    sp.position.copy(p0); sp.lookAt(p1); sp.scale.setScalar(1.3);
    k.a.rotation.x = 0;
    await k.proj(sp, p0, p1, 280, 0.35, Easing.Quadratic.In);
    spark(k, p1, 0xffe0a0);
    void k.hit('topple', {}, 0.18);
    await k.wait(260);
    k.drop(sp);
    await march(k, 460, 0, 1, 0.1);
  },
};

const kill7: Style = {
  name: 'Torch burn',
  async run(k) {
    const t = hold(k, torch(), 0.2, 0.3, 0.1);
    t.scale.setScalar(1.3);
    k.every(900, () => k.burst(k.a.position.clone().setY(0.8), 'fire', 3, { speed: 0.4, life: 0.5 }), 3);
    await march(k, 360, 0, 0.74, 0.1, Easing.Quadratic.Out);
    await k.tw(200, (u) => { t.rotation.x = 1.2 * u; t.position.z = 0.1 + 0.2 * u; }, Easing.Cubic.Out);
    k.burst(k.to.clone().setY(0.5), 'fire', 16);
    void k.hit('burn', {}, 0.12);
    await k.wait(300);
    await march(k, 220, 0.74, 1, 0.06, Easing.Cubic.Out);
  },
};

const kill8: Style = {
  name: 'Dropkick',
  async run(k) {
    await march(k, 300, 0, 0.55, 0.1, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    let hit = false;
    await k.tw(380, (u) => {
      k.a.position.copy(k.at(0.55 + 0.4 * u));
      k.a.position.y = 0.9 * 4 * u * (1 - u);
      k.a.rotation.x = 1.3 * Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.5);
      if (!hit && u > 0.82) { hit = true; spark(k, k.to.clone().setY(0.5)); void k.hit('launch', { power: 1.8 }, 0.24); }
    }, Easing.Linear.None);
    await k.tw(200, (u) => { k.a.rotation.x = 1.3 * (1 - u); k.a.position.copy(k.at(0.95 + 0.05 * u)); k.a.position.y = 0; });
  },
};

const kill9: Style = {
  name: 'Wrecking roll',
  async run(k) {
    k.face();
    await k.tw(200, (u) => { k.a.scale.set(1, 1 - 0.3 * u, 1); }, Easing.Cubic.Out); // crouch
    let hit = false;
    k.every(560, () => k.burst(k.a.position.clone().setY(0.1), 'smoke', 4, { life: 0.4, speed: 0.4, spread: Math.PI / 2 }), 2);
    await k.tw(560, (u) => {
      k.a.scale.set(1, 0.7, 1);
      k.a.position.copy(k.at(u * 0.95));
      k.a.rotation.x = u * Math.PI * 6;
      k.a.position.y = 0.3;
      if (!hit && u > 0.9) { hit = true; spark(k, k.to.clone().setY(0.4)); void k.hit('launch', { power: 1.5 }, 0.26); }
    }, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    await k.tw(200, (u) => { k.a.scale.set(1, 0.7 + 0.3 * u, 1); k.a.position.copy(k.at(0.95 + 0.05 * u)); k.a.position.y = 0; });
  },
};

const kill10: Style = {
  name: 'Mob dogpile',
  async run(k) {
    k.face();
    const color = k.a.userData.color;
    const mob = [0, 1, 2].map((i) => {
      const m = k.put(mesh(pieceGeometry('p', color)));
      m.scale.setScalar(0.8);
      m.position.copy(k.from).add(V((i - 1) * 0.4, 0, -0.3 - i * 0.05));
      m.rotation.y = color === 0 ? Math.PI : 0;
      return m;
    });
    k.burst(k.from.clone().setY(0.3), 'white', 10);
    await k.wait(100);
    await k.tw(520, (u) => {
      k.a.position.copy(k.at(u * 0.9)); k.a.position.y = 0.1 * Math.abs(Math.sin(u * Math.PI * 5));
      mob.forEach((m, i) => {
        const side = (i - 1) * (0.5 - 0.35 * u);
        m.position.copy(k.at(Math.min(1, u * 0.95))).add(V(-k.dir.z * side, 0.1 * Math.abs(Math.sin(u * Math.PI * 5 + i)), k.dir.x * side));
      });
    }, Easing.Quadratic.In);
    void k.hit('squash', {}, 0.22);
    k.burst(k.to.clone().setY(0.3), 'smoke', 22, { spread: Math.PI / 2 });
    await k.tw(300, (u) => { mob.forEach((m) => { m.position.y = 0.2 * Math.sin(u * Math.PI * 3) * (1 - u); m.scale.setScalar(Math.max(0.01, 0.8 * (1 - u * u))); }); }, Easing.Linear.None);
    await march(k, 200, 0.9, 1, 0.05, Easing.Cubic.Out);
  },
};

export const pawn = { moves: [move1, move2], kills: [kill1, kill2, kill3, kill4, kill5, kill6, kill7, kill8, kill9, kill10] };
