export interface Settings {
  /** Sound effects on/off. */
  sound: boolean;
  /** Background music on/off. */
  music: boolean;
  /** 0 to 1. */
  sfxVolume: number;
  /** 0 to 1. */
  musicVolume: number;
  haptics: boolean;
  secondChance: boolean;
  aiLevel: 1 | 2 | 3 | 4;
  /** Full-length move and capture animations; off gives quick slides. */
  cinematic: boolean;
}

const KEY = 'ug.settings';
const DEFAULTS: Settings = { sound: true, music: true, sfxVolume: 0.8, musicVolume: 0.6, haptics: true, secondChance: true, aiLevel: 2, cinematic: true };

/** Persisted settings. Web builds use localStorage; the Android build swaps in Preferences in phase 6. */
export const settings: Settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch { return { ...DEFAULTS }; }
})();

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage may be unavailable */ }
}
