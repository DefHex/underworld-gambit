import * as THREE from 'three';
import { ball, box, cone, cyl, gradient, merge, part, ring } from '../pieces';

/** Props used by the move and execution animations. All low-poly, flat-shaded, vertex-colored. */
const MAT = new THREE.MeshToonMaterial({ gradientMap: gradient, vertexColors: true });
const glow = (hex: number, opacity = 0.9) =>
  new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

export const mesh = (g: THREE.BufferGeometry) => new THREE.Mesh(g, MAT);
const grp = (...c: THREE.Object3D[]) => { const g = new THREE.Group(); g.add(...c); return g; };

const RED = 0xd23a30, WHITE = 0xf2f2ec, STEEL = 0x9aa3b0, DARK = 0x24242c, GOLD = 0xe0b040, OLIVE = 0x5d6b3a, BROWN = 0x6a4a2a;

export interface Rocket extends THREE.Group { userData: { flame: THREE.Mesh } }
/** A small rocket, nose up (+y), 0.8 tall, origin at its tail. */
export function rocket(scale = 1): Rocket {
  const body = merge([
    cyl(0.085, 0.095, 0.55, WHITE, { y: 0.35 }, 8),
    cone(0.085, 0.24, RED, { y: 0.74 }, 8),
    cyl(0.1, 0.1, 0.06, RED, { y: 0.2 }, 8),
    cyl(0.07, 0.09, 0.07, DARK, { y: 0.045 }, 8),
    ...[0, 1, 2].map((i) => box(0.2, 0.2, 0.025, RED, { y: 0.15, ry: (i / 3) * Math.PI * 2 + 0.5, x: Math.sin((i / 3) * Math.PI * 2 + 0.5) * 0.1, z: Math.cos((i / 3) * Math.PI * 2 + 0.5) * 0.1 })),
  ]);
  const g = grp(mesh(body)) as Rocket;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.5, 8).rotateX(Math.PI).translate(0, -0.22, 0), glow(0xffa030));
  g.add(flame);
  g.userData = { flame };
  g.scale.setScalar(scale);
  return g;
}

