import Phaser from 'phaser';
import { GAME_H, GAME_W, project } from '../config.js';
import { PAL } from '../pixelart.js';
import { crispText, drawPanel } from '../ui.js';
import { scorerCardCopy } from './OutcomePresentation.js';

const RESULT_FONT = '"Pixelify Sans", "Courier New", monospace';
const FIREWORK_BURSTS = Object.freeze([
  Object.freeze({ delay: 210, x: 0.18, y: 43, count: 34 }),
  Object.freeze({ delay: 390, x: 0.38, y: 32, count: 42 }),
  Object.freeze({ delay: 560, x: 0.67, y: 38, count: 40 }),
  Object.freeze({ delay: 750, x: 0.84, y: 49, count: 32 }),
  Object.freeze({ delay: 960, x: 0.52, y: 27, count: 38 })
]);
const FIREWORK_COLORS = Object.freeze([0xffc83d, 0x68a9ff, 0xff5fda, 0xff8b3d, 0xa986ff]);

/**
 * Renderer-only goal payoff. Gameplay owns scoring and timing; this controller
 * owns disposable particles, camera punctuation, and the scorer broadcast card.
 */
export class GoalCelebration {
  constructor(scene) {
    this.scene = scene;
    this.objects = new Set();
    this.timers = new Set();
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

  play({ scorerName, shirtNumber, goalNumber = 1, ballTexture = 'ball-classic', kicker = null } = {}) {
    this.stop();
    const scene = this.scene;
    const reduced = Boolean(scene.settings?.reducedMotion);

    scene.cameras.main.flash(reduced ? 60 : 105, 255, 246, 211, false);
    if (!reduced && scene.settings?.screenShake !== false) {
      scene.cameras.main.shake(190, 0.0042);
    }

    const standGlow = this.track(
      scene.add.rectangle(GAME_W / 2, 49, GAME_W, 98, 0xff3c21, reduced ? 0.055 : 0)
        .setDepth(1.2)
        .setBlendMode(Phaser.BlendModes.ADD)
    );
    if (!reduced) {
      scene.tweens.add({
        targets: standGlow,
        alpha: 0.18,
        duration: 150,
        yoyo: true,
        repeat: 3,
        ease: 'Cubic.easeOut'
      });
      this.startFireworks();
      this.firePitchPyro();
    } else {
      standGlow.setAlpha(0.08);
    }

    this.after(reduced ? 80 : 180, () => kicker?.celebrate?.(1650));
    this.after(500, () => this.showScorerCard({
      scorerName,
      shirtNumber,
      goalNumber,
      ballTexture
    }));
    this.after(2450, () => this.stop());
  }

  startFireworks() {
    const scene = this.scene;
    const fireworks = this.track(scene.add.particles(0, 0, 'spark', {
      speed: { min: 34, max: 92 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 520, max: 920 },
      gravityY: 42,
      scale: { start: 1.75, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffcb39, 0xfff0a8, 0x56a8ff, 0xff5bd8, 0xff6a3d],
      emitting: false
    }).setDepth(1.36).setBlendMode(Phaser.BlendModes.ADD));

    FIREWORK_BURSTS.forEach((burst, index) => {
      this.after(burst.delay, () => {
        const x = Math.round(GAME_W * burst.x);
        if (fireworks.active) fireworks.explode(burst.count, x, burst.y);
        this.drawFireworkBurst(x, burst.y, FIREWORK_COLORS[index % FIREWORK_COLORS.length], index);
      });
    });
  }

  drawFireworkBurst(x, y, color, phase = 0) {
    const scene = this.scene;
    const burst = this.track(scene.add.graphics().setPosition(x, y).setDepth(1.36));
    burst.setBlendMode(Phaser.BlendModes.ADD);
    burst.lineStyle(1, color, 1);
    const rays = 18;
    for (let index = 0; index < rays; index += 1) {
      const angle = ((Math.PI * 2) / rays) * index + phase * 0.13;
      const inner = 4 + (index % 3);
      const outer = 20 + ((index + phase) % 4) * 3;
      burst.beginPath();
      burst.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      burst.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      burst.strokePath();
      burst.fillStyle(index % 2 ? color : 0xfff3bd, 1);
      burst.fillCircle(Math.cos(angle) * (outer + 2), Math.sin(angle) * (outer + 2), 0.8);
    }
    burst.setScale(0.18).setAlpha(0.15);
    scene.tweens.add({
      targets: burst,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 230,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (!burst.active) return;
        scene.tweens.add({ targets: burst, alpha: 0, duration: 620, ease: 'Quad.easeIn' });
      }
    });
  }

