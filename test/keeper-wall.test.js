import test from 'node:test';
import assert from 'node:assert/strict';

import { Ball } from '../src/objects/Ball.js';
import { Goalkeeper } from '../src/objects/Goalkeeper.js';
import { Wall } from '../src/objects/Wall.js';
import { BALL_R, CAM, PHYS } from '../src/config.js';

function spriteStub() {
  const sprite = { destroy() {} };
  for (const method of ['setTexture', 'setOrigin', 'setFlipX', 'setPosition', 'setScale', 'setDepth']) {
    sprite[method] = () => sprite;
  }
  return sprite;
}

function sceneStub() {
  return { add: { sprite: () => spriteStub() } };
}

test('keeper perception is repeatable with a seed', () => {
  const goalZ = CAM.ballDist + 18;
  const ball = new Ball();
  ball.kick(1.2, 6.5, 27, 0.75);

  const first = new Goalkeeper(sceneStub(), 0.55, goalZ, { seed: 12345 });
  const second = new Goalkeeper(sceneStub(), 0.55, goalZ, { seed: 12345 });
  first.onShot(ball, goalZ);
  second.onShot(ball, goalZ);

  assert.equal(first.targetX, second.targetX);
  assert.equal(first.targetY, second.targetY);
  assert.equal(first.reactT, second.reactT);
  assert.equal(first.setT, second.setT);
});

test('keeper contact follows actual dive height and progress', () => {
  const keeper = new Goalkeeper(sceneStub(), 0.7, CAM.ballDist + 17, { seed: 9 });
  assert.equal(keeper.contact({ x: keeper.x, y: 2.8 }), false, 'standing keeper cannot touch top bins');

  keeper.state = 'dive';
  keeper.pose = 'dive';
  keeper.x = 0;
  keeper.diveDir = 1;
  keeper.targetY = 2.3;
  keeper.diveP = 0;
  assert.equal(keeper.contact({ x: 0.8, y: 2.3 }), false, 'future hand position is not active early');

  keeper.diveP = 1;
  const contact = keeper.contact({ x: 0.8, y: 2.3 });
  assert.ok(contact);
  assert.equal(contact.part, 'hands');
  assert.equal(contact.result, 'catch');
});

test('keeper advances through read, set and dive states', () => {
  const goalZ = CAM.ballDist + 17;
  const ball = new Ball();
  ball.kick(0, 6, 27, 0);
  const keeper = new Goalkeeper(sceneStub(), 0.6, goalZ, { seed: 2 });
  keeper.onShot(ball, goalZ);
  assert.equal(keeper.state, 'read');

  const duration = keeper.reactT + keeper.setT + PHYS.fixedStep * 3;
  for (let elapsed = 0; elapsed < duration; elapsed += PHYS.fixedStep) keeper.update(PHYS.fixedStep);
  assert.equal(keeper.state, 'dive');
  assert.ok(keeper.diveP > 0);
});

test('keeper maps simulation phases to authored animation frames', () => {
  const keeper = new Goalkeeper(sceneStub(), 0.6, CAM.ballDist + 17, { seed: 4 });

  keeper.pose = 'dive';
  keeper.state = 'dive';
  keeper.diveDir = -1;
  keeper.diveP = 0.1;
  assert.equal(keeper.getAnimationFrame(), 5);
  keeper.diveP = 0.25;
  assert.equal(keeper.getAnimationFrame(), 6);
  keeper.diveP = 0.5;
  assert.equal(keeper.getAnimationFrame(), 7);
  keeper.diveP = 0.9;
  assert.equal(keeper.getAnimationFrame(), 8);

  keeper.diveDir = 1;
  keeper.state = 'land';
  assert.equal(keeper.getAnimationFrame(), 14);

  keeper.pose = 'catch';
  keeper.state = 'catch';
  keeper.catchY = 0.4;
  assert.equal(keeper.getAnimationFrame(), 15);
  keeper.catchY = 0.8;
  assert.equal(keeper.getAnimationFrame(), 16);
  keeper.catchY = 1.3;
  assert.equal(keeper.getAnimationFrame(), 17);
  keeper.catchY = 2;
  assert.equal(keeper.getAnimationFrame(), 18);
});

test('wall jump variation is deterministic and frame-rate invariant', () => {
  const first = new Wall(sceneStub(), 4, 12, 0);
  const second = new Wall(sceneStub(), 4, 12, 0);
  assert.deepEqual(
    first.players.map((player) => player.jumpSpeed),
    second.players.map((player) => player.jumpSpeed)
  );

  first.jump();
  second.jump();
  for (let i = 0; i < 30; i++) first.update(1 / 30);
  for (let i = 0; i < 120; i++) second.update(1 / 120);

  for (let i = 0; i < first.players.length; i++) {
    assert.ok(Math.abs(first.players[i].jumpY - second.players[i].jumpY) < 1e-10);
    assert.ok(Math.abs(first.players[i].vy - second.players[i].vy) < 1e-10);
  }
});

test('wall collision expands both axes by the ball radius', () => {
  const wall = new Wall(sceneStub(), 1, 12, 0);
  const expandedHalfWidth = wall.players[0].halfWidth + BALL_R;
  assert.equal(wall.blocks({ x: expandedHalfWidth - 0.001, y: BALL_R }), true);
  assert.equal(wall.blocks({ x: expandedHalfWidth + 0.001, y: BALL_R }), false);

  wall.players[0].jumpY = 0.8;
  assert.equal(wall.blocks({ x: 0, y: 0.8 - BALL_R - 0.001 }), false);
  assert.equal(wall.blocks({ x: 0, y: 0.8 - BALL_R + 0.001 }), true);
});
