import * as THREE from 'three';
import { play, Sfx } from '../../audio/audio';
import type { Palette } from '../fx';
import { PAL, PieceView } from '../pieces';
import { Easing, start, tween } from '../tween';
import type { World } from '../world';
import { debris, glow } from './props';

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export type Reaction = 'squash' | 'launch' | 'topple' | 'explode' | 'burn' | 'zap' | 'hoist' | 'spin';
export interface ReactOpts { dir?: V3; power?: number }
export interface Style { name: string; run: (k: Kit) => Promise<void>; zoom?: number }
type Ease = (k: number) => number;

/**
 * Everything an animation needs: the attacker, the victim, where they stand, and helpers to
 * choreograph with. Styles are async functions that await `tw`/`wait` steps.
 */
export class Kit {
  readonly dir: V3;
  readonly dist: number;
  /** Parent for props that should follow the piece: its local +z is the way the model faces. */
  readonly rig = new THREE.Group();
  reaction: Promise<void> = Promise.resolve();
  hitCalled = false;
  private props: THREE.Object3D[] = [];

  constructor(
    readonly w: World, readonly g: THREE.Object3D, readonly a: PieceView, readonly v: PieceView | null,
    readonly from: V3, readonly to: V3, private onImpact: () => void,
  ) {
    const d = to.clone().sub(from); d.y = 0;
    this.dist = d.length();
    this.dir = this.dist > 0.001 ? d.normalize() : V(0, 0, a.userData.color === 0 ? -1 : 1);
    a.rotation.order = 'YXZ'; // yaw first, then pitch/roll relative to where the piece faces
    this.rig.rotation.y = a.userData.body.rotation.y;
    a.add(this.rig);
  }

  // ---------- timing ----------

  tw(ms: number, fn: (u: number) => void, ease: Ease = Easing.Cubic.InOut): Promise<void> {
    return new Promise((resolve) => {
      const o = { u: 0 };
      start(tween(o).to({ u: 1 }, Math.max(1, ms)).easing(ease).onUpdate(() => fn(o.u)).onComplete(() => { fn(1); resolve(); }));
      this.w.invalidate();
    });
  }
  wait(ms: number): Promise<void> { return this.tw(ms, () => {}, Easing.Linear.None); }

  // ---------- props & pose ----------

  put<T extends THREE.Object3D>(o: T, parent: THREE.Object3D = this.g): T {
    parent.add(o);
    this.props.push(o);
    return o;
  }
  drop(o: THREE.Object3D): void { o.parent?.remove(o); }
  /** Point the piece along `d` (default: toward the victim). */
  face(d: V3 = this.dir): void { this.a.rotation.y = Math.atan2(d.x, d.z) - this.rig.rotation.y; }
  bodyVisible(on: boolean): void {
    const u = this.a.userData;
    u.body.visible = on; u.outline.visible = on; u.blob.visible = on;
  }
  at(u: number, y = 0): V3 { return this.from.clone().lerp(this.to, u).setY(y); }
  /** Moves the piece along the from→to line between fractions u0 and u1, with an optional hump. */
  glide(ms: number, u0: number, u1: number, hump = 0, ease: Ease = Easing.Cubic.InOut): Promise<void> {
    return this.tw(ms, (t) => {
      const u = u0 + (u1 - u0) * t;
      this.a.position.copy(this.at(u, 0));
      this.a.position.y += 4 * hump * t * (1 - t);
    }, ease);
  }
  /** Flies `obj` from p0 to p1 in an arc. */
  proj(obj: THREE.Object3D, p0: V3, p1: V3, ms: number, hump = 0, ease: Ease = Easing.Linear.None): Promise<void> {
    return this.tw(ms, (t) => {
      obj.position.copy(p0).lerp(p1, t);
      obj.position.y += 4 * hump * t * (1 - t);
    }, ease);
  }
  /** Runs `fn` every few frames for `ms` (particle trails and the like), without blocking. */
  every(ms: number, fn: () => void, frames = 4): void {
    let n = 0;
    void this.tw(ms, () => { if (++n % frames === 0) fn(); }, Easing.Linear.None);
  }

  // ---------- effects ----------

  /** Plays a sound effect (respects the sound setting). */
  sfx(name: Sfx): void { play(name); }

