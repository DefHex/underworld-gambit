import { Game, PieceType, Status } from './rules';
import { World } from './render/world';
import { Controller } from './ui/controller';
import { AiPlayer } from './ai/client';
import * as audio from './audio/audio';
import { buzz } from './platform/haptics';
import { saveSettings, settings } from './platform/settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const world = new World(canvas);
let game = new Game();
const ctl = new Controller(world, game, canvas);
const ai = new AiPlayer();

/** 0 = pass-and-play, 1-4 = play White against the AI at that level. */
let mode: 0 | 1 | 2 | 3 | 4 = 0;
let thinking = false;
let epoch = 0;

async function aiTurn(): Promise<void> {
  if (!mode || thinking || ctl.locked || ctl.pos.side !== 1) return;
  if (world.busy) { setTimeout(aiTurn, 120); return; }
  thinking = true;
  const mine = ++epoch;
  const g = ctl.game;
  updateHud();
  const move = await ai.think(g.save(), mode);
  thinking = false;
  if (mine !== epoch || g !== ctl.game) return;
  if (move) ctl.play(move);
  updateHud();
}
ctl.blocked = () => thinking || (mode > 0 && ctl.pos.side === 1);
ctl.onMoved = () => { void aiTurn(); };

function newGame(): void {
  epoch++; thinking = false; ai.reset();
  game = new Game({ secondChance: settings.secondChance });
  ctl.setGame(game);
}

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
  turn.textContent = thinking ? 'Black is thinking…' : s.state === 'ongoing' ? `${side} to move${s.check ? ' — check!' : ''} · ${world.active === 0 ? 'Overworld' : 'Underworld'}` : 'Game over';
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

world.onEvent = (e) => {
  if (e === 'fall') { audio.play('fall'); buzz('fall'); }
  else if (e === 'rise') { audio.play('rise'); buzz('rise'); }
  else if (e === 'destroy') audio.play('destroy');
  else if (e === 'check') { audio.play('check'); buzz('check'); }
};
// Browsers only allow audio after a gesture.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
$('btn-sound').onclick = () => {
  settings.sound = !settings.sound; settings.music = settings.sound;
  saveSettings(); audio.syncMusic();
  $('btn-sound').textContent = settings.sound ? '♪' : '✕';
};
$('btn-sound').textContent = settings.sound ? '♪' : '✕';
$('btn-switch').onclick = () => ctl.switchBoard();
$('btn-rotate').onclick = () => world.rotate();
$('btn-tactical').onclick = () => world.toggleTactical();
$('btn-undo').onclick = () => {
  if (thinking || world.busy) return;
  ctl.undo();
  if (mode && ctl.pos.side === 1) ctl.undo(); // rewind a whole turn against the AI
};
$('btn-ai').onclick = () => {
  mode = ((mode + 1) % 5) as typeof mode;
  $('btn-ai').textContent = mode ? 'L' + mode : '2P';
  newGame();
};
$('btn-moves').onclick = () => { movelist.hidden = !movelist.hidden; };
$('btn-new').onclick = () => newGame();
window.addEventListener('resize', () => { world.resize(); layoutPortal(); });

world.syncPieces(game.pos, false);
world.applyView(false);
ctl.refresh();

// Handles for browser tests.
(window as unknown as { __uw: unknown }).__uw = { world, ctl, get game() { return ctl.game; } };
