import * as audio from '../audio/audio';
import { saveSettings, settings } from '../platform/settings';
import { byId } from './dom';

const menu = byId('sound-menu');
const openButton = byId('btn-sound');
const musicToggle = byId<HTMLInputElement>('sm-music');
const sfxToggle = byId<HTMLInputElement>('sm-sfx');
const musicVolume = byId<HTMLInputElement>('sm-music-vol');
const sfxVolume = byId<HTMLInputElement>('sm-sfx-vol');

const paintSliderFill = (slider: HTMLInputElement) => slider.style.setProperty('--fill', slider.value + '%');

function paint(): void {
  musicToggle.checked = settings.music;
  sfxToggle.checked = settings.sound;
  musicVolume.value = String(Math.round(settings.musicVolume * 100));
  sfxVolume.value = String(Math.round(settings.sfxVolume * 100));
  paintSliderFill(musicVolume);
  paintSliderFill(sfxVolume);
  byId('row-music').classList.toggle('off', !settings.music);
  byId('row-sfx').classList.toggle('off', !settings.sound);
  openButton.textContent = settings.music || settings.sound ? '♪' : '🔇';
}

export function closeSoundMenu(): void { menu.hidden = true; }
export const isSoundMenuOpen = (): boolean => !menu.hidden;

/** The ♪ button opens a sound menu: music and effects each have their own switch and volume. */
export function initSoundMenu(): void {
  openButton.onclick = () => {
    menu.hidden = !menu.hidden;
    if (!menu.hidden) paint();
  };
  byId('sm-close').onclick = closeSoundMenu;

  musicToggle.onchange = () => {
    settings.music = musicToggle.checked;
    saveSettings();
    audio.syncMusic();
    paint();
  };
  sfxToggle.onchange = () => {
    settings.sound = sfxToggle.checked;
    saveSettings();
    paint();
    if (settings.sound) audio.play('select');
  };
  musicVolume.oninput = () => {
    settings.musicVolume = Number(musicVolume.value) / 100;
    paintSliderFill(musicVolume);
    saveSettings();
    audio.syncMusic(true);
  };
  sfxVolume.oninput = () => {
    settings.sfxVolume = Number(sfxVolume.value) / 100;
    paintSliderFill(sfxVolume);
    saveSettings();
  };
  sfxVolume.onchange = () => audio.play('select'); // a sample at the new volume

  // Clicking anywhere outside the menu closes it.
  window.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    if (isSoundMenuOpen() && !menu.contains(target) && !openButton.contains(target)) closeSoundMenu();
  }, true);
  paint();
}