  world(p: V3): V3 { return p.clone().add(this.g.position); }
  burst(p: V3, pal: Palette, n = 20, o: { speed?: number; spread?: number; life?: number } = {}): void {
    this.w.fx.burst(this.world(p), pal, n, o);
  }
  shake(a = 0.12): void { this.w.shake(a); }
  ring(p: V3, hex = 0xffffff, size = 1.3, ms = 420): void {
    const mat = glow(hex, 0.9);
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 24).rotateX(-Math.PI / 2), mat);
    m.position.copy(p).setY(p.y + 0.06);
    m.renderOrder = 9;
    this.g.add(m);
    void this.tw(ms, (u) => { m.scale.setScalar(0.2 + size * u); mat.opacity = 0.9 * (1 - u); }, Easing.Cubic.Out).then(() => this.g.remove(m));
  }
  flash(p: V3, hex = 0xfff0b0, size = 0.9, ms = 260): void {
    const mat = glow(hex, 1);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat);
    m.position.copy(p);
    m.renderOrder = 9;
    this.g.add(m);
    void this.tw(ms, (u) => { m.scale.setScalar(0.2 + size * u); mat.opacity = 1 - u; }, Easing.Cubic.Out).then(() => this.g.remove(m));
  }

  // ---------- victim ----------

  /** The moment of contact: sound, shake, and the victim's reaction (which plays concurrently). */
  hit(r: Reaction, o: ReactOpts = {}, shake = 0.14): Promise<void> {
    this.hitCalled = true;
    this.onImpact();
    play(REACTION_SOUND[r]);
    this.shake(shake);
    if (this.v) this.reaction = REACTIONS[r](this, this.v, { dir: this.dir, power: 1, ...o });
    return this.reaction;
  }

  /** Removes props and puts the attacker down on its destination square. */
  cleanup(): void {
    for (const p of this.props) p.parent?.remove(p);
    this.a.remove(this.rig);
    this.bodyVisible(true);
    this.a.rotation.set(0, 0, 0);
    this.a.scale.setScalar(1);
    this.a.position.set(this.to.x, 0, this.to.z);
  }
}

/** Undo whatever a reaction did to the victim's transform and parts. */
export function restoreView(v: PieceView): void {
  v.rotation.set(0, 0, 0);
  v.position.y = 0;
  v.children.forEach((c) => { c.visible = true; });
  v.userData.body.visible = true;
}

function spawnDebris(k: Kit, v: PieceView, n: number) {
  const pal = PAL[v.userData.color];
  const cols = [pal.base, pal.trim, pal.dark, pal.metal];
  const p0 = v.position.clone().setY(0.35);
  return Array.from({ length: n }, () => {
    const m = k.put(debris(cols[Math.floor(Math.random() * cols.length)]));
    m.position.copy(p0);
    const vel = V(rand(-1.6, 1.6), rand(2, 4.2), rand(-1.6, 1.6));
    const spin = V(rand(-9, 9), rand(-9, 9), rand(-9, 9));
    return { m, vel, spin };
  });
}

const REACTION_SOUND: Record<Reaction, Sfx> = {
  squash: 'stomp', launch: 'smack', topple: 'thud', explode: 'explosion', burn: 'fire', zap: 'zap', hoist: 'whip', spin: 'whoosh',
};

