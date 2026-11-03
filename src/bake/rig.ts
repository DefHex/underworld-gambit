import * as THREE from 'three';
import { merge } from '../render/modeling';

/**
 * Pose for one joint, relative to its rest transform: rotations in degrees, offsets in model
 * units, scale multipliers. `show` overrides the joint's visibility (props that appear mid-attack).
 */
export interface JointPose {
  rx?: number; ry?: number; rz?: number;
  x?: number; y?: number; z?: number;
  s?: number; sx?: number; sy?: number; sz?: number;
  show?: boolean;
}
export type Pose = Record<string, JointPose>;

const DEG = Math.PI / 180;

/** Toon ramp for baking: three hard light bands (shadow, mid, lit), flat like Wolfenstein's sprites. */
export const BAKE_GRADIENT = (() => {
  const t = new THREE.DataTexture(new Uint8Array([80, 165, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
/** Double-sided so open shells (capes, hat brims, robes) render from behind too. */
export const TOON = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: BAKE_GRADIENT, side: THREE.DoubleSide });

/** Unlit colors (fire, muzzle flashes, blood): they come out of the bake exactly as given. */
export const glowMaterial = (hex: number) => new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });

/** A glowing ball with thin spikes of a second color sticking out along each axis: fireballs, sparks, holy light. */
export function glowBurst(radius: number, color: number, tips: number): THREE.Group {
  const burst = new THREE.Group();
  burst.add(new THREE.Mesh(new THREE.IcosahedronGeometry(radius), glowMaterial(color)));
  const spike = new THREE.OctahedronGeometry(radius);
  for (const [x, y, z] of [[1.8, 0.3, 0.3], [0.3, 1.8, 0.3], [0.3, 0.3, 1.8]]) {
    const mesh = new THREE.Mesh(spike, glowMaterial(tips));
    mesh.scale.set(x, y, z);
    burst.add(mesh);
  }
  return burst;
}

interface Rest { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3; visible: boolean }

/** A posable model: a tree of named pivots ("joints") with meshes hung on them. */
export class Rig {
  readonly root = new THREE.Group();
  private readonly joints = new Map<string, THREE.Object3D>();
  private readonly rest = new Map<string, Rest>();

  /** Adds a pivot under `parent` (null = the root) at an offset; `hidden` joints show only when a pose says so. */
  joint(name: string, parent: string | null, x = 0, y = 0, z = 0, hidden = false): THREE.Group {
    if (this.joints.has(name)) throw new Error(`joint ${name} exists`);
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, y, z);
    pivot.visible = !hidden;
    (parent === null ? this.root : this.get(parent)).add(pivot);
    this.joints.set(name, pivot);
    return pivot;
  }

  get(name: string): THREE.Object3D {
    const joint = this.joints.get(name);
    if (!joint) throw new Error(`no joint ${name}`);
    return joint;
  }

  /**
   * Hangs vertex-colored parts on a joint as one toon-shaded mesh. `team` parts (robes, the horse,
   * the tower's stone) are recolored white or black in the game; everything else keeps its colors.
   */
  attach(name: string, parts: THREE.BufferGeometry[], { team = false } = {}): void {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(merge(parts), TOON);
    mesh.userData.team = team;
    this.get(name).add(mesh);
  }

  /** Hangs any object (textured or glowing meshes) on a joint. */
  attachObject(name: string, object: THREE.Object3D, { team = false } = {}): void {
    object.traverse((child) => { child.userData.team = team; });
    this.get(name).add(object);
  }

  /** Rotates a joint's rest orientation (for limbs that hang at an angle when relaxed). */
  setRest(name: string, rx = 0, ry = 0, rz = 0): void { this.get(name).rotation.set(rx * DEG, ry * DEG, rz * DEG); }

  /** Remembers the current transforms as the rest pose. Call once the model is built. */
  freeze(): void {
    for (const [name, joint] of this.joints) {
      this.rest.set(name, { position: joint.position.clone(), rotation: joint.rotation.clone(), scale: joint.scale.clone(), visible: joint.visible });
    }
  }

  /** Back to rest, then applies the pose on top. */
  pose(pose: Pose): void {
    for (const [name, rest] of this.rest) {
      const joint = this.joints.get(name)!;
      const p = pose[name] ?? {};
      joint.position.set(rest.position.x + (p.x ?? 0), rest.position.y + (p.y ?? 0), rest.position.z + (p.z ?? 0));
      joint.rotation.set(rest.rotation.x + (p.rx ?? 0) * DEG, rest.rotation.y + (p.ry ?? 0) * DEG, rest.rotation.z + (p.rz ?? 0) * DEG);
      const s = p.s ?? 1;
      joint.scale.set(rest.scale.x * s * (p.sx ?? 1), rest.scale.y * s * (p.sy ?? 1), rest.scale.z * s * (p.sz ?? 1));
      joint.visible = p.show ?? rest.visible;
    }
    for (const name of Object.keys(pose)) if (!this.rest.has(name)) throw new Error(`pose names unknown joint ${name}`);
  }
}

/** Merges poses left to right (later joints win, per joint the fields merge). */
export function combine(...poses: Pose[]): Pose {
  const out: Pose = {};
  for (const pose of poses) for (const [name, joint] of Object.entries(pose)) out[name] = { ...out[name], ...joint };
  return out;
}
