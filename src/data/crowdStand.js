// The supporters' end, as data.
//
// The authored art is one 1819x308 strip holding four rows of roughly 26
// hand-drawn supporters. The stand this replaces drew that entire strip twice -
// once at 290x49 and once at 201x34 - and mirrored alternate copies. On a 480px
// stand that is a 290px repeat with a mirror line through it, so the same
// supporters appeared four times across the frame, twice facing themselves.
//
// A stand cannot be seamless while its unit of repetition is the whole artwork.
// So the strip is cut into 29 vertical slices along columns that fall in the
// dark gaps *between* supporters, and each tier lays those slices down in its
// own deterministic shuffle. Nothing here touches Phaser: it is all pure
// functions over numbers, so the layout is asserted in a unit test rather than
// eyeballed in a screenshot.

const SOURCE_WIDTH = 1819;
const SOURCE_HEIGHT = 308;

// Cut columns, chosen offline by minimising vertical seam energy down the whole
// strip: sum over y of |luma(x-1,y) - luma(x+1,y)|, weighted towards the front
// rows because those render largest, plus a penalty for crossing skin tones.
// Every one of them lands in the shadow between two supporters, which is what
// lets an arbitrary slice order - and an arbitrary mirror - join without
// bisecting a face.
//
// Ascending, first entry 0, last entry SOURCE_WIDTH: 30 boundaries describing
// the 29 slices between them.
const CUT_COLUMNS = Object.freeze([
  0, 59, 132, 181, 227, 275, 353, 429, 506, 568,
  639, 687, 733, 794, 864, 937, 992, 1048, 1126, 1176,
  1249, 1310, 1367, 1426, 1480, 1539, 1613, 1665, 1740, 1819
]);

// Horizontal bands of the artwork. Each tier samples a different band, so the
// identical four rows of faces never appear twice in one stand. Bands overlap
// on purpose: a real stand holds the same kinds of people at every height, and
// overlapping them lets every tier carry whole head-to-waist supporters instead
// of a row of decapitated shoulders.
export const CROWD_BANDS = Object.freeze({
  back: Object.freeze({ id: 'back', y: 0, height: 228 }),    // rows 0-2, read small
  mid: Object.freeze({ id: 'mid', y: 74, height: 154 }),     // rows 1-2
  front: Object.freeze({ id: 'front', y: 165, height: 143 }) // row 3 + the authored rail
});

/**
 * Tiers, back to front.
 *
 * `top`/`bottom` are logical y in the 480x270 play space. Consecutive tiers
 * overlap deliberately - the front of a stand always hides the waists of the
 * row behind it, and the overlap makes it structurally impossible for the empty
 * stand behind to show through, including while a tier is lifted mid-bob.
 *
 * Every slice in a tier is drawn at one uniform scale derived from its height
 * and its band height, so a supporter cannot be stretched on a single axis.
 * The old stand measured that risk with an aspect-error assertion over
 * hand-authored width/height pairs; deriving a single scalar removes the
 * failure mode instead of checking for it.
 */
const TIERS = Object.freeze([
  Object.freeze({
    id: 'back',
    band: 'back',
    top: 20,
    bottom: 45,
    depth: 1.12,
    // Neutral grey tints change exposure only. The old cool blue-grey tints
    // replaced the panorama's navy, gold, burgundy and skin-tone ramps.
    tint: 0xcdcdcd,
    alpha: 1,
    bobScale: 0.4,       // distant supporters barely register individual movement
    tintJitter: 5,       // subtle exposure wobble, never a hue shift
    seed: 0x51f3a7
  }),
  Object.freeze({
    id: 'mid',
    band: 'mid',
    top: 42,
    bottom: 66,
    depth: 1.22,
    tint: 0xe6e6e6,
    alpha: 1,
    bobScale: 0.72,
    tintJitter: 5,
    seed: 0x2c9b41
  }),
  Object.freeze({
    id: 'front',
    band: 'front',
    top: 62,
    bottom: 88,
    depth: 1.3,
    // The closest bank is effectively native artwork, with only tiny seeded
    // exposure variation to stop neighbouring slices reading as a tiled strip.
    tint: 0xffffff,
    alpha: 1,
    bobScale: 1,
    tintJitter: 3,
    seed: 0x7ad25e
  })
]);

