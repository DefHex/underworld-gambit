import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { settings } from './settings';

export type Buzz = 'select' | 'fall' | 'rise' | 'check';

/** Haptic ticks on select, fall and rise. Native on Android, navigator.vibrate on the web. */
export function buzz(kind: Buzz): void {
  if (!settings.haptics) return;
  if (Capacitor.isNativePlatform()) {
    const style = kind === 'select' ? ImpactStyle.Light : kind === 'check' ? ImpactStyle.Medium : ImpactStyle.Heavy;
    void Haptics.impact({ style }).catch(() => {});
    return;
  }
  const pattern = { select: 8, fall: [30, 40, 60], rise: [20, 30, 20, 30, 50], check: [40, 30, 40] }[kind];
  try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(pattern); } catch { /* not supported */ }
}
