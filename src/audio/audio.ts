import { Howl, Howler } from 'howler';
import { settings } from '../platform/settings';

export type Sfx = 'select' | 'ui' | 'move' | 'capture' | 'fall' | 'rise' | 'destroy' | 'check' | 'mate';
const SFX: Sfx[] = ['select', 'ui', 'move', 'capture', 'fall', 'rise', 'destroy', 'check', 'mate'];
const base = import.meta.env.BASE_URL + 'audio/';

const sounds = new Map<Sfx, Howl>();
const music: Record<0 | 1, Howl | null> = { 0: null, 1: null };
let started = false;
let realm: 0 | 1 = 0;

function load(): void {
  for (const name of SFX) sounds.set(name, new Howl({ src: [base + name + '.ogg', base + name + '.wav'], volume: 0.7 }));
  music[0] = new Howl({ src: [base + 'music_over.ogg', base + 'music_over.wav'], loop: true, volume: 0 });
  music[1] = new Howl({ src: [base + 'music_under.ogg', base + 'music_under.wav'], loop: true, volume: 0 });
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
  sounds.get(name)?.play();
}

/** Cross-fades the two loops so the music follows the board on screen. */
export function setRealm(b: 0 | 1): void {
  realm = b;
  syncMusic();
}

export function syncMusic(): void {
  if (!started) return;
  for (const b of [0, 1] as const) {
    const h = music[b];
    if (!h) continue;
    const target = settings.music && b === realm ? 0.35 : 0;
    if (target > 0 && !h.playing()) h.play();
    h.fade(h.volume(), target, 700);
    if (target === 0) setTimeout(() => { if (h.volume() === 0) h.pause(); }, 800);
  }
}
