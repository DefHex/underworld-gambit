import { describe, expect, it } from 'vitest';
import { Game, moveToSan, setup, sqName } from '../src/rules';
import { at, find, go } from './helpers';

const K = ['wKe1', 'bKe8'];

describe('fall (rule 4)', () => {
  it('captured Overworld piece falls to the same square below', () => {
    const pos = setup({ over: [...K, 'wBc4', 'bPf7'] });
    const info = go(pos, 'o', 'c4f7');
    expect(at(pos, 'o', 'f7')!.type).toBe('b');
    expect(at(pos, 'u', 'f7')!.type).toBe('p');
    expect(at(pos, 'u', 'f7')!.color).toBe(1);
    expect(info.fell && sqName(info.fell.to)).toBe('f7');
  });

  it('fall tempo: the victim moves next and can act at once', () => {
    const pos = setup({ over: [...K, 'wBc4', 'bPd5'] });
    go(pos, 'o', 'c4d5');
    expect(pos.side).toBe(1);
    expect(find(pos, 'u', 'd5d4').board).toBe(1);
  });

  it('occupied landing square uses the deterministic nearest-square order', () => {
    const pos = setup({ over: [...K, 'wBc4', 'bPf7'], under: ['wNf7'] });
    go(pos, 'o', 'c4f7');
    // Black pawn: rank 8 is forbidden; e7 and g7 tie, so the file nearest a wins.
    expect(at(pos, 'u', 'e7')!.type).toBe('p');
    expect(at(pos, 'u', 'g7')).toBeNull();
  });

  it('bishops keep their square color when falling onto an occupied square', () => {
    const pos = setup({ over: [...K, 'wBc4', 'bQc8'], under: ['wNc4'], side: 'b' });
    go(pos, 'o', 'c8c4');
    const sq = pos.boards[1].findIndex((p) => p && p.type === 'b');
    expect(sqName(sq)).toBe('b3');
    expect(((sq & 7) + (sq >> 3)) & 1).toBe(1); // c4 is an odd (light) square
  });

  it('a pawn never lands on rank 1 or 8', () => {
    const pos = setup({ over: [...K, 'wRd8', 'bPd7'], under: ['wNd7'] });
    go(pos, 'o', 'd8d7');
    expect(at(pos, 'u', 'c7')!.type).toBe('p'); // c8, d8, e8 are nearer in king steps but forbidden
    for (const sq of [0, 1, 2, 3, 4, 5, 6, 7, 56, 57, 58, 59, 60, 61, 62, 63]) {
      const q = pos.boards[1][sq];
      expect(q && q.type === 'p').toBeFalsy();
    }
  });

  it('en passant: the captured pawn falls from the square it stood on', () => {
    const pos = setup({ over: [...K, 'wPe5', 'bPd7'], side: 'b' });
    go(pos, 'o', 'd7d5');
    const info = go(pos, 'o', 'e5d6');
    expect(at(pos, 'o', 'd6')!.type).toBe('p');
    expect(at(pos, 'o', 'd5')).toBeNull();
    expect(at(pos, 'u', 'd5')!.color).toBe(1);
    expect(info.fell && sqName(info.fell.to)).toBe('d5');
  });
});

describe('rise (rules 5, 6)', () => {
  it('Underworld capture destroys the victim and the capturer rises on the same square', () => {
    const pos = setup({ over: K, under: ['wNc4', 'bPe5'] });
    const info = go(pos, 'u', 'c4e5');
    const n = at(pos, 'o', 'e5')!;
    expect(n.type).toBe('n');
    expect(n.risen).toBe(true);
    expect(info.destroyed!.type).toBe('p');
    expect(pos.pieceCount(1)).toBe(0);
  });

  it('rise onto an occupied square uses the landing order', () => {
    const pos = setup({ over: ['wKh1', 'bKh8', 'wBd5'], under: ['wRd1', 'bNd5'] });
    go(pos, 'u', 'd1d5');
    expect(at(pos, 'o', 'd4')!.type).toBe('r'); // nearest ring square to white's back rank
    expect(at(pos, 'o', 'd5')!.type).toBe('b');
  });

  it('an Underworld pawn capture on the last rank rises as a pawn, never promotes', () => {
    const pos = setup({ over: ['wKa1', 'bKh8'], under: ['wPd7', 'bNe8'] });
    expect(pos.legalMoves().filter((m) => m.board === 1 && m.capture).every((m) => !m.promo)).toBe(true);
    go(pos, 'u', 'd7e8');
    const risen = at(pos, 'o', 'e7')!; // rank 8 is forbidden for pawns; nearest is e7
    expect(risen.type).toBe('p');
    expect(risen.promoted).toBe(false);
    expect(risen.risen).toBe(true);
  });

  it('second chance: a risen piece captured again is destroyed', () => {
    const pos = setup({ over: [...K, 'wBc4:r', 'bPd5'], side: 'b' });
    const info = go(pos, 'o', 'd5c4');
    expect(info.destroyed!.type).toBe('b');
    expect(pos.pieceCount(1)).toBe(0);
  });

  it('with the second-chance setting off it falls again', () => {
    const pos = setup({ over: [...K, 'wBc4', 'bPd5'], side: 'b' }, { secondChance: false });
    go(pos, 'o', 'd5c4');
    expect(at(pos, 'u', 'c4')!.type).toBe('b');
  });
});

