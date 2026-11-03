import * as THREE from 'three';
import { SpriteTag, onSpriteSheetLoaded, spriteSheet } from './render/sprites/sheets';
import { SpriteBody } from './render/sprites/sprite-body';
import type { PieceType } from './rules';

// Model sheet: every piece sprite in both colors, at big pixels.
//   ?yaw=0..360 turns the view, ?under=1 shows the Underworld look, ?tag=atk_a&step=1 picks the frame.
const q = new URLSearchParams(location.search);
const yaw = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 35));
const under = q.get('under') === '1' ? 1 : 0;
const tag = (q.get('tag') ?? 'idle') as SpriteTag;
const step = Number(q.get('step') ?? 0);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(under ? 0x120820 : 0xcfe3f5);
const types: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];
for (const color of [0, 1] as const) {
  types.forEach((type, i) => {
    const body = new SpriteBody(spriteSheet(type));
    body.setLook(color, under);
    body.pose(tag, step);
    body.position.set((i - 2.5) * 1.1, 0, color === 0 ? 0.8 : -0.8);
    scene.add(body);
  });
}
const aspect = innerWidth / innerHeight;
const camera = new THREE.OrthographicCamera(-1.5 * aspect, 1.5 * aspect, 1.9, -1.1, 0.1, 100);
camera.position.set(Math.sin(yaw) * 10, 5, Math.cos(yaw) * 10);
camera.lookAt(0, 0.45, 0);
const draw = () => renderer.render(scene, camera);
onSpriteSheetLoaded(draw);
draw();
