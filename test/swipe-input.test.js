import test from 'node:test';
import assert from 'node:assert/strict';

import { SHOT } from '../src/config.js';
import { SwipeInput } from '../src/systems/SwipeInput.js';

class ScopedEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(name, fn, context) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push({ fn, context, once: false });
    this.listeners.set(name, listeners);
    return this;
  }

  once(name, fn, context) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push({ fn, context, once: true });
    this.listeners.set(name, listeners);
    return this;
  }

  off(name, fn, context) {
    const listeners = this.listeners.get(name) ?? [];
    this.listeners.set(name, listeners.filter((listener) => (
      listener.fn !== fn || (context !== undefined && listener.context !== context)
    )));
    return this;
  }

  emit(name, ...args) {
    const listeners = [...(this.listeners.get(name) ?? [])];
    for (const listener of listeners) {
      listener.fn.apply(listener.context, args);
      if (listener.once) this.off(name, listener.fn, listener.context);
    }
  }
}

function sceneStub() {
  return {
    input: new ScopedEmitter(),
    events: new ScopedEmitter(),
    time: { now: 0 }
  };
}

function pointer(id, x, y, time) {
  return { id, x, y, event: { timeStamp: time } };
}

test('a two-point flick is a valid bounded shot', () => {
  const scene = sceneStub();
  const shots = [];
  const swipe = new SwipeInput(scene, (shot) => shots.push(shot));
  swipe.enabled = true;

  scene.input.emit('pointerdown', pointer(1, 220, 240, 0));
  scene.input.emit('pointerup', pointer(1, 270, 115, 180));

  assert.equal(shots.length, 1);
  const shot = shots[0];
  assert.ok(shot.power >= 0 && shot.power <= 1);
  assert.ok(Math.abs(shot.vx) <= SHOT.maxVx);
  assert.ok(shot.vy >= SHOT.minVy && shot.vy <= SHOT.maxVy);
  assert.ok(shot.vz >= SHOT.minVz && shot.vz <= SHOT.maxVz);
  assert.equal(shot.spin, 0);
});

test('HD renderer gestures use camera world coordinates instead of doubled canvas pixels', () => {
  const scene = sceneStub();
  const shots = [];
  const swipe = new SwipeInput(scene, (shot) => shots.push(shot));
  swipe.enabled = true;

  scene.input.emit('pointerdown', { ...pointer(2, 440, 480, 0), worldX: 220, worldY: 240 });
  scene.input.emit('pointerup', { ...pointer(2, 540, 230, 180), worldX: 270, worldY: 115 });

  assert.equal(shots.length, 1);
  assert.ok(Math.abs(shots[0].vx - 50 * SHOT.vxPerPx * (0.78 + shots[0].power * 0.22)) < 1e-9);
});

test('only the pointer that began a swipe can move or release it', () => {
  const scene = sceneStub();
  const shots = [];
  const swipe = new SwipeInput(scene, (shot) => shots.push(shot));
  swipe.enabled = true;

  scene.input.emit('pointerdown', pointer(3, 200, 245, 0));
  scene.input.emit('pointermove', pointer(4, 470, 40, 40));
  scene.input.emit('pointerup', pointer(4, 470, 40, 60));
  assert.equal(shots.length, 0);
  assert.equal(swipe.activePointerId, 3);
  assert.equal(swipe.samples.length, 1);

  scene.input.emit('pointerup', pointer(3, 215, 120, 180));
  assert.equal(shots.length, 1);
  assert.equal(swipe.activePointerId, null);
});

test('high-frequency gestures keep their first point and bounded sample count', () => {
  const scene = sceneStub();
  const swipe = new SwipeInput(scene, () => {});
  swipe.enabled = true;

  scene.input.emit('pointerdown', pointer(7, 140, 250, 0));
  for (let i = 1; i <= 120; i++) {
    scene.input.emit('pointermove', pointer(7, 140 + i * 0.5, 250 - i, i * 3));
  }

  assert.ok(swipe.samples.length <= SHOT.maxSamples);
  assert.deepEqual(
    { x: swipe.samples[0].x, y: swipe.samples[0].y, t: swipe.samples[0].t },
    { x: 140, y: 250, t: 0 }
  );
  assert.deepEqual(
    { x: swipe.samples.at(-1).x, y: swipe.samples.at(-1).y },
    { x: 200, y: 130 }
  );
});

test('aggregate curvature creates spin without trusting one endpoint', () => {
  const scene = sceneStub();
  const shots = [];
  const swipe = new SwipeInput(scene, (shot) => shots.push(shot));
  swipe.enabled = true;

  scene.input.emit('pointerdown', pointer(2, 200, 245, 0));
  scene.input.emit('pointermove', pointer(2, 238, 205, 45));
  scene.input.emit('pointermove', pointer(2, 252, 155, 90));
  scene.input.emit('pointerup', pointer(2, 225, 95, 150));

  assert.equal(shots.length, 1);
  assert.ok(Math.abs(shots[0].spin) > 0.25);
  assert.ok(Math.abs(shots[0].spin) <= SHOT.maxSpin);
  assert.ok(Math.abs(shots[0].gesture.curve) > 5);
});

test('invalid gestures report a reason and cancellation clears state', () => {
  const scene = sceneStub();
  const invalid = [];
  const swipe = new SwipeInput(scene, () => {}, (reason) => invalid.push(reason));
  swipe.enabled = true;

  scene.input.emit('pointerdown', pointer(5, 200, 200, 0));
  scene.input.emit('pointerup', pointer(5, 205, 195, 100));
  assert.deepEqual(invalid, ['too-short']);

  scene.input.emit('pointerdown', pointer(6, 210, 230, 200));
  scene.input.emit('pointermove', pointer(6, 220, 150, 240));
  scene.input.emit('pointercancel', pointer(6, 220, 150, 250));
  assert.equal(swipe.activePointerId, null);
  assert.deepEqual(swipe.samples, []);

  scene.input.emit('pointerdown', pointer(8, 210, 230, 300));
  scene.input.emit('gameout');
  assert.equal(swipe.activePointerId, null);
});
