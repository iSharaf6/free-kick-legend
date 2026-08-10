import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');

// Pixelify Sans' 700 cut draws an uppercase C that is bitmap-identical to its
// O, and a faux-bold synthesised from 400 closes the same aperture. Shipping
// either rendered the wordmark as "KIOK DISTRIOT" and cost every CUP, CAREER,
// LOCKER and ACCURACY label its C. These guards keep the working weight.

const PIXEL_SCENES = [
  'src/scenes/MenuScene.js',
  'src/scenes/LevelSelectScene.js',
  'src/scenes/GameScene.js',
  'src/systems/GoalCelebration.js'
];
const TEXT_HELPER_SCENES = new Set([
  'src/scenes/MenuScene.js',
  'src/scenes/LevelSelectScene.js'
]);
const CANONICAL_STACK = '"Pixelify Sans", monospace';
const BANNED_FAMILIES = /Arial(?: Black)?|Trebuchet MS|Silkscreen|Courier New/;

function sourceFiles(relativeDirectory) {
  return readdirSync(join(root, relativeDirectory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = join(relativeDirectory, entry.name);
      if (entry.isDirectory()) return sourceFiles(relative);
      return entry.isFile() && entry.name.endsWith('.js') ? [relative] : [];
    });
}

test('the app loads the Pixelify Sans weight whose C keeps its aperture', () => {
  const main = read('src/main.js');
  assert.match(main, /@fontsource\/pixelify-sans\/latin-400\.css/);
  assert.doesNotMatch(main, /@fontsource\/silkscreen/);
  assert.doesNotMatch(
    main,
    /@fontsource\/pixelify-sans\/latin-(500|600|700)\.css/,
    'weights 500-700 progressively close the uppercase C into an O'
  );
});

test('Pixelify Sans is the sole shipped font dependency', () => {
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.dependencies['@fontsource/pixelify-sans'], '^5.3.0');
  assert.equal(manifest.dependencies['@fontsource/silkscreen'], undefined);
  assert.doesNotMatch(read('package-lock.json'), /@fontsource\/silkscreen/);
});

test('the shared pixel text weight is a numeric weight, never bold', () => {
  const ui = read('src/ui.js');
  const match = ui.match(/export const PIXEL_TEXT_WEIGHT = '([^']+)'/);
  assert.ok(match, 'ui.js must export PIXEL_TEXT_WEIGHT');
  assert.equal(match[1], '400');
});

test('shared canvas chrome uses the settings type stack at weight 400', () => {
  const ui = read('src/ui.js');
  assert.match(ui, /export const FONT = '\"Pixelify Sans\", monospace'/);
  assert.match(ui, /export const MONO_FONT = '\"Pixelify Sans\", monospace'/);
  assert.doesNotMatch(ui, /fontStyle: *'bold'/);
  assert.ok(
    (ui.match(/fontStyle: (?:opts\.fontStyle \?\? )?PIXEL_TEXT_WEIGHT/g) ?? []).length >= 3,
    'every shared text helper must request the real 400 face'
  );
});

test('every visible DOM and Phaser font rejects alternate primary families', () => {
  for (const file of ['index.html', ...sourceFiles('src')]) {
    assert.doesNotMatch(read(file), BANNED_FAMILIES, `${file} reintroduces a non-settings typeface`);
  }
});

test('scene-owned font stacks resolve to the canonical settings family', () => {
  for (const file of PIXEL_SCENES) {
    const source = read(file);
    const declarations = source.match(/const (?:DISPLAY_FONT|PIXEL_FONT|NUMBER_FONT|RESULT_FONT) = '([^']+)'/g) ?? [];
    assert.ok(declarations.length > 0, `${file} must declare its visible font stack`);
    for (const declaration of declarations) {
      assert.match(declaration, new RegExp(`= '${CANONICAL_STACK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'$`), declaration);
    }
  }
});

for (const file of PIXEL_SCENES) {
  test(`${file} never asks a Pixelify style for bold`, () => {
    const source = read(file);
    if (TEXT_HELPER_SCENES.has(file)) {
      assert.match(
        source,
        /fontStyle: opts\.fontStyle \?\? PIXEL_TEXT_WEIGHT/,
        'the scene text helper must default to the shared numeric weight'
      );
    } else {
      assert.match(source, /fontStyle: PIXEL_TEXT_WEIGHT/,
        'every direct visible text style must request the shared numeric weight');
    }

    const bolds = source.match(/fontStyle: *'bold'/g) ?? [];
    assert.deepEqual(bolds, [], 'pixel-font scenes must not request bold');
    assert.doesNotMatch(source, /fontStyle: *'normal'/, 'visible pixel text must request the real 400 cut');
  });
}

test('DOM chrome pins Pixelify Sans to weight 400', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, BANNED_FAMILIES);
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
