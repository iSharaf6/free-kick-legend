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
