import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addPitchSurface,
  buildPitchSurfaceLayout,
  paintPitchSurface,
  PITCH_SURFACE_PALETTE
} from '../src/art/PitchSurface.js';

function xAtY(topX, topY, bottomX, bottomY, y) {
  const progress = (y - topY) / (bottomY - topY);
  return topX + (bottomX - topX) * progress;
}

function makeGraphicsRecorder() {
  const calls = [];
  return {
    calls,
    fillStyle(color, alpha) { calls.push(['fillStyle', color, alpha]); return this; },
    fillRect(x, y, width, height) { calls.push(['fillRect', x, y, width, height]); return this; },
    beginPath() { calls.push(['beginPath']); return this; },
    moveTo(x, y) { calls.push(['moveTo', x, y]); return this; },
    lineTo(x, y) { calls.push(['lineTo', x, y]); return this; },
    closePath() { calls.push(['closePath']); return this; },
    fillPath() { calls.push(['fillPath']); return this; },
    setDepth(depth) { calls.push(['setDepth', depth]); this.depth = depth; return this; },
    setName(name) { calls.push(['setName', name]); this.name = name; return this; }
  };
}

test('procedural pitch covers the exact requested scene-space bounds', () => {
  const layout = buildPitchSurfaceLayout({
    x: 13,
    y: 104,
    width: 454,
    height: 166,
    horizon: { x: 239, y: 76 },
    seed: 91
  });

  assert.deepEqual(layout.bounds, {
    x: 13, y: 104, width: 454, height: 166, right: 467, bottom: 270
  });
  assert.equal(layout.cutBands[0].y, 104);
  assert.equal(layout.cutBands.at(-1).y + layout.cutBands.at(-1).height, 270);
  assert.ok(layout.flecks.every(({ x, y, width, height }) => (
    Number.isInteger(x) && Number.isInteger(y)
      && x >= 13 && x + width <= 467
      && y >= 104 && y + height <= 270
  )));
});

test('every mower lane converges on one configurable vanishing point', () => {
  const layout = buildPitchSurfaceLayout({
    x: 0, y: 104, width: 480, height: 166,
    horizon: { x: 228.5, y: 74 },
    laneCount: 14
  });

  assert.equal(layout.lanes.length, 14);
  for (const lane of layout.lanes) {
    for (const guide of [lane.leftGuide, lane.rightGuide]) {
      const intersection = xAtY(
        guide.farX, layout.bounds.y,
        guide.nearX, layout.bounds.bottom,
        layout.horizon.y
      );
      assert.ok(Math.abs(intersection - layout.horizon.x) < 1e-9);
    }
  }
});

test('surface detail is deterministic, sparse and changes with its seed', () => {
  const options = { x: 0, y: 80, width: 480, height: 190, seed: 1234 };
  const first = buildPitchSurfaceLayout(options);
  const again = buildPitchSurfaceLayout(options);
  const different = buildPitchSurfaceLayout({ ...options, seed: 1235 });

  assert.deepEqual(first.flecks, again.flecks);
  assert.deepEqual(first.microTufts, again.microTufts);
  assert.deepEqual(first.grassClusters, again.grassClusters);
  assert.deepEqual(first.goalmouthWear, again.goalmouthWear);
  assert.deepEqual(first.footWear, again.footWear);
  assert.deepEqual(first.cutBands, again.cutBands);
  assert.deepEqual(first.divots, again.divots);
  assert.notDeepEqual(first.flecks, different.flecks);
  assert.notDeepEqual(first.microTufts, different.microTufts);
  assert.notDeepEqual(first.grassClusters, different.grassClusters);
  assert.notDeepEqual(first.footWear, different.footWear);
  assert.notDeepEqual(first.cutBands, different.cutBands);
  assert.ok(first.detailBudget.coverage >= 0.005 && first.detailBudget.coverage <= 0.015,
    'multi-scale material detail stays within the authored 0.5-1.5% pixel budget');
  assert.ok(first.microTufts.some((tuft) => tuft.paired));
  assert.ok(first.microTufts.every((tuft) => tuft.alpha <= 0.23));
  assert.ok(first.grassClusters.every((cluster) => (
    cluster.strokes.length >= 4 && cluster.strokes.length <= 7
  )));
  assert.ok(first.grassClusters.filter((cluster) => (
    cluster.base.y > options.y + options.height * 0.55
  )).length > first.grassClusters.length * 0.65,
  'coherent clumps favour the near field where they survive full-HD viewing');
  assert.ok(first.divots.length < 20);
  assert.ok(first.goalmouthWear.length >= 12);
  assert.ok(first.goalmouthWear.every((mark) => mark.alpha <= 0.15));
  assert.ok(first.divots.every((divot) => (
    divot.soil === first.palette.soil &&
    divot.lip === first.palette.bladeLight &&
    divot.lipY <= divot.y
  )));
  assert.ok(Object.isFrozen(first.microTufts));
  assert.ok(Object.isFrozen(first.grassClusters));
});

