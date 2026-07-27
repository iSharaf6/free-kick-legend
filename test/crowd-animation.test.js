import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { CROWD_ANIMATION } from '../src/data/crowdAnimation.js';

function pngDimensions(path) {
  const header = fs.readFileSync(path).subarray(0, 24);
  assert.equal(header.toString('ascii', 1, 4), 'PNG');
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20)
  };
}

test('crowd atlas has six ambient frames and three goal-jump frames', () => {
  assert.deepEqual(CROWD_ANIMATION.ambientFrames, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(CROWD_ANIMATION.goalFrames, [6, 7, 8]);
  assert.equal(new Set([
    ...CROWD_ANIMATION.ambientFrames,
    ...CROWD_ANIMATION.goalFrames
  ]).size, 9);
});

test('runtime crowd sheet is an exact 3x3 atlas', () => {
  const dimensions = pngDimensions(new URL(
    '../public/assets/hd/crowd-animation-sheet-hd.png',
    import.meta.url
  ));
  assert.deepEqual(dimensions, {
    width: CROWD_ANIMATION.frameWidth * CROWD_ANIMATION.columns,
    height: CROWD_ANIMATION.frameHeight * CROWD_ANIMATION.rows
  });
});