const REACTIONS: Record<Reaction, (k: Kit, v: PieceView, o: Required<ReactOpts>) => Promise<void>> = {
  async squash(k, v) {
    const p = v.position.clone();
    k.ring(p, 0xffe9c0, 1.5);
    k.burst(p, 'smoke', 24, { spread: Math.PI / 2.2 });
    await k.tw(110, (u) => v.scale.set(1 + 0.55 * u, 1 - 0.92 * u, 1 + 0.55 * u), Easing.Quadratic.In);
    await k.wait(320);
    await k.tw(220, (u) => v.scale.set(Math.max(0.01, 1.55 * (1 - u)), Math.max(0.01, 0.08 * (1 - u)), Math.max(0.01, 1.55 * (1 - u))));
  },
  async launch(k, v, o) {
    const p0 = v.position.clone();
    const far = 3.4 * o.power;
    k.burst(p0.clone().setY(0.3), 'white', 16);
    k.flash(p0.clone().setY(0.4), 0xffffff, 0.8);
    const sp = V(rand(6, 11), 0, rand(4, 9));
    await k.tw(780, (u) => {
      v.position.set(p0.x + o.dir.x * far * u, p0.y + 2.8 * 4 * u * (1 - u), p0.z + o.dir.z * far * u);
      v.rotation.x = sp.x * u; v.rotation.z = sp.z * u;
      v.scale.setScalar(Math.max(0.01, u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1));
    }, Easing.Linear.None);
  },
  async topple(k, v, o) {
    const axis = V(o.dir.z, 0, -o.dir.x).normalize();
    const q0 = v.quaternion.clone();
    await k.tw(520, (u) => {
      v.quaternion.copy(q0).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, u * Math.PI * 0.5));
      v.position.y = 0.12 * u;
    }, Easing.Bounce.Out);
    k.burst(v.position.clone(), 'smoke', 14, { spread: Math.PI / 2.4 });
    await k.wait(260);
    await k.tw(240, (u) => v.scale.setScalar(Math.max(0.01, 1 - u)));
  },
  async explode(k, v) {
    const p = v.position.clone();
    const bits = spawnDebris(k, v, 16);
    v.children.forEach((c) => { c.visible = false; });
    k.flash(p.clone().setY(0.5), 0xffd070, 1.4, 320);
    k.burst(p.clone().setY(0.3), 'fire', 34, { speed: 1.3 });
    k.burst(p.clone().setY(0.3), 'smoke', 18);
    await k.tw(850, (u) => {
      const t = u * 0.85;
      for (const b of bits) {
        b.m.position.set(p.x + b.vel.x * t, Math.max(0.05, 0.35 + b.vel.y * t - 4.9 * t * t), p.z + b.vel.z * t);
        b.m.rotation.set(b.spin.x * t, b.spin.y * t, b.spin.z * t);
        b.m.scale.setScalar(Math.max(0.01, 1 - u * u));
      }
    }, Easing.Linear.None);
    for (const b of bits) k.drop(b.m);
    v.scale.setScalar(0.01);
  },
  async burn(k, v) {
    const m = v.userData.body.material as THREE.MeshToonMaterial;
    const p = v.position.clone();
    k.every(800, () => k.burst(p.clone().setY(0.5), 'fire', 6, { speed: 0.6 }), 3);
    await k.tw(700, (u) => {
      m.emissive.setHex(0xff5a10); m.emissiveIntensity = 1.6 * u;
      m.color.setRGB(1 - 0.8 * u, 1 - 0.85 * u, 1 - 0.9 * u);
      v.scale.set(1, 1 - 0.45 * u, 1);
      v.position.x = p.x + Math.sin(u * 40) * 0.02;
    }, Easing.Linear.None);
    k.burst(p.clone().setY(0.3), 'smoke', 20);
    await k.tw(260, (u) => v.scale.setScalar(Math.max(0.01, 0.55 * (1 - u))));
  },
  async zap(k, v) {
    const m = v.userData.body.material as THREE.MeshToonMaterial;
    const p = v.position.clone();
    k.burst(p.clone().setY(0.5), 'blue', 26, { speed: 1.4 });
    await k.tw(520, (u) => {
      const on = Math.sin(u * 90) > 0;
      m.emissive.setHex(on ? 0xcfe8ff : 0x000000); m.emissiveIntensity = on ? 2 : 0;
      v.position.set(p.x + rand(-0.05, 0.05), 0, p.z + rand(-0.05, 0.05));
    }, Easing.Linear.None);
    k.flash(p.clone().setY(0.5), 0xcfe8ff, 1.1, 240);
    await k.tw(200, (u) => v.scale.setScalar(Math.max(0.01, 1 - u)), Easing.Cubic.In);
  },
  async hoist(k, v, o) {
    const p = v.position.clone();
    await k.tw(420, (u) => { v.position.y = 2.6 * u; v.rotation.y = u * 6; }, Easing.Cubic.Out);
    await k.wait(160);
    await k.tw(260, (u) => { v.position.y = 2.6 * (1 - u); v.rotation.x = u * 0.6 * o.dir.x; }, Easing.Quadratic.In);
    k.ring(p, 0xffe9c0, 1.6);
    k.burst(p, 'smoke', 22, { spread: Math.PI / 2 });
    k.shake(0.12);
    await k.tw(100, (u) => v.scale.set(1 + 0.4 * u, 1 - 0.85 * u, 1 + 0.4 * u), Easing.Quadratic.In);
    await k.tw(220, (u) => v.scale.setScalar(Math.max(0.01, 0.4 * (1 - u))));
  },
  async spin(k, v) {
    const p = v.position.clone();
    k.burst(p.clone().setY(0.4), 'white', 14);
    await k.tw(560, (u) => {
      v.rotation.y = u * 16;
      v.position.y = 0.8 * Math.sin(u * Math.PI);
      v.scale.setScalar(Math.max(0.01, 1 - u * u));
    }, Easing.Quadratic.In);
  },
};
