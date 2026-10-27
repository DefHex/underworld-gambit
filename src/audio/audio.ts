import { Howl, Howler } from 'howler';
import { settings } from '../platform/settings';

export type Sfx =
  | 'select' | 'ui' | 'move' | 'capture' | 'fall' | 'rise' | 'destroy' | 'check' | 'mate'
  | 'explosion' | 'rocket' | 'chute' | 'engine' | 'cannon' | 'gallop' | 'whip' | 'slash' | 'zap' | 'stomp'
  | 'smack' | 'thud' | 'fire' | 'whoosh' | 'clang' | 'promote' | 'castle' | 'wrong'
  | 'victory' | 'defeat' | 'draw' | 'start';
const SFX: Sfx[] = [
  'select', 'ui', 'move', 'capture', 'fall', 'rise', 'destroy', 'check', 'mate',
  'explosion', 'rocket', 'chute', 'engine', 'cannon', 'gallop', 'whip', 'slash', 'zap', 'stomp',
  'smack', 'thud', 'fire', 'whoosh', 'clang', 'promote', 'castle', 'wrong', 'victory', 'defeat', 'draw', 'start',
];
/** Per-effect loudness so the big booms do not drown the small ticks. */
const VOLUME: Partial<Record<Sfx, number>> = {
  ui: 0.45, select: 0.5, move: 0.65, explosion: 0.85, cannon: 0.8, rocket: 0.6, engine: 0.5, gallop: 0.6, fire: 0.55,
  whoosh: 0.5, chute: 0.55, whip: 0.7, slash: 0.55, zap: 0.55, wrong: 0.5, victory: 0.7, defeat: 0.7, draw: 0.6, start: 0.7,
};
const base = import.meta.env.BASE_URL + 'audio/';
/**
 * Howler uses the first format in a list that the browser supports and does NOT fall back when that
 * file is missing, so only list files that exist. Replace a .wav with a CC0 recording of the same name,
 * or add an .ogg and switch this to '.ogg' once every file has one.
 */
const FORMAT = '.wav';
const ext = (name: string) => base + name + FORMAT;

const sounds = new Map<Sfx, Howl>();
const music: Record<0 | 1, Howl | null> = { 0: null, 1: null };
let started = false;
let realm: 0 | 1 = 0;

function load(): void {
  for (const name of SFX) sounds.set(name, new Howl({ src: [ext(name)], volume: VOLUME[name] ?? 0.7 }));
  music[0] = new Howl({ src: [ext('music_over')], loop: true, volume: 0 });
  music[1] = new Howl({ src: [ext('music_under')], loop: true, volume: 0 });
}

/** Must be called from a user gesture (browsers block audio until then). */
export function unlock(): void {
  if (started) return;
  started = true;
  load();
  void Howler.ctx?.resume?.();
  syncMusic();
}

export function play(name: Sfx): void {
  if (!settings.sound || !started) return;
  const h = sounds.get(name);
  if (!h) return;
  h.volume((VOLUME[name] ?? 0.7) * settings.sfxVolume);
  h.play();
}

/** Cross-fades the two loops so the music follows the board on screen. */
export function setRealm(b: 0 | 1): void {
  realm = b;
  syncMusic();
}

const MUSIC_GAIN = 0.7;

/** Applies the music switch and volume. `instant` skips the fade (used while dragging the slider). */
export function syncMusic(instant = false): void {
  if (!started) return;
  for (const b of [0, 1] as const) {
    const h = music[b];
    if (!h) continue;
    const target = settings.music && b === realm ? settings.musicVolume * MUSIC_GAIN : 0;
    if (target > 0 && !h.playing()) h.play();
    if (instant) h.volume(target); else h.fade(h.volume(), target, 700);
    if (target === 0) setTimeout(() => { if (h.volume() === 0) h.pause(); }, 800);
  }
}

/** Test hook: the load state of every sound (should all be 'loaded'). */
export const debugState = () => [...sounds.entries()].map(([n, h]) => `${n}:${h.state()}`).concat(([0, 1] as const).map((b) => `music${b}:${music[b]?.state()}`));
