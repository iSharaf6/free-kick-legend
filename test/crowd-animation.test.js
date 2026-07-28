import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import zlib from 'node:zlib';

import { CROWD_ANIMATION } from '../src/data/crowdAnimation.js';
import {
  CROWD_MOTION,
  CROWD_PANORAMA,
  getCrowdTilePositions
} from '../src/data/crowdPanorama.js';

function pngDimensions(path) {
  const header = fs.readFileSync(path).subarray(0, 24);
  assert.equal(header.toString('ascii', 1, 4), 'PNG');
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20)
  };
}

test('crowd atlas uses quiet poses for ambience and every pose for goal celebration', () => {
  assert.deepEqual(CROWD_ANIMATION.ambientFrames, [0, 1, 0]);
  assert.deepEqual(CROWD_ANIMATION.goalFrames, [2, 3, 4, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual([...new Set([
    ...CROWD_ANIMATION.ambientFrames,
    ...CROWD_ANIMATION.goalFrames
  ])].sort(), [0, 1, 2, 3, 4, 5]);
});

test('runtime crowd sheet is an exact 2x3 atlas', () => {
  const dimensions = pngDimensions(new URL(
    '../public/assets/hd/crowd-animation-sheet-hd.png',
    import.meta.url
  ));
  assert.deepEqual(dimensions, {
    width: CROWD_ANIMATION.frameWidth * CROWD_ANIMATION.columns,
    height: CROWD_ANIMATION.frameHeight * CROWD_ANIMATION.rows
  });
});

test('crowd panorama crop is tight and contains no visible chroma pixels', () => {
  const path = new URL('../public/assets/hd/crowd-panorama-v3-clean.png', import.meta.url);
  const png = fs.readFileSync(path);
  const dimensions = pngDimensions(path);
  assert.deepEqual(dimensions, {
    width: CROWD_PANORAMA.sourceCrop.width,
    height: CROWD_PANORAMA.sourceCrop.height
  });

  let offset = 8;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = dimensions.width * 4 + 1;
  for (let y = 0; y < dimensions.height; y++) {
    assert.equal(raw[y * stride], 0, 'runtime crowd rows use deterministic PNG filter 0');
    for (let x = 0; x < dimensions.width; x++) {
      const i = y * stride + 1 + x * 4;
      const [r, g, b, a] = raw.subarray(i, i + 4);
      if (a === 0) {
        assert.deepEqual([r, g, b], [0, 0, 0]);
      } else {
        const looksLikeChroma = r >= 128 && b >= 128 && g <= 96
          && r - g >= 80 && b - g >= 80 && Math.abs(r - b) <= 72;
        assert.equal(looksLikeChroma, false, `visible chroma pixel at ${x},${y}`);
      }
    }
  }
});

test('crowd panorama tiles cover the stand with exact integer edges', () => {
  const positions = getCrowdTilePositions(480);
  assert.deepEqual(positions, [0, 240]);
  assert.equal(positions.every(Number.isInteger), true);
  for (let i = 0; i < positions.length - 1; i++) {
    assert.equal(positions[i] + CROWD_PANORAMA.tileWidth, positions[i + 1]);
  }
  assert.equal(positions.at(-1) + CROWD_PANORAMA.tileWidth, 480);
});

test('crowd animation uses integer-only vertical poses without changing tile width', () => {
  assert.equal(CROWD_MOTION.ambientLifts.every(Number.isInteger), true);
  assert.equal(CROWD_MOTION.goalLifts.every(Number.isInteger), true);
  assert.ok(Math.max(...CROWD_MOTION.ambientLifts) <= 1);
  assert.ok(Math.max(...CROWD_MOTION.goalLifts) <= 2);
  assert.equal(CROWD_PANORAMA.tileWidth, 240);
});