describe('promoted pieces revert (rule 11)', () => {
  it('a promoted queen captured on the Overworld falls as a pawn', () => {
    const pos = setup({ over: [...K, 'wQd4:p', 'bRd8'], side: 'b' });
    go(pos, 'o', 'd8d4');
    const f = at(pos, 'u', 'd4')!;
    expect(f.type).toBe('p');
    expect(f.promoted).toBe(false);
  });

  it('a promoted queen rising from the Underworld is a pawn again', () => {
    const pos = setup({ over: ['wKa1', 'bKh8'], under: ['wQd1:p', 'bNd4'] });
    go(pos, 'u', 'd1d4');
    const r = at(pos, 'o', 'd4')!;
    expect(r.type).toBe('p');
    expect(r.promoted).toBe(false);
  });

  it('pawns promote on both boards', () => {
    const pos = setup({ over: ['wKa1', 'bKh8', 'wPb7'], under: ['wPa7'] });
    const promos = pos.legalMoves().filter((m) => m.promo);
    expect(promos.filter((m) => m.board === 0).length).toBe(4);
    expect(promos.filter((m) => m.board === 1).length).toBe(4);
  });
});

describe('king safety across boards (rule 8)', () => {
  const blockSetup = (withBishop: boolean) => setup({
    over: ['wKh1', 'wPg2', 'wPh2', 'bKe8', 'bRa1'],
    under: withBishop ? ['wNb2', 'bBd1'] : ['wNb2'],
  });

  it('a rising piece that blocks check is a legal escape, so it is not mate', () => {
    const pos = blockSetup(true);
    expect(pos.inCheck(0)).toBe(true);
    const legal = pos.legalMoves();
    expect(legal.length).toBe(1);
    expect(legal[0].board).toBe(1);
    expect(sqName(legal[0].to)).toBe('d1');
    expect(new Game(pos).status().state).toBe('ongoing');
  });

  it('without that resource it is checkmate', () => {
    const g = new Game(blockSetup(false));
    expect(g.status()).toEqual({ state: 'checkmate', winner: 1 });
  });

  it('quiet Underworld moves are illegal while in check', () => {
    const pos = blockSetup(true);
    expect(pos.legalMoves().some((m) => m.board === 1 && !m.capture)).toBe(false);
  });
});

describe('castling (rule 12)', () => {
  it('a fallen rook loses its castling right', () => {
    const pos = setup({ over: ['wKe1:u', 'wRh1:u', 'bKe8', 'bBa8'], side: 'b' });
    go(pos, 'o', 'a8h1');
    expect(at(pos, 'u', 'h1')!.type).toBe('r');
    expect(at(pos, 'u', 'h1')!.hasMoved).toBe(true);
  });

  it('a rook that fell and rose back to h1 cannot castle', () => {
    const pos = setup({ over: ['wKe1:u', 'bKe8'], under: ['wRh5:m', 'bNh1'] });
    go(pos, 'u', 'h5h1');
    expect(at(pos, 'o', 'h1')!.type).toBe('r');
    expect(pos.castlingRights(0).k).toBe(false);
    pos.side = 0;
    expect(pos.legalMoves().some((m) => m.castle)).toBe(false);
  });

  it('an unmoved rook still allows castling', () => {
    const pos = setup({ over: ['wKe1:u', 'wRh1:u', 'bKe8'] });
    expect(pos.legalMoves().some((m) => m.castle === 'k')).toBe(true);
  });
});

describe('underworld pawns (rule 10)', () => {
  it('promote on a quiet move to the last rank', () => {
    const pos = setup({ over: ['wKa1', 'bKh8'], under: ['wPa7'] });
    go(pos, 'u', 'a7a8', 'q');
    const q = at(pos, 'u', 'a8')!;
    expect(q.type).toBe('q');
    expect(q.promoted).toBe(true);
  });

  it('en passant works below; the capturer rises from its destination square', () => {
    const pos = setup({ over: K, under: ['wPe5', 'bPd7'], side: 'b' });
    go(pos, 'u', 'd7d5');
    go(pos, 'u', 'e5d6');
    expect(at(pos, 'o', 'd6')!.type).toBe('p');
    expect(at(pos, 'o', 'd6')!.risen).toBe(true);
    expect(pos.pieceCount(1)).toBe(0);
  });

  it('double-step from their start rank below', () => {
    const pos = setup({ over: K, under: ['wPc2'] });
    expect(pos.legalMoves().some((m) => m.board === 1 && m.double)).toBe(true);
  });
});

