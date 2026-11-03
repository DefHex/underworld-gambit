/**
 * Wave Function Collapse, simple tiled model (Maxim Gumin, 2016).
 *
 * Every cell starts able to be any tile. Repeatedly: pick the undecided cell with the fewest
 * options left (lowest entropy), decide it at random (weighted), then remove from its neighbors,
 * and their neighbors in turn, every tile that no longer fits next to what remains. If some cell
 * runs out of options it is a contradiction: the caller simply tries again.
 */

/** Grid directions: north (up the grid), east, south, west. */
export const DIRECTIONS: readonly (readonly [dx: number, dy: number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const opposite = (direction: number) => (direction + 2) % 4;

/** May tile `b` sit on side `direction` of tile `a`? Must agree with the reverse question. */
export type Adjacency = (a: number, b: number, direction: number) => boolean;

/** Seeded random numbers in [0, 1) (mulberry32), so a seed always grows the same board. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fills a width × height grid (row by row, top row first) with tile indices so that every pair of
 * neighbors is allowed. `weights[t]` is how common tile t is. Returns null on a contradiction.
 */
export function collapse(width: number, height: number, weights: number[], allowed: Adjacency, random: () => number): number[] | null {
  const tiles = weights.length;
  // fits[direction][a][b]: b may sit on that side of a.
  const fits = DIRECTIONS.map((_, direction) => weights.map((_, a) => weights.map((_, b) => allowed(a, b, direction))));
  const possible = Array.from({ length: width * height }, () => new Array<boolean>(tiles).fill(true));
  const optionsOf = (cell: number) => possible[cell].flatMap((ok, tile) => (ok ? [tile] : []));
  const neighbor = (cell: number, direction: number) => {
    const x = (cell % width) + DIRECTIONS[direction][0], y = Math.floor(cell / width) + DIRECTIONS[direction][1];
    return x >= 0 && y >= 0 && x < width && y < height ? y * width + x : -1;
  };

  /** Shannon entropy of a cell's remaining options, with a hair of noise to break ties. */
  const entropy = (options: number[]) => {
    const total = options.reduce((sum, t) => sum + weights[t], 0);
    const spread = options.reduce((sum, t) => sum + weights[t] * Math.log(weights[t]), 0);
    return Math.log(total) - spread / total + random() * 1e-6;
  };

  /** Removes from the neighbors (transitively) every tile no remaining option supports. False on a contradiction. */
  const propagate = (start: number): boolean => {
    const pending = [start];
    while (pending.length) {
      const cell = pending.pop()!;
      for (let direction = 0; direction < 4; direction++) {
        const next = neighbor(cell, direction);
        if (next < 0) continue;
        let changed = false;
        for (let b = 0; b < tiles; b++) {
          if (!possible[next][b]) continue;
          const supported = possible[cell].some((ok, a) => ok && fits[direction][a][b]);
          if (!supported) { possible[next][b] = false; changed = true; }
        }
        if (!changed) continue;
        if (!possible[next].includes(true)) return false;
        pending.push(next);
      }
    }
    return true;
  };

  for (;;) {
    let chosenCell = -1, lowest = Infinity;
    for (let cell = 0; cell < possible.length; cell++) {
      const options = optionsOf(cell);
      if (options.length === 0) return null;
      if (options.length === 1) continue;
      const e = entropy(options);
      if (e < lowest) { lowest = e; chosenCell = cell; }
    }
    if (chosenCell < 0) return possible.map((cell) => cell.indexOf(true));

    const options = optionsOf(chosenCell);
    let roll = random() * options.reduce((sum, t) => sum + weights[t], 0);
    const tile = options.find((t) => (roll -= weights[t]) <= 0) ?? options[options.length - 1];
    possible[chosenCell].fill(false);
    possible[chosenCell][tile] = true;
    if (!propagate(chosenCell)) return null;
  }
}
