import { describe, expect, it } from 'vitest';
import { Game, Position, parseSq, setup } from '../src/rules';
import { Searcher, chooseMove } from '../src/ai';
import { hashPosition } from '../src/ai/zobrist';

const deep = { timeMs: 8000, maxDepth: 4, noise: 0 };

describe('AI', () => {
  it('takes a hanging queen', () => {
    const g = new Game(setup({ over: ['wKe1', 'bKe8', 'wRd1', 'bQd5'] }));
    const r = chooseMove(new Searcher(), g.save(), 2, deep);
    expect(r.move!.from).toBe(parseSq('d1'));
    expect(r.move!.to).toBe(parseSq('d5'));
  });

  it('finds a back-rank mate in one', () => {
    const g = new Game(setup({
      over: ['wKg1', 'wPf2', 'wPg2', 'wPh2', 'wRa1', 'bKg8', 'bPf7', 'bPg7', 'bPh7'],
    }));
    const r = chooseMove(new Searcher(), g.save(), 3, deep);
    expect(r.move!.from).toBe(parseSq('a1'));
    expect(r.move!.to).toBe(parseSq('a8'));
  });

  it('leaves the position untouched when the search is cut short', () => {
    const pos = Position.standard();
    const key = pos.positionKey();
    const h = hashPosition(pos);
    const s = new Searcher();
    s.search(pos, [], { timeMs: 5000, maxDepth: 10, maxNodes: 3000 });
    expect(pos.positionKey()).toBe(key);
    expect(hashPosition(pos)).toBe(h);
    expect(pos.ply).toBe(0);
  });

  it('hash distinguishes risen marks and boards', () => {
    const a = setup({ over: ['wKe1', 'bKe8', 'wNc3'] });
    const b = setup({ over: ['wKe1', 'bKe8', 'wNc3:r'] });
    const c = setup({ over: ['wKe1', 'bKe8'], under: ['wNc3'] });
    expect(new Set([hashPosition(a), hashPosition(b), hashPosition(c)]).size).toBe(3);
  });
});
