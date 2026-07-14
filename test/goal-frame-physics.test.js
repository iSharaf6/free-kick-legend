import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGoalPlane, reboundFromGoalFrame, sweepGoalFrame } from '../src/systems/GoalFramePhysics.js';

const dimensions = { goalWidth: 9, goalHeight: 3.1, postRadius: 0.13, ballRadius: 0.26 };

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
