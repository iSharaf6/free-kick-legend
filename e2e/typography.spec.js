import { test, expect } from '@playwright/test';
import { GamePage } from './game-page.js';

// The unit suite guards the source declarations; this guards the thing players
// actually see. Pixelify Sans' bold cut renders C exactly like O, so the game
// title read "KIOK DISTRIOT". Rasterise the glyphs through the real loaded font
// and require them to differ.
async function glyphBitmap(page, character, font) {
  return page.evaluate(({ character, font }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 48, 48);
    ctx.fillStyle = '#fff';
    ctx.font = font;
    ctx.textBaseline = 'top';
    ctx.fillText(character, 4, 4);
    const { data } = ctx.getImageData(0, 0, 48, 48);
    let bits = '';
    for (let i = 0; i < data.length; i += 4) bits += data[i] > 110 ? '1' : '0';
    return bits;
  }, { character, font });
}

function inkedPixels(bitmap) {
  let count = 0;
  for (const bit of bitmap) if (bit === '1') count++;
  return count;
}

test.describe('pixel typography stays legible', () => {
  test('uppercase C is distinguishable from O at menu sizes', async ({ page }) => {
    const game = new GamePage(page);
    await game.open({ width: 1280, height: 720 });
    await page.evaluate(() => document.fonts.ready);

    // 18px is the wordmark, 8px the smallest body label the menu ships.
    for (const size of [18, 11, 8]) {
      const font = `400 ${size}px "Pixelify Sans"`;
      const c = await glyphBitmap(page, 'C', font);
      const o = await glyphBitmap(page, 'O', font);

      expect(inkedPixels(c), `C must render at ${size}px`).toBeGreaterThan(0);
      expect(inkedPixels(o), `O must render at ${size}px`).toBeGreaterThan(0);
      expect(c, `C and O are indistinguishable at ${size}px`).not.toEqual(o);
      // An aperture, not a stray antialiased pixel.
      expect(
        inkedPixels(o) - inkedPixels(c),
        `C should carry a visible opening at ${size}px`
      ).toBeGreaterThan(0);
    }
  });

  test('no menu text style synthesises bold from the pixel family', async ({ page }) => {
    const game = new GamePage(page);
    await game.open({ width: 1280, height: 720 });

    const offenders = await page.evaluate(() => {
      const found = [];
      const walk = (list, depth) => list.forEach((object) => {
        const style = object.style;
        if (style?.fontFamily?.includes('Pixelify')) {
          const weight = String(style.fontStyle ?? '');
          if (/bold|[6-9]00/i.test(weight)) {
            found.push(`${String(object.text).slice(0, 24)} :: ${weight}`);
          }
        }
        if (object.list && depth < 4) walk(object.list, depth + 1);
      });
      walk(window.__game.scene.getScene('Menu').children.list, 0);
      return found;
    });

    expect(offenders).toEqual([]);
  });
});
