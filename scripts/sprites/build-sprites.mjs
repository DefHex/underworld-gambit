// Builds the in-game piece sprites from the CC0 source sheets in art/sprites.
//
//   node scripts/sprites/build-sprites.mjs            -> public/sprites/<piece>.png + <piece>.json
//   node scripts/sprites/build-sprites.mjs --preview  -> also writes art/sprites/preview/<piece>.png
//
// Each source sheet has one row per animation frame and one column per viewing angle
// (Doom rotations 1-8: front, front-left, left, back-left, back, back-right, right, front-right;
// 5-column rows hold rotations 1-5 and the game mirrors 2-4 to get 8-6). Rows with a single
// angle (deaths) hold several frames side by side.
//
// Output image: one byte per pixel, the index into the piece's palette (0 = transparent,
// 1 = outline). The game recolors it per team with a palette texture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, writeIndexPng, writeRgbaPng } from './png.mjs';
import { findCells, spriteMask } from './slice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_DIR = path.join(ROOT, 'art/sprites');
const OUT_DIR = path.join(ROOT, 'public/sprites');
const ATLAS_WIDTH = 1024;
const MAX_WIDTH_UNITS = 1.25; // no view of a standing piece may be wider than this many squares
const TRANSPARENT = 0, OUTLINE = 1, FIRST_COLOR = 2;

/**
 * rows: one entry per sheet row, top to bottom: how many viewing angles it holds
 *       (8 or 5), 0 for a row of single-angle frames, or null to skip it.
 * tags: animations as lists of 1-based sheet rows; `contact` is the step where an attack lands.
 * height: on-board height of the standing front view, in squares.
 */
export const PIECES = {
  pawn: {
    source: 'officer.png', character: 'Stability Officer', height: 0.78,
    rows: [8, 8, 8, 8, 8, 8, 8, 8, 0],
    tags: { idle: [5], move: [1, 2, 3, 4], atk_a: [6, 7, 6], hurt: [8], death: [9] },
    contact: { atk_a: 1 },
  },
  knight: {
    source: 'hindring.png', character: 'Hindring', height: 0.82,
    rows: [5, 5, 5, 5, 5, 5, 5, 5, 0],
    tags: { idle: [1], move: [1, 2, 3, 4], atk_a: [5, 6, 7], hurt: [8], death: [9] },
    contact: { atk_a: 2 },
  },
  bishop: {
    source: 'bug.png', character: 'Bug', height: 0.95, hover: 0.3,
    rows: [5, 5, 5, 5, 5, 5, 5, 8, 8, 8, 5, 0],
    tags: { idle: [1], move: [1, 2, 3, 4], atk_a: [8, 9, 10], atk_b: [5, 6, 7], hurt: [11], death: [12] },
    contact: { atk_a: 2, atk_b: 2 },
  },
  rook: {
    source: 'harkubus.png', character: 'Harkubus', height: 1.0,
    rows: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, null, 0, 0],
    tags: { idle: [1], move: [1, 2, 3, 4, 5, 6], atk_a: [7, 8, 9], hurt: [10], death: [12, 13] },
    contact: { atk_a: 1 },
  },
  queen: {
    source: 'bmonkey.png', character: 'Bmonkey', height: 1.05,
    rows: [5, 5, 5, 5, 8, 8, 8, 5, 0],
    tags: { idle: [1], move: [1, 2, 3, 4], atk_a: [5, 6, 7], hurt: [8], death: [9] },
    contact: { atk_a: 1 },
  },
  king: {
    source: 'leader.png', character: 'Mutant Leader', height: 1.25,
    rows: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 0],
    tags: { idle: [1], move: [1, 2, 3, 4], atk_a: [5, 6, 7], atk_b: [8, 9, 10], hurt: [11], death: [12] },
    contact: { atk_a: 1, atk_b: 1 },
  },
};

const MIRROR_OF = { 6: 4, 7: 3, 8: 2 }; // rotations a 5-angle row gets by flipping

// ---------- one frame ----------

