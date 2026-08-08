import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import zlib from 'node:zlib';

import { CROWD_ANIMATION } from '../src/data/crowdAnimation.js';
import {
  CROWD_BANDS,
  CROWD_MOTION,
  CROWD_STAND,
  buildCrowdStandLayout,
  buildCrowdTierLayout,
  crowdRandom,
  crowdSliceBag,
  crowdSliceFrames,
  crowdSliceRect,
  crowdTierScale,
  crowdWaveLift
} from '../src/data/crowdStand.js';

function pngDimensions(path) {
  const header = fs.readFileSync(path).subarray(0, 24);
  assert.equal(header.toString('ascii', 1, 4), 'PNG');
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20)
  };
}

test('crowd atlas uses quiet poses for ambience and every pose for goal celebration', () => {
  assert.deepEqual(CROWD_ANIMATION.ambientFrames, [0, 1, 0]);
  assert.deepEqual(CROWD_ANIMATION.goalFrames, [2, 3, 4, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual([...new Set([
    ...CROWD_ANIMATION.ambientFrames,
    ...CROWD_ANIMATION.goalFrames
  ])].sort(), [0, 1, 2, 3, 4, 5]);
});

test('runtime crowd sheet is an exact 2x3 atlas', () => {
  const dimensions = pngDimensions(new URL(
    '../public/assets/hd/crowd-animation-sheet-hd.png',
    import.meta.url
  ));
  assert.deepEqual(dimensions, {
    width: CROWD_ANIMATION.frameWidth * CROWD_ANIMATION.columns,
    height: CROWD_ANIMATION.frameHeight * CROWD_ANIMATION.rows
  });
});

test('crowd panorama crop is tight and contains no visible chroma pixels', () => {
  const path = new URL('../public/assets/hd/crowd-panorama-v3-clean.png', import.meta.url);
  const png = fs.readFileSync(path);
  const dimensions = pngDimensions(path);
  assert.deepEqual(dimensions, {
    width: CROWD_STAND.sourceWidth,
    height: CROWD_STAND.sourceHeight
  });

  let offset = 8;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = dimensions.width * 4 + 1;
  for (let y = 0; y < dimensions.height; y++) {
    assert.equal(raw[y * stride], 0, 'runtime crowd rows use deterministic PNG filter 0');
    for (let x = 0; x < dimensions.width; x++) {
      const i = y * stride + 1 + x * 4;
      const [r, g, b, a] = raw.subarray(i, i + 4);
      if (a === 0) {
        assert.deepEqual([r, g, b], [0, 0, 0]);
      } else {
        const looksLikeChroma = r >= 128 && b >= 128 && g <= 96
          && r - g >= 80 && b - g >= 80 && Math.abs(r - b) <= 72;
        assert.equal(looksLikeChroma, false, `visible chroma pixel at ${x},${y}`);
      }
    }
  }
});

test('cut columns span the artwork and each slice is about one supporter wide', () => {
  const cuts = CROWD_STAND.cutColumns;
  assert.equal(cuts.every(Number.isInteger), true);
  assert.equal(cuts[0], 0);
  assert.equal(cuts.at(-1), CROWD_STAND.sourceWidth);
  assert.equal(CROWD_STAND.sliceCount, cuts.length - 1);

  for (let i = 0; i < cuts.length - 1; i++) {
    const width = cuts[i + 1] - cuts[i];
    assert.ok(width > 0, `cut columns must ascend, but slice ${i} is ${width}px wide`);
    // A supporter is roughly 70 source px across. Slices much narrower than
    // half of one stop reading as people; much wider than two and the shuffle
    // has too few distinct pieces to hide a repeat.
    assert.ok(width >= 35 && width <= 140,
      `slice ${i} is ${width}px, outside one supporter's range`);
  }
});

test('every tier is drawn at one uniform scale, so a supporter cannot be stretched', () => {
  // This replaces the old aspect-error assertion. That one measured
  // hand-authored width/height pairs against the source ratio and tolerated 1%
  // of distortion; deriving a single scalar per tier removes the failure mode
  // rather than measuring how close to it the numbers are.
  for (const tier of CROWD_STAND.tiers) {
    const band = CROWD_BANDS[tier.band];
    assert.ok(band, `${tier.id} names a real band`);
    assert.ok(band.y >= 0 && band.y + band.height <= CROWD_STAND.sourceHeight,
      `${tier.id} band stays inside the artwork`);

    const scale = crowdTierScale(tier);
    assert.ok(scale > 0 && scale < 1, `${tier.id} scale ${scale} is a downscale`);
    assert.equal(scale, (tier.bottom - tier.top) / band.height);

    // A slice's rendered box is its source rect times that one scalar, so the
    // rendered aspect is the source aspect at every slice, to the limits of
    // floating point. The old stand was allowed to be 1% wrong here by design.
    const rect = crowdSliceRect(tier.band, 0);
    const rendered = (rect.width * scale) / (rect.height * scale);
    const source = rect.width / rect.height;
    assert.ok(Math.abs(rendered - source) / source < 1e-12,
      `${tier.id} renders at ${rendered} against a source aspect of ${source}`);
  }
});

test('tiers ramp in size, height and brightness so the stand reads as depth', () => {
  const tiers = CROWD_STAND.tiers;
  assert.ok(tiers.length >= 3, 'the stand is layered for depth');

  for (let i = 1; i < tiers.length; i++) {
    const behind = tiers[i - 1];
    const front = tiers[i];
    assert.ok(crowdTierScale(front) > crowdTierScale(behind),
      `${front.id} supporters render larger than ${behind.id}`);
    assert.ok(front.bottom > behind.bottom, `${front.id} sits lower in frame than ${behind.id}`);
    assert.ok(front.tint > behind.tint, `${behind.id} is the darker of the two`);
    assert.ok(front.depth > behind.depth, `${front.id} draws in front of ${behind.id}`);
    // Consecutive tiers must overlap, or the empty stand shows through between
    // them - including while a tier is lifted mid-bob.
    assert.ok(front.top < behind.bottom,
      `${front.id} overlaps ${behind.id} instead of leaving a seam`);
  }
});

test('the whole stand stays under the goal celebration and steward depths', () => {
  // e2e/release.spec.js pins the celebration overlay at depth 1.34 and the
  // stewards sit at 1.40. Anything the crowd draws above those silently hides
  // authored art, which no other assertion would notice.
  for (const tier of CROWD_STAND.tiers) {
    assert.ok(tier.depth >= CROWD_STAND.depthFloor && tier.depth <= CROWD_STAND.depthCeiling,
      `${tier.id} tier depth ${tier.depth} is inside the stand's depth budget`);
  }
  assert.ok(CROWD_STAND.depthCeiling < 1.34, 'the stand stays behind the celebration overlay');
});

test('slice frames cover every band and never leave the artwork', () => {
  const frames = crowdSliceFrames();
  assert.equal(frames.length, Object.keys(CROWD_BANDS).length * CROWD_STAND.sliceCount);
  assert.equal(new Set(frames.map((frame) => frame.name)).size, frames.length,
    'every frame name is unique');
  for (const frame of frames) {
    assert.ok(frame.width > 0 && frame.height > 0);
    assert.ok(frame.x + frame.width <= CROWD_STAND.sourceWidth);
    assert.ok(frame.y + frame.height <= CROWD_STAND.sourceHeight);
  }
});

test('a tier covers the stand edge to edge with no gap between slices', () => {
  for (const tier of CROWD_STAND.tiers) {
    const { slices } = buildCrowdTierLayout(tier, 480);
    assert.ok(slices.length > 0);
    assert.ok(slices[0].x <= -CROWD_STAND.bleed,
      `${tier.id} starts past the left edge of the frame`);

    for (let i = 0; i < slices.length - 1; i++) {
      // Exact float accumulation: a slice starts precisely where the previous
      // one ended, so no sub-pixel gap can open at a join.
      assert.equal(slices[i].x + slices[i].width, slices[i + 1].x,
        `${tier.id} slice ${i} does not meet slice ${i + 1}`);
    }
    const right = slices.at(-1).x + slices.at(-1).width;
    assert.ok(right >= 480 + CROWD_STAND.bleed,
      `${tier.id} stops at ${right} and leaves the right edge bare`);
  }
});

test('no supporter slice repeats until every other slice has been used', () => {
  // The bag shuffle is the whole reason the stand no longer reads as a repeat.
  // A plain random pick would cluster: the same face three seats away, while
  // other supporters never appear at all.
  for (const tier of CROWD_STAND.tiers) {
    const { slices } = buildCrowdTierLayout(tier, 480);
    const indices = slices.map((slice) => slice.index);

    // The stand is wider than the artwork, so repeats are unavoidable; what is
    // avoidable is a repeat close enough to notice. A plain random pick would
    // seat the same face two or three places away several times per tier.
    const lastSeen = new Map();
    indices.forEach((index, position) => {
      const previous = lastSeen.get(index);
      if (previous !== undefined) {
        assert.ok(position - previous >= CROWD_STAND.minSliceSeparation,
          `${tier.id} repeats slice ${index} after only ${position - previous} seats`);
      }
      lastSeen.set(index, position);
    });
    // Every supporter in the artwork gets used, rather than the shuffle
    // favouring a subset and leaving the rest of the crowd unseen.
    assert.equal(lastSeen.size, CROWD_STAND.sliceCount,
      `${tier.id} leaves some of the authored supporters out of the stand`);
    // And the shuffle has to actually shuffle: source slices laid down in order
    // would be the old panorama with extra steps.
    const runs = slices.filter((slice, i) => i > 0 && slice.index === slices[i - 1].index + 1);
    assert.ok(runs.length < slices.length / 3,
      `${tier.id} is drawing the artwork in source order`);
  }
});

test('mirroring is a per-slice coin flip, not index parity', () => {
  // Parity is what put a mirror line through every tile boundary in the old
  // stand, so each seam showed two supporters facing themselves.
  for (const tier of CROWD_STAND.tiers) {
    const { slices } = buildCrowdTierLayout(tier, 480);
    const parity = slices.filter((slice, index) => slice.flipX === (index % 2 === 1));
    assert.notEqual(parity.length, slices.length, `${tier.id} mirrors on index parity`);
    const flipped = slices.filter((slice) => slice.flipX).length;
    assert.ok(flipped > 0 && flipped < slices.length, `${tier.id} flips some slices but not all`);
  }
});

test('the stand is deterministic, and each tier is shuffled differently', () => {
  const first = buildCrowdStandLayout(480);
  const second = buildCrowdStandLayout(480);
  assert.deepEqual(first, second, 'the same stand is built on every boot');

  const orders = first.map((tier) => tier.slices.map((slice) => slice.index).join(','));
  assert.equal(new Set(orders).size, orders.length, 'no two tiers share a shuffle');
});

test('the seeded generator and bag are reproducible', () => {
  const a = crowdRandom(1234);
  const b = crowdRandom(1234);
  for (let i = 0; i < 8; i++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }

  const bag = crowdSliceBag(5, crowdRandom(99));
  const cycle = Array.from({ length: 5 }, () => bag());
  assert.deepEqual([...cycle].sort((p, q) => p - q), [0, 1, 2, 3, 4],
    'a full bag yields every slice exactly once');
});

test('crowd motion moves y in whole pixels and never writes a size', () => {
  assert.equal(CROWD_MOTION.ambientLifts.every(Number.isInteger), true);
  assert.equal(CROWD_MOTION.goalLifts.every(Number.isInteger), true);
  assert.ok(Math.max(...CROWD_MOTION.ambientLifts) <= 1, 'a resting crowd barely moves');
  assert.ok(Math.max(...CROWD_MOTION.goalLifts) <= 4);
  assert.ok(CROWD_MOTION.slicePhaseStride >= 1, 'neighbouring slices bob out of phase');

  // The renderer may resize nothing. `setScale` with one scalar cannot distort
  // an axis; `setDisplaySize`, a two-argument `setScale`, and direct
  // scaleX/scaleY/displayWidth/displayHeight writes all can, so none of those
  // may appear in the file that owns the supporters.
  const source = fs.readFileSync(new URL('../src/art/CrowdStand.js', import.meta.url), 'utf8');
  assert.equal((source.match(/setDisplaySize/g) || []).length, 0);
  assert.equal(
    (source.match(/\.scaleX\s*=|\.scaleY\s*=|displayWidth\s*=|displayHeight\s*=/g) || []).length,
    0
  );
  const scaleCalls = source.match(/setScale\([^)]*\)/g) || [];
  assert.equal(scaleCalls.length, 1, 'slice size is written once, at construction');
  assert.equal(scaleCalls[0].includes(','), false, 'the one scale call takes a single scalar');
});

test('the goal wave travels across the stand instead of lifting it in unison', () => {
  const lifts = [];
  for (let frame = 0; frame < CROWD_MOTION.goalFrames; frame++) {
    lifts.push([0, 240, 479].map((x) => crowdWaveLift(x, frame, 1)));
  }

  const peakFrame = (column) => lifts.reduce(
    (best, row, frame) => (row[column] > lifts[best][column] ? frame : best), 0
  );
  assert.ok(peakFrame(0) < peakFrame(1), 'the wave reaches the middle after the left edge');
  assert.ok(peakFrame(1) < peakFrame(2), 'the wave reaches the right edge last');

  for (let column = 0; column < 3; column++) {
    assert.ok(Math.max(...lifts.map((row) => row[column])) > 0, `column ${column} joins the wave`);
  }
  assert.deepEqual(lifts.at(-1), [0, 0, 0], 'the stand has settled by the final frame');
  assert.equal(crowdWaveLift(479, 0, 1), 0, 'a slice the wave has not reached is still resting');
});

test('a lifted front-row slice never exposes the empty stand behind it', () => {
  const front = CROWD_STAND.tiers.at(-1);
  const maxLift = Math.max(...CROWD_MOTION.goalLifts) * front.bobScale;
  // The advertising hoardings start at y=83 (BOARD_TOP_Y in GameScene), so the
  // bottom edge of the front tier has to stay behind them even at full lift.
  assert.ok(front.bottom - maxLift >= 83,
    `front tier bottom ${front.bottom} lifts to ${front.bottom - maxLift}, above the hoardings`);
});