/** Striped canopy over thin lines meeting at the origin; canopy centered 0.95 above. */
export function parachute(): THREE.Group {
  const geo = new THREE.SphereGeometry(0.62, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const g = geo.toNonIndexed();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c1 = new THREE.Color(RED), c2 = new THREE.Color(WHITE);
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(g.attributes.position.getZ(i), g.attributes.position.getX(i));
    const stripe = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12 + 0.01) % 2 ? c1 : c2;
    col.set([stripe.r, stripe.g, stripe.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const canopy = new THREE.Mesh(g, new THREE.MeshToonMaterial({ gradientMap: gradient, vertexColors: true, side: THREE.DoubleSide }));
  canopy.position.y = 0.95;
  canopy.scale.y = 0.8;
  const lines: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const top = new THREE.Vector3(Math.sin(a) * 0.6, 0.95, Math.cos(a) * 0.6);
    const len = top.length();
    const m = cyl(0.008, 0.008, len, 0x333333, {}, 3);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().normalize());
    m.applyMatrix4(new THREE.Matrix4().compose(top.clone().multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    lines.push(m);
  }
  return grp(canopy, mesh(merge(lines)));
}

export interface Tank extends THREE.Group { userData: { turret: THREE.Group; barrel: THREE.Group; muzzle: THREE.Object3D } }
/** Faces +z, ~0.85 long, treads on the ground. */
export function tank(hex: number): Tank {
  const hull = merge([
    box(0.62, 0.17, 0.86, hex, { y: 0.22 }),
    box(0.56, 0.1, 0.3, hex, { y: 0.26, z: 0.5, rx: -0.35 }),
    box(0.2, 0.09, 0.08, DARK, { y: 0.3, z: 0.66 }),
    ...[-1, 1].flatMap((s) => [
      box(0.15, 0.2, 0.96, DARK, { x: s * 0.36, y: 0.12 }),
      ...[-0.36, -0.12, 0.12, 0.36].map((z) => cyl(0.1, 0.1, 0.17, STEEL, { x: s * 0.36, y: 0.11, z, rz: Math.PI / 2 }, 8)),
    ]),
    cyl(0.04, 0.04, 0.2, OLIVE, { x: -0.18, y: 0.4, z: -0.3 }, 5),
  ]);
  const turretGeo = merge([
    cyl(0.22, 0.25, 0.14, hex, { y: 0.07 }, 8),
    cyl(0.08, 0.08, 0.05, STEEL, { y: 0.16, x: -0.07 }, 6),
    cone(0.04, 0.08, RED, { y: 0.2, x: -0.07 }, 4),
  ]);
  const barrelGeo = merge([cyl(0.04, 0.04, 0.6, DARK, { z: 0.32, rx: Math.PI / 2 }, 6), cyl(0.06, 0.06, 0.1, STEEL, { z: 0.6, rx: Math.PI / 2 }, 6)]);
  const turret = grp(mesh(turretGeo));
  turret.position.y = 0.31;
  const barrel = grp(mesh(barrelGeo));
  barrel.position.set(0, 0.07, 0.15);
  turret.add(barrel);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 0.7);
  barrel.add(muzzle);
  const g = grp(mesh(hull), turret) as Tank;
  g.userData = { turret, barrel, muzzle };
  return g;
}

/** Lance along +z, 1.3 long, origin at the grip. */
export function lance(): THREE.Group {
  return grp(mesh(merge([
    cyl(0.018, 0.022, 1.3, BROWN, { z: 0.45, rx: Math.PI / 2 }, 5),
    cone(0.04, 0.22, STEEL, { z: 1.2, rx: Math.PI / 2 }, 5),
    cyl(0.05, 0.05, 0.12, GOLD, { z: 0.0, rx: Math.PI / 2 }, 6),
    box(0.01, 0.1, 0.2, RED, { y: 0.05, z: 0.9 }),
  ])));
}

/** Sword pointing +z, origin at the grip. */
export function sword(): THREE.Group {
  return grp(mesh(merge([
    box(0.03, 0.06, 0.55, 0xdfe5ee, { z: 0.34 }),
    cone(0.03, 0.12, 0xdfe5ee, { z: 0.66, rx: Math.PI / 2 }, 4),
    box(0.2, 0.04, 0.05, GOLD, { z: 0.05 }),
    cyl(0.018, 0.018, 0.16, BROWN, { z: -0.06, rx: Math.PI / 2 }, 5),
    ball(0.03, GOLD, { z: -0.15 }, 5, 4),
  ])));
}

/** A chain of short boxes laid along any curve: used for the queen's whip. */
export class Whip {
  group = new THREE.Group();
  private segs: THREE.Mesh[] = [];
  constructor(public n = 16, color = 0x1a1216, public thick = 0.035) {
    const geo = part(new THREE.BoxGeometry(thick, thick, 1), color);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, MAT);
      this.group.add(m);
      this.segs.push(m);
    }
    const tip = new THREE.Mesh(part(new THREE.BoxGeometry(thick * 1.8, thick * 1.8, thick * 1.8), 0xffd060), MAT);
    this.group.add(tip);
    this.tip = tip;
  }
  tip: THREE.Mesh;
  /** `at(u)` returns the point on the whip for u in 0..1 (handle to tip). */
  set(at: (u: number) => THREE.Vector3): void {
    let prev = at(0);
    for (let i = 0; i < this.n; i++) {
      const next = at((i + 1) / this.n);
      const m = this.segs[i];
      const len = prev.distanceTo(next);
      m.position.copy(prev).add(next).multiplyScalar(0.5);
      m.scale.set(1, 1, Math.max(len, 0.001));
      m.lookAt(next);
      prev = next;
    }
    this.tip.position.copy(prev);
  }
}

