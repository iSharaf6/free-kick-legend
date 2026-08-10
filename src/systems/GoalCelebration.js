import Phaser from 'phaser';
import { GAME_H, GAME_W, STADIUM_Y, project } from '../config.js';
import { PAL } from '../pixelart.js';
import { crispText, drawPanel } from '../ui.js';
import { scorerCardCopy } from './OutcomePresentation.js';

const RESULT_FONT = '"Pixelify Sans", "Courier New", monospace';

// Authored pyrotechnics (scripts/build_goal_pyro.py). The stage unit is a
// permanent normally-blended fixture; only its plume and the shells are
// simulated particle sheets. Separating hardware from flame is what lets the
// mortar stay intact and visible while it is off.
const PYRO_UNIT_TEXTURE = 'goal-pyro-unit-v1';
const PYRO_TEXTURE = 'goal-pyro-fountain-v2';
const PYRO_ANIM = 'goal-pyro-fountain-burn-v2';
const SHELL_TEXTURE = 'goal-firework-shell-v1';
const SHELL_ANIM = 'goal-firework-burst-v1';
const GLOW_TEXTURE = 'crowd-glow-v1';
const PYRO_DISPLAY_W = 37;
const PYRO_DISPLAY_H = 99;
const PYRO_GOAL_DEPTH = 2.2;
const PYRO_POST_CLEARANCE = 2.2;
// Sponsor board artwork spans 1.45..1.50 and the net begins at 2. These slots
// keep the complete unit in front of every hoarding layer and behind the goal.
const PYRO_SPILL_DEPTH = 1.505;
const PYRO_UNIT_DEPTH = 1.51;
const PYRO_PLUME_DEPTH = 1.515;

// The shell sheet is authored in pure luminance so a tint multiplies cleanly to
// a hue. A real display is mostly warm with two or three cold shells in it, not
// a rainbow, so the warm entries appear more than once.
const SHELL_TINTS = Object.freeze([
  0xffd45e, 0xffd45e, 0xff8a3c, 0x6fb7ff, 0xff6fa8, 0xfff0c0, 0x8bffa8, 0xffd45e
]);

// Where the shells break, in logical space. Kept inside the stand's own height
// and clear of the HUD strip along the top, so a burst always lands over
// supporters rather than behind the match interface.
const SKY_TOP = 12;
const SKY_BOTTOM = 52;

// Launch beats. Six shells over 445ms reads as a volley; firing them together
// reads as one flash and wastes the animation entirely.
const SHELL_LAUNCHES = Object.freeze([
  Object.freeze({ delay: 0, x: 0.17, y: 0.20, scale: 0.86 }),
  Object.freeze({ delay: 95, x: 0.82, y: 0.12, scale: 0.74 }),
  Object.freeze({ delay: 185, x: 0.45, y: 0.70, scale: 1.02 }),
  Object.freeze({ delay: 270, x: 0.66, y: 0.44, scale: 0.68 }),
  Object.freeze({ delay: 360, x: 0.08, y: 0.64, scale: 0.62 }),
  Object.freeze({ delay: 445, x: 0.92, y: 0.60, scale: 0.70 })
]);

/**
 * Renderer-only goal payoff. Gameplay owns scoring and timing; this controller
 * owns the authored celebration sprites and compact broadcast card.
 */
export class GoalCelebration {
  constructor(scene) {
    this.scene = scene;
    this.objects = new Set();
    this.timers = new Set();
    this.pyroAnchors = [];
    this.pyroUnits = [];
    this.mountPitchPyroUnits();
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

    this.punchCamera(reduced);
    this.showPitchPyro(reduced);
    this.showFireworks(reduced);
    this.after(reduced ? 0 : 55, () => kicker?.celebrate?.(650));
    this.after(70, () => this.showScorerCard({
      scorerName,
      shirtNumber,
      goalNumber,
      ballTexture,
      scoreDelta,
      shotLabel,
      contextLabel
    }));
    this.after(1050, () => this.stop());
  }

  /**
   * The hit on the camera.
   *
   * Two beats, not one. A single shake reads as a rumble; a hard, very short
   * jolt as the net takes the ball, followed by a longer, softer swell as the
   * stand erupts, is what a broadcast cut of a goal actually feels like.
   *
   * Amplitude is specified in logical pixels and converted, because Phaser's
   * intensity is not a distance: the effect throws the view by
   * `intensity * camera.width * zoom` *screen* pixels, and camera.width is the
   * 1920px backing canvas, not the 480px logical frame. A plausible-looking
   * 0.0055 is therefore about ten logical pixels - enough to swing the whole
   * stadium and drag the empty world edge into shot.
   *
   * The two axes are converted separately. One scalar intensity is a bigger
   * throw in x than in y purely because the canvas is wider than it is tall,
   * which reads as a horizontal wobble rather than an impact.
   */
  punchCamera(reduced) {
    if (reduced) return;
    const camera = this.scene.cameras?.main;
    if (!camera) return;
    const throwOf = (logicalPixels) => ({
      x: logicalPixels / (camera.width || GAME_W),
      y: logicalPixels / (camera.height || GAME_H)
    });
    // 2.2px of jolt, then a 0.9px swell. Past about three logical pixels the
    // 4x pixel grid visibly smears and the shake stops reading as force.
    camera.shake(90, throwOf(2.2), true);
    this.after(150, () => {
      const main = this.scene?.cameras?.main;
      if (main) main.shake(320, throwOf(0.9), true);
    });
  }

