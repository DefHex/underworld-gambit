import { Game } from './rules';
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
import { byId } from './ui/dom';
import { renderMoveList, showPromotionPicker, statusText } from './ui/hud';
import { closeSoundMenu, initSoundMenu, isSoundMenuOpen } from './ui/sound-menu';

/** 0 = pass-and-play, 1-4 = play White against the AI at that level. */
type OpponentMode = 0 | 1 | 2 | 3 | 4;

const AI_MOVE_RETRY_MS = 120;
const BOARD_GLIDE_WAIT_MS = 900;
const MENU_FADE_MS = 900;
const GAME_OVER_JINGLE_DELAY_MS = 1500;

const canvas = byId<HTMLCanvasElement>('stage');
const world = new World(canvas);
let game = new Game();
const controller = new Controller(world, game, canvas);
const ai = new AiPlayer();
let tutorial!: Tutorial;

let opponentMode: OpponentMode = 0;
let aiThinking = false;
/** Bumped whenever the game is replaced, so a slow AI answer for an old game is ignored. */
let gameEpoch = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Stops any pending AI work and forgets what it knew. */
function cancelAiTurn(): void {
  gameEpoch++;
  aiThinking = false;
  ai.reset();
}

// ---------- AI turn ----------

async function playAiTurn(): Promise<void> {
  if (!opponentMode || aiThinking || controller.locked || controller.pos.side !== 1) return;
  if (world.busy) { setTimeout(playAiTurn, AI_MOVE_RETRY_MS); return; }

  aiThinking = true;
  const epochAtStart = ++gameEpoch;
  const gameAtStart = controller.game;
  const isStale = () => epochAtStart !== gameEpoch || gameAtStart !== controller.game;
  updateHud();

  const move = await ai.think(gameAtStart.save(), opponentMode);
  aiThinking = false;
  if (isStale()) return;

  if (move) {
    // Bring the board the AI is about to move on into view first, so the player sees what happens.
    if (!world.dual && move.board !== world.active) {
      aiThinking = true; // keep input locked during the glide
      controller.goTo(move.board);
      updateHud();
      await sleep(BOARD_GLIDE_WAIT_MS);
      aiThinking = false;
      if (isStale()) return;
    }
    controller.play(move);
  }
  updateHud();
}

controller.blocked = () => aiThinking || (opponentMode > 0 && controller.pos.side === 1) || tutorial.locked;
controller.onMoved = () => { if (tutorial.active) void tutorial.moved(); else void playAiTurn(); };

function newGame(): void {
  cancelAiTurn();
  game = new Game({ secondChance: settings.secondChance });
  controller.setGame(game);
}

// ---------- HUD ----------

const turnLabel = byId('turn');
const hintLabel = byId('hint');
const resultBanner = byId('banner');
const moveListPanel = byId('movelist');
const portalFrame = byId('portal-frame');
const portalLabel = byId('portal-label');
const overworldTag = byId('lbl-over');
const underworldTag = byId('lbl-under');

function describeTurn(status: ReturnType<Game['status']>): string {
  if (aiThinking) return 'Black is thinking…';
  if (status.state !== 'ongoing') return 'Game over';
  const side = controller.pos.side === 0 ? 'White' : 'Black';
  const check = status.check ? ' — check!' : '';
  const realm = world.dual ? '' : ' · ' + (world.active === 0 ? 'Overworld' : 'Underworld');
  return `${side} to move${check}${realm}`;
}

