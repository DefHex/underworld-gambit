import { describe, expect, it } from 'vitest';
import { parseSq } from '../src/rules';
import { LINE, findMove, tutorialGame } from '../src/tutorial/script';

describe('tutorial game', () => {
  it('plays the scripted line: sacrifice, fall, rise with check, forced block, mate', () => {
    const g = tutorialGame();
    expect(g.status().state).toBe('ongoing');

    const sac = g.play(findMove(g, LINE.sacrifice)!);
    expect(sac.san).toBe('Qd3');

    const take = g.play(findMove(g, LINE.take)!);
    expect(take.info.fell?.piece.type).toBe('q'); // the queen falls
    expect(g.pos.boards[1][parseSq('d3')]?.type).toBe('q'); // ...to d3 below

    const rise = g.play(findMove(g, LINE.rise)!);
    expect(rise.san).toMatch(/^u:Qxd8/);
    expect(rise.info.rose?.piece.risen).toBe(true);
    expect(g.pos.inCheck(1)).toBe(true);

    // Black's only legal reply is the block, so the scripted move is forced.
    const replies = g.legalMoves();
    expect(replies.length).toBe(1);
    g.play(findMove(g, LINE.block)!);

    const mate = g.play(findMove(g, LINE.mate)!);
    expect(mate.san).toMatch(/#/);
    expect(g.status()).toEqual({ state: 'checkmate', winner: 0 });
  });
});
