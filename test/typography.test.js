import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');

// Pixelify Sans' 700 cut draws an uppercase C that is bitmap-identical to its
// O, and a faux-bold synthesised from 400 closes the same aperture. Shipping
// either rendered the wordmark as "KIOK DISTRIOT" and cost every CUP, CAREER,
// LOCKER and ACCURACY label its C. These guards keep the working weight.

const PIXEL_SCENES = ['src/scenes/MenuScene.js', 'src/scenes/LevelSelectScene.js'];

test('the app loads the Pixelify Sans weight whose C keeps its aperture', () => {
  const main = read('src/main.js');
  assert.match(main, /@fontsource\/pixelify-sans\/latin-400\.css/);
  assert.doesNotMatch(
    main,
    /@fontsource\/pixelify-sans\/latin-(500|600|700)\.css/,
    'weights 500-700 progressively close the uppercase C into an O'
  );
});

test('the shared pixel text weight is a numeric weight, never bold', () => {
  const ui = read('src/ui.js');
  const match = ui.match(/export const PIXEL_TEXT_WEIGHT = '([^']+)'/);
  assert.ok(match, 'ui.js must export PIXEL_TEXT_WEIGHT');
  assert.equal(match[1], '400');
});

for (const file of PIXEL_SCENES) {
  test(`${file} never asks a Pixelify style for bold`, () => {
    const source = read(file);
    assert.match(
      source,
      /fontStyle: opts\.fontStyle \?\? PIXEL_TEXT_WEIGHT/,
      'the scene text helper must default to the shared numeric weight'
    );

    // Any remaining explicit `bold` in this file must belong to a non-Pixelify
    // family. Both scenes only declare Pixelify and Silkscreen, and Silkscreen
    // ships a single 400 face here too, so bold is always synthesised.
    const bolds = source.match(/fontStyle: *'bold'/g) ?? [];
    assert.deepEqual(bolds, [], 'pixel-font scenes must not request bold');
  });
}

test('DOM chrome pins Pixelify Sans to weight 400', () => {
  const html = read('index.html');
  // Every rule that names Pixelify Sans in its font shorthand must use 400.
  const shorthand = html.match(/font: *(\d+) [^;]*"Pixelify Sans"/g) ?? [];
  for (const rule of shorthand) {
    assert.match(rule, /font: *400 /, `faux-bold DOM rule: ${rule}`);
  }
  // Elements that are bold by user-agent default and inherit the pixel family.
  for (const selector of ['.settings-heading h2', '.rotate-card strong']) {
    const block = html.slice(html.indexOf(selector));
    const body = block.slice(block.indexOf('{'), block.indexOf('}'));
    assert.match(body, /font-weight: *400/, `${selector} must pin weight 400`);
  }
});
