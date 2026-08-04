import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

// Phaser performs browser capability checks at import time even though these
// tests exercise only GameScene's pure lifecycle methods. Supply the smallest
// inert DOM/canvas surface needed for that module initialization.
const noop = () => {};
const context = new Proxy({
  getImageData: () => ({ data: new Uint8ClampedArray([10, 20, 30, 127]) }),
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

// Phaser references this optional WebGL inspector from its CommonJS renderer
// even when no renderer is constructed. It is intentionally absent at runtime.
const originalLoad = Module._load;
Module._load = function loadWithoutInspector(request, ...args) {
  if (request === 'phaser3spectorjs') return {};
  return originalLoad.call(this, request, ...args);
};
const { GameScene } = await import('../src/scenes/GameScene.js');
Module._load = originalLoad;

test('init drops destroyed optional HUD and world references before level 9', () => {
  const scene = new GameScene();
  const deadReference = { destroyed: true };
  Object.assign(scene, {
    sessionToken: 7,
    objectiveProgressTxt: deadReference,
    hint: deadReference,
    objectiveUi: [deadReference],
    attemptIcons: [deadReference],
    targetGfx: deadReference,
    wall: deadReference,
    scoreTxt: deadReference,
    dailyShotsTxt: deadReference
  });

  scene.init({ mode: 'career', levelIndex: 8 });

  assert.equal(scene.level.id, 'academy-09');
  assert.equal(scene.sessionToken, 8);
  assert.equal(scene.objectiveProgressTxt, null);
  assert.equal(scene.hint, null);
  assert.equal(scene.objectiveUi, null);
  assert.equal(scene.attemptIcons, null);
  assert.equal(scene.targetGfx, null);
  assert.equal(scene.wall, null);
  assert.equal(scene.scoreTxt, null);
  assert.equal(scene.dailyShotsTxt, null);
  assert.deepEqual(scene.securityGuards, []);
  assert.deepEqual(scene.securityGuardTweens, []);
});

test('security guards receive staggered ambient motion while keeping stable identities', () => {
  const images = [];
  const tweenConfigs = [];
  const scene = Object.create(GameScene.prototype);
  Object.assign(scene, {
    levelIndex: 2,
    settings: { reducedMotion: false },
    textures: { exists: (key) => key === 'security-guards-hd' },
    add: {
      image: (x, y, texture, frame) => {
        const image = {
          x,
          y,
          texture,
          frame,
          active: true,
          flipX: false,
          setOrigin() { return this; },
          setDisplaySize(width, height) {
            this.displayWidth = width;
            this.displayHeight = height;
            this.scaleY = height / 204;
            return this;
          },
          setDepth() { return this; },
          setFlipX(value) { this.flipX = value; return this; }
        };
        images.push(image);
        return image;
      }
    },
    tweens: {
      add: (config) => {
        tweenConfigs.push(config);
        return { config };
      }
    }
  });

  scene.buildSecurityGuards();

  assert.equal(images.length, 6);
  assert.deepEqual(images.map((image) => image.frame), [2, 3, 4, 5, 0, 1]);
  assert.equal(tweenConfigs.length, 6);
  assert.equal(scene.securityGuardTweens.length, 6);
  assert.ok(tweenConfigs.every((config) => config.repeat === -1 && config.yoyo));
  assert.equal(new Set(tweenConfigs.map((config) => config.delay)).size, 6);

  tweenConfigs[0].onRepeat();
  assert.equal(images[0].flipX, true);
  tweenConfigs[1].onRepeat();
  assert.equal(images[1].flipX, false);
});

test('reduced motion leaves security guards completely still', () => {
  const scene = Object.create(GameScene.prototype);
  let tweenCount = 0;
  const makeImage = (x, y) => {
    const image = {
      x,
      y,
      scaleY: 1,
      setOrigin() { return this; },
      setDisplaySize() { return this; },
      setDepth() { return this; }
    };
    return image;
  };
  Object.assign(scene, {
    levelIndex: 0,
    settings: { reducedMotion: true },
    textures: { exists: () => true },
    add: { image: makeImage },
    tweens: { add: () => { tweenCount++; } }
  });

  scene.buildSecurityGuards();

  assert.equal(scene.securityGuards.length, 6);
  assert.equal(scene.securityGuardTweens.length, 0);
  assert.equal(tweenCount, 0);
});

test('scene transition gate cancels callbacks and accepts only one restart', () => {
  const scene = Object.create(GameScene.prototype);
  let cancelledSwipe = 0;
  let removedTimers = 0;
  let restartCalls = 0;
  let resumedTweens = 0;
  let killedTweens = 0;
  let cancelledKick = 0;
  scene.sessionAlive = true;
  scene.transitioning = false;
  scene.state = 'AIMING';
  scene.pauseOverlayObjects = [];
  scene.scheduledCalls = new Set([{ id: 'result-card' }]);
  scene.swipe = { enabled: true, cancel: () => { cancelledSwipe++; } };
  scene.time = {
    paused: true,
    removeEvent: (events) => { removedTimers += events.length; },
    removeAllEvents: noop,
    clearPendingEvents: noop
  };
  scene.tweens = {
    resumeAll: () => { resumedTweens++; },
    killAll: () => { killedTweens++; }
  };
  scene.kicker = { cancelSequence: () => { cancelledKick++; } };
  scene.scene = { restart: () => { restartCalls++; }, start: noop };

  assert.equal(scene.beginSceneTransition('restart', null, { mode: 'career', levelIndex: 8 }), true);
  assert.equal(scene.beginSceneTransition('restart', null, { mode: 'career', levelIndex: 8 }), false);

  assert.equal(restartCalls, 1);
  assert.equal(cancelledSwipe, 1);
  assert.equal(removedTimers, 1);
  assert.equal(cancelledKick, 1);
  assert.equal(resumedTweens, 1);
  assert.equal(killedTweens, 1);
  assert.equal(scene.time.paused, false);
  assert.equal(scene.state, 'TRANSITIONING');
  assert.equal(scene.scheduledCalls.size, 0);
});

test('Tab is captured, prevents browser focus, and toggles the pause menu once', () => {
  const listeners = new Map();
  const captures = [];
  const keyboard = {
    addCapture: (key) => captures.push(key),
    on: (event, callback) => listeners.set(event, callback)
  };
  const scene = Object.create(GameScene.prototype);
  let toggles = 0;
  scene.input = { keyboard };
  scene.adRequestActive = false;
  scene.togglePauseMenu = () => { toggles++; };
  scene.restartCurrentLevel = noop;
  scene.startScene = noop;
  scene.installKeyboardControls();

  let prevented = 0;
  const event = { repeat: false, preventDefault: () => { prevented++; } };
  listeners.get('keydown-TAB')(event);
  listeners.get('keydown-TAB')({ repeat: true, preventDefault: () => { prevented++; } });

  assert.deepEqual(captures, ['TAB']);
  assert.deepEqual([...listeners.keys()], ['keydown-TAB']);
  assert.equal(prevented, 2);
  assert.equal(event.cancelled, 1);
  assert.equal(toggles, 1);
});

test('Time Attack clock continues through result feedback', () => {
  const scene = Object.create(GameScene.prototype);
  let displayed = null;
  Object.assign(scene, {
    mode: 'arcade',
    over: false,
    state: 'RESULT',
    timeLeft: 12,
    lastTickSecond: -1,
    timerTxt: { setText: (value) => { displayed = value; } },
    endArcade: noop
  });

  assert.equal(scene.updateArcadeClock(1.25), false);
  assert.equal(scene.timeLeft, 10.75);
  assert.equal(displayed, '11');
});

test('buildKeepers wires separate homes and scaled goal bounds into each keeper', () => {
  const makeSprite = () => {
    const sprite = {
      texture: { source: [{ height: 28 }] },
      frame: { height: 28 },
      destroy: noop
    };
    for (const method of ['setTexture', 'setOrigin', 'setFlipX', 'setPosition', 'setScale', 'setDepth']) {
      sprite[method] = () => sprite;
    }
    return sprite;
  };
  const scene = Object.create(GameScene.prototype);
  Object.assign(scene, {
    keepers: [],
    keeperConfig: {
      type: 'double',
      instances: [
        { offsetX: -1.4, skill: 0.55 },
        { offsetX: 1.4, skill: 0.55 }
      ]
    },
    attempt: 1,
    zGoal: 26,
    settings: { reducedMotion: true },
    level: { style: 'balanced' },
    levelIndex: 45,
    goalWidth: 6,
    goalHeight: 2.4,
    textures: { exists: () => false },
    add: { sprite: makeSprite }
  });

  scene.buildKeepers();

  assert.deepEqual(scene.keepers.map((keeper) => keeper.homeX), [-1.4, 1.4]);
  assert.deepEqual(scene.keepers.map((keeper) => keeper.x), [-1.4, 1.4]);
  assert.ok(scene.keepers.every((keeper) => keeper.goalWidth === 6 && keeper.goalHeight === 2.4));
  assert.equal(scene.keeper, scene.keepers[0]);
});

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be close to ${expected}`);
};

function makePreparedShotScene(attempt = 2) {
  const scene = Object.create(GameScene.prototype);
  scene.level = {
    id: 'targets-09',
    objective: { type: 'limited-power', maximumPower: 0.72 },
    shotRules: { maxPower: 0.72, powerJitter: 0.09 }
  };
  scene.hazardMap = new Map([
    ['slippery', { type: 'slippery', powerJitter: 0.09, frequency: 8.5 }]
  ]);
  scene.simTime = 1.25;
  scene.attempt = attempt;
  return scene;
}

test('prepareShot enforces limited power and applies replay-stable slippery jitter to velocity', () => {
  const input = { vx: 9, vy: 4.5, vz: 27, spin: 0.2, power: 0.9 };
  const scene = makePreparedShotScene(2);
  const first = scene.prepareShot(input);
  const replay = scene.prepareShot(input);

  assert.deepEqual(first, replay, 'the same level, attempt and simulation time must replay identically');
  assert.equal(first.authoredPower, 0.9);
  assert.equal(first.powerCapped, true);
  assert.ok(first.power <= 0.72);
  assert.notEqual(first.powerJitter, 0);
  closeTo(first.vx, input.vx * (first.power / input.power));
  closeTo(first.vy, input.vy * (first.power / input.power));
  closeTo(first.vz, input.vz * (first.power / input.power));
  assert.deepEqual(input, { vx: 9, vy: 4.5, vz: 27, spin: 0.2, power: 0.9 }, 'input stays immutable');

  const nextAttempt = makePreparedShotScene(3).prepareShot(input);
  assert.notEqual(first.power, nextAttempt.power, 'attempt is part of the deterministic jitter seed');
});

function makeObjectiveScene(objective, overrides = {}) {
  const scene = Object.create(GameScene.prototype);
  Object.assign(scene, {
    level: { objective },
    lastShot: { power: 0.7, spin: 0 },
    activeTarget: null,
    frameTouched: false,
    frameContacts: new Set(),
    ringProgress: { count: 0, crossedIds: [] },
    aimGuideHidden: false,
    goalDimensions: { width: 9, height: 3.1 }
  }, overrides);
  return scene;
}

test('objectiveCheck delegates ring-shot progress and target requirements', () => {
  const scene = makeObjectiveScene(
    { type: 'ring-shot', ringsRequired: 2, curveDirection: 'right', minimumCurve: 0.3 },
    {
      lastShot: { power: 0.68, spin: 0.36 },
      activeTarget: { id: 'top-right' },
      ringProgress: { count: 2, crossedIds: ['near', 'far'] }
    }
  );
  const rating = { targetHit: true, topCorner: false };

  assert.equal(scene.objectiveCheck('GOAL', { x: 2.8, y: 2.2 }, rating).qualifies, true);
  scene.ringProgress = { count: 1, crossedIds: ['near'] };
  const missedRing = scene.objectiveCheck('GOAL', { x: 2.8, y: 2.2 }, rating);
  assert.equal(missedRing.qualifies, false);
  assert.match(missedRing.reason, /THREAD 2 HOOPS/);
});

test('objectiveCheck delegates bank-shot frame contact recorded by the scene', () => {
  const scene = makeObjectiveScene(
    { type: 'bank-shot', requiredContact: 'frame' },
    { frameTouched: true, frameContacts: new Set(['post']) }
  );
  const rating = { targetHit: false, topCorner: false };

  assert.equal(scene.objectiveCheck('GOAL', { x: 0, y: 1.1 }, rating).qualifies, true);
  scene.frameTouched = false;
  scene.frameContacts.clear();
  const cleanFinish = scene.objectiveCheck('GOAL', { x: 0, y: 1.1 }, rating);
  assert.equal(cleanFinish.qualifies, false);
  assert.match(cleanFinish.reason, /POST OR CROSSBAR/);
});

test('objectiveCheck passes scaled goal dimensions to corner-only evaluation', () => {
  // This point is a top-right corner in a 65%-width goal, but only top-centre
  // in the regulation 9m goal. The contrast catches a regression to constants.
  const point = { x: 2, y: 1.5 };
  const objective = { type: 'corner-only', allowedZones: ['top-left', 'top-right'] };
  const rating = { targetHit: false, topCorner: false };
  const scaled = makeObjectiveScene(objective, {
    goalDimensions: { width: 5.85, height: 2.015 }
  });
  const regulation = makeObjectiveScene(objective);

  assert.equal(scaled.objectiveCheck('GOAL', point, rating).qualifies, true);
  assert.equal(regulation.objectiveCheck('GOAL', point, rating).qualifies, false);
});

function runGoalPlaneCheck(goalWidth, goalHeight) {
  const scene = Object.create(GameScene.prototype);
  let outcome = null;
  Object.assign(scene, {
    ball: {
      prev: null,
      x: 3.5,
      y: 1,
      z: 20,
      vx: 0,
      vy: 0,
      vz: 10,
      spin: 0,
      crossed: (plane) => plane === 20,
      pointAt: () => ({ x: 3.5, y: 1 })
    },
    wall: null,
    keepers: [],
    keeperContactChecked: new Set(),
    settings: { reducedMotion: true },
    slowmoUsed: true,
    zWall: 12,
    zGoal: 20,
    goalWidth,
    goalHeight,
    frameCollisionCooldown: 0,
    frameTouched: false,
    frameImpactT: null,
    flightT: 0.5,
    simTime: 0.5,
    resolve: (result) => { outcome = result; }
  });
  scene.checkFlight();
  return outcome;
}

test('goal-plane collision checks use the active scaled goal instead of regulation constants', () => {
  assert.equal(runGoalPlaneCheck(5.85, 2.015), 'MISS');
  assert.equal(runGoalPlaneCheck(9, 3.1), 'GOAL');
});
