import Phaser from 'phaser';
import {
  GAME_W, GAME_H, RENDER_SCALE, CAM, GOAL_W, GOAL_H, POST_R, BALL_R, WALL_DIST, PHYS, SHOT, project
} from '../config.js';
import { LEVELS, dailyScenario, randomScenario } from '../data/levels.js';
import { utcDateKey } from '../data/progression.js';
import { getCosmetic } from '../data/cosmetics.js';
import { Ball } from '../objects/Ball.js';
import { Wall } from '../objects/Wall.js';
import { Goalkeeper } from '../objects/Goalkeeper.js';
import { Kicker } from '../objects/Kicker.js';
import { SwipeInput, computeShotFromPath } from '../systems/SwipeInput.js';
import { SaveManager } from '../systems/SaveManager.js';
import { PlatformService } from '../systems/PlatformService.js';
import { Audio } from '../systems/AudioSynth.js';
import { careerStars, isTopCorner, scoreShot, targetGeometry } from '../systems/ShotScoring.js';
import { classifyGoalPlane, reboundFromGoalFrame, sweepGoalFrame } from '../systems/GoalFramePhysics.js';
import { GoalNetPhysics } from '../systems/GoalNetPhysics.js';
import {
  makeButton, makeIconButton, makeStatChip, titleText, bodyText,
  drawPanel, addScanlines, configureHdCamera, crispText, FONT
} from '../ui.js';
import { PAL } from '../pixelart.js';

const ATTEMPTS = 3;
const ARCADE_TIME = 60;
const FIXED_STEP = PHYS.fixedStep;
const MAX_STEPS = PHYS.maxSubsteps + 2;
const CUP_TINTS = Object.freeze({
  academy: 0xe8f5e9,
  curve: 0xe6f1ff,
  targets: 0xfff4cc,
  pressure: 0xffe0d5,
  legend: 0xe6dcff,
  daily: 0xffedbd
});

function mixColor(a, b, t) {
  const f = Phaser.Math.Clamp(t, 0, 1);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return Phaser.Display.Color.GetColor(
    Math.round(ar + (br - ar) * f),
    Math.round(ag + (bg - ag) * f),
    Math.round(ab + (bb - ab) * f)
  );
}

