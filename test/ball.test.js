import test from 'node:test';
import assert from 'node:assert/strict';

import { Ball } from '../src/objects/Ball.js';
import { BALL_R, CAM, GOAL_H, GOAL_W, PHYS } from '../src/config.js';

function simulateAtFps(fps, seconds, setup) {
  const ball = new Ball();
  setup(ball);
  for (let frame = 0; frame < fps * seconds; frame++) ball.update(1 / fps);
  return ball;
}

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test('trajectory and grounded rolling are invariant at common render rates', () => {
  const setup = (ball) => ball.kick(1.4, 2, 19.5, 0.65);
  const baseline = simulateAtFps(120, 2, setup);

  for (const fps of [20, 30, 60]) {
    const ball = simulateAtFps(fps, 2, setup);
    close(ball.x, baseline.x);
    close(ball.y, baseline.y);
    close(ball.z, baseline.z);
    close(ball.vx, baseline.vx);
    close(ball.vz, baseline.vz);
    assert.equal(ball.grounded, baseline.grounded);
  }
});

test('a grounded ball applies rolling resistance once per second, not once per frame', () => {
  for (const fps of [30, 60, 120]) {
    const ball = simulateAtFps(fps, 1, (candidate) => candidate.kick(0, 0, 10, 0));
    close(ball.vz, 10 * Math.exp(-PHYS.rollingDrag), 1e-10);
    close(ball.y, BALL_R);
    assert.equal(ball.vy, 0);
    assert.equal(ball.grounded, true);
  }
});

test('an external parry impulse lifts a previously grounded ball', () => {
  const ball = new Ball();
  ball.kick(0, 0, 8, 0);
  ball.step();
  assert.equal(ball.grounded, true);

  ball.vy = 3;
  ball.step();
  assert.equal(ball.grounded, false);
  assert.ok(ball.y > BALL_R);
  assert.ok(ball.vy > 0);
});

test('predictAt uses the live solver and matches the actual crossing', () => {
  const plane = CAM.ballDist + 19;
  const ball = new Ball();
  ball.setWind({ x: 0.5, y: 0, z: -0.1 });
  ball.kick(1.8, 7.2, 27, 0.8);

  const predicted = ball.predictAt(plane);
  assert.equal(predicted.reached, true);

  let elapsed = 0;
  let actual = null;
  while (elapsed < 5 && ball.flying) {
    const startZ = ball.z;
    ball.step(PHYS.fixedStep);
    if (ball.crossed(plane)) {
      const fraction = (plane - startZ) / (ball.z - startZ);
      actual = {
        ...ball.pointAt(plane),
        T: elapsed + PHYS.fixedStep * fraction
      };
      break;
    }
    elapsed += PHYS.fixedStep;
  }

  assert.ok(actual, 'ball should reach prediction plane');
  close(predicted.x, actual.x, 1e-10);
  close(predicted.y, actual.y, 1e-10);
  close(predicted.T, actual.T, 1e-10);
});

test('wind and sidespin affect the complete velocity vector deterministically', () => {
  const calm = simulateAtFps(120, 0.75, (ball) => ball.kick(0, 7, 27, 0));
  const windy = simulateAtFps(120, 0.75, (ball) => {
    ball.setWind({ x: 5, y: 0, z: 0 });
    ball.kick(0, 7, 27, 0);
  });
  const rightSpin = simulateAtFps(120, 0.75, (ball) => ball.kick(0, 7, 27, 1));
  const leftSpin = simulateAtFps(120, 0.75, (ball) => ball.kick(0, 7, 27, -1));

  assert.ok(windy.x > calm.x + 0.08, 'crosswind should move the ball laterally');
  assert.ok(rightSpin.x > 1, 'positive sidespin should bend right');
  assert.ok(leftSpin.x < -1, 'negative sidespin should bend left');
  close(rightSpin.x, -leftSpin.x, 1e-10);
});

test('enterNet damps the shot and resolves the back net', () => {
  const ball = new Ball();
  const backZ = CAM.ballDist + 2;
  ball.kick(1, 4, 20, 0.5);
  ball.enterNet(backZ);

  for (let i = 0; i < 120 && ball.z + BALL_R < backZ; i++) ball.step();
  assert.ok(ball.z <= backZ - BALL_R + 1e-9);
  assert.ok(ball.vz <= 0, 'back net should return a soft rebound');
  assert.ok(Math.abs(ball.vz) < 2, 'net rebound should be heavily damped');
});

test('side and roof netting contain scored balls', () => {
  const side = new Ball();
  side.kick(10, 0, 8, 0.4);
  side.enterNet(CAM.ballDist + 5);
  side.x = GOAL_W / 2 - BALL_R - 0.01;
  side.step(1 / 60);
  assert.ok(side.x <= GOAL_W / 2 - BALL_R);
  assert.ok(side.vx <= 0, 'side net must return an outward-moving ball');

  const roof = new Ball();
  roof.kick(0, 8, 8, 0);
  roof.enterNet(CAM.ballDist + 5);
  roof.y = GOAL_H - BALL_R - 0.01;
  roof.step(1 / 60);
  assert.ok(roof.y <= GOAL_H - BALL_R);
  assert.ok(roof.vy <= 0, 'roof net must return an upward-moving ball');
});
