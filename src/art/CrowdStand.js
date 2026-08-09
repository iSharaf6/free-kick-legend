import {
  CROWD_MOTION,
  CROWD_STAND,
  buildCrowdTierLayout,
  crowdSliceFrameName,
  crowdSliceFrames,
  crowdWaveLift
} from '../data/crowdStand.js';
import { addStandDressing } from './StandDressing.js';

// One writer for the crowd.
//
// Every slice is created at its tier's uniform scale and that scale is never
// written again - ambience and celebration move `y` only. Resizing a slice is
// what made supporters look stretched in the stand this replaces, so no code
// path here can do it: the only sizing call in the file is a single `setScale`
// with one scalar argument, which cannot distort an axis by construction.

function clampChannel(value) {
  return Math.max(0, Math.min(255, value));
}

/** Shift every channel of a colour by the same signed amount. */
function shiftTint(color, amount) {
  return (clampChannel(((color >> 16) & 0xff) + amount) << 16)
    | (clampChannel(((color >> 8) & 0xff) + amount) << 8)
    | clampChannel((color & 0xff) + amount);
}

/**
 * Register one Phaser frame per (band, slice) on the loaded panorama.
 *
 * Idempotent: scenes are created and destroyed constantly, and the texture
 * outlives all of them.
 */
export function registerCrowdSliceFrames(scene) {
  const texture = scene.textures.get(CROWD_STAND.textureKey);
  if (!texture || texture.key === '__MISSING') return false;
  if (texture.has(crowdSliceFrameName('front', 0))) return true;
  for (const frame of crowdSliceFrames()) {
    texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
  }
  return true;
}

