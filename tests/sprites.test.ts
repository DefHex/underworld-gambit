import { checkSprites } from '../scripts/check-sprites.mjs';

describe('pixel-art sprite sheets', () => {
  it('match their frame data, tags and palettes', () => {
    expect(checkSprites()).toEqual([]);
  });
});