test('mowing treatment is continuous, irregular and cannot resolve into a rectangular grid', () => {
  const layout = buildPitchSurfaceLayout({
    x: 0, y: 104, width: 480, height: 166, horizon: { x: 240, y: 76 }, seed: 221
  });

  assert.ok(layout.cutBands.every((band) => !('segments' in band)),
    'mower passes expose no rectangular cell/segment representation');
  assert.ok(layout.cutBands.every((band) => (
    band.points.length >= 20 && band.points[0].x === layout.bounds.x &&
    band.points.at(-1).x === layout.bounds.x
  )), 'each mower pass is a single full-width polygon with no internal hard ends');
  assert.ok(layout.cutBands.every((band, index, bands) => (
    index === bands.length - 1 ||
    band.bottomContour === bands[index + 1].topContour
  )), 'adjacent passes share one seamless irregular contour');
  assert.ok(layout.cutBands.slice(1, -1).every((band) => (
    new Set(band.topContour.map((point) => point.y)).size >= 2
  )), 'internal joins meander instead of drawing ruler-straight bars');
  assert.ok(layout.cutBands.every((band) => band.alpha <= 0.135),
    'cut direction stays softer than the material texture');
  assert.ok(layout.cutBands.every((band, index, bands) => (
    index === 0 || band.height >= bands[index - 1].height
  )), 'mower-pass depth grows toward the camera');
  assert.ok(layout.cutFeather.length >= 4 * (layout.cutBands.length - 1));
  assert.ok(layout.cutFeather.every((fragment) => (
    fragment.points.length === 3 &&
    Math.max(...fragment.points.map(({ x }) => x)) -
      Math.min(...fragment.points.map(({ x }) => x)) <= 4 &&
    fragment.alpha <= 0.03
  )), 'tiny tapered shards soften joins without rebuilding a tile grid');
  assert.ok(layout.lanes.every((lane) => lane.alpha <= 0.058));
  assert.equal(layout.lightPools.length, 2);
  assert.ok(layout.lightPools.every((pool) => pool.alpha <= 0.014));
  assert.ok(layout.lightPools.every((pool) => pool.points.length === 10));
  assert.ok(layout.lightPools.every((pool) => pool.points.every((point, index, points) => (
    point.y !== points[(index + 1) % points.length].y
  ))), 'floodlight silhouettes have no axis-aligned horizontal edge');
  assert.ok(layout.lightPools.every((pool) => {
    const nearSpan = pool.rightGuide.nearX - pool.leftGuide.nearX;
    const farSpan = pool.rightGuide.farX - pool.leftGuide.farX;
    return nearSpan > farSpan * 2.5;
  }), 'each subtle wash visibly narrows toward the horizon');
  assert.ok(layout.lightPools.every((pool) => (
    [pool.leftGuide, pool.rightGuide].every((guide) => {
      const intersection = xAtY(
        guide.farX, guide.farY,
        guide.nearX, guide.nearY,
        layout.horizon.y
      );
      return Math.abs(intersection - layout.horizon.x) < 1e-9;
    })
  )), 'light-pool sides share the pitch vanishing point');
  assert.ok(layout.lightPools.every((pool) => (
    pool.fragments.length === 7 && pool.fragments.every((fragment) => (
      fragment.width <= 3 && fragment.height === 1 && fragment.alpha <= 0.012
    ))
  )), 'detached one-pixel dither softens every light-pool perimeter');
});

test('light-pool dither cannot perturb accepted turf material placement', () => {
  const options = {
    x: 0, y: 104, width: 480, height: 166, horizon: { x: 240, y: 76 }, seed: 221
  };
  const lit = buildPitchSurfaceLayout(options);
  const unlit = buildPitchSurfaceLayout({ ...options, lightPools: false });

  assert.equal(unlit.lightPools.length, 0);
  for (const key of [
    'cutBands',
    'cutFeather',
    'goalmouthWear',
    'footWear',
    'microTufts',
    'grassClusters',
    'flecks',
    'divots',
    'detailBudget'
  ]) {
    assert.deepEqual(unlit[key], lit[key], `${key} stays byte-for-byte stable`);
  }
});

test('foot wear alternates along one projected run toward the goal', () => {
  const options = {
    x: 12, y: 96, width: 440, height: 174,
    horizon: { x: 235, y: 72 }, trafficOriginX: 210, seed: 501
  };
  const layout = buildPitchSurfaceLayout(options);
  const nearY = options.y + options.height;

  assert.ok(layout.footWear.length >= 10);
  assert.ok(layout.footWear.every((mark) => {
    const projectedCenter = xAtY(
      layout.horizon.x,
      layout.horizon.y,
      options.trafficOriginX,
      nearY,
      mark.y
    );
    return Math.abs(mark.x + mark.width / 2 - projectedCenter) <= 8;
  }));
  assert.ok(layout.footWear.some((mark) => mark.color === layout.palette.soil));
  assert.ok(layout.footWear.every((mark) => mark.alpha <= 0.2));
});