export const CROWD_STAND = Object.freeze({
  // Geometry remains shared with StandDressing; supporter pixels now come
  // exclusively from crowdAnimation.js and its generated v3 pose atlas.
  sourceWidth: SOURCE_WIDTH,
  sourceHeight: SOURCE_HEIGHT,
  cutColumns: CUT_COLUMNS,
  sliceCount: CUT_COLUMNS.length - 1,
  bands: CROWD_BANDS,
  tiers: TIERS,
  // Slices are laid past both edges so a tier never stops mid-frame.
  bleed: 12,
  // The stand is wider than the artwork, so some supporters must appear twice.
  // What matters is how far apart: this many seats between two uses puts a
  // repeat 70-160 logical pixels away depending on the tier, which is past the
  // distance at which the eye pairs two faces up.
  minSliceSeparation: 12,
  // Everything the stand draws lives between these depths. The goal celebration
  // overlay is pinned at 1.34 (e2e/release.spec.js) and the stewards sit at
  // 1.40, so the whole crowd has to stay underneath both.
  depthFloor: 1.02,
  depthCeiling: 1.33
});

// Vertical bob only, in whole logical pixels. Nothing in the crowd may write a
// size: the previous stand looked stretched for exactly as long as its ambient
// loop animated display height.
export const CROWD_MOTION = Object.freeze({
  ambientLifts: Object.freeze([0, 0, 1, 1, 0, 0, 1, 0]),
  ambientFrameMs: 240,
  // A goal is a wave, not a hop. Each slice reads `goalLifts` at an offset that
  // grows with its x position, so the stand goes up in sequence across the
  // frame the way a real one does, instead of every supporter leaving the
  // ground on the same frame.
  goalLifts: Object.freeze([0, 1, 3, 4, 4, 3, 2, 1, 0, 0]),
  goalFrameMs: 56,
  goalFrames: 18,
  // Logical pixels of stand the wave front crosses per frame. 480px of stand at
  // 60px/frame is 8 frames, which lands the whole burst inside the ~1050ms the
  // goal celebration is on screen.
  waveSpeed: 60,
  // Ambient phase step between neighbouring slices, so a resting crowd ripples
  // along its length instead of breathing in unison.
  slicePhaseStride: 3
});

// How many recently-seated slices a refilled bag holds back. Tuned against
// CROWD_STAND.minSliceSeparation: a slice used in the last `SLICE_COOLDOWN`
// draws of one bag cannot be drawn until the same depth of the next one.
const SLICE_COOLDOWN = 14;

/** Deterministic 32-bit PRNG: same seed, same stand, every boot and every test. */
export function crowdRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw slice indices so every slice is used once before any is used twice -
 * the bag shuffle a falling-block game uses for its pieces.
 *
 * A plain `random() * count` sequence is what makes procedural crowds look
 * wrong: it clusters, so one face lands three seats from itself while another
 * supporter never appears at all. Exhausting a shuffled bag guarantees the
 * largest possible distance between two uses of the same slice.
 */
export function crowdSliceBag(count, random, cooldown = SLICE_COOLDOWN) {
  if (!Number.isInteger(count) || count < 1) {
    throw new TypeError('Crowd slice bag needs a positive slice count');
  }
  const hold = Math.max(0, Math.min(cooldown, count - 1));
  let bag = [];
  let recent = [];

  return function draw() {
    if (!bag.length) {
      bag = Array.from({ length: count }, (_, index) => index);
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // Exhausting a bag alone only spaces repeats within one bag: across a
      // refill the tail of the old bag can land beside the head of the new one,
      // seating the same supporter a couple of seats from himself. Slices used
      // at the end of the last bag are therefore moved to the *front* of this
      // one - and `pop` draws from the back - so they come out last.
      const blocked = [];
      const free = [];
      for (const index of bag) (recent.includes(index) ? blocked : free).push(index);
      bag = blocked.concat(free);
    }
    const index = bag.pop();
    recent.push(index);
    if (recent.length > hold) recent = recent.slice(-hold);
    return index;
  };
}