/** Adds a 1px outline ring (8-neighborhood) around the opaque pixels of a padded frame. */
function addOutline(pixels, w, h) {
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && pixels[y * w + x] >= FIRST_COLOR;
  const touchesSprite = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (opaque(x + dx, y + dy)) return true;
    return false;
  };
  const outlined = pixels.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (pixels[y * w + x] === TRANSPARENT && touchesSprite(x, y)) outlined[y * w + x] = OUTLINE;
  }
  return outlined;
}

/** Ground contact point: bottom edge of the sprite, centered on the lowest quarter of its pixels (the feet). */
function footAnchor(pixels, w, h) {
  const rowsWithPixels = [];
  for (let y = 0; y < h; y++) if (pixels.subarray(y * w, (y + 1) * w).some(Boolean)) rowsWithPixels.push(y);
  const top = rowsWithPixels[0], bottom = rowsWithPixels.at(-1) + 1;
  const footTop = bottom - Math.max(1, Math.round((bottom - top) / 4));
  const xs = [];
  for (let y = footTop; y < bottom; y++) for (let x = 0; x < w; x++) if (pixels[y * w + x]) xs.push(x);
  xs.sort((a, b) => a - b);
  return { x: xs[xs.length >> 1] + 0.5, y: bottom };
}

/** Copies one cell of the sheet as palette indices, padded by 1px for the outline. */
function extractFrame(image, mask, cell, colorIndex) {
  const w = cell.w + 2, h = cell.h + 2;
  const pixels = new Uint8Array(w * h);
  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      const i = (cell.y + y) * image.width + cell.x + x;
      if (!mask[i]) continue;
      const key = (image.rgba[i * 4] << 16) | (image.rgba[i * 4 + 1] << 8) | image.rgba[i * 4 + 2];
      if (!colorIndex.has(key)) colorIndex.set(key, colorIndex.size + FIRST_COLOR);
      pixels[(y + 1) * w + x + 1] = colorIndex.get(key);
    }
  }
  return { w, h, pixels: addOutline(pixels, w, h), anchor: footAnchor(pixels, w, h) };
}

// ---------- one piece ----------

/** Finds the frame cells of a sheet, one array per row (stray specks dropped). */
function sliceSheet(name, config) {
  const image = readPng(fs.readFileSync(path.join(SOURCE_DIR, config.source)));
  const mask = spriteMask(image);
  const rows = findCells(image, mask, { rowGap: 1, cellGap: 6 })
    .map((row) => row.filter((cell) => cell.w * cell.h > 30))
    .filter((row) => row.length);
  if (rows.length !== config.rows.length) throw new Error(`${name}: found ${rows.length} rows, config lists ${config.rows.length}`);
  return { image, mask, rows };
}

/**
 * Extracts every frame the config uses. Returns the frames and, per sheet row, either the frame for
 * each of the 8 rotations as [frameId, mirrored] (angled rows) or the row's frame ids (single-angle rows).
 */
function extractFrames(name, config, { image, mask, rows }) {
  const colorIndex = new Map();
  const frames = [];
  const take = (cell) => { frames.push(extractFrame(image, mask, cell, colorIndex)); return frames.length - 1; };
  const rowFrames = rows.map((cells, r) => {
    const views = config.rows[r];
    if (views === null) return null;
    if (views === 0) return cells.map(take);
    if (cells.length < views) throw new Error(`${name}: row ${r + 1} has ${cells.length} cells, expected ${views}`);
    const ids = cells.slice(0, views).map(take);
    return Array.from({ length: 8 }, (_, i) => (i < views ? [ids[i], 0] : [ids[MIRROR_OF[i + 1] - 1], 1]));
  });
  if (colorIndex.size > 256 - FIRST_COLOR) throw new Error(`${name}: ${colorIndex.size} colors, the palette holds ${256 - FIRST_COLOR}`);
  const palette = ['#000000', '#000000'];
  for (const key of colorIndex.keys()) palette.push('#' + key.toString(16).padStart(6, '0'));
  return { frames, rowFrames, palette };
}

