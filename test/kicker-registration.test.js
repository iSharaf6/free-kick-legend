import test from 'node:test';
import assert from 'node:assert/strict';
import { Kicker } from '../src/objects/Kicker.js';

// The authored HD poses share a 256px canvas height and a content baseline at
// y=247, but their widths grow rightward as the kicking leg extends:
// idle 108, ready 160, strike 215, follow 213, celebrate 144.
const POSE_WIDTH = { idle: 108, ready: 160, strike: 215, follow: 213, celebrate: 144 };
// Source column each pose's shoulders occupy, measured from the shipped art.
const SHOULDER_COLUMN = { idle: 48, ready: 81, strike: 80, follow: 84, celebrate: 70.5 };

function imageStub(x, y, key) {
  return {
    x,
    y,
    texture: { key },
    originX: 0.5,
    originY: 0.5,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    depth: 0,
    alpha: 1,
    rotation: 0,
    visible: true,
    scene: {},
    width: POSE_WIDTH[String(key).split('-').pop()] ?? 100,
    height: 256,
    setTexture(next) {
      this.texture = { key: next };
      this.width = POSE_WIDTH[String(next).split('-').pop()] ?? 100;
      return this;
    },
    setOrigin(ox, oy) { this.originX = ox; this.originY = oy; return this; },
    setPosition(nx, ny) { this.x = nx; this.y = ny; return this; },
    setScale(sx, sy) { this.scaleX = sx; this.scaleY = sy ?? sx; return this; },
    setDepth(d) { this.depth = d; return this; },
    setAlpha(a) { this.alpha = a; return this; },
    setRotation(r) { this.rotation = r; return this; },
    setFlipX(f) { this.flipX = f; return this; },
    setVisible(v) { this.visible = v; return this; },
    destroy() { this.destroyed = true; }
  };
}

function animatedSpriteStub(x, y, key) {
  const sprite = imageStub(x, y, key);
  const listeners = new Map();
  const clips = new Map();
  sprite.on = (event, callback) => {
    const entries = listeners.get(event) || [];
    entries.push(callback);
    listeners.set(event, entries);
    return sprite;
  };
  sprite.off = (event, callback) => {
    listeners.set(event, (listeners.get(event) || []).filter((entry) => entry !== callback));
    return sprite;
  };
  sprite.emit = (event, ...args) => {
    for (const callback of listeners.get(event) || []) callback(...args);
  };
  sprite.anims = {
    isPlaying: false,
    create(config) {
      clips.set(config.key, config);
      return config;
    },
    exists: (animationKey) => clips.has(animationKey),
    remove: (animationKey) => clips.delete(animationKey),
    play(animationKey) {
      sprite.playedAnimation = animationKey;
      this.isPlaying = true;
      return sprite;
    },
    stop() { this.isPlaying = false; sprite.stoppedAnimation = true; },
    pause() { this.isPlaying = false; sprite.pausedAnimation = true; },
    resume() { this.isPlaying = true; sprite.resumedAnimation = true; }
  };
  sprite.play = (animationKey) => sprite.anims.play(animationKey);
  sprite.animationClips = clips;
  sprite.advancePose = (pose) => {
    const clip = clips.get('kicker-action');
    const frame = clip.frames.find((entry) => entry.key.endsWith(`-${pose}`));
    sprite.setTexture(frame.key);
    sprite.emit('animationupdate', { key: 'kicker-action' }, { textureKey: frame.key });
  };
  return sprite;
}

function sceneStub({ animated = false } = {}) {
  const scene = {
    textures: {
      exists: (key) => key === 'shadow'
        || key.startsWith('kicker-hd-kit-home-')
        || key.startsWith('kicker-hd-character-islam-sharaf-kit-home-')
    },
    add: { image: (x, y, key) => imageStub(x, y, key) },
    time: { delayedCall: () => ({ remove() {} }) },
    sys: { isActive: () => true }
  };
  if (animated) scene.add.sprite = (x, y, key) => animatedSpriteStub(x, y, key);
  return scene;
}

