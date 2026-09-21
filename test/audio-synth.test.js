import test from 'node:test';
import assert from 'node:assert/strict';

import { Synth } from '../src/systems/AudioSynth.js';

test('audio stays lazy through Boot and consumes an autoplay resume rejection', () => {
  const previousWindow = globalThis.window;
  let constructions = 0;
  let resumeRejectionsObserved = 0;

  class FakeAudioContext {
    constructor() {
      constructions++;
      this.state = 'suspended';
      this.sampleRate = 8000;
      this.destination = {};
    }

    createBuffer(_channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }

    createGain() {
      return { gain: { value: 0 }, connect() {} };
    }

    resume() {
      return {
        catch(callback) {
          resumeRejectionsObserved++;
          callback(new Error('autoplay denied'));
        }
      };
    }
  }

  globalThis.window = { AudioContext: FakeAudioContext };
  try {
    const synth = new Synth();
    synth.setMuted(false);
    assert.equal(constructions, 0, 'unmuting during Boot must not create WebAudio');

    assert.ok(synth._ensure(), 'the first real sound can create the context');
    assert.equal(constructions, 1);
    assert.equal(resumeRejectionsObserved, 1, 'the expected autoplay rejection is observed');
  } finally {
    globalThis.window = previousWindow;
  }
});

test('authored UI and frame clips use short SFX-bus markers', () => {
  const previousWindow = globalThis.window;
  const sounds = [];
  globalThis.window = {};
  try {
    const synth = new Synth();
    synth.setVolume(0.8);
    synth.bindSoundManager({
      add(key) {
        const sound = {
          key,
          isPlaying: false,
          marker: null,
          playConfig: null,
          listeners: new Map(),
          addMarker(marker) { this.marker = marker; },
          once(event, callback) { this.listeners.set(event, callback); },
          play(marker, config) {
            this.isPlaying = true;
            this.playConfig = { marker, ...config };
            return true;
          },
          setVolume(value) { this.volume = value; },
          destroy() { this.destroyed = true; }
        };
        sounds.push(sound);
        return sound;
      }
    });

    synth.ui();
    synth.post('crossbar');

    assert.equal(sounds[0].key, 'audio-ui-button-press');
    assert.equal(sounds[0].marker.duration, 0.22);
    assert.equal(sounds[0].playConfig.volume, 0.4);
    assert.equal(sounds[1].key, 'audio-post-impact');
    assert.equal(sounds[1].marker.duration, 0.5);
    assert.equal(sounds[1].playConfig.rate, 1.08);
    assert.equal(synth.lastSample.name, 'post');

    // Both clips were authored with a long silent lead-in. A marker starting at
    // zero expires inside that silence, which is exactly how these two samples
    // shipped mute while still reporting success and muting the synth fallback.
    assert.ok(sounds[0].marker.start > 0.5, `ui marker must skip the silent head, got ${sounds[0].marker.start}`);
    assert.ok(sounds[1].marker.start > 0.85, `post marker must skip the silent head, got ${sounds[1].marker.start}`);

    synth.setMuted(true);
    assert.equal(sounds[0].volume, 0);
    assert.equal(sounds[1].volume, 0);
  } finally {
    globalThis.window = previousWindow;
  }
});

// Records what a sound is built from without needing an AudioContext.
function recordingSynth() {
  const synth = new Synth();
  const tones = [];
  const noises = [];
  synth._tone = (options) => tones.push(options);
  synth._noise = (options) => noises.push(options);
  synth.cheer = () => {};
  return { synth, tones, noises };
}

const FANFARE_ROOT = [523, 659, 784, 1047];
const fanfareOf = (tones) => tones.filter((tone) => tone.type === 'triangle').map((tone) => tone.freq);

test('a goal with no streak plays the fanfare exactly as authored', () => {
  for (const streak of [undefined, 0, -3, NaN, 'x']) {
    const { synth, tones } = recordingSynth();
    synth.goal(streak);
    assert.deepEqual(fanfareOf(tones), FANFARE_ROOT, `streak ${String(streak)} must not transpose`);
  }
});

test('a goal streak lifts the fanfare a semitone per goal and stops at a fifth', () => {
  const semitone = Math.pow(2, 1 / 12);
  let previous = null;
  for (let streak = 0; streak <= 7; streak++) {
    const { synth, tones } = recordingSynth();
    synth.goal(streak);
    const root = fanfareOf(tones)[0];
    assert.ok(Math.abs(root - 523 * Math.pow(semitone, streak)) < 1e-6);
    if (previous !== null) assert.ok(root > previous, 'every goal in a run must sound higher than the last');
    previous = root;
  }

  // Capped: a 40-goal run must not climb into a whistle.
  const capped = recordingSynth();
  capped.synth.goal(40);
  const seventh = recordingSynth();
  seventh.synth.goal(7);
  assert.deepEqual(fanfareOf(capped.tones), fanfareOf(seventh.tones));

  // The whole chord moves together, so it stays a major arpeggio at any height.
  const lifted = fanfareOf(seventh.tones);
  FANFARE_ROOT.forEach((freq, index) => {
    assert.ok(Math.abs(lifted[index] / lifted[0] - freq / FANFARE_ROOT[0]) < 1e-9);
  });
});

test('the impact under a goal is identical at any streak: only the melody climbs', () => {
  const low = (tones) => tones.find((tone) => tone.type === 'sine' && tone.freq < 200);
  const a = recordingSynth(); a.synth.goal(0);
  const b = recordingSynth(); b.synth.goal(7);
  assert.deepEqual(low(a.tones), low(b.tones));
  assert.deepEqual(a.noises, b.noises);
});

test('every kind of stop has a low body under it instead of one shared hiss', () => {
  const signatures = new Map();
  for (const kind of ['parry', 'catch', 'wall']) {
    const { synth, tones, noises } = recordingSynth();
    synth.save(kind);
    const thump = tones.find((tone) => tone.type === 'sine' && tone.freq <= 130 && tone.end < tone.freq);
    assert.ok(thump, `${kind} needs a falling low thump`);
    assert.ok(noises.length >= 1, `${kind} needs a contact transient`);
    // Bounded: a stop must never be louder than the goal it denies (0.4).
    for (const layer of [...tones, ...noises]) assert.ok(layer.vol > 0 && layer.vol <= 0.3, `${kind} layer vol ${layer.vol}`);
    signatures.set(kind, JSON.stringify({ tones, noises }));
  }
  assert.equal(new Set(signatures.values()).size, 3, 'parry, catch and wall must be three different sounds');

  // The glove slap is the brightest, fastest transient of the three.
  const parry = recordingSynth(); parry.synth.save('parry');
  const catchIt = recordingSynth(); catchIt.synth.save('catch');
  const brightest = (noises) => Math.max(...noises.map((noise) => noise.freq));
  assert.ok(brightest(parry.noises) > brightest(catchIt.noises));
});

test('save() with no argument still makes a sound for existing callers', () => {
  const { synth, tones, noises } = recordingSynth();
  synth.save();
  assert.ok(tones.length + noises.length > 0);
});
