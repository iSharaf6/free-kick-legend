import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/data/levels.js';
import { ACHIEVEMENTS } from '../src/data/progression.js';
import { careerStars } from '../src/systems/ShotScoring.js';
import { computeShotFromPath } from '../src/systems/SwipeInput.js';
import { SHOT } from '../src/config.js';

// A perfect run: every attempt is a qualifying goal and at least one strike
// clears the quality bar. Every level must award three stars for this.
test('all 150 career stars are mathematically obtainable', () => {
  let total = 0;
  for (const level of LEVELS) {
    const goals = Math.max(1, level.objective?.goals || 1);
    const attempts = level.attempts || 3;
    assert.ok(goals <= attempts, `${level.id} must allow at least ${goals} attempts`);
    const stars = careerStars({
      attempt: goals,
      attempts,
      objectiveMet: true,
      shotScore: 2400,
      goalsRequired: goals
    });
    assert.equal(stars, 3, `${level.id} (${goals} goals in ${attempts}) must be three-starrable`);
    total += stars;
  }
  assert.equal(total, LEVELS.length * 3, 'perfect play collects every star');
});

test('the perfect-collection achievement is reachable', () => {
  const cap = LEVELS.length * 3;
  const achievement = ACHIEVEMENTS.find((entry) => entry.stat === 'careerStars' && entry.target >= cap);
  assert.ok(achievement, 'a max-stars achievement exists');
  assert.ok(achievement.target <= cap, `${achievement.id} target ${achievement.target} must not exceed the ${cap}-star cap`);
});

test('multi-goal mastery follows minimum-shots, not attempt one', () => {
  // Two-goal objective finished in two shots: mastery.
  assert.equal(careerStars({ attempt: 2, attempts: 4, objectiveMet: true, shotScore: 2200, goalsRequired: 2 }), 3);
  // Same objective with one wasted shot: limited mistakes, two stars.
  assert.equal(careerStars({ attempt: 3, attempts: 4, objectiveMet: true, shotScore: 2200, goalsRequired: 2 }), 2);
  // Single-goal semantics are unchanged.
  assert.equal(careerStars({ attempt: 1, attempts: 3, objectiveMet: true, shotScore: 2050 }), 3);
  assert.equal(careerStars({ attempt: 2, attempts: 3, objectiveMet: true, shotScore: 2050 }), 2);
});

test('authored curve requirements survive normalization and stay achievable', () => {
  const curves = LEVELS.map((level) => level.objective?.minimumCurve || 0);
  assert.ok(curves.some((value) => value > 0.3),
    'hard curve levels must not be silently capped at 0.3');
  for (const value of curves) {
    assert.ok(value < SHOT.maxSpin, `minimumCurve ${value} must stay below max spin ${SHOT.maxSpin}`);
  }
});

// The live meter and the released shot must be the same numbers: a slow long
// drag reads low power, a short fast flick reads high power, in both places.
test('preview and released shot come from one canonical computation', () => {
  const slowLongDrag = Array.from({ length: 20 }, (_, i) => (
    { x: 240, y: 220 - i * 7, t: i * 45 } // 133px over 855ms
  ));
  const fastShortFlick = Array.from({ length: 8 }, (_, i) => (
    { x: 240, y: 220 - i * 7, t: i * 8 } // 49px over 56ms
  ));

  const slowPreview = computeShotFromPath(slowLongDrag, { preview: true }).shot;
  const slowRelease = computeShotFromPath(slowLongDrag).shot;
  const fastPreview = computeShotFromPath(fastShortFlick, { preview: true }).shot;
  const fastRelease = computeShotFromPath(fastShortFlick).shot;

  assert.ok(slowRelease && fastRelease, 'both gestures are valid releases');
  for (const key of ['power', 'vx', 'vy', 'vz', 'spin']) {
    assert.equal(slowPreview[key], slowRelease[key], `slow gesture ${key} preview === release`);
    assert.equal(fastPreview[key], fastRelease[key], `fast gesture ${key} preview === release`);
  }
  assert.ok(fastRelease.power > slowRelease.power + 0.3,
    'a fast flick must truthfully out-power a slow drag');
});
