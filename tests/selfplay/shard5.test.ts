import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { selfPlay } from '../../scripts/selfplay';

// 8 shards x 25 games = 200 lowest-level AI-vs-AI games. Run with: npm run selfplay
it('shard 5: 25 games finish with no crash or illegal state', () => {
  const out = selfPlay(25, 1);
  writeFileSync('selfplay-5.json', JSON.stringify(out));
  expect(Object.values(out.results).reduce((a, b) => a + b, 0)).toBe(25);
  expect(out.falls).toBeGreaterThan(0);
}, 3_600_000);