/** Source rectangle of one slice within one band, in texture pixels. */
export function crowdSliceRect(bandId, sliceIndex) {
  const band = CROWD_BANDS[bandId];
  if (!band) throw new RangeError(`Unknown crowd band: ${bandId}`);
  if (!Number.isInteger(sliceIndex) || sliceIndex < 0 || sliceIndex >= CROWD_STAND.sliceCount) {
    throw new RangeError(`Crowd slice index out of range: ${sliceIndex}`);
  }
  const x = CUT_COLUMNS[sliceIndex];
  return { x, y: band.y, width: CUT_COLUMNS[sliceIndex + 1] - x, height: band.height };
}

/** Phaser frame name for a slice, so the atlas is registered once at boot. */
export function crowdSliceFrameName(bandId, sliceIndex) {
  return `crowd-${bandId}-${sliceIndex}`;
}

/** Every frame the renderer needs, ready to register on the loaded texture. */
export function crowdSliceFrames() {
  const frames = [];
  for (const bandId of Object.keys(CROWD_BANDS)) {
    for (let index = 0; index < CROWD_STAND.sliceCount; index++) {
      frames.push({ name: crowdSliceFrameName(bandId, index), ...crowdSliceRect(bandId, index) });
    }
  }
  return frames;
}

/** The one scalar every slice in a tier is drawn at. */
export function crowdTierScale(tier) {
  const band = CROWD_BANDS[tier.band];
  if (!band) throw new RangeError(`Unknown crowd band: ${tier.band}`);
  const height = tier.bottom - tier.top;
  if (!(height > 0)) throw new RangeError(`Crowd tier ${tier.id} has no height`);
  return height / band.height;
}

/**
 * Lay one tier across the stand.
 *
 * Slice positions accumulate in exact floating point instead of being rounded
 * per slice: each slice starts precisely where the previous one ended, so no
 * gap can open between two of them. The game runs with `roundPixels: false`
 * (src/main.js), so that exactness survives all the way to the draw call.
 */
export function buildCrowdTierLayout(tier, viewWidth, { bleed = CROWD_STAND.bleed } = {}) {
  if (!Number.isFinite(viewWidth) || viewWidth <= 0) {
    throw new TypeError('Crowd layout needs a positive view width');
  }
  const scale = crowdTierScale(tier);
  const random = crowdRandom(tier.seed);
  const draw = crowdSliceBag(CROWD_STAND.sliceCount, random);
  const slices = [];

  let x = -bleed;
  let column = 0;
  while (x < viewWidth + bleed) {
    const index = draw();
    const width = (CUT_COLUMNS[index + 1] - CUT_COLUMNS[index]) * scale;
    slices.push({
      index,
      x,
      width,
      centreX: x + width / 2,
      // Mirroring is a coin flip per slice, never index parity. Parity is what
      // put a mirror line through the middle of every old tile boundary.
      flipX: random() < 0.5,
      // Signed brightness offset applied to the tier tint.
      tintShift: Math.round((random() * 2 - 1) * tier.tintJitter),
      // Ambient phase; the goal wave phase is derived from centreX instead.
      bobPhase: column * CROWD_MOTION.slicePhaseStride
    });
    x += width;
    column++;
  }

  return { tierId: tier.id, band: tier.band, scale, slices };
}

/** Every tier laid out, back to front. */
export function buildCrowdStandLayout(viewWidth, tiers = TIERS) {
  return tiers.map((tier) => ({ tier, ...buildCrowdTierLayout(tier, viewWidth) }));
}

/**
 * Lift of one slice on frame `frame` of the goal wave.
 *
 * The wave front travels left to right at `waveSpeed` logical pixels per frame;
 * a slice only starts rising once the front reaches it.
 */
export function crowdWaveLift(centreX, frame, bobScale = 1) {
  const { goalLifts, waveSpeed } = CROWD_MOTION;
  const step = frame - Math.floor(centreX / waveSpeed);
  if (step < 0 || step >= goalLifts.length) return 0;
  return Math.round(goalLifts[step] * bobScale);
}
