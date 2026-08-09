import { CAM, GAME_H, GAME_W, GOAL_W, project } from '../config.js';
import { PAL } from '../pixelart.js';
import { crispText, drawPanel } from '../ui.js';
import { scorerCardCopy } from './OutcomePresentation.js';

const RESULT_FONT = '"Pixelify Sans", "Courier New", monospace';
const STAND_BANNER_TEXTURE = 'goal-crowd-banner-v4';
const STAND_FLARE_TEXTURE = 'goal-flare-v3';
const PYRO_TEXTURE = 'goal-spark-fountain-v3';
const PYRO_FRAME_HEIGHT = 192;
const CELEBRATION_FRAME_COUNT = 8;
const CELEBRATION_ANIMATIONS = Object.freeze({
  banner: Object.freeze({ key: 'goal-crowd-banner-surf-v4', texture: STAND_BANNER_TEXTURE, frameRate: 10 }),
  flare: Object.freeze({ key: 'goal-flare-billow-v3', texture: STAND_FLARE_TEXTURE, frameRate: 11 }),
  pyro: Object.freeze({ key: 'goal-spark-fountain-burst-v3', texture: PYRO_TEXTURE, frameRate: 11 })
});
const PYRO_BACK_OFFSET = 0.25;
const PYRO_POST_GAP = 0.36;
const PYRO_WORLD_HEIGHTS = Object.freeze([3.25, 2.95]);

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
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
    return Object.freeze({
      x: base.x,
      y: base.y,
      scale,
      // The extra depth offset follows the world z and guarantees the effect is
      // behind the posts, ball and keeper while remaining in front of the stand.
      depth: Math.min(frameDepth - 0.5, 1000 - effectZ * 10),
      flipX: index === 1,
      delay: 0
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
    this.after(reduced ? 0 : 55, () => kicker?.celebrate?.(650));
    this.after(70, () => this.showScorerCard(options));
    this.after(1050, () => this.stop());
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
    options.kicker?.celebrate?.(650);
    this.showCelebrationStand(value);
    this.showPitchPyro(value);
    this.showScorerCard(options);
    this.after(650, () => this.stop());
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
      for (const [x, flip] of [[58, false], [422, true]]) {
        const flare = this.track(scene.add.sprite(x, 101, STAND_FLARE_TEXTURE)
          .setOrigin(0.5, 1)
          .setDisplaySize(25, 40)
          .setFlipX(flip)
          .setDepth(1.35)
          .setAlpha(0.9));
        playCelebrationLoop(scene, flare, CELEBRATION_ANIMATIONS.flare, reduced);
      }
    }
  }

  showPitchPyro(reduced = false) {
    const scene = this.scene;
    if (!scene.textures?.exists?.(PYRO_TEXTURE)) return;

    goalPyroLayout({ goalWidth: scene.goalWidth, goalZ: scene.zGoal }).forEach((layout) => {
      const pyro = this.track(scene.add.sprite(
        layout.x,
        layout.y,
        PYRO_TEXTURE
      )
        .setOrigin(0.5, 1)
        .setScale(layout.scale)
        .setDepth(layout.depth)
        .setFlipX(layout.flipX)
        .setAlpha(0.96));
      playCelebrationLoop(scene, pyro, CELEBRATION_ANIMATIONS.pyro, reduced);
    });
  }

  showScorerCard(options) {
    const scene = this.scene;
    const copy = scorerCardCopy(options);
    const card = scene.add.container(-76, GAME_H - 29).setDepth(2220);
    const chrome = scene.add.graphics();
    drawPanel(chrome, -65, -22, 130, 44, {
      fill: 0x071827,
      border: 0x2b5877,
      corner: PAL.gold,
      alpha: 1
    });
    chrome.fillStyle(0x0d2d48, 1).fillRect(-62, -19, 124, 11);
    chrome.fillStyle(PAL.gold, 1).fillRect(-62, -8, 124, 1);
    chrome.fillStyle(PAL.gold, 1).fillRect(-62, -19, 2, 38);

    const heading = crispText(scene.add.text(-56, -14, copy.heading, {
      fontFamily: RESULT_FONT,
      fontStyle: 'normal',
      fontSize: '6px',
      color: '#ffd447',
      stroke: '#03070b',
      strokeThickness: 1
    }).setOrigin(0, 0.5));
    heading.setLetterSpacing(0.35);

    const ball = scene.add.image(-54, 2, options.ballTexture || 'ball-classic').setDisplaySize(13, 13);
    const player = crispText(scene.add.text(-44, 0, copy.player, {
      fontFamily: RESULT_FONT,
      fontStyle: 'normal',
      fontSize: '7px',
      color: '#fff1d3',
      stroke: '#03070b',
      strokeThickness: 1
    }).setOrigin(0, 0.5));
    player.setLetterSpacing(0.15);
    const detail = crispText(scene.add.text(-44, 13, copy.detail, {
      fontFamily: RESULT_FONT,
      fontStyle: 'normal',
      fontSize: '5px',
      color: '#74d6ff',
      stroke: '#03070b',
      strokeThickness: 1
    }).setOrigin(0, 0.5));
    detail.setLetterSpacing(0.15);

    card.add([chrome, heading, ball, player, detail]);
    this.track(card);
    const targetX = 72;
    if (scene.settings?.reducedMotion) {
      card.setX(targetX);
    } else {
      scene.tweens.add({ targets: card, x: targetX, duration: 170, ease: 'Back.easeOut' });
      scene.tweens.add({
        targets: card,
        alpha: 0,
        delay: 500,
        duration: 120,
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
