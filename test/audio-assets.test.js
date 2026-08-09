import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AUDIO_SAMPLES } from '../src/systems/AudioSynth.js';

const SUPPLIED_AUDIO = Object.freeze({
  'kick-district-menu.mp3': '884058f1892728de58b25fe67193a1a15bd3c14babf6a9c8d65734d8c0ccefe2',
  'stadium-crowd-loop.mp3': 'a5d92db8a73ad42cb7ffbef1bb4f7ee89be436749e62aaa2037552e4680955b2',
  'post-impact.mp3': 'fe6d964a584fb03494dcaa28c42468e64537d17f24b818b2c34e2549540f48df',
  'ui-button-press.mp3': '99a93e83eac980e630e2291398677a08862dfa72de4a706b5b27681d65c59c48',
  'ball-strike.mp3': 'c15c8c2f452d8278a32d0059eaa3e6ed70ea14d15fda15da9b5fa03eefb9241a'
});

// Every supplied one-shot is 1.536s of 48kHz stereo with the sound itself
// buried partway in: 432ms for the button, 543ms for the strike, 900ms for the
// post. Marker windows are therefore offsets into a fixed runway, and both ends
// of that window have to stay on the tape.
const CLIP_SECONDS = 1.536;
const MEASURED_ONSET_SECONDS = Object.freeze({
  ui: 0.432,
  post: 0.9,
  strike: 0.543
});

test('all five supplied audio files ship byte-for-byte under stable runtime names', async () => {
  for (const [file, expected] of Object.entries(SUPPLIED_AUDIO)) {
    const bytes = await readFile(new URL(`../public/assets/audio/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
});

test('every sample marker starts on the sound and ends inside the clip', () => {
  for (const [name, sample] of Object.entries(AUDIO_SAMPLES)) {
    const start = sample.start ?? 0;
    const onset = MEASURED_ONSET_SECONDS[name];
    assert.ok(onset !== undefined, `${name} has no measured onset on record`);
    // The regression this guards: markers used to start at 0, so the window
    // opened and closed entirely inside the silent head. The clip was mute
    // while _playSample still reported success and suppressed the synth.
    assert.ok(start >= onset,
      `${name} marker starts at ${start}s, before its ${onset}s onset - it would play silence`);
    assert.ok(start < onset + 0.2,
      `${name} marker starts at ${start}s, too far past its ${onset}s onset - the attack is clipped`);
    assert.ok(start + sample.duration <= CLIP_SECONDS,
      `${name} marker runs to ${start + sample.duration}s, past the ${CLIP_SECONDS}s clip`);
    assert.ok(sample.duration > 0.05, `${name} marker is too short to be audible`);
  }
});

test('each sample maps to a distinct shipped file and runtime key', () => {
  const keys = new Set();
  const paths = new Set();
  for (const [name, sample] of Object.entries(AUDIO_SAMPLES)) {
    assert.ok(!keys.has(sample.key), `${name} reuses cache key ${sample.key}`);
    assert.ok(!paths.has(sample.path), `${name} reuses asset path ${sample.path}`);
    keys.add(sample.key);
    paths.add(sample.path);
    const file = sample.path.split('/').pop();
    assert.ok(file in SUPPLIED_AUDIO, `${name} points at unshipped file ${file}`);
  }
});
