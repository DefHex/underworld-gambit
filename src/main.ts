import { Game, PieceType, Status } from './rules';
import { World } from './render/world';
import { Controller } from './ui/controller';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const world = new World(canvas);
let game = new Game();
const ctl = new Controller(world, game, canvas);

const turn = $('turn'), hint = $('hint'), banner = $('banner'), movelist = $('movelist');
const frame = $('portal-frame'), label = $('portal-label'), promo = $('promo');

function statusText(s: Status): string {
  switch (s.state) {
    case 'checkmate': return `Checkmate — ${s.winner === 0 ? 'White' : 'Black'} wins`;
    case 'resigned': return `${s.winner === 0 ? 'White' : 'Black'} wins by resignation`;
    case 'stalemate': return 'Stalemate — draw';
    case 'draw': return `Draw by ${s.reason}`;
    default: return '';
  }
}

function layoutPortal(): void {
  const p = world.portalRect;
  Object.assign(frame.style, { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px' });
}

function updateHud(): void {
  const s = ctl.game.status();
  const side = ctl.pos.side === 0 ? 'White' : 'Black';
  turn.textContent = s.state === 'ongoing' ? `${side} to move${s.check ? ' — check!' : ''} · ${world.active === 0 ? 'Overworld' : 'Underworld'}` : 'Game over';
  hint.textContent = ctl.hint;
  banner.hidden = s.state === 'ongoing';
  banner.textContent = statusText(s);
  ctl.locked = s.state !== 'ongoing';
  label.textContent = world.active === 0 ? 'Underworld' : 'Overworld';
  frame.className = ctl.locked ? '' : (ctl.portalAlert() ?? '');
  layoutPortal();
  movelist.innerHTML = '';
  ctl.game.history.forEach((h, i) => {
    const d = document.createElement('div');
    d.innerHTML = `<span class="n">${i % 2 === 0 ? i / 2 + 1 + '.' : ''}</span>${h.san}`;
    movelist.appendChild(d);
  });
  movelist.scrollTop = movelist.scrollHeight;
}

ctl.onChange = updateHud;
ctl.onPromotion = (choose) => {
  promo.hidden = false;
  promo.innerHTML = '';
  for (const [t, glyph] of [['q', '♛'], ['r', '♜'], ['b', '♝'], ['n', '♞']] as [PieceType, string][]) {
    const b = document.createElement('button');
    b.textContent = glyph;
    b.onclick = () => { promo.hidden = true; choose(t); };
    promo.appendChild(b);
  }
};

$('btn-switch').onclick = () => ctl.switchBoard();
$('btn-rotate').onclick = () => world.rotate();
$('btn-tactical').onclick = () => world.toggleTactical();
$('btn-undo').onclick = () => ctl.undo();
$('btn-moves').onclick = () => { movelist.hidden = !movelist.hidden; };
$('btn-new').onclick = () => { game = new Game(); ctl.setGame(game); };
window.addEventListener('resize', () => { world.resize(); layoutPortal(); });

world.syncPieces(game.pos, false);
world.applyView(false);
ctl.refresh();

// Handles for browser tests.
(window as unknown as { __uw: unknown }).__uw = { world, ctl, get game() { return ctl.game; } };
