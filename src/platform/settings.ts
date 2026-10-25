export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  secondChance: boolean;
  aiLevel: 1 | 2 | 3 | 4;
}

const KEY = 'ug.settings';
const DEFAULTS: Settings = { sound: true, music: true, haptics: true, secondChance: true, aiLevel: 2 };

/** Persisted settings. Web builds use localStorage; the Android build swaps in Preferences in phase 6. */
export const settings: Settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch { return { ...DEFAULTS }; }
})();

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage may be unavailable */ }
}
