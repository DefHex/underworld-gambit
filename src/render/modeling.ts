import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Tiny low-poly modelling kit: flat-shaded, vertex-colored primitives that merge into one mesh.
// Used by the animation props and by the sprite baker (src/bake), which renders models into pixel art.

type G = THREE.BufferGeometry;
export interface Transform { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number }

/** Flat-shaded, colored, transformed copy of a primitive. */
export function part(geo: G, hex: number, t: Transform = {}): G {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(t.x ?? 0, t.y ?? 0, t.z ?? 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0)),
    new THREE.Vector3(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1),
  ));
  g.computeVertexNormals();
  const color = new THREE.Color(hex);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Surface of revolution from [radius, height] points. */
export const lathe = (points: [number, number][], hex: number, segments = 12, t: Transform = {}) =>
  part(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments), hex, t);

/**
 * Pushes a round shape's vertices in and out by angle around the y axis, `count` times per turn:
 * folds in cloth, flutes in stone. Flat shading turns them into light and dark stripes.
 */
export function pleat(geometry: G, count: number, depth: number): G {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const k = 1 - depth * (0.5 + 0.5 * Math.cos(Math.atan2(z, x) * count));
    position.setXYZ(i, x * k, position.getY(i), z * k);
  }
  return geometry;
}

/** A lathe shape with folds (robes, gowns). */
export const pleatedLathe = (points: [number, number][], hex: number, folds = 10, depth = 0.08, t: Transform = {}) =>
  part(pleat(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), folds * 4), folds, depth), hex, t);
export const box = (w: number, h: number, d: number, hex: number, t: Transform = {}) => part(new THREE.BoxGeometry(w, h, d), hex, t);
export const cyl = (radiusTop: number, radiusBottom: number, h: number, hex: number, t: Transform = {}, segments = 8) =>
  part(new THREE.CylinderGeometry(radiusTop, radiusBottom, h, segments), hex, t);
export const cone = (r: number, h: number, hex: number, t: Transform = {}, segments = 6) => part(new THREE.ConeGeometry(r, h, segments), hex, t);
export const ball = (r: number, hex: number, t: Transform = {}, widthSegments = 8, heightSegments = 6) =>
  part(new THREE.SphereGeometry(r, widthSegments, heightSegments), hex, t);
/** Torus lying flat (in the xz plane) unless rotated. */
export const ring = (r: number, tube: number, hex: number, t: Transform = {}) =>
  part(new THREE.TorusGeometry(r, tube, 5, 14), hex, { rx: Math.PI / 2, ...t });
export const merge = (parts: G[]): G => mergeGeometries(parts)!;

/** `count` copies of a part spaced evenly on a circle of radius `r` (x, z and the angle are passed in). */
export const around = (count: number, r: number, make: (x: number, z: number, angle: number) => G): G[] =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return make(Math.sin(angle) * r, Math.cos(angle) * r, angle);
  });

/** Three-band toon shading ramp. */
export const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([100, 180, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