/** Every tag step lists the frame for each of the 8 rotations; single-angle rows expand to one step per frame. */
function buildTags(config, rowFrames) {
  const tags = {};
  for (const [tag, sheetRows] of Object.entries(config.tags)) {
    const steps = sheetRows.flatMap((row) => (config.rows[row - 1] === 0
      ? rowFrames[row - 1].map((id) => Array.from({ length: 8 }, () => [id, 0]))
      : [rowFrames[row - 1]]));
    tags[tag] = config.contact?.[tag] === undefined ? { steps } : { steps, contact: config.contact[tag] };
  }
  return tags;
}

/** World units per texel: the standing front view is `height` squares tall, unless some standing view would get too wide. */
function unitsPerTexel(config, tags, frames) {
  const standing = tags.idle.steps[0].map(([id]) => frames[id]);
  const innerWidth = Math.max(...standing.map((f) => f.w - 2));
  return Math.min(config.height / (standing[0].h - 2), MAX_WIDTH_UNITS / innerWidth);
}

/** Shelf packer: tallest frames first, left to right, 1px gap. Sets each frame's x/y and returns the atlas. */
function packAtlas(frames) {
  let x = 0, y = 0, shelf = 0;
  for (const frame of [...frames].sort((a, b) => b.h - a.h)) {
    if (x + frame.w > ATLAS_WIDTH) { x = 0; y += shelf + 1; shelf = 0; }
    frame.x = x; frame.y = y;
    x += frame.w + 1;
    shelf = Math.max(shelf, frame.h);
  }
  let height = 64;
  while (height < y + shelf) height *= 2;
  const pixels = new Uint8Array(ATLAS_WIDTH * height);
  for (const f of frames) {
    for (let row = 0; row < f.h; row++) pixels.set(f.pixels.subarray(row * f.w, (row + 1) * f.w), (f.y + row) * ATLAS_WIDTH + f.x);
  }
  return { pixels, height };
}

/** 5th, 50th and 95th percentile of pixel luminance, so the game can map each piece's shading onto the same range. */
function luminanceRange(frames, palette) {
  const luminance = palette.map((hex) => {
    const v = Number.parseInt(hex.slice(1), 16);
    return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
  });
  const values = [];
  for (const f of frames) for (const index of f.pixels) if (index >= FIRST_COLOR) values.push(luminance[index]);
  values.sort((a, b) => a - b);
  const at = (q) => Number(values[Math.floor(q * (values.length - 1))].toFixed(3));
  return [at(0.05), at(0.5), at(0.95)];
}

function writePreview(name, atlas, palette) {
  const colors = palette.map((hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)));
  colors[OUTLINE] = [20, 12, 24];
  const rgba = new Uint8Array(atlas.pixels.length * 4);
  atlas.pixels.forEach((index, i) => rgba.set(index ? [...colors[index], 255] : [64, 64, 72, 255], i * 4));
  fs.mkdirSync(path.join(SOURCE_DIR, 'preview'), { recursive: true });
  fs.writeFileSync(path.join(SOURCE_DIR, 'preview', `${name}.png`), writeRgbaPng(ATLAS_WIDTH, atlas.height, rgba));
}

function buildPiece(name, config, { preview }) {
  const { frames, rowFrames, palette } = extractFrames(name, config, sliceSheet(name, config));
  const tags = buildTags(config, rowFrames);
  const atlas = packAtlas(frames);
  const json = {
    character: config.character,
    source: `art/sprites/${config.source}`,
    image: `${name}.png`,
    size: { w: ATLAS_WIDTH, h: atlas.height },
    unitsPerTexel: Number(unitsPerTexel(config, tags, frames).toFixed(6)),
    hover: config.hover ?? 0,
    palette,
    luminance: luminanceRange(frames, palette),
    frames: frames.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h, ax: f.anchor.x, ay: f.anchor.y })),
    tags,
  };
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), writeIndexPng(ATLAS_WIDTH, atlas.height, atlas.pixels));
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(json));
  if (preview) writePreview(name, atlas, palette);
  console.log(`${name.padEnd(7)} ${config.character.padEnd(18)} ${String(frames.length).padStart(3)} frames  ${palette.length - FIRST_COLOR} colors  atlas ${ATLAS_WIDTH}x${atlas.height}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const preview = process.argv.includes('--preview');
  for (const [name, config] of Object.entries(PIECES)) buildPiece(name, config, { preview });
}
