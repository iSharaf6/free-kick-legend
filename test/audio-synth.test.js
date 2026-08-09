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
