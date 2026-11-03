import * as THREE from 'three';
import type { BoardId, PieceType } from '../../rules';

/**
 * Pixel-art piece sprites, built by scripts/sprites/build-sprites.mjs from the CC0 sheets in art/sprites.
 * Each sheet image stores palette indices (0 = transparent, 1 = outline); colors come from a shared
 * palette texture with one row per piece, team and realm.
 */

export type SpriteTag = 'idle' | 'move' | 'atk_a' | 'atk_b' | 'hurt' | 'death';
/** [frame index, 1 if drawn mirrored] for one of the 8 viewing angles. */
export type FrameRef = [number, 0 | 1];

export interface SheetFrame { x: number; y: number; w: number; h: number; ax: number; ay: number }
export interface SheetTag {
  /** steps[step][rotation 0-7] */
  steps: FrameRef[][];
  /** Step on which an attack lands. */
  contact?: number;
}
export interface SheetData {
  character: string;
  image: string;
  size: { w: number; h: number };
  unitsPerTexel: number;
  hover: number;
  palette: string[];
  /** 5th, 50th and 95th percentile of the sprite's pixel luminance. */
  luminance: [number, number, number];
  frames: SheetFrame[];
  tags: Partial<Record<SpriteTag, SheetTag>>;
}

const SHEET_NAMES: Record<PieceType, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const PIECE_ORDER: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const VARIANTS_PER_PIECE = 4; // white / black, on the Overworld / Underworld
const PALETTE_ROWS = PIECE_ORDER.length * VARIANTS_PER_PIECE;

// ---------- team palettes ----------

type Ramp = [number, string][];
/** `middle`: where on the ramp a sprite's median brightness lands (White sits lighter than Black). */
interface Look { ramp: Ramp; middle: number; outline: string }
/** Each piece's own shading is mapped onto its team's ramp: cream and gold for White, purple and silver for Black. */
const LOOKS: Record<BoardId, [Look, Look]> = {
  0: [
    { ramp: [[0, '#2a1a0c'], [0.3, '#7a5428'], [0.6, '#cfa457'], [0.82, '#eedcae'], [1, '#fffaee']], middle: 0.66, outline: '#1a1008' },
    { ramp: [[0, '#08050c'], [0.3, '#26183a'], [0.6, '#5a4a86'], [0.82, '#a6a8c8'], [1, '#e6e8ff']], middle: 0.4, outline: '#05030a' },
  ],
  1: [
    { ramp: [[0, '#1e0c06'], [0.3, '#6a3016'], [0.6, '#c86c2c'], [0.82, '#f2b474'], [1, '#ffe6be']], middle: 0.62, outline: '#1a0804' },
    { ramp: [[0, '#06030c'], [0.3, '#22104a'], [0.6, '#5c2aa8'], [0.82, '#a77af0'], [1, '#e2ccff']], middle: 0.42, outline: '#6a3ac0' },
  ],
};
/** How much of a sprite's original hue survives the recolor. */
const ORIGINAL_HUE = 0.18;

type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

/** Hue in degrees, 0-360. */
function hueOf([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b), range = max - Math.min(r, g, b);
  if (range === 0) return 0;
  if (max === r) return 60 * (((g - b) / range + 6) % 6);
  if (max === g) return 60 * ((b - r) / range + 2);
  return 60 * ((r - g) / range + 4);
}

function sampleRamp(ramp: Ramp, t: number): Rgb {
  for (let i = 1; i < ramp.length; i++) {
    const [t1, hex1] = ramp[i];
    if (t > t1 && i < ramp.length - 1) continue;
    const [t0, hex0] = ramp[i - 1];
    const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const a = hexToRgb(hex0), b = hexToRgb(hex1);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }
  return hexToRgb(ramp.at(-1)![1]);
}

/** Muzzle flashes, glowing eyes and fire: bright, saturated yellows keep their own color on every team. */
function isGlow(color: Rgb): boolean {
  const max = Math.max(...color), saturation = max === 0 ? 0 : (max - Math.min(...color)) / max;
  const hue = hueOf(color);
  return max >= 0.8 && saturation >= 0.55 && hue >= 35 && hue <= 70;
}

