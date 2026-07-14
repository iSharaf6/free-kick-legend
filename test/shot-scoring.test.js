import test from 'node:test';
import assert from 'node:assert/strict';

import { careerStars, hitTarget, isTopCorner, scoreShot } from '../src/systems/ShotScoring.js';

test('top-corner and target geometry use the full goal coordinate system', () => {
  const target = { x: 0.7, y: 0.79, rx: 0.9, ry: 0.46 };
  const point = { x: 3.15, y: 2.45 };
  assert.equal(isTopCorner(point, 9, 3.1), true);
  assert.equal(hitTarget(point, target, 9, 3.1), true);
  assert.equal(hitTarget({ x: -3.1, y: 0.5 }, target, 9, 3.1), false);
});

test('skill, target and combo bonuses reward precise goals without paying misses', () => {
  const target = { x: 0.7, y: 0.79, rx: 0.9, ry: 0.46 };
  const precise = scoreShot({
    outcome: 'GOAL', point: { x: 3.15, y: 2.45 },
    shot: { spin: 0.8, power: 0.9 }, streak: 3, target,
    goalWidth: 9, goalHeight: 3.1
  });
  const simple = scoreShot({
    outcome: 'GOAL', point: { x: 0, y: 1.2 },
    shot: { spin: 0, power: 0.5 }, streak: 0,
    goalWidth: 9, goalHeight: 3.1
  });
  const miss = scoreShot({ outcome: 'MISS' });

  assert.ok(precise.points > simple.points);
  assert.equal(precise.targetHit, true);
  assert.equal(precise.topCorner, true);
  assert.equal(miss.points, 0);
});

test('career star awards recognize efficiency and optional mastery', () => {
  assert.equal(careerStars({ attempt: 3, attempts: 3, objectiveMet: false, shotScore: 900 }), 1);
  assert.equal(careerStars({ attempt: 2, attempts: 3, objectiveMet: false, shotScore: 1200 }), 2);
  assert.equal(careerStars({ attempt: 1, attempts: 3, objectiveMet: true, shotScore: 2100 }), 3);
});
