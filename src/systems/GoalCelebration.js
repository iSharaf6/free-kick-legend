import { CAM, GAME_H, GAME_W, GOAL_W, project } from '../config.js';
import { PAL } from '../pixelart.js';
import { crispText, drawPanel, PIXEL_TEXT_WEIGHT } from '../ui.js';
import { scorerCardCopy } from './OutcomePresentation.js';

const RESULT_FONT = '"Pixelify Sans", monospace';
const STAND_BANNER_TEXTURE = 'goal-crowd-banner-v4';
const STAND_FLARE_TEXTURE = 'goal-flare-v3';
const PYRO_TEXTURE = 'goal-spark-fountain-v3';
const PYRO_FRAME_HEIGHT = 192;
const FLARE_FRAME_WIDTH = 128;
const FLARE_FRAME_HEIGHT = 192;
const FLARE_DISPLAY_HEIGHT = 40;
const CELEBRATION_FRAME_COUNT = 8;
const CELEBRATION_ANIMATIONS = Object.freeze({
  banner: Object.freeze({ key: 'goal-crowd-banner-surf-v4', texture: STAND_BANNER_TEXTURE, frameRate: 10 }),
  flare: Object.freeze({ key: 'goal-flare-billow-v3', texture: STAND_FLARE_TEXTURE, frameRate: 11 }),
  pyro: Object.freeze({ key: 'goal-spark-fountain-burst-v3', texture: PYRO_TEXTURE, frameRate: 11 })
});
const PYRO_BACK_OFFSET = 0.25;
const PYRO_POST_GAP = 0.36;
const PYRO_WORLD_HEIGHTS = Object.freeze([3.25, 2.95]);
const PYRO_CORE_WIDTH_SCALE = 1.48;
const PYRO_WING_SCALE = 0.78;
const PYRO_SMOKE_WIDTH_SCALE = 1.95;
const PYRO_SMOKE_HEIGHT_SCALE = 1.08;
const PYRO_FAN_WORLD_GAP = 0.34;

export const GOAL_CELEBRATION_TIMING = Object.freeze({
  fullMs: 1680,
  reducedMs: 1050,
  cardEnterMs: 170,
  cardFadeDelayMs: 1350,
  cardFadeMs: 220,
  kickerFullMs: 900,
  kickerReducedMs: 650
});

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/**
 * Preserve the authored 128x192 flare silhouette. The old display-size path
 * independently squeezed each axis, which made the smoke column look thin and
 * softened its pixels at the stadium scale.
 */
export function goalFlareLayout({
  frameWidth = FLARE_FRAME_WIDTH,
  frameHeight = FLARE_FRAME_HEIGHT,
  displayHeight = FLARE_DISPLAY_HEIGHT
} = {}) {
  const sourceWidth = finitePositive(frameWidth, FLARE_FRAME_WIDTH);
  const sourceHeight = finitePositive(frameHeight, FLARE_FRAME_HEIGHT);
  const height = finitePositive(displayHeight, FLARE_DISPLAY_HEIGHT);
  const scale = height / sourceHeight;
  return Object.freeze({
    sourceWidth,
    sourceHeight,
    scale,
    displayWidth: sourceWidth * scale,
    displayHeight: sourceHeight * scale
  });
}

/**
 * Build the two fountain transforms from the same world-space goal geometry as
 * the posts. Keeping this pure makes perspective, grounding and layer ordering
 * testable without booting a renderer.
 */
