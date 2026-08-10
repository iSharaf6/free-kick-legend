import test from 'node:test';
import assert from 'node:assert/strict';

import { CAM, GOAL_H, GOAL_W, project } from '../src/config.js';
import {
  GOAL_CELEBRATION_TIMING,
  GoalCelebration,
  goalFlareLayout,
  goalPyroLayout
} from '../src/systems/GoalCelebration.js';
import { ordinal, outcomeBannerStyle, scorerCardCopy } from '../src/systems/OutcomePresentation.js';

function closeTo(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('goal scorer card copy is stable for every football ordinal edge case', () => {
  assert.equal(ordinal(1), '1ST');
  assert.equal(ordinal(2), '2ND');
  assert.equal(ordinal(3), '3RD');
  assert.equal(ordinal(11), '11TH');
  assert.equal(ordinal(22), '22ND');
  assert.deepEqual(
    scorerCardCopy({ scorerName: 'Malik Rook', shirtNumber: 9, goalNumber: 1 }),
    {
      heading: 'GOAL SCORED!',
      player: '#9  MALIK ROOK',
      detail: '1ST GOAL OF THE MATCH'
    }
  );
  assert.deepEqual(
    scorerCardCopy({
      scorerName: 'Malik Rook',
      shirtNumber: 9,
      scoreDelta: 1454,
      shotLabel: 'clean finish',
      contextLabel: '1 goal · x1 combo · 59 sec'
    }),
    {
      heading: '+1454 · CLEAN FINISH',
      player: '#9  MALIK ROOK',
      detail: '1 GOAL · X1 COMBO · 59 SEC'
    }
  );
});

test('every outcome receives the same outlined display system and a safe font size', () => {
  const labels = [
    'GOAL!', 'SAVED!', 'CAUGHT!', 'BLOCKED!', 'OFF TARGET',
    'OFF THE POST!', 'OFF THE BAR!', 'WALL FLATTENED!'
  ];
  const styles = labels.map((label) => outcomeBannerStyle(label));
  assert.ok(styles.every((style) => style.text && style.fill.length === 3));
  assert.ok(styles.every((style) => style.fontSize >= 18 && style.fontSize <= 24));
  assert.ok(styles.filter((style) => style.stadiumCelebration).every((style) => style.fontSize >= 22));
  assert.ok(styles.find((style) => style.text === 'GOAL!').fontSize >
    styles.find((style) => style.text === 'WALL FLATTENED!').fontSize);
  assert.ok(styles.find((style) => style.text === 'GOAL!').holdMs >= 1100);
});

test('celebration pacing keeps the scorer card readable and reduced motion settled', () => {
  assert.ok(GOAL_CELEBRATION_TIMING.fullMs >= 1400 && GOAL_CELEBRATION_TIMING.fullMs <= 1800);
  assert.ok(GOAL_CELEBRATION_TIMING.reducedMs >= 1000);
  assert.ok(GOAL_CELEBRATION_TIMING.cardFadeDelayMs >= 1300);
  assert.ok(GOAL_CELEBRATION_TIMING.cardFadeDelayMs + GOAL_CELEBRATION_TIMING.cardFadeMs <
    GOAL_CELEBRATION_TIMING.fullMs);
  assert.equal(GOAL_CELEBRATION_TIMING.cardFadeMs, 220);
});

test('play schedules the authored full and reduced celebration lifetimes', () => {
  const scheduleFor = (reducedMotion) => {
    const delays = [];
    const scene = {
      settings: { reducedMotion },
      time: {
        delayedCall(delay) {
          delays.push(delay);
          return { remove() {} };
        }
      },
      tweens: { killTweensOf() {} }
    };
    const celebration = new GoalCelebration(scene);
    celebration.showCelebrationStand = () => {};
    celebration.showPitchPyro = () => {};
    celebration.showScorerCard = () => {};
    celebration.play({ kicker: { celebrate() {} } });
    return delays;
  };

  assert.deepEqual(scheduleFor(false), [55, 70, GOAL_CELEBRATION_TIMING.fullMs]);
  assert.deepEqual(scheduleFor(true), [0, 70, GOAL_CELEBRATION_TIMING.reducedMs]);
});

test('stand flares preserve the authored 128x192 aspect ratio with one uniform scale', () => {
  const flare = goalFlareLayout();
  assert.equal(flare.sourceWidth, 128);
  assert.equal(flare.sourceHeight, 192);
  closeTo(flare.scale, 40 / 192);
  closeTo(flare.displayWidth / flare.displayHeight, 128 / 192);
  closeTo(flare.displayHeight, 40);
});

test('the stand renderer applies the same source-derived scale to both flare axes', () => {
  const sprites = [];
  const scene = {
    textures: { exists: (key) => key === 'goal-flare-v3' },
    add: {
      sprite(x, y, texture) {
        const sprite = {
          x, y, texture, active: true,
          setOrigin() { return this; },
          setScale(value) { this.scaleX = value; this.scaleY = value; return this; },
          setFlipX() { return this; },
          setDepth() { return this; },
          setAlpha() { return this; },
          setFrame() { return this; },
          destroy() { this.active = false; }
        };
        sprites.push(sprite);
        return sprite;
      }
    }
  };
  const celebration = new GoalCelebration(scene);
  celebration.showCelebrationStand(true);
  const expected = goalFlareLayout().scale;

  assert.equal(sprites.length, 2);
  assert.ok(sprites.every((sprite) => sprite.scaleX === expected && sprite.scaleY === expected));
  celebration.stop();
});

test('goal fountains are grounded beside the posts and layered behind play at every goal width', () => {
  const previousCameraX = CAM.x;
  CAM.x = 0;
  try {
    const zGoal = CAM.ballDist + 18;
    const normal = goalPyroLayout({ goalWidth: GOAL_W, goalZ: zGoal });
    const smaller = goalPyroLayout({ goalWidth: GOAL_W * 0.76, goalZ: zGoal });
    const goalBase = project(0, 0, zGoal);
    const goalTop = project(0, GOAL_H, zGoal);
    const frameDepth = 1000 - zGoal * 10 + 2;
    const leftPost = project(-GOAL_W / 2, 0, zGoal);
    const rightPost = project(GOAL_W / 2, 0, zGoal);

    assert.equal(normal.length, 2);
    assert.ok(normal[0].x < leftPost.x);
    assert.ok(normal[1].x > rightPost.x);
    assert.ok(normal.every((fountain) => fountain.depth < frameDepth && fountain.depth > 2));
    assert.ok(normal.every((fountain) => Math.abs(fountain.y - project(0, 0, zGoal + 0.25).y) < 1e-9));
    assert.ok(normal.every((fountain) => fountain.scale * 192 <= (goalBase.y - goalTop.y) * 1.08));
    assert.ok(normal.every((fountain) => fountain.sparkLayers.length === 3));
    assert.ok(normal.every((fountain) => {
      const core = fountain.sparkLayers.find((layer) => layer.role === 'core');
      const left = Math.min(...fountain.sparkLayers.map((layer) => layer.x - 64 * layer.scaleX));
      const right = Math.max(...fountain.sparkLayers.map((layer) => layer.x + 64 * layer.scaleX));
      return core.scaleX / core.scaleY >= 1.45 &&
        (right - left) / (128 * fountain.scale) >= 1.45;
    }), 'spark fans are materially wider than the original single sprite');
    assert.ok(normal.every((fountain) => (
      fountain.smoke.scaleX / fountain.smoke.scaleY > 1.75 &&
      fountain.smoke.depth < fountain.depth
    )), 'broad smoke sits behind the spark fan');
    assert.ok(normal.flatMap((fountain) => fountain.sparkLayers)
      .every((layer) => layer.depth < frameDepth));
    assert.notEqual(normal[0].scale, normal[1].scale, 'left/right fountains need different silhouettes');
    assert.deepEqual(normal.map((fountain) => fountain.delay), [0, 0]);
    assert.ok(smaller[1].x - smaller[0].x < normal[1].x - normal[0].x);
    closeTo(smaller[0].y, normal[0].y);
  } finally {
    CAM.x = previousCameraX;
  }
});

test('goal fountains play all eight authored frames and are fully removed by stop', () => {
  const sprites = [];
  const timers = [];
  const clips = new Map();
  const scene = {
    goalWidth: GOAL_W,
    zGoal: CAM.ballDist + 18,
    textures: { exists: () => true },
    add: {
      sprite(x, y, texture) {
        const sprite = {
          x, y, texture: { key: texture }, active: true,
          setOrigin() { return this; },
          setScale(xScale, yScale = xScale) {
            this.scale = xScale;
            this.scaleX = xScale;
            this.scaleY = yScale;
            return this;
          },
          setDepth(value) { this.depth = value; return this; },
          setFlipX(value) { this.flipX = value; return this; },
          setAlpha(value) { this.alpha = value; return this; },
          setFrame(value) { this.frame = value; return this; },
          play(value) { this.animation = value; return this; },
          destroy() { this.active = false; }
        };
        sprites.push(sprite);
        return sprite;
      }
    },
    anims: {
      exists: (key) => clips.has(key),
      generateFrameNumbers: (texture, range) => Array.from(
        { length: range.end - range.start + 1 },
        (_, index) => ({ key: texture, frame: range.start + index })
      ),
      create: (config) => { clips.set(config.key, config); return config; }
    },
    time: {
      delayedCall(_delay, callback) {
        const timer = { callback, removed: false, remove() { this.removed = true; } };
        timers.push(timer);
        return timer;
      }
    },
    tweens: { killTweensOf() {} }
  };

  const celebration = new GoalCelebration(scene);
  celebration.showPitchPyro(false);
  const sparks = sprites.filter((sprite) => sprite.texture.key === 'goal-spark-fountain-v3');
  const smoke = sprites.filter((sprite) => sprite.texture.key === 'goal-flare-v3');
  assert.equal(sprites.length, 8);
  assert.equal(sparks.length, 6);
  assert.equal(smoke.length, 2);
  assert.equal(celebration.timers.size, 0);
  assert.ok(sparks.every((sprite) => sprite.animation === 'goal-spark-fountain-burst-v3'));
  assert.ok(smoke.every((sprite) => sprite.animation === 'goal-flare-billow-v3'));
  assert.equal(clips.get('goal-spark-fountain-burst-v3').frames.length, 8);
  assert.equal(clips.get('goal-flare-billow-v3').frames.length, 8);
  assert.equal(clips.get('goal-spark-fountain-burst-v3').repeat, -1);
  assert.ok(sparks.some((sprite) => sprite.scaleX > sprite.scaleY));
  assert.ok(smoke.every((sprite) => sprite.scaleX > sprite.scaleY * 1.75));
  assert.ok(smoke.every((sprite) => sprite.depth < Math.min(...sparks.map((sprite) => sprite.depth))));

  celebration.stop();
  assert.equal(celebration.objects.size, 0);
  assert.equal(celebration.timers.size, 0);
  assert.ok(sprites.every((sprite) => !sprite.active));
  assert.deepEqual(timers, []);

  celebration.showPitchPyro(true);
  const reduced = sprites.slice(8);
  assert.equal(reduced.length, 8);
  assert.ok(reduced.every((sprite) => sprite.alpha > 0 && sprite.alpha < 0.9));
  assert.ok(reduced.every((sprite) => sprite.frame === 3 && !sprite.animation));
  assert.equal(celebration.timers.size, 0, 'reduced motion needs no policy timers');
  celebration.stop();
});

test('an active celebration is rebuilt coherently when reduced motion changes live', () => {
  const calls = [];
  const kicker = {
    setReducedMotion: (value) => calls.push(['kicker-motion', value]),
    celebrate: (duration) => calls.push(['kicker-celebrate', duration])
  };
  const scene = { settings: { reducedMotion: true } };
  const celebration = new GoalCelebration(scene);
  const options = { kicker, scorerName: 'Mica Vale', goalNumber: 1 };
  celebration.active = { options, reduced: false };
  celebration.clearPresentation = () => calls.push('clear');
  celebration.showCelebrationStand = (value) => calls.push(['stand', value]);
  celebration.showPitchPyro = (value) => calls.push(['pyro', value]);
  celebration.showScorerCard = (value) => calls.push(['card', value]);
  celebration.after = (delay) => calls.push(['cleanup', delay]);

  assert.equal(celebration.setReducedMotion(true), true);
  assert.equal(celebration.active.reduced, true);
  assert.equal(celebration.active.options, options);
  assert.deepEqual(calls, [
    'clear',
    ['kicker-motion', true],
    ['kicker-celebrate', 650],
    ['stand', true],
    ['pyro', true],
    ['card', options],
    ['cleanup', GOAL_CELEBRATION_TIMING.reducedMs]
  ]);
  assert.equal(celebration.setReducedMotion(true), false, 'same policy does not restart the result');
});
