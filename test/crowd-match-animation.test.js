import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { CROWD_MATCH_ANIMATION } from '../src/data/crowdMatchAnimation.js';

function pngDimensions(path) {
  const header = fs.readFileSync(path).subarray(0, 24);
  assert.equal(header.toString('ascii', 1, 4), 'PNG');
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

test('idle, goal and miss crowds each ship as complete 30-frame pixel atlases', () => {
  assert.equal(CROWD_MATCH_ANIMATION.frameCount, 30);
  for (const motion of ['idle', 'goal', 'out']) {
    const spec = CROWD_MATCH_ANIMATION[motion];
    const dimensions = pngDimensions(new URL(`../public/${spec.assetPath}`, import.meta.url));
    assert.deepEqual(dimensions, {
      width: CROWD_MATCH_ANIMATION.frameWidth * 3,
      height: CROWD_MATCH_ANIMATION.frameHeight * 10
    });
  }
});

test('crowd display preserves the exact authored aspect ratio', () => {
  assert.equal(
    CROWD_MATCH_ANIMATION.frameWidth / CROWD_MATCH_ANIMATION.frameHeight,
    CROWD_MATCH_ANIMATION.displayWidth / CROWD_MATCH_ANIMATION.displayHeight
  );
  assert.equal(CROWD_MATCH_ANIMATION.displayScale, 0.5);
});
