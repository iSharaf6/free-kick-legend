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

function sceneStub() {
  return {
    textures: {
      exists: (key) => key === 'shadow' || key.startsWith('kicker-hd-kit-home-')
    },
    add: { image: (x, y, key) => imageStub(x, y, key) },
    time: { delayedCall: () => ({ remove() {} }) },
    sys: { isActive: () => true }
  };
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
