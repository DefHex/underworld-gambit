import { Easing, Group, Tween } from '@tweenjs/tween.js';

/**
 * The default main group does not register tweens in the Vite bundle, so use our own.
 * Tweens run on a virtual clock so checkmate can slow everything down.
 */
export const tweens = new Group();
export const clock = { t: 0, scale: 1, last: -1 };

/** Advances the virtual clock from a real rAF timestamp and updates all tweens. */
export function tickTweens(realTime: number): void {
  if (clock.last < 0) clock.last = realTime;
  const dt = Math.min(realTime - clock.last, 50);
  clock.last = realTime;
  clock.t += dt * clock.scale;
  tweens.update(clock.t);
}
/** Call when the render loop restarts after idling, so the idle gap is not counted. */
export function resetClockGap(): void { clock.last = -1; }

export const tween = <T extends object>(target: T) => new Tween(target, tweens);
export const start = <T extends Tween<any>>(tw: T): T => tw.start(clock.t);
export const animating = () => tweens.getAll().some((t) => t.isPlaying());
export { Easing };