// Phaser's TweenManager surface used by Kicker, recorded so the test can assert
// which target objects get swept.
function withTweenManager(scene) {
  const killed = [];
  scene.tweens = {
    add: (config) => ({
      config,
      state: 'playing',
      parent: scene.tweens,
      isPlaying: () => true,
      pause() {},
      resume() {}
    }),
    killTweensOf: (target) => killed.push(target)
  };
  scene.killedTargets = killed;
  return scene;
}

// Left edge of the drawn sprite in world space.
function leftEdge(sprite) {
  return sprite.x - sprite.originX * sprite.width * sprite.scaleX;
}

// World x of the shoulder column for the current pose. If registration is
// correct this is identical for every pose, because the body core does not move
// when only the limbs change.
function shoulderWorldX(kicker) {
  const sprite = kicker.sprite;
  return leftEdge(sprite) + SHOULDER_COLUMN[kicker.pose] * sprite.scaleX;
}

test('every pose anchors its shoulder column to the same world position', () => {
  const kicker = new Kicker(withTweenManager(sceneStub()), 120, 200, {
    kitId: 'kit-home',
    scale: 4.8,
    ambient: false
  });

  const anchors = Object.keys(POSE_WIDTH).map((pose) => {
    kicker.setPose(pose);
    return { pose, x: shoulderWorldX(kicker) };
  });

  const first = anchors[0].x;
  for (const { pose, x } of anchors) {
    assert.ok(
      Math.abs(x - first) < 0.001,
      `${pose} shoulder column drifted to ${x}, expected ${first}`
    );
  }
});

// Regression guard for the original defect: with a shared 0.5 origin the strike
// pose sat ~14 logical pixels left of the ready pose at menu scale, which read
// as the striker lurching sideways on every frame change.
test('the ready to strike transition no longer teleports the body sideways', () => {
  const kicker = new Kicker(withTweenManager(sceneStub()), 120, 200, {
    kitId: 'kit-home',
    scale: 4.8,
    ambient: false
  });

  kicker.setPose('ready');
  const ready = shoulderWorldX(kicker);
  kicker.setPose('strike');
  const strike = shoulderWorldX(kicker);

  assert.ok(Math.abs(strike - ready) < 0.001);

  // Sanity: a naive centre origin really would have moved it a long way, so the
  // assertion above is meaningful rather than vacuously true.
  const scale = kicker.visualScale;
  const naiveReady = 120 - 0.5 * POSE_WIDTH.ready * scale + SHOULDER_COLUMN.ready * scale;
  const naiveStrike = 120 - 0.5 * POSE_WIDTH.strike * scale + SHOULDER_COLUMN.strike * scale;
  assert.ok(Math.abs(naiveStrike - naiveReady) > 10);
});

test('all poses share one ground baseline', () => {
  const kicker = new Kicker(withTweenManager(sceneStub()), 120, 200, {
    kitId: 'kit-home',
    scale: 4.8,
    ambient: false
  });

  for (const pose of Object.keys(POSE_WIDTH)) {
    kicker.setPose(pose);
    // originY pins the authored content baseline, so the boots land on
    // kicker.y for every pose regardless of canvas padding.
    assert.equal(kicker.sprite.originY, 247 / 256);
    assert.equal(kicker.sprite.y, 200);
  }
});

test('a selectable character keeps one shared centre and foot anchor across its pose set', () => {
  const kicker = new Kicker(withTweenManager(sceneStub()), 120, 200, {
    characterId: 'character-islam-sharaf',
    kitId: 'kit-home',
    scale: 4.8,
    ambient: false
  });

  for (const pose of Object.keys(POSE_WIDTH)) {
    kicker.setPose(pose);
    assert.equal(
      kicker.sprite.texture.key,
      `kicker-hd-character-islam-sharaf-kit-home-${pose}`
    );
    assert.equal(kicker.sprite.originX, 0.5);
    assert.equal(kicker.sprite.originY, 247 / 256);
    assert.equal(kicker.sprite.y, 200);
  }
});

