import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyGoalZone,
  createRingProgress,
  evaluateAdvancedObjective,
  getEffectiveGoalDimensions,
  getHazard,
  getJitteredPower,
  getRingCrossing,
  getRingWorldGeometry,
  getWallPoseOffsets,
  getWindVectorAt,
  normalizeHazards,
  normalizeKeeperConfig,
  normalizeWallConfig,
  updateRingProgress
} from '../src/systems/LevelMechanics.js';

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be close to ${expected}`);
};

test('effective goal dimensions scale width and height without mutating the level', () => {
  const level = Object.freeze({ goal: Object.freeze({ widthScale: 0.8, heightScale: 0.9 }) });
  const dimensions = getEffectiveGoalDimensions(level, { width: 9, height: 3.1 });

  closeTo(dimensions.width, 7.2);
  closeTo(dimensions.height, 2.79);
  closeTo(dimensions.halfWidth, 3.6);
  assert.equal(level.goal.widthScale, 0.8);
  assert.equal(Object.isFrozen(dimensions), true);
  assert.deepEqual(getEffectiveGoalDimensions({}, { width: 9, height: 3.1 }), {
    width: 9,
    height: 3.1,
    halfWidth: 4.5,
    widthScale: 1,
    heightScale: 1,
    baseWidth: 9,
    baseHeight: 3.1
  });
});

test('rotating wind follows period, phase and direction deterministically', () => {
  const wind = {
    x: 0.8,
    y: 0,
    z: -0.1,
    gust: 0,
    rotation: { magnitude: 0.8, period: 8, phase: 0, clockwise: true }
  };

  const start = getWindVectorAt(wind, 0);
  const quarter = getWindVectorAt(wind, 2);
  const repeated = getWindVectorAt(wind, 2);
  closeTo(start.x, 0.8);
  closeTo(start.y, 0);
  closeTo(quarter.x, 0, 1e-8);
  closeTo(quarter.y, -0.8, 1e-8);
  assert.deepEqual(quarter, repeated);
  assert.equal(quarter.z, -0.1);

  const counterClockwise = getWindVectorAt({
    ...wind,
    rotation: { ...wind.rotation, clockwise: false }
  }, 2);
  closeTo(counterClockwise.y, 0.8, 1e-8);
});

test('fixed wind preserves compatibility components and samples gusts', () => {
  assert.deepEqual(getWindVectorAt({ x: 0.3, y: 0.1, z: -2, gust: 0 }, 4), {
    x: 0.3,
    y: 0.1,
    z: -2,
    angle: Math.atan2(0.1, 0.3),
    magnitude: Math.hypot(0.3, 0.1),
    rotating: false
  });
  const gust = getWindVectorAt(
    { x: 0.3, y: 0, z: 0, gust: 0.1 },
    Math.PI / 2,
    { gustAngularFrequency: 1 }
  );
  closeTo(gust.x, 0.4);
});

test('slippery power jitter is continuous, seeded, bounded and replay-safe', () => {
  const options = {
    amount: 0.11,
    frequency: 9,
    elapsedSeconds: 1.25,
    seed: 'legend-07:attempt-2',
    maxPower: 0.72
  };
  const first = getJitteredPower(0.7, options);
  const repeated = getJitteredPower(0.7, options);
  const anotherAttempt = getJitteredPower(0.7, { ...options, seed: 'legend-07:attempt-3' });
  assert.deepEqual(first, repeated);
  assert.notEqual(first.noise, anotherAttempt.noise);
  assert.ok(first.power >= 0 && first.power <= 0.72);

  const nextTick = getJitteredPower(0.7, { ...options, elapsedSeconds: 1.251 });
  assert.ok(Math.abs(first.power - nextTick.power) < 0.01, 'meter should move continuously, not jump randomly');
  assert.equal(getJitteredPower(0.6, { amount: 0 }).power, 0.6);
});

test('hazards normalize aliases, clamp unsafe values and de-duplicate by type', () => {
  const hazards = normalizeHazards([
    { type: 'haze', density: 2 },
    { type: 'fog', density: 0.4, goalVisibility: 0.75 },
    { type: 'ice', powerJitter: -1, frequency: 100 },
    { type: 'crowd_pressure', intensity: 0.6, aimWindowScale: 0.1 },
    { type: 'unknown-disaster' }
  ]);

  assert.deepEqual(hazards, [
    { type: 'fog', density: 0.4, goalVisibility: 0.75 },
    { type: 'slippery', powerJitter: 0, frequency: 30 },
    { type: 'crowd-pressure', intensity: 0.6, aimWindowScale: 0.3, pulseSpeed: 1 }
  ]);
  assert.deepEqual(getHazard(hazards, 'haze'), hazards[0]);
  assert.equal(getHazard(hazards, 'snow'), null);
  assert.equal(Object.isFrozen(hazards), true);
});

test('ring geometry and segment crossing use normalized goal coordinates', () => {
  const ring = { id: 'far-hoop', x: 0.5, y: 0.75, z: 0.5, radius: 0.7, multiplier: 1.5 };
  const context = { startZ: 5, goalZ: 25, goalWidth: 8, goalHeight: 3 };
  assert.deepEqual(getRingWorldGeometry(ring, context), {
    id: 'far-hoop',
    x: 2,
    y: 2.25,
    z: 15,
    radius: 0.7,
    multiplier: 1.5,
    progress: 0.5
  });

  const hit = getRingCrossing(
    ring,
    { x: 1.8, y: 2.1, z: 14 },
    { x: 2.2, y: 2.3, z: 16 },
    { ...context, ballRadius: 0.2 }
  );
  assert.equal(hit.hit, true);
  closeTo(hit.point.x, 2);
  closeTo(hit.point.y, 2.2);

  const miss = getRingCrossing(
    ring,
    { x: -2, y: 0.2, z: 14 },
    { x: -2, y: 0.2, z: 16 },
    context
  );
  assert.equal(miss.hit, false);
  assert.equal(getRingCrossing(ring, { z: 16 }, { z: 14 }, context), null);
});

test('ring progress resolves multiple hoops in flight order and tracks failure', () => {
  const rings = [
    { id: 'far', x: 0, y: 0.5, z: 0.75, radius: 0.5, multiplier: 1.5 },
    { id: 'near', x: 0, y: 0.5, z: 0.25, radius: 0.5, multiplier: 1.25 }
  ];
  const context = { startZ: 5, goalZ: 25, goalWidth: 9, goalHeight: 3 };
  let progress = createRingProgress(rings, 2);
  progress = updateRingProgress(
    progress,
    rings,
    { x: 0, y: 1.5, z: 8 },
    { x: 0, y: 1.5, z: 22 },
    context
  );
  assert.deepEqual(progress.crossedIds, ['near', 'far']);
  assert.deepEqual(progress.newlyCrossedIds, ['near', 'far']);
  assert.equal(progress.complete, true);
  assert.equal(progress.failed, false);
  closeTo(progress.multiplier, 1.875);

  let missed = createRingProgress(rings, 2);
  missed = updateRingProgress(
    missed,
    rings,
    { x: 4, y: 0, z: 8 },
    { x: 4, y: 0, z: 22 },
    context
  );
  assert.deepEqual(missed.missedIds, ['near', 'far']);
  assert.equal(missed.failed, true);
  assert.equal(missed.complete, false);
});

test('goal zone classification keeps corner-only finishes genuinely wide', () => {
  assert.equal(classifyGoalZone({ x: -3.2, y: 2.4 }, { width: 9, height: 3.1 }), 'top-left');
  assert.equal(classifyGoalZone({ x: 0, y: 2.4 }, { width: 9, height: 3.1 }), 'top-center');
  assert.equal(classifyGoalZone({ x: 5, y: 2.4 }, { width: 9, height: 3.1 }), 'outside');
});

test('advanced objective evaluator handles bank, corner and power requirements', () => {
  const bank = evaluateAdvancedObjective({
    objective: { type: 'bank-shot', requiredContact: 'frame' },
    outcome: 'GOAL',
    frameContacts: ['post']
  });
  assert.equal(bank.qualifies, true);
  assert.equal(evaluateAdvancedObjective({
    objective: { type: 'bank-shot', requiredContact: 'frame' },
    outcome: 'GOAL'
  }).qualifies, false);

  const corner = evaluateAdvancedObjective({
    objective: { type: 'corner-only', allowedZones: ['top-left', 'top-right'] },
    outcome: 'GOAL',
    point: { x: 3.3, y: 2.3 },
    goalDimensions: { width: 9, height: 3.1 }
  });
  assert.equal(corner.qualifies, true);
  assert.equal(corner.zone, 'top-right');

  const limited = evaluateAdvancedObjective({
    objective: { type: 'limited-power', maximumPower: 0.72 },
    outcome: 'GOAL',
    shot: { power: 0.72 },
    target: { id: 'low-center' },
    targetHit: true
  });
  assert.equal(limited.qualifies, true);
  assert.equal(evaluateAdvancedObjective({
    objective: { type: 'limited-power', maximumPower: 0.72 },
    outcome: 'GOAL',
    shot: { power: 0.721 },
    target: { id: 'low-center' },
    targetHit: true
  }).qualifies, false);
});

test('advanced objective evaluator handles blind, numbered and ordered-ring shots', () => {
  assert.equal(evaluateAdvancedObjective({
    objective: { type: 'blind-shot' },
    outcome: 'GOAL',
    target: { id: 'top-left' },
    targetHit: true,
    aimGuideHidden: true
  }).qualifies, true);
  assert.equal(evaluateAdvancedObjective({
    objective: { type: 'blind-shot' },
    outcome: 'GOAL',
    target: { id: 'top-left' },
    targetHit: true,
    aimGuideHidden: false
  }).qualifies, false);

  assert.equal(evaluateAdvancedObjective({
    objective: { type: 'reverse-target', requiredZone: 7 },
    outcome: 'GOAL',
    target: { number: 7 },
    targetHit: true
  }).qualifies, true);

  const ringShot = evaluateAdvancedObjective({
    objective: {
      type: 'ring-shot',
      ringsRequired: 2,
      curveDirection: 'right',
      minimumCurve: 0.3
    },
    outcome: 'GOAL',
    shot: { spin: 0.35 },
    target: { id: 'top-right' },
    targetHit: true,
    ringProgress: { count: 2 }
  });
  assert.equal(ringShot.qualifies, true);
  assert.equal(evaluateAdvancedObjective({
    objective: { type: 'ring-shot', ringsRequired: 2 },
    outcome: 'GOAL',
    target: { id: 'top-right' },
    targetHit: true,
    ringProgress: { count: 1 }
  }).qualifies, false);

  assert.equal(evaluateAdvancedObjective({
    objective: { type: 'score' },
    outcome: 'GOAL'
  }).handled, false);
});

test('keeper variants normalize into bounded explicit runtime instances', () => {
  const line = normalizeKeeperConfig(null, { baseSkill: 0.6, goalWidth: 9 });
  assert.deepEqual(line.instances, [{ id: 'keeper-1', offsetX: 0, skill: 0.6 }]);

  const double = normalizeKeeperConfig(
    { type: 'double', offsets: [99, -99], skillScale: 0.8 },
    { baseSkill: 0.75, goalWidth: 8 }
  );
  assert.equal(double.type, 'double');
  assert.equal(double.count, 2);
  assert.deepEqual(double.offsets, [-3.45, 3.45]);
  closeTo(double.instances[0].skill, 0.6);

  const sweeper = normalizeKeeperConfig(
    { type: 'sweeper', rushDistance: 2.2, rushSpeed: 4.8, triggerFlightTime: 0.32 },
    { baseSkill: 0.66 }
  );
  assert.equal(sweeper.type, 'sweeper');
  assert.equal(sweeper.rushSpeed, 4.8);

  const boss = normalizeKeeperConfig(
    { type: 'boss', name: 'Vega', adaptation: 2, fakeChance: -1 },
    { baseSkill: 0.8 }
  );
  assert.equal(boss.adaptation, 0.5);
  assert.equal(boss.fakeChance, 0);
});

test('wall normalization and poses cover moving, split, rushing, double and deflector walls', () => {
  const moving = normalizeWallConfig({ type: 'moving', count: 3, range: 1, speed: 1, phase: 0 });
  const movingPoses = getWallPoseOffsets(moving, Math.PI / 2, { spacing: 0.5 });
  closeTo(movingPoses[1].x, 1);

  const split = getWallPoseOffsets(
    normalizeWallConfig({ type: 'split', count: 4, gapWidth: 1.2, gapRange: 0, speed: 1 }),
    0,
    { spacing: 0.5 }
  );
  assert.ok(split[1].x < -0.6);
  assert.ok(split[2].x > 0.6);

  const rushing = getWallPoseOffsets(
    normalizeWallConfig({ type: 'rushing', count: 2, rushDistance: 2.4, rushSpeed: 4 }),
    10,
    { struck: true, strikeElapsed: 0.5 }
  );
  assert.equal(rushing[0].z, -2);

  const double = getWallPoseOffsets(normalizeWallConfig({
    type: 'double',
    count: 5,
    rows: [
      { count: 2, depthOffset: -0.5, lateralOffset: -0.2 },
      { count: 3, depthOffset: 0.5, lateralOffset: 0.2 }
    ]
  }));
  assert.equal(double.length, 5);
  assert.deepEqual(new Set(double.map((pose) => pose.row)), new Set([0, 1]));

  const deflector = getWallPoseOffsets(
    normalizeWallConfig({
      type: 'deflector',
      count: 3,
      defenderIndex: 1,
      extensionReach: 0.65
    }),
    0,
    { deflectorActive: true }
  );
  assert.equal(deflector[1].role, 'deflector');
  assert.equal(deflector[1].legExtension, 0.65);
});
