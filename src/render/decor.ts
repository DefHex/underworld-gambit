import * as THREE from 'three';
import { box, cone, cyl, merge } from './pieces';
import { glow, mesh } from './exec/props';

/**
 * The Underworld look lives in the board itself: scorched ash and obsidian tiles veined with lava,
 * a riveted dark frame with a glowing lava inlay and spiked corners. The surroundings stay clean:
 * a dark floor with a soft glow beneath the board. All generated in code, no third-party assets.
 */

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

const SIZE = 256;

/** Color and emissive maps for one tile. The same crack paths are drawn on both so the glow lines up. */
function tileTextures(kind: 'ash' | 'obsidian', variant: number): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const make = () => { const c = document.createElement('canvas'); c.width = c.height = SIZE; return c; };
  const cMap = make(), cEm = make();
  const g = cMap.getContext('2d')!, e = cEm.getContext('2d')!;
  const ash = kind === 'ash';
  g.fillStyle = ash ? '#6a5a5a' : '#171015';
  g.fillRect(0, 0, SIZE, SIZE);
  e.fillStyle = '#000';
  e.fillRect(0, 0, SIZE, SIZE);

  const r0 = rng(900 + variant * 31 + (ash ? 7 : 0));
  for (let i = 0; i < 70; i++) { // mottled stone
    g.fillStyle = ash ? `rgba(${30 + r0() * 50 | 0},${20 + r0() * 40 | 0},${20 + r0() * 40 | 0},${0.08 + r0() * 0.18})` : `rgba(${r0() * 40 | 0},${r0() * 20 | 0},${r0() * 25 | 0},${0.1 + r0() * 0.25})`;
    g.beginPath(); g.arc(r0() * SIZE, r0() * SIZE, 6 + r0() * 26, 0, 7); g.fill();
  }
  if (variant % 3 === 0) { // scorch mark
    const sx = 50 + r0() * 150, sy = 50 + r0() * 150;
    const grad = g.createRadialGradient(sx, sy, 2, sx, sy, 50);
    grad.addColorStop(0, 'rgba(0,0,0,0.75)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, SIZE, SIZE);
    e.strokeStyle = 'rgba(255,120,40,0.55)'; e.lineWidth = 2;
    e.beginPath(); e.arc(sx, sy, 9, 0, 7); e.stroke();
  }

  const cracks = ash ? 2 : 4;
  g.lineCap = e.lineCap = 'round';
  g.lineJoin = e.lineJoin = 'round';
  const layers: [CanvasRenderingContext2D, number, string][] = ash
    ? [[g, 5, 'rgba(8,3,3,0.9)'], [e, 6, 'rgba(255,70,10,0.28)'], [e, 3, 'rgba(255,120,30,0.9)'], [e, 1.1, 'rgba(255,220,130,1)']]
    : [[g, 6, 'rgba(0,0,0,1)'], [e, 9, 'rgba(255,50,0,0.3)'], [e, 4, 'rgba(255,110,20,1)'], [e, 1.6, 'rgba(255,230,140,1)']];
  for (const [ctx, w, color] of layers) {
    const r = rng(4242 + variant * 97 + (ash ? 3 : 0)); // same paths for every layer
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    for (let i = 0; i < cracks; i++) {
      let x = r() * SIZE, y = r() * SIZE, a = r() * 6.28;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        a += (r() - 0.5) * 1.3;
        x += Math.cos(a) * (14 + r() * 34); y += Math.sin(a) * (14 + r() * 34);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  // Beveled edge so tiles read as separate slabs.
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 8; g.strokeRect(0, 0, SIZE, SIZE);
  g.strokeStyle = ash ? 'rgba(255,200,170,0.18)' : 'rgba(255,120,60,0.12)'; g.lineWidth = 2; g.strokeRect(5, 5, SIZE - 10, SIZE - 10);
  e.strokeStyle = '#000'; e.lineWidth = 12; e.strokeRect(0, 0, SIZE, SIZE); // keep the glow off the tile edges

  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(cEm);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

/** Four variants each of the light (ash) and dark (obsidian) squares so the board never looks tiled. */
export function hellTileMaterials(): { light: THREE.Material[]; dark: THREE.Material[] } {
  const build = (kind: 'ash' | 'obsidian') => Array.from({ length: 4 }, (_, i) => {
    const { map, emissive } = tileTextures(kind, i);
    return new THREE.MeshToonMaterial({ map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: kind === 'ash' ? 0.85 : 1 });
  });
  return { light: build('ash'), dark: build('obsidian') };
}

/** Riveted dark frame, glowing lava inlay and four spiked corners. */
export function buildHellFrame(): THREE.Group {
  const root = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.5, 8.7), new THREE.MeshToonMaterial({ color: 0x2a1f22 }));
  frame.position.y = -0.42;
  root.add(frame);

  const inlay: THREE.BufferGeometry[] = [];
  const e = 4.22, len = 8.5;
  inlay.push(box(len, 0.03, 0.09, 0xff7a20, { z: e, y: -0.16 }), box(len, 0.03, 0.09, 0xff7a20, { z: -e, y: -0.16 }),
    box(0.09, 0.03, len, 0xff7a20, { x: e, y: -0.16 }), box(0.09, 0.03, len, 0xff7a20, { x: -e, y: -0.16 }));
  root.add(new THREE.Mesh(merge(inlay), glow(0xff6a18, 0.95)));

  const rivets: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 18; i++) {
    const t = -3.9 + i * (7.8 / 17);
    for (const s of [-1, 1]) {
      rivets.push(cyl(0.05, 0.06, 0.05, 0x6a5a5e, { x: t, z: s * 4.31, y: -0.16 }, 6), cyl(0.05, 0.06, 0.05, 0x6a5a5e, { x: s * 4.31, z: t, y: -0.16 }, 6));
    }
  }
  root.add(mesh(merge(rivets)));

  const spikes: THREE.BufferGeometry[] = [];
  const tips: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 4.34, z = sz * 4.34;
    spikes.push(cone(0.2, 0.9, 0x120c0f, { x, z, y: 0.15 }, 5), cyl(0.24, 0.28, 0.2, 0x2a1f22, { x, z, y: -0.1 }, 6));
    tips.push(cone(0.07, 0.22, 0xff6a20, { x, z, y: 0.55 }, 5));
  }
  root.add(mesh(merge(spikes)));
  root.add(new THREE.Mesh(merge(tips), glow(0xff7a30, 1)));
  return root;
}