test('cancelling a kick sweeps the action state but never the ambient loop', () => {
  const scene = withTweenManager(sceneStub());
  const kicker = new Kicker(scene, 120, 200, { kitId: 'kit-home', scale: 4.8 });

  scene.killedTargets.length = 0;
  kicker.cancelSequence();

  assert.ok(
    scene.killedTargets.includes(kicker.actState),
    'the kick sequence state should be swept'
  );
  assert.ok(
    !scene.killedTargets.includes(kicker.idleState),
    'the ambient breathing state must survive a cancelled kick'
  );
  assert.ok(
    !scene.killedTargets.includes(kicker.sprite),
    'sweeping the sprite itself is what used to destroy the ambient tween'
  );
});

test('a cancelled sequence resets the action offsets to neutral', () => {
  const kicker = new Kicker(withTweenManager(sceneStub()), 120, 200, {
    kitId: 'kit-home',
    scale: 4.8,
    ambient: false
  });

  kicker.actState.lunge = 9;
  kicker.actState.lift = -4;
  kicker.actState.squashX = 1.3;
  kicker.cancelSequence();

  assert.deepEqual(
    { ...kicker.actState },
    { lunge: 0, lift: 0, squashX: 1, squashY: 1 }
  );
  assert.equal(kicker.sprite.x, 120);
});

test('the Phaser sprite clip owns frame timing and never skips contact', () => {
  const scene = withTweenManager(sceneStub({ animated: true }));
  const kicker = new Kicker(scene, 120, 200, {
    kitId: 'kit-home',
    scale: 4.8,
    ambient: false
  });
  const clip = kicker.sprite.animationClips.get('kicker-action');

  assert.equal(clip.skipMissedFrames, false);
  assert.deepEqual(
    clip.frames.map(({ duration }) => duration),
    [155, 90, 195, 120]
  );

  let contacts = 0;
  let completes = 0;
  kicker.playKick({
    onContact: () => contacts++,
    onComplete: () => completes++
  });
  assert.equal(kicker.sprite.playedAnimation, 'kicker-action');
  assert.equal(kicker.sequenceTimers.length, 0, 'the Phaser path does not schedule parallel pose timers');

  kicker.sprite.advancePose('strike');
  kicker.sprite.advancePose('strike');
  assert.equal(contacts, 1, 'repeated animationupdate events cannot double-kick the ball');
  assert.equal(kicker.pose, 'strike');

  kicker.sprite.advancePose('follow');
  kicker.sprite.advancePose('ready');
  kicker.sprite.emit('animationcomplete', { key: 'kicker-action' });
  assert.equal(kicker.pose, 'ready');
  assert.equal(completes, 1);
  assert.equal(kicker.activeKick, null);
  assert.equal(kicker.ambient, undefined, 'ambient:false remains disabled after recovery');
});

test('cancelling an active Phaser clip invalidates late frame events', () => {
  const scene = withTweenManager(sceneStub({ animated: true }));
  const kicker = new Kicker(scene, 120, 200, { ambient: false });
  let contacts = 0;

  kicker.playKick({ onContact: () => contacts++ });
  kicker.cancelSequence();
  kicker.sprite.advancePose('strike');
  kicker.sprite.emit('animationcomplete', { key: 'kicker-action' });

  assert.equal(contacts, 0);
  assert.equal(kicker.activeKick, null);
  assert.equal(kicker.sprite.stoppedAnimation, true);
});

test('pausing windup freezes and resumes the sprite contact timeline', () => {
  const kicker = new Kicker(withTweenManager(sceneStub({ animated: true })), 120, 200, {
    ambient: false
  });
  let contacts = 0;

  kicker.playKick({ onContact: () => contacts++ });
  kicker.pauseAction();
  assert.equal(kicker.actionAnimationPaused, true);
  assert.equal(kicker.sprite.pausedAnimation, true);
  assert.equal(contacts, 0);

  kicker.resumeAction();
  assert.equal(kicker.actionAnimationPaused, false);
  assert.equal(kicker.sprite.resumedAnimation, true);
  kicker.sprite.advancePose('strike');
  assert.equal(contacts, 1);
});
