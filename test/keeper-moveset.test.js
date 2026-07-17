import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KEEPER_DISTRIBUTION_IDS,
  KEEPER_MOVE_COUNT,
  KEEPER_MOVESET,
  getKeeperMove
} from '../src/data/keeperMoveset.js';
import { CAM, PHYS } from '../src/config.js';
import { Goalkeeper, classifySaveFamily } from '../src/objects/Goalkeeper.js';

function spriteStub() {
  const sprite = { calls: {}, destroy() {} };
  for (const method of [
    'setTexture', 'setOrigin', 'setFlipX', 'setPosition', 'setScale',
    'setDepth', 'setVisible', 'setTint', 'clearTint'
  ]) {
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

test('production keeper catalog exposes every row in the supplied moveset', () => {
  assert.equal(KEEPER_MOVE_COUNT, 55, 'the supplied table contains 55 animation rows');
  assert.equal(new Set(KEEPER_MOVESET.map((entry) => entry.id)).size, KEEPER_MOVE_COUNT);
  assert.equal(KEEPER_DISTRIBUTION_IDS.length, 8);

  const expectedCategories = {
    base: 3,
    footwork: 6,
    'low-saves': 7,
    'mid-saves': 6,
    'high-saves': 6,
    diving: 6,
    '1v1': 4,
    punching: 3,
    distribution: 8,
    recovery: 3,
    reactions: 3
  };
  for (const [category, count] of Object.entries(expectedCategories)) {
    assert.equal(
      KEEPER_MOVESET.filter((entry) => entry.category === category).length,
      count,
      category
    );
  }

  const frameCapacity = {
    'keeper-anim-hd': 20,
    'keeper-footwork-hd': 10,
    'keeper-return-hd': 18,
    'keeper-low-smother-hd': 16,
    'keeper-low-save-hd': 16,
    'keeper-handling-hd': 10,
    'keeper-mid-catch-hd': 16,
    'keeper-upper-parry-hd': 16,
    'keeper-high-claim-hd': 5,
    'keeper-top-tip-hd': 16,
    'keeper-dive-motion-hd': 24,
    'keeper-reflex-foot-hd': 16,
    'keeper-recovery-hd': 12,
    'keeper-situational-punch-hd': 24,
    'keeper-distribution-hd': 28,
    'keeper-foot-distribution-hd': 30,
    'keeper-reactions-hd': 18
  };
  for (const entry of KEEPER_MOVESET) {
    assert.ok(entry.texture.startsWith('keeper-'));
    assert.ok(frameCapacity[entry.texture], entry.texture);
    assert.ok(entry.frames.length > 0, entry.id);
    assert.ok(entry.frames.every((frame) => Number.isInteger(frame) && frame >= 0), entry.id);
    assert.ok(entry.frames.every((frame) => frame < frameCapacity[entry.texture]), entry.id);
    assert.equal(getKeeperMove(entry.id), entry);
  }
});

test('every production move has a distinct runtime clip', () => {
  const signatures = new Map();
  for (const entry of KEEPER_MOVESET) {
    const signature = `${entry.texture}:${entry.frames.join(',')}`;
    assert.equal(
      signatures.has(signature),
      false,
      `${entry.id} aliases ${signatures.get(signature)}`
    );
    signatures.set(signature, entry.id);
  }

  for (const id of ['short-pass-feet', 'driven-pass', 'goal-kick-placed', 'drop-kick', 'side-volley-half-volley']) {
    const move = getKeeperMove(id);
    assert.equal(move.texture, 'keeper-foot-distribution-hd');
    assert.equal(move.frames.length, 6, `${id} must retain all six authored phases`);
  }
});

test('close central shots select narrow, spread and body-block families', () => {
  assert.equal(classifySaveFamily({ y: 0.88, speed: 28, lateral: 0.2 }), 'narrow-block');
  assert.equal(classifySaveFamily({ y: 0.88, speed: 28, lateral: 0.7 }), 'spread-save');
  assert.equal(classifySaveFamily({ y: 1.22, speed: 28, lateral: 0.2 }), 'body-block');
});

test('keeper presents wall commands, distribution and high punch atlases', () => {
  const textures = [
    'keeper-anim-hd',
    'keeper-reactions-hd',
    'keeper-distribution-hd',
    'keeper-foot-distribution-hd',
    'keeper-situational-punch-hd'
  ];
  const keeper = new Goalkeeper(sceneStub(textures), 0.72, CAM.ballDist + 18, { seed: 12 });

  assert.equal(keeper.organiseWall(), true);
  keeper.update(PHYS.fixedStep);
  assert.equal(keeper.getPresentationFrame().action.id, 'organise-wall');
  assert.equal(keeper.spr.calls.setTexture[0], 'keeper-reactions-hd');

  keeper.presentationAction = null;
  keeper.shotSpeed = 21;
  keeper.catchBall({ x: 0.1, y: 1.2 });
  for (let elapsed = 0; elapsed < 0.55; elapsed += PHYS.fixedStep) keeper.update(PHYS.fixedStep);
  assert.ok(KEEPER_DISTRIBUTION_IDS.includes(keeper.presentationAction));
  assert.equal(keeper.spr.calls.setTexture[0], getKeeperMove(keeper.presentationAction).texture);

  keeper.presentationAction = null;
  keeper.state = 'set';
  keeper.pose = 'ready';
  keeper.x = 0;
  keeper.impact({ x: 0.08, y: 1.82 }, { vx: 0, vy: 4, vz: 28 });
  assert.equal(keeper.saveFamily, 'two-fist-punch');
  keeper.draw();
  assert.equal(keeper.spr.calls.setTexture[0], 'keeper-situational-punch-hd');
});
