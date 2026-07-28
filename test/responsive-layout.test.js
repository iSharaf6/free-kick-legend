import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('canvas is hard-contained at 16:9 in both short-wide and narrow-tall hosts', () => {
  assert.match(html, /width: min\(100%, calc\(100dvh \* 16 \/ 9\)\) !important/);
  assert.match(html, /height: auto !important/);
  assert.match(html, /max-width: 100%/);
  assert.match(html, /max-height: 100%/);
  assert.match(html, /aspect-ratio: 16 \/ 9/);
  assert.match(html, /margin: 0 !important/);
  assert.match(html, /#app[\s\S]*?overflow: hidden/);
});

test('portrait hosts always receive the rotate treatment, including desktop emulation', () => {
  assert.match(html, /@media \(orientation: portrait\) and \(max-width: 820px\)/);
  assert.doesNotMatch(html, /orientation: portrait[^\{]*pointer: coarse/);
});
