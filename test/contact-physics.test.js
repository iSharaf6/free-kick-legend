import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyArcadeDeflection,
  resolveBoardDeflection,
  resolveKeeperParry,
  resolveWallDeflection
} from '../src/systems/ContactPhysics.js';

const close = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);
};

const shot = (overrides = {}) => ({
  vx: 0,
  vy: 4,
  vz: 24,
  spin: 0.7,
  grounded: false,
  ...overrides
});

test('the shared response separates normal bounce from glancing tangent', () => {
  const square = shot();
  const glance = shot({ vx: 7 });
  applyArcadeDeflection(square, { restitution: 0.25, tangentRetention: 0.5 });
  applyArcadeDeflection(glance, { restitution: 0.25, tangentRetention: 0.5 });

  assert.ok(square.vz < 0);
  close(square.vx, 0);
  assert.ok(glance.vx > 3, 'a glancing strike should retain readable sideways pace');
  assert.ok(Math.hypot(glance.vx, glance.vy, glance.vz) < Math.hypot(7, 4, 24));
});

test('wall edge hits deflect away from the body while square hits come back centrally', () => {
  const player = { x: 0, halfWidth: 0.35, footY: 0, headY: 1.9, jumpY: 0, deflectorDir: 1 };
  const centre = shot();
  const rightEdge = shot({ spin: 0 });
  resolveWallDeflection(centre, { part: 'body', player }, { x: 0, y: 1 });
  resolveWallDeflection(rightEdge, { part: 'body', player }, { x: 0.48, y: 1 });

  assert.ok(centre.vz < 0 && rightEdge.vz < 0);
  assert.ok(rightEdge.vx > centre.vx + 2, 'edge geometry should author the rebound direction');
  assert.ok(Math.abs(rightEdge.spin) > 0.05, 'a glancing block should leave visible spin');
});

test('keeper parries mirror exactly and never add energy', () => {
  const contact = { part: 'hands', distance: 0.42, normalX: 0.35, normalY: 0.1 };
  const right = shot({ vx: 2, spin: 0.6 });
  const left = shot({ vx: -2, spin: -0.6 });
  const keeperRight = { x: 0, diveDir: 1, skill: 0.7 };
  const keeperLeft = { x: 0, diveDir: -1, skill: 0.7 };

  const before = Math.hypot(right.vx, right.vy, right.vz);
  resolveKeeperParry(right, contact, keeperRight, { x: 1, y: 1.4 });
  resolveKeeperParry(left, { ...contact, normalX: -contact.normalX }, keeperLeft, { x: -1, y: 1.4 });

  close(right.vx, -left.vx);
  close(right.vy, left.vy);
  close(right.vz, left.vz);
  close(right.spin, -left.spin);
  assert.ok(right.vz < 0);
  assert.ok(Math.hypot(right.vx, right.vy, right.vz) < before);
});

test('mirrored leg blocks preserve equal pace, lift and spin', () => {
  const right = shot({ vx: 2, spin: 0.7 });
  const left = shot({ vx: -2, spin: -0.7 });
  const player = {
    x: 0,
    halfWidth: 0.35,
    footY: 0,
    headY: 1.9,
    jumpY: 0
  };

  resolveWallDeflection(right, {
    part: 'leg',
    player: { ...player, deflectorDir: 1 }
  }, { x: 0.4, y: 0.4 });
  resolveWallDeflection(left, {
    part: 'leg',
    player: { ...player, deflectorDir: -1 }
  }, { x: -0.4, y: 0.4 });

  close(right.vx, -left.vx);
  close(right.vy, left.vy);
  close(right.vz, left.vz);
  close(right.spin, -left.spin);
});

