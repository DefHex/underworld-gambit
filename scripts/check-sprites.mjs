// Validates the built sprite sheets in public/sprites: image size, palette limit, frame bounds,
// tag names, all 8 views per step and contact frames. Also runs as part of `npm test`.
//
//   node scripts/check-sprites.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIECES } from './sprites/build-sprites.mjs';
import { readPng } from './sprites/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_TAGS = ['idle', 'move', 'atk_a', 'hurt', 'death'];
const MAX_FRAME_SIZE = 256;
const VIEWS = 8;

function checkFrames(sheet, report) {
  sheet.frames.forEach((f, i) => {
    if (f.x < 0 || f.y < 0 || f.x + f.w > sheet.size.w || f.y + f.h > sheet.size.h) report(`frame ${i} lies outside the atlas`);
    if (f.w > MAX_FRAME_SIZE || f.h > MAX_FRAME_SIZE) report(`frame ${i} is ${f.w}x${f.h}, max ${MAX_FRAME_SIZE}`);
    if (f.ax < 0 || f.ax > f.w || f.ay < 0 || f.ay > f.h) report(`frame ${i} has its anchor outside the frame`);
  });
}

function checkTags(sheet, report) {
  for (const tag of REQUIRED_TAGS) if (!sheet.tags[tag]) report(`missing tag "${tag}"`);
  for (const [tag, { steps, contact }] of Object.entries(sheet.tags)) {
    if (!steps.length) report(`tag "${tag}" has no steps`);
    steps.forEach((views, step) => {
      if (views.length !== VIEWS) report(`tag "${tag}" step ${step} has ${views.length} views, expected ${VIEWS}`);
      for (const [frame, mirrored] of views) {
        if (!sheet.frames[frame] || (mirrored !== 0 && mirrored !== 1)) report(`tag "${tag}" step ${step} points at a bad frame`);
      }
    });
    if (contact !== undefined && (contact < 0 || contact >= steps.length)) report(`tag "${tag}" contact step ${contact} is out of range`);
  }
}

function checkPixels(sheet, image, report) {
  if (image.width !== sheet.size.w || image.height !== sheet.size.h) report(`image is ${image.width}x${image.height}, data says ${sheet.size.w}x${sheet.size.h}`);
  if (sheet.palette.length > 256) report(`palette has ${sheet.palette.length} colors, max 256`);
  for (let i = 0; i < image.width * image.height; i++) {
    const opaque = image.rgba[i * 4 + 3] > 0, index = image.rgba[i * 4];
    if (opaque && index >= sheet.palette.length) { report(`a pixel uses palette index ${index}, beyond the palette`); return; }
  }
}

/** Returns every problem found (empty when the sheets are fine). */
export function checkSprites() {
  const problems = [];
  for (const [name, config] of Object.entries(PIECES)) {
    const report = (message) => problems.push(`${name}: ${message}`);
    const file = (ext) => path.join(ROOT, 'public/sprites', `${name}.${ext}`);
    if (!fs.existsSync(path.join(ROOT, 'art/sprites', config.source))) report(`source sheet art/sprites/${config.source} is missing`);
    if (!fs.existsSync(file('json')) || !fs.existsSync(file('png'))) { report('sheet missing (run npm run sprites)'); continue; }
    const sheet = JSON.parse(fs.readFileSync(file('json'), 'utf8'));
    checkPixels(sheet, readPng(fs.readFileSync(file('png'))), report);
    checkFrames(sheet, report);
    checkTags(sheet, report);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkSprites();
  for (const problem of problems) console.error(problem);
  console.log(problems.length ? `${problems.length} problem(s)` : 'sprites OK');
  process.exit(problems.length ? 1 : 0);
}
