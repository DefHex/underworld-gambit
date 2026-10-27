import * as THREE from 'three';
import { Easing } from '../tween';
import { Kit, Style } from './kit';
import { bolt, Whip } from './props';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
type Ease = (n: number) => number;

function local(k: Kit, o: THREE.Object3D): THREE.Vector3 {
  return o.getWorldPosition(new THREE.Vector3()).sub(k.g.position);
}

/** The queen's whip: held at her hand, shaped each frame as a curve with a traveling wave. */
class Lash {
  readonly w: Whip;
  private hand = new THREE.Object3D();
  private side: THREE.Vector3;
  constructor(private k: Kit, color = 0x1a1216) {
    this.hand.position.set(0.27, 0.52, 0.12);
    k.put(this.hand, k.rig);
    this.w = new Whip(18, color);
    k.put(this.w.group);
    this.side = V(-k.dir.z, 0, k.dir.x);
    this.coil();
  }
  H(): THREE.Vector3 { return local(this.k, this.hand); }
  /** Shapes the whip from the hand to `end` with a bowed control point and optional wave. */
  set(end: THREE.Vector3, bow = 0.35, wave = 0, phase = 0, ctrl?: THREE.Vector3): void {
    const H = this.H();
    const C = ctrl ?? H.clone().lerp(end, 0.5).add(V(0, bow, 0));
    this.w.set((u) => {
      const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      const p = H.clone().multiplyScalar(a).addScaledVector(C, b).addScaledVector(end, c);
      p.addScaledVector(this.side, Math.sin(u * Math.PI * 3 + phase) * wave * Math.sin(u * Math.PI));
      return p;
    });
  }
  coil(): void { const H = this.H(); this.set(H.clone().add(V(0.05, -0.18, 0.18)), 0.05); }
  /** Wind up over the shoulder. */
  async windUp(ms = 260): Promise<void> {
    this.k.sfx('whoosh');
    await this.k.tw(ms, (u) => {
      const H = this.H();
      this.set(H.clone().add(V(0, 0.9 + 0.5 * u, 0)).addScaledVector(this.k.dir, -0.9 * u), 0.7, 0.1 * u, u * 4);
    }, Easing.Cubic.Out);
  }
  /** Lash out at a point (or a moving one) and snap. */
  async strike(target: THREE.Vector3 | (() => THREE.Vector3), ms = 150): Promise<void> {
    const at = () => (typeof target === 'function' ? target() : target);
    const H0 = this.H();
    const from = H0.clone().add(V(0, 1.4, 0)).addScaledVector(this.k.dir, -1.1);
    await this.k.tw(ms, (u) => {
      const E = from.clone().lerp(at(), u);
      this.set(E, 0.5 * (1 - u), 0.35 * (1 - u), u * 9);
    }, Easing.Quadratic.In);
    this.crackAt(at());
  }
  crackAt(p: THREE.Vector3): void {
    this.k.sfx('whip');
    this.k.flash(p, 0xfff0c0, 0.5, 150);
    this.k.ring(p.clone().setY(0.1), 0xffffff, 0.9, 260);
    this.k.shake(0.05);
  }
  /** Keep the whip taut to a point while it moves. */
  taut(end: () => THREE.Vector3): void { this.set(end(), 0.05, 0.02); }
  async retract(ms = 200): Promise<void> {
    const from = this.w.tip.position.clone();
    await this.k.tw(ms, (u) => { const H = this.H(); this.set(from.clone().lerp(H.clone().add(V(0.05, -0.18, 0.18)), u), 0.3 * (1 - u), 0.12 * (1 - u), u * 8); }, Easing.Cubic.In);
    this.coil();
  }
}

function strut(k: Kit, ms: number, u0: number, u1: number, ease: Ease = Easing.Cubic.InOut, hump = 0.05): Promise<void> {
  k.face();
  return k.tw(ms, (t) => {
    k.a.position.copy(k.at(u0 + (u1 - u0) * t));
    k.a.position.y = hump * Math.abs(Math.sin(t * Math.PI * Math.max(2, k.dist * 2)));
    k.a.rotation.z = Math.sin(t * Math.PI * Math.max(2, k.dist * 2)) * 0.05;
  }, ease);
}

