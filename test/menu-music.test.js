import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { MENU_MUSIC, MenuMusicController } from '../src/systems/MenuMusic.js';

class FakeTarget {
  constructor() {
    this.listeners = new Map();
    this.hidden = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    this.listeners.get(type)?.forEach((listener) => listener({ type }));
  }
}

class FakeAudio extends FakeTarget {
  constructor() {
    super();
    this.paused = true;
    this.currentTime = 0;
    this.duration = 173.48;
    this.volume = 0;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.allowPlay = true;
  }

  play() {
    this.playCalls += 1;
    if (!this.allowPlay) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false;
    this.dispatch('play');
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls += 1;
    if (this.paused) return;
    this.paused = true;
    this.dispatch('pause');
  }

  removeAttribute() {}
  load() {}
}

function makeClock() {
  let now = 0;
  let nextId = 1;
  const frames = new Map();
  return {
    now: () => now,
    requestFrame(callback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (now < end) {
        now = Math.min(now + 16, end);
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(now));
      }
    }
  };
}

function makeController(audio = new FakeAudio()) {
  const clock = makeClock();
  const documentRef = new FakeTarget();
  const windowRef = new FakeTarget();
  const controller = new MenuMusicController({
    createAudio: () => audio,
    getDocument: () => documentRef,
    getWindow: () => windowRef,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame
  });
  return { audio, clock, controller, documentRef, windowRef };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

test('the shipped menu soundtrack is the supplied MP3 byte-for-byte', async () => {
  const bytes = await readFile(new URL('../public/assets/audio/kick-district-menu.mp3', import.meta.url));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '884058f1892728de58b25fe67193a1a15bd3c14babf6a9c8d65734d8c0ccefe2'
  );
});

test('one persistent music instance survives menu panels and gameplay fades', async () => {
  const { audio, clock, controller } = makeController();
  controller.configure({ muted: false, musicVolume: 0.3 });
  controller.enterMenu();
  await settle();
  clock.advance(400);
  assert.equal(controller.getState().instanceCount, 1);
  assert.equal(controller.getState().musicVolume, 0.3);
  assert.ok(Math.abs(audio.volume - 0.3) < 0.001);

  audio.currentTime = 73.25;
  controller.enterMenu();
  await settle();
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.currentTime, 73.25);

  controller.leaveMenu();
  clock.advance(520);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 73.25);

  controller.enterMenu();
  await settle();
  clock.advance(340);
  assert.equal(audio.paused, false);
  assert.equal(audio.playCalls, 2);
  assert.equal(controller.getState().instanceCount, 1);
  assert.equal(audio.currentTime, 73.25);
});

test('autoplay denial is recovered by the first gesture without stacking playback', async () => {
  const audio = new FakeAudio();
  audio.allowPlay = false;
  const { clock, controller, windowRef } = makeController(audio);
  controller.enterMenu();
  await settle();
  assert.equal(controller.getState().autoplayBlocked, true);
  assert.equal(audio.paused, true);

  audio.allowPlay = true;
  windowRef.dispatch('pointerdown');
  await settle();
  clock.advance(340);
  assert.equal(audio.paused, false);
  assert.equal(audio.playCalls, 2);
  assert.equal(controller.getState().instanceCount, 1);
});

test('an immediate first gesture supersedes an unsettled autoplay rejection', async () => {
  const audio = new FakeAudio();
  audio.allowPlay = false;
  const { clock, controller, windowRef } = makeController(audio);
  controller.enterMenu();
  audio.allowPlay = true;
  windowRef.dispatch('pointerdown');
  await settle();
  clock.advance(340);

  assert.equal(audio.paused, false);
  assert.equal(audio.playCalls, 2);
  assert.equal(controller.getState().autoplayBlocked, false);
  assert.equal(controller.getState().instanceCount, 1);
});

test('mute, volume, visibility and native full-track looping update the live instance', async () => {
  const { audio, clock, controller } = makeController();
  controller.enterMenu();
  await settle();
  clock.advance(340);

  controller.setVolume(0.18);
  clock.advance(80);
  assert.ok(Math.abs(audio.volume - 0.18) < 0.001);

  controller.setMuted(true);
  clock.advance(60);
  assert.equal(audio.paused, true);
  controller.setMuted(false);
  await settle();
  clock.advance(340);
  assert.equal(audio.paused, false);

  controller.handleVisibility(true);
  assert.equal(audio.paused, true);
  controller.handleVisibility(false);
  await settle();
  clock.advance(340);
  assert.equal(audio.paused, false);
  assert.equal(audio.loop, true);
  assert.equal(controller.getState().loopMode, 'full-track');
  assert.equal(controller.getState().nativeLoop, true);
});
