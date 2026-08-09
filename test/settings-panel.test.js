import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { DEFAULT_SETTINGS } from '../src/systems/SaveManager.js';
import { applyDocumentSettings } from '../src/systems/SettingsPanel.js';

function fakeRoot() {
  const classes = new Set();
  return {
    classes,
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      }
    }
  };
}

test('default settings expose every player-facing accessibility and audio control', () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    muted: false,
    musicVolume: 0.3,
    sfxVolume: 1,
    reducedMotion: false,
    screenShake: true,
    highContrast: false,
    aimAssist: 'full'
  });
});

test('document preferences independently apply high contrast and reduced motion', () => {
  const root = fakeRoot();
  assert.equal(applyDocumentSettings({ highContrast: true, reducedMotion: false }, root), true);
  assert.deepEqual([...root.classes], ['fkl-high-contrast']);

  applyDocumentSettings({ highContrast: false, reducedMotion: true }, root);
  assert.deepEqual([...root.classes], ['fkl-reduced-motion']);
  assert.equal(applyDocumentSettings({}, null), false);
});

test('mobile viewport preserves browser zoom while the game keeps single-finger control', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const viewport = html.match(/<meta name="viewport" content="([^"]+)"/i)?.[1] || '';
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(viewport, /maximum-scale\s*=\s*1/i);
  assert.match(html, /touch-action:\s*pinch-zoom/);
  assert.match(html, /touch-action:\s*pan-y pinch-zoom/);
});
