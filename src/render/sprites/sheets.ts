import * as THREE from 'three';
import type { BoardId, PieceType } from '../../rules';

/**
 * Pixel-art piece sprites, baked from the models in src/bake (npm run bake) and built by
 * scripts/sprites/build-sprites.mjs (npm run sprites).
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
  image: string;
  size: { w: number; h: number };
  unitsPerTexel: number;
  palette: string[];
  /** Palette indices of the team-colored parts (robes, the horse, the tower's stone). */
  team: number[];
  /** 5th, 50th and 95th percentile of the team pixels' luminance. */
  luminance: [number, number, number];
  /** Palette indices that glow (fire, flashes, blood, magic): drawn as is, even on the Underworld. */
  keep: number[];
  frames: SheetFrame[];
  tags: Partial<Record<SpriteTag, SheetTag>>;
}

const SHEET_NAMES: Record<PieceType, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const PIECE_ORDER: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const VARIANTS_PER_PIECE = 4; // white / black, on the Overworld / Underworld
const PALETTE_ROWS = PIECE_ORDER.length * VARIANTS_PER_PIECE;

// ---------- team palettes ----------

type Ramp = [number, string][];
type Rgb = [number, number, number];
/**
 * How a team looks on a board. Only the team-colored parts follow `ramp` (the sprite's own shading
 * mapped from dark to light, `middle` = where its median tone lands); everything else keeps its
 * colors, multiplied by `tint` (the Underworld's hellish light).
 */
interface Look { ramp: Ramp; middle: number; outline: string; tint: Rgb }
const DAYLIGHT: Rgb = [1, 1, 1];
const HELLFIRE: Rgb = [0.95, 0.76, 0.72];
const LOOKS: Record<BoardId, [Look, Look]> = {
  0: [
    { ramp: [[0, '#3a3230'], [0.35, '#8e867a'], [0.65, '#dcd4c4'], [1, '#fffcf4']], middle: 0.7, outline: '#1a1410', tint: DAYLIGHT },
    { ramp: [[0, '#07060a'], [0.35, '#1e1a26'], [0.65, '#463f54'], [1, '#867e9c']], middle: 0.36, outline: '#000000', tint: DAYLIGHT },
  ],
  1: [
    { ramp: [[0, '#2a100a'], [0.35, '#7a3a24'], [0.65, '#d08a5a'], [1, '#ffdcb4']], middle: 0.66, outline: '#1a0804', tint: HELLFIRE },
    { ramp: [[0, '#08040e'], [0.35, '#241048'], [0.65, '#5a2aa0'], [1, '#a684ec']], middle: 0.4, outline: '#6a3ac0', tint: HELLFIRE },
  ],
};
/** How much of a team part's own hue survives under the team color (a hint of the drawn color). */
const TEAM_HUE = 0.28;

const hexToRgb = (hex: string): Rgb => {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

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

/** Maps a luminance onto the ramp: the sprite's darkest, median and brightest tones land on 0.06, `middle` and 0.94. */
function rampPosition(luminance: number, [low, median, high]: [number, number, number], middle: number): number {
  if (luminance <= median) return 0.06 + (middle - 0.06) * Math.max(0, (luminance - low) / Math.max(0.01, median - low));
  return middle + (0.94 - middle) * Math.min(1, (luminance - median) / Math.max(0.01, high - median));
}

/** The color one palette entry gets for a team on a board. */
function teamColor(index: number, hex: string, data: SheetData, look: Look): Rgb {
  if (index === 0) return [0, 0, 0];
  if (index === 1) return hexToRgb(look.outline);
  const original = hexToRgb(hex);
  if (data.keep.includes(index)) return original;
  if (!data.team.includes(index)) return original.map((value, channel) => value * look.tint[channel]) as Rgb;
  const luminance = 0.2126 * original[0] + 0.7152 * original[1] + 0.0722 * original[2];
  const team = sampleRamp(look.ramp, rampPosition(luminance, data.luminance, look.middle));
  return team.map((value, channel) => value + (original[channel] - value) * TEAM_HUE) as Rgb;
}

function writePaletteRow(target: Uint8Array, row: number, data: SheetData, look: Look): void {
  data.palette.forEach((hex, index) => {
    const color = teamColor(index, hex, data, look);
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
