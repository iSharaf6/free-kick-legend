import Phaser from 'phaser';
import { GAME_W, GAME_H, RENDER_SCALE } from '../config.js';
import { PuppetRig } from '../objects/PuppetRig.js';
import { makeButton, bodyText, titleText, drawPanel, configureHdCamera, FONT } from '../ui.js';
import { PAL } from '../pixelart.js';
import { Audio } from '../systems/AudioSynth.js';

const Matter = Phaser.Physics.Matter.Matter;
const { Bodies, Body, Sleeping } = Matter;

/**
 * A focused, playable reference scene for the segmented rig. The match keeps
 * its deterministic pseudo-3D football solver, while this lab deliberately
 * uses a real Matter.Bodies.circle so collision tuning can be inspected alone.
 */
export class PuppetLabScene extends Phaser.Scene {
  constructor() {
    super('PuppetLab');
  }

  create() {
    configureHdCamera(this);
    this.matter.world.setGravity(0, 0.82, 0.001);

    this.drawBackdrop();
    this.createPhysicsWorld();
    this.createHud();

    this.collisionHandler = (event) => this.handleCollisions(event);
    this.matter.world.on('collisionstart', this.collisionHandler);
    this.input.keyboard?.on('keydown-SPACE', this.launchBall, this);
    this.input.keyboard?.on('keydown-R', this.resetDemo, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.time.delayedCall(480, () => this.launchBall());
  }

  drawBackdrop() {
    this.add.image(0, 0, 'stadium-menu').setOrigin(0).setDepth(-20).setTint(0x91a8a6);
    const g = this.add.graphics().setDepth(-10);
    g.fillStyle(0x0b241c, 0.72);
    g.fillRect(0, 48, GAME_W, GAME_H - 48);
    g.fillStyle(0x226a42, 1);
    g.fillRect(0, 150, GAME_W, 89);
    for (let y = 150; y < 239; y += 18) {
      g.fillStyle((y / 18) % 2 ? 0x277548 : 0x21683f, 1);
      g.fillRect(0, y, GAME_W, 18);
    }
    g.lineStyle(2, 0xe9efe1, 0.82);
    g.lineBetween(0, 238, GAME_W, 238);
    g.lineStyle(1, 0xe9efe1, 0.32);
    g.strokeCircle(343, 229, 49);

    const wall = this.add.graphics().setDepth(-5);
    wall.fillStyle(0xe5e9e3, 0.9);
    wall.fillRect(390, 91, 3, 148);
    wall.fillRect(390, 91, 77, 3);
    wall.lineStyle(1, 0xb8c8c3, 0.7);
    for (let x = 398; x < 470; x += 8) wall.lineBetween(x, 94, x, 238);
    for (let y = 102; y < 238; y += 8) wall.lineBetween(393, y, 468, y);
  }

  createPhysicsWorld() {
    // Static turf catches both the ball and every released body segment.
    this.floorBody = this.matter.add.rectangle(GAME_W / 2, 246, GAME_W + 80, 16, {
      isStatic: true,
      label: 'lab-floor',
      friction: 0.88,
      restitution: 0.08
    });

    this.rig = new PuppetRig(this, {
      kind: 'wall',
      x: 344,
      y: 238,
      scale: 1.42,
      depth: 40,
      pose: 'wall-idle',
      autoReset: true,
      autoResetDelay: 0.78,
      recoveryDuration: 0.55
    });

    // This is intentionally created through Matter.Bodies.circle instead of
    // a Phaser arcade sprite: restitution, friction, air drag and gravity all
    // act on the actual ball body.
    this.ballBody = Bodies.circle(72, 207, 7.2, {
      label: 'lab-ball',
      density: 0.0045,
      friction: 0.025,
      frictionStatic: 0.12,
      frictionAir: 0.004,
      restitution: 0.78,
      slop: 0.01
    });
    this.ballBody.plugin = { ...(this.ballBody.plugin || {}), labBall: true };
    this.matter.world.add(this.ballBody);
    this.ballSprite = this.add.image(72, 207,
      this.textures.exists('ball-classic-hd') ? 'ball-classic-hd' : 'ball')
      .setDisplaySize(15, 15)
      .setDepth(80);
    this.ballShadow = this.add.ellipse(72, 239, 20, 5, 0x071018, 0.36).setDepth(10);
    this.launched = false;
  }

  createHud() {
    const plate = this.add.graphics().setDepth(200);
    drawPanel(plate, 7, 5, GAME_W - 14, 38, {
      fill: PAL.panel,
      border: PAL.borderDark,
      corner: PAL.goldDark,
      alpha: 0.96
    });
    titleText(this, 17, 13, 'MATTER PUPPET LAB', '13px', '#f3c449')
      .setOrigin(0, 0)
      .setDepth(202);
    bodyText(this, 18, 34, '10 BODIES  ·  9 JOINTS  ·  SOFT ANGLE LIMITS  ·  AUTO RECOVERY', {
      fontFamily: FONT,
      fontSize: '6px',
      color: '#b9c6c5',
      letterSpacing: 0.35
    }).setDepth(202);

    makeButton(this, 431, 24, 72, 25, 'BACK', () => this.scene.start('Menu'), {
      color: PAL.panelHi,
      hover: PAL.blue,
      border: PAL.borderDark,
      fontSize: '7px'
    }).setDepth(205);
    makeButton(this, 67, 258, 112, 21, 'KICK AGAIN', () => this.launchBall(), {
      color: PAL.orange,
      hover: 0xe47c3e,
      border: PAL.goldDark,
      fontSize: '7px'
    }).setDepth(205);
    bodyText(this, 132, 258, 'SPACE: KICK  ·  R: RESET  ·  HARDER HITS RELEASE THE RIG', {
      fontSize: '6px',
      color: '#d7dfda',
      letterSpacing: 0.22
    }).setDepth(202);
  }

  launchBall() {
    Audio.prepare();
    this.resetBallOnly();
    this.rig.reset({ x: 344, y: 238, root: null, pose: 'wall-idle', phase: 0 });
    Body.setVelocity(this.ballBody, { x: 13.6, y: -3.35 });
    Body.setAngularVelocity(this.ballBody, 0.28);
    Sleeping.set(this.ballBody, false);
    this.launched = true;
    Audio.kick(0.86);
  }

  resetBallOnly() {
    Body.setPosition(this.ballBody, { x: 72, y: 207 });
    Body.setAngle(this.ballBody, 0);
    Body.setVelocity(this.ballBody, { x: 0, y: 0 });
    Body.setAngularVelocity(this.ballBody, 0);
    Sleeping.set(this.ballBody, false);
  }

  resetDemo() {
    this.resetBallOnly();
    this.rig.reset({ x: 344, y: 238, root: null, pose: 'wall-idle', phase: 0 });
    this.launched = false;
  }

  handleCollisions(event) {
    for (const pair of event.pairs) {
      const ball = pair.bodyA.plugin?.labBall ? pair.bodyA : pair.bodyB.plugin?.labBall ? pair.bodyB : null;
      if (!ball) continue;
      const playerBody = ball === pair.bodyA ? pair.bodyB : pair.bodyA;
      if (playerBody.plugin?.puppetRig === this.rig && this.rig.handleMatterImpact(ball, playerBody, pair)) {
        Audio.save();
      }
    }
  }

  update(_time, delta) {
    if (this.cameras.main.zoom !== RENDER_SCALE) {
      this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    }
    const dt = Math.min(Math.max(delta, 0), 100) / 1000;
    this.rig.update(dt);
    this.ballSprite
      .setPosition(this.ballBody.position.x, this.ballBody.position.y)
      .setRotation(this.ballBody.angle);
    this.ballShadow
      .setPosition(this.ballBody.position.x, 239)
      .setScale(Phaser.Math.Clamp(1 - (239 - this.ballBody.position.y) / 180, 0.35, 1));

    if (this.launched && (this.ballBody.position.x > GAME_W + 30 || this.ballBody.position.y > GAME_H + 40)) {
      this.time.delayedCall(350, () => this.launchBall());
      this.launched = false;
    }
  }

  shutdown() {
    this.matter.world?.off('collisionstart', this.collisionHandler);
    this.input?.keyboard?.off('keydown-SPACE', this.launchBall, this);
    this.input?.keyboard?.off('keydown-R', this.resetDemo, this);
    this.rig?.destroy();
  }
}
