import assert from 'node:assert/strict';
import test from 'node:test';

import { CAM, GAME_W, configureApproachCamera, project } from '../src/config.js';
import {
  buildPitchMarkingLayout,
  PITCH_MARKING_DIMENSIONS
} from '../src/art/PitchMarkings.js';

const longitudinal = (marking) => marking.from.x === marking.to.x;

function xAtY(a, b, y) {
  const t = (y - a.y) / (b.y - a.y);
  return a.x + (b.x - a.x) * t;
}

test('every box side converges on the camera vanishing point', () => {
  const originalCameraX = CAM.x;
  CAM.x = 3.4;
  try {
    const layout = buildPitchMarkingLayout(24);
    const sides = layout.straight.filter(longitudinal);
    assert.equal(sides.length, 4);

    for (const side of sides) {
      const a = project(side.from.x, 0, side.from.z);
      const b = project(side.to.x, 0, side.to.z);
      assert.ok(
        Math.abs(xAtY(a, b, CAM.horizonY) - GAME_W / 2) < 1e-9,
        `${side.id} misses the shared vanishing point`
      );
    }
  } finally {
    CAM.x = originalCameraX;
  }
});

test('goal-area markings form a plausible nested box around the goal', () => {
  const d = PITCH_MARKING_DIMENSIONS;
  assert.ok(d.fieldHalfWidth > d.penaltyAreaHalfWidth);
  assert.ok(d.penaltyAreaHalfWidth > d.goalAreaHalfWidth);
  assert.ok(d.goalAreaHalfWidth > 9.4 / 2, 'goal-area sides must sit outside the posts');
  assert.ok(d.penaltyAreaDepth > d.goalAreaDepth);

  const layout = buildPitchMarkingLayout(24);
  assert.equal(layout.penaltyFrontZ, 24 - d.penaltyAreaDepth);
  assert.equal(layout.goalAreaFrontZ, 24 - d.goalAreaDepth);
});

test('side free kicks use one yawed approach camera through ball and goal', () => {
  const original = { x: CAM.x, yaw: CAM.yaw };
  try {
    const goalZ = CAM.ballDist + 18;
    configureApproachCamera(5.5, goalZ);
    const ball = project(5.5, 0, CAM.ballDist);
    const goal = project(0, 0, goalZ);

    assert.ok(Math.abs(ball.x - GAME_W / 2) < 1e-9, 'ball stays on the optical axis');
    assert.ok(Math.abs(goal.x - GAME_W / 2) < 1e-9, 'goal stays on the same optical axis');
    assert.ok(CAM.yaw < 0, 'camera turns back toward goal from the right side');
  } finally {
    CAM.x = original.x;
    CAM.yaw = original.yaw;
  }
});
