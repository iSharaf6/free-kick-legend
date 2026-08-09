import test from 'node:test';
import assert from 'node:assert/strict';
import { Kicker } from '../src/objects/Kicker.js';

// Every V3 frame is normalized to one fixed canvas and content baseline. That
// turns texture swaps into stable animation frames instead of registration
// jumps caused by pose-dependent image bounds.
const POSES = ['idle', 'ready', 'windup', 'strike', 'follow', 'recover', 'watch', 'celebrate'];

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
    width: 256,
    height: 256,
    setTexture(next) {
      this.texture = { key: next };
      this.width = 256;
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
        || key.startsWith('kicker-hd-character-power-striker-kit-home-')
        || key.startsWith('kicker-hd-character-agile-winger-kit-home-')
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

test('all poses share one ground baseline', () => {
  const kicker = new Kicker(withTweenManager(sceneStub()), 120, 200, {
    kitId: 'kit-home',
    scale: 4.8,
    ambient: false
  });

  for (const pose of POSES) {
    kicker.setPose(pose);
    // originY pins the authored content baseline, so the boots land on
    // kicker.y for every pose regardless of canvas padding.
    assert.equal(kicker.sprite.originY, 247 / 256);
    assert.equal(kicker.sprite.y, 200);
  }
});

test('selectable characters keep one fixed canvas, centre and foot anchor across every pose set', () => {
  for (const characterId of [
    'character-mica',
    'character-power-striker',
    'character-agile-winger',
    'character-islam-sharaf'
  ]) {
    const kicker = new Kicker(withTweenManager(sceneStub()), 120, 200, {
      characterId,
      kitId: 'kit-home',
      scale: 4.8,
      ambient: false
    });

    for (const pose of POSES) {
      kicker.setPose(pose);
      const expected = characterId === 'character-mica'
        ? `kicker-hd-kit-home-${pose}`
        : `kicker-hd-${characterId}-kit-home-${pose}`;
      assert.equal(kicker.sprite.texture.key, expected);
      assert.equal(kicker.sprite.width, 256);
      assert.equal(kicker.sprite.height, 256);
      assert.equal(kicker.sprite.originX, 0.5);
      assert.equal(kicker.sprite.originY, 247 / 256);
      assert.equal(kicker.sprite.y, 200);
    }
  }
});

test('Malik Rook is visibly larger without changing the shared gameplay scale', () => {
  const scene = withTweenManager(sceneStub());
  const mica = new Kicker(scene, 120, 200, {
    characterId: 'character-mica', kitId: 'kit-home', scale: 4.8, ambient: false
  });
  const malik = new Kicker(scene, 120, 200, {
    characterId: 'character-power-striker', kitId: 'kit-home', scale: 4.8, ambient: false
  });

  assert.equal(mica.scale, malik.scale, 'base gameplay presentation scale stays identical');
  assert.ok(malik.visualScale > mica.visualScale * 1.13);
  assert.equal(malik.characterScale, 1.14);
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

test('reduced-motion boot keeps ambient capability and hard-stops it until motion is enabled', () => {
  const scene = withTweenManager(sceneStub());
  const kicker = new Kicker(scene, 120, 200, {
    kitId: 'kit-home',
    scale: 4.8,
    ambient: true,
    reducedMotion: true
  });

  assert.equal(kicker.ambientEnabled, true);
  assert.equal(kicker.ambient, undefined, 'reduced boot creates no breathing tween');

  kicker.setReducedMotion(false);
  assert.ok(kicker.ambient, 'enabling motion builds the deferred ambient loop');

  scene.killedTargets.length = 0;
  kicker.idleState.bob = -0.3;
  kicker.setReducedMotion(true);
  assert.equal(kicker.ambient, null, 'the tween handle is discarded, not merely paused');
  assert.ok(scene.killedTargets.includes(kicker.idleState));
  assert.deepEqual(kicker.idleState, { bob: 0, swell: 0 });

  kicker.resumeAmbient();
  assert.equal(kicker.ambient, null, 'a broad scene resume cannot override reduced motion');
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
    { lunge: 0, lift: 0, tilt: 0, squashX: 1, squashY: 1 }
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
    [44, 78, 52, 68, 82, 92]
  );

  let contacts = 0;
  let completes = 0;
  kicker.playKick({
    onContact: () => contacts++,
    onComplete: () => completes++
  });
  assert.equal(kicker.sprite.playedAnimation, 'kicker-action');
  assert.equal(kicker.sequenceTimers.length, 0, 'the Phaser path does not schedule parallel pose timers');

  kicker.sprite.advancePose('windup');
  assert.equal(contacts, 0, 'the ball cannot launch during anticipation');
  kicker.sprite.advancePose('strike');
  kicker.sprite.advancePose('strike');
  assert.equal(contacts, 1, 'repeated animationupdate events cannot double-kick the ball');
  assert.equal(kicker.pose, 'strike');

  kicker.sprite.advancePose('follow');
  kicker.sprite.advancePose('recover');
  kicker.sprite.advancePose('watch');
  kicker.sprite.emit('animationcomplete', { key: 'kicker-action' });
  assert.equal(kicker.pose, 'watch', 'the striker keeps tracking the ball after the clip');
  assert.equal(completes, 1);
  assert.equal(kicker.activeKick, null);
  assert.equal(kicker.ambient, undefined, 'ambient:false remains disabled after recovery');
});

test('every selectable character reaches ball contact on the same Time Attack clock tick', () => {
  for (const characterId of [
    'character-mica',
    'character-power-striker',
    'character-agile-winger',
    'character-islam-sharaf'
  ]) {
    const kicker = new Kicker(withTweenManager(sceneStub({ animated: true })), 120, 200, {
      characterId,
      kitId: 'kit-home',
      scale: 4.8,
      ambient: false
    });
    const frames = kicker.sprite.animationClips.get('kicker-action').frames;
    assert.equal(
      frames[0].duration + frames[1].duration,
      122,
      `${characterId} must not gain or lose round time before contact`
    );
  }
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
