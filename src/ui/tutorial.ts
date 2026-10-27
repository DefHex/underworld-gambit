import { BoardId, parseSq } from '../rules';
import { play } from '../audio/audio';
import type { World } from '../render/world';
import { LINE, Mv, findMove } from '../tutorial/script';
import type { Controller } from './controller';

type Step =
  | { t: 'say'; title: string; text: string; ring?: string[] }
  | { t: 'goto'; board: BoardId; title: string; text: string; ring: string[] }
  | { t: 'move'; title: string; text: string; move: Mv; reply?: Mv; viewAfter?: BoardId }
  | { t: 'end' };

const STEPS: Step[] = [
  // ----- part 1: the controls -----
  { t: 'say', title: 'Welcome to two-board chess', text: 'Chess, but on <b>two boards stacked on top of each other</b>. A short tour of the controls first, then a quick game to show the trick.' },
  { t: 'say', title: 'The Overworld', text: 'This is the <b>Overworld</b>: ordinary chess, and you are White. Win by checkmating the black king here. The twist: pieces that get captured don\'t vanish. They <b>fall</b>.' },
  { t: 'say', title: 'The corner window', text: 'The small window peeks at the <b>Underworld</b>, the board below. It pulses when something happens down there. Tap it to jump to that board.', ring: ['portal-frame'] },
  { t: 'say', title: '⇅  Switch board', text: 'Jumps between the Overworld and the Underworld. You can also swipe up or down on the board.', ring: ['btn-switch'] },
  { t: 'say', title: '↻  Rotate', text: 'Turns the camera a quarter turn so you can see the board from another side.', ring: ['btn-rotate'] },
  { t: 'say', title: '▦  Top view', text: 'Shows <b>both boards at once</b>, side by side (stacked on a phone), so you never have to switch. You can play on either.', ring: ['btn-tactical'] },
  { t: 'say', title: '↶  Undo', text: 'Takes back your last move. Against the computer it rewinds your whole turn.', ring: ['btn-undo'] },
  { t: 'say', title: '♪  Sound', text: 'Turns the sound effects and music on or off.', ring: ['btn-sound'] },
  { t: 'say', title: '🎬  Cinematic', text: 'Every move and capture has its own animation. Switch this off for quick, plain slides.', ring: ['btn-cine'] },
  { t: 'say', title: '≡  Move list', text: 'Every move so far. A <b>↓</b> means a piece fell, an <b>↑</b> means a piece rose, and <b>u:</b> marks a move made in the Underworld.', ring: ['btn-moves'] },
  { t: 'say', title: '⌂  Menu and ＋ New game', text: '⌂ goes back to the main menu. ＋ starts a fresh game. Picking up a piece and tapping a gold target moves it; captures ask you to tap twice to confirm.', ring: ['btn-home', 'btn-new'] },

  // ----- part 2: the fixed game -----
  { t: 'say', title: 'Now the trick', text: 'Black\'s king is boxed in by its own pawns. Your queen can\'t reach it directly, but she can get there <b>through the Underworld</b>. Mate in three. Follow the gold rings.' },
  { t: 'move', title: '1. Make a sacrifice', text: 'Tap your <b>queen</b> on d1, then tap <b>d3</b>. Black\'s bishop on b5 can take her there, and that is exactly what you want.', move: LINE.sacrifice, reply: LINE.take },
  { t: 'say', title: 'She fell, she isn\'t dead', text: 'Black took your queen, and she <b>fell to the Underworld</b>, landing on the same square (d3). It is still your move.' },
  { t: 'goto', board: 1, title: 'Look below', text: 'Go down to the Underworld: tap <b>⇅</b>, the corner window, or swipe down.', ring: ['btn-switch', 'portal-frame'] },
  { t: 'say', title: 'Your queen, and a black rook', text: 'There is your queen on d3. A black rook is down here too, on d8: a piece that fell earlier. Pieces down here fight each other just like normal chess.' },
  { t: 'move', title: '2. Take it back', text: 'Tap the queen on d3, then <b>d8</b> (tap again to confirm). A capture in the Underworld <b>destroys the victim for good</b> and your piece <b>rises</b> to the same square on the Overworld.', move: LINE.rise, reply: LINE.block, viewAfter: 0 },
  { t: 'say', title: 'Risen, with check', text: 'Your queen rose on d8 and gives <b>check</b>. Black had to block with the bishop. The glowing ring on her base is a <b>second-chance mark</b>: if she is captured again she is destroyed instead of falling.' },
  { t: 'move', title: '3. Checkmate', text: 'Tap the queen on d8, then <b>e8</b> to take the bishop. The king has nowhere to go: <b>checkmate</b>.', move: LINE.mate },
  { t: 'end' },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const $ = (id: string) => document.getElementById(id)!;

export interface TutorialDeps {
  world: World;
  ctl: Controller;
  /** Back to the main menu (or straight to the opponent picker). */
  leave: (to: 'menu' | 'single') => void;
  /** Starts the tutorial game from the fixed position. */
  restart: () => void;
}

/** A coach card, a pulsing ring around the button being explained, and a guided fixed game. */
export class Tutorial {
  active = false;
  /** True while a scripted reply is playing, so the player's taps are ignored. */
  locked = false;
  private i = 0;

  constructor(private d: TutorialDeps) {
    $('coach-skip').onclick = () => this.d.leave('menu');
    window.addEventListener('resize', () => this.placeRing());
    d.ctl.onWrong = (why) => this.nudge(why);
    d.ctl.onLockedTap = () => this.pulseCard();
  }

  start(): void {
    this.active = true;
    this.locked = false;
    this.i = 0;
    document.body.classList.add('tutorial');
    $('coach').hidden = false;
    this.render();
  }

  stop(): void {
    this.active = false;
    this.locked = false;
    this.d.ctl.guide = null;
    this.d.ctl.movesLocked = false;
    document.body.classList.remove('tutorial');
    $('coach').hidden = true;
    $('tut-ring').hidden = true;
    this.d.ctl.refresh();
  }

  private idle(): Promise<void> {
    return new Promise((res) => {
      const t = setInterval(() => { if (!this.d.world.busy) { clearInterval(t); res(); } }, 80);
    });
  }

  private ringIds: string[] = [];
  private placeRing(): void {
    const ring = $('tut-ring');
    const rs = this.ringIds
      .map((id) => document.getElementById(id)?.getBoundingClientRect())
      .filter((r): r is DOMRect => !!r && r.width > 0 && r.height > 0);
    if (!this.active || !rs.length) { ring.hidden = true; return; }
    const x0 = Math.min(...rs.map((r) => r.left)) - 5, y0 = Math.min(...rs.map((r) => r.top)) - 5;
    const x1 = Math.max(...rs.map((r) => r.right)) + 5, y1 = Math.max(...rs.map((r) => r.bottom)) + 5;
    Object.assign(ring.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
    ring.hidden = false;
  }

  private card(title: string, text: string, buttons: { label: string; primary?: boolean; run: () => void }[]): void {
    const total = STEPS.length;
    $('coach-step').textContent = `${Math.min(this.i + 1, total)} / ${total}`;
    $('coach-title').textContent = title;
    $('coach-text').innerHTML = text;
    const box = $('coach-actions');
    box.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.textContent = b.label;
      el.className = b.primary ? 'primary' : '';
      el.onclick = () => { play('ui'); b.run(); };
      box.appendChild(el);
    }
  }

  private render(): void {
    const s = STEPS[this.i];
    const { ctl, world } = this.d;
    ctl.guide = null;
    // Pieces only respond during the guided-move steps; the tour and the explanations never touch the demo game.
    ctl.movesLocked = s.t !== 'move';
    this.ringIds = [];
    if (world.dual) { world.toggleTactical(); }

    if (s.t === 'say') {
      this.ringIds = s.ring ?? [];
      this.card(s.title, s.text, [{ label: this.i === STEPS.length - 2 ? 'Next' : 'Next ›', primary: true, run: () => this.next() }]);
    } else if (s.t === 'goto') {
      this.ringIds = s.ring;
      this.card(s.title, s.text, []);
      if (world.active === s.board) { this.next(); return; }
    } else if (s.t === 'move') {
      this.card(s.title, s.text, []);
      if (world.active !== s.move.b) ctl.goTo(s.move.b);
      ctl.guide = { b: s.move.b, from: parseSq(s.move.from), to: parseSq(s.move.to) };
      ctl.deselect();
    } else {
      this.card('Checkmate. You did it!', 'You gave up a queen, took her back from the Underworld, and mated in three moves. That is the whole game: <b>captures send pieces down, and captures down bring them back up</b>.', [
        { label: 'Play the computer', primary: true, run: () => this.d.leave('single') },
        { label: 'Replay', run: () => this.d.restart() },
        { label: 'Menu', run: () => this.d.leave('menu') },
      ]);
    }
    this.placeRing();
  }

  private next(): void { this.i++; this.render(); }

  /** Called by the controller after any move while the tutorial is active. */
  async moved(): Promise<void> {
    const s = STEPS[this.i];
    if (!this.active || this.locked || s.t !== 'move') return;
    const { ctl, world } = this.d;
    this.locked = true;
    ctl.guide = null;
    $('coach-actions').innerHTML = '';
    await this.idle();
    if (s.reply) {
      if (s.viewAfter !== undefined && world.active !== s.viewAfter) { ctl.goTo(s.viewAfter); await sleep(900); }
      await sleep(300);
      const m = findMove(ctl.game, s.reply);
      if (m) ctl.play(m);
      await this.idle();
    }
    this.locked = false;
    this.next();
  }

  /** Called whenever the view or selection changes, for the "go to the other board" step. */
  changed(): void {
    const s = STEPS[this.i];
    if (this.active && s?.t === 'goto' && this.d.world.active === s.board) this.next();
  }

  /** A tap on the board when it is not the player's turn to act: draw the eye back to the card. */
  private pulseCard(): void {
    play('wrong');
    const el = $('coach');
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
  }

  private nudge(why: 'piece' | 'target' | 'empty'): void {
    const s = STEPS[this.i];
    if (s?.t !== 'move') return;
    play('wrong');
    const msg = why === 'target' ? 'Not that square. Tap the glowing gold ring.' : 'Not that piece. Start with the gold ring.';
    const t = $('coach-text');
    const keep = s.text;
    t.innerHTML = `<b class="warn">${msg}</b><br>${keep}`;
  }
}