export function goalPyroLayout({ goalWidth = GOAL_W, goalZ = CAM.ballDist + 18 } = {}) {
  const width = finitePositive(goalWidth, GOAL_W);
  const frontZ = finitePositive(goalZ, CAM.ballDist + 18);
  const effectZ = frontZ + PYRO_BACK_OFFSET;
  const frameDepth = 1000 - frontZ * 10 + 2;

  return Object.freeze([-1, 1].map((side, index) => {
    const worldX = side * (width / 2 + PYRO_POST_GAP);
    const base = project(worldX, 0, effectZ);
    const scale = (base.s * PYRO_WORLD_HEIGHTS[index]) / PYRO_FRAME_HEIGHT;
    const depth = Math.min(frameDepth - 0.5, 1000 - effectZ * 10);
    const fanGap = base.s * PYRO_FAN_WORLD_GAP;
    const sparkLayers = [
      Object.freeze({
        role: 'wing-left',
        x: base.x - fanGap,
        y: base.y,
        scaleX: scale * PYRO_WING_SCALE,
        scaleY: scale * PYRO_WING_SCALE,
        alpha: 0.64,
        depth: depth - 0.04,
        flipX: !Boolean(side > 0),
        startFrame: 1
      }),
      Object.freeze({
        role: 'core',
        x: base.x,
        y: base.y,
        scaleX: scale * PYRO_CORE_WIDTH_SCALE,
        scaleY: scale,
        alpha: 0.98,
        depth,
        flipX: index === 1,
        startFrame: 0
      }),
      Object.freeze({
        role: 'wing-right',
        x: base.x + fanGap,
        y: base.y,
        scaleX: scale * PYRO_WING_SCALE,
        scaleY: scale * PYRO_WING_SCALE,
        alpha: 0.58,
        depth: depth - 0.03,
        flipX: Boolean(side > 0),
        startFrame: 5
      })
    ];
    return Object.freeze({
      x: base.x,
      y: base.y,
      scale,
      // The extra depth offset follows the world z and guarantees the effect is
      // behind the posts, ball and keeper while remaining in front of the stand.
      depth,
      flipX: index === 1,
      delay: 0,
      sparkLayers: Object.freeze(sparkLayers),
      smoke: Object.freeze({
        x: base.x,
        y: base.y,
        scaleX: scale * PYRO_SMOKE_WIDTH_SCALE,
        scaleY: scale * PYRO_SMOKE_HEIGHT_SCALE,
        alpha: 0.44,
        depth: depth - 0.12,
        flipX: index === 0,
        startFrame: index === 0 ? 2 : 4
      })
    });
  }));
}

function playCelebrationLoop(scene, sprite, animation, reduced, startFrame = 0) {
  if (reduced) {
    sprite.setFrame?.(3);
    return sprite;
  }
  const manager = scene.anims;
  if (manager?.create && !manager.exists?.(animation.key)) {
    manager.create({
      key: animation.key,
      frames: manager.generateFrameNumbers(animation.texture, {
        start: 0,
        end: CELEBRATION_FRAME_COUNT - 1
      }),
      frameRate: animation.frameRate,
      repeat: -1,
      skipMissedFrames: false
    });
  }
  sprite.play?.(animation.key, false, startFrame);
  return sprite;
}

/**
 * Renderer-only goal payoff. Gameplay owns scoring and timing; this controller
 * owns the authored celebration sprites and compact broadcast card.
 */
export class GoalCelebration {
  constructor(scene) {
    this.scene = scene;
    this.objects = new Set();
    this.timers = new Set();
    this.active = null;
  }

  track(object) {
    if (object) this.objects.add(object);
    return object;
  }

  after(delay, callback) {
    const timer = this.scene.time.delayedCall(delay, () => {
      this.timers.delete(timer);
      if (this.scene.sys?.isActive?.()) callback();
    });
    this.timers.add(timer);
    return timer;
  }

  play({
    scorerName,
    shirtNumber,
    goalNumber = 1,
    ballTexture = 'ball-classic',
    kicker = null,
    scoreDelta = 0,
    shotLabel = 'GOAL SCORED',
    contextLabel = ''
  } = {}) {
    this.stop();
    const scene = this.scene;
    const reduced = Boolean(scene.settings?.reducedMotion);
    const options = {
      scorerName,
      shirtNumber,
      goalNumber,
      ballTexture,
      kicker,
      scoreDelta,
      shotLabel,
      contextLabel
    };
    this.active = { options, reduced };

    // Keep the camera stable while the authored eight-frame sprites provide
    // the motion. They read as stadium fixtures rather than screen-space FX.
    this.showCelebrationStand(reduced);
    this.showPitchPyro(reduced);
    this.after(reduced ? 0 : 55, () => kicker?.celebrate?.(
      reduced ? GOAL_CELEBRATION_TIMING.kickerReducedMs : GOAL_CELEBRATION_TIMING.kickerFullMs
    ));
    this.after(70, () => this.showScorerCard(options));
    this.after(
      reduced ? GOAL_CELEBRATION_TIMING.reducedMs : GOAL_CELEBRATION_TIMING.fullMs,
      () => this.stop()
    );
  }