  /**
   * Stage gerbs, planted on the track behind the goal.
   *
   * These used to sit at depth 1880 - in front of the goal, the keeper and the
   * ball, roughly where a broadcast camera operator would be standing. Putting
   * them behind the frame is what makes them read as stadium pyrotechnics
   * rather than as an overlay: the goal, the net and the players all pass in
   * front of the plume.
   *
   * The mortars are permanent scene fixtures. The additive plume is a separate
   * sprite placed on the exact same anchor only for the duration of a goal.
   */
  pitchPyroAnchors() {
    const scene = this.scene;
    const halfWidth = (scene.goalWidth ?? 9.4) / 2;
    const goalZ = scene.zGoal ?? 20;
    // The rear of the goal is 2.2m behind its line. Boards are guaranteed to be
    // at least another 0.25m back, but clamp defensively for custom scenarios.
    const unitZ = Math.min(
      goalZ + PYRO_GOAL_DEPTH,
      (scene.zBoards ?? goalZ + PYRO_GOAL_DEPTH + 0.25) - 0.25
    );

    return [-1, 1].map((side, index) => {
      const worldX = side * (halfWidth + PYRO_POST_CLEARANCE);
      const base = project(worldX, 0, unitZ);
      return Object.freeze({
        index,
        side,
        worldX,
        z: unitZ,
        x: base.x,
        y: base.y,
        flipX: side > 0
      });
    });
  }

  mountPitchPyroUnits() {
    const scene = this.scene;
    if (!scene?.textures?.exists?.(PYRO_UNIT_TEXTURE)) return;
    if (this.pyroUnits.some((unit) => unit?.active)) return;

    this.pyroUnits.forEach((unit) => { if (unit?.active) unit.destroy(); });
    this.pyroAnchors = this.pitchPyroAnchors();
    this.pyroUnits = this.pyroAnchors.map((anchor) => scene.add.image(
      anchor.x,
      anchor.y,
      PYRO_UNIT_TEXTURE
    )
      .setName(`goal-pyro-unit-${anchor.side < 0 ? 'left' : 'right'}`)
      .setOrigin(0.5, 1)
      .setDisplaySize(PYRO_DISPLAY_W, PYRO_DISPLAY_H)
      .setDepth(PYRO_UNIT_DEPTH)
      .setFlipX(anchor.flipX));
  }

  showPitchPyro(reduced) {
    const scene = this.scene;
    this.mountPitchPyroUnits();
    if (reduced || !scene.textures?.exists?.(PYRO_TEXTURE)) return;
    if (!scene.anims.exists(PYRO_ANIM)) {
      scene.anims.create({
        key: PYRO_ANIM,
        frames: scene.anims.generateFrameNumbers(PYRO_TEXTURE, { start: 0, end: 9 }),
        // Ten frames over ~475ms: the burn is still going when the scorer card
        // lands, and is guttering out as the celebration is torn down.
        frameRate: 21,
        repeat: 0
      });
    }

    this.pyroAnchors.forEach((anchor) => {
      // 96x256 source -> 37x99 keeps the authored aspect within a rounding
      // error. Unit and plume share the same full-frame plate, origin and size,
      // so the nozzle cannot wander as the animation changes frame.
      const fountain = this.track(scene.add.sprite(anchor.x, anchor.y, PYRO_TEXTURE, 0)
        .setOrigin(0.5, 1)
        .setDisplaySize(PYRO_DISPLAY_W, PYRO_DISPLAY_H)
        .setDepth(PYRO_PLUME_DEPTH)
        .setFlipX(anchor.flipX)
        .setBlendMode(Phaser.BlendModes.ADD));
      fountain.play(PYRO_ANIM);
      fountain.once('animationcomplete', () => {
        this.objects.delete(fountain);
        if (fountain.active) fountain.destroy();
      });

      // The light the gerb throws back onto the boards behind it. Without it
      // the plume is a bright object floating in front of an unlit wall.
      if (!scene.textures.exists(GLOW_TEXTURE)) return;
      const spill = this.track(scene.add.image(anchor.x, anchor.y - 10, GLOW_TEXTURE)
        .setDisplaySize(54, 40)
        .setTint(0xffc978)
        .setAlpha(0)
        .setDepth(PYRO_SPILL_DEPTH)
        .setBlendMode(Phaser.BlendModes.ADD));
      scene.tweens.add({
        targets: spill,
        alpha: 0.34,
        duration: 130,
        hold: 300,
        yoyo: true,
        ease: 'Quad.easeOut'
      });
    });
  }