/** A jagged bolt between two points; flicker by toggling `visible`. */
export function bolt(from: THREE.Vector3, to: THREE.Vector3, hex = 0xbfe0ff, width = 0.05): THREE.Group {
  const g = new THREE.Group();
  const pts = [from.clone()];
  const n = 7;
  for (let i = 1; i < n; i++) {
    const p = from.clone().lerp(to, i / n);
    p.x += (Math.random() - 0.5) * 0.35; p.z += (Math.random() - 0.5) * 0.35;
    pts.push(p);
  }
  pts.push(to.clone());
  for (let i = 0; i < pts.length - 1; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, width, 1), glow(hex, 1));
    const len = pts[i].distanceTo(pts[i + 1]);
    m.position.copy(pts[i]).add(pts[i + 1]).multiplyScalar(0.5);
    m.scale.z = len;
    m.lookAt(pts[i + 1]);
    g.add(m);
  }
  return g;
}

export const shell = () => grp(mesh(merge([cyl(0.045, 0.045, 0.12, GOLD, { rx: Math.PI / 2 }, 6), cone(0.045, 0.1, DARK, { z: 0.1, rx: Math.PI / 2 }, 6)])));
export const missile = () => grp(mesh(merge([cyl(0.03, 0.03, 0.2, WHITE, { rx: Math.PI / 2 }, 5), cone(0.03, 0.08, RED, { z: 0.14, rx: Math.PI / 2 }, 5)])));
export const bomb = () => grp(mesh(merge([ball(0.11, DARK, {}, 8, 6), cyl(0.02, 0.02, 0.08, GOLD, { y: 0.12 }, 4), ball(0.025, 0xff7020, { y: 0.17 }, 4, 3)])));
export const hammer = () => grp(mesh(merge([cyl(0.03, 0.03, 0.8, BROWN, { y: 0.4 }, 5), box(0.34, 0.2, 0.2, STEEL, { y: 0.82 }), box(0.36, 0.04, 0.22, GOLD, { y: 0.92 })])));
export const blade = () => grp(mesh(merge([box(0.5, 0.42, 0.04, 0xdfe5ee, { y: 0 }), box(0.56, 0.06, 0.07, DARK, { y: 0.24 })])));
export const throne = () => grp(mesh(merge([box(0.6, 0.12, 0.6, GOLD, { y: 0.06 }), box(0.5, 0.25, 0.5, RED, { y: 0.24 }), box(0.56, 0.8, 0.1, GOLD, { y: 0.55, z: -0.25 }), box(0.1, 0.35, 0.5, GOLD, { y: 0.4, x: 0.3 }), box(0.1, 0.35, 0.5, GOLD, { y: 0.4, x: -0.3 })])));
export const crownProp = (hex: number) => grp(mesh(merge([ring(0.15, 0.03, hex, { rx: Math.PI / 2 }), ...Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return cone(0.035, 0.14, hex, { x: Math.sin(a) * 0.15, z: Math.cos(a) * 0.15, rx: 0 }, 4); })])));
export const pitchfork = () => grp(mesh(merge([cyl(0.015, 0.015, 0.8, BROWN, { z: 0.3, rx: Math.PI / 2 }, 4), ...[-0.06, 0, 0.06].map((x) => cone(0.015, 0.14, STEEL, { x, z: 0.76, rx: Math.PI / 2 }, 4)), box(0.14, 0.02, 0.02, STEEL, { z: 0.69 })])));
export const dagger = () => grp(mesh(merge([box(0.025, 0.04, 0.2, 0xdfe5ee, { z: 0.13 }), cone(0.02, 0.06, 0xdfe5ee, { z: 0.26, rx: Math.PI / 2 }, 4), box(0.08, 0.02, 0.03, GOLD, { z: 0.03 }), cyl(0.012, 0.012, 0.08, BROWN, { z: -0.03, rx: Math.PI / 2 }, 4)])));
export const torch = () => grp(mesh(merge([cyl(0.015, 0.02, 0.35, BROWN, { y: 0.17 }, 4)])), new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 6).translate(0, 0.42, 0), glow(0xff8a20)));
export const debris = (hex: number) => mesh(part(new THREE.BoxGeometry(0.1, 0.1, 0.1), hex));
export const dirtDisc = () => new THREE.Mesh(new THREE.RingGeometry(0.1, 0.18, 20).rotateX(-Math.PI / 2), glow(0xffffff, 0.7));
export { glow };
