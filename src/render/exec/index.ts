import type { PieceType } from '../../rules';
import { Easing } from '../tween';
import { Kit, Style } from './kit';
import { bishop } from './bishop';
import { king } from './king';
import { knight } from './knight';
import { pawn } from './pawn';
import { queen } from './queen';
import { rook } from './rook';

export { Kit, restoreView } from './kit';
export type { Style } from './kit';

interface Set { moves: Style[]; kills: Style[] }

/** Plain slide, used when a piece has no cinematic styles or cinematics are switched off. */
export const slide: Style = {
  name: 'Slide',
  async run(k) { k.face(); await k.glide(260, 0, 1, 0, Easing.Cubic.Out); },
};
export const slideKill: Style = {
  name: 'Slide and squash',
  async run(k) {
    k.face();
    await k.glide(260, 0, 1, 0, Easing.Cubic.Out);
    void k.hit('squash');
  },
};

const catalog: Partial<Record<PieceType, Set>> = { b: bishop, r: rook, n: knight, q: queen, k: king, p: pawn };
// Flying styles pull the camera back a little so nothing leaves the frame.
for (const s of [...bishop.moves, ...bishop.kills]) s.zoom = 1.17;
for (const s of [...knight.moves, ...knight.kills]) s.zoom = 1.08;
for (const s of [...rook.kills.filter((x) => x.name === 'Tank drop')]) s.zoom = 1.1;

/** For testing: `window.__style = { idx: 3 }` forces a style index; `kind: 'move'|'kill'`. */
export const debug: { idx: number | null } = { idx: null };
const last = new Map<string, number>();

/** A random style for this piece type, never the same one twice in a row. */
export function pickStyle(type: PieceType, capture: boolean, cinematic: boolean): Style {
  const set = catalog[type];
  if (!cinematic || !set) return capture ? slideKill : slide;
  const list = capture ? set.kills : set.moves;
  const key = type + (capture ? 'k' : 'm');
  let i = debug.idx !== null ? debug.idx % list.length : Math.floor(Math.random() * list.length);
  if (debug.idx === null && list.length > 1 && i === last.get(key)) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
  last.set(key, i);
  return list[i];
}

export const styleCount = (type: PieceType, capture: boolean) => (capture ? catalog[type]?.kills.length : catalog[type]?.moves.length) ?? 0;
