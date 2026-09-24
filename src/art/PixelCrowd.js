import { CROWD_MOTION, CROWD_STAND, crowdRandom } from '../data/crowdStand.js';

// The supporters, drawn as pixel people.
//
// The stand used to be a painted panorama sliced and shuffled across the
// tiers. On the game's real pixel grid those painted faces collapse into
// skin-coloured mush. Here every supporter is a tiny sprite with a head,
// hair, a shirt in club colours and arms - the way a crowd is drawn in a
// hand-made football game - and each one can react: bob while waiting, throw
// both arms up as the goal wave passes, or put both hands on their head when a
// shot goes close.
//
// All frames are painted once into one sprite sheet per tier (pure pixel
// writes, cached on the texture manager for the whole session), so the stand
// costs one image per tier at runtime and a frame swap per tick.

const SKIN = Object.freeze([[0xf1, 0xc2, 0x9a], [0xd9, 0xa0, 0x72], [0xb0, 0x76, 0x4c], [0x80, 0x52, 0x33], [0x5c, 0x3b, 0x26]]);
const HAIR = Object.freeze([[0x2a, 0x1e, 0x17], [0x4c, 0x32, 0x1f], [0x7a, 0x55, 0x2d], [0xc8, 0xa0, 0x5a], [0x9a, 0x9a, 0x96], [0x9c, 0x3e, 0x1d]]);
// Home end: mostly navy and gold, with the odd neutral and away shirt.
const SHIRTS = Object.freeze([
  [[0x1d, 0x3a, 0x6b], 26], [[0xf2, 0xc8, 0x32], 18], [[0xee, 0xee, 0xe6], 12],
  [[0x24, 0x24, 0x2a], 10], [[0xa3, 0x2a, 0x33], 8], [[0x3d, 0x6f, 0xb5], 8],
  [[0x6d, 0x6f, 0x75], 7], [[0x2f, 0x7a, 0x44], 5], [[0xe0, 0x7b, 0x2a], 3], [[0x6a, 0x3f, 0x97], 3]
]);
const SCARF = Object.freeze([[0xf2, 0xc8, 0x32], [0x1d, 0x3a, 0x6b]]);
const SEAT = Object.freeze([0x14, 0x1c, 0x2a]);

// Per tier: fan size in pixels, rows and how much of the floodlight reaches it.
const TIER_STYLE = Object.freeze({
  back: Object.freeze({ fanW: 5, fanH: 9, head: 2, rows: 3, light: 0.52, bob: 0.35 }),
  mid: Object.freeze({ fanW: 6, fanH: 10, head: 3, rows: 2, light: 0.7, bob: 0.7 }),
  front: Object.freeze({ fanW: 7, fanH: 12, head: 3, rows: 2, light: 0.9, bob: 1 })
});

const HEADROOM = 9;
const AMBIENT_FRAMES = CROWD_MOTION.ambientLifts.length;
const GROAN_FRAMES = 8;

export const PIXEL_CROWD_FRAMES = Object.freeze({
  ambient: AMBIENT_FRAMES,
  goal: CROWD_MOTION.goalFrames,
  groan: GROAN_FRAMES
});

function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}

function pickWeighted(random, list) {
  const total = list.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of list) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return list[list.length - 1][0];
}

function shade(color, factor) {
  return [
    Math.max(0, Math.min(255, Math.round(color[0] * factor))),
    Math.max(0, Math.min(255, Math.round(color[1] * factor))),
    Math.max(0, Math.min(255, Math.round(color[2] * factor)))
  ];
}

/** Deterministic supporters for one tier: pure data, no renderer. */
export function buildCrowdTierFans(tier, viewWidth = 480) {
  const style = TIER_STYLE[tier.id] ?? TIER_STYLE.front;
  const random = crowdRandom(tier.seed ^ 0x9e3779b9);
  const fans = [];
  const rowStep = Math.max(4, Math.round(style.fanH * 0.5));
  for (let row = 0; row < style.rows; row++) {
    // Row 0 is the back row of the tier; each row forward sits lower.
    const baseline = tier.bottom - (style.rows - 1 - row) * rowStep;
    const stagger = row % 2 ? Math.floor(style.fanW / 2) : 0;
    const spacing = style.fanW - 1;
    for (let x = -style.fanW + stagger; x < viewWidth + style.fanW; x += spacing + (random() < 0.12 ? 1 : 0)) {
      const seatedLower = random() < 0.25 ? 1 : 0;
      fans.push(Object.freeze({
        row,
        x,
        baseline: baseline + seatedLower,
        centreX: x + style.fanW / 2,
        skin: pick(random, SKIN),
        hair: random() < 0.1 ? null : pick(random, HAIR),
        cap: random() < 0.08 ? pickWeighted(random, SHIRTS) : null,
        shirt: pickWeighted(random, SHIRTS),
        scarf: random() < 0.14,
        phase: Math.floor(random() * AMBIENT_FRAMES),
        bobs: random() < style.bob,
        lean: random() < 0.5 ? -1 : 1,
        light: style.light * (0.88 + random() * 0.2)
      }));
    }
  }
  return { style, fans };
}