test('a fingertip graze redirects less strongly than a torso parry', () => {
  const keeper = { x: 0, diveDir: 1, skill: 0.7 };
  const fingertip = shot({ vx: 2, spin: 0.2 });
  const torso = shot({ vx: 2, spin: 0.2 });
  const tipResponse = resolveKeeperParry(
    fingertip,
    { part: 'hands', distance: 0.72, normalX: 0.5, normalY: 0.2 },
    keeper,
    { x: 1.2, y: 2.1 }
  );
  const bodyResponse = resolveKeeperParry(
    torso,
    { part: 'body', distance: 0.3, normalX: 0.15, normalY: 0 },
    keeper,
    { x: 0.35, y: 1.1 }
  );

  assert.equal(tipResponse.fingertip, true);
  assert.equal(bodyResponse.fingertip, false);
  assert.ok(bodyResponse.outgoingSpeed > tipResponse.outgoingSpeed * 1.18,
    `body ${bodyResponse.outgoingSpeed} should beat fingertip ${tipResponse.outgoingSpeed}`);
  assert.ok(Math.abs(fingertip.vz) < Math.abs(torso.vz), 'the fingertip return should be shallower');
});

test('weak wall, keeper and board contacts cannot create linear energy', () => {
  const incoming = { vx: 0.12, vy: 0.05, vz: 0.72, spin: 0.2, grounded: false };
  const before = Math.hypot(incoming.vx, incoming.vy, incoming.vz);
  const cases = [
    () => {
      const ball = { ...incoming };
      resolveWallDeflection(ball, {
        part: 'body',
        player: { x: 0, halfWidth: 0.35, footY: 0, headY: 1.9, jumpY: 0 }
      }, { x: 0.2, y: 1 });
      return ball;
    },
    () => {
      const ball = { ...incoming };
      resolveKeeperParry(ball, {
        part: 'body', distance: 0.25, normalX: 0.2, normalY: 0
      }, { x: 0, diveDir: 1, skill: 1 }, { x: 0.2, y: 1 });
      return ball;
    },
    () => {
      const ball = { ...incoming };
      resolveBoardDeflection(ball, { y: 0.2 }, { boardHeight: 1.5 });
      return ball;
    }
  ];

  for (const makeContact of cases) {
    const ball = makeContact();
    assert.ok(Math.hypot(ball.vx, ball.vy, ball.vz) <= before + 1e-10);
    assert.ok(ball.vz < 0, 'the contact still returns the weak ball');
  }
});

test('wall, keeper and board responses stay finite and energy-bounded across shot speeds', () => {
  for (const speed of [0.1, 1, 4, 12, 24, 35]) {
    const vx = speed * 0.2;
    const vy = speed * 0.1;
    const vz = speed * Math.sqrt(0.95);
    const incoming = { vx, vy, vz, spin: 1.1, grounded: false };
    const before = Math.hypot(vx, vy, vz);
    const cases = [
      (ball) => resolveWallDeflection(ball, {
        part: 'body',
        player: { x: 0, halfWidth: 0.35, footY: 0, headY: 1.9, jumpY: 0 }
      }, { x: 0.32, y: 1.25 }),
      (ball) => resolveKeeperParry(ball, {
        part: 'hands', distance: 0.48, normalX: 0.35, normalY: 0.1
      }, { x: 0, diveDir: 1, skill: 0.72 }, { x: 0.9, y: 1.6 }),
      (ball) => resolveBoardDeflection(ball, { y: 0.45 }, { boardHeight: 1.5 })
    ];

    for (const resolve of cases) {
      const ball = { ...incoming };
      resolve(ball);
      assert.ok([ball.vx, ball.vy, ball.vz, ball.spin].every(Number.isFinite));
      assert.ok(Math.hypot(ball.vx, ball.vy, ball.vz) <= before + 1e-10,
        `${speed}m/s contact created linear energy`);
      assert.ok(ball.vz < 0, `${speed}m/s contact did not separate toward the pitch`);
    }
  }
});

test('the hoarding is a damped backstop with a firmer low-panel rebound', () => {
  const low = shot({ vx: 5, vy: -1, vz: 22 });
  const high = shot({ vx: 5, vy: -1, vz: 22 });
  resolveBoardDeflection(low, { y: 0.2 }, { boardHeight: 1.5 });
  resolveBoardDeflection(high, { y: 1.4 }, { boardHeight: 1.5 });

  assert.ok(low.vz < high.vz, 'the rigid base should send the ball back harder than the flexible top');
  assert.ok(Math.abs(low.vx) < 5 && Math.abs(high.vx) < 5);
  assert.ok(Number.isFinite(low.spin) && Number.isFinite(high.spin));
});
