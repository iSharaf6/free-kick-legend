import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';

import { CROWD_ANIMATION, crowdClip } from '../src/data/crowdAnimation.js';
import {
  CrowdAnimationController,
  registerCrowdAnimations
} from '../src/systems/CrowdAnimationController.js';

const ASSETS = Object.freeze({
  moving: Object.freeze({ hash: 'f169abd750196ee1e14cf8c95ee20966cfaace610add4e158af721970f816b6a' }),
  goal: Object.freeze({ hash: '008efe953aac0e70d51ecaaf603d557b2cbbd944bb0c4d060263b3554b0a40a5' }),
  out: Object.freeze({ hash: '501844bca2f774ca723ab048426a36adbfdcc831789f40895cd17dd1f7957584' })
});

function pngHeader(path) {
  const bytes = fs.readFileSync(path);
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return {
    bytes,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25]
  };
}

function decodeRgbSheet(path) {
  const image = pngHeader(path);
  const idat = [];
  let offset = 8;
  while (offset < image.bytes.length) {
    const length = image.bytes.readUInt32BE(offset);
    const type = image.bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(image.bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = image.width * 3 + 1;
  const pixels = Buffer.alloc(image.width * image.height * 3);
  for (let y = 0; y < image.height; y++) {
    assert.equal(raw[y * stride], 0, 'crowd builder publishes deterministic filter-0 rows');
    raw.copy(pixels, y * image.width * 3, y * stride + 1, (y + 1) * stride);
  }
  return { ...image, pixels };
}

function atlasFrame(image, frameIndex) {
  const frame = Buffer.alloc(CROWD_ANIMATION.frameWidth * CROWD_ANIMATION.frameHeight * 3);
  const column = frameIndex % CROWD_ANIMATION.columns;
  const row = Math.floor(frameIndex / CROWD_ANIMATION.columns);
  for (let y = 0; y < CROWD_ANIMATION.frameHeight; y++) {
    const source = (
      ((row * CROWD_ANIMATION.frameHeight + y) * image.width) +
      column * CROWD_ANIMATION.frameWidth
    ) * 3;
    image.pixels.copy(
      frame,
      y * CROWD_ANIMATION.frameWidth * 3,
      source,
      source + CROWD_ANIMATION.frameWidth * 3
    );
  }
  return frame;
}

function frameRegion(frame, x, y, width, height) {
  const region = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row++) {
    const source = ((y + row) * CROWD_ANIMATION.frameWidth + x) * 3;
    frame.copy(region, row * width * 3, source, source + width * 3);
  }
  return region;
}

function rigidGroupSimilarity(base, target, rosterRow, group) {
  const x = group * 60;
  const width = Math.min(60, CROWD_ANIMATION.frameWidth - x);
  const baseY = rosterRow * 28;
  let best = 0;
  for (let dy = -8; dy <= 8; dy++) {
    let same = 0;
    let compared = 0;
    for (let y = 0; y < 25; y++) {
      const targetY = baseY + dy + y;
      if (targetY < 0 || targetY >= CROWD_ANIMATION.frameHeight) continue;
      const baseOffset = (baseY + y) * CROWD_ANIMATION.frameWidth * 3 + x * 3;
      const targetOffset = targetY * CROWD_ANIMATION.frameWidth * 3 + x * 3;
      for (let byte = 0; byte < width * 3; byte++) {
        if (base[baseOffset + byte] === target[targetOffset + byte]) same++;
        compared++;
      }
    }
    best = Math.max(best, same / compared);
  }
  return best;
}

function fakeScene() {
  const animations = new Map();
  const textures = new Set(Object.values(CROWD_ANIMATION.states).map((clip) => clip.textureKey));
  return {
    time: {
      now: 100,
      delayedCall(delay, callback) {
        return { delay, callback, removed: false, remove() { this.removed = true; } };
      }
    },
    textures: { exists: (key) => textures.has(key) },
    anims: {
      exists: (key) => animations.has(key),
      create: (config) => animations.set(config.key, config),
      generateFrameNumbers: (key, { frames }) => frames.map((frame) => ({ key, frame }))
    },
    animations
  };
}

function fakeSprite() {
  return {
    active: true,
    x: 0,
    y: 0,
    scaleX: 0.5,
    scaleY: 0.5,
    depth: 1.1,
    texture: { key: null },
    frame: { name: 0 },
    played: [],
    anims: { stopped: 0, stop() { this.stopped++; } },
    setTexture(key, frame = 0) {
      this.texture.key = key;
      this.frame.name = frame;
      return this;
    },
    play(key) {
      this.played.push(key);
      return this;
    },
    destroy() {
      this.active = false;
    }
  };
}

test('crowd manifest exposes exactly ten authored frames for all three requested states', () => {
  assert.equal(CROWD_ANIMATION.frameCount, 10);
  assert.equal(CROWD_ANIMATION.columns * CROWD_ANIMATION.rows, 10);
  assert.deepEqual(Object.keys(CROWD_ANIMATION.states), ['moving', 'goal', 'out']);
  for (const [state, clip] of Object.entries(CROWD_ANIMATION.states)) {
    assert.equal(clip.frames.length, 10, `${state} has ten frames`);
    assert.deepEqual(clip.frames, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(new Set(clip.frames).size, 10, `${state} does not recycle poses`);
  }
  assert.equal(crowdClip('moving').repeat, -1);
  assert.equal(crowdClip('goal').repeat, 0);
  assert.equal(crowdClip('out').repeat, 0);
  assert.throws(() => crowdClip('unknown'), /Unknown crowd animation state/);
});

test('all three generated runtime sheets have the exact fixed-camera atlas contract', () => {
  for (const [state, expected] of Object.entries(ASSETS)) {
    const path = new URL(`../public/assets/hd/crowd-${state}-sheet-v3.png`, import.meta.url);
    const image = pngHeader(path);
    assert.equal(image.width, CROWD_ANIMATION.frameWidth * CROWD_ANIMATION.columns);
    assert.equal(image.height, CROWD_ANIMATION.frameHeight * CROWD_ANIMATION.rows);
    assert.equal(image.colorType, 2, `${state} crowd is an opaque RGB stadium plate`);
    assert.ok(image.bytes.length > 1_500_000, `${state} crowd is not a low-detail placeholder`);
    assert.equal(createHash('sha256').update(image.bytes).digest('hex'), expected.hash);
  }
  assert.equal(CROWD_ANIMATION.frameWidth * CROWD_ANIMATION.displayScale,
    CROWD_ANIMATION.displayWidth);
  assert.equal(CROWD_ANIMATION.frameHeight * CROWD_ANIMATION.displayScale,
    CROWD_ANIMATION.displayHeight);
});

test('all thirty frames keep one canonical roster, fixed rails, and distinct face tiles', () => {
  const decoded = Object.fromEntries(Object.keys(ASSETS).map((state) => [
    state,
    decodeRgbSheet(new URL(`../public/assets/hd/crowd-${state}-sheet-v3.png`, import.meta.url))
  ]));
  const base = atlasFrame(decoded.moving, 0);

  for (const [state, image] of Object.entries(decoded)) {
    assert.deepEqual(atlasFrame(image, 0), base, `${state} opens on the canonical cast`);
    const spriteHashes = [];
    for (let frameIndex = 0; frameIndex < CROWD_ANIMATION.frameCount; frameIndex++) {
      const frame = atlasFrame(image, frameIndex);
      spriteHashes.push(createHash('sha1').update(frame).digest('hex'));
      for (let rosterRow = 0; rosterRow < 7; rosterRow++) {
        const railY = rosterRow * 28 + 25;
        assert.deepEqual(
          frameRegion(frame, 0, railY, CROWD_ANIMATION.frameWidth, 3),
          frameRegion(base, 0, railY, CROWD_ANIMATION.frameWidth, 3),
          `${state} frame ${frameIndex} keeps rail ${rosterRow} planted`
        );
      }
    }
    assert.equal(
      new Set(spriteHashes).size,
      CROWD_ANIMATION.frameCount,
      `${state} contains ten pixel-distinct authored sprites`
    );
  }

  const faceSignatures = [];
  for (let rosterRow = 0; rosterRow < 7; rosterRow++) {
    for (let supporter = 0; supporter < 64; supporter++) {
      const face = frameRegion(base, supporter * 15 + 3, rosterRow * 28, 9, 12);
      faceSignatures.push(createHash('sha1').update(face).digest('hex'));
    }
  }
  assert.equal(
    new Set(faceSignatures).size,
    faceSignatures.length,
    'all 448 visible supporter face tiles are unique'
  );
});

test('animated frames are bounded rigid motions of the same supporter groups', () => {
  const decoded = Object.fromEntries(Object.keys(ASSETS).map((state) => [
    state,
    decodeRgbSheet(new URL(`../public/assets/hd/crowd-${state}-sheet-v3.png`, import.meta.url))
  ]));
  const base = atlasFrame(decoded.moving, 0);
  for (const [state, image] of Object.entries(decoded)) {
    for (let frameIndex = 1; frameIndex < CROWD_ANIMATION.frameCount; frameIndex++) {
      const frame = atlasFrame(image, frameIndex);
      for (let rosterRow = 0; rosterRow < 7; rosterRow++) {
        for (let group = 0; group < 16; group++) {
          assert.ok(
            rigidGroupSimilarity(base, frame, rosterRow, group) >= 0.78,
            `${state} frame ${frameIndex}, row ${rosterRow}, group ${group} preserves identity pixels`
          );
        }
      }
    }
  }
});

test('registering clips is idempotent and skips textures that are not resident yet', () => {
  const scene = fakeScene();
  registerCrowdAnimations(scene);
  assert.equal(scene.animations.size, 3);
  registerCrowdAnimations(scene);
  assert.equal(scene.animations.size, 3);
  for (const clip of Object.values(CROWD_ANIMATION.states)) {
    const animation = scene.animations.get(clip.animationKey);
    assert.equal(animation.frames.length, 10);
    assert.equal(animation.frameRate, clip.frameRate);
    assert.equal(animation.repeat, clip.repeat);
  }
});

test('goal and ball-out clips change frames without moving or resizing the crowd', () => {
  const scene = fakeScene();
  const sprite = fakeSprite();
  const dressing = { celebrations: 0, celebrate() { this.celebrations++; } };
  const controller = new CrowdAnimationController(scene, sprite, dressing);
  const scheduled = [];
  const schedule = (delay, callback) => {
    const timer = { delay, callback, removed: false, remove() { this.removed = true; } };
    scheduled.push(timer);
    return timer;
  };
  const transform = () => ({
    x: sprite.x, y: sprite.y, scaleX: sprite.scaleX, scaleY: sprite.scaleY, depth: sprite.depth
  });

  controller.startAmbient();
  const fixed = transform();
  assert.equal(controller.currentState, 'moving');
  assert.equal(sprite.texture.key, crowdClip('moving').textureKey);

  controller.playGoal(schedule);
  assert.equal(controller.currentState, 'goal');
  assert.equal(sprite.texture.key, crowdClip('goal').textureKey);
  assert.equal(dressing.celebrations, 1);
  assert.deepEqual(transform(), fixed);

  const goalTimer = scheduled.at(-1);
  controller.playOut(schedule);
  assert.equal(goalTimer.removed, true, 'a newer reaction cancels the old settle timer');
  assert.equal(controller.currentState, 'out');
  assert.equal(sprite.texture.key, crowdClip('out').textureKey);
  assert.deepEqual(transform(), fixed);

  scheduled.at(-1).callback();
  assert.equal(controller.currentState, 'moving');
  assert.equal(sprite.texture.key, crowdClip('moving').textureKey);
  assert.deepEqual(transform(), fixed);
});

test('reduced motion keeps a state-specific still before returning to the moving still', () => {
  const scene = fakeScene();
  const sprite = fakeSprite();
  const controller = new CrowdAnimationController(scene, sprite, null, { reducedMotion: true });
  let settle = null;

  controller.startAmbient();
  assert.equal(sprite.played.length, 0);
  controller.playGoal((delay, callback) => {
    settle = { delay, callback, remove() {} };
    return settle;
  });
  assert.equal(sprite.texture.key, crowdClip('goal').textureKey);
  assert.equal(sprite.frame.name, crowdClip('goal').reactionFrame);
  assert.equal(settle.delay, 650);
  assert.equal(sprite.played.length, 0);
  settle.callback();
  assert.equal(sprite.texture.key, crowdClip('moving').textureKey);
  assert.equal(sprite.frame.name, 0);
});

test('renderer owns one immutable uniform scale and reactions never write transforms', () => {
  const renderer = fs.readFileSync(new URL('../src/art/CrowdStand.js', import.meta.url), 'utf8');
  const controller = fs.readFileSync(
    new URL('../src/systems/CrowdAnimationController.js', import.meta.url),
    'utf8'
  );
  const scaleCalls = renderer.match(/setScale\([^)]*\)/g) || [];
  assert.equal(scaleCalls.length, 1);
  assert.equal(scaleCalls[0].includes(','), false, 'the only scale call is uniform');
  assert.doesNotMatch(controller,
    /\.(?:setX|setY|setPosition|setScale|setDisplaySize|setOrigin|setDepth)\s*\(/);
  assert.match(controller, /setTexture\(clip\.textureKey/);
});

test('gameplay maps GOAL and the semantic ball-out MISS to distinct crowd reactions', () => {
  const game = fs.readFileSync(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8');
  assert.match(game, /playCrowdGoal\(\)/);
  assert.match(game, /playCrowdOut\(\)/);
  assert.match(game, /default:[\s\S]*?OFF TARGET[\s\S]*?this\.playCrowdOut\(\)/);
});
