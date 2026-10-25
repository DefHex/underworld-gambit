import * as THREE from 'three';
import { ball, box, cone, cyl, merge } from './pieces';
import { glow, mesh } from './exec/props';
import { loadProp } from './models';

/**
 * Stylized terrain for both boards. Each square has a biome; its color is the biome's, shaded
 * light or dark so the chessboard checker stays readable. Features are small and sit at tile
 * corners, so pieces are never hidden and always stand at the same height.
 *
 * Overworld:  g grass, f forest, m mountain, h hills, r river
 * Underworld: a ash plain, l lava river, m obsidian ridge, f dead forest, b bone field
 */
const OVER_MAP = [ // rank 8 at the top
  'mmhgrghm',
  'mfggrrgh',
  'hfgggrgf',
  'ggfggrrg',
  'gfgggggr',
  'ffghggrr',
  'gfhggrrg',
  'gggggrgg',
];
const HELL_MAP = [
  'mmaaalam',
  'mfaaallf',
  'afaabaal',
  'aabaaall',
  'abaaaaal',
  'ffabaall',
  'abmaaall',
  'aaaaalaa',
];
const biomeAt = (map: string[], sq: number) => map[7 - (sq >> 3)][sq & 7];

function rng(seed: number) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

type Ctx = CanvasRenderingContext2D;
const S = 256;

interface Paint { base: [string, string]; draw: (g: Ctx, r: () => number, dark: boolean) => void; emissive?: boolean }

const speck = (g: Ctx, r: () => number, n: number, color: string, size = 2) => {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(r() * S, r() * S, size, size * (1 + r()));
};
const strokes = (g: Ctx, r: () => number, n: number, color: string, w: number, len: number, wiggle = 0.6) => {
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = r() * S, y = r() * S, a = r() * 6.28;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { a += (r() - 0.5) * wiggle * 2; x += Math.cos(a) * len; y += Math.sin(a) * len; g.lineTo(x, y); }
    g.stroke();
  }
};

const OVER_PAINT: Record<string, Paint> = {
  g: { base: ['#84c35a', '#6bae48'], draw: (g, r) => { speck(g, r, 140, 'rgba(255,255,255,0.12)'); speck(g, r, 120, 'rgba(30,90,20,0.2)', 3); } },
  f: { base: ['#4e8f3e', '#3f7a33'], draw: (g, r) => { speck(g, r, 120, 'rgba(20,60,15,0.3)', 3); speck(g, r, 40, 'rgba(180,140,60,0.35)', 2); } },
  h: { base: ['#a9b85a', '#94a44a'], draw: (g, r) => { strokes(g, r, 6, 'rgba(90,100,30,0.35)', 3, 36, 0.3); speck(g, r, 60, 'rgba(255,255,200,0.15)'); } },
  m: { base: ['#b0aaa4', '#938d88'], draw: (g, r) => { strokes(g, r, 9, 'rgba(60,55,55,0.45)', 3, 34, 0.9); strokes(g, r, 5, 'rgba(255,255,255,0.3)', 2, 30, 0.7); } },
  r: { base: ['#58b4e8', '#3f9bd6'], draw: (g, r) => { strokes(g, r, 10, 'rgba(255,255,255,0.55)', 3, 32, 0.4); strokes(g, r, 6, 'rgba(20,80,150,0.3)', 5, 40, 0.3); } },
};

const HELL_PAINT: Record<string, Paint> = {
  a: { base: ['#54403f', '#382a2c'], draw: (g, r) => { speck(g, r, 120, 'rgba(0,0,0,0.25)', 3); speck(g, r, 16, 'rgba(255,110,30,0.85)', 2); } },
  l: { base: ['#d9500f', '#b83a08'], emissive: true, draw: (g, r) => { strokes(g, r, 10, 'rgba(255,230,120,0.85)', 5, 34, 0.5); strokes(g, r, 8, 'rgba(150,20,0,0.5)', 7, 36, 0.4); } },
  m: { base: ['#3a2d34', '#251b22'], draw: (g, r) => { strokes(g, r, 8, 'rgba(0,0,0,0.6)', 4, 34, 0.9); strokes(g, r, 4, 'rgba(255,100,20,0.9)', 2, 30, 0.8); } },
  f: { base: ['#35262a', '#241a1e'], draw: (g, r) => { speck(g, r, 100, 'rgba(0,0,0,0.35)', 3); strokes(g, r, 3, 'rgba(255,90,20,0.7)', 2, 28, 0.8); } },
  b: { base: ['#8a7f6c', '#6f6554'], draw: (g, r) => { speck(g, r, 70, 'rgba(0,0,0,0.2)', 3); strokes(g, r, 5, 'rgba(240,235,215,0.5)', 4, 20, 1.2); } },
};

