import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import zlib from 'node:zlib';

import {
  CROWD_MOTION,
  CROWD_PANORAMA,
  CROWD_SETS,
  getCrowdTilePositions
} from '../src/data/crowdPanorama.js';

function pngDimensions(path) {
  const header = fs.readFileSync(path).subarray(0, 26);
  assert.equal(header.toString('ascii', 1, 4), 'PNG');
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
    colorType: header[25]
  };
}

function rgbaPixels(path) {
  const png = fs.readFileSync(path);
  let offset = 8;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return zlib.inflateSync(Buffer.concat(idat));
}

test('five distinct crowd animation sets expose five authored frames each', () => {
  assert.equal(CROWD_SETS.length, 5);
  assert.equal(new Set(CROWD_SETS.map((set) => set.textureKey)).size, 5);
  assert.equal(new Set(CROWD_SETS.map((set) => set.assetPath)).size, 5);

  CROWD_SETS.forEach((set) => {
    const path = new URL(`../public/${set.assetPath}`, import.meta.url);
    assert.deepEqual(pngDimensions(path), {
      width: CROWD_PANORAMA.frameWidth * CROWD_PANORAMA.frameCount,
      height: CROWD_PANORAMA.frameHeight,
      colorType: 6
    });
  });
});

test('all generated crowd sets have transparent keys and no visible magenta', () => {
  CROWD_SETS.forEach((set) => {
    const path = new URL(`../public/${set.assetPath}`, import.meta.url);
    const raw = rgbaPixels(path);
    const width = CROWD_PANORAMA.frameWidth * CROWD_PANORAMA.frameCount;
    const stride = width * 4 + 1;
    for (let y = 0; y < CROWD_PANORAMA.frameHeight; y++) {
      assert.equal(raw[y * stride], 0);
      for (let x = 0; x < width; x++) {
        const i = y * stride + 1 + x * 4;
        const [r, g, b, a] = raw.subarray(i, i + 4);
        if (a === 0) {
          assert.deepEqual([r, g, b], [0, 0, 0]);
        } else {
          const visibleMagenta = r >= 128 && b >= 128 && g <= 96
            && r - g >= 80 && b - g >= 80 && Math.abs(r - b) <= 72;
          assert.equal(visibleMagenta, false, `${set.textureKey} has chroma at ${x},${y}`);
        }
      }
    }
  });
});

test('five crowd sections cover the stand with exact integer edges', () => {
  const positions = getCrowdTilePositions(480);
  assert.deepEqual(positions, [0, 96, 192, 288, 384]);
  assert.equal(positions.every(Number.isInteger), true);
  for (let i = 0; i < positions.length - 1; i++) {
    assert.equal(positions[i] + CROWD_PANORAMA.tileWidth, positions[i + 1]);
  }
  assert.equal(positions.at(-1) + CROWD_PANORAMA.tileWidth, 480);
});

test('ambient and goal animation frames stay inside every five-frame atlas', () => {
  const frames = [...CROWD_MOTION.ambientFrames, ...CROWD_MOTION.goalFrames];
  assert.equal(frames.every(Number.isInteger), true);
  assert.equal(Math.min(...frames), 0);
  assert.equal(Math.max(...frames), CROWD_PANORAMA.frameCount - 1);
  assert.deepEqual([...new Set(CROWD_MOTION.goalFrames)].sort(), [0, 1, 2, 3, 4]);
});
