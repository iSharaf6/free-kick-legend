import {
  CROWD_MOTION,
  CROWD_PANORAMA,
  getCrowdTilePositions
} from '../data/crowdPanorama.js';

// One writer for the crowd. Tiles are created at the tier's authored size and
// that size is never touched again - ambience moves `y` only. Resizing a tile
// is what previously stretched the supporters, so it is deliberately impossible
// to do through this controller.
class CrowdTiers {
  constructor(scene, tiles, { reducedMotion = false } = {}) {
    this.scene = scene;
    this.tiles = tiles;
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
        this.setPose(CROWD_MOTION.ambientLifts);
      }
    });
    return this;
  }

  /**
   * Apply one frame of a lift pattern. Every tile reads the pattern from its own
   * offset, so the stand ripples along its length instead of hopping in unison.
   */
  setPose(lifts, alpha = null) {
    const pattern = lifts?.length ? lifts : [0];
    const stride = CROWD_MOTION.tilePhaseStride;
    this.tiles.forEach((tile, index) => {
      if (!tile?.active) return;
      const step = ((this.phase + index * stride) % pattern.length + pattern.length) % pattern.length;
      const lift = Math.round(Math.max(0, pattern[step]) * tile.fklBobScale);
      tile.setY(tile.fklBaselineY - lift);
      tile.setAlpha(alpha === null ? tile.fklAlpha : tile.fklAlpha * alpha);
    });
    return this;
  }

  /** Short celebration burst: bigger bob, brighter tint, then back to ambience. */
  playGoal(schedule = null) {
    if (!this.tiles.length) return this;
    if (this.reducedMotion) return this.setPose([0]);

    const { goalLifts, goalFrameMs } = CROWD_MOTION;
    this.goalUntil = (this.scene.time?.now ?? 0) + goalLifts.length * goalFrameMs;
    const after = schedule || ((delay, callback) => this.scene.time.delayedCall(delay, callback));
    goalLifts.forEach((_, frame) => {
      const timer = after(frame * goalFrameMs, () => {
        this.phase = frame;
        this.setPose(goalLifts, frame % 2 ? 0.9 : 1);
        this.tiles.forEach((tile) => {
          if (tile.active) tile.setTint(frame % 2 ? tile.fklHotTint : tile.fklTint);
        });
      });
      if (timer) this.scheduled.push(timer);
    });
    const reset = after(goalLifts.length * goalFrameMs, () => {
      this.phase = 0;
      this.setPose(CROWD_MOTION.ambientLifts);
      this.tiles.forEach((tile) => {
        if (tile.active) tile.setTint(tile.fklTint);
      });
    });
    if (reset) this.scheduled.push(reset);
    return this;
  }

  destroy() {
    this.timer?.remove?.();
    this.timer = null;
    this.scheduled.forEach((timer) => timer?.remove?.(false));
    this.scheduled.length = 0;
    this.tiles.forEach((tile) => tile?.destroy?.());
    this.tiles = [];
  }
}

function brighten(color, amount = 44) {
  const clamp = (value) => Math.max(0, Math.min(255, value));
  return (clamp(((color >> 16) & 0xff) + amount) << 16)
    | (clamp(((color >> 8) & 0xff) + amount) << 8)
    | clamp((color & 0xff) + amount);
}

/**
 * Build the layered stand. Each tier keeps the source aspect exactly, so the
 * only difference between tiers is scale - which is what reads as depth.
 */
export function addCrowdTiers(scene, {
  viewWidth = 480,
  reducedMotion = false,
  depthOffset = 0,
  tintScale = 1,
  tiers = CROWD_PANORAMA.tiers,
  autoStart = true
} = {}) {
  const { textureKey } = CROWD_PANORAMA;
  const tiles = [];

  for (const tier of tiers) {
    const positions = getCrowdTilePositions(viewWidth, tier.tileWidth, tier.startX);
    positions.forEach((x, index) => {
      const tint = tintScale === 1 ? tier.tint : brighten(tier.tint, Math.round((tintScale - 1) * 120));
      const tile = scene.add.image(x, tier.baselineY, textureKey)
        .setOrigin(0, 1)
        // The one and only size write. Aspect is fixed by the tier data.
        .setDisplaySize(tier.tileWidth, tier.tileHeight)
        .setDepth(tier.depth + depthOffset)
        .setTint(tint)
        .setAlpha(tier.alpha)
        // Mirroring every other tile hides the repeat without a second asset.
        .setFlipX(index % 2 === 1);
      tile.fklBaselineY = tier.baselineY;
      tile.fklAlpha = tier.alpha;
      tile.fklBobScale = tier.bobScale;
      tile.fklTint = tint;
      tile.fklHotTint = brighten(tint, 52);
      tiles.push(tile);
    });
  }

  const controller = new CrowdTiers(scene, tiles, { reducedMotion });
  if (autoStart) controller.startAmbient();
  return controller;
}

/** Backwards-compatible single-call helper used by the menu backdrop. */
export function addAnimatedCrowdPanorama(scene, {
  depth = 2,
  reducedMotion = false,
  tint = null
} = {}) {
  const controller = addCrowdTiers(scene, {
    reducedMotion,
    depthOffset: depth - CROWD_PANORAMA.tiers[1].depth,
    tintScale: tint === null ? 1 : 1.18
  });
  return controller.tiles;
}
