import { Game, PieceType, Status } from './rules';
import { World } from './render/world';
import { debug as styleDebug } from './render/exec';
import { Controller } from './ui/controller';
import { AiPlayer } from './ai/client';
import * as audio from './audio/audio';
import { buzz } from './platform/haptics';
import { saveSettings, settings } from './platform/settings';
import { LEVEL_INFO } from './ai/levels';
import { Tutorial } from './ui/tutorial';
import { tutorialGame } from './tutorial/script';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const world = new World(canvas);
let game = new Game();
const ctl = new Controller(world, game, canvas);
const ai = new AiPlayer();
let tutorial!: Tutorial;

/** 0 = pass-and-play, 1-4 = play White against the AI at that level. */
let mode: 0 | 1 | 2 | 3 | 4 = 0;
let thinking = false;
let epoch = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  if (move) {
    // Bring the board the AI is about to move on into view first, so the player sees what happens.
    if (!world.dual && move.board !== world.active) {
      thinking = true; // keep input locked during the glide
      ctl.goTo(move.board);
      updateHud();
      await sleep(900);
      thinking = false;
      if (mine !== epoch || g !== ctl.game) return;
    }
    ctl.play(move);
  }
  updateHud();
}
ctl.blocked = () => thinking || (mode > 0 && ctl.pos.side === 1) || tutorial.locked;
ctl.onMoved = () => { if (tutorial.active) void tutorial.moved(); else void aiTurn(); };

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
  turn.textContent = thinking ? 'Black is thinking…' : s.state === 'ongoing' ? `${side} to move${s.check ? ' — check!' : ''}${world.dual ? '' : ' · ' + (world.active === 0 ? 'Overworld' : 'Underworld')}` : 'Game over';
  hint.textContent = ctl.hint;
  banner.hidden = s.state === 'ongoing';
  banner.textContent = statusText(s);
  ctl.locked = s.state !== 'ongoing';
  label.textContent = world.active === 0 ? 'Underworld' : 'Overworld';
  frame.className = ctl.locked ? '' : (ctl.portalAlert() ?? '');
  layoutPortal();
  // Top view shows both boards, so the corner portal gives way to two name tags.
  frame.style.display = world.dual ? 'none' : '';
  for (const [i, el] of [$('lbl-over'), $('lbl-under')].entries()) {
    el.hidden = !world.dual;
    if (world.dual) { const rc = world.dualRects()[i]; el.style.left = rc.x + 6 + 'px'; el.style.top = rc.y + 4 + 'px'; }
  }
  movelist.innerHTML = '';
  ctl.game.history.forEach((h, i) => {
    const d = document.createElement('div');
    d.innerHTML = `<span class="n">${i % 2 === 0 ? i / 2 + 1 + '.' : ''}</span>${h.san}`;
    movelist.appendChild(d);
  });
  movelist.scrollTop = movelist.scrollHeight;
}

ctl.onChange = () => { updateHud(); tutorial?.changed(); };
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
const cineBtn = $('btn-cine');
const paintCine = () => { cineBtn.style.opacity = settings.cinematic ? '1' : '0.45'; };
cineBtn.onclick = () => { settings.cinematic = !settings.cinematic; saveSettings(); paintCine(); };
paintCine();
$('btn-switch').onclick = () => ctl.switchBoard();
$('btn-rotate').onclick = () => world.rotate();
$('btn-tactical').onclick = () => { world.toggleTactical(); ctl.deselect(); updateHud(); };
$('btn-undo').onclick = () => {
  if (thinking || world.busy || tutorial.active) return;
  ctl.undo();
  if (mode && ctl.pos.side === 1) ctl.undo(); // rewind a whole turn against the AI
};
$('btn-moves').onclick = () => { movelist.hidden = !movelist.hidden; };
$('btn-new').onclick = () => { if (!tutorial.active) newGame(); };
$('btn-home').onclick = () => showMenu();
window.addEventListener('resize', () => { world.resize(); layoutPortal(); updateHud(); });

world.syncPieces(game.pos, false);
world.applyView(false);
ctl.refresh();

// Handles for browser tests.
(window as unknown as { __uw: unknown }).__uw = { world, ctl, settings, styleDebug, get game() { return ctl.game; } };

// ---------- welcome screen ----------
const menu = $('menu'), menuMain = $('menu-main'), menuLevel = $('menu-level');
document.body.classList.add('menu-open');

function showPanel(which: 'main' | 'level'): void {
  menuMain.hidden = which !== 'main';
  menuLevel.hidden = which !== 'level';
}

function showMenu(): void {
  tutorial.stop();
  epoch++; thinking = false; ai.reset();
  menu.hidden = false;
  menu.classList.remove('leaving');
  document.body.classList.add('menu-open');
  showPanel('main');
  void menu.offsetWidth;
}

/** Fades the menu out and pushes the camera in on a fresh game. mode 0 = two players, 1-4 = AI level. */
function startGame(m: 0 | 1 | 2 | 3 | 4): void {
  mode = m;
  if (m) { settings.aiLevel = m; saveSettings(); }
  audio.unlock();
  audio.play('ui');
  ctl.goTo(0);
  newGame();
  menu.classList.add('leaving');
  document.body.classList.remove('menu-open');
  world.intro();
  updateHud();
  setTimeout(() => { if (menu.classList.contains('leaving')) menu.hidden = true; }, 900);
}

const levelsEl = $('levels');
for (const lv of [1, 2, 3, 4] as const) {
  const b = document.createElement('button');
  b.className = 'level' + (settings.aiLevel === lv ? ' last' : '');
  b.innerHTML = `<b>${LEVEL_INFO[lv].name}</b><div class="pips">${'●'.repeat(lv)}<i>${'●'.repeat(4 - lv)}</i></div><p>${LEVEL_INFO[lv].blurb}</p>`;
  b.onclick = () => startGame(lv);
  levelsEl.appendChild(b);
}
$('m-single').onclick = () => { audio.unlock(); audio.play('ui'); showPanel('level'); };
$('m-two').onclick = () => startGame(0);
$('m-back').onclick = () => { audio.play('ui'); showPanel('main'); };
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') showMenu(); });

// ---------- tutorial ----------
function startTutorial(): void {
  mode = 0;
  epoch++; thinking = false; ai.reset();
  audio.unlock();
  audio.play('ui');
  if (world.dual) world.toggleTactical();
  ctl.goTo(0);
  game = tutorialGame();
  ctl.setGame(game);
  menu.classList.add('leaving');
  document.body.classList.remove('menu-open');
  world.intro();
  setTimeout(() => { if (menu.classList.contains('leaving')) menu.hidden = true; }, 900);
  tutorial.start();
  updateHud();
}
tutorial = new Tutorial({
  world, ctl,
  restart: () => { tutorial.stop(); startTutorial(); },
  leave: (to) => { showMenu(); if (to === 'single') showPanel('level'); },
});
$('m-tutorial').onclick = startTutorial;