const move1: Style = {
  name: 'Whip swing',
  async run(k) {
    k.face();
    const l = new Lash(k);
    await l.windUp(220);
    const anchor = k.to.clone().setY(0.05);
    await l.strike(anchor, 140);
    await k.tw(300 + k.dist * 100, (u) => {
      k.a.position.copy(k.at(u));
      k.a.position.y = (0.5 + k.dist * 0.15) * 4 * u * (1 - u);
      k.a.rotation.x = -0.35 * Math.sin(u * Math.PI);
      l.taut(() => anchor);
    }, Easing.Cubic.InOut);
    k.a.rotation.x = 0;
    await l.retract(180);
  },
};

const move2: Style = {
  name: 'Regal glide',
  async run(k) {
    const l = new Lash(k);
    const yaw0 = k.a.rotation.y;
    k.face();
    const base = k.a.rotation.y;
    k.every(520 + k.dist * 200, () => k.burst(k.a.position.clone().setY(0.7), 'gold', 3, { life: 0.8, speed: 0.4, spread: Math.PI }), 3);
    await k.tw(520 + k.dist * 200, (t) => {
      k.a.position.copy(k.at(t));
      k.a.rotation.y = base + t * Math.PI * 2;
      l.set(l.H().add(V(0.3 * Math.cos(t * 12), -0.1, 0.3 * Math.sin(t * 12))), 0.2, 0.05, t * 10);
    }, Easing.Cubic.InOut);
    void yaw0;
  },
};

const kill1: Style = {
  name: 'Lash and drag',
  async run(k) {
    const l = new Lash(k);
    const v = k.v;
    k.face();
    if (k.dist > 1.8) await strut(k, 300, 0, 0.35, Easing.Cubic.Out);
    await l.windUp();
    const vpos = () => (v ? v.position.clone().setY(0.55) : k.to.clone().setY(0.5));
    await l.strike(vpos, 150);
    // yank the victim to her feet
    const start = v?.position.clone() ?? k.to.clone();
    const dest = k.a.position.clone().addScaledVector(k.dir, 0.75);
    await k.tw(340, (u) => {
      if (v) { v.position.set(start.x + (dest.x - start.x) * u, 0.1 * Math.sin(u * Math.PI), start.z + (dest.z - start.z) * u); v.rotation.x = -0.4 * Math.sin(u * Math.PI); }
      l.taut(vpos);
    }, Easing.Cubic.In);
    void k.hit('launch', { power: 1.5 }, 0.16);
    await l.retract(160);
    await strut(k, 260, k.dist > 1.8 ? 0.35 : 0, 1, Easing.Cubic.Out);
  },
};

const kill2: Style = {
  name: 'Whip crack',
  async run(k) {
    const l = new Lash(k);
    k.face();
    if (k.dist > 1.8) await strut(k, 300, 0, 0.35, Easing.Cubic.Out);
    await l.windUp(320);
    await l.strike(k.to.clone().setY(0.5), 120);
    k.ring(k.to.clone(), 0xffffff, 2.2, 480);
    k.flash(k.to.clone().setY(0.5), 0xffffff, 1.4, 260);
    void k.hit('explode', {}, 0.24);
    await l.retract(200);
    await strut(k, 260, k.dist > 1.8 ? 0.35 : 0, 1, Easing.Cubic.Out);
  },
};

