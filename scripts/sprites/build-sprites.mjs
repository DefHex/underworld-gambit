// Builds the in-game piece sprites from the baked sheets in art/sprites (see `npm run bake`).
//
//   node scripts/sprites/build-sprites.mjs   -> public/sprites/<piece>.png + <piece>.json
//
// A sheet is a grid of 64px cells on cyan: one row per animation frame, one cell per Doom viewing
// angle (1-8: front, front-left, left, back-left, back, back-right, right, front-right). Rows of
// single-angle frames (deaths) hold several frames side by side. The sidecar <piece>.json says which
// rows are which, the tags, the contact steps and the colors that keep their color on every team.
//
// Output image: one byte per pixel, the index into the piece's palette (0 = transparent,
// 1 = outline). The game recolors it per team with a palette texture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, writeIndexPng } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCE_DIR = path.join(ROOT, 'art/sprites');
const OUT_DIR = path.join(ROOT, 'public/sprites');
const ATLAS_WIDTH = 512;
const TRANSPARENT = 0, OUTLINE = 1, FIRST_COLOR = 2, MAX_COLORS = 256 - FIRST_COLOR;
const VIEWS = 8;

/** Names of the baked sheets (each has a .png and a .json in art/sprites). */
export const sheetNames = () => fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();

const isCyan = (rgba, i) => rgba[i * 4] === 0 && rgba[i * 4 + 1] === 255 && rgba[i * 4 + 2] === 255;
const rgbKey = (rgba, i) => (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
const channels = (key) => [key >> 16, (key >> 8) & 255, key & 255];
const distance = (a, b) => Math.hypot(...channels(a).map((v, i) => v - channels(b)[i]));

// ---------- cutting the sheet ----------

/** Tight bounds of the opaque pixels in one cell, or null when the cell is empty. */
function cellBounds(image, x0, y0, size) {
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  for (let y = y0; y < y0 + size.h; y++) {
    for (let x = x0; x < x0 + size.w; x++) {
      if (isCyan(image.rgba, y * image.width + x)) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

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

/** Cuts one frame out (padded by 1px for the outline), as raw colors for now. Its anchor is the cell's foot point. */
function cutFrame(image, bounds, cellX, cellY, anchor) {
  const w = bounds.w + 2, h = bounds.h + 2;
  const colors = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < bounds.h; y++) {
    for (let x = 0; x < bounds.w; x++) {
      const i = (bounds.y + y) * image.width + bounds.x + x;
      if (!isCyan(image.rgba, i)) colors[(y + 1) * w + x + 1] = rgbKey(image.rgba, i);
    }
  }
  return { w, h, colors, ax: cellX + anchor.x - bounds.x + 1, ay: cellY + anchor.y - bounds.y + 1 };
}

/** Frames of every row: angled rows give [frameId, 0] per view, single-angle rows a list of frame ids. */
function cutSheet(name, image, meta) {
  const frames = [];
  const rows = meta.rows.map((views, r) => {
    const ids = [];
    for (let column = 0; column < VIEWS; column++) {
      const cellX = column * meta.cell.w, cellY = r * meta.cell.h;
      const bounds = cellBounds(image, cellX, cellY, meta.cell);
      if (!bounds) {
        if (views === VIEWS) throw new Error(`${name}: row ${r + 1}, view ${column + 1} is empty`);
        break;
      }
      frames.push(cutFrame(image, bounds, cellX, cellY, meta.anchor));
      ids.push(frames.length - 1);
    }
    return views === VIEWS ? ids.map((id) => [id, 0]) : ids;
  });
  return { frames, rows };
}

// ---------- palette ----------

/** Most used colors first; when there are too many, the rare ones merge into their nearest neighbor. */
function buildPalette(frames) {
  const counts = new Map();
  for (const f of frames) for (const key of f.colors) if (key >= 0) counts.set(key, (counts.get(key) ?? 0) + 1);
  const palette = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a)).slice(0, MAX_COLORS);
  const indexOf = new Map(palette.map((key, i) => [key, i + FIRST_COLOR]));
  for (const key of counts.keys()) {
    if (indexOf.has(key)) continue;
    const nearest = palette.reduce((best, candidate) => (distance(key, candidate) < distance(key, best) ? candidate : best));
    indexOf.set(key, indexOf.get(nearest));
  }
  return { palette, indexOf };
}

/** 5th, 50th and 95th percentile of pixel luminance, so the game can map each piece's shading onto the same range. */
function luminanceRange(frames) {
  const values = [];
  for (const f of frames) {
    for (const key of f.colors) {
      if (key < 0) continue;
      const [r, g, b] = channels(key);
      values.push((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
    }
  }
  values.sort((a, b) => a - b);
  const at = (q) => Number(values[Math.floor(q * (values.length - 1))].toFixed(3));
  return [at(0.05), at(0.5), at(0.95)];
}

// ---------- atlas ----------

/** Shelf packer: tallest frames first, left to right, 1px gap. Sets each frame's x/y and returns the atlas. */
function packAtlas(frames) {
  let x = 0, y = 0, shelf = 0;
  for (const frame of [...frames].sort((a, b) => b.h - a.h)) {
    if (x + frame.w > ATLAS_WIDTH) { x = 0; y += shelf + 1; shelf = 0; }
    frame.x = x; frame.y = y;
    x += frame.w + 1;
    shelf = Math.max(shelf, frame.h);
  }
  let height = 32;
  while (height < y + shelf) height *= 2;
  const pixels = new Uint8Array(ATLAS_WIDTH * height);
  for (const f of frames) {
    for (let row = 0; row < f.h; row++) pixels.set(f.pixels.subarray(row * f.w, (row + 1) * f.w), (f.y + row) * ATLAS_WIDTH + f.x);
  }
  return { pixels, height };
}

// ---------- one piece ----------

function buildPiece(name) {
  const meta = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, `${name}.json`), 'utf8'));
  const image = readPng(fs.readFileSync(path.join(SOURCE_DIR, `${name}.png`)));
  const { frames, rows } = cutSheet(name, image, meta);
  const { palette, indexOf } = buildPalette(frames);
  for (const f of frames) {
    const pixels = Uint8Array.from(f.colors, (key) => (key < 0 ? TRANSPARENT : indexOf.get(key)));
    f.pixels = addOutline(pixels, f.w, f.h);
  }

  const tags = {};
  for (const [tag, sheetRows] of Object.entries(meta.tags)) {
    const steps = sheetRows.flatMap((row) => (meta.rows[row - 1] === VIEWS
      ? [rows[row - 1]]
      : rows[row - 1].map((id) => Array.from({ length: VIEWS }, () => [id, 0]))));
    tags[tag] = meta.contact[tag] === undefined ? { steps } : { steps, contact: meta.contact[tag] };
  }
  const front = frames[tags.idle.steps[0][0][0]];
  const keep = meta.keep.map((hex) => {
    const key = Number.parseInt(hex.slice(1), 16);
    const match = palette.find((color) => distance(color, key) <= 6);
    if (match === undefined) throw new Error(`${name}: keep color ${hex} does not appear in the sheet`);
    return indexOf.get(match);
  });

  const atlas = packAtlas(frames);
  const json = {
    source: `art/sprites/${name}.png`,
    image: `${name}.png`,
    size: { w: ATLAS_WIDTH, h: atlas.height },
    unitsPerTexel: Number((meta.height / (front.h - 2)).toFixed(6)),
    palette: ['#000000', '#000000', ...palette.map((key) => '#' + key.toString(16).padStart(6, '0'))],
    luminance: luminanceRange(frames),
    keep,
    frames: frames.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h, ax: f.ax, ay: f.ay })),
    tags,
  };
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), writeIndexPng(ATLAS_WIDTH, atlas.height, atlas.pixels));
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(json));
  console.log(`${name.padEnd(7)} ${String(frames.length).padStart(3)} frames  ${palette.length} colors  atlas ${ATLAS_WIDTH}x${atlas.height}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of sheetNames()) buildPiece(name);
}