/** Lift (px up) and pose of one fan in one frame. */
export function fanPose(fan, kind, frame, style) {
  if (kind === 'ambient') {
    const lift = fan.bobs ? CROWD_MOTION.ambientLifts[(frame + fan.phase) % AMBIENT_FRAMES] : 0;
    return { lift, arms: fan.scarf ? 'scarf' : 'down', sway: fan.scarf ? ((frame + fan.phase) % 4 < 2 ? 0 : fan.lean) : 0 };
  }
  if (kind === 'goal') {
    const step = frame - Math.floor(fan.centreX / CROWD_MOTION.waveSpeed);
    if (step < 0) return { lift: 0, arms: fan.scarf ? 'scarf' : 'down', sway: 0 };
    const wave = step < CROWD_MOTION.goalLifts.length
      ? CROWD_MOTION.goalLifts[step]
      : ((step + fan.phase) % 3 === 0 ? 1 : 0);
    const lift = Math.round(wave * (0.6 + style.fanH / 30));
    return { lift, arms: fan.scarf ? 'scarf' : 'up', sway: (step + fan.phase) % 2 ? fan.lean : 0 };
  }
  // groan: hands on heads, a small slump, with a one-frame stagger.
  const step = frame - (fan.phase % 2);
  if (step < 0 || step >= GROAN_FRAMES - 1) return { lift: 0, arms: 'down', sway: 0 };
  return { lift: step < 3 ? -1 : 0, arms: 'head', sway: 0 };
}

function putPixel(data, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (y * width + x) * 4;
  data[index] = color[0];
  data[index + 1] = color[1];
  data[index + 2] = color[2];
  data[index + 3] = 255;
}

function drawFan(data, width, height, fan, pose, style, originY, clipTop, clipBottom) {
  const put = (x, y, color) => {
    if (y < clipTop || y >= clipBottom) return;
    putPixel(data, width, height, x, y, color);
  };
  const w = style.fanW;
  const h = style.fanH;
  const head = style.head;
  const left = fan.x + (pose.sway || 0);
  const top = originY + fan.baseline - h - pose.lift;
  const skin = shade(fan.skin, fan.light);
  const hair = fan.hair ? shade(fan.hair, fan.light) : skin;
  const shirt = shade(fan.shirt, fan.light);
  const shirtShadow = shade(fan.shirt, fan.light * 0.72);
  const headLeft = left + Math.floor((w - head) / 2);
  const torsoLeft = left + 1;
  const torsoW = w - 2;
  const torsoTop = top + head;

  // Torso, lit from the left.
  for (let y = torsoTop; y < top + h + 2; y++) {
    for (let x = torsoLeft; x < torsoLeft + torsoW; x++) {
      put(x, y, x === torsoLeft + torsoW - 1 ? shirtShadow : shirt);
    }
  }
  // Head.
  for (let y = top; y < top + head; y++) {
    for (let x = headLeft; x < headLeft + head; x++) put(x, y, skin);
  }
  if (fan.cap) {
    const cap = shade(fan.cap, fan.light);
    for (let x = headLeft; x < headLeft + head; x++) put(x, top, cap);
    put(headLeft + head, top, cap);
  } else if (fan.hair) {
    for (let x = headLeft; x < headLeft + head; x++) put(x, top, hair);
    if (head >= 3) put(headLeft, top + 1, hair);
  }

  // Arms.
  const armL = left;
  const armR = left + w - 1;
  if (pose.arms === 'up') {
    for (let y = top - 3; y < torsoTop + 1; y++) {
      put(armL, y, y <= top - 2 ? skin : shirt);
      put(armR, y, y <= top - 2 ? skin : shirt);
    }
  } else if (pose.arms === 'head') {
    put(armL, torsoTop, shirt);
    put(armR, torsoTop, shirt);
    put(armL, torsoTop - 1, shirt);
    put(armR, torsoTop - 1, shirt);
    put(headLeft - 1, top, skin);
    put(headLeft + head, top, skin);
  } else if (pose.arms === 'scarf') {
    // Scarf held up over the head, club colours.
    const scarfY = top - 2;
    for (let x = armL - 1; x <= armR + 1; x++) put(x, scarfY, shade(SCARF[(x - armL + 8) % 2], fan.light));
    for (let y = scarfY + 1; y < torsoTop + 1; y++) {
      put(armL, y, y <= scarfY + 1 ? skin : shirt);
      put(armR, y, y <= scarfY + 1 ? skin : shirt);
    }
  } else {
    for (let y = torsoTop + 1; y < torsoTop + 4; y++) {
      put(armL, y, y === torsoTop + 3 ? skin : shirt);
      put(armR, y, y === torsoTop + 3 ? skin : shirtShadow);
    }
  }
}

