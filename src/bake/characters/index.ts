import type { Character } from '../bake';
import { bishop } from './bishop';
import { king } from './king';
import { knight } from './knight';
import { pawn } from './pawn';
import { queen } from './queen';
import { rook } from './rook';

/** Every piece character; each becomes art/sprites/<name>.png. */
export const CHARACTERS: Character[] = [pawn, knight, bishop, rook, queen, king];
