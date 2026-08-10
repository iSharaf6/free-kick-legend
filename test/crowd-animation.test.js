import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CROWD_ANIMATION,
  crowdDisplayScale,
  crowdFrameName,
  crowdFrameRect,
  crowdFrames,
  crowdGoalSequence,
  crowdPanelLayout,
  crowdWatchingFrame
} from '../src/data/crowdAnimation.js';
import {
  classifyCrowdTeamPixel,
  recolorCrowdPixels
} from '../src/art/CrowdPalette.js';
import { CROWD_STAND } from '../src/data/crowdStand.js';

function pngDimensions(path) {
  const bytes = fs.readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('crowd publishes ten watching sprites and ten goal sprites', () => {
  assert.equal(CROWD_ANIMATION.frameCount, 10);
  assert.equal(crowdFrames('watch').length, 10);
  assert.equal(crowdFrames('goal').length, 10);
  assert.deepEqual(crowdGoalSequence(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(crowdFrames('watch').map((frame) => frame.name)).size, 10);
  assert.equal(new Set(crowdFrames('goal').map((frame) => frame.name)).size, 10);
});

test('published source and runtime atlases have exact 2x5 grids', () => {
  for (const source of Object.values(CROWD_ANIMATION.sources)) {
    const expected = {
      width: source.frameWidth * source.columns,
      height: source.frameHeight * source.rows
    };
    assert.deepEqual(expected, { width: source.sourceWidth, height: source.sourceHeight });
    assert.deepEqual(pngDimensions(new URL(`../public/${source.assetPath}`, import.meta.url)), expected);
    assert.deepEqual(pngDimensions(new URL(`../assets/source/${source.assetPath.split('/').at(-1)}`, import.meta.url)), expected);
  }
});

test('every frame takes the same safe crop from its own atlas cell', () => {
  for (const kind of ['watch', 'goal']) {
    const source = CROWD_ANIMATION.sources[kind];
    crowdFrames(kind).forEach((frame, index) => {
      const column = index % source.columns;
      const row = Math.floor(index / source.columns);
      assert.equal(frame.name, crowdFrameName(kind, index));
      assert.equal(frame.x, column * source.frameWidth + source.crop.x);
      assert.equal(frame.y, row * source.frameHeight + source.crop.y);
      assert.equal(frame.width, source.crop.width);
      assert.equal(frame.height, source.crop.height);
      assert.deepEqual(frame, { name: frame.name, index, ...crowdFrameRect(kind, index) });
      assert.ok(frame.x + frame.width <= (column + 1) * source.frameWidth);
      assert.ok(frame.y + frame.height <= (row + 1) * source.frameHeight);
    });
  }
});

test('all three stand panels use one scalar and fill the same crowd band without stretching', () => {
  for (const kind of ['watch', 'goal']) {
    const source = CROWD_ANIMATION.sources[kind];
    const scale = crowdDisplayScale(kind, 480);
    const layout = crowdPanelLayout(kind, 480, 0);
    assert.equal(layout.length, 3);
    assert.equal(layout[0].width, 160);
    assert.equal(layout[1].x, 160);
    assert.equal(layout[2].x, 320);
    assert.equal(source.crop.width * scale, 160);
    assert.ok(Math.abs(source.crop.height * scale - CROWD_ANIMATION.displayHeight) < 0.05);
    layout.forEach((panel) => assert.equal(panel.scale, scale));
  }
  assert.equal(CROWD_ANIMATION.top + CROWD_ANIMATION.displayHeight, CROWD_STAND.tiers.at(-1).bottom);
});

test('watching panels stay independently phased across all ten frames', () => {
  for (let tick = 0; tick < 20; tick++) {
    assert.equal(crowdWatchingFrame(0, tick), tick % 10);
    assert.equal(crowdWatchingFrame(1, tick), (tick + 3) % 10);
    assert.equal(crowdWatchingFrame(2, tick), (tick + 6) % 10);
    assert.notEqual(crowdWatchingFrame(0, tick), crowdWatchingFrame(1, tick));
    assert.notEqual(crowdWatchingFrame(1, tick), crowdWatchingFrame(2, tick));
  }
});

test('palette classifier isolates authored team cloth from faces and architecture', () => {
  assert.equal(classifyCrowdTeamPixel(0x00, 0x57, 0xff), 'primary');
  assert.equal(classifyCrowdTeamPixel(0xb7, 0xff, 0x00), 'secondary');
  assert.equal(classifyCrowdTeamPixel(0xd2, 0x8a, 0x55), null, 'skin stays natural');
  assert.equal(classifyCrowdTeamPixel(0x08, 0x18, 0x28), null, 'dark stadium navy stays architectural');
  assert.equal(classifyCrowdTeamPixel(0xff, 0xff, 0xff), null, 'white trim stays clean');
});

test('equipped-kit recolouring changes only team pixels and preserves alpha', () => {
  const pixels = new Uint8ClampedArray([
    0x00, 0x57, 0xff, 255,
    0xb7, 0xff, 0x00, 220,
    0xd2, 0x8a, 0x55, 255,
    0x08, 0x18, 0x28, 255
  ]);
  const beforeSkin = [...pixels.slice(8, 12)];
  const beforeArchitecture = [...pixels.slice(12, 16)];
  const counts = recolorCrowdPixels(pixels, {
    primary: 0x9f2837,
    secondary: 0x6d1726,
    trim: 0xfff0d4
  });
  assert.deepEqual(counts, { primary: 1, secondary: 1 });
  assert.notDeepEqual([...pixels.slice(0, 3)], [0x00, 0x57, 0xff]);
  assert.notDeepEqual([...pixels.slice(4, 7)], [0xb7, 0xff, 0x00]);
  assert.equal(pixels[7], 220);
  assert.deepEqual([...pixels.slice(8, 12)], beforeSkin);
  assert.deepEqual([...pixels.slice(12, 16)], beforeArchitecture);
});

test('runtime crossfades full panels, plays ten goal frames and supports reduced motion', () => {
  const source = fs.readFileSync(new URL('../src/art/CrowdStand.js', import.meta.url), 'utf8');
  assert.match(source, /ensureCrowdPaletteTextures\(scene, kitId, palette\)/);
  assert.match(source, /next\.setTexture\(crowdSource\(kind\)\.activeTextureKey/);
  assert.match(source, /crowdGoalSequence\(\)/);
  assert.match(source, /frames\.forEach\(\(frame, frameIndex\)/);
  assert.match(source, /this\.setPanelFrame\(panelIndex, 'goal', 5, \{ instant: true \}\)/);
  assert.match(source, /watchingFrameMs/);
  assert.match(source, /goalFrameMs/);
  assert.match(source, /setReducedMotion\(reduced\)/);
});

test('boot loads both authored sheets and scenes pass the equipped kit palette', () => {
  const boot = fs.readFileSync(new URL('../src/scenes/BootScene.js', import.meta.url), 'utf8');
  const game = fs.readFileSync(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8');
  const menu = fs.readFileSync(new URL('../src/scenes/MenuScene.js', import.meta.url), 'utf8');
  assert.match(boot, /Object\.values\(CROWD_ANIMATION\.sources\)/);
  assert.match(boot, /this\.load\.image\(source\.textureKey/);
  assert.match(game, /kitId: this\.loadout\?\.kit/);
  assert.match(game, /getCosmetic\(this\.loadout\?\.kit/);
  assert.match(menu, /palette: equippedKitPalette/);
});

test('publisher and production note cover both ten-frame atlases', () => {
  const builder = fs.readFileSync(new URL('../scripts/build_crowd_sprites.py', import.meta.url), 'utf8');
  const note = fs.readFileSync(new URL('../assets/source/CROWD-20-FRAME-PROMPTS.md', import.meta.url), 'utf8');
  assert.match(builder, /crowd-watching-sheet-v1\.png/);
  assert.match(builder, /crowd-goal-sheet-v1\.png/);
  assert.match(note, /ten aligned frames/i);
  assert.match(note, /permanent hanging supporter banners/i);
  assert.match(note, /large tifo/i);
  assert.match(note, /equipped player's jersey/i);
  assert.match(note, /10 watching sprites and 10 goal sprites/i);
});
