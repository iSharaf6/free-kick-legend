import test from 'node:test';
import assert from 'node:assert/strict';

import { Ball } from '../src/objects/Ball.js';
import { Goalkeeper } from '../src/objects/Goalkeeper.js';
import { Wall } from '../src/objects/Wall.js';
import { BALL_R, CAM, PHYS, project } from '../src/config.js';

function spriteStub() {
  const sprite = { calls: {}, destroy() {} };
  for (const method of ['setTexture', 'setOrigin', 'setFlipX', 'setPosition', 'setScale', 'setDepth']) {
    sprite[method] = (...args) => {
      sprite.calls[method] = args;
      return sprite;
    };
  }
  return sprite;
}

function sceneStub(textures = []) {
  return {
    textures: { exists: (key) => textures.includes(key) },
    add: { sprite: () => spriteStub() }
  };
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

test('clear left and right shots cannot produce opposite-facing dive reads', () => {
  const goalZ = CAM.ballDist + 17;
  const keeper = new Goalkeeper(sceneStub(), 0.1, goalZ, { rng: () => 1 });
  const leftShot = {
    z: 0,
    vz: 24,
    spin: 0,
    predictAt: () => ({ x: -1.2, y: 1.1, T: 0.7 })
  };
  keeper.onShot(leftShot, goalZ);
  assert.equal(keeper.diveDir, -1);
  assert.ok(keeper.targetX < 0);

  keeper.reset();
  const rightShot = {
    ...leftShot,
    predictAt: () => ({ x: 1.2, y: 1.1, T: 0.7 })
  };
  keeper.onShot(rightShot, goalZ);
  assert.equal(keeper.diveDir, 1);
  assert.ok(keeper.targetX > 0);
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
  keeper.diveHandY = 0.95;
  assert.equal(keeper.contact({ x: 0.8, y: 2.3 }), false, 'future hand position is not active early');

  keeper.diveP = 1;
  keeper.diveHandY = 2.3;
  const contact = keeper.contact({ x: 0.8, y: 2.3 });
  assert.ok(contact);
  assert.equal(contact.part, 'hands');
  assert.equal(contact.result, 'catch');
});

test('standing save envelope matches the visible body instead of covering a metre-wide lane', () => {
  const keeper = new Goalkeeper(sceneStub(), 0.7, CAM.ballDist + 17, { seed: 9 });
  assert.ok(keeper.contact({ x: 0.62, y: 1.15 }), 'near glove contact remains reachable');
  assert.equal(
    keeper.contact({ x: 0.82, y: 1.15 }),
    false,
    'a visibly wide shot must pass the planted keeper'
  );
});

test('keeper advances through read, set and dive states', () => {
  const goalZ = CAM.ballDist + 17;
  const ball = new Ball();
  ball.kick(1.6, 6, 27, 0);
  const keeper = new Goalkeeper(sceneStub(), 0.6, goalZ, { seed: 2 });
  keeper.onShot(ball, goalZ);
  assert.equal(keeper.state, 'read');

  const duration = keeper.reactT + keeper.setT + PHYS.fixedStep * 3;
  for (let elapsed = 0; elapsed < duration; elapsed += PHYS.fixedStep) keeper.update(PHYS.fixedStep);
  assert.equal(keeper.state, 'dive');
  assert.ok(keeper.diveP > 0);
});

test('keeper maps simulation phases and screen direction to authored animation frames', () => {
  const keeper = new Goalkeeper(sceneStub(), 0.6, CAM.ballDist + 17, { seed: 4 });

  keeper.pose = 'dive';
  keeper.state = 'dive';
  keeper.diveDir = -1;
  keeper.diveP = 0.1;
  assert.equal(keeper.getAnimationFrame(), 10);
  keeper.diveP = 0.25;
  assert.equal(keeper.getAnimationFrame(), 11);
  keeper.diveP = 0.5;
  assert.equal(keeper.getAnimationFrame(), 12);
  keeper.diveP = 0.9;
  assert.equal(keeper.getAnimationFrame(), 13);

  keeper.diveDir = 1;
  keeper.state = 'dive';
  keeper.diveP = 0.1;
  assert.equal(keeper.getAnimationFrame(), 5);
  keeper.state = 'land';
  keeper.grounded = false;
  assert.equal(keeper.getAnimationFrame(), 8, 'full stretch remains active during descent');
  keeper.grounded = true;
  assert.equal(keeper.getAnimationFrame(), 9);

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

test('keeper recovery adds six grounded phases per screen direction', () => {
  const keeper = new Goalkeeper(sceneStub(), 0.6, CAM.ballDist + 17, { seed: 4 });
  keeper.state = 'land';
  keeper.grounded = true;
  keeper.diveDir = 1;

  for (const [time, frame] of [[0, 0], [0.2, 1], [0.36, 2], [0.5, 3], [0.66, 4], [0.84, 5]]) {
    keeper.stateT = time;
    assert.equal(keeper.getRecoveryFrame(), frame);
  }

  keeper.diveDir = -1;
  keeper.stateT = 0;
  assert.equal(keeper.getRecoveryFrame(), 6);
  keeper.stateT = 0.84;
  assert.equal(keeper.getRecoveryFrame(), 11);
});

test('expanded dive atlas maps twelve phases to each screen direction without flipping', () => {
  const keeper = new Goalkeeper(
    sceneStub(['keeper-anim-hd', 'keeper-dive-motion-hd']),
    0.7,
    CAM.ballDist + 17,
    { seed: 14 }
  );
  keeper.pose = 'dive';
  keeper.state = 'dive';

  keeper.diveDir = 1;
  keeper.diveP = 0.05;
  assert.equal(keeper.getDiveMotionFrame(), 5);
  keeper.diveP = 0.52;
  assert.equal(keeper.getDiveMotionFrame(), 8);
  keeper.diveP = 0.9;
  assert.equal(keeper.getDiveMotionFrame(), 10);

  keeper.diveDir = -1;
  keeper.diveP = 0.05;
  assert.equal(keeper.getDiveMotionFrame(), 17);
  keeper.diveP = 0.52;
  assert.equal(keeper.getDiveMotionFrame(), 20);
  keeper.diveP = 0.9;
  assert.equal(keeper.getDiveMotionFrame(), 22);
  keeper.draw();
  assert.deepEqual(keeper.spr.calls.setTexture, ['keeper-dive-motion-hd', 22]);
  assert.deepEqual(keeper.spr.calls.setFlipX, [false]);
});

test('low shots select the dedicated low-save atlas while higher dives keep the full-stretch sheet', () => {
  const keeper = new Goalkeeper(
    sceneStub(['keeper-dive-motion-hd', 'keeper-low-save-hd']),
    0.7,
    CAM.ballDist + 17,
    { seed: 14 }
  );
  keeper.pose = 'dive';
  keeper.state = 'dive';
  keeper.diveDir = 1;
  keeper.diveP = 0.52;
  keeper.targetY = 0.72;
  keeper.standingSave = false;
  keeper.draw();
  assert.deepEqual(keeper.spr.calls.setTexture, ['keeper-low-save-hd', 6]);

  keeper.targetY = 1.8;
  keeper.draw();
  assert.deepEqual(keeper.spr.calls.setTexture, ['keeper-dive-motion-hd', 8]);
});

test('keeper times the authored contact phase to the ball crossing', () => {
  const goalZ = CAM.ballDist + 17;
  const ball = new Ball();
  ball.kick(0.8, 6.2, 25, 0.2);
  const crossing = ball.predictAt(goalZ - 0.4).T;
  const keeper = new Goalkeeper(sceneStub(), 0.72, goalZ, { seed: 21 });
  keeper.onShot(ball, goalZ);

  const scheduledContact = keeper.reactT + keeper.setT + keeper.diveDuration * 0.68;
  assert.ok(Math.abs(scheduledContact - crossing) < 0.025);
});

test('central shots stay planted and flow into height-specific handling', () => {
  const goalZ = CAM.ballDist + 17;
  const centralShot = {
    z: 0,
    vz: 20,
    spin: 0,
    predictAt: () => ({ x: 0.08, y: 1.9, T: 0.72 })
  };
  const keeper = new Goalkeeper(
    sceneStub(['keeper-dive-motion-hd', 'keeper-high-claim-hd']),
    0.75,
    goalZ,
    { seed: 25 }
  );
  keeper.onShot(centralShot, goalZ);
  assert.equal(keeper.standingSave, true);

  for (let elapsed = 0; elapsed < 0.76; elapsed += PHYS.fixedStep) keeper.update(PHYS.fixedStep);
  assert.equal(keeper.state, 'set', 'central keeper remains loaded instead of diving past the ball');
  const contact = keeper.contact({ x: 0.08, y: 1.9 }, { vx: 0, vy: 2, vz: 18 });
  assert.ok(contact);
  assert.equal(contact.result, 'catch');
  keeper.catchBall({ x: 0.08, y: 1.9 });
  assert.equal(keeper.catchType, 'high');
  keeper.stateT = keeper.catchDuration * 0.9;
  keeper.draw();
  assert.deepEqual(keeper.spr.calls.setTexture, ['keeper-high-claim-hd', 4]);
});

test('dive root remains continuous through contact, descent and grounded impact', () => {
  const goalZ = CAM.ballDist + 17;
  const ball = new Ball();
  ball.kick(1.4, 6.8, 26, 0.15);
  const keeper = new Goalkeeper(sceneStub(['keeper-dive-motion-hd']), 0.76, goalZ, { seed: 8 });
  keeper.onShot(ball, goalZ);

  let lastX = keeper.x;
  let maxStep = 0;
  let sawAirborneLand = false;
  let sawGrounded = false;
  for (let elapsed = 0; elapsed < 2.2; elapsed += 1 / 120) {
    keeper.update(1 / 120);
    maxStep = Math.max(maxStep, Math.abs(keeper.x - lastX));
    lastX = keeper.x;
    if (keeper.state === 'land' && !keeper.grounded) sawAirborneLand = true;
    if (keeper.state === 'land' && keeper.grounded) {
      sawGrounded = true;
      assert.equal(keeper.landY, 0);
      break;
    }
  }
  assert.equal(sawAirborneLand, true);
  assert.equal(sawGrounded, true);
  assert.ok(maxStep < 0.08, `root step ${maxStep} should remain visually continuous`);
});

test('footwork and handling atlases animate both travel and catch follow-through', () => {
  const keeper = new Goalkeeper(
    sceneStub(['keeper-footwork-hd', 'keeper-handling-hd', 'keeper-high-claim-hd']),
    0.7,
    CAM.ballDist + 17,
    { seed: 19 }
  );
  keeper.state = 'return';
  keeper.x = 1.2;
  keeper.moveVx = -1;
  keeper.footworkDistance = 0.23;
  assert.equal(keeper.getFootworkFrame(), 2);
  keeper.moveVx = 1;
  assert.equal(keeper.getFootworkFrame(), 7);

  keeper.state = 'idle';
  keeper.catchBall({ x: 0.05, y: 0.55 });
  assert.equal(keeper.catchType, 'low');
  assert.equal(keeper.getHandlingFrame(), 0);
  keeper.stateT = keeper.catchDuration * 0.9;
  assert.equal(keeper.getHandlingFrame(), 3);

  keeper.reset();
  keeper.catchBall({ x: 0, y: 1.9 });
  assert.equal(keeper.catchType, 'high');
  keeper.stateT = keeper.catchDuration * 0.9;
  assert.equal(keeper.getHandlingFrame(), 4);
  keeper.draw();
  assert.deepEqual(keeper.spr.calls.setTexture, ['keeper-high-claim-hd', 4]);
});

test('return-to-centre motion uses directional frames and settles without overshoot', () => {
  const keeper = new Goalkeeper(
    sceneStub(['keeper-anim-hd', 'keeper-return-hd']),
    0.7,
    CAM.ballDist + 17,
    { seed: 31 }
  );
  keeper.state = 'return';
  keeper.pose = 'idle';
  keeper.x = 1.4;
  keeper.moveVx = 0;

  let previousX = keeper.x;
  let minimumX = keeper.x;
  for (let elapsed = 0; elapsed < 2; elapsed += PHYS.fixedStep) {
    keeper.update(PHYS.fixedStep);
    minimumX = Math.min(minimumX, keeper.x);
    assert.ok(keeper.x <= previousX + 1e-10, 'screen-left return remains monotonic');
    previousX = keeper.x;
    if (keeper.state === 'idle') break;
  }

  assert.equal(keeper.state, 'idle');
  assert.equal(keeper.x, 0);
  assert.equal(keeper.moveVx, 0);
  assert.ok(minimumX >= 0, 'keeper never crosses to the opposite side');

  keeper.state = 'return';
  keeper.stateT = 0.3;
  keeper.x = -1;
  keeper.moveVx = 1;
  keeper.footworkDistance = 0.22;
  assert.ok(keeper.getReturnFrame() >= 9, 'screen-right travel uses the second authored row');
  keeper.draw();
  assert.equal(keeper.spr.calls.setTexture[0], 'keeper-return-hd');
});

test('grounded keeper recovery is bottom-anchored to the pitch', () => {
  const keeper = new Goalkeeper(
    sceneStub(['keeper-anim-hd', 'keeper-recovery-hd']),
    0.6,
    CAM.ballDist + 17,
    { seed: 4 }
  );

  keeper.pose = 'dive';
  keeper.state = 'land';
  keeper.grounded = false;
  keeper.landY = 1.1;
  keeper.draw();
  assert.deepEqual(keeper.spr.calls.setOrigin, [0.5, 0.5]);
  assert.deepEqual(keeper.spr.calls.setTexture, ['keeper-anim-hd', 8]);

  keeper.grounded = true;
  keeper.stateT = 0;
  keeper.draw();
  const pitch = project(keeper.x, 0, keeper.z);
  assert.deepEqual(keeper.spr.calls.setOrigin, [0.5, 1]);
  assert.deepEqual(keeper.spr.calls.setTexture, ['keeper-recovery-hd', 0]);
  assert.deepEqual(keeper.spr.calls.setPosition, [pitch.x, pitch.y]);
});

test('save result hold covers landing, six recovery phases and return to position', () => {
  const keeper = new Goalkeeper(
    sceneStub(['keeper-anim-hd', 'keeper-recovery-hd']),
    0.7,
    CAM.ballDist + 17,
    { seed: 4 }
  );
  keeper.pose = 'dive';
  keeper.state = 'land';
  keeper.grounded = false;
  keeper.landY = 2.1;
  keeper.landVy = 0;
  keeper.x = 1.8;
  keeper.moveTargetX = 1.8;
  keeper.moveVx = 0;

  const holdMs = keeper.getResultHoldMs();
  assert.ok(holdMs > 1500, 'a high save is held longer than the old fixed reset');

  for (let elapsed = 0; elapsed < holdMs / 1000; elapsed += PHYS.fixedStep) {
    keeper.update(PHYS.fixedStep);
  }
  assert.equal(keeper.state, 'idle');
  assert.ok(Math.abs(keeper.x) <= 0.06);
});

test('standing parry follows the real contact direction and begins a full recovery', () => {
  const keeper = new Goalkeeper(sceneStub(), 0.7, CAM.ballDist + 17, { seed: 4 });
  keeper.state = 'read';
  keeper.pose = 'ready';
  keeper.x = 0;
  keeper.diveDir = 1;

  keeper.impact({ x: -0.55, y: 1.1 }, { vx: -2, vy: 3, vz: 20 });

  assert.equal(keeper.state, 'dive');
  assert.equal(keeper.pose, 'dive');
  assert.equal(keeper.diveDir, -1);
  assert.ok(keeper.moveVx < 0);
  assert.ok(keeper.getResultHoldMs() > 1000);
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