  setReducedMotion(reduced) {
    const value = Boolean(reduced);
    if (!this.active || this.active.reduced === value) return false;

    const options = this.active.options;
    this.clearPresentation();
    this.active = { options, reduced: value };

    // Rebuild from static/animated primitives instead of trying to retime a
    // half-played sprite clip. Kicker.celebrate() invalidates its old sequence
    // and neutralises action offsets before adopting the correct presentation.
    options.kicker?.setReducedMotion?.(value);
    options.kicker?.celebrate?.(
      value ? GOAL_CELEBRATION_TIMING.kickerReducedMs : GOAL_CELEBRATION_TIMING.kickerFullMs
    );
    this.showCelebrationStand(value);
    this.showPitchPyro(value);
    this.showScorerCard(options);
    this.after(
      value ? GOAL_CELEBRATION_TIMING.reducedMs : GOAL_CELEBRATION_TIMING.fullMs,
      () => this.stop()
    );
    return true;
  }

  showCelebrationStand(reduced = false) {
    const scene = this.scene;
    if (scene.textures?.exists?.(STAND_BANNER_TEXTURE)) {
      for (const [index, [x, flip]] of [[132, false], [348, true]].entries()) {
        const banner = this.track(scene.add.sprite(x, 73, STAND_BANNER_TEXTURE)
          .setDisplaySize(104, 52)
          .setFlipX(flip)
          .setDepth(1.34)
          .setAlpha(0.96));
        playCelebrationLoop(scene, banner, CELEBRATION_ANIMATIONS.banner, reduced, index * 4);
      }
    }
    if (scene.textures?.exists?.(STAND_FLARE_TEXTURE)) {
      const flareLayout = goalFlareLayout();
      for (const [x, flip] of [[58, false], [422, true]]) {
        const flare = this.track(scene.add.sprite(x, 101, STAND_FLARE_TEXTURE)
          .setOrigin(0.5, 1)
          .setScale(flareLayout.scale)
          .setFlipX(flip)
          .setDepth(1.35)
          .setAlpha(0.9));
        playCelebrationLoop(scene, flare, CELEBRATION_ANIMATIONS.flare, reduced);
      }
    }
  }

  showPitchPyro(reduced = false) {
    const scene = this.scene;
    const hasSparks = scene.textures?.exists?.(PYRO_TEXTURE);
    const hasSmoke = scene.textures?.exists?.(STAND_FLARE_TEXTURE);
    if (!hasSparks && !hasSmoke) return;

    goalPyroLayout({ goalWidth: scene.goalWidth, goalZ: scene.zGoal }).forEach((layout) => {
      // The flare sheet supplies a broad smoke-and-ember silhouette behind the
      // fine spark pixels. It shares the exact ground point and remains behind
      // the goal frame, keeper and players in both motion policies.
      if (hasSmoke) {
        const smoke = this.track(scene.add.sprite(
          layout.smoke.x,
          layout.smoke.y,
          STAND_FLARE_TEXTURE
        )
          .setOrigin(0.5, 1)
          .setScale(layout.smoke.scaleX, layout.smoke.scaleY)
          .setDepth(layout.smoke.depth)
          .setFlipX(layout.smoke.flipX)
          .setAlpha(reduced ? layout.smoke.alpha * 0.78 : layout.smoke.alpha));
        smoke.setName?.('goal-pyro-smoke');
        playCelebrationLoop(
          scene,
          smoke,
          CELEBRATION_ANIMATIONS.flare,
          reduced,
          layout.smoke.startFrame
        );
      }

      // Three staggered authored spark layers form one readable fan. The core
      // is wider but keeps its height, while smaller wings add lateral energy
      // without turning the effect into a screen-space particle cloud.
      if (hasSparks) {
        layout.sparkLayers.forEach((layer) => {
          const pyro = this.track(scene.add.sprite(layer.x, layer.y, PYRO_TEXTURE)
            .setOrigin(0.5, 1)
            .setScale(layer.scaleX, layer.scaleY)
            .setDepth(layer.depth)
            .setFlipX(layer.flipX)
            .setAlpha(reduced ? layer.alpha * 0.86 : layer.alpha));
          pyro.setName?.(`goal-pyro-${layer.role}`);
          playCelebrationLoop(
            scene,
            pyro,
            CELEBRATION_ANIMATIONS.pyro,
            reduced,
            layer.startFrame
          );
        });
      }
    });
  }

