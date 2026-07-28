import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import zlib from 'node:zlib';

import { CROWD_ANIMATION } from '../src/data/crowdAnimation.js';
import {
  CROWD_MOTION,
  CROWD_PANORAMA,
  crowdTierAspectError,
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

test('every crowd tier renders at the source aspect so supporters are never stretched', () => {
  assert.equal(
    CROWD_PANORAMA.sourceAspect,
    CROWD_PANORAMA.sourceWidth / CROWD_PANORAMA.sourceHeight
  );
  assert.ok(CROWD_PANORAMA.tiers.length >= 2, 'the stand is layered for depth');
  for (const tier of CROWD_PANORAMA.tiers) {
    assert.ok(
      crowdTierAspectError(tier) < 0.01,
      `${tier.id} tier distorts the panorama by ${(crowdTierAspectError(tier) * 100).toFixed(2)}%`
    );
  }
});

test('crowd tiers differ in scale and brightness so the stand reads as depth', () => {
  const [far, near] = CROWD_PANORAMA.tiers;
  assert.ok(near.tileHeight > far.tileHeight, 'the near tier is the larger one');
  assert.ok(near.baselineY > far.baselineY, 'the near tier sits lower in frame');
  assert.ok(near.tint > far.tint, 'the far tier is the darker one');
});

test('crowd panorama tiles cover the full stand width from their tier offset', () => {
  for (const tier of CROWD_PANORAMA.tiers) {
    const positions = getCrowdTilePositions(480, tier.tileWidth, tier.startX);
    assert.equal(positions.every(Number.isInteger), true);
    assert.equal(positions[0], tier.startX);
    for (let i = 0; i < positions.length - 1; i++) {
      assert.equal(positions[i] + tier.tileWidth, positions[i + 1]);
    }
    assert.ok(positions.at(-1) + tier.tileWidth >= 480, `${tier.id} tier leaves a gap`);
  }
});

test('crowd animation uses integer-only vertical poses and never resizes a tile', () => {
  assert.equal(CROWD_MOTION.ambientLifts.every(Number.isInteger), true);
  assert.equal(CROWD_MOTION.goalLifts.every(Number.isInteger), true);
  assert.ok(Math.max(...CROWD_MOTION.ambientLifts) <= 1);
  assert.ok(Math.max(...CROWD_MOTION.goalLifts) <= 3);
  assert.ok(CROWD_MOTION.tilePhaseStride >= 1, 'tiles bob out of phase with each other');

  const source = fs.readFileSync(new URL('../src/art/CrowdPanorama.js', import.meta.url), 'utf8');
  const sizeWrites = source.match(/setDisplaySize/g) || [];
  assert.equal(sizeWrites.length, 1, 'tile size is written once, at construction');
});