/** Maps a luminance onto the ramp: the sprite's darkest, median and brightest tones land on 0.06, `middle` and 0.94. */
function rampPosition(luminance: number, [low, median, high]: [number, number, number], middle: number): number {
  if (luminance <= median) return 0.06 + (middle - 0.06) * Math.max(0, (luminance - low) / Math.max(0.01, median - low));
  return middle + (0.94 - middle) * Math.min(1, (luminance - median) / Math.max(0.01, high - median));
}

function writePaletteRow(target: Uint8Array, row: number, data: SheetData, look: Look): void {
  data.palette.forEach((hex, index) => {
    let color: Rgb;
    if (index === 0) color = [0, 0, 0];
    else if (index === 1) color = hexToRgb(look.outline);
    else {
      const original = hexToRgb(hex);
      const luminance = 0.2126 * original[0] + 0.7152 * original[1] + 0.0722 * original[2];
      const team = sampleRamp(look.ramp, rampPosition(luminance, data.luminance, look.middle));
      color = isGlow(original)
        ? original
        : team.map((value, channel) => value + (original[channel] - value) * ORIGINAL_HUE) as Rgb;
    }
    const offset = (row * 256 + index) * 4;
    target.set([color[0] * 255, color[1] * 255, color[2] * 255, index === 0 ? 0 : 255].map(Math.round), offset);
  });
}

export const paletteTexture = (() => {
  const texture = new THREE.DataTexture(new Uint8Array(256 * PALETTE_ROWS * 4), 256, PALETTE_ROWS, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
})();

// ---------- sheets ----------

const readyListeners: (() => void)[] = [];
/** Runs `listener` whenever a sheet finishes loading (so the scene can redraw). */
export function onSpriteSheetLoaded(listener: () => void): void { readyListeners.push(listener); }

export class SpriteSheet {
  /** Null until both the image and its frame data have loaded. */
  data: SheetData | null = null;
  readonly texture = new THREE.Texture();
  private readonly firstRow: number;

  constructor(readonly type: PieceType) {
    this.firstRow = PIECE_ORDER.indexOf(type) * VARIANTS_PER_PIECE;
    this.texture.colorSpace = THREE.NoColorSpace; // the pixels are palette indices, not colors
    this.texture.flipY = false;
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
  }

  /** Fetches the image and frame data, then fills in this piece's palette rows. */
  async load(): Promise<void> {
    const base = import.meta.env.BASE_URL + 'sprites/' + SHEET_NAMES[this.type];
    const [image, data] = await Promise.all([
      new THREE.ImageLoader().loadAsync(base + '.png'),
      fetch(base + '.json').then((response) => response.json() as Promise<SheetData>),
    ]);
    this.texture.image = image;
    this.texture.needsUpdate = true;
    const palette = paletteTexture.image.data as Uint8Array;
    for (const board of [0, 1] as BoardId[]) {
      for (const color of [0, 1] as const) writePaletteRow(palette, this.row(color, board), data, LOOKS[board][color]);
    }
    paletteTexture.needsUpdate = true;
    this.data = data;
    for (const listener of readyListeners) listener();
  }

  /** Palette texture row for a team on a board. */
  row(color: 0 | 1, board: BoardId): number { return this.firstRow + color + 2 * board; }

  /** v coordinate of a palette row's center. */
  rowCenter(color: 0 | 1, board: BoardId): number { return (this.row(color, board) + 0.5) / PALETTE_ROWS; }
}

const sheets = new Map<PieceType, SpriteSheet>();
/** The sprite sheet for a piece type (starts loading on first use). */
export function spriteSheet(type: PieceType): SpriteSheet {
  let sheet = sheets.get(type);
  if (!sheet) {
    sheet = new SpriteSheet(type);
    sheets.set(type, sheet);
    void sheet.load();
  }
  return sheet;
}
