import { CAM, GAME_H, GAME_W, GOAL_W, project } from '../config.js';
import { PAL } from '../pixelart.js';
import { crispText, drawPanel } from '../ui.js';
import { scorerCardCopy } from './OutcomePresentation.js';

const RESULT_FONT = '"Pixelify Sans", "Courier New", monospace';
const STAND_TEXTURE = 'goal-celebration-stand-v1';
// Rows 0..101 of the celebration plate are night sky, five firework bursts and
// the two floodlight banks, on near-black. The photographic crowd starts
// creeping into the bottom corners around row 102 and takes the frame over by
// row 144. Measured on the checked-in art, whose bytes are hash-pinned by
// test/goal-celebration-assets.test.js and are not modified here.
const STAND_SKY_FRAME = 'goal-celebration-sky';
const STAND_SKY_ROWS = 102;
// Where that band lands on the stand.
//
// Drawn from y=0 - as the full-plate version was - the shells sit at logical
// y 9..24, which is the strip the match HUD and the cup chip occupy, so the
// pyrotechnics were almost entirely behind the interface. Dropping the band
// puts the bursts over the upper tiers, where there is nothing in front of
// them and the supporters they are lighting are visible in the same frame.
const STAND_SKY_TOP = 14;
const PYRO_TEXTURE = 'goal-pyro-fountain-v1';
const PYRO_ANIM = 'goal-pyro-fountain-burst-v1';
const PYRO_FRAME_HEIGHT = 256;
const PYRO_BACK_OFFSET = 0.25;
const PYRO_POST_GAP = 0.36;
const PYRO_STAGGER_MS = 96;
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
      delay: index * PYRO_STAGGER_MS,
      reducedFrame: index === 0 ? 1 : 2
    });
  }));
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

    // Keep the camera completely stable. A goal should feel bigger because the
    // stadium comes alive, not because the whole pitch vibrates or washes out.
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

  /**
   * Pyrotechnics over the stand.
   *
   * This used to draw the whole 960x218 celebration plate opaquely at 480x109,
   * so every goal replaced the stadium's own crowd with a second,
   * semi-photographic one for a second: a hard cut between two drawing styles,
   * and the moment the supporters were doing their most interesting work was
   * the moment they were hidden behind a photograph of a different crowd.
   *
   * Only the sky band is used now, composited additively. The source is close
   * to black above row 144, so the shells and floodlight bursts add themselves
   * over the real stand while the photographed supporters below are never
   * sampled at all. The pixel crowd keeps celebrating underneath, lit by the
   * fireworks going off above it.
   */
  showCelebrationStand(reduced) {
    const scene = this.scene;
    if (!scene.textures?.exists?.(STAND_TEXTURE)) return;

    const texture = scene.textures.get(STAND_TEXTURE);
    if (!texture.has(STAND_SKY_FRAME)) {
      const width = texture.source?.[0]?.width ?? 960;
      texture.add(STAND_SKY_FRAME, 0, 0, 0, width, STAND_SKY_ROWS);
    }

    // Uniform half scale: 960 source pixels become the 480 stand, and a single
    // scalar cannot stretch one axis the way a width/height pair can.
    const stand = this.track(scene.add.image(GAME_W / 2, STAND_SKY_TOP, STAND_TEXTURE, STAND_SKY_FRAME)
      .setOrigin(0.5, 0)
      .setScale(0.5)
      .setDepth(1.34)
      .setBlendMode('ADD')
      .setAlpha(reduced ? 0.7 : 0));
    if (!reduced) {
      scene.tweens.add({ targets: stand, alpha: 0.88, duration: 110, ease: 'Quad.easeOut' });
      // Light fades, it does not vanish. Without this the shells cut out on the
      // frame the celebration is torn down.
      scene.tweens.add({
        targets: stand,
        alpha: 0,
        delay: 620,
        duration: 380,
        ease: 'Quad.easeIn'
      });
    }
  }

  showPitchPyro(reduced) {
    const scene = this.scene;
    if (!scene.textures?.exists?.(PYRO_TEXTURE)) return;
    if (!scene.anims.exists(PYRO_ANIM)) {
      scene.anims.create({
        key: PYRO_ANIM,
        frames: scene.anims.generateFrameNumbers(PYRO_TEXTURE, { start: 0, end: 3 }),
        frameRate: 12,
        yoyo: true,
        repeat: 0
      });
    }

    goalPyroLayout({ goalWidth: scene.goalWidth, goalZ: scene.zGoal }).forEach((layout) => {
      const fountain = this.track(scene.add.sprite(
        layout.x,
        layout.y,
        PYRO_TEXTURE,
        reduced ? layout.reducedFrame : 0
      )
        .setOrigin(0.5, 1)
        .setScale(layout.scale)
        .setDepth(layout.depth)
        .setFlipX(layout.flipX)
        .setBlendMode('ADD')
        .setAlpha(reduced ? 0.72 : 1));
      if (!reduced) {
        const ignite = () => {
          if (fountain.active) fountain.play(PYRO_ANIM);
        };
        if (layout.delay > 0) this.after(layout.delay, ignite);
        else ignite();
      }
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