function frameNames() {
  const names = [];
  for (const [kind, count] of Object.entries(PIXEL_CROWD_FRAMES)) {
    for (let frame = 0; frame < count; frame++) names.push({ kind, frame, name: `${kind}-${frame}` });
  }
  return names;
}

/**
 * Paint one tier's sprite sheet into an RGBA buffer: one band per frame,
 * stacked vertically. Returns the buffer and each frame's lifts for tests and
 * for `currentPoses`.
 */
export function paintCrowdTier(tier, viewWidth = 480) {
  // Stands can be laid out for fractional view widths; the sheet is whole
  // pixels, and every buffer below is sized from this one integer.
  const sheetWidth = Math.max(1, Math.ceil(viewWidth));
  const { style, fans } = buildCrowdTierFans(tier, sheetWidth);
  const bandH = tier.bottom - tier.top + HEADROOM;
  const frames = frameNames();
  const width = sheetWidth;
  const height = bandH * frames.length;
  const data = new Uint8ClampedArray(width * height * 4);
  const lifts = {};
  const firstBaseline = Math.min(...fans.map((fan) => fan.baseline));
  frames.forEach(({ kind, frame, name }, index) => {
    const bandTop = index * bandH;
    const bandBottom = bandTop + bandH;
    const originY = bandTop - (tier.top - HEADROOM);
    // Dark seating behind the supporters, so gaps read as a stand, not holes.
    const seatTop = originY + firstBaseline - style.fanH + style.head;
    for (let y = Math.max(seatTop, bandTop); y < bandBottom; y++) {
      const seat = shade(SEAT, (y - seatTop) % 3 === 0 ? 1.15 : 0.9);
      for (let x = 0; x < width; x++) putPixel(data, width, height, x, y, seat);
    }
    const frameLifts = new Int8Array(fans.length);
    fans.forEach((fan, fanIndex) => {
      const pose = fanPose(fan, kind, frame, style);
      frameLifts[fanIndex] = pose.lift;
      drawFan(data, width, height, fan, pose, style, originY, bandTop, bandBottom);
    });
    lifts[name] = frameLifts;
  });
  return { width, height, bandH, data, lifts, fans, frames };
}

class PixelCrowdStand {
  constructor(scene, tiers, dressing, { reducedMotion = false } = {}) {
    this.scene = scene;
    this.tierViews = tiers;
    this.tiles = tiers.map((tier) => tier.image);
    this.dressing = dressing;
    this.reducedMotion = Boolean(reducedMotion);
    this.phase = 0;
    this.goalUntil = 0;
    this.timer = null;
    this.scheduled = [];
    this.frameName = 'ambient-0';
    this.show('ambient-0');
  }

  /**
   * Every supporter's lift above rest in the shown frame. A settled or
   * reduced-motion stand reads as all zeroes.
   */
  get currentPoses() {
    const poses = [];
    const resting = this.frameName === 'ambient-0' && this.phase === 0;
    for (const tier of this.tierViews) {
      const lifts = sheetLifts(this.scene?.game, tier.sheetKey)?.[this.frameName];
      if (!lifts) continue;
      for (const lift of lifts) poses.push(resting ? 0 : lift);
    }
    return poses;
  }

  show(frameName) {
    this.frameName = frameName;
    for (const tier of this.tierViews) {
      if (tier.image?.active) tier.image.setFrame(frameName);
    }
    return this;
  }

  startAmbient() {
    if (this.reducedMotion || this.timer) return this;
    this.timer = this.scene.time.addEvent({
      delay: CROWD_MOTION.ambientFrameMs,
      loop: true,
      callback: () => {
        if ((this.scene.time?.now ?? 0) < this.goalUntil) return;
        this.phase += 1;
        this.applyAmbient();
      }
    });
    return this;
  }

  applyAmbient() {
    return this.show(`ambient-${this.phase % AMBIENT_FRAMES}`);
  }

  applyWave(frame) {
    return this.show(`goal-${Math.max(0, Math.min(PIXEL_CROWD_FRAMES.goal - 1, frame))}`);
  }

  reset() {
    this.phase = 0;
    return this.show('ambient-0');
  }

  cancelScheduled() {
    this.scheduled.forEach((timer) => timer?.remove?.(false));
    this.scheduled.length = 0;
  }