const kill3: Style = {
  name: 'Wrap and whirl',
  async run(k) {
    const l = new Lash(k);
    const v = k.v;
    k.face();
    if (k.dist > 1.8) await strut(k, 300, 0, 0.4, Easing.Cubic.Out);
    await l.windUp(240);
    await l.strike(() => (v ? v.position.clone().setY(0.5) : k.to.clone().setY(0.5)), 140);
    const yaw0 = k.a.rotation.y;
    const c = k.a.position.clone();
    const a0 = Math.atan2(k.dir.x, k.dir.z);
    k.every(900, () => k.burst(c.clone().setY(0.5), 'white', 3, { life: 0.4, spread: Math.PI }), 3);
    await k.tw(900, (u) => {
      const ang = a0 + u * Math.PI * 4;
      k.a.rotation.y = yaw0 + u * Math.PI * 4;
      const r = 1.1;
      if (v) { v.position.set(c.x + Math.sin(ang) * r, 0.15 + 0.4 * Math.sin(u * Math.PI), c.z + Math.cos(ang) * r); v.rotation.z = u * 8; }
      l.taut(() => (v ? v.position.clone().setY(v.position.y + 0.4) : c));
    }, Easing.Quadratic.InOut);
    k.a.rotation.y = yaw0;
    void k.hit('launch', { power: 1.7, dir: V(k.dir.x, 0, k.dir.z) }, 0.2);
    await l.retract(160);
    await strut(k, 240, k.dist > 1.8 ? 0.4 : 0, 1, Easing.Cubic.Out);
  },
};

const kill4: Style = {
  name: 'Three lashes',
  async run(k) {
    const l = new Lash(k);
    k.face();
    if (k.dist > 1.8) await strut(k, 300, 0, 0.35, Easing.Cubic.Out);
    for (let i = 0; i < 3; i++) {
      await l.windUp(130);
      await l.strike(k.to.clone().add(V((i - 1) * 0.15, 0.3 + i * 0.12, 0)), 90);
      k.burst(k.to.clone().setY(0.5), 'violet', 8);
      if (i === 2) void k.hit('topple', {}, 0.2);
    }
    await l.retract(180);
    await strut(k, 260, k.dist > 1.8 ? 0.35 : 0, 1, Easing.Cubic.Out);
  },
};

const kill5: Style = {
  name: 'Lightning whip',
  async run(k) {
    const l = new Lash(k, 0x8fc4ff);
    k.face();
    if (k.dist > 1.8) await strut(k, 300, 0, 0.35, Easing.Cubic.Out);
    await l.windUp(260);
    k.every(500, () => { const H = l.H(); const b = k.put(bolt(H, l.w.tip.position.clone(), 0xbfe0ff, 0.03)); void k.wait(60).then(() => k.drop(b)); }, 2);
    await l.strike(k.to.clone().setY(0.5), 140);
    for (let i = 0; i < 3; i++) {
      const b = k.put(bolt(k.to.clone().setY(2.6), k.to.clone().setY(0.1)));
      await k.wait(60); k.drop(b); await k.wait(30);
    }
    void k.hit('zap', {}, 0.2);
    await k.wait(300);
    await l.retract(180);
    await strut(k, 260, k.dist > 1.8 ? 0.35 : 0, 1, Easing.Cubic.Out);
  },
};

const kill6: Style = {
  name: 'Fire whip',
  async run(k) {
    const l = new Lash(k, 0xff8a30);
    k.face();
    if (k.dist > 1.8) await strut(k, 300, 0, 0.35, Easing.Cubic.Out);
    k.every(1100, () => k.burst(l.w.tip.position.clone(), 'fire', 6, { speed: 0.6, life: 0.6 }), 2);
    await l.windUp(260);
    await l.strike(k.to.clone().setY(0.5), 140);
    void k.hit('burn', {}, 0.15);
    await k.wait(420);
    await l.retract(180);
    await strut(k, 260, k.dist > 1.8 ? 0.35 : 0, 1, Easing.Cubic.Out);
  },
};