test('microtexture, wear and divot lips stay inside the pitch rectangle', () => {
  const layout = buildPitchSurfaceLayout({
    x: 17, y: 91, width: 211, height: 103, horizon: { x: 119, y: 62 }, seed: 9876
  });
  const { x, y, right, bottom } = layout.bounds;

  assert.ok(layout.microTufts.every((tuft) => (
    tuft.x >= x && tuft.x < right && tuft.y >= y && tuft.y < bottom &&
    tuft.tipX >= x && tuft.tipX < right && tuft.tipY >= y && tuft.tipY < bottom
  )));
  assert.ok(layout.goalmouthWear.every((mark) => (
    mark.x >= x && mark.x + mark.width <= right &&
    mark.y >= y && mark.y + mark.height <= bottom
  )));
  assert.ok(layout.footWear.every((mark) => (
    mark.x >= x && mark.x + mark.width <= right &&
    mark.y >= y && mark.y + mark.height <= bottom &&
    mark.lipX >= x && mark.lipX + Math.max(1, mark.width - 1) <= right &&
    mark.lipY >= y && mark.lipY < bottom
  )));
  assert.ok(layout.grassClusters.every((cluster) => (
    cluster.base.x >= x && cluster.base.x + cluster.base.width <= right &&
    cluster.base.y >= y && cluster.base.y + cluster.base.height <= bottom &&
    cluster.strokes.every((stroke) => (
      stroke.x >= x && stroke.x + stroke.width <= right &&
      stroke.y >= y && stroke.y + stroke.height <= bottom
    ))
  )));
  assert.ok(layout.divots.every((divot) => (
    divot.x >= x && divot.x + divot.width <= right &&
    divot.y >= y && divot.y + divot.height <= bottom &&
    divot.lipX >= x && divot.lipX + Math.max(1, divot.width - 1) <= right &&
    divot.lipY >= y && divot.lipY < bottom
  )));
});

test('Graphics renderer paints polygons and never needs a raster texture', () => {
  const graphics = makeGraphicsRecorder();
  const layout = paintPitchSurface(graphics, {
    x: 2, y: 8, width: 120, height: 72, horizon: { x: 62, y: -2 }, seed: 7
  });

  assert.deepEqual(graphics.calls.slice(0, 2), [
    ['fillStyle', PITCH_SURFACE_PALETTE.base, 1],
    ['fillRect', 2, 8, 120, 72]
  ]);
  assert.equal(graphics.calls.filter(([name]) => name === 'fillPath').length,
    layout.cutBands.length + layout.cutFeather.length + layout.lightPools.length +
      layout.lanes.length + layout.edgeShadows.length);
  assert.equal(graphics.calls.filter(([name, , , width]) => (
    name === 'fillRect' && width === layout.bounds.width
  )).length, 1, 'only the base fill spans the width; mower passes are polygons');
  assert.ok(graphics.calls.filter(([name]) => name === 'fillRect').slice(1).every((call) => (
    call[3] <= 12
  )), 'no material rectangle is large enough to become a visible pitch cell');
  assert.equal(graphics.calls.some(([name]) => name === 'image'), false);
  assert.ok(graphics.calls.some((call) => (
    call[0] === 'fillStyle' && call[1] === PITCH_SURFACE_PALETTE.soil
  )), 'renderer paints the warm soil core of a divot');
});

test('emerald palette keeps line and actor contrast while avoiding flat grey-green turf', () => {
  const red = (PITCH_SURFACE_PALETTE.base >> 16) & 0xff;
  const green = (PITCH_SURFACE_PALETTE.base >> 8) & 0xff;
  const blue = PITCH_SURFACE_PALETTE.base & 0xff;
  assert.ok(green >= 108 && green > red * 3.8 && green > blue * 1.45);
  assert.ok(PITCH_SURFACE_PALETTE.bladeLight > PITCH_SURFACE_PALETTE.base);
  assert.notEqual(PITCH_SURFACE_PALETTE.base, 0x216b42);
});

test('scene wrapper returns a named graphics object at the requested depth', () => {
  const graphics = makeGraphicsRecorder();
  const scene = { add: { graphics: () => graphics } };
  const result = addPitchSurface(scene, {
    x: 0, y: 24, width: 320, height: 156, horizon: 8, seed: 8, depth: -3
  });

  assert.equal(result, graphics);
  assert.equal(result.depth, -3);
  assert.equal(result.name, 'procedural-pitch-surface');
  assert.equal(result.pitchSurfaceLayout.bounds.width, 320);
  assert.ok(Object.isFrozen(result.pitchSurfaceLayout));
});

test('invalid perspective cannot leak drawing outside the requested region', () => {
  assert.throws(() => buildPitchSurfaceLayout({
    x: 20, y: 100, width: 200, height: 120, horizon: { x: 221, y: 60 }
  }), /horizon\.x/);
  assert.throws(() => buildPitchSurfaceLayout({
    x: 20, y: 100, width: 200, height: 120, horizon: { x: 120, y: 100 }
  }), /horizon\.y/);
});
