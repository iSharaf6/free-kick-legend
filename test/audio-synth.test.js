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