describe('draws (rule 13)', () => {
  it('stalemate counts moves on both boards', () => {
    const stale = setup({ over: ['bKa8', 'wKb6', 'wQc7'], side: 'b' });
    expect(new Game(stale).status().state).toBe('stalemate');
    const spare = setup({ over: ['bKa8', 'wKb6', 'wQc7'], under: ['bNd4'], side: 'b' });
    expect(new Game(spare).status().state).toBe('ongoing'); // spare tempo below
  });

  it('threefold repetition of the full two-board position', () => {
    const g = new Game(setup({ over: ['wKe1', 'wRa1', 'bKe8', 'bRa8'] }));
    const cycle = ['a1b1', 'a8b8', 'b1a1', 'b8a8'];
    for (let round = 0; round < 2; round++) for (const u of cycle) g.play(find(g.pos, 'o', u));
    expect(g.status()).toEqual({ state: 'draw', reason: 'repetition' });
  });

  it('risen marks are part of the repetition key', () => {
    const a = setup({ over: [...K, 'wNc3'] });
    const b = setup({ over: [...K, 'wNc3:r'] });
    expect(a.positionKey()).not.toBe(b.positionKey());
  });

  it('100 plies without capture or pawn move on either board', () => {
    const pos = setup({ over: ['wKe1', 'wRa1', 'bKe8', 'bRa8'] });
    pos.halfmove = 99;
    const g = new Game(pos);
    g.play(find(g.pos, 'o', 'a1b1'));
    expect(g.status()).toEqual({ state: 'draw', reason: 'fifty' });
  });

  it('an Underworld pawn move resets the clock; a quiet piece move does not', () => {
    const pos = setup({ over: K, under: ['wPc2', 'wNg1'] });
    pos.halfmove = 10;
    go(pos, 'u', 'g1f3');
    expect(pos.halfmove).toBe(11);
    pos.side = 0;
    go(pos, 'u', 'c2c4');
    expect(pos.halfmove).toBe(0);
  });

  it('bare kings with an empty or one-colored Underworld is a dead draw', () => {
    expect(new Game(setup({ over: K })).status()).toEqual({ state: 'draw', reason: 'insufficient' });
    expect(new Game(setup({ over: K, under: ['wNc3', 'wBd4'] })).status().state).toBe('draw');
    expect(new Game(setup({ over: K, under: ['wNc3', 'bBd4'] })).status().state).toBe('ongoing');
    expect(new Game(setup({ over: [...K, 'wPa2'] })).status().state).toBe('ongoing');
  });
});

describe('classic flag', () => {
  it('captures remove pieces; nothing ever appears below', () => {
    const pos = setup({ over: [...K, 'wBc4', 'bPf7'] }, { classic: true });
    go(pos, 'o', 'c4f7');
    expect(pos.pieceCount(1)).toBe(0);
    expect(pos.legalMoves().every((m) => m.board === 0)).toBe(true);
  });
});

describe('notation', () => {
  it('writes the fall after an Overworld capture', () => {
    const pos = setup({ over: [...K, 'wBc4', 'bPf7'] });
    expect(moveToSan(pos, find(pos, 'o', 'c4f7'))).toBe('Bxf7+ ↓f7');
  });
  it('prefixes Underworld moves and writes the rise', () => {
    const pos = setup({ over: K, under: ['wNc4', 'bPe5'] });
    expect(moveToSan(pos, find(pos, 'u', 'c4e5'))).toBe('u:Nxe5 ↑e5');
  });
  it('disambiguates and writes castling and promotion', () => {
    const p1 = setup({ over: ['wKe2', 'wRa1', 'wRh1', 'bKe8'] });
    expect(moveToSan(p1, find(p1, 'o', 'a1d1'))).toBe('Rad1');
    const p2 = setup({ over: ['wKe1:u', 'wRh1:u', 'bKa8'] });
    expect(moveToSan(p2, find(p2, 'o', 'e1g1'))).toBe('O-O');
    const p3 = setup({ over: ['wKa1', 'bKh7', 'wPb7'] });
    expect(moveToSan(p3, find(p3, 'o', 'b7b8', 'q'))).toBe('b8=Q');
  });
});

describe('save, load, undo', () => {
  it('round-trips a game with falls and rises through JSON', () => {
    const g = new Game();
    for (const u of ['e2e4', 'd7d5', 'e4d5', 'd8d5']) g.play(find(g.pos, 'o', u));
    const copy = Game.load(JSON.parse(JSON.stringify(g.save())));
    expect(copy.pos.positionKey()).toBe(g.pos.positionKey());
    expect(copy.history.map((h) => h.san)).toEqual(g.history.map((h) => h.san));
    expect(g.undo()).toBe(true);
    expect(g.history.length).toBe(3);
    expect(copy.undo() && copy.undo()).toBe(true);
    expect(copy.history.length).toBe(2);
  });

  it('resigning ends the game', () => {
    const g = new Game();
    g.resign(0);
    expect(g.status()).toEqual({ state: 'resigned', winner: 1 });
  });
});