function layoutPortal(): void {
  const rect = world.portalRect;
  Object.assign(portalFrame.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
}

/** Top view shows both boards, so the corner portal gives way to two name tags. */
function layoutRealmTags(): void {
  portalFrame.style.display = world.dual ? 'none' : '';
  [overworldTag, underworldTag].forEach((tag, boardIndex) => {
    tag.hidden = !world.dual;
    if (!world.dual) return;
    const rect = world.dualRects()[boardIndex];
    tag.style.left = rect.x + 6 + 'px';
    tag.style.top = rect.y + 4 + 'px';
  });
}

function updateHud(): void {
  const status = controller.game.status();
  turnLabel.textContent = describeTurn(status);
  hintLabel.textContent = controller.hint;
  resultBanner.hidden = status.state === 'ongoing';
  resultBanner.textContent = statusText(status);
  controller.locked = status.state !== 'ongoing';
  portalLabel.textContent = world.active === 0 ? 'Underworld' : 'Overworld';
  portalFrame.className = controller.locked ? '' : (controller.portalAlert() ?? '');
  layoutPortal();
  layoutRealmTags();
  renderMoveList(controller.game.history);
}

controller.onChange = () => { updateHud(); tutorial?.changed(); };
controller.onPromotion = showPromotionPicker;

// ---------- sound & haptics ----------

world.onEvent = (event) => {
  switch (event) {
    case 'fall': audio.play('fall'); buzz('fall'); break;
    case 'rise': audio.play('rise'); buzz('rise'); break;
    case 'check': audio.play('check'); buzz('check'); break;
    case 'destroy': audio.play('destroy'); break;
    case 'promote': audio.play('promote'); break;
  }
};

// Result jingle shortly after the mate / draw sound.
controller.onEnd = (winner) => {
  const delay = winner === null ? 0 : GAME_OVER_JINGLE_DELAY_MS;
  setTimeout(() => {
    if (winner === null) audio.play('draw');
    else audio.play(opponentMode === 0 || winner === 0 ? 'victory' : 'defeat');
  }, delay);
};

// A soft tick on every toolbar button.
document.querySelectorAll('#toolbar button').forEach((button) => button.addEventListener('click', () => audio.play('ui')));
// Browsers only allow audio after a gesture.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
initSoundMenu();

// ---------- toolbar ----------

const cinematicButton = byId('btn-cine');
const paintCinematicButton = () => { cinematicButton.style.opacity = settings.cinematic ? '1' : '0.45'; };
cinematicButton.onclick = () => {
  settings.cinematic = !settings.cinematic;
  saveSettings();
  paintCinematicButton();
};
paintCinematicButton();

byId('btn-switch').onclick = () => controller.switchBoard();
byId('btn-rotate').onclick = () => world.rotate();
byId('btn-tactical').onclick = () => { world.toggleTactical(); controller.deselect(); updateHud(); };
byId('btn-undo').onclick = () => {
  if (aiThinking || world.busy || tutorial.active) return;
  controller.undo();
  if (opponentMode && controller.pos.side === 1) controller.undo(); // rewind a whole turn against the AI
};
byId('btn-moves').onclick = () => { moveListPanel.hidden = !moveListPanel.hidden; };
byId('btn-new').onclick = () => { if (!tutorial.active) newGame(); };
byId('btn-home').onclick = () => showMenu();
window.addEventListener('resize', () => { world.resize(); layoutPortal(); updateHud(); });

world.syncPieces(game.pos, false);
world.applyView(false);
controller.refresh();

// Handles for browser tests.
(window as unknown as { __uw: unknown }).__uw = {
  world, ctl: controller, settings, styleDebug, audio, get game() { return controller.game; },
};

// ---------- welcome screen ----------

const menu = byId('menu');
const mainPanel = byId('menu-main');
const levelPanel = byId('menu-level');
document.body.classList.add('menu-open');

function showPanel(which: 'main' | 'level'): void {
  mainPanel.hidden = which !== 'main';
  levelPanel.hidden = which !== 'level';
}

function showMenu(): void {
  closeSoundMenu();
  tutorial.stop();
  cancelAiTurn();
  menu.hidden = false;
  menu.classList.remove('leaving');
  document.body.classList.add('menu-open');
  showPanel('main');
  void menu.offsetWidth; // restart the menu's fade-in animation
}

/** Fades the menu out and pushes the camera in on a fresh game. */
function leaveMenu(): void {
  menu.classList.add('leaving');
  document.body.classList.remove('menu-open');
  world.intro();
  setTimeout(() => { if (menu.classList.contains('leaving')) menu.hidden = true; }, MENU_FADE_MS);
}

function startGame(mode: OpponentMode): void {
  opponentMode = mode;
  if (mode) { settings.aiLevel = mode; saveSettings(); }
  audio.unlock();
  audio.play('start');
  controller.goTo(0);
  newGame();
  leaveMenu();
  updateHud();
}

function buildLevelButtons(): void {
  const container = byId('levels');
  for (const level of [1, 2, 3, 4] as const) {
    const { name, blurb } = LEVEL_INFO[level];
    const button = document.createElement('button');
    button.className = 'level' + (settings.aiLevel === level ? ' last' : '');
    button.innerHTML = `<b>${name}</b><div class="pips">${'●'.repeat(level)}<i>${'●'.repeat(4 - level)}</i></div><p>${blurb}</p>`;
    button.onclick = () => startGame(level);
    container.appendChild(button);
  }
}
buildLevelButtons();

byId('m-single').onclick = () => { audio.unlock(); audio.play('ui'); showPanel('level'); };
byId('m-two').onclick = () => startGame(0);
byId('m-back').onclick = () => { audio.play('ui'); showPanel('main'); };
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (isSoundMenuOpen()) closeSoundMenu(); else showMenu();
});

// ---------- tutorial ----------

function startTutorial(): void {
  opponentMode = 0;
  cancelAiTurn();
  audio.unlock();
  audio.play('start');
  if (world.dual) world.toggleTactical();
  controller.goTo(0);
  game = tutorialGame();
  controller.setGame(game);
  leaveMenu();
  tutorial.start();
  updateHud();
}

tutorial = new Tutorial({
  world,
  ctl: controller,
  restart: () => { tutorial.stop(); startTutorial(); },
  leave: (to) => { showMenu(); if (to === 'single') showPanel('level'); },
});
byId('m-tutorial').onclick = startTutorial;