  showScorerCard(options) {
    const scene = this.scene;
    const copy = scorerCardCopy(options);
    const card = scene.add.container(-86, GAME_H - 29).setDepth(2220);
    const chrome = scene.add.graphics();
    drawPanel(chrome, -75, -24, 150, 48, {
      fill: 0x071827,
      border: 0x2b5877,
      corner: PAL.gold,
      alpha: 1
    });
    chrome.fillStyle(0x0d2d48, 1).fillRect(-72, -21, 144, 12);
    chrome.fillStyle(PAL.gold, 1).fillRect(-72, -9, 144, 1);
    chrome.fillStyle(PAL.gold, 1).fillRect(-72, -21, 2, 42);

    const heading = crispText(scene.add.text(-66, -15, copy.heading, {
      fontFamily: RESULT_FONT,
      fontStyle: PIXEL_TEXT_WEIGHT,
      fontSize: '7px',
      color: '#ffd447',
      stroke: '#03070b',
      strokeThickness: 1
    }).setOrigin(0, 0.5));
    heading.setLetterSpacing(0.35);

    const ball = scene.add.image(-62, 2, options.ballTexture || 'ball-classic').setDisplaySize(15, 15);
    const player = crispText(scene.add.text(-51, 0, copy.player, {
      fontFamily: RESULT_FONT,
      fontStyle: PIXEL_TEXT_WEIGHT,
      fontSize: '8px',
      color: '#fff1d3',
      stroke: '#03070b',
      strokeThickness: 1
    }).setOrigin(0, 0.5));
    player.setLetterSpacing(0.15);
    const detail = crispText(scene.add.text(-51, 14, copy.detail, {
      fontFamily: RESULT_FONT,
      fontStyle: PIXEL_TEXT_WEIGHT,
      fontSize: '6px',
      color: '#74d6ff',
      stroke: '#03070b',
      strokeThickness: 1
    }).setOrigin(0, 0.5));
    detail.setLetterSpacing(0.15);

    card.add([chrome, heading, ball, player, detail]);
    this.track(card);
    const targetX = 82;
    if (scene.settings?.reducedMotion) {
      card.setX(targetX);
    } else {
      scene.tweens.add({
        targets: card,
        x: targetX,
        duration: GOAL_CELEBRATION_TIMING.cardEnterMs,
        ease: 'Back.easeOut'
      });
      scene.tweens.add({
        targets: card,
        alpha: 0,
        delay: GOAL_CELEBRATION_TIMING.cardFadeDelayMs,
        duration: GOAL_CELEBRATION_TIMING.cardFadeMs,
        ease: 'Quad.easeIn'
      });
    }
  }

  clearPresentation() {
    for (const timer of this.timers) timer?.remove?.(false);
    this.timers.clear();
    for (const object of this.objects) {
      this.scene.tweens?.killTweensOf?.(object);
      object?.anims?.stop?.();
      if (object?.active) object.destroy?.(true);
    }
    this.objects.clear();
  }

  stop() {
    this.clearPresentation();
    this.active = null;
  }

  destroy() {
    this.stop();
    this.scene = null;
  }
}
