import { Easing, Group, Tween } from '@tweenjs/tween.js';

/** The default main group does not register tweens in the Vite bundle, so use our own. */
export const tweens = new Group();
export const tween = <T extends object>(target: T) => new Tween(target, tweens);
export { Easing };
