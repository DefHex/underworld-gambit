import { describe, expect, it } from 'vitest';
import { Position, fromFen } from '../src/rules';
import { perft } from './helpers';

describe('classic mode perft', () => {
  it('start position', () => {
    const pos = Position.standard({ classic: true });
    expect([1, 2, 3, 4].map((d) => perft(pos, d))).toEqual([20, 400, 8902, 197281]);
  });
  it('Kiwipete', () => {
    const pos = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -', { classic: true });
    expect([1, 2, 3].map((d) => perft(pos, d))).toEqual([48, 2039, 97862]);
  });
});
