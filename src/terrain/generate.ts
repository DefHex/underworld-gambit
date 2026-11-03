import { Adjacency, DIRECTIONS, collapse, opposite, seededRandom } from './wfc';

/**
 * A fresh, good-looking terrain for both boards from one seed, grown by Wave Function Collapse.
 * The terrain is scenery only: it never changes the rules.
 *
 * A board map is 8 strings of 8 biome letters, rank 8 first (the top row), as terrain.ts paints them.
 * Overworld:  g grass, f forest, h hills, m mountain, r river
 * Underworld: a ash, f dead forest, b bone field, m obsidian ridge, l lava river
 */
export interface TerrainMaps { over: string[]; under: string[] }

const SIZE = 8;
const ATTEMPTS = 500;

/** Edge of a tile: dry land, or the river (or lava) running across it. */
type Edge = 'land' | 'flow';
interface TerrainTile { biome: string; weight: number; edges: [Edge, Edge, Edge, Edge] } // north, east, south, west

interface BoardRules {
  tiles: TerrainTile[];
  /** The biome that flows (river or lava): its tiles connect through their 'flow' edges. */
  flow: string;
  /** Which biomes may touch across a land edge (checked both ways). */
  neighbors: Record<string, string>;
  /** How many squares of each biome a good board has. */
  counts: Record<string, [min: number, max: number]>;
  /** Most separate rivers (or lava streams) on one board. */
  maxStreams: number;
}

const land = (biome: string, weight: number): TerrainTile => ({ biome, weight, edges: ['land', 'land', 'land', 'land'] });

/**
 * The six ways a stream crosses a square: straight north-south or east-west, and the four bends.
 * Straight pieces are more common, so streams run across the board instead of coiling.
 */
function streams(biome: string, straight: number, bend: number): TerrainTile[] {
  const crossings: [number, number][] = [[0, 2], [1, 3], [0, 1], [0, 3], [2, 1], [2, 3]];
  return crossings.map(([from, to], i) => ({
    biome,
    weight: i < 2 ? straight : bend,
    edges: [0, 1, 2, 3].map((side) => (side === from || side === to ? 'flow' : 'land')) as TerrainTile['edges'],
  }));
}

const OVERWORLD: BoardRules = {
  tiles: [land('g', 6), land('f', 2.2), land('h', 1.6), land('m', 1.3), ...streams('r', 0.6, 0.28)],
  flow: 'r',
  // Mountains rise out of hills and forest; rivers never run past a mountain.
  neighbors: { g: 'gfhr', f: 'gfhmr', h: 'gfhmr', m: 'fhm', r: 'gfh' },
  counts: { r: [6, 15], m: [1, 6], f: [4, 16], h: [1, 12], g: [18, 50] },
  maxStreams: 2,
};

const UNDERWORLD: BoardRules = {
  tiles: [land('a', 6), land('f', 1.5), land('b', 1.3), land('m', 0.8), ...streams('l', 0.55, 0.28)],
  flow: 'l',
  // Bones never lie by the lava (they would burn), dead trees keep their distance too.
  neighbors: { a: 'afbml', f: 'afbm', b: 'afb', m: 'afml', l: 'am' },
  counts: { l: [5, 15], b: [2, 8], m: [1, 7], f: [3, 12], a: [18, 50] },
  maxStreams: 2,
};

/** The hand-made boards, used if generation ever fails. */
export const DEFAULT_TERRAIN: TerrainMaps = {
  over: ['mmhgrghm', 'mfggrrgh', 'hfgggrgf', 'ggfggrrg', 'gfgggggr', 'ffghggrr', 'gfhggrrg', 'gggggrgg'],
  under: ['mmaaalam', 'mfaaallf', 'afaabaal', 'aabaaall', 'abaaaaal', 'ffabaall', 'abmaaall', 'aaaaalaa'],
};

/** The neighbor rules of a board as a WFC adjacency test. */
function adjacency({ tiles, flow, neighbors }: BoardRules): Adjacency {
  return (a, b, direction) => {
    const edge = tiles[a].edges[direction];
    if (edge !== tiles[b].edges[opposite(direction)]) return false; // a stream must carry on into the next square
    if (edge === 'flow') return true;
    const [biomeA, biomeB] = [tiles[a].biome, tiles[b].biome];
    if (biomeA === flow && biomeB === flow) return false; // two streams never run side by side
    return neighbors[biomeA].includes(biomeB) && neighbors[biomeB].includes(biomeA);
  };
}

/** Separate streams on the board, each as the list of its squares. */
function streamsOf(biomes: string[], flow: string): number[][] {
  const seen = new Set<number>();
  const found: number[][] = [];
  biomes.forEach((biome, start) => {
    if (biome !== flow || seen.has(start)) return;
    const stream: number[] = [];
    const pending = [start];
    seen.add(start);
    while (pending.length) {
      const cell = pending.pop()!;
      stream.push(cell);
      for (const [dx, dy] of DIRECTIONS) {
        const x = (cell % SIZE) + dx, y = Math.floor(cell / SIZE) + dy, next = y * SIZE + x;
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || seen.has(next) || biomes[next] !== flow) continue;
        seen.add(next);
        pending.push(next);
      }
    }
    found.push(stream);
  });
  return found;
}

/** The sides of the board (north, east, south, west) a stream touches. */
function sidesTouched(stream: number[]): number {
  const sides = new Set<string>();
  for (const cell of stream) {
    const x = cell % SIZE, y = Math.floor(cell / SIZE);
    if (y === 0) sides.add('n');
    if (x === SIZE - 1) sides.add('e');
    if (y === SIZE - 1) sides.add('s');
    if (x === 0) sides.add('w');
  }
  return sides.size;
}

/** Shortest stream worth drawing. */
const MIN_STREAM = 4;

/**
 * A good board: sensible amounts of everything, at most `maxStreams` streams, and each one long
 * enough and flowing across the board (in at one side, out at another), not looping on itself.
 */
export function isGoodBoard(biomes: string[], rules: BoardRules): boolean {
  for (const [biome, [min, max]] of Object.entries(rules.counts)) {
    const count = biomes.filter((b) => b === biome).length;
    if (count < min || count > max) return false;
  }
  const found = streamsOf(biomes, rules.flow);
  return found.length >= 1 && found.length <= rules.maxStreams
    && found.every((stream) => stream.length >= MIN_STREAM && sidesTouched(stream) >= 2);
}

function generateBoard(rules: BoardRules, random: () => number): string[] | null {
  const weights = rules.tiles.map((tile) => tile.weight);
  const allowed = adjacency(rules);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const grid = collapse(SIZE, SIZE, weights, allowed, random);
    if (!grid) continue;
    const biomes = grid.map((tile) => rules.tiles[tile].biome);
    if (!isGoodBoard(biomes, rules)) continue;
    return Array.from({ length: SIZE }, (_, row) => biomes.slice(row * SIZE, (row + 1) * SIZE).join(''));
  }
  return null;
}

/** Both boards' terrain for a seed (the same seed always gives the same boards). */
export function generateTerrain(seed: number): TerrainMaps {
  const random = seededRandom(seed);
  return {
    over: generateBoard(OVERWORLD, random) ?? DEFAULT_TERRAIN.over,
    under: generateBoard(UNDERWORLD, random) ?? DEFAULT_TERRAIN.under,
  };
}

/** For tests: the rule sets, to check generated boards against. */
export const RULES = { over: OVERWORLD, under: UNDERWORLD };

