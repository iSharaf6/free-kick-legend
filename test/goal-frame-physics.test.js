import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGoalPlane,
  classifyReboundPosition,
  reboundFromGoalFrame,
  sweepGoalFrame
} from '../src/systems/GoalFramePhysics.js';
import { Ball } from '../src/objects/Ball.js';

const dimensions = { goalWidth: 9, goalHeight: 3.1, postRadius: 0.13, ballRadius: 0.26 };
const close = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);
};

test('goal frame classification separates clean goals, posts and crossbar', () => {
  assert.equal(classifyGoalPlane({ x: 0, y: 1.4 }, dimensions).inFrame, true);
  assert.equal(classifyGoalPlane({ x: 4.35, y: 1.4 }, dimensions).frame, 'post');
  assert.equal(classifyGoalPlane({ x: 0, y: 2.86 }, dimensions).frame, 'crossbar');
});

test('inside post glances can retain forward speed and bend into the goal', () => {
  const ball = { x: 4.2, y: 1.2, z: 20, vx: 2, vy: 0.5, vz: 24, spin: 0.5, prev: { x: 4.1, y: 1.2, z: 19.9 } };
  const contact = classifyGoalPlane({ x: 4.2, y: 1.2 }, dimensions);
  reboundFromGoalFrame(ball, { x: 4.2, y: 1.2 }, contact, 20);
  assert.ok(ball.vx < 0, 'right post should deflect the ball inward');
  assert.ok(ball.vz > 0, 'a glancing impact may continue into the goal');
});

test('central crossbar hits rebound backward and downward', () => {
  const ball = { x: 0, y: 2.98, z: 20, vx: 0, vy: 2, vz: 22, spin: 0, prev: { x: 0, y: 2.9, z: 19.9 } };
  const contact = classifyGoalPlane({ x: 0, y: 2.98 }, dimensions);
  reboundFromGoalFrame(ball, { x: 0, y: 2.98 }, contact, 20);
  assert.ok(ball.vz < 0);
  assert.ok(ball.vy < 2);
});

test('representative post and crossbar hits retain an arcade-readable energy band', () => {
  const cases = [
    {
      ball: { x: 4.2, y: 1.2, z: 20, vx: 2, vy: 0.5, vz: 24, spin: 0.4, prev: { x: 4.1, y: 1.2, z: 19.9 } },
      point: { x: 4.2, y: 1.2 }
    },
    {
      ball: { x: 0, y: 2.98, z: 20, vx: 0, vy: 2, vz: 22, spin: 0, prev: { x: 0, y: 2.9, z: 19.9 } },
      point: { x: 0, y: 2.98 }
    }
  ];

  for (const sample of cases) {
    const result = reboundFromGoalFrame(
      sample.ball,
      sample.point,
      classifyGoalPlane(sample.point, dimensions),
      20
    );
    const retainedSpeed = result.speed / result.incomingSpeed;
    assert.ok(retainedSpeed >= 0.35 && retainedSpeed <= 0.65,
      `frame retained ${(retainedSpeed * 100).toFixed(1)}% of speed`);
  }
});

test('mirrored post glances transfer mirrored spin without adding energy', () => {
  const right = { x: 4.3, y: 1.2, z: 20, vx: 1, vy: 0.5, vz: 24, spin: 0, prev: { x: 4.2, y: 1.2, z: 19.9 } };
  const left = { x: -4.3, y: 1.2, z: 20, vx: -1, vy: 0.5, vz: 24, spin: 0, prev: { x: -4.2, y: 1.2, z: 19.9 } };
  const rightResult = reboundFromGoalFrame(right, { x: 4.3, y: 1.2 }, classifyGoalPlane(right, dimensions), 20);
  const leftResult = reboundFromGoalFrame(left, { x: -4.3, y: 1.2 }, classifyGoalPlane(left, dimensions), 20);

  close(right.vx, -left.vx);
  close(right.vy, left.vy);
  close(right.vz, left.vz);
  close(right.spin, -left.spin);
  assert.ok(rightResult.energyRatio < 1 && leftResult.energyRatio < 1);
});

test('swept post contact is detected before the ball centre reaches the goal plane', () => {
  const ball = {
    prev: { x: 4.3, y: 1.2, z: 19.5 },
    x: 4.3,
    y: 1.2,
    z: 19.8
  };
  const hit = sweepGoalFrame(ball, 20, dimensions);
  assert.equal(hit?.contact.frame, 'post');
  assert.ok(hit.point.z < 20);
});

// Regression: a ball that clipped the inside of a post and continued into the
// goal was never scored. reboundFromGoalFrame leaves both `z` and `prev.z`
// behind the goal line, which permanently disables Ball.crossed(zGoal), so the
// goal-line test never fired again and the ball flew on through the netting.
test('an in-off-the-post rebound is recognised as a goal at the moment of contact', () => {
  const zGoal = 20;
  const ball = new Ball();
  ball.setGoalBounds(dimensions.goalWidth, dimensions.goalHeight);
  // Travelling forward, just past the plane, grazing the inside of the right post.
  Object.assign(ball, { x: 4.3, y: 1.2, z: 20.05, vx: -1, vy: 0.4, vz: 22, spin: 0, flying: true });
  ball.prev = { x: 4.32, y: 1.15, z: 19.9 };

  const point = { x: 4.3, y: 1.2, z: 20.05 };
  const contact = classifyGoalPlane(point, dimensions);
  assert.equal(contact.frame, 'post');
  reboundFromGoalFrame(ball, point, contact, zGoal);

  assert.ok(ball.z > zGoal, 'the rebound leaves the ball behind the goal line');
  assert.equal(ball.crossed(zGoal), false, 'crossed() is dead once prev is also behind the line');
  assert.equal(classifyReboundPosition(ball, zGoal, dimensions), 'goal');
});

test('an outside-post rebound behind the line is not a goal', () => {
  const zGoal = 20;
  const ball = new Ball();
  ball.setGoalBounds(dimensions.goalWidth, dimensions.goalHeight);
  Object.assign(ball, { x: 4.7, y: 1.2, z: 20.05, vx: 1, vy: 0.4, vz: 18, spin: 0, flying: true });
  ball.prev = { x: 4.68, y: 1.15, z: 19.9 };

  const point = { x: 4.7, y: 1.2, z: 20.05 };
  const contact = classifyGoalPlane(point, dimensions);
  reboundFromGoalFrame(ball, point, contact, zGoal);
  assert.equal(classifyReboundPosition(ball, zGoal, dimensions), 'behind');
});

test('an over-the-bar rebound behind the line is not a goal', () => {
  const zGoal = 20;
  const ball = { x: 0, y: 3.15, z: 20.05, vx: 0, vy: 1, vz: 20, spin: 0, prev: { x: 0, y: 3.1, z: 19.9 } };
  const point = { x: 0, y: 3.15, z: 20.05 };
  reboundFromGoalFrame(ball, point, classifyGoalPlane(point, dimensions), zGoal);
  assert.equal(classifyReboundPosition(ball, zGoal, dimensions), 'behind');
});

test('a ball still in front of the goal line is left to the ordinary crossing test', () => {
  const ball = { x: 0, y: 1.2, z: 19.4 };
  assert.equal(classifyReboundPosition(ball, 20, dimensions), null);
});