const texCache = new Map<string, THREE.CanvasTexture>();
function tileTexture(over: boolean, biome: string, dark: boolean, variant: number): THREE.CanvasTexture {
  const key = `${over}${biome}${dark}${variant}`;
  let t = texCache.get(key);
  if (t) return t;
  const paint = (over ? OVER_PAINT : HELL_PAINT)[biome];
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = paint.base[dark ? 1 : 0];
  g.fillRect(0, 0, S, S);
  paint.draw(g, rng(500 + variant * 17 + biome.charCodeAt(0)), dark);
  // Slab edge so each square reads on its own.
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 7; g.strokeRect(0, 0, S, S);
  g.strokeStyle = over ? 'rgba(255,255,255,0.22)' : 'rgba(255,150,80,0.16)'; g.lineWidth = 2; g.strokeRect(5, 5, S - 10, S - 10);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

const matCache = new Map<string, THREE.Material>();
export function tileMaterial(over: boolean, sq: number): THREE.Material {
  const map = over ? OVER_MAP : HELL_MAP;
  const biome = biomeAt(map, sq);
  const dark = (((sq & 7) + (sq >> 3)) & 1) === 0;
  const variant = (sq * 7 + (sq >> 3)) % 3;
  const key = `${over}${biome}${dark}${variant}`;
  let m = matCache.get(key);
  if (!m) {
    const tex = tileTexture(over, biome, dark, variant);
    const hot = !over && (HELL_PAINT[biome].emissive || biome === 'm' || biome === 'a');
    m = new THREE.MeshToonMaterial({
      map: tex,
      emissiveMap: hot ? tex : null,
      emissive: hot ? 0xffffff : 0x000000,
      emissiveIntensity: biome === 'l' ? 0.85 : hot ? 0.25 : 0,
    });
    matCache.set(key, m);
  }
  return m;
}

// ---------- 3D features ----------

const CORNERS: [number, number][] = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];

function pine(x: number, z: number, h: number, r: () => number): THREE.BufferGeometry[] {
  const g = 0x2f6b2e + (r() < 0.5 ? 0x0a1a08 : 0);
  return [
    cyl(0.03, 0.04, h * 0.3, 0x6a4a2a, { x, z, y: h * 0.15 }, 5),
    cone(0.16, h * 0.45, g, { x, z, y: h * 0.4 }, 6),
    cone(0.12, h * 0.4, g + 0x081008, { x, z, y: h * 0.62 }, 6),
    cone(0.08, h * 0.32, g + 0x102010, { x, z, y: h * 0.82 }, 6),
  ];
}
function deadTree(x: number, z: number, h: number, r: () => number): THREE.BufferGeometry[] {
  const c = 0x14100f;
  return [
    cyl(0.02, 0.04, h, c, { x, z, y: h / 2 }, 4),
    box(0.025, h * 0.5, 0.025, c, { x: x + 0.07, z, y: h * 0.7, rz: -0.8 }),
    box(0.025, h * 0.45, 0.025, c, { x: x - 0.06, z: z + 0.03, y: h * 0.62, rz: 0.9 }),
    box(0.025, h * 0.35, 0.025, c, { x, z: z + 0.07, y: h * 0.82, rx: 0.8, ry: r() * 3 }),
  ];
}

