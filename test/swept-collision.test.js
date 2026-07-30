import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

import { Wall } from '../src/objects/Wall.js';
import { Audio } from '../src/systems/AudioSynth.js';
import { sweepMovingZPlane } from '../src/systems/SweptCollision.js';

const noop = () => {};
const context = new Proxy({
  getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
  putImageData: noop,
  measureText: () => ({ width: 0 }),
  createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  canvas: null
}, {
  get: (target, key) => key in target ? target[key] : noop,
  set: (target, key, value) => {
    target[key] = value;
    return true;
  }
});
const canvas = {
  getContext: () => context,
  style: {},
  addEventListener: noop,
  removeEventListener: noop,
  setAttribute: noop
};
context.canvas = canvas;
globalThis.window = {
  devicePixelRatio: 1,
  addEventListener: noop,
  removeEventListener: noop,
  focus: noop
};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node', maxTouchPoints: 0 },
  configurable: true
});
globalThis.document = {
  documentElement: {},
  createElement: (type) => type === 'canvas' ? canvas : { style: {} },
  addEventListener: noop,
  removeEventListener: noop
};
globalThis.Image = class {};
globalThis.HTMLCanvasElement = class {};

const originalLoad = Module._load;
Module._load = function loadWithoutInspector(request, ...args) {
  if (request === 'phaser3spectorjs') return {};
  return originalLoad.call(this, request, ...args);
};
const { GameScene } = await import('../src/scenes/GameScene.js');
Module._load = originalLoad;

