import test from 'node:test';
import assert from 'node:assert/strict';

import { Wall } from '../src/objects/Wall.js';

function spriteStub() {
  const calls = {
    clearTint: 0,
    destroy: 0,
    setTint: []
  };
  const sprite = {
    calls,
    texture: { source: [{ height: 64 }] }
  };
  for (const method of [
    'setOrigin',
    'setFlipX',
    'setPosition',
    'setScale',
    'setDepth',
    'setRotation'
  ]) {
    sprite[method] = () => sprite;
  }
  sprite.setTint = (value) => {
    calls.setTint.push(value);
    return sprite;
  };
  sprite.clearTint = () => {
    calls.clearTint++;
    return sprite;
  };
  sprite.destroy = () => {
    calls.destroy++;
  };
  return sprite;
}

function sceneStub() {
  return {
    textures: { exists: () => false },
    add: { sprite: () => spriteStub() },
    time: {
      delayedCall() {
        throw new Error('Wall mechanics must not create unmanaged timers');
      }
    }
  };
}

function closeTo(actual, expected, epsilon = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

test('moving and split walls derive poses from absolute elapsed time', () => {
  const moving = new Wall(sceneStub(), 3, 12, 2, {
    config: { type: 'moving', count: 3, range: 1, speed: 1, phase: 0 }
  });
  moving.updateMechanic(Math.PI / 2, 1 / 30);
  closeTo(moving.players[1].x, 3);

  const replay = new Wall(sceneStub(), {
    type: 'moving',
    count: 3,
    range: 1,
    speed: 1,
    phase: 0
  }, 12, 2);
  replay.updateMechanic(Math.PI / 2, 1 / 144);
  assert.deepEqual(replay.getPoseSnapshot(), moving.getPoseSnapshot());

  const split = new Wall(sceneStub(), {
    type: 'split',
    count: 4,
    gapWidth: 1.2,
    gapRange: 0,
    speed: 1
  }, 12, 0);
  split.updateMechanic(20);
  assert.ok(split.players[1].x < -0.6);
  assert.ok(split.players[2].x > 0.6);
});

// Law 13 keeps the wall 9.15m off the ball until the kick is taken. A wall that
// closes that distance is a foul, not a difficulty setting, so no authored type
// may move a defender toward the kicker once the shot is struck.
test('no wall type advances on the kicker after the strike', () => {
  const configs = [
    { type: 'standard', count: 3 },
    { type: 'moving', count: 3, range: 1, speed: 1, phase: 0 },
    { type: 'split', count: 4, gapWidth: 1.2, gapRange: 0.7, speed: 1 },
    { type: 'deflector', count: 3, defenderIndex: 1, extensionChance: 1, extensionReach: 0.65 },
    {
      type: 'double',
      count: 4,
      rows: [
        { count: 2, depthOffset: -0.5, lateralOffset: -0.2 },
        { count: 2, depthOffset: 0.5, lateralOffset: 0.2 }
      ]
    },
    // The retired rushing fields must not resurrect the behaviour by the back
    // door: an unknown type falls back to a standard, stationary wall.
    { type: 'rushing', count: 3, rushDistance: 2.4, rushSpeed: 4, trigger: 'strike' }
  ];

  for (const config of configs) {
    const wall = new Wall(sceneStub(), config, 12, 0);
    const authoredZs = wall.players.map((player) => player.z);
    wall.onStrike({ seed: 8, targetX: 1.5 });

    for (const elapsed of [0.05, 0.5, 1.5, 8]) {
      wall.updateMechanic(elapsed);
      assert.deepEqual(
        wall.players.map((player) => player.z),
        authoredZs,
        `${config.type} wall changed depth ${elapsed}s after the strike`
      );
      closeTo(wall.z, 12);
    }
  }
});

test('a struck wall registers one shot clock and rewinds on reset', () => {
  const wall = new Wall(sceneStub(), 2, 12, 0);

  assert.equal(wall.onStrike({ seed: 8 }), true);
  assert.equal(wall.onStrike({ seed: 9 }), false, 'one kick cannot start a second shot clock');
  wall.updateMechanic(0.5);
  closeTo(wall.strikeElapsed, 0.5);
  assert.deepEqual(wall.getPlaneZs(), [12]);

  assert.equal(wall.reset(), wall);
  assert.equal(wall.struck, false);
  assert.equal(wall.strikeElapsed, 0);
  closeTo(wall.z, 12);
  assert.ok(wall.players.every((player) => player.z === 12));
});

test('double and stagger walls expose independent collision planes', () => {
  const wall = new Wall(sceneStub(), {
    type: 'stagger',
    count: 4,
    rows: [
      { count: 2, depthOffset: -0.5, lateralOffset: -0.2 },
      { count: 2, depthOffset: 0.5, lateralOffset: 0.2 }
    ]
  }, 12, 0);

  assert.equal(wall.style, 'double');
  assert.equal(wall.rowMetadata.length, 2);
  const planes = wall.getCollisionPlanes();
  assert.deepEqual(planes.map((plane) => plane.z), [11.5, 12.5]);
  assert.deepEqual(planes.map((plane) => plane.players.length), [2, 2]);

  const frontPlayer = planes[0].players[0];
  const contact = wall.contactAtZ(
    { x: frontPlayer.x, y: frontPlayer.jumpY + 0.5 },
    planes[0].z
  );
  assert.equal(contact?.row, 0);
  assert.equal(contact?.planeZ, 11.5);
});

test('deflector leg activation and collision are deterministic per shot', () => {
  const config = {
    type: 'deflector',
    count: 3,
    defenderIndex: 1,
    extensionChance: 1,
    extensionReach: 0.65
  };
  const first = new Wall(sceneStub(), config, 12, 0);
  const second = new Wall(sceneStub(), config, 12, 0);
  const shot = { seed: 42, attempt: 3, targetX: 2 };
  first.onStrike(shot);
  second.onStrike(shot);
  first.updateMechanic(0.2);
  second.updateMechanic(0.2);

  assert.deepEqual(first.getPoseSnapshot(), second.getPoseSnapshot());
  const defender = first.players[1];
  assert.equal(defender.role, 'deflector');
  assert.equal(defender.legExtension, 0.65);
  assert.equal(defender.deflectorDir, 1);

  const legContact = first.contact({
    x: defender.x + defender.halfWidth + 0.4,
    y: defender.jumpY + 0.35
  });
  assert.equal(legContact?.part, 'leg');

  first.resetMechanic();
  assert.equal(first.players[1].legExtension, 0);
  assert.equal(first.deflectorActive, false);
});

test('impact flash is cleared by fixed-step update without a delayed callback', () => {
  const wall = new Wall(sceneStub(), 1, 12, 0);
  const contact = wall.contact({ x: wall.players[0].x, y: 0.5 });
  assert.ok(contact);

  assert.equal(wall.impact(contact, { x: 0, y: 0.5 }, { vx: 2 }), true);
  assert.deepEqual(wall.players[0].spr.calls.setTint, [0xfff3c4]);
  assert.equal(wall.players[0].flashTime, 0.095);
  wall.update(0.1);
  assert.equal(wall.players[0].flashTime, 0);
  assert.equal(wall.players[0].spr.calls.clearTint, 1);
});