  playSequence(kind, frameMs, schedule) {
    if (!this.tierViews.length) return this;
    if (this.reducedMotion) return this.reset();
    // Two reactions inside one burst - routine in Time Attack - would
    // otherwise drive the stand from two sequences at once.
    this.cancelScheduled();
    const count = PIXEL_CROWD_FRAMES[kind];
    this.goalUntil = (this.scene.time?.now ?? 0) + count * frameMs;
    const after = schedule || ((delay, callback) => this.scene.time.delayedCall(delay, callback));
    for (let frame = 0; frame < count; frame++) {
      const timer = after(frame * frameMs, () => this.show(`${kind}-${frame}`));
      if (timer) this.scheduled.push(timer);
    }
    const settle = after(count * frameMs, () => this.reset().applyAmbient());
    if (settle) this.scheduled.push(settle);
    return this;
  }

  /** The goal: a wave of arms travelling across the stand, then bouncing. */
  playGoal(schedule = null) {
    this.playSequence('goal', CROWD_MOTION.goalFrameMs, schedule);
    if (!this.reducedMotion) this.dressing?.celebrate?.();
    return this;
  }

  /** A near miss: hands on heads. */
  playGroan(schedule = null) {
    return this.playSequence('groan', 90, schedule);
  }

  setReducedMotion(reduced) {
    const next = Boolean(reduced);
    if (next === this.reducedMotion) return this;
    this.reducedMotion = next;
    this.cancelScheduled();
    this.goalUntil = 0;
    this.dressing?.setReducedMotion?.(next);
    if (next) {
      this.timer?.remove?.();
      this.timer = null;
      return this.reset();
    }
    return this.reset().startAmbient();
  }

  destroy() {
    this.timer?.remove?.();
    this.timer = null;
    this.cancelScheduled();
    this.dressing?.destroy?.();
    this.dressing = null;
    this.tiles.forEach((tile) => tile?.destroy?.());
    this.tiles = [];
    this.tierViews = [];
  }
}

// Per-game cache of each sheet's per-frame lifts. Kept off the game object
// itself: anything reachable from it gets walked by debugging tools and test
// harnesses that serialise scene handles, and thousands of typed arrays there
// cost them seconds per call.
const LIFT_CACHE = new WeakMap();

function tierTexture(scene, tier, viewWidth) {
  const key = `pixel-crowd-${tier.id}-${Math.ceil(viewWidth)}`;
  let cache = LIFT_CACHE.get(scene.game);
  if (!cache) {
    cache = {};
    LIFT_CACHE.set(scene.game, cache);
  }
  if (!scene.textures.exists(key) || !cache[key]) {
    const painted = paintCrowdTier(tier, viewWidth);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const canvasTexture = scene.textures.createCanvas(key, painted.width, painted.height);
    const context = canvasTexture.getContext();
    const image = context.createImageData(painted.width, painted.height);
    image.data.set(painted.data);
    context.putImageData(image, 0, 0);
    painted.frames.forEach(({ name }, index) => {
      canvasTexture.add(name, 0, 0, index * painted.bandH, painted.width, painted.bandH);
    });
    canvasTexture.refresh();
    releaseCanvasCopies(canvasTexture);
    cache[key] = { lifts: painted.lifts, bandH: painted.bandH };
  }
  return { key, bandH: cache[key].bandH };
}

function sheetLifts(game, key) {
  return LIFT_CACHE.get(game)?.[key]?.lifts ?? null;
}

/**
 * Build the supporters' tiers as pixel people. Returns null when the scene
 * cannot make canvas textures (test stubs), so callers can fall back.
 */
export function addPixelCrowdTiers(scene, { viewWidth = 480, depthOffset = 0 } = {}) {
  if (!scene?.textures?.createCanvas || !scene.add?.image || !scene.game) return null;
  return CROWD_STAND.tiers.map((tier) => {
    const texture = tierTexture(scene, tier, viewWidth);
    const image = scene.add.image(0, tier.top - HEADROOM, texture.key, 'ambient-0')
      .setOrigin(0, 0)
      .setDepth(tier.depth + depthOffset);
    image.fklBaselineY = image.y;
    // The per-frame lift tables stay in the module cache (see LIFT_CACHE);
    // the stand only remembers which sheet it shows.
    return { image, sheetKey: texture.key, tier };
  });
}

export function createPixelCrowdStand(scene, tiers, dressing, options) {
  return new PixelCrowdStand(scene, tiers, dressing, options);
}

// Phaser's CanvasTexture keeps a JavaScript copy of every pixel (imageData,
// plus 8- and 32-bit views of it) for getPixel(). These textures are painted
// once and never read back, so the copies are pure memory - megabytes on a
// phone - once the canvas has been uploaded.
function releaseCanvasCopies(canvasTexture) {
  canvasTexture.imageData = null;
  canvasTexture.data = null;
  canvasTexture.pixels = null;
  canvasTexture.buffer = null;
}