class CrowdStand {
  constructor(scene, tiles, dressing, { reducedMotion = false } = {}) {
    this.scene = scene;
    this.tiles = tiles;
    this.dressing = dressing;
    this.reducedMotion = Boolean(reducedMotion);
    this.phase = 0;
    this.goalUntil = 0;
    this.timer = null;
    this.scheduled = [];
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

  /**
   * One frame of the resting loop. Each slice reads the pattern from its own
   * offset, so the stand ripples along its length instead of breathing as one
   * solid block.
   */
  applyAmbient() {
    const pattern = CROWD_MOTION.ambientLifts;
    for (const tile of this.tiles) {
      if (!tile.active) continue;
      const step = (this.phase + tile.fklPhase) % pattern.length;
      tile.setY(tile.fklBaselineY - Math.round(pattern[step] * tile.fklBob));
      // Resting supporters are always the resting colour. This looks redundant
      // beside reset(), and is not: a goal burst can be cut short before its
      // settle frame ever runs - a Time Attack clock expiring mid-celebration
      // cancels every pending scheduled call - which would otherwise leave
      // every slice the wave had already lifted hot-tinted for the rest of the
      // scene. Repairing it here makes an interrupted burst self-heal within
      // one ambient tick rather than depending on a frame that never arrives.
      if (tile.tintTopLeft !== tile.fklTint) tile.setTint(tile.fklTint);
    }
    return this;
  }

  /**
   * One frame of the goal wave. The front travels left to right, so slices go
   * up in sequence across the frame rather than every supporter leaving the
   * ground together.
   */
  applyWave(frame) {
    for (const tile of this.tiles) {
      if (!tile.active) continue;
      const lift = crowdWaveLift(tile.fklCentreX, frame, tile.fklBob);
      tile.setY(tile.fklBaselineY - lift);
      tile.setTint(lift > 0 ? tile.fklHotTint : tile.fklTint);
    }
    return this;
  }

  /** Settle every slice back to its resting pose and colour. */
  reset() {
    this.phase = 0;
    for (const tile of this.tiles) {
      if (!tile.active) continue;
      tile.setY(tile.fklBaselineY).setTint(tile.fklTint);
    }
    return this;
  }

  /**
   * The celebration.
   *
   * `schedule` is GameScene's session-aware timer, which returns null once the
   * match is tearing down - so every return value is checked before it is kept.
   */
  playGoal(schedule = null) {
    if (!this.tiles.length) return this;
    if (this.reducedMotion) return this.reset();

    // Two goals inside one burst - routine in Time Attack - would otherwise
    // leave the first wave's remaining frames queued against the second's, and
    // the stand would be driven from two phases at once.
    this.scheduled.forEach((timer) => timer?.remove?.(false));
    this.scheduled.length = 0;

    const { goalFrames, goalFrameMs } = CROWD_MOTION;
    this.goalUntil = (this.scene.time?.now ?? 0) + goalFrames * goalFrameMs;
    const after = schedule || ((delay, callback) => this.scene.time.delayedCall(delay, callback));

    for (let frame = 0; frame < goalFrames; frame++) {
      const timer = after(frame * goalFrameMs, () => this.applyWave(frame));
      if (timer) this.scheduled.push(timer);
    }
    const settle = after(goalFrames * goalFrameMs, () => this.reset().applyAmbient());
    if (settle) this.scheduled.push(settle);

    this.dressing?.celebrate?.();
    return this;
  }

  setReducedMotion(reduced) {
    const next = Boolean(reduced);
    if (next === this.reducedMotion) return this;
    this.reducedMotion = next;
    this.scheduled.forEach((timer) => timer?.remove?.(false));
    this.scheduled.length = 0;
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
    this.scheduled.forEach((timer) => timer?.remove?.(false));
    this.scheduled.length = 0;
    this.dressing?.destroy?.();
    this.dressing = null;
    this.tiles.forEach((tile) => tile?.destroy?.());
    this.tiles = [];
  }
}

/**
 * Build the whole supporters' end.
 *
 * Three tiers of shuffled slices, back to front, plus the structure, lighting
 * and props that make them read as a stand rather than as a texture.
 */
export function addCrowdStand(scene, {
  viewWidth = 480,
  reducedMotion = false,
  depthOffset = 0,
  dressed = true,
  autoStart = true
} = {}) {
  const tiles = [];

  if (registerCrowdSliceFrames(scene)) {
    for (const tier of CROWD_STAND.tiers) {
      const { scale, slices } = buildCrowdTierLayout(tier, viewWidth);
      for (const slice of slices) {
        const tint = shiftTint(tier.tint, slice.tintShift);
        const tile = scene.add
          .image(slice.x, tier.bottom, CROWD_STAND.textureKey,
            crowdSliceFrameName(tier.band, slice.index))
          .setOrigin(0, 1)
          // The one and only sizing call in this module, and it takes a single
          // scalar: a supporter cannot be stretched on one axis from here.
          .setScale(scale)
          .setDepth(tier.depth + depthOffset)
          .setTint(tint)
          .setAlpha(tier.alpha)
          .setFlipX(slice.flipX);
        tile.fklBaselineY = tier.bottom;
        tile.fklBob = tier.bobScale;
        tile.fklPhase = slice.bobPhase;
        tile.fklCentreX = slice.centreX;
        tile.fklTint = tint;
        tile.fklHotTint = shiftTint(tint, 54);
        tiles.push(tile);
      }
    }
  }

  const dressing = dressed
    ? addStandDressing(scene, { viewWidth, reducedMotion, depthOffset })
    : null;

  const controller = new CrowdStand(scene, tiles, dressing, { reducedMotion });
  if (autoStart) controller.startAmbient();
  return controller;
}

/**
 * Menu backdrop variant.
 *
 * The menu asks for a single depth and gets the whole stand rebased onto it, so
 * the title screen and the match cannot drift apart visually.
 */
export function addMenuCrowd(scene, { depth = 2, reducedMotion = false } = {}) {
  const frontTier = CROWD_STAND.tiers[CROWD_STAND.tiers.length - 1];
  return addCrowdStand(scene, {
    reducedMotion,
    depthOffset: depth - frontTier.depth
  });
}
