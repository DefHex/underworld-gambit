import { DEFAULT_TERRAIN, RULES, generateTerrain, isGoodBoard } from '../src/terrain/generate';
import { collapse, seededRandom } from '../src/terrain/wfc';

/** Every pair of side-by-side squares obeys the board's neighbor rules (streams may touch only themselves). */
function followsNeighborRules(map: string[], rules: (typeof RULES)['over']): boolean {
  const biome = (x: number, y: number) => map[y][x];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
        if (nx > 7 || ny > 7) continue;
        const a = biome(x, y), b = biome(nx, ny);
        if (a === rules.flow && b === rules.flow) continue;
        if (!rules.neighbors[a].includes(b) || !rules.neighbors[b].includes(a)) return false;
      }
    }
  }
  return true;
}

describe('wave function collapse', () => {
  it('fills a grid so that every neighbor pair is allowed', () => {
    const grid = collapse(5, 4, [1, 1], (a, b) => a !== b, seededRandom(3))!;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 5; x++) {
        if (x < 4) expect(grid[y * 5 + x]).not.toBe(grid[y * 5 + x + 1]);
        if (y < 3) expect(grid[y * 5 + x]).not.toBe(grid[(y + 1) * 5 + x]);
      }
    }
  });

  it('reports a contradiction when nothing can sit side by side', () => {
    expect(collapse(2, 1, [1, 1], () => false, seededRandom(1))).toBeNull();
  });
});

describe('terrain generator', () => {
  it('grows the same boards from the same seed', () => {
    expect(generateTerrain(42)).toEqual(generateTerrain(42));
  });

  it('grows a different board almost every game', () => {
    const boards = new Set(Array.from({ length: 20 }, (_, seed) => generateTerrain(seed + 1).over.join('/')));
    expect(boards.size).toBeGreaterThanOrEqual(19);
  });

  it('only grows good boards that follow the neighbor rules', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { over, under } = generateTerrain(seed);
      for (const [map, rules, letters] of [[over, RULES.over, /^[gfhmr]{8}$/], [under, RULES.under, /^[afbml]{8}$/]] as const) {
        expect(map).toHaveLength(8);
        for (const row of map) expect(row).toMatch(letters);
        expect(isGoodBoard(map.join('').split(''), rules)).toBe(true);
        expect(followsNeighborRules(map, rules)).toBe(true);
      }
      expect({ over, under }).not.toEqual(DEFAULT_TERRAIN);
    }
  });
});
