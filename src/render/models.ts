import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const base = import.meta.env.BASE_URL + 'models/';

/** Loads a KayKit prop (CC0) and scales it to `height`, with its base on y = 0. */
export function loadProp(name: string, height: number): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(base + name + '.gltf', (gltf) => {
      const root = new THREE.Group();
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const k = height / Math.max(0.001, box.max.y - box.min.y);
      model.scale.setScalar(k);
      model.position.y = -box.min.y * k;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mat = m.material as THREE.MeshStandardMaterial;
          mat.roughness = 0.9; mat.metalness = 0;
          if (name.includes('candle') || name.includes('lantern')) { mat.emissive = new THREE.Color(0xff8a30); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.35; }
        }
      });
      root.add(model);
      resolve(root);
    }, undefined, reject);
  });
}

/** A few candles and skulls set into the Underworld frame. The board itself stays clear. */
export async function addFrameProps(parent: THREE.Object3D): Promise<void> {
  const spots: [string, number, number, number, number][] = [
    // name, height, x, z, rotationY
    ['skull_candle', 0.5, 0, -4.32, 0],
    ['skull_candle', 0.5, 0, 4.32, Math.PI],
    ['candle_triple', 0.42, -4.32, 0, 1],
    ['candle_triple', 0.42, 4.32, 0, 2.4],
    ['bone_A', 0.12, -3.0, 4.34, 0.6],
    ['bone_A', 0.12, 3.0, -4.34, 2.1],
  ];
  const cache = new Map<string, THREE.Group>();
  for (const [name, h, x, z, ry] of spots) {
    try {
      let proto = cache.get(name);
      if (!proto) { proto = await loadProp(name, h); cache.set(name, proto); }
      const o = proto.clone(true);
      o.position.set(x, -0.17, z);
      o.rotation.y = ry;
      parent.add(o);
    } catch { /* a missing prop must never break the board */ }
  }
}
