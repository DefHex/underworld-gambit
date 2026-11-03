// Finds the sprite frames on a hand-laid-out sheet: one row per animation frame,
// one column per viewing angle, on a flat cyan background (optionally inside cyan
// boxes on a gray backdrop).

const isCyan = (rgba, i) => rgba[i * 4] === 0 && rgba[i * 4 + 1] === 255 && rgba[i * 4 + 2] === 255;

/** Opaque-pixel mask: everything that is neither the cyan key nor the gray backdrop around the boxes. */
export function spriteMask({ width, height, rgba }) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) mask[i] = isCyan(rgba, i) || rgba[i * 4 + 3] === 0 ? 0 : 1;
  if (isCyan(rgba, 0)) return mask;
  // Boxed sheet: flood-fill the backdrop color from the edges so it never counts as sprite.
  const backdrop = rgba.slice(0, 4).join();
  const stack = [];
  const push = (x, y) => { if (x >= 0 && y >= 0 && x < width && y < height) stack.push(y * width + x); };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    if (!mask[i] || rgba.slice(i * 4, i * 4 + 4).join() !== backdrop) continue;
    mask[i] = 0;
    const x = i % width, y = (i / width) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return mask;
}

/** Runs of `true` in `filled`, merging runs separated by fewer than `minGap` empty entries. */
function bands(filled, minGap) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= filled.length; i++) {
    if (i < filled.length && filled[i]) { if (start < 0) start = i; continue; }
    if (start >= 0) { runs.push([start, i]); start = -1; }
  }
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run[0] - last[1] < minGap) last[1] = run[1];
    else merged.push([...run]);
  }
  return merged;
}

/**
 * Splits the sheet into rows of cells. Each cell is the tight bounding box of one frame.
 * `rowGap` / `cellGap`: empty runs shorter than this are treated as part of the same row / frame
 * (blood drops, muzzle flashes and claws are often detached by a few pixels).
 */
export function findCells(image, mask, { rowGap = 8, cellGap = 6 } = {}) {
  const { width, height } = image;
  const rowFilled = Array.from({ length: height }, (_, y) => mask.subarray(y * width, (y + 1) * width).some(Boolean));
  return bands(rowFilled, rowGap).map(([top, bottom]) => {
    const colFilled = Array.from({ length: width }, (_, x) => {
      for (let y = top; y < bottom; y++) if (mask[y * width + x]) return true;
      return false;
    });
    return bands(colFilled, cellGap).map(([left, right]) => {
      let y0 = bottom, y1 = top;
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) if (mask[y * width + x]) { y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
      }
      return { x: left, y: y0, w: right - left, h: y1 - y0 };
    });
  });
}
