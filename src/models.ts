import * as THREE from 'three';
import { createPieceView } from './render/pieces';
import type { PieceType } from './rules';

// Model sheet: all pieces, both colors. ?yaw=0..360 turns the view, ?under=1 shows the Underworld look.
const q = new URLSearchParams(location.search);
const yaw = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 35));
const under = q.get('under') === '1' ? 1 : 0;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const r = new THREE.WebGLRenderer({ canvas, antialias: true });
r.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(under ? 0x120820 : 0xcfe3f5);
scene.add(new THREE.HemisphereLight(0xfff4de, 0x806040, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-4, 8, 6); scene.add(sun);
const types: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];
let id = 1;
for (const color of [0, 1] as const) {
  types.forEach((type, i) => {
    const v = createPieceView({ id: id++, color, type, promoted: false, risen: false, hasMoved: false }, under);
    v.position.set((i - 2.5) * 1.1, 0, color === 0 ? 0.8 : -0.8);
    v.children.forEach((c) => { if (c !== v.userData.body) c.visible = false; });
    v.userData.body.rotation.y = 0;
    scene.add(v);
  });
}
const a = innerWidth / innerHeight;
const cam = new THREE.OrthographicCamera(-1.5 * a, 1.5 * a, 1.9, -1.1, 0.1, 100);
cam.position.set(Math.sin(yaw) * 10, 5, Math.cos(yaw) * 10);
cam.lookAt(0, 0.45, 0);
r.render(scene, cam);
