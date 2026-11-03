import * as THREE from 'three';
import { gradient, part } from '../modeling';

/** Small 3D props and materials shared by the animations and the board decoration. */
const MAT = new THREE.MeshToonMaterial({ gradientMap: gradient, vertexColors: true });

/** Additive glowing material (flashes, bolts, lava). */
export const glow = (hex: number, opacity = 0.9) =>
  new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

/** A toon-shaded mesh of vertex-colored geometry. */
export const mesh = (g: THREE.BufferGeometry) => new THREE.Mesh(g, MAT);

/** A chain of short boxes laid along any curve: the queen's whip. */
export class Whip {
  readonly group = new THREE.Group();
  private readonly links: THREE.Mesh[] = [];
  private readonly tip: THREE.Mesh;

  constructor(private readonly count = 16, color = 0x1a1216, thickness = 0.035) {
    const link = part(new THREE.BoxGeometry(thickness, thickness, 1), color);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(link, MAT);
      this.group.add(m);
      this.links.push(m);
    }
    this.tip = new THREE.Mesh(part(new THREE.BoxGeometry(thickness * 1.8, thickness * 1.8, thickness * 1.8), 0xffd060), MAT);
    this.group.add(this.tip);
  }

  /** Lays the whip along `at(u)` (in the group's parent space), u from 0 (handle) to 1 (tip). */
  set(at: (u: number) => THREE.Vector3): void {
    this.group.updateWorldMatrix(true, false);
    let previous = at(0);
    for (let i = 0; i < this.count; i++) {
      const next = at((i + 1) / this.count);
      const m = this.links[i];
      m.position.copy(previous).add(next).multiplyScalar(0.5);
      m.scale.set(1, 1, Math.max(previous.distanceTo(next), 0.001));
      m.lookAt(this.group.localToWorld(next.clone())); // lookAt wants world coordinates
      previous = next;
    }
    this.tip.position.copy(previous);
  }
}

/** A jagged bolt between two points (built unparented, so its own space is the caller's). */
export function bolt(from: THREE.Vector3, to: THREE.Vector3, hex = 0xbfe0ff, width = 0.05): THREE.Group {
  const g = new THREE.Group();
  const points = [from.clone()];
  const segments = 7;
  for (let i = 1; i < segments; i++) {
    const p = from.clone().lerp(to, i / segments);
    p.x += (Math.random() - 0.5) * 0.35;
    p.z += (Math.random() - 0.5) * 0.35;
    points.push(p);
  }
  points.push(to.clone());
  for (let i = 0; i < points.length - 1; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, width, 1), glow(hex, 1));
    m.position.copy(points[i]).add(points[i + 1]).multiplyScalar(0.5);
    m.scale.z = points[i].distanceTo(points[i + 1]);
    m.lookAt(points[i + 1]);
    g.add(m);
  }
  return g;
}

/** A little cube of rubble. */
export const debris = (hex: number) => mesh(part(new THREE.BoxGeometry(0.1, 0.1, 0.1), hex));