  /**
   * The display over the stand.
   *
   * This replaces a 960x218 photograph of a real stadium that was composited
   * additively over the pixel crowd. It was the single most off-style thing in
   * the game - photographic starbursts and a second, photographed crowd sitting
   * on top of an authored pixel one - and nothing about it could be fixed by
   * blending it more gently, because the problem was that it was a photograph.
   *
   * Each shell here is the same authored 12-frame luminance burst, tinted,
   * scaled and fired on its own beat, with a rising launch streak in front of
   * it. A whole display of six therefore costs one sheet.
   */
  showFireworks(reduced) {
    const scene = this.scene;
    if (!scene.textures?.exists?.(SHELL_TEXTURE)) return;
    if (!scene.anims.exists(SHELL_ANIM)) {
      scene.anims.create({
        key: SHELL_ANIM,
        frames: scene.anims.generateFrameNumbers(SHELL_TEXTURE, { start: 0, end: 11 }),
        frameRate: 20,
        repeat: 0
      });
    }

    if (reduced) {
      // One still shell, held. Reduced motion should still say "you scored".
      this.track(scene.add.sprite(GAME_W * 0.5, SKY_TOP + 16, SHELL_TEXTURE, 3)
        .setDisplaySize(74, 74)
        .setTint(SHELL_TINTS[0])
        .setAlpha(0.7)
        .setDepth(1.34)
        .setBlendMode(Phaser.BlendModes.ADD));
      return;
    }

    SHELL_LAUNCHES.forEach((launch, index) => {
      const x = GAME_W * launch.x;
      const burstY = SKY_TOP + (SKY_BOTTOM - SKY_TOP) * launch.y;
      const tint = SHELL_TINTS[index % SHELL_TINTS.length];
      this.after(launch.delay, () => this.fireShell(x, burstY, tint, launch.scale));
    });
  }

  /** One shell: a rising streak, then the break. */
  fireShell(x, burstY, tint, scale) {
    const scene = this.scene;
    if (!scene.sys?.isActive?.()) return;

    // The lift. A shell that simply appears in the sky has no weight; the eye
    // needs to see it leave the ground.
    const streak = this.track(scene.add.rectangle(x, STADIUM_Y - 2, 1, 7, tint, 1)
      .setDepth(1.335)
      .setBlendMode(Phaser.BlendModes.ADD));
    scene.tweens.add({
      targets: streak,
      y: burstY + 3,
      duration: 165,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (streak.active) streak.destroy();
        this.breakShell(x, burstY, tint, scale);
      }
    });
    scene.tweens.add({ targets: streak, alpha: 0.25, duration: 165, ease: 'Quad.easeIn' });
  }

  breakShell(x, y, tint, scale) {
    const scene = this.scene;
    if (!scene.sys?.isActive?.()) return;
    const size = Math.round(128 * scale);

    const shell = this.track(scene.add.sprite(x, y, SHELL_TEXTURE, 0)
      .setDisplaySize(size, size)
      .setTint(tint)
      .setDepth(1.34)
      .setBlendMode(Phaser.BlendModes.ADD));
    shell.play(SHELL_ANIM);
    shell.once('animationcomplete', () => { if (shell.active) shell.destroy(); });

    // The break lights the supporters underneath it.
    if (!scene.textures.exists(GLOW_TEXTURE)) return;
    const flash = this.track(scene.add.image(x, y, GLOW_TEXTURE)
      .setDisplaySize(size * 1.5, size * 1.5)
      .setTint(tint)
      .setAlpha(0.42)
      .setDepth(1.333)
      .setBlendMode(Phaser.BlendModes.ADD));
    scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeIn',
      onComplete: () => { if (flash.active) flash.destroy(); }
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
    }
    scene.tweens.add({
      targets: card,
      alpha: 0,
      delay: 500,
      duration: 120,
      ease: 'Quad.easeIn'
    });
  }

  stop() {
    for (const timer of this.timers) timer?.remove?.(false);
    this.timers.clear();
    for (const object of this.objects) {
      this.scene.tweens?.killTweensOf?.(object);
      if (object?.active) object.destroy?.(true);
    }
    this.objects.clear();
  }

  destroy() {
    this.stop();
    for (const unit of this.pyroUnits) {
      if (unit?.active) unit.destroy();
    }
    this.pyroUnits = [];
    this.pyroAnchors = [];
    this.scene = null;
  }
}