const kill7: Style = {
  name: 'Trip and heel stomp',
  async run(k) {
    const l = new Lash(k);
    const v = k.v;
    k.face();
    if (k.dist > 1.8) await strut(k, 300, 0, 0.4, Easing.Cubic.Out);
    await l.windUp(220);
    await l.strike(k.to.clone().setY(0.08), 120);
    await k.tw(260, (u) => { if (v) { v.rotation.x = 0.7 * u * k.dir.z + 0.0; v.rotation.z = -0.7 * u * k.dir.x; v.position.y = 0.05 * u; } l.taut(() => k.to.clone().setY(0.1)); }, Easing.Cubic.Out);
    await l.retract(140);
    await k.tw(300, (u) => {
      k.a.position.copy(k.at((k.dist > 1.8 ? 0.4 : 0) + (1 - (k.dist > 1.8 ? 0.4 : 0)) * u));
      k.a.position.y = 0.6 * 4 * u * (1 - u);
      k.a.rotation.x = -0.25 * Math.sin(u * Math.PI);
    }, Easing.Linear.None);
    k.a.rotation.x = 0;
    void k.hit('squash', {}, 0.2);
  },
};

const kill8: Style = {
  name: 'Lasso hoist',
  async run(k) {
    const l = new Lash(k);
    const v = k.v;
    k.face();
    if (k.dist > 1.8) await strut(k, 300, 0, 0.4, Easing.Cubic.Out);
    await l.windUp(240);
    await l.strike(() => (v ? v.position.clone().setY(0.6) : k.to.clone().setY(0.5)), 140);
    // she hauls the whip overhead, the victim rises with it, then she slams it down
    void k.hit('hoist', {}, 0.1);
    for (let i = 0; i < 28; i++) {
      await k.wait(24);
      l.set(v ? v.position.clone().setY(v.position.y + 0.4) : k.to.clone().setY(1.5), 0.3, 0.08, i);
    }
    await k.reaction;
    await l.retract(160);
    await strut(k, 260, k.dist > 1.8 ? 0.4 : 0, 1, Easing.Cubic.Out);
  },
};

const kill9: Style = {
  name: 'Dominion',
  async run(k) {
    const l = new Lash(k);
    const v = k.v;
    k.face();
    await k.tw(520, (u) => {
      k.a.position.copy(k.at(u * 0.82));
      k.a.rotation.z = Math.sin(u * Math.PI * 4) * 0.08;
      k.a.position.y = 0.04 * Math.abs(Math.sin(u * Math.PI * 4));
      if (v) { v.scale.set(1, 1 - 0.3 * u, 1); v.rotation.x = 0.35 * u * k.dir.z; v.rotation.z = -0.35 * u * k.dir.x; }
    }, Easing.Linear.None);
    await l.windUp(180);
    await l.strike(k.to.clone().setY(0.7), 100);
    await l.retract(140);
    await k.tw(160, (u) => { k.a.rotation.x = -0.6 * u; }, Easing.Quadratic.Out); // kick
    void k.hit('spin', {}, 0.18);
    await k.tw(180, (u) => { k.a.rotation.x = -0.6 * (1 - u); });
    await strut(k, 220, 0.82, 1, Easing.Cubic.Out);
  },
};

const kill10: Style = {
  name: 'Whip dash',
  async run(k) {
    const l = new Lash(k);
    k.face();
    await l.windUp(220);
    const anchor = k.to.clone().addScaledVector(k.dir, 0.6).setY(0.05);
    await l.strike(anchor, 140);
    let hit = false;
    k.every(420, () => k.burst(k.a.position.clone().setY(0.4), 'white', 4, { life: 0.4, speed: 0.5 }), 2);
    await k.tw(380 + k.dist * 40, (u) => {
      k.a.position.copy(k.at(u)); k.a.position.y = 0.1;
      k.a.rotation.x = 0.25 * Math.sin(u * Math.PI);
      l.taut(() => anchor);
      if (!hit && u > 0.86) { hit = true; k.flash(k.to.clone().setY(0.5), 0xffffff, 0.9); void k.hit('launch', { power: 1.5 }, 0.2); }
    }, Easing.Quadratic.In);
    k.a.rotation.x = 0;
    await l.retract(180);
  },
};

export const queen = { moves: [move1, move2], kills: [kill1, kill2, kill3, kill4, kill5, kill6, kill7, kill8, kill9, kill10] };