// Kick loop state machine: AIMING -> WINDUP -> FLIGHT -> RESULT -> (AIMING | OVERLAY)
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data = {}) {
    this.mode = data.mode || 'career';
    this.levelIndex = data.levelIndex ?? 0;
    this.dailyDate = data.dailyDate || utcDateKey();
    this.score = data.score || 0;
    this.goals = data.goals || 0;
    this.combo = data.combo || 0;
    this.timeLeft = data.timeLeft ?? ARCADE_TIME;
    this.level = this.mode === 'career'
      ? LEVELS[this.levelIndex]
      : this.mode === 'daily'
        ? dailyScenario(this.dailyDate)
        : randomScenario();
  }

  create() {
    configureHdCamera(this);
    this.settings = SaveManager.getSettings?.() || {};
    Audio.setMuted(Boolean(this.settings.muted || PlatformService.shouldMuteAudio()));
    Audio.setVolume(this.settings.sfxVolume ?? 1);
    if (this.mode === 'daily') SaveManager.ensureDaily(this.dailyDate);
    PlatformService.gameplayStart();
    CAM.x = this.level.offsetX * 0.85;
    this.zGoal = CAM.ballDist + this.level.distance;
    this.zWall = CAM.ballDist + Math.min(WALL_DIST, this.level.distance * 0.55);

    this.state = 'AIMING';
    this.attempt = 1;
    this.maxAttempts = this.level.attempts || ATTEMPTS;
    this.goalsThisLevel = 0;
    this.objectiveStreak = 0;
    this.finishTypes = new Set();
    this.bestShotScore = 0;
    this.wallClearanceY = null;
    this.lastReward = 0;
    this.simSpeed = 1;
    this.slowmoT = 0;
    this.flightT = 0;
    this.accumulator = 0;
    this.simTime = 0;
    this.slowmoUsed = false;
    this.over = false;
    this.ballCaught = false;
    this.keeperContactChecked = false;
    this.netTouched = false;
    this.netSideRippled = false;
    this.frameTouched = false;
    this.frameImpactT = null;
    this.frameCollisionCooldown = 0;
    this.lastTickSecond = -1;
    this.baseTarget = this.level.target ? { ...this.level.target } : null;
    this.activeTarget = this.baseTarget ? { ...this.baseTarget } : null;

    this.crowdImage = this.add.image(0, 0, 'crowd').setOrigin(0, 0).setDepth(0);
    const atmosphereTint = CUP_TINTS[this.level.cup];
    if (atmosphereTint) this.crowdImage.setTint(atmosphereTint);
    this.crowdGlow = this.add.rectangle(GAME_W / 2, CAM.horizonY / 2, GAME_W, CAM.horizonY, PAL.gold, 0)
      .setDepth(1)
      .setBlendMode('ADD');
    this.buildCrowdWave();
    this.drawPitch();
    // Floodlight beams angled onto the penalty area sell the night-match
    // lighting; the vignette pulls focus toward the goalmouth.
    const beams = this.add.graphics().setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    beams.fillStyle(PAL.flood, 0.05);
    beams.fillTriangle(48, 14, 82, 14, 262, 236);
    beams.fillTriangle(398, 14, 432, 14, 218, 236);
    beams.fillStyle(PAL.flood, 0.035);
    beams.fillTriangle(128, 14, 154, 14, 248, 208);
    beams.fillTriangle(326, 14, 352, 14, 232, 208);
    this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(1950);
    this.drawGoal();
    this.drawTargetZone();

    this.ball = new Ball();
    this.ball.reset(this.level.offsetX);
    this.ball.setWind(this.level.wind || 0);
    const savedLoadout = SaveManager.getEquippedCosmetics?.() || SaveManager.load?.().equipped || {};
    this.loadout = {
      kit: savedLoadout.kit || 'kit-home',
      ball: savedLoadout.ball || 'ball-classic',
      trail: savedLoadout.trail || 'trail-none'
    };
    const trailCosmetic = getCosmetic(this.loadout.trail);
    this.trailStyle = {
      enabled: trailCosmetic?.particle !== 'none',
      start: trailCosmetic?.palette?.start ?? 0xffffff,
      end: trailCosmetic?.palette?.end ?? 0xffffff
    };
    this.ballTexture = this.loadout.ball === 'ball-classic' && this.textures.exists('ball-classic-hd')
      ? 'ball-classic-hd'
      : (this.textures.exists(this.loadout.ball) ? this.loadout.ball : 'ball');
    this.ballSpr = this.add.image(0, 0, this.ballTexture);
    this.shadowSpr = this.add.image(0, 0, 'shadow');
    // Smear ghosts: on fast frames the ball is drawn again along its screen
    // path, filling the gaps between discrete positions. Each single frame
    // looks wrong; at speed they read as one continuous streak.
    this.ballGhosts = [0.66, 0.33].map((fraction) => ({
      fraction,
      spr: this.add.image(0, 0, this.ballTexture).setVisible(false)
    }));
    this.prevBallScreen = null;

    const ballStart = project(this.ball.x, this.ball.y, this.ball.z);
    this.kicker = new Kicker(this, ballStart.x - 23, ballStart.y + 15, {
      kitId: this.loadout.kit,
      pose: 'ready',
      scale: 2.35,
      depth: 1260,
      ambient: !this.settings.reducedMotion,
      reducedMotion: this.settings.reducedMotion
    });

    this.keeper = new Goalkeeper(this, this.level.keeper, this.zGoal, {
      reducedMotion: this.settings.reducedMotion,
      style: this.level.style
    });
    this.buildWall();
    if (this.wall) this.keeper.organiseWall();

    this.trailPts = [];
    this.trailGfx = this.add.graphics();
    this.aimGfx = this.add.graphics().setDepth(1500);

    this.confetti = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 170 },
      angle: { min: 200, max: 340 },
      gravityY: 260,
      lifespan: 800,
      scale: { start: 1.4, end: 0 },
      tint: [PAL.gold, 0xff5252, 0x40c4ff, 0x69f0ae, 0xffffff],
      emitting: false
    }).setDepth(1800);

    // white burst on saves / wall blocks / post hits
    this.impact = this.add.particles(0, 0, 'spark', {
      speed: { min: 30, max: 80 },
      gravityY: 150,
      lifespan: 350,
      scale: { start: 1, end: 0 },
      tint: [0xffffff, 0xfff0b0],
      emitting: false
    }).setDepth(1800);

    this.buildHud();

    this.swipe = new SwipeInput(
      this,
      (shot) => this.takeShot(shot),
      {
        onInvalidShot: (reason) => this.showSwipeHint(reason),
        canStart: (point) => this.canStartSwipe(point),
        onStart: () => this.onSwipeStart(),
        onEnd: (valid) => this.onSwipeEnd(valid)
      }
    );
    this.swipe.enabled = true;

    Audio.whistle();

    // Debug hook for automated testing (window.__fkl.shootDebug(vx, vy, vz, spin));
    // dev-server only, stripped from production builds.
    if (import.meta.env.DEV) window.__fkl = this;
    this.onVisibilityChange = () => {
      if (document.hidden) PlatformService.gameplayStop();
      else if (this.state === 'AIMING' || this.state === 'WINDUP' || this.state === 'FLIGHT') PlatformService.gameplayStart();
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.events.once('shutdown', () => {
      if (import.meta.env.DEV && window.__fkl === this) window.__fkl = null;
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      PlatformService.gameplayStop();
    });
  }

  // ---------------------------------------------------------------- visuals

  buildCrowdWave() {
    this.crowdWave = [];
    const colors = [0xf2c832, 0x47a7ff, 0xe96f4d, 0xf4ead2, 0x52b36a];
    for (let i = 0; i < 32; i++) {
      const block = this.add.rectangle(5 + i * 15, 68 + (i % 3) * 7, 4, 5, colors[i % colors.length], 0)
        .setDepth(2);
      block.homeY = block.y;
      this.crowdWave.push(block);
    }
  }

  playCrowdWave() {
    this.crowdWave.forEach((block, index) => {
      this.tweens.killTweensOf(block);
      block.setY(block.homeY).setAlpha(0.85);
      if (this.settings.reducedMotion) {
        this.tweens.add({ targets: block, alpha: 0, delay: 420, duration: 180, ease: 'Cubic.easeOut' });
        return;
      }
      this.tweens.add({
        targets: block,
        y: block.homeY - 4,
        alpha: { from: 0.85, to: 0.3 },
        delay: (index % 8) * 30,
        duration: 120,
        yoyo: true,
        repeat: 2,
        ease: 'Cubic.easeOut',
        onComplete: () => block.setY(block.homeY).setAlpha(0)
      });
    });
  }

  playImpactShake(duration = 90, strength = 0.75) {
    if (this.settings.screenShake === false || this.settings.reducedMotion) return;
    const camera = this.cameras.main;
    const baseX = camera.scrollX;
    const baseY = camera.scrollY;
    this.tweens.killTweensOf(camera);
    this.tweens.add({
      targets: camera,
      scrollX: baseX + strength,
      scrollY: baseY - strength * 0.45,
      duration: Math.max(24, duration / 4),
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => camera.setScroll(baseX, baseY)
    });
  }

  drawPitch() {
    const g = this.add.graphics().setDepth(1);
    const greens = [PAL.grass, PAL.grassDark];
    let z0 = 3.0;
    let i = 0;
    // perspective mowing stripes
    while (true) {
      const z1 = z0 * 1.25;
      const y0 = Math.min(project(0, 0, z0).y, GAME_H);
      const y1 = Math.max(project(0, 0, z1).y, CAM.horizonY);
      if (y0 <= CAM.horizonY + 1) break;
      g.fillStyle(greens[i % 2], 1);
      g.fillRect(0, y1, GAME_W, y0 - y1 + 1);
      z0 = z1;
      i++;
      if (i > 40) break;
    }
    g.fillStyle(greens[0], 1);
    g.fillRect(0, CAM.horizonY, GAME_W, 2);

    // dithered grass texture
    this.add.image(0, CAM.horizonY, 'grass-noise').setOrigin(0, 0).setDepth(1).setAlpha(0.5);

    // pitch markings
    const m = this.add.graphics().setDepth(1);
    m.lineStyle(1, PAL.line, 0.7);
    const line = (x1, z1, x2, z2) => {
      const a = project(x1, 0, z1);
      const b = project(x2, 0, z2);
      m.lineBetween(a.x, a.y, b.x, b.y);
    };
    const zg = this.zGoal;
    line(-22, zg, 22, zg);                    // goal line
    const boxZ = zg - 5.5;
    line(-8.25, zg, -8.25, boxZ);             // penalty box
    line(8.25, zg, 8.25, boxZ);
    line(-8.25, boxZ, 8.25, boxZ);
    const sixZ = zg - 2.3;
    line(-3.6, zg, -3.6, sixZ);               // six yard box
    line(3.6, zg, 3.6, sixZ);
    line(-3.6, sixZ, 3.6, sixZ);
    const spot = project(0, 0, zg - 7.5);
    m.fillStyle(PAL.line, 0.7);
    m.fillRect(spot.x - 1, spot.y, 2, 1);
  }

  drawGoal() {
    const z = this.zGoal;
    const zb = z + 2.2;
    const HW = GOAL_W / 2;

    // Spring membrane renders behind the keeper and deforms at the exact goal
    // crossing point instead of behaving like a painted background.
    this.netBack = this.add.graphics().setDepth(2);
    this.netPhysics = new GoalNetPhysics({
      goalWidth: GOAL_W,
      goalHeight: GOAL_H,
      goalZ: z,
      depth: zb - z
    });
    this.netPhysics.draw(this.netBack, project, { alpha: 0.28 });

    // goal frame (renders in front of the ball once it is inside the net)
    const frame = this.add.graphics().setDepth(1000 - z * 10 + 2);
    const s = project(0, 0, z).s;
    const lw = Math.max(Math.round(POST_R * 2 * s), 2);
    const bl = project(-HW, 0, z);
    const tl = project(-HW, GOAL_H, z);
    const tr = project(HW, GOAL_H, z);
    const br = project(HW, 0, z);
    // dark under-stroke so the white frame pops off the crowd
    frame.lineStyle(lw + 2, 0x131b25, 0.9);
    frame.beginPath();
    frame.moveTo(bl.x + 1, bl.y + 1);
    frame.lineTo(tl.x + 1, tl.y + 1);
    frame.lineTo(tr.x + 1, tr.y + 1);
    frame.lineTo(br.x + 1, br.y + 1);
    frame.strokePath();
    frame.lineStyle(lw, 0xf8f8f4, 1);
    frame.beginPath();
    frame.moveTo(bl.x, bl.y);
    frame.lineTo(tl.x, tl.y);
    frame.lineTo(tr.x, tr.y);
    frame.lineTo(br.x, br.y);
    frame.strokePath();
    // back stanchions give the frame its 3D structure
    const tlb = project(-HW, GOAL_H * 0.92, zb);
    const trb = project(HW, GOAL_H * 0.92, zb);
    frame.lineStyle(1, 0xb9c2cc, 0.75);
    frame.lineBetween(tl.x, tl.y, tlb.x, tlb.y);
    frame.lineBetween(tr.x, tr.y, trb.x, trb.y);
    // 1px shading under the crossbar
    frame.lineStyle(1, 0x9aa0a8, 1);
    frame.lineBetween(tl.x + lw, tl.y + lw, tr.x - lw, tr.y + lw);

    // Once a goal is confirmed, this foreground mesh sits over the ball so it
    // reads as contained by the net instead of travelling through the texture.
    this.netFront = this.add.graphics().setDepth(1000 - z * 10 + 1).setVisible(false);
    this.netFront.lineStyle(1, 0xf4f7f6, 0.2);
    for (let x = -HW; x <= HW + 0.01; x += 0.6) {
      const t = project(x, GOAL_H * 0.92, zb);
      const b = project(x, 0, zb);
      this.netFront.lineBetween(t.x, t.y, b.x, b.y);
    }
    for (let y = 0; y <= GOAL_H * 0.92 + 0.01; y += 0.45) {
      const l = project(-HW, y, zb);
      const r = project(HW, y, zb);
      this.netFront.lineBetween(l.x, l.y, r.x, r.y);
    }
  }

  drawTargetZone() {
    const target = this.activeTarget;
    if (!target || typeof target !== 'object') return;
    const geometry = targetGeometry(target, GOAL_W, GOAL_H);
    const worldX = geometry.x;
    const worldY = geometry.y;
    const centre = project(worldX, worldY, this.zGoal + 0.08);
    const edgeX = project(worldX + geometry.rx, worldY, this.zGoal + 0.08);
    const edgeY = project(worldX, worldY + geometry.ry, this.zGoal + 0.08);
    const radiusX = Math.max(Math.abs(edgeX.x - centre.x), 4);
    const radiusY = Math.max(Math.abs(edgeY.y - centre.y), 4);
    // The target is a gameplay reticle, so it stays readable over the wall and
    // keeper while its geometry remains anchored to the goal plane.
    const g = this.add.graphics().setDepth(1200).setAlpha(0.9);
    this.targetGfx = g;
    this.targetAnchorScreenX = centre.x;
    g.fillStyle(0xf3c449, 0.2);
    g.fillEllipse(centre.x, centre.y, radiusX * 2, radiusY * 2);
    g.lineStyle(2, 0xf3c449, 0.9);
    g.strokeEllipse(centre.x, centre.y, radiusX * 2, radiusY * 2);
    g.lineStyle(1, 0xf3e7c3, 0.72);
    g.lineBetween(centre.x - radiusX * 0.62, centre.y, centre.x + radiusX * 0.62, centre.y);
    g.lineBetween(centre.x, centre.y - radiusY * 0.62, centre.x, centre.y + radiusY * 0.62);
    if (!this.settings.reducedMotion) {
      this.tweens.add({ targets: g, alpha: 0.56, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  updateConditions() {
    const moving = this.level.movingTarget;
    if (moving && this.activeTarget && this.baseTarget) {
      const offset = Math.sin(this.simTime * moving.speed + moving.phase) * moving.range;
      this.activeTarget.x = Phaser.Math.Clamp(this.baseTarget.x + offset, -0.78, 0.78);
      const geometry = targetGeometry(this.activeTarget, GOAL_W, GOAL_H);
      const centre = project(geometry.x, geometry.y, this.zGoal + 0.08);
      this.targetGfx?.setX(centre.x - this.targetAnchorScreenX);
    }

    const wind = this.level.wind;
    if (wind && typeof wind === 'object' && this.ball) {
      const gust = Number(wind.gust || 0);
      const gustX = gust > 0 ? Math.sin(this.simTime * 2.15 + this.level.distance) * gust : 0;
      this.ball.setWind({
        x: Number(wind.x || 0) + gustX,
        y: Number(wind.y || 0),
        z: Number(wind.z || 0)
      });
    }
  }

  buildWall() {
    if (this.wall) this.wall.destroy();
    if (this.level.wall <= 0) {
      this.wall = null;
      return;
    }
    // Wall stands on the line between the ball and the goal center, shaded
    // toward the near post - the far-post curler is always a real option.
    const t = (this.zWall - CAM.ballDist) / (this.zGoal - CAM.ballDist);
    const lineX = this.level.offsetX * (1 - t) + Math.sign(this.level.offsetX) * 0.3;
    this.wall = new Wall(this, this.level.wall, this.zWall, lineX);
  }

  buildHud() {
    const chrome = this.add.graphics().setDepth(1988);
    drawPanel(chrome, 4, 3, GAME_W - 8, 31, {
      fill: PAL.panel,
      border: PAL.borderDark,
      corner: PAL.goldDark
    });

    makeButton(this, 34, 18, 54, 23, 'EXIT', () => {
      this.scene.start(this.mode === 'career' ? 'LevelSelect' : 'Menu');
    }, {
      color: PAL.panelHi, hover: PAL.blue, border: PAL.borderDark,
      icon: 'icon-back', iconScale: 0.62, iconX: 12,
      fontSize: '7px', hitWidth: 58, hitHeight: 29
    }).setDepth(2000);

    this.muteButton = makeIconButton(this, 70, 18, 21,
      Audio.muted ? 'icon-mute' : 'icon-sound', () => {
        const muted = Audio.toggleMuted();
        SaveManager.setSetting('muted', muted);
        this.muteButton.buttonIcon?.setTexture(muted ? 'icon-mute' : 'icon-sound');
      }, {
        color: PAL.panelHi, hover: PAL.blue, border: PAL.borderDark,
        iconScale: 0.67, hitWidth: 29, hitHeight: 29
      }).setDepth(2000);

    if (this.mode === 'career') {
      bodyText(this, 91, 11, `${String(this.level.cup || 'career').toUpperCase()} CUP  ·  MATCH ${String(this.levelIndex + 1).padStart(2, '0')}`, {
        fontSize: '6px', color: '#8fa2ab', letterSpacing: 0.38
      }).setDepth(2000);
      bodyText(this, 91, 24, String(this.level.name).toUpperCase(), {
        fontFamily: FONT, fontSize: '8px', color: '#f3e7c3', letterSpacing: 0.2
      }).setDepth(2000);

      // Slim one-line strip; fades away while the shot is live so the bottom
      // of the pitch belongs to the ball, not a UI slab.
      const objectivePlate = this.add.graphics().setDepth(1975);
      drawPanel(objectivePlate, 137, GAME_H - 27, 337, 22, {
        fill: PAL.panel, border: PAL.borderDark, corner: PAL.goldDark, alpha: 0.93
      });
      const objectiveLabel = bodyText(this, 148, GAME_H - 16, 'OBJECTIVE', {
        fontFamily: FONT, fontSize: '6px', color: '#f3c449', letterSpacing: 0.45
      }).setDepth(2000);
      const objectiveCopy = bodyText(this, 207, GAME_H - 16, this.level.objective?.label || 'Score the free kick', {
        fontSize: '7px', color: '#d7dfda', letterSpacing: 0.15
      }).setDepth(2000);
      this.objectiveUi = [objectivePlate, objectiveLabel, objectiveCopy];

      const needed = Math.max(1, this.level.objective?.goals || 1);
      if (needed > 1) {
        this.objectiveProgressTxt = bodyText(this, 464, GAME_H - 16, `0/${needed}`, {
          originX: 1, fontFamily: FONT, fontSize: '9px', color: '#f3c449'
        }).setDepth(2000);
        this.objectiveUi.push(this.objectiveProgressTxt);
      }
      this.attemptIcons = [];
      // Cosmetic balls ship at several native sizes (12px pixel art, 57px HD),
      // so size the HUD icons from the texture instead of a fixed scale.
      const iconTexW = this.textures.get(this.ballTexture).getSourceImage()?.width || 12;
      for (let i = 0; i < this.maxAttempts; i++) {
        const icon = this.add.image(GAME_W - 15 - i * 14, 18, this.ballTexture)
          .setScale(11 / iconTexW).setDepth(2000);
        this.attemptIcons.push(icon);
      }
      const windX = typeof this.level.wind === 'object' ? Number(this.level.wind.x || 0) : Number(this.level.wind || 0);
      if (Math.abs(windX) >= 0.1) {
        bodyText(this, GAME_W - 64, 28, `WIND ${Math.abs(windX).toFixed(1)} ${windX > 0 ? '>' : '<'}`, {
          originX: 0.5, fontSize: '6px', color: '#f3c449'
        }).setDepth(2000);
      }
      const techniqueHint = this.level.objective?.type === 'dip' || this.level.objective?.type === 'loft'
        ? 'START AT THE BALL  ·  STEEPER SWIPE = MORE LOFT'
        : this.level.objective?.type === 'low-shot'
          ? 'START AT THE BALL  ·  SHORT FLAT SWIPE UNDER THE JUMP'
          : this.levelIndex === 0
            ? 'DRAG UP FROM THE BALL  ·  ARC THE SWIPE TO BEND'
            : null;
      if (techniqueHint) {
        this.hint = crispText(this.add.text(GAME_W / 2 + 30, GAME_H - 84, techniqueHint, {
          fontFamily: FONT, fontSize: '7px', color: '#f3e7c3', stroke: '#071018', strokeThickness: 2
        }).setOrigin(0.5).setDepth(2000));
        this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
      }
    } else if (this.mode === 'daily') {
      bodyText(this, 91, 11, `DAILY KICK  ·  ${this.dailyDate}`, {
        fontSize: '6px', color: '#f3c449', letterSpacing: 0.32
      }).setDepth(2000);
      bodyText(this, 91, 24, 'FIVE SHOTS  ·  ONE SHARED CHALLENGE', {
        fontFamily: FONT, fontSize: '7px', color: '#f3e7c3', letterSpacing: 0.18
      }).setDepth(2000);
      this.scoreTxt = bodyText(this, 302, 18, `SCORE ${this.score}`, {
        originX: 0.5, fontFamily: FONT, fontSize: '9px', color: '#f3e7c3'
      }).setDepth(2000);
      const shots = makeStatChip(this, GAME_W - 42, 18, 70, 'icon-star', `1/${this.maxAttempts}`, {
        height: 23, fill: PAL.night, border: PAL.goldDark, color: '#f3c449', fontSize: '9px'
      }).setDepth(2000);
      this.dailyShotsTxt = shots.valueText;

      const objectivePlate = this.add.graphics().setDepth(1975);
      drawPanel(objectivePlate, 137, GAME_H - 27, 337, 22, {
        fill: PAL.panel, border: PAL.goldDark, corner: PAL.gold, alpha: 0.93
      });
      const dailyLabel = bodyText(this, 148, GAME_H - 16, 'DAILY BONUS', {
        fontFamily: FONT, fontSize: '6px', color: '#f3c449', letterSpacing: 0.45
      }).setDepth(2000);
      const dailyCopy = bodyText(this, 216, GAME_H - 16, 'Hit the moving target for +650. Every goal counts.', {
        fontSize: '7px', color: '#d7dfda', letterSpacing: 0.12
      }).setDepth(2000);
      this.objectiveUi = [objectivePlate, dailyLabel, dailyCopy];
    } else {
      this.scoreTxt = bodyText(this, GAME_W / 2, 12, `SCORE ${this.score}`, {
        originX: 0.5, fontFamily: FONT, fontSize: '10px', color: '#f3e7c3'
      }).setDepth(2000);
      this.comboTxt = bodyText(this, GAME_W / 2, 26,
        this.combo > 1 ? `x${this.combo} COMBO` : `${this.goals} GOALS`, {
          originX: 0.5, fontSize: '6px', color: '#74bde8', letterSpacing: 0.35
        }).setDepth(2000);
      const timer = makeStatChip(this, GAME_W - 40, 18, 66, 'icon-clock', Math.ceil(this.timeLeft), {
        height: 23, fill: PAL.night, border: PAL.goldDark, color: '#f3c449', fontSize: '10px'
      }).setDepth(2000);
      this.timerTxt = timer.valueText;
    }

    this.bannerPlate = this.add.graphics().setDepth(2095).setAlpha(0);
    drawPanel(this.bannerPlate, GAME_W / 2 - 105, 38, 210, 28, {
      fill: PAL.panel, border: PAL.goldDark, corner: PAL.gold
    });
    this.banner = titleText(this, GAME_W / 2, 52, '', '14px').setDepth(2100).setAlpha(0);
    this.inputHint = crispText(this.add.text(GAME_W / 2, GAME_H - 34, '', {
      fontFamily: FONT, fontSize: '9px', color: '#f3e7c3',
      stroke: '#071018', strokeThickness: 3
    }).setOrigin(0.5).setDepth(2100).setAlpha(0));

    // Labels for the live gesture meter; drawAim toggles their visibility.
    const meterX = GAME_W / 2 - 48;
    const meterY = GAME_H - 48;
    this.meterUi = [
      bodyText(this, meterX - 33, meterY + 1, 'LOFT', {
        fontSize: '5px', color: '#74bde8', letterSpacing: 0.3, originX: 1, originY: 0.5
      }),
      bodyText(this, meterX + 1, meterY - 7, 'POWER', {
        fontSize: '5px', color: '#f3e7c3', letterSpacing: 0.3
      }),
      bodyText(this, meterX + 96, meterY + 8, 'CURL', {
        fontSize: '5px', color: '#d75a3a', letterSpacing: 0.3, originY: 0.5
      })
    ];
    this.meterUi.forEach((label) => label.setDepth(1501).setVisible(false));
    addScanlines(this, 1850, 0.022);
  }

  showBanner(text, color = '#f0e8d0') {
    this.tweens.killTweensOf([this.banner, this.bannerPlate]);
    const reduced = Boolean(this.settings.reducedMotion);
    this.bannerPlate?.setAlpha(0).setY(reduced ? 0 : -7);
    this.banner.setText(text).setColor(color).setAlpha(0).setScale(reduced ? 1 : 0.94).setY(reduced ? 52 : 45);
    const enter = {
      targets: [this.banner, this.bannerPlate],
      alpha: 1,
      duration: reduced ? 120 : 200,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        if (!reduced) this.banner.setY(52 + this.bannerPlate.y);
      }
    };
    if (!reduced) enter.y = 0;
    this.tweens.add(enter);
    if (!reduced) this.tweens.add({ targets: this.banner, scale: 1, duration: 200, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: [this.banner, this.bannerPlate],
      alpha: 0,
      delay: 850,
      duration: 180,
      ease: 'Cubic.easeOut'
    });
  }

  showSwipeHint(reason) {
    const copy = {
      'too-short': 'LONGER SWIPE = MORE CONTROL',
      'swipe-up': 'SWIPE UP TOWARD THE GOAL',
      'not-enough-points': 'DRAG, THEN RELEASE TO SHOOT',
      'start-zone': 'START YOUR SWIPE ON THE BALL'
    };
    this.showSwipeHintMessage(copy[reason] || 'TRY A CLEAN UPWARD SWIPE');
  }

  canStartSwipe(point) {
    if (!point || point.y >= GAME_H - 30) return false;
    const ball = project(this.ball.x, this.ball.y, this.ball.z);
    const dx = (point.x - ball.x) / 68;
    const dy = (point.y - ball.y) / 46;
    return dx * dx + dy * dy <= 1;
  }

  onSwipeStart() {
    if (!this.objectiveUi) return;
    this.tweens.killTweensOf(this.objectiveUi);
    this.tweens.add({ targets: this.objectiveUi, alpha: 0.14, duration: 140, ease: 'Cubic.easeOut' });
  }

  onSwipeEnd(valid) {
    if (valid || !this.objectiveUi || this.state !== 'AIMING') return;
    this.tweens.killTweensOf(this.objectiveUi);
    this.tweens.add({ targets: this.objectiveUi, alpha: 1, duration: 160, ease: 'Cubic.easeOut' });
  }

  showSwipeHintMessage(message) {
    if (!this.inputHint || this.state === 'OVERLAY') return;
    this.inputHint.setText(message).setAlpha(1).setY(GAME_H - 30);
    this.tweens.killTweensOf(this.inputHint);
    this.tweens.add({
      targets: this.inputHint,
      y: GAME_H - 35,
      alpha: 0,
      delay: 700,
      duration: 450,
      ease: 'Quad.easeOut'
    });
  }

  // ---------------------------------------------------------------- shooting

  takeShot(shot) {
    if (this.state !== 'AIMING' || this.over) return;
    this.state = 'WINDUP';
    this.flightT = 0;
    this.slowmoUsed = false;
    this.slowmoT = 0;
    this.swipe.enabled = false;
    if (this.hint) {
      this.hint.destroy();
      this.hint = null;
    }
    if (this.objectiveUi) {
      this.tweens.add({ targets: this.objectiveUi, alpha: 0, duration: 240, ease: 'Sine.easeOut' });
    }
    this.lastShot = shot;
    this.wallClearanceY = null;
    Audio.prepare();
    this.kicker?.playKick({
      reducedMotion: this.settings.reducedMotion,
      onContact: () => this.launchShot(shot)
    });
  }

  launchShot(shot) {
    if (this.state !== 'WINDUP' || this.over) return;
    this.state = 'FLIGHT';
    Audio.kick(shot.power);
    if (Math.abs(shot.spin) > 0.45) Audio.whoosh(Math.abs(shot.spin));
    this.ball.kick(shot.vx, shot.vy, shot.vz, shot.spin);
    this.keeper.onShot(this.ball, this.zGoal);
  }

  shootDebug(vx, vy, vz, spin) {
    this.takeShot({ vx, vy, vz, spin });
  }

  // ---------------------------------------------------------------- update

  update(time, delta) {
    // Phaser camera effects can transiently restore the default 1x zoom after
    // a shake. Keep the authored logical viewport locked to the HD backing
    // canvas so a save/post impact never shrinks the match into a tiny island.
    if (this.cameras.main.zoom !== RENDER_SCALE) {
      this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    }
    // Physics runs at a fixed cadence so the same gesture produces the same
    // shot at 30, 60, 120 Hz and after small browser stalls. The mode clock is
    // real-time based and intentionally pauses during result cards.
    const rawDt = Math.min(Math.max(delta, 0), 250) / 1000;

    // Timed bullet time: hold briefly, then ramp smoothly back to full speed.
    if (this.slowmoT > 0) {
      this.slowmoT = Math.max(0, this.slowmoT - rawDt);
      const ramp = 0.14;
      this.simSpeed = this.slowmoT > ramp
        ? 0.45
        : 0.45 + 0.55 * (1 - this.slowmoT / ramp);
      if (this.slowmoT === 0) this.simSpeed = 1;
    }

    if (this.mode === 'arcade' && !this.over &&
        this.state !== 'OVERLAY' && this.state !== 'RESULT') {
      // Wall-clock seconds: cinematic slow motion never stretches the round.
      this.timeLeft -= rawDt;
      const secs = Math.max(Math.ceil(this.timeLeft), 0);
      this.timerTxt.setText(`${secs}`);
      if (secs <= 10 && secs !== this.lastTickSecond) {
        this.lastTickSecond = secs;
        Audio.tick();
      }
      if (this.timeLeft <= 0) {
        this.endArcade();
        return;
      }
    }

    this.accumulator += Math.min(rawDt, 0.12) * this.simSpeed;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS) {
      this.simulate(FIXED_STEP, time);
      this.accumulator -= FIXED_STEP;
      steps++;
    }
    // Do not carry a multi-second tab suspension into the next visible frame.
    if (steps === MAX_STEPS) this.accumulator = 0;

    // Very high-refresh displays can produce frames shorter than one fixed
    // step. Presentation still updates while the world waits for the next tick.
    if (steps === 0 && this.state === 'AIMING') {
      if (this.wall) this.wall.draw();
      this.keeper.draw();
    }

    this.drawBall();
    this.drawAim();
  }

  simulate(dt, renderTime) {
    this.simTime += dt;
    this.updateConditions();
    this.frameCollisionCooldown = Math.max(0, this.frameCollisionCooldown - dt);
    if (this.wall) this.wall.update(dt);
    this.keeper.update(dt, renderTime);
    if (this.netPhysics?.active) {
      this.netPhysics.update(dt);
      if (this.netPhysics.needsRedraw) this.netPhysics.draw(this.netBack, project, { alpha: 0.36 });
    }

    if (this.state === 'FLIGHT' || this.state === 'RESULT') {
      const vx = this.ball.vx;
      const vy = this.ball.vy;
      const vz = this.ball.vz;
      this.ball.update(dt);
      if (this.ball.inNet) this.checkNetContact(vx, vy, vz);
    }
    if (this.state === 'FLIGHT') {
      this.flightT += dt;
      this.checkFlight();
    }
  }

  checkNetContact(vx, vy, vz) {
    const ball = this.ball;
    const net = this.netPhysics;
    if (!net) return;

    if (!this.netTouched && Number.isFinite(ball.netBackZ) &&
        ball.z + BALL_R >= ball.netBackZ - 0.12) {
      this.netTouched = true;
      net.impact({
        x: ball.x,
        y: ball.y,
        speed: Math.max(Math.hypot(vx, vy, vz), (this.netEntrySpeed || 0) * 0.7),
        radius: 0.95
      });
      Audio.net();
      return;
    }

    if (!this.netSideRippled) {
      const sideLimit = GOAL_W / 2 - BALL_R;
      const hitSide = Math.abs(ball.x) >= sideLimit - 1e-6 && vx * Math.sign(ball.x) > 1.2;
      const hitRoof = ball.y >= GOAL_H - BALL_R - 1e-6 && vy > 1.2;
      if (hitSide || hitRoof) {
        this.netSideRippled = true;
        net.impact({
          x: hitSide ? Math.sign(ball.x) * (GOAL_W / 2 - 0.5) : ball.x,
          y: hitRoof ? GOAL_H * 0.9 : ball.y,
          speed: Math.abs(hitSide ? vx : vy) * 2,
          strength: 0.55,
          radius: 0.75
        });
        Audio.net();
      }
    }
  }

  checkFlight() {
    const ball = this.ball;

    // wall jumps just before the ball arrives
    if (this.wall && !this.wall.jumped && ball.vz > 0.5) {
      if ((this.zWall - ball.z) / ball.vz < 0.34) this.wall.jump();
    }

    if (this.wall && ball.crossed(this.zWall)) {
      const pt = ball.pointAt(this.zWall);
      this.wallClearanceY = pt.y;
      const wallContact = this.wall.contact(pt);
      if (wallContact) {
        this.wall.impact(wallContact, pt, ball);
        ball.vz *= -0.25;
        ball.vx = -ball.vx * 0.32 + Math.sign(pt.x - (this.wall.centerX || 0) || 1) * 0.9;
        ball.vy = Math.min(ball.vy * 0.4 + 1.5, 5);
        ball.spin = 0;
        const spos = project(pt.x, pt.y, this.zWall);
        this.impact.explode(8, spos.x, spos.y);
        this.playImpactShake(90, 0.72);
        Audio.save();
        this.resolve('WALL');
        return;
      }
    }

    // Keeper contact is resolved at the keeper's actual depth and against the
    // current animated body/hands, not retroactively at the goal line.
    if (!this.keeperContactChecked && ball.crossed(this.keeper.z)) {
      this.keeperContactChecked = true;
      const pt = ball.pointAt(this.keeper.z);
      const contact = this.keeper.contact(pt, ball);
      if (contact?.result === 'catch') {
        this.keeper.catchBall(pt);
        ball.flying = false;
        this.ballCaught = true;
        Audio.save();
        this.resolve('CAUGHT');
        return;
      }
      if (contact?.result === 'parry') {
        this.keeper.impact(pt, ball);
        ball.vz = -(6.5 + this.keeper.skill * 2);
        ball.vx += Math.sign(pt.x - this.keeper.x || this.keeper.diveDir) * (3.2 + this.keeper.skill * 1.8);
        ball.vy = Math.max(ball.vy * 0.25, 2.8);
        ball.spin *= -0.25;
        const spos = project(pt.x, pt.y, this.keeper.z);
        this.impact.explode(12, spos.x, spos.y);
        this.playImpactShake(80, 0.68);
        Audio.save();
        this.resolve('SAVE');
        return;
      }
    }

    // Bullet time is a spice, not a sauce: a short, timed dip reserved for
    // shots arrowing at the corners or skimming the bar. Ordinary on-target
    // shots resolve at full speed so the retry loop stays fast.
    if (!this.settings.reducedMotion && !this.slowmoUsed && ball.z > this.zWall && ball.z < this.zGoal - 2) {
      const p = ball.predictAt(this.zGoal);
      if (p.reached && Math.abs(p.x) < GOAL_W / 2 && p.y < GOAL_H) {
        this.slowmoUsed = true;
        const nearPost = Math.abs(p.x) > GOAL_W / 2 - 0.9;
        const underBar = p.y > GOAL_H - 0.55;
        if (isTopCorner(p, GOAL_W, GOAL_H) || nearPost || underBar) {
          this.slowmoT = 0.4;
          this.simSpeed = 0.45;
        }
      }
    }

    const sweptFrame = sweepGoalFrame(ball, this.zGoal, {
      goalWidth: GOAL_W,
      goalHeight: GOAL_H,
      postRadius: POST_R,
      ballRadius: BALL_R
    });
    if (sweptFrame && this.frameCollisionCooldown <= 0) {
      this.handleFrameImpact(sweptFrame.contact, sweptFrame.point);
      return;
    }

    if (ball.crossed(this.zGoal)) {
      const pt = ball.pointAt(this.zGoal);
      const contact = classifyGoalPlane(pt, {
        goalWidth: GOAL_W,
        goalHeight: GOAL_H,
        postRadius: POST_R,
        ballRadius: BALL_R
      });

      if (contact.frame && this.frameCollisionCooldown <= 0) {
        this.handleFrameImpact(contact, pt);
      } else if (contact.inFrame) {
        this.resolve('GOAL', pt);
      } else {
        this.resolve(this.frameTouched ? 'POST' : 'MISS');
      }
      return;
    }

    // A frame rebound travelling clearly back into the pitch is already
    // decided; end the shot promptly instead of waiting for a long airborne
    // arc to time out. Forward glances still remain live and can roll in.
    if (this.frameTouched && ball.vz < 0 && this.frameImpactT != null &&
        this.simTime - this.frameImpactT > 0.65 && ball.z < this.zGoal - 1.1) {
      this.resolve('POST');
      return;
    }

    // weak shot never reached the goal, or something went long
    if (this.flightT > 7 || (ball.vz < 0.6 && ball.y <= BALL_R + 0.01 && this.flightT > 1.2)) {
      this.resolve(this.frameTouched ? 'POST' : 'MISS');
    }
  }

  handleFrameImpact(contact, point) {
    this.frameTouched = true;
    this.frameImpactT = this.simTime;
    this.frameCollisionCooldown = 0.045;
    reboundFromGoalFrame(this.ball, point, contact, this.zGoal, 0.72);
    const screen = project(point.x, point.y, point.z ?? this.zGoal);
    this.impact.explode(contact.frame === 'crossbar' ? 14 : 11, screen.x, screen.y);
    this.playImpactShake(110, contact.frame === 'crossbar' ? 1.05 : 0.82);
    Audio.post(contact.frame);
  }

  resolve(outcome, pt) {
    // A scene transition or duplicate collision must never finish an old shot.
    // Phaser text textures are already released during shutdown, so letting a
    // late result write into the retired HUD can freeze the next match.
    if (this.state === 'RESULT' || this.state === 'OVERLAY' || !this.sys?.isActive?.()) return;
    this.state = 'RESULT';
    PlatformService.gameplayStop();
    this.simSpeed = 1;
    this.slowmoT = 0;
    this.swipe.enabled = false;

    const shotRating = scoreShot({
      outcome,
      point: pt,
      shot: this.lastShot,
      streak: outcome === 'GOAL' ? this.combo : 0,
      target: this.activeTarget,
      goalWidth: GOAL_W,
      goalHeight: GOAL_H
    });
    this.lastShotRating = shotRating;
    let isTopCorner = shotRating.topCorner;
    switch (outcome) {
      case 'GOAL': {
        this.netTouched = false;
        this.netSideRippled = false;
        this.netEntrySpeed = Math.hypot(this.ball.vx, this.ball.vy, this.ball.vz);
        this.ball.enterNet(this.zGoal + 2.15);
        this.netFront?.setVisible(true);
        this.time.delayedCall(180, () => this.kicker?.celebrate(720));
        this.time.delayedCall(150, () => this.keeper?.reactToGoal());
        const spos = project(pt.x, pt.y, this.zGoal);
        this.confetti.explode(60, spos.x, spos.y);
        this.showBanner(isTopCorner ? 'TOP BINS' : shotRating.grade === 'S' ? 'WORLD CLASS' : 'GOAL', '#f2c832');
        Audio.goal();
        this.playCrowdWave();
        if (!this.settings.reducedMotion) {
          this.tweens.add({
            targets: this.crowdGlow,
            alpha: 0.16,
            duration: 120,
            yoyo: true,
            repeat: 2,
            ease: 'Cubic.easeOut'
          });
        }
        break;
      }
      case 'CAUGHT':
        this.showBanner('CAUGHT!', '#ff8a65');
        Audio.groan();
        break;
      case 'SAVE':
        this.showBanner('SAVED!', '#ff8a65');
        this.time.delayedCall(560, () => this.keeper?.celebrateSave());
        Audio.groan();
        break;
      case 'WALL':
        this.showBanner('BLOCKED!', '#ff8a65');
        Audio.groan();
        break;
      case 'POST':
        this.showBanner('OFF THE POST!', '#ffab40');
        Audio.groan();
        break;
      default:
        this.showBanner('OFF TARGET', '#b0bec5');
        Audio.groan();
    }

    this.recordShotOutcome(outcome, shotRating);

    if (this.mode === 'arcade') {
      if (outcome === 'GOAL') {
        this.combo++;
        this.goals++;
        this.score += shotRating.points;
      } else {
        this.combo = 0;
        this.score += shotRating.points;
      }
      this.scoreTxt.setText(`SCORE ${this.score}`);
      this.comboTxt?.setText(this.combo > 1 ? `x${this.combo} COMBO` : `${this.goals} GOALS`);
      this.time.delayedCall(this.resultResetDelay(outcome, 1150), () => {
        if (!this.over) {
          this.scene.restart({
            mode: 'arcade', score: this.score, goals: this.goals,
            combo: this.combo, timeLeft: this.timeLeft
          });
        }
      });
      return;
    }

    if (this.mode === 'daily') {
      this.handleDailyOutcome(outcome, shotRating);
      return;
    }

    this.handleCareerOutcome(outcome, pt, shotRating);
  }

  recordShotOutcome(outcome, rating) {
    const scored = outcome === 'GOAL';
    const curvedGoal = scored && Math.abs(this.lastShot?.spin || 0) >= 0.3;
    SaveManager.incrementStat('shots');
    if (scored) SaveManager.incrementStat('goals');
    else if (outcome === 'SAVE' || outcome === 'CAUGHT') SaveManager.incrementStat('saves');
    else if (outcome === 'WALL') SaveManager.incrementStat('wallHits');
    else if (outcome === 'POST') SaveManager.incrementStat('postHits');
    else SaveManager.incrementStat('misses');
    if (scored && rating.topCorner) SaveManager.incrementStat('topCorners');
    if (curvedGoal) SaveManager.incrementStat('curvedGoals');
    SaveManager.trackMissions({
      shots: 1,
      goals: scored ? 1 : 0,
      topCorners: scored && rating.topCorner ? 1 : 0,
      curvedGoals: curvedGoal ? 1 : 0,
      score: rating.points || 0
    });
  }

  handleDailyOutcome(outcome, rating) {
    if (outcome === 'GOAL') {
      this.combo++;
      this.goals++;
    } else {
      this.combo = 0;
    }
    this.score += rating.points || 0;
    this.bestShotScore = Math.max(this.bestShotScore, rating.points || 0);
    this.scoreTxt?.setText(`SCORE ${this.score}`);
    this.dailyShotsTxt?.setText(`${this.attempt}/${this.maxAttempts}`);

    if (this.attempt >= this.maxAttempts) {
      this.time.delayedCall(this.resultResetDelay(outcome, 1400), () => this.showDailyComplete());
      return;
    }

    this.attempt++;
    const remaining = this.maxAttempts - this.attempt + 1;
    this.dailyShotsTxt?.setText(`${this.attempt}/${this.maxAttempts}`);
    this.time.delayedCall(550, () => this.showSwipeHintMessage(
      outcome === 'GOAL'
        ? `${rating.label.toUpperCase()}  ·  ${remaining} SHOTS LEFT`
        : `${remaining} SHOTS LEFT  ·  BUILD THE SCORE`
    ));
    this.time.delayedCall(this.resultResetDelay(outcome), () => this.resetAttempt());
  }

  objectiveCheck(outcome, point, rating) {
    const objective = this.level.objective || { type: 'score', goals: 1 };
    const shot = this.lastShot || {};
    if (outcome !== 'GOAL') {
      const reasons = {
        SAVE: 'KEEPER READ IT — CHANGE CORNER OR ADD CURL',
        CAUGHT: 'TOO CLOSE TO THE KEEPER — AIM WIDER',
        WALL: 'WALL BLOCKED IT — LIFT OR BEND THE SHOT',
        POST: 'INCHES AWAY — USE SLIGHTLY LESS WIDTH',
        MISS: 'OFF TARGET — FINISH THE SWIPE TOWARD GOAL'
      };
      return { qualifies: false, finish: null, reason: reasons[outcome] || 'SHOT DID NOT COUNT' };
    }

    const curveAmount = Math.abs(shot.spin || 0);
    const curveDirectionOk = !objective.curveDirection ||
      (objective.curveDirection === 'right' ? shot.spin > 0 : shot.spin < 0);
    const curveOk = curveAmount >= (objective.minimumCurve || 0) && curveDirectionOk;
    const heightAtWall = this.wallClearanceY ?? point?.y ?? 0;
    const highEnough = objective.minimumHeight == null || heightAtWall >= objective.minimumHeight;
    const lowEnough = objective.maximumHeight == null || heightAtWall <= objective.maximumHeight;
    const targetOk = !this.activeTarget || rating.targetHit;

    let qualifies;
    switch (objective.type) {
      case 'target':
      case 'target-streak':
      case 'wind-target': qualifies = targetOk; break;
      case 'curve':
      case 'curve-streak': qualifies = curveOk; break;
      case 'curve-target': qualifies = curveOk && targetOk; break;
      case 'loft': qualifies = highEnough; break;
      case 'dip': qualifies = highEnough; break;
      case 'low-shot': qualifies = lowEnough; break;
      case 'power': qualifies = (shot.power ?? 0) >= 0.72; break;
      case 'goals':
      case 'streak': qualifies = objective.minimumCurve > 0 ? curveOk : true; break;
      default: qualifies = true;
    }

    const finish = rating.topCorner
      ? 'top-corner'
      : curveAmount >= 0.34
        ? 'curve'
        : (shot.power ?? 0) >= 0.86
          ? 'power'
          : point?.y < 0.95 ? 'low' : 'placed';
    const duplicateFinish = objective.type === 'final' && this.finishTypes.has(finish);
    if (duplicateFinish) qualifies = false;

    let reason = null;
    if (!qualifies) {
      if (duplicateFinish) reason = 'USE A DIFFERENT FINISH THIS TIME';
      else if (!targetOk) reason = 'GOAL SCORED, BUT THE GOLD TARGET WAS MISSED';
      else if (!curveDirectionOk) reason = `CURVE THE OTHER WAY — ${objective.curveDirection?.toUpperCase()}`;
      else if (!curveOk) reason = 'MORE BEND NEEDED — ARC THE END OF YOUR SWIPE';
      else if (!highEnough) reason = 'TOO LOW — SWIPE LONGER AND STEEPER';
      else if (!lowEnough) reason = 'TOO HIGH — USE A SHORTER, FLATTER SWIPE';
      else if (objective.type === 'power') reason = 'MORE POWER NEEDED — USE A LONGER SWIPE';
      else reason = 'GOAL SCORED, BUT THE OBJECTIVE WAS NOT MET';
    }
    return { qualifies, finish, reason };
  }

  handleCareerOutcome(outcome, point, rating) {
    const objective = this.level.objective || { goals: 1, consecutive: false, label: 'Score' };
    const check = this.objectiveCheck(outcome, point, rating);
    const scored = outcome === 'GOAL';
    this.bestShotScore = Math.max(this.bestShotScore, rating.points || 0);

    if (scored && check.qualifies) {
      if (check.finish) this.finishTypes.add(check.finish);
      this.goalsThisLevel++;
      this.objectiveStreak++;
    } else {
      this.lastObjectiveFeedback = check.reason;
      this.objectiveStreak = 0;
      if (objective.consecutive) this.goalsThisLevel = 0;
    }

    const needed = Math.max(1, objective.goals || 1);
    this.objectiveProgressTxt?.setText(`${Math.min(this.goalsThisLevel, needed)}/${needed}`);
    if (this.goalsThisLevel >= needed) {
      const stars = careerStars({
        attempt: this.attempt,
        attempts: this.maxAttempts,
        objectiveMet: true,
        shotScore: this.bestShotScore,
        goalsRequired: needed
      });
      const coinsBefore = SaveManager.getCoins();
      SaveManager.setStars(this.level.id || this.levelIndex, stars);
      this.lastReward = Math.max(SaveManager.getCoins() - coinsBefore, 0);
      PlatformService.reportProgress(((this.levelIndex + 1) / LEVELS.length) * 100);
      if (this.levelIndex === LEVELS.length - 1) PlatformService.happyTime();
      this.time.delayedCall(this.resultResetDelay(outcome, 1450), () => this.showLevelClear(stars));
      return;
    }

    this.attemptIcons[this.attempt - 1]?.setTint(0x4b5560).setAlpha(0.42);
    this.attempt++;
    const remaining = Math.max(this.maxAttempts - this.attempt + 1, 0);
    if (this.attempt > this.maxAttempts) {
      this.time.delayedCall(this.resultResetDelay(outcome, 1350), () => this.showLevelFailed());
    } else {
      const message = scored && !check.qualifies
        ? check.reason
        : scored ? `${this.goalsThisLevel}/${needed} DONE — ${remaining} SHOTS LEFT` : `${check.reason}  ·  ${remaining} LEFT`;
      this.time.delayedCall(550, () => this.showSwipeHintMessage(message));
      this.time.delayedCall(this.resultResetDelay(outcome), () => this.resetAttempt());
    }
  }

  resultResetDelay(outcome, minimum = 750) {
    if (outcome !== 'SAVE' && outcome !== 'CAUGHT') return minimum;
    const keeperHold = this.keeper?.getResultHoldMs?.() || minimum;
    return Math.max(minimum, Math.min(keeperHold, 1050));
  }

  resetAttempt() {
    if (this.state === 'OVERLAY') return;
    this.ball.reset(this.level.offsetX);
    this.ball.setWind(this.level.wind || 0);
    this.ballCaught = false;
    this.keeperContactChecked = false;
    this.frameTouched = false;
    this.frameImpactT = null;
    this.frameCollisionCooldown = 0;
    this.netFront?.setVisible(false);
    this.netTouched = false;
    this.netSideRippled = false;
    this.netPhysics?.reset();
    if (this.netPhysics?.needsRedraw) this.netPhysics.draw(this.netBack, project, { alpha: 0.28 });
    this.ballSpr.setVisible(true);
    this.shadowSpr.setVisible(true);
    this.keeper.reset();
    this.kicker?.cancelSequence().setPose('ready');
    this.buildWall();
    if (this.wall) this.keeper.organiseWall();
    this.trailPts = [];
    this.trailGfx.clear();
    this.prevBallScreen = null;
    this.ballGhosts?.forEach((ghost) => ghost.spr.setVisible(false));
    this.simSpeed = 1;
    this.slowmoT = 0;
    this.state = 'AIMING';
    this.swipe.enabled = true;
    if (this.objectiveUi) {
      this.tweens.add({ targets: this.objectiveUi, alpha: 1, duration: 240, ease: 'Sine.easeIn' });
    }
    PlatformService.gameplayStart();
    Audio.whistle();
  }

  endArcade() {
    if (this.over) return;
    this.over = true;
    this.state = 'OVERLAY';
    this.swipe.enabled = false;
    PlatformService.gameplayStop();
    SaveManager.setBestArcade(this.score);
    SaveManager.incrementStat('arcadeRuns');
    const runReward = Math.min(20 + this.goals * 6 + Math.floor(this.score / 5000) * 5, 120);
    SaveManager.addCoins(runReward);
    this.showOverlay("TIME'S UP!", [
      `Score: ${this.score}`,
      `Goals: ${this.goals}  •  Best: ${SaveManager.getBestArcade()}`,
      `+${runReward} COINS`
    ], [
      { label: 'RETRY', color: 0xb85818, hover: 0xd87828, cb: () => this.scene.restart({ mode: 'arcade' }) },
      { label: 'MENU', color: 0x37474f, hover: 0x546e7a, cb: () => this.scene.start('Menu') }
    ]);
    this.time.delayedCall(1150, () => this.requestNaturalBreakAd());
  }

  showDailyComplete() {
    if (this.over) return;
    this.over = true;
    this.state = 'OVERLAY';
    this.swipe.enabled = false;
    PlatformService.gameplayStop();
    const result = SaveManager.completeDaily(this.dailyDate, this.score);
    this.dailyCompletion = result;
    const buttons = [];
    if (result.firstCompletion && result.reward > 0 && PlatformService.supportsAds()) {
      buttons.push({
        label: '2X COINS', color: PAL.green, hover: PAL.greenHi,
        cb: () => this.requestDailyBonus(result.reward)
      });
    } else {
      buttons.push({
        label: 'RETRY', color: PAL.blue, hover: PAL.blueHi,
        cb: () => this.scene.restart({ mode: 'daily', dailyDate: this.dailyDate })
      });
    }
    buttons.push({
      label: 'MISSIONS', color: PAL.goldDark, hover: PAL.gold,
      cb: () => this.scene.start('Progress', { tab: 'daily' })
    });
    buttons.push({
      label: 'MENU', color: PAL.panelHi, hover: PAL.border,
      cb: () => this.scene.start('Menu')
    });

    const rewardLine = result.reward > 0
      ? `STREAK ${result.streak}  ·  +${result.reward} COINS`
      : `STREAK ${result.streak}  ·  DAILY REWARD CLAIMED`;
    this.showOverlay('DAILY COMPLETE', [
      `SCORE ${this.score}  ·  BEST ${result.best}`,
      `${this.goals}/${this.maxAttempts} GOALS  ·  BEST SHOT ${this.bestShotScore}`,
      rewardLine
    ], buttons);
  }

  async requestDailyBonus(reward) {
    if (this.adRequestActive || !PlatformService.supportsAds()) return;
    this.adRequestActive = true;
    const wasMuted = Audio.muted;
    const blocker = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.28)
      .setDepth(4000).setInteractive();
    const status = bodyText(this, GAME_W / 2, GAME_H - 18, 'REWARD VIDEO', {
      originX: 0.5, fontFamily: FONT, fontSize: '7px', color: '#f3c449', letterSpacing: 0.5
    }).setDepth(4001);
    const shown = await PlatformService.requestRewardedAd({
      onStarted: () => Audio.setMuted(true)
    });
    Audio.setMuted(Boolean(wasMuted || this.settings.muted));
    blocker.destroy();
    status.destroy();
    this.adRequestActive = false;
    if (!shown) return;
    const bonus = SaveManager.claimDailyBonus(this.dailyDate, reward);
    if (bonus.success) Audio.coin();
    this.scene.start('Progress', { tab: 'daily' });
  }

  showLevelClear(stars) {
    this.state = 'OVERLAY';
    PlatformService.gameplayStop();
    const buttons = [];
    if (this.levelIndex + 1 < LEVELS.length) {
      buttons.push({
        label: 'NEXT >', color: 0x2e7d32, hover: 0x43a047,
        cb: () => this.scene.restart({ mode: 'career', levelIndex: this.levelIndex + 1 })
      });
    }
    buttons.push({
      label: 'REPLAY', color: 0x1976d2, hover: 0x2196f3,
      cb: () => this.scene.restart({ mode: 'career', levelIndex: this.levelIndex })
    });
    buttons.push({
      label: 'LEVELS', color: 0x37474f, hover: 0x546e7a,
      cb: () => this.scene.start('LevelSelect')
    });
    const lines = [
      `${this.lastShotRating?.label || 'Objective complete'}  •  ${this.bestShotScore} pts`,
      this.lastReward > 0 ? `+${this.lastReward} COINS EARNED` : 'BEST REWARD ALREADY CLAIMED'
    ];
    this.showOverlay('LEVEL CLEAR', lines, buttons, stars);
    this.time.delayedCall(1150, () => this.requestNaturalBreakAd());
  }

  showLevelFailed() {
    this.state = 'OVERLAY';
    PlatformService.gameplayStop();
    this.showOverlay('TRY AGAIN', [
      this.lastObjectiveFeedback || this.level.objective?.label || 'Out of attempts',
      'TIP: CHANGE ONE THING — HEIGHT, POWER, OR CURVE'
    ], [
      {
        label: 'RETRY', color: 0x1976d2, hover: 0x2196f3,
        cb: () => this.scene.restart({ mode: 'career', levelIndex: this.levelIndex })
      },
      { label: 'LEVELS', color: 0x37474f, hover: 0x546e7a, cb: () => this.scene.start('LevelSelect') }
    ]);
  }

  showOverlay(title, lines, buttons, stars = -1) {
    this.swipe.enabled = false;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.74)
      .setDepth(2999).setInteractive();
    void dim;

    const panel = this.add.graphics().setDepth(3000);
    drawPanel(panel, GAME_W / 2 - 125, 47, 250, 178, {
      fill: PAL.panel, border: PAL.goldDark, corner: PAL.gold
    });

    titleText(this, GAME_W / 2, 75, title, '18px', '#f3c449').setDepth(3001);

    if (stars >= 0) {
      for (let i = 0; i < 3; i++) {
        const star = this.add.image(
          GAME_W / 2 + (i - 1) * 34,
          112,
          i < stars ? 'icon-star' : 'icon-star-empty'
        ).setDepth(3001).setScale(this.settings.reducedMotion ? 1 : 0.94);
        if (!this.settings.reducedMotion) {
          this.tweens.add({
            targets: star,
            scale: 1.06,
            delay: 180 + i * 180,
            duration: 120,
            ease: 'Cubic.easeOut',
            onStart: () => { if (i < stars) Audio.star(i); },
            onComplete: () => this.tweens.add({
              targets: star,
              scale: 1,
              duration: 80,
              ease: 'Cubic.easeInOut'
            })
          });
        }
      }
    }

    const lineY = stars >= 0 ? 147 : 108;
    lines.forEach((line, i) => {
      this.add.text(GAME_W / 2, lineY + i * 16, line, {
        fontFamily: FONT, fontSize: '11px', color: '#cfe8ff'
      }).setOrigin(0.5).setDepth(3001);
    });

    const buttonW = buttons.length >= 3 ? 72 : 94;
    const gap = 7;
    const totalW = buttons.length * buttonW + (buttons.length - 1) * gap;
    buttons.forEach((b, i) => {
      makeButton(this,
        GAME_W / 2 - totalW / 2 + buttonW / 2 + i * (buttonW + gap), 203, buttonW, 26,
        b.label, b.cb, {
          color: b.color, hover: b.hover, border: i === 0 ? PAL.goldDark : PAL.borderDark,
          fontSize: '8px', hitHeight: 30
        }
      ).setDepth(3001);
    });
  }

  requestNaturalBreakAd() {
    if (this.state !== 'OVERLAY' || !PlatformService.supportsAds() || this.adRequestActive) return;
    this.adRequestActive = true;
    const wasMuted = Audio.muted;
    const blocker = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.18)
      .setDepth(4000).setInteractive();
    const status = bodyText(this, GAME_W / 2, GAME_H - 18, 'MATCH BREAK', {
      originX: 0.5, fontFamily: FONT, fontSize: '7px', color: '#a8b0ae', letterSpacing: 0.5
    }).setDepth(4001);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.adRequestActive = false;
      Audio.setMuted(Boolean(wasMuted || this.settings.muted));
      blocker.destroy();
      status.destroy();
    };
    PlatformService.requestMidgameAd({
      onStarted: () => Audio.setMuted(true),
      onFinished: cleanup,
      onError: cleanup,
      onUnavailable: cleanup
    }).finally(cleanup);
  }

  // ---------------------------------------------------------------- drawing

  drawBall() {
    if (this.ballCaught) {
      this.ballSpr.setVisible(false);
      this.shadowSpr.setVisible(false);
      this.ballGhosts?.forEach((ghost) => ghost.spr.setVisible(false));
      this.trailGfx.clear();
      return;
    }
    const b = this.ball;
    const pos = project(b.x, b.y, b.z);
    const depth = 1000 - b.z * 10;
    const ballScale = (pos.s * BALL_R * 2) / (this.ballSpr.texture.source[0]?.width || 12);
    this.ballSpr
      .setPosition(pos.x, pos.y)
      .setScale(ballScale)
      .setRotation(b.rot)
      .setDepth(depth);

    // Smear: bridge this frame's travel with interpolated ghost copies once
    // the ball covers more than a few logical pixels per frame.
    const prev = this.prevBallScreen;
    const travel = prev ? Math.hypot(pos.x - prev.x, pos.y - prev.y) : 0;
    const smearing = !this.settings.reducedMotion && b.flying && prev && travel > 5;
    for (const ghost of this.ballGhosts) {
      if (smearing) {
        ghost.spr
          .setVisible(true)
          .setPosition(
            prev.x + (pos.x - prev.x) * ghost.fraction,
            prev.y + (pos.y - prev.y) * ghost.fraction
          )
          .setScale(ballScale * (0.82 + ghost.fraction * 0.14))
          .setRotation(b.rot)
          .setAlpha(0.14 + ghost.fraction * 0.16)
          .setDepth(depth - 1);
      } else {
        ghost.spr.setVisible(false);
      }
    }
    this.prevBallScreen = { x: pos.x, y: pos.y };

    const sh = project(b.x, 0, b.z);
    const k = Phaser.Math.Clamp(1 - b.y * 0.1, 0.3, 1);
    this.shadowSpr
      .setPosition(sh.x, sh.y)
      .setScale((sh.s * BALL_R * 2 * 1.7 * k) / 10)
      .setAlpha(0.5 * k)
      .setDepth(depth - 1);

    // trail: fading pixel squares
    if (this.state === 'FLIGHT' || this.state === 'RESULT') {
      if (b.flying) {
        this.trailPts.push({ x: pos.x, y: pos.y, r: Math.max(pos.s * BALL_R, 1) });
        const maxTrail = this.trailStyle.enabled ? 24 : 10;
        if (this.trailPts.length > maxTrail) this.trailPts.shift();
      }
      this.trailGfx.clear().setDepth(depth - 2);
      const n = this.trailPts.length;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        const sz = Math.max(this.trailPts[i].r * (0.4 + f * 0.8), 1);
        const color = mixColor(this.trailStyle.end, this.trailStyle.start, f);
        this.trailGfx.fillStyle(color, f * (this.trailStyle.enabled ? 0.52 : 0.14));
        this.trailGfx.fillRect(this.trailPts[i].x - sz / 2, this.trailPts[i].y - sz / 2, sz, sz);
      }
    }
  }

  drawAim() {
    this.aimGfx.clear();
    const pts = this.state === 'AIMING' ? this.swipe.activePath : [];
    const preview = pts.length >= 2 ? computeShotFromPath(pts, { preview: true }).shot : null;
    this.meterUi?.forEach((label) => label.setVisible(Boolean(preview)));
    if (!preview) return;

    // The meter reads from the exact shot the release would produce - never
    // from gesture length. A slow long drag truthfully shows low power.
    const b = pts[pts.length - 1];
    const power = preview.power;
    const spin = preview.spin;
    const curlAmount = Math.abs(spin);
    const loft = Phaser.Math.Clamp(
      (preview.vy - SHOT.minVy) / (SHOT.maxVy - SHOT.minVy), 0, 1
    );
    const mixedColor = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xf3e7c3),
      Phaser.Display.Color.ValueToColor(curlAmount > 0.15 ? 0xf3c449 : 0xffffff),
      100,
      Math.round(curlAmount * 100)
    );
    const lineColor = Phaser.Display.Color.GetColor(mixedColor.r, mixedColor.g, mixedColor.b);

    // Dark keyline and bright segmented gesture give the swipe a readable,
    // broadcast-graphics feel over both grass and crowd.
    this.aimGfx.lineStyle(4, 0x071018, 0.58);
    this.aimGfx.beginPath();
    this.aimGfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.aimGfx.lineTo(pts[i].x, pts[i].y);
    this.aimGfx.strokePath();
    this.aimGfx.lineStyle(2, lineColor, 0.95);
    this.aimGfx.beginPath();
    this.aimGfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.aimGfx.lineTo(pts[i].x, pts[i].y);
    this.aimGfx.strokePath();

    if (pts.length >= 2) {
      const p = pts[Math.max(pts.length - 2, 0)];
      const angle = Math.atan2(b.y - p.y, b.x - p.x);
      const size = 6;
      this.aimGfx.fillStyle(lineColor, 1);
      this.aimGfx.fillTriangle(
        b.x, b.y,
        b.x - Math.cos(angle - 0.55) * size, b.y - Math.sin(angle - 0.55) * size,
        b.x - Math.cos(angle + 0.55) * size, b.y - Math.sin(angle + 0.55) * size
      );
    }

    const meterX = GAME_W / 2 - 48;
    const meterY = GAME_H - 48;
    this.aimGfx.fillStyle(0x071018, 0.78);
    this.aimGfx.fillRect(meterX - 36, meterY - 10, 136, 26);
    // POWER: swipe speed, exactly as the release physics reads it
    this.aimGfx.fillStyle(0x213a52, 1);
    this.aimGfx.fillRect(meterX, meterY, 94, 5);
    this.aimGfx.fillStyle(power > 0.88 ? 0xf3c449 : 0xf3e7c3, 1);
    this.aimGfx.fillRect(meterX, meterY, Math.round(94 * power), 5);
    // LOFT: vertical bar fed by the released vertical velocity
    this.aimGfx.fillStyle(0x213a52, 1);
    this.aimGfx.fillRect(meterX - 10, meterY - 6, 5, 18);
    const loftH = Math.round(18 * loft);
    this.aimGfx.fillStyle(0x74bde8, 1);
    this.aimGfx.fillRect(meterX - 10, meterY + 12 - loftH, 5, loftH);
    // CURL: marker driven by the released spin value
    this.aimGfx.fillStyle(0x1b2f42, 1);
    this.aimGfx.fillRect(meterX + 7, meterY + 8, 80, 2);
    const curlX = meterX + 47 + Phaser.Math.Clamp(spin, -1, 1) * 40;
    this.aimGfx.fillStyle(0xd75a3a, 1);
    this.aimGfx.fillRect(curlX - 2, meterY + 7, 5, 4);
  }
}