/** A clean dark floor with a soft lava glow under the board. */
export function buildHellGround(): THREE.Group {
  const root = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,90,20,0.85)');
  grad.addColorStop(0.45, 'rgba(160,30,8,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(17, 17).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.position.y = -0.62;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b0507 }));
  floor.position.y = -0.7;
  root.add(floor, halo);
  return root;
}

// ---------- the Overworld: marble and gold, equally clean ----------

function marbleTexture(light: boolean, variant: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = light ? '#f2eadb' : '#b98f3c';
  g.fillRect(0, 0, 256, 256);
  const r = rng(77 + variant * 13 + (light ? 0 : 5));
  for (let i = 0; i < 40; i++) {
    g.fillStyle = light ? `rgba(200,190,170,${0.05 + r() * 0.1})` : `rgba(255,230,150,${0.05 + r() * 0.12})`;
    g.beginPath(); g.arc(r() * 256, r() * 256, 10 + r() * 34, 0, 7); g.fill();
  }
  g.lineCap = 'round';
  for (const [w, color] of [[2.4, light ? 'rgba(150,140,130,0.35)' : 'rgba(110,70,10,0.4)'], [1, light ? 'rgba(255,255,255,0.8)' : 'rgba(255,240,180,0.6)']] as [number, string][]) {
    const rr = rng(311 + variant * 53);
    g.strokeStyle = color; g.lineWidth = w;
    for (let i = 0; i < 3; i++) {
      let x = rr() * 256, y = rr() * 256, a = rr() * 6.28;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { a += (rr() - 0.5) * 0.9; x += Math.cos(a) * (20 + rr() * 30); y += Math.sin(a) * (20 + rr() * 30); g.lineTo(x, y); }
      g.stroke();
    }
  }
  g.strokeStyle = 'rgba(80,60,30,0.35)'; g.lineWidth = 6; g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.strokeRect(5, 5, 246, 246);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function marbleTileMaterials(): { light: THREE.Material[]; dark: THREE.Material[] } {
  const build = (light: boolean) => Array.from({ length: 4 }, (_, i) => new THREE.MeshToonMaterial({ map: marbleTexture(light, i) }));
  return { light: build(true), dark: build(false) };
}

/** Gilded frame with a bright inlay and four pillar finials. */
export function buildGildedFrame(): THREE.Group {
  const root = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.5, 8.7), new THREE.MeshToonMaterial({ color: 0x9a7424 }));
  frame.position.y = -0.42;
  root.add(frame);
  const e = 4.22, len = 8.5;
  const inlay = merge([
    box(len, 0.03, 0.08, 0xfff0b0, { z: e, y: -0.16 }), box(len, 0.03, 0.08, 0xfff0b0, { z: -e, y: -0.16 }),
    box(0.08, 0.03, len, 0xfff0b0, { x: e, y: -0.16 }), box(0.08, 0.03, len, 0xfff0b0, { x: -e, y: -0.16 }),
  ]);
  root.add(mesh(inlay));
  const pillars: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 4.34, z = sz * 4.34;
    pillars.push(cyl(0.2, 0.26, 0.5, 0xe8dcc0, { x, z, y: 0.02 }, 8), cyl(0.27, 0.27, 0.07, 0xd9a93a, { x, z, y: -0.2 }, 8), cyl(0.27, 0.27, 0.07, 0xd9a93a, { x, z, y: 0.3 }, 8));
    pillars.push(cone(0.12, 0.3, 0xe0b040, { x, z, y: 0.48 }, 6));
  }
  root.add(mesh(merge(pillars)));
  return root;
}

export function buildHeavenGround(): THREE.Group {
  const root = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,240,200,0.9)');
  grad.addColorStop(0.5, 'rgba(255,225,160,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(17, 17).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.position.y = -0.62;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbdd2e6 }));
  floor.position.y = -0.7;
  root.add(floor, halo);
  return root;
}
