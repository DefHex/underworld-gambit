import * as THREE from 'three';
import { Easing } from '../tween';
import { Kit } from './kit';
import { Whip, bolt, glow } from './props';

// Effects the piece styles share: gunshots, fireballs, lightning, holy light, sword slashes, the whip.
// They are plain 3D shapes; the pixel pass turns them into the same chunky pixels as the sprites.

type V3 = THREE.Vector3;

/** Muzzle flash at `from`, a bright tracer to `to`, sparks where it lands. */
export function gunshot(k: Kit, from: V3, to: V3): void {
  k.sfx('smack');
  k.flash(from, 0xfff0a0, 0.4, 90);
  const tracer = k.put(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), glow(0xfff2b0, 1)));
  tracer.position.copy(from);
  tracer.lookAt(k.world(to));
  void k.proj(tracer, from, to, 70).then(() => k.drop(tracer));
  k.burst(to, 'white', 6, { speed: 1.1, life: 0.4 });
}

/** Lobs a fireball from `from` to `to`, trailing flames; resolves when it lands. */
export async function fireball(k: Kit, from: V3, to: V3, { size = 1, hump = 0.35, ms = 420 } = {}): Promise<void> {
  const ball = k.put(new THREE.Group());
  ball.add(
    new THREE.Mesh(new THREE.IcosahedronGeometry(0.14 * size), glow(0xff8a20, 1)),
    new THREE.Mesh(new THREE.IcosahedronGeometry(0.08 * size), glow(0xffe060, 1)),
  );
  ball.position.copy(from);
  k.sfx('fire');
  k.every(ms, () => k.burst(ball.position.clone(), 'fire', 3, { speed: 0.3, life: 0.45 }), 2);
  await k.proj(ball, from, to, ms, hump, Easing.Quadratic.In);
  k.drop(ball);
  k.flash(to, 0xffb040, 0.7 * size, 220);
  k.burst(to, 'fire', Math.round(22 * size), { speed: 1.2 });
}

/** A crackling bolt between two points, flickering a few times. */
export async function lightning(k: Kit, from: V3, to: V3, color = 0x9fd8ff): Promise<void> {
  k.sfx('zap');
  for (let flicker = 0; flicker < 3; flicker++) {
    const strike = k.put(bolt(from, to, color, 0.07));
    await k.wait(70);
    k.drop(strike);
    await k.wait(30);
  }
  k.flash(to, color, 0.7, 200);
  k.burst(to, 'blue', 18, { speed: 1.3 });
}

/** A column of holy light slamming down on a point. */
export function holyBeam(k: Kit, at: V3): void {
  k.sfx('zap');
  k.w.fx.column(k.g, at.x, at.z);
  k.flash(at.clone().setY(0.4), 0xfff0a0, 1.1, 300);
  k.burst(at.clone().setY(0.2), 'gold', 30, { speed: 1.1 });
}

/** A bright arc where a blade connects. */
export function slash(k: Kit, at: V3): void {
  k.sfx('slash');
  const arc = k.put(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 3, 12, Math.PI), glow(0xffffff, 1)));
  arc.position.copy(at);
  arc.lookAt(k.world(at).add(k.dir));
  void k.tw(160, (u) => { arc.rotation.z = -1 + 2 * u; arc.scale.setScalar(0.6 + 0.6 * u); }).then(() => k.drop(arc));
  k.burst(at, 'white', 10, { speed: 1.2, life: 0.4 });
}

/** The queen's whip snapping out from `hand` to `target` and back. Resolves when it is back. */
export async function whipCrack(k: Kit, hand: V3, target: V3, onSnap: () => void): Promise<void> {
  const whip = new Whip(14, 0x2a1a14, 0.04);
  k.put(whip.group);
  const span = target.clone().sub(hand);
  const along = (u: number, reach: number, sag: number) => hand.clone().addScaledVector(span, u * reach).setY(hand.y + (target.y - hand.y) * u * reach - sag * Math.sin(u * Math.PI));
  await k.tw(120, (t) => whip.set((u) => along(u, t, 0.25 * (1 - t))), Easing.Quadratic.Out);
  k.sfx('whip');
  onSnap();
  await k.tw(180, (t) => whip.set((u) => along(u, 1 - t * 0.8, 0.3 * t)), Easing.Quadratic.In);
  k.drop(whip.group);
}