function closeTo(actual, expected, epsilon = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

function spriteStub() {
  const sprite = { texture: { source: [{ height: 64 }] } };
  for (const method of [
    'setOrigin', 'setFlipX', 'setPosition', 'setScale', 'setDepth',
    'setRotation', 'setTint', 'clearTint'
  ]) {
    sprite[method] = () => sprite;
  }
  sprite.destroy = () => {};
  return sprite;
}

function wallSceneStub() {
  return {
    textures: { exists: () => false },
    add: { sprite: () => spriteStub() }
  };
}

test('relative sweep matches a static plane and interpolates every coordinate once', () => {
  const hit = sweepMovingZPlane(
    { x: -2, y: 0.3, z: 8 },
    { x: 2, y: 1.3, z: 12 },
    10,
    10
  );

  closeTo(hit.time, 0.5);
  closeTo(hit.x, 0);
  closeTo(hit.y, 0.8);
  closeTo(hit.z, 10);
});

test('relative sweep catches a closing keeper plane that finishes behind the old ball position', () => {
  const previousBall = { x: 0, y: 0.5, z: 10 };
  const currentBall = { x: 0.27, y: 0.77, z: 10.02 };
  const previousPlaneZ = 10.2;
  const currentPlaneZ = 9.95;

  assert.equal(
    previousBall.z < currentPlaneZ && currentBall.z >= currentPlaneZ,
    false,
    'the former final-plane predicate demonstrates the tunnelling case'
  );
  const hit = sweepMovingZPlane(
    previousBall,
    currentBall,
    previousPlaneZ,
    currentPlaneZ
  );

  closeTo(hit.time, 20 / 27);
  closeTo(hit.x, 0.2);
  closeTo(hit.y, 0.7);
  closeTo(hit.z, previousPlaneZ + (currentPlaneZ - previousPlaneZ) * hit.time);
});

test('relative sweep rejects non-crossings and already-passed planes', () => {
  assert.equal(sweepMovingZPlane(
    { x: 0, y: 0, z: 8 },
    { x: 0, y: 0, z: 8.2 },
    10,
    10.1
  ), null);
  assert.equal(sweepMovingZPlane(
    { x: 0, y: 0, z: 10.2 },
    { x: 0, y: 0, z: 10.4 },
    10,
    10
  ), null);
  assert.equal(sweepMovingZPlane(null, { x: 0, y: 0, z: 1 }, 1, 1), null);
});

test('wall collision planes hold their authored depth for the whole flight', () => {
  const wall = new Wall(wallSceneStub(), {
    type: 'double',
    count: 4,
    rows: [
      { count: 2, depthOffset: -0.5, lateralOffset: -0.2 },
      { count: 2, depthOffset: 0.5, lateralOffset: 0.2 }
    ]
  }, 12, 0);
  wall.onStrike({ seed: 1 });

  for (const elapsed of [0.1, 0.3, 1.2]) {
    wall.updateMechanic(elapsed);
    const planes = wall.getCollisionPlanes();
    assert.deepEqual(planes.map((plane) => plane.z), [11.5, 12.5]);
    // prevZ still has to travel with each plane: the sweep reads it, and the
    // sweeper keeper depends on the same contract.
    assert.deepEqual(planes.map((plane) => plane.prevZ), [11.5, 12.5]);
  }
});

test('sweeper update preserves its start-of-step collision depth', () => {
  const keeper = { z: 12, fklTargetZ: 10 };
  const scene = Object.create(GameScene.prototype);
  Object.assign(scene, {
    level: {},
    ball: null,
    hazards: [],
    hazardMap: new Map(),
    keepers: [keeper],
    keeperConfig: {
      type: 'sweeper',
      rushSpeed: 4,
      triggerFlightTime: 0.2
    },
    state: 'FLIGHT',
    flightT: 0.5
  });

  scene.updateConditions(0.1);
  closeTo(keeper.fklPrevZ, 12);
  closeTo(keeper.z, 11.6);
  scene.updateConditions(0.1);
  closeTo(keeper.fklPrevZ, 11.6);
  closeTo(keeper.z, 11.2);
});

function makeMovingPlaneBall() {
  return {
    prev: { x: 0, y: 0.5, z: 10 },
    x: 0.27,
    y: 0.77,
    z: 10.02,
    vx: 0.2,
    vy: 0.1,
    vz: 1,
    spin: 0,
    flying: true,
    crossed() {
      throw new Error('moving defenders must use the relative sweep helper');
    },
    pointAt() {
      throw new Error('moving defenders must use the shared sweep interpolation');
    }
  };
}

test('GameScene resolves a wall row through the shared swept plane helper', () => {
  const ball = makeMovingPlaneBall();
  let outcome = null;
  let contactPoint = null;
  const wall = {
    centerX: 0,
    getCollisionPlanes: () => [{ row: 0, prevZ: 10.01, z: 10.01 }],
    jump() {},
    contactAtZ(point) {
      contactPoint = point;
      return { part: 'body', player: {} };
    },
    impact() {}
  };
  const scene = Object.create(GameScene.prototype);
  Object.assign(scene, {
    ball,
    wall,
    wallPlanesChecked: new Set(),
    wallClearanceY: null,
    keepers: [],
    keeperContactChecked: new Set(),
    impact: { explode() {} },
    playImpactShake() {},
    resolve(result) { outcome = result; }
  });

  const wasMuted = Audio.muted;
  Audio.muted = true;
  try {
    scene.checkFlight();
  } finally {
    Audio.muted = wasMuted;
  }

  assert.equal(outcome, 'WALL');
  closeTo(contactPoint.x, 0.135);
  closeTo(contactPoint.y, 0.635);
  assert.equal(scene.wallPlanesChecked.has('row-0'), true);
});

test('GameScene resolves a sweeper keeper crossing through relative motion', () => {
  const ball = makeMovingPlaneBall();
  let outcome = null;
  let caughtAt = null;
  const keeper = {
    z: 9.95,
    fklPrevZ: 10.2,
    contact(point) {
      caughtAt = point;
      return { result: 'catch' };
    },
    catchBall() {}
  };
  const scene = Object.create(GameScene.prototype);
  Object.assign(scene, {
    ball,
    wall: null,
    keepers: [keeper],
    keeperContactChecked: new Set(),
    resolve(result) { outcome = result; }
  });

  const wasMuted = Audio.muted;
  Audio.muted = true;
  try {
    scene.checkFlight();
  } finally {
    Audio.muted = wasMuted;
  }

  assert.equal(outcome, 'CAUGHT');
  assert.equal(ball.flying, false);
  closeTo(caughtAt.x, 0.2);
  closeTo(caughtAt.y, 0.7);
  assert.equal(scene.keeperContactChecked.has(keeper), true);
});