/** Builds the feature meshes for a board. Overworld and Underworld each get their own set. */
export function buildTerrainProps(over: boolean): THREE.Group {
  const root = new THREE.Group();
  const map = over ? OVER_MAP : HELL_MAP;
  const solid: THREE.BufferGeometry[] = [];
  const hot: THREE.BufferGeometry[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const biome = biomeAt(map, sq);
    const r = rng(9000 + sq * 31);
    const cx = (sq & 7) - 3.5, cz = 3.5 - (sq >> 3);
    const spots = CORNERS.slice().sort(() => r() - 0.5).slice(0, 2);
    const at = (i: number) => [cx + spots[i][0], cz + spots[i][1]] as const;
    if (over) {
      if (biome === 'f') {
        for (let i = 0; i < 2; i++) { const [x, z] = at(i); solid.push(...pine(x, z, 0.5 + r() * 0.2, r)); }
      } else if (biome === 'm') {
        const [x0, z0] = at(0), [x1, z1] = at(1);
        solid.push(cone(0.2, 0.55, 0x8d8782, { x: x0, z: z0, y: 0.27, ry: r() * 3 }, 5), cone(0.07, 0.16, 0xffffff, { x: x0, z: z0, y: 0.52 }, 5));
        solid.push(cone(0.15, 0.38, 0x9a948f, { x: x1, z: z1, y: 0.19, ry: r() * 3 }, 5));
      } else if (biome === 'h') {
        const [x, z] = at(0);
        solid.push(ball(0.22, 0x9fb050, { x, z, y: 0, sy: 0.55 }, 8, 5), ball(0.05, 0x8a8680, { x: x + 0.18, z: z + 0.06, y: 0.02 }, 5, 4));
      } else if (biome === 'g' && r() < 0.35) {
        const [x, z] = at(0);
        solid.push(ball(0.09, 0x4f9a3a, { x, z, y: 0.05 }, 6, 4), ball(0.025, r() < 0.5 ? 0xffd84a : 0xff7aa8, { x: x + 0.05, z: z + 0.03, y: 0.12 }, 4, 3));
      }
    } else {
      if (biome === 'm') {
        for (let i = 0; i < 2; i++) {
          const [x, z] = at(i); const h = 0.4 + r() * 0.35;
          solid.push(cone(0.13, h, 0x17101a, { x, z, y: h / 2, ry: r() * 3 }, 5));
          hot.push(cone(0.04, 0.1, 0xff6a20, { x, z, y: h - 0.03 }, 5));
        }
      } else if (biome === 'f') {
        for (let i = 0; i < 2; i++) { const [x, z] = at(i); solid.push(...deadTree(x, z, 0.5 + r() * 0.2, r)); }
      } else if (biome === 'a' && r() < 0.3) {
        const [x, z] = at(0);
        solid.push(ball(0.07, 0x2a1d20, { x, z, y: 0.03, sy: 0.7 }, 5, 4));
        hot.push(ball(0.025, 0xff7a20, { x: x + 0.02, z, y: 0.08 }, 4, 3));
      } else if (biome === 'l' && r() < 0.4) {
        const [x, z] = at(0);
        hot.push(ball(0.045, 0xffd060, { x, z, y: 0.04, sy: 0.6 }, 5, 4));
      } else if (biome === 'b') {
        const [x, z] = at(0), [x2, z2] = at(1);
        solid.push(ball(0.09, 0xdcd3bc, { x, z, y: 0.06, sy: 0.9 }, 7, 5), box(0.12, 0.04, 0.06, 0x2a2420, { x, z: z + 0.07, y: 0.04 }));
        solid.push(box(0.04, 0.04, 0.3, 0xdcd3bc, { x: x2, z: z2, y: 0.03, ry: r() * 3 }), box(0.04, 0.04, 0.22, 0xdcd3bc, { x: x2 + 0.05, z: z2, y: 0.05, ry: r() * 3 + 1 }));
      }
    }
  }
  if (solid.length) root.add(mesh(merge(solid)));
  if (hot.length) root.add(new THREE.Mesh(merge(hot), glow(0xff7a30, 0.95)));
  return root;
}

/** KayKit skulls and rib cages on the bone fields of the Underworld. */
export async function addBoneFieldModels(root: THREE.Object3D): Promise<void> {
  const skull = await loadProp('skull_candle', 0.3).catch(() => null);
  const ribs = await loadProp('ribcage', 0.16).catch(() => null);
  let n = 0;
  for (let sq = 0; sq < 64; sq++) {
    if (biomeAt(HELL_MAP, sq) !== 'b') continue;
    const proto = n % 2 ? ribs : skull;
    n++;
    if (!proto) continue;
    const o = proto.clone(true);
    o.position.set((sq & 7) - 3.5 - 0.3, 0, 3.5 - (sq >> 3) + 0.3);
    o.rotation.y = n * 1.7;
    root.add(o);
  }
}
