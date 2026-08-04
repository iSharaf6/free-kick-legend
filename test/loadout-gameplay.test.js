import test from 'node:test';
import assert from 'node:assert/strict';

import { applyLoadoutToShot, resolveLoadoutGameplay } from '../src/systems/LoadoutGameplay.js';

const baseShot = Object.freeze({ vx: 2, vy: 7, vz: 25, spin: 0.8, power: 1 });

test('Malik reaches 112% power and earns the authored wall collapse', () => {
  const style = resolveLoadoutGameplay({
    character: 'character-power-striker',
    ball: 'ball-tennis'
  });
  const shot = applyLoadoutToShot(baseShot, style, 1);

  assert.equal(shot.power, 1.12);
  assert.equal(shot.wallKnockdown, true);
  assert.ok(shot.vz > baseShot.vz);
  assert.ok(shot.spin < baseShot.spin);
});

test('player trade-offs stay distinct and low-power challenges remain hard-capped', () => {
  const nico = resolveLoadoutGameplay({
    character: 'character-agile-winger',
    ball: 'ball-tennis'
  });
  const islam = resolveLoadoutGameplay({
    character: 'character-islam-sharaf',
    ball: 'ball-snowball'
  });

  const curved = applyLoadoutToShot(baseShot, nico, 1);
  const controlled = applyLoadoutToShot(baseShot, islam, 1);
  const challenge = applyLoadoutToShot(baseShot, resolveLoadoutGameplay({
    character: 'character-power-striker',
    ball: 'ball-golf'
  }), 0.7);

  assert.equal(curved.power, 0.96);
  assert.ok(curved.spin > controlled.spin);
  assert.equal(islam.windEffect, 0.78 * 0.76);
  assert.equal(challenge.power, 0.7);
  assert.equal(challenge.wallKnockdown, false);
});

test('basketball and golf ball profiles expose visibly different flight identities', () => {
  const basketball = resolveLoadoutGameplay({ character: 'character-mica', ball: 'ball-basketball' });
  const golf = resolveLoadoutGameplay({ character: 'character-mica', ball: 'ball-golf' });

  assert.ok(basketball.visualScale > 1);
  assert.ok(golf.visualScale < 1);
  assert.ok(basketball.ballPhysics.bounce > golf.ballPhysics.bounce);
  assert.ok(golf.ballPhysics.magnus > basketball.ballPhysics.magnus);
});

test('snowball, volleyball, beach ball and tennis ball each retain a distinct profile', () => {
  const snowball = resolveLoadoutGameplay({ character: 'character-mica', ball: 'ball-snowball' });
  const volleyball = resolveLoadoutGameplay({ character: 'character-mica', ball: 'ball-volleyball' });
  const beachball = resolveLoadoutGameplay({ character: 'character-mica', ball: 'ball-beachball' });
  const tennis = resolveLoadoutGameplay({ character: 'character-mica', ball: 'ball-tennis' });

  assert.ok(snowball.ballPhysics.gravity > 1);
  assert.ok(volleyball.ballPhysics.gravity < 1);
  assert.ok(beachball.windEffect > volleyball.windEffect);
  assert.ok(tennis.ballPhysics.bounce > volleyball.ballPhysics.bounce);
});
