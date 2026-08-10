import test from 'node:test';
import assert from 'node:assert/strict';
import {
  frameTimingSnapshot,
  integerPixelViewport,
  PIXEL_OUTPUT_H,
  PIXEL_OUTPUT_W,
  ThreePixelPipeline,
  syncPhaserInputScale
} from '../src/rendering/ThreePixelPipeline.js';

test('renderer timing snapshots report stable tail percentiles', () => {
  const snapshot = frameTimingSnapshot([4, 2, 1, 3, 20, NaN, -1]);
  assert.equal(snapshot.count, 5);
  assert.equal(snapshot.average, 6);
  assert.equal(snapshot.p95, 20);
  assert.equal(snapshot.p99, 20);
  assert.equal(snapshot.max, 20);
});

test('WebGL context loss exposes the live Phaser fallback and restores Three output', () => {
  const pipeline = new ThreePixelPipeline({ canvas: {} });
  pipeline.renderer = { domElement: { style: { display: 'block' } } };
  let prevented = false;
  let synced = 0;
  let rendered = 0;
  pipeline.syncViewport = () => { synced++; };
  pipeline.renderFrame = () => { rendered++; };

  pipeline.onContextLost({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(pipeline.contextLost, true);
  assert.equal(pipeline.renderer.domElement.style.display, 'none');

  pipeline.onContextRestored();
  assert.equal(pipeline.contextLost, false);
  assert.equal(pipeline.renderer.domElement.style.display, 'block');
  assert.equal(synced, 1);
  assert.equal(rendered, 1);
});

test('visible Three.js canvas fits the full-HD sprite frame without wasting the viewport', () => {
  const cases = [
    [1920, 1080, 1920, 1080, 1, true],
    [1440, 900, 1440, 810, 0.75, false],
    [1280, 720, 1280, 720, 2 / 3, false],
    [844, 390, 390 * 16 / 9, 390, 390 / 1080, false],
    [667, 375, 375 * 16 / 9, 375, 375 / 1080, false]
  ];
  for (const [availableWidth, availableHeight, width, height, scale, integer] of cases) {
    const viewport = integerPixelViewport(availableWidth, availableHeight);
    assert.ok(Math.abs(viewport.width - width) < 0.001);
    assert.ok(Math.abs(viewport.height - height) < 0.001);
    assert.ok(Math.abs(viewport.scale - scale) < 0.001);
    assert.equal(viewport.integer, integer);
    assert.ok(viewport.width <= availableWidth + 0.001);
    assert.ok(viewport.height <= availableHeight + 0.001);
    assert.ok(Math.abs(viewport.width / viewport.height - 16 / 9) < 0.001);
  }
  assert.equal(PIXEL_OUTPUT_W, 1920);
  assert.equal(PIXEL_OUTPUT_H, 1080);
});

test('portrait fallback remains a contained full-HD aspect frame', () => {
  const viewport = integerPixelViewport(300, 500);
  assert.equal(viewport.integer, false);
  assert.equal(viewport.width, 300);
  assert.ok(viewport.height <= 500);
});

test('dense compact screens use the same sprite-preserving aspect fit', () => {
  const viewport = integerPixelViewport(844, 390, { devicePixelRatio: 3 });
  assert.equal(viewport.integer, false);
  assert.equal(viewport.scale, 390 / 1080);
  assert.equal(viewport.width, 390 * 16 / 9);
  assert.equal(viewport.height, 390);
});

test('Phaser pointer coordinates follow the integer-scaled source canvas', () => {
  let updateCount = 0;
  let displayScale = null;
  const scaleManager = {
    canvasBounds: { width: 480, height: 270 },
    baseSize: { width: 480, height: 270 },
    updateBounds() { updateCount++; },
    displayScale: { set(x, y) { displayScale = { x, y }; } }
  };

  assert.equal(syncPhaserInputScale(scaleManager), true);
  assert.equal(updateCount, 1);
  assert.deepEqual(displayScale, { x: 1, y: 1 });

  scaleManager.canvasBounds = { width: 960, height: 540 };
  assert.equal(syncPhaserInputScale(scaleManager), true);
  assert.deepEqual(displayScale, { x: 0.5, y: 0.5 });
});
