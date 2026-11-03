import { BakedSheetMeta, bakeCharacter } from './bake';
import { CHARACTERS } from './characters';

// Dev page (/bake.html): bakes every character and shows the sheets.
// `npm run bake` drives this page headlessly and saves the sheets to art/sprites/baked.

declare global {
  interface Window { bakeAll: () => Record<string, { png: string; meta: BakedSheetMeta }> }
}

window.bakeAll = () => Object.fromEntries(CHARACTERS.map((character) => [character.name, bakeCharacter(character)]));

const only = new URLSearchParams(location.search).get('only');
for (const character of CHARACTERS) {
  if (only && character.name !== only) continue;
  const { png } = bakeCharacter(character);
  const title = document.createElement('h2');
  title.textContent = character.name;
  const image = document.createElement('img');
  image.src = png;
  document.body.append(title, image);
}