  firePitchPyro() {
    const scene = this.scene;
    const leftGround = project(-(scene.goalWidth / 2 + 0.9), 0, scene.zGoal);
    const rightGround = project(scene.goalWidth / 2 + 0.9, 0, scene.zGoal);
    const goalGround = {
      left: leftGround.x,
      right: rightGround.x,
      y: Math.max(leftGround.y, rightGround.y)
    };
    const pyro = this.track(scene.add.particles(0, 0, 'spark', {
      speed: { min: 92, max: 178 },
      angle: { min: 252, max: 288 },
      lifespan: { min: 390, max: 760 },
      gravityY: 265,
      scale: { start: 1.5, end: 0.08 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffec9a, 0xffc329, 0xff7a24],
      emitting: false
    }).setDepth(1880).setBlendMode(Phaser.BlendModes.ADD));

    const burst = (count) => {
      if (!pyro.active) return;
      pyro.explode(count, goalGround.left, goalGround.y);
      pyro.explode(count, goalGround.right, goalGround.y);
    };
    burst(42);
    this.after(130, () => burst(30));
    this.after(280, () => burst(22));
    this.after(520, () => burst(26));
    this.after(760, () => burst(18));
  }

  showScorerCard(options) {
    const scene = this.scene;
    const copy = scorerCardCopy(options);
    const card = scene.add.container(-72, GAME_H - 32).setDepth(2220);
    const chrome = scene.add.graphics();
    drawPanel(chrome, -61, -24, 122, 48, {
      fill: 0x0a1c2b,
      border: 0x173b56,
      corner: PAL.goldDark,
      alpha: 0.98
    });
    chrome.fillStyle(0x0d2a43, 1).fillRect(-58, -21, 116, 11);
    chrome.fillStyle(PAL.gold, 1).fillRect(-58, -11, 116, 1);

    const heading = crispText(scene.add.text(0, -16, copy.heading, {
      fontFamily: RESULT_FONT,
      fontStyle: 'bold',
      fontSize: '7px',
      color: '#ffd447',
      stroke: '#03070b',
      strokeThickness: 1
    }).setOrigin(0.5));
    heading.setLetterSpacing(0.45);

    const ball = scene.add.image(-49, 5, options.ballTexture || 'ball-classic').setDisplaySize(14, 14);
    const player = crispText(scene.add.text(-38, 1, copy.player, {
      fontFamily: RESULT_FONT,
      fontStyle: 'bold',
      fontSize: '7px',
      color: '#f6ead0',
      stroke: '#03070b',
      strokeThickness: 1
    }).setOrigin(0, 0.5));
    player.setLetterSpacing(0.2);
    const detail = crispText(scene.add.text(-38, 15, copy.detail, {
      fontFamily: RESULT_FONT,
      fontStyle: 'bold',
      fontSize: '5px',
      color: '#77c7ff',
      stroke: '#03070b',
      strokeThickness: 1
    }).setOrigin(0, 0.5));
    detail.setLetterSpacing(0.2);

    card.add([chrome, heading, ball, player, detail]);
    this.track(card);
    const targetX = 69;
    if (scene.settings?.reducedMotion) {
      card.setX(targetX);
    } else {
      scene.tweens.add({ targets: card, x: targetX, duration: 300, ease: 'Back.easeOut' });
    }
    scene.tweens.add({
      targets: card,
      alpha: 0,
      delay: 1350,
      duration: 260,
      ease: 'Cubic.easeIn'
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
    this.scene = null;
  }
}
