import type { PieceType, Played, Status } from '../rules';
import { byId } from './dom';

const PLAYER_NAME = ['White', 'Black'] as const;
const PROMOTION_CHOICES: [PieceType, string][] = [['q', '♛'], ['r', '♜'], ['b', '♝'], ['n', '♞']];

/** The banner text for a finished game ('' while it is still going). */
export function statusText(status: Status): string {
  switch (status.state) {
    case 'checkmate': return `Checkmate — ${PLAYER_NAME[status.winner]} wins`;
    case 'resigned': return `${PLAYER_NAME[status.winner]} wins by resignation`;
    case 'stalemate': return 'Stalemate — draw';
    case 'draw': return `Draw by ${status.reason}`;
    default: return '';
  }
}

/** Redraws the move list panel and scrolls to the latest move. */
export function renderMoveList(history: Played[]): void {
  const list = byId('movelist');
  list.innerHTML = '';
  history.forEach((entry, index) => {
    const row = document.createElement('div');
    const moveNumber = index % 2 === 0 ? `${index / 2 + 1}.` : '';
    row.innerHTML = `<span class="n">${moveNumber}</span>${entry.san}`;
    list.appendChild(row);
  });
  list.scrollTop = list.scrollHeight;
}

/** Shows the piece picker for a pawn reaching the last rank. */
export function showPromotionPicker(choose: (piece: PieceType) => void): void {
  const picker = byId('promo');
  picker.hidden = false;
  picker.innerHTML = '';
  for (const [pieceType, glyph] of PROMOTION_CHOICES) {
    const button = document.createElement('button');
    button.textContent = glyph;
    button.onclick = () => {
      picker.hidden = true;
      choose(pieceType);
    };
    picker.appendChild(button);
  }
}
