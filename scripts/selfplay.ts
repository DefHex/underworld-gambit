import { Game } from '../src/rules';
import { Searcher, chooseMove } from '../src/ai';

/** Plays AI-vs-AI games at the given level and reports how they ended. Usage: tsx scripts/selfplay.ts [games] [level] */
export function selfPlay(games: number, level: 1 | 2 | 3 | 4, maxPlies = 400) {
  const searcher = new Searcher();
  const results: Record<string, number> = {};
  let plies = 0, falls = 0, rises = 0;
  for (let i = 0; i < games; i++) {
    const game = new Game();
    searcher.clear();
    while (game.status().state === 'ongoing' && game.history.length < maxPlies) {
      const r = chooseMove(searcher, game.save(), level);
      if (!r.move) throw new Error('no move in an ongoing game');
      const rec = game.play(r.move); // throws on any illegal move
      if (rec.info.fell) falls++;
      if (rec.info.rose) rises++;
    }
    const s = game.status();
    const key = s.state === 'ongoing' ? 'ply-cap' : s.state === 'draw' ? `draw:${s.reason}` : s.state;
    results[key] = (results[key] ?? 0) + 1;
    plies += game.history.length;
  }
  return { results, avgPlies: plies / games, falls, rises };
}
