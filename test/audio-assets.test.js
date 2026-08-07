import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SUPPLIED_AUDIO = Object.freeze({
  'kick-district-menu.mp3': '884058f1892728de58b25fe67193a1a15bd3c14babf6a9c8d65734d8c0ccefe2',
  'stadium-crowd-loop.mp3': 'a5d92db8a73ad42cb7ffbef1bb4f7ee89be436749e62aaa2037552e4680955b2',
  'post-impact.mp3': 'fe6d964a584fb03494dcaa28c42468e64537d17f24b818b2c34e2549540f48df',
  'ui-button-press.mp3': '99a93e83eac980e630e2291398677a08862dfa72de4a706b5b27681d65c59c48'
});

test('all four supplied audio files ship byte-for-byte under stable runtime names', async () => {
  for (const [file, expected] of Object.entries(SUPPLIED_AUDIO)) {
    const bytes = await readFile(new URL(`../public/assets/audio/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
});
