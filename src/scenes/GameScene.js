import Phaser from 'phaser';
import {
  GAME_W, GAME_H, RENDER_SCALE, STADIUM_Y, CAM, GOAL_W, GOAL_H, POST_R, BALL_R, WALL_DIST, PHYS, SHOT, project
} from '../config.js';
import { LEVELS, dailyScenario, randomScenario } from '../data/levels.js';
import { utcDateKey } from '../data/progression.js';
import { getCosmetic } from '../data/cosmetics.js';
import { Ball } from '../objects/Ball.js';
import { Wall } from '../objects/Wall.js';
import { Goalkeeper } from '../objects/Goalkeeper.js';
import { Kicker } from '../objects/Kicker.js';
import { SwipeInput, computeShotFromPath } from '../systems/SwipeInput.js';
import { applyLoadoutToShot, resolveLoadoutGameplay } from '../systems/LoadoutGameplay.js';
import { AIM_ASSIST_MODES, SaveManager } from '../systems/SaveManager.js';
import { PlatformService } from '../systems/PlatformService.js';
import { Audio } from '../systems/AudioSynth.js';
import { MenuMusic } from '../systems/MenuMusic.js';
import { SettingsPanel } from '../systems/SettingsPanel.js';
import { careerStars, isTopCorner, scoreShot, targetGeometry } from '../systems/ShotScoring.js';
import {
  classifyGoalPlane,
  classifyReboundPosition,
  reboundFromGoalFrame,
  sweepGoalFrame
} from '../systems/GoalFramePhysics.js';
import { GoalNetPhysics } from '../systems/GoalNetPhysics.js';
import { sweepMovingZPlane } from '../systems/SweptCollision.js';
import {
  createRingProgress,
  evaluateAdvancedObjective,
  getEffectiveGoalDimensions,
  getHazard,
  getJitteredPower,
  getRingWorldGeometry,
  getWindVectorAt,
  normalizeHazards,
  normalizeKeeperConfig,
  normalizeWallConfig,
  updateRingProgress
} from '../systems/LevelMechanics.js';
import {
  makeButton, makeIconButton, makeStatChip, titleText, bodyText,
  drawPanel, addScanlines, configureHdCamera, crispText, FONT
} from '../ui.js';
import { PAL } from '../pixelart.js';
import { addCrowdTiers } from '../art/CrowdPanorama.js';
import { buildPitchMarkingLayout, PITCH_MARKING_DIMENSIONS } from '../art/PitchMarkings.js';
import { queueKeeperSheets } from '../data/keeperAssets.js';

const ATTEMPTS = 3;
const ARCADE_TIME = 60;
const FIXED_STEP = PHYS.fixedStep;
const MAX_STEPS = PHYS.maxSubsteps + 2;
const AD_TIMEOUT_MS = 15000;
const PAUSABLE_STATES = new Set(['AIMING', 'WINDUP', 'FLIGHT', 'RESULT']);
const CUP_TINTS = Object.freeze({
  academy: 0xe8f5e9,
  curve: 0xe6f1ff,
  targets: 0xfff4cc,
  pressure: 0xffe0d5,
  legend: 0xe6dcff,
  daily: 0xffedbd
});

const SECURITY_GUARD_LAYOUT = Object.freeze([18, 76, 109, 326, 405, 458]);
const SECURITY_GUARD_MOTION = Object.freeze([
  { dx: -0.45, dy: -0.45, angle: -0.55, duration: 1120, hold: 720, repeatDelay: 1800 },
  { dx: 0.55, dy: -0.25, angle: 0.45, duration: 1380, hold: 980, repeatDelay: 2300 },
  { dx: -0.35, dy: -0.60, angle: -0.35, duration: 980, hold: 640, repeatDelay: 2700 }
]);

// The touchline belongs to one sponsor, but six identical boards read as a
// texture rather than a stadium. Every board carries the CALYNX mark; what
// varies is the colourway and the width, which is how a real ground looks when
// an anchor sponsor has bought the whole run.
const BOARD_TOP_Y = 83;
// Hoarding height in world metres, derived from where the boards are painted:
// their top edge is BOARD_TOP_Y and their foot is on the stadium/turf seam.
const BOARD_HEIGHT = CAM.height -
  ((BOARD_TOP_Y - CAM.horizonY) * (CAM.height * CAM.focal / (STADIUM_Y - CAM.horizonY))) / CAM.focal;

const SPONSOR_BOARDS = Object.freeze([
  Object.freeze({ width: 104, fill: 0x1c4a9a, shade: 0x143676, trim: 0x6e93d3, logo: 0xf8f2df }),
  Object.freeze({ width: 88, fill: 0x156b45, shade: 0x0e4a2f, trim: 0x49a760, logo: 0xeafff2 }),
  Object.freeze({ width: 96, fill: 0x2b2413, shade: 0x1a1509, trim: 0xf3c449, logo: 0xffe6a8 }),
  Object.freeze({ width: 82, fill: 0x8f2f2a, shade: 0x64201c, trim: 0xd75a3a, logo: 0xffe3d8 }),
  Object.freeze({ width: 100, fill: 0x4a2a7a, shade: 0x321c55, trim: 0x9b5de5, logo: 0xece0ff }),
  Object.freeze({ width: 90, fill: 0x14555e, shade: 0x0d3a41, trim: 0x66b7bf, logo: 0xdefaff })
]);

// A photographers' pit and two camera positions behind the boards. Even a
// handful of small silhouettes stops the crowd/board/pitch transition reading
// as three flat stacked bands. Heights are chosen so heads and equipment clear
// the top of the advertising boards at y=83; anything shorter is invisible.
const TRACKSIDE_LAYOUT = Object.freeze([
  Object.freeze({ texture: 'trackside-photographer', x: 52, y: 96, w: 18, h: 27, flip: false, flash: 2600 }),
  Object.freeze({ texture: 'trackside-camera', x: 97, y: 100, w: 17, h: 40 }),
  Object.freeze({ texture: 'trackside-photographer', x: 288, y: 96, w: 18, h: 27, flip: true, flash: 4100 }),
  Object.freeze({ texture: 'trackside-photographer', x: 372, y: 96, w: 18, h: 27, flip: true, flash: 3300 }),
  Object.freeze({ texture: 'trackside-camera', x: 441, y: 100, w: 17, h: 40 })
]);

// Vomitories cut into the stand. Dark gaps at a believable rhythm give the
// crowd somewhere to have come from.
const STAND_ENTRANCES = Object.freeze([64, 186, 302, 424]);

// What each hazard actually does to the shot, in the player's language. Without
// these the effects are indistinguishable from bugs: a heavier ball reads as
// wrong physics, and a run-up that moves the power meter reads as a glitch.
const CONDITION_CHIPS = Object.freeze({
  snow: Object.freeze({ label: 'SNOW · HEAVY BALL', color: '#cfe6f5' }),
  slippery: Object.freeze({ label: 'SLIPPERY RUN-UP', color: '#ff8a65' }),
  fog: Object.freeze({ label: 'FOG', color: '#d7dfda' }),
  glare: Object.freeze({ label: 'FLOODLIGHT GLARE', color: '#ffe6a8' }),
  'crowd-pressure': Object.freeze({ label: 'CROWD PRESSURE', color: '#ff8a65' })
});

const HOOP_STAGES = Object.freeze({
  // A pending gate is deliberately much quieter than the live one. When two
  // hoops overlap on screen - which authored depths regularly cause - that
  // brightness gap is the only thing that tells the player which is next.
  pending: Object.freeze({ band: 0x7a5a1f, hi: 0x9a7530, alpha: 0.34, glyph: null, glyphColor: '#a08a55' }),
  active: Object.freeze({ band: 0xf3c449, hi: 0xffe9a8, alpha: 0.72, glyph: null, glyphColor: '#fff3cd' }),
  cleared: Object.freeze({ band: 0x49a760, hi: 0x9ef0b8, alpha: 0.8, glyph: '✓', glyphColor: '#9ef0b8' }),
  missed: Object.freeze({ band: 0x8b2c2c, hi: 0xd97a63, alpha: 0.55, glyph: '✕', glyphColor: '#ff8a65' })
});

// How far each hoop leans away from the camera, in radians. A gate rendered as
// a flat circle looks like a UI sticker; leaning it back means the rim is a
// genuine perspective ellipse whose near edge is larger than its far edge.
const HOOP_TILT = 0.30;
const HOOP_TUBE = 0.05;       // world-metre half-thickness of the rim
const HOOP_SEGMENTS = 52;

// Extra world metres of slack on every gate opening. The authored radii are
// generous now, but a gate the ball can only find on a knife edge is not a
// challenge, it is a lockout - this is the last bit of give.
const RING_FORGIVENESS = 0.22;

// Frames-worth of freeze on boot-to-ball contact, scaled by shot power.
const HIT_STOP_SECONDS = 0.055;

// First-run coaching for match 01. SaveManager has carried a {completed, step}
// tutorial record since the save format was written, and nothing ever set it -
// the controls only existed in the README. One concept per attempt, each with a
// ghost swipe the player can copy, and none of it blocks input.
const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    caption: 'SWIPE UP FROM THE BALL',
    detail: 'Drag from the ball toward the goal, then let go.',
    bow: 0,
    reach: 88,
    speed: 1
  }),
  Object.freeze({
    caption: 'SWIPE FASTER FOR MORE POWER',
    detail: 'The speed of the flick sets the power, not how far you drag.',
    bow: 0,
    reach: 96,
    speed: 2.1
  }),
  Object.freeze({
    caption: 'BOW THE SWIPE TO BEND IT',
    detail: 'Curve your drag and the ball follows that curve.',
    bow: 30,
    reach: 92,
    speed: 1.2
  })
]);

// The shot readout lives with the bottom chrome. Directly under the banner it
// covered the goalmouth at the one moment the player wants to watch the net.
const READOUT_Y = 231;
const COACHING_HINT_Y = 197;

// The thread itself: one continuous line drawn through the ball, every gate and
// the finish. This is the level, not decoration - the gates are eyes on it.
// The aim arc is a hint, not a road. It starts clear of the ball so the swipe
// line and the ball itself stay the brightest things on screen, and its dots
// never grow past a couple of pixels however near the camera they are.
const PREVIEW_ARC_SKIP = 4;
const PREVIEW_DOT_MAX = 2;

const THREAD_SAMPLES = 260;
const THREAD_ALPHA_LIVE = 0.5;   // the stretch the player still has to hit
const THREAD_ALPHA_AHEAD = 0.24; // the rest of the route, present but quiet

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
    // Phaser reuses this Scene instance across start/restart calls. Anything
    // optional must therefore be reset here, not left pointing at a Game
    // Object that the previous shutdown already destroyed. This was most
    // visible when academy level 8 (multi-goal progress text) restarted into
    // level 9 (no progress text): the next result called setText on the dead
    // level-8 Text object and crashed the match.
    this.sessionToken = (this.sessionToken || 0) + 1;
    this.sessionAlive = true;
    this.sessionShutdown = false;
    this.transitioning = false;
    this.scheduledCalls = new Set();
    this.pendingAsyncCancels = new Set();
    this.activeAdCleanup = null;
    this.adRequestActive = false;
    this.pauseReturnState = null;
    this.pauseOverlayObjects = [];
    this.terminalOverlayObjects = [];
    this.terminalOverlayShown = false;
    this.wall = null;
    this.walls = [];
    this.keeper = null;
    this.keepers = [];
    this.hint = null;
    this.objectiveUi = null;
    this.objectiveProgressTxt = null;
    this.attemptIcons = null;
    this.scoreTxt = null;
    this.comboTxt = null;
    this.timerTxt = null;
    this.dailyShotsTxt = null;
    this.targetGfx = null;
    this.targetAnchorScreenX = null;
    this.nearCrowd = [];
    this.crowdTiers = null;
    this.securityGuards = [];
    this.securityGuardTweens = [];
    this.sponsorBoardObjects = [];
    this.tracksideObjects = [];
    this.tracksideTweens = [];
    this.cornerFlags = [];
    this.ballGhosts = [];
    this.ballOutlineGfx = null;
    this.ballGlossGfx = null;
    this.ballIdlePhase = 0;
    this.previewGfx = null;
    this.previewBall = null;
    this.objectiveStripGfx = null;
    this.objectiveSteps = [];
    this.objectiveBrief = null;
    this.targetArmed = true;
    this.tutorialGfx = null;
    this.tutorialCaption = null;
    this.tutorialDetail = null;
    this.tutorialStep = 0;
    this.tutorialDone = true;
    this.tutorialPhase = 0;
    this.ringVisuals = new Map();
    this.ringOrder = [];
    this.threadGfx = null;
    this.threadFarGfx = null;
    this.threadPoints = [];
    this.threadTimer = null;
    this.threadFlow = 0;
    this.hazardVisuals = [];
    this.snowEmitters = [];
    this.windTxt = null;
    this.pressureMeterGfx = null;
    this.frameContacts = new Set();

    this.mode = data.mode || 'career';
    this.levelIndex = data.levelIndex ?? 0;
    this.dailyDate = data.dailyDate || utcDateKey();
    this.score = data.score || 0;
    this.goals = data.goals || 0;
    this.combo = data.combo || 0;
    this.timeLeft = data.timeLeft ?? ARCADE_TIME;
    // Time Attack is a play clock, not a menu/orientation tax. A fresh run
    // waits at 60 until the first valid shot is actually committed. Sessions
    // restored with elapsed time are already live.
    this.arcadeStarted = this.mode !== 'arcade' || this.timeLeft < ARCADE_TIME;
    this.level = this.mode === 'career'
      ? LEVELS[this.levelIndex]
      : this.mode === 'daily'
        ? dailyScenario(this.dailyDate)
        : randomScenario();
  }

  create() {
    configureHdCamera(this);
    this.settings = SaveManager.getSettings?.() || {};
    this.aimAssist = this.settings.aimAssist ?? 'full';
    const viewportWidth = Number(globalThis.innerWidth) || GAME_W;
    const viewportHeight = Number(globalThis.innerHeight) || GAME_H;
    this.compactHud = viewportWidth > viewportHeight && viewportHeight <= 520;
    Audio.setMuted(Boolean(this.settings.muted || PlatformService.shouldMuteAudio()));
    Audio.setVolume(this.settings.sfxVolume ?? 1);
    MenuMusic.configure({
      muted: Boolean(this.settings.muted || PlatformService.shouldMuteAudio()),
      musicVolume: this.settings.musicVolume
    });
    MenuMusic.leaveMenu();
    if (this.mode === 'daily') SaveManager.ensureDaily(this.dailyDate);
    PlatformService.gameplayStart();
    CAM.x = this.level.offsetX * 0.85;
    this.zGoal = CAM.ballDist + this.level.distance;
    this.zWall = CAM.ballDist + Math.min(WALL_DIST, this.level.distance * 0.55);
    // Depth of the advertising hoardings, derived from where they are actually
    // painted: their foot sits on the stadium/turf seam, so the depth that
    // projects the ground to STADIUM_Y is the depth the boards stand at. Held
    // clear of the net so a scored ball is contained before it can reach them.
    this.zBoards = Math.max(
      (CAM.height * CAM.focal) / (STADIUM_Y - CAM.horizonY),
      this.zGoal + 2.45
    );
    this.goalDimensions = getEffectiveGoalDimensions(this.level, { width: GOAL_W, height: GOAL_H });
    this.goalWidth = this.goalDimensions.width;
    this.goalHeight = this.goalDimensions.height;
    this.hazards = normalizeHazards(this.level.hazards);
    this.hazardMap = new Map(this.hazards.map((hazard) => [hazard.type, hazard]));
    this.wallConfig = normalizeWallConfig(this.level.wallConfig, this.level.wall);
    this.keeperConfig = normalizeKeeperConfig(this.level.keeperConfig, {
      baseSkill: this.level.keeper,
      goalWidth: this.goalWidth
    });

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
    this.hitStopT = 0;
    this.over = false;
    this.ballCaught = false;
    this.keeperContactChecked = new Set();
    this.netTouched = false;
    this.netSideRippled = false;
    this.boardStruck = false;
    this.frameTouched = false;
    this.frameContacts = new Set();
    this.frameImpactT = null;
    this.frameCollisionCooldown = 0;
    this.lastTickSecond = -1;
    this.baseTarget = this.level.target ? { ...this.level.target } : null;
    this.activeTarget = this.baseTarget ? { ...this.baseTarget } : null;

    this.crowdImage = this.add.image(GAME_W / 2, 0, 'crowd').setOrigin(0.5, 0).setDepth(0);
    const atmosphereTint = CUP_TINTS[this.level.cup];
    if (atmosphereTint) this.crowdImage.setTint(atmosphereTint);
    this.crowdGlow = this.add.rectangle(GAME_W / 2, STADIUM_Y / 2, GAME_W, STADIUM_Y, PAL.gold, 0)
      .setDepth(1)
      .setBlendMode('ADD');
    this.currentWind = getWindVectorAt(this.level.wind, this.simTime);
    this.drawPitch();
    this.buildNearCrowd();
    this.buildSecurityGuards();
    this.drawSponsorBoards();
    this.buildTrackside();
    // A quiet floodlight wash keeps the night-match atmosphere without the
    // hard triangles that previously read as stray pitch markings.
    this.add.rectangle(GAME_W / 2, STADIUM_Y + (GAME_H - STADIUM_Y) / 2,
      GAME_W, GAME_H - STADIUM_Y, PAL.flood, 0.018)
      .setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(1950);
    this.drawGoal();
    this.drawTargetZone();
    this.drawRings();
    this.buildHazardVisuals();

    const savedLoadout = SaveManager.getEquippedCosmetics?.() || SaveManager.load?.().equipped || {};
    this.loadout = {
      character: savedLoadout.character || 'character-mica',
      kit: savedLoadout.kit || 'kit-home',
      ball: savedLoadout.ball || 'ball-classic',
      trail: savedLoadout.trail || 'trail-none'
    };
    this.loadoutGameplay = resolveLoadoutGameplay(this.loadout);
    this.ball = new Ball({
      physics: this.loadoutGameplay.ballPhysics,
      windEffect: this.loadoutGameplay.windEffect
    });
    this.ball.reset(this.level.offsetX);
    this.ball.setGoalBounds(this.goalWidth, this.goalHeight);
    this.ball.setWind(this.currentWind);
    const trailCosmetic = getCosmetic(this.loadout.trail);
    this.trailStyle = {
      enabled: trailCosmetic?.particle !== 'none',
      mode: trailCosmetic?.particle ?? 'none',
      start: trailCosmetic?.palette?.start ?? 0xffffff,
      end: trailCosmetic?.palette?.end ?? 0xffffff,
      samples: trailCosmetic?.utility?.samples ?? 10,
      opacity: trailCosmetic?.utility?.opacity ?? 0.14
    };
    this.ballVisualScale = this.loadoutGameplay.visualScale;
    this.ballTexture = this.textures.exists(this.loadout.ball) ? this.loadout.ball : 'ball-classic';
    // The ball is the subject of a free-kick game, so it gets its own keyline
    // and specular pass rather than relying on the sprite alone to carry it.
    this.ballOutlineGfx = this.add.graphics();
    this.ballSpr = this.add.image(0, 0, this.ballTexture);
    this.ballGlossGfx = this.add.graphics();
    this.shadowSpr = this.add.image(0, 0, 'shadow');
    this.ballIdlePhase = 0;
    this.ballRadiusFraction = this.measureBallRadiusFraction(this.ballTexture);
    // Smear ghosts: on fast frames the ball is drawn again along its screen
    // path, filling the gaps between discrete positions. Each single frame
    // looks wrong; at speed they read as one continuous streak.
    this.ballGhosts = [0.66, 0.33].map((fraction) => ({
      fraction,
      spr: this.add.image(0, 0, this.ballTexture).setVisible(false)
    }));
    this.prevBallScreen = null;

    // Aiming is a standing state. The striker waits a step off the ball in an
    // idle stance and only adopts the loaded "ready" pose once the player
    // starts a gesture, so the frame no longer shows a run-up that has not
    // happened yet: AIM -> RUN-UP -> CONTACT -> FOLLOW THROUGH.
    //
    // His spot is a world position, not a screen offset, so his feet sit on the
    // turf at his own depth and his size follows the same projection as the
    // wall and the keeper.
    const stanceZ = this.ball.z + 0.55;
    const stance = project(this.ball.x - 0.55, 0, stanceZ);
    const ballScale = project(this.ball.x, 0, this.ball.z).s;
    this.kicker = new Kicker(this, stance.x, stance.y, {
      kitId: this.loadout.kit,
      characterId: this.loadout.character,
      pose: 'idle',
      scale: 2.37 * (stance.s / ballScale),
      depth: 1260,
      ambient: !this.settings.reducedMotion,
      reducedMotion: this.settings.reducedMotion
    });

    this.buildKeepers();
    this.buildWall();
    if (this.wall) this.keepers.forEach((keeper) => keeper.organiseWall());

    this.ringProgress = createRingProgress(
      this.level.rings,
      this.level.objective?.ringsRequired ?? this.level.rings?.length
    );

    this.trailPts = [];
    this.trailGfx = this.add.graphics();
    // The predicted arc sits under the HUD but over the pitch, and is drawn by
    // the same solver the shot will use - wind and curl included.
    this.previewGfx = this.add.graphics().setDepth(1490);
    this.previewBall = new Ball({
      physics: this.loadoutGameplay.ballPhysics,
      windEffect: this.loadoutGameplay.windEffect
    });
    this.aimGfx = this.add.graphics().setDepth(1500);

    // Turf kicked up at contact. Small, short-lived and green: it belongs to
    // the pitch rather than reading as another UI effect.
    this.turf = this.add.particles(0, 0, 'spark', {
      speed: { min: 24, max: 74 },
      angle: { min: 210, max: 330 },
      gravityY: 320,
      lifespan: 420,
      scale: { start: 0.9, end: 0 },
      tint: [PAL.grassDither, PAL.grass, PAL.grassShadow],
      emitting: false
    }).setDepth(1255);

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

    this.installKeyboardControls();
    this.installVisibilityPause();

    this.loadDeferredKeeperArt();

    Audio.whistle();

    // Debug hook for automated testing (window.__fkl.shootDebug(vx, vy, vz, spin));
    // dev-server only, stripped from production builds.
    if (import.meta.env?.DEV && globalThis.window) globalThis.window.__fkl = this;
    this.events.once('shutdown', this.shutdownSession, this);
  }

  loadDeferredKeeperArt() {
    if (!queueKeeperSheets(this, { initial: false })) return;
    this.load.once('complete', () => {
      if (!this.sessionAlive) return;
      this.keepers?.forEach((keeper) => keeper.refreshTextureAvailability?.());
    });
    this.load.start();
  }

  // ---------------------------------------------------------- session flow

  isSessionActive(token = this.sessionToken) {
    return Boolean(
      this.sessionAlive &&
      !this.transitioning &&
      token === this.sessionToken &&
      this.sys?.isActive?.()
    );
  }

  schedule(delay, callback) {
    if (!this.sessionAlive || this.transitioning) return null;
    const token = this.sessionToken;
    let timer = null;
    timer = this.time.delayedCall(delay, () => {
      this.scheduledCalls.delete(timer);
      if (!this.isSessionActive(token)) return;
      callback();
    });
    this.scheduledCalls.add(timer);
    return timer;
  }

  cancelScheduledCalls() {
    if (this.scheduledCalls?.size) {
      this.time?.removeEvent?.([...this.scheduledCalls]);
      this.scheduledCalls.clear();
    }
  }

  // Portal SDK callbacks are external to Phaser's Clock, so scene shutdown
  // cannot cancel them for us. Resolve the local waiter on timeout/shutdown;
  // late SDK callbacks then become harmless no-ops guarded by sessionToken.
  awaitSessionTask(task, timeoutMs = AD_TIMEOUT_MS) {
    return new Promise((resolve) => {
      let settled = false;
      let timeoutId = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
        this.pendingAsyncCancels?.delete(cancel);
        resolve(value);
      };
      const cancel = () => finish(false);
      this.pendingAsyncCancels.add(cancel);
      timeoutId = globalThis.setTimeout(cancel, timeoutMs);
      Promise.resolve(task).then(finish, cancel);
    });
  }

  installKeyboardControls() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    keyboard.addCapture('TAB');
    this.onTabKey = (event) => {
      event?.preventDefault?.();
      if (event) event.cancelled = 1;
      if (event?.repeat || this.adRequestActive || this.transitioning) return;
      this.togglePauseMenu();
    };
    keyboard.on('keydown-TAB', this.onTabKey);
  }

  installVisibilityPause() {
    const documentRef = globalThis.document;
    if (!documentRef?.addEventListener) return false;
    this.onDocumentVisibility = () => {
      if (!documentRef.hidden || this.state === 'PAUSED') return;
      if (PAUSABLE_STATES.has(this.state) && !this.transitioning && !this.terminalOverlayShown) {
        this.openPauseMenu();
      }
    };
    documentRef.addEventListener('visibilitychange', this.onDocumentVisibility);
    return true;
  }

  currentRestartData() {
    if (this.mode === 'career') return { mode: 'career', levelIndex: this.levelIndex };
    if (this.mode === 'daily') return { mode: 'daily', dailyDate: this.dailyDate };
    return { mode: 'arcade' };
  }

  restartCurrentLevel(data = this.currentRestartData()) {
    return this.beginSceneTransition('restart', null, data);
  }

  startScene(key, data = undefined) {
    return this.beginSceneTransition('start', key, data);
  }

  beginSceneTransition(operation, key, data) {
    if (!this.sessionAlive || this.transitioning) return false;
    this.transitioning = true;
    this.sessionAlive = false;
    this.state = 'TRANSITIONING';
    this.swipe.enabled = false;
    this.swipe.cancel();
    this.destroyPauseOverlay();
    // Clock/Tween paused flags persist on Phaser's reusable Scene plugins.
    // Always restore them before shutdown so the next start cannot inherit a
    // frozen clock, then remove every callback owned by the retiring scene.
    this.time.paused = false;
    this.tweens.resumeAll();
    this.kicker?.cancelSequence?.();
    this.cancelScheduledCalls();
    this.time.removeAllEvents();
    this.time.clearPendingEvents();
    this.tweens.killAll();
    PlatformService.gameplayStop();

    if (operation === 'restart') this.scene.restart(data);
    else this.scene.start(key, data);
    return true;
  }

  togglePauseMenu() {
    if (this.state === 'PAUSED') {
      this.closePauseMenu();
      return;
    }
    if (!PAUSABLE_STATES.has(this.state) || this.transitioning || this.terminalOverlayShown) return;
    this.openPauseMenu();
  }

  openPauseMenu() {
    if (!PAUSABLE_STATES.has(this.state) || this.pauseOverlayObjects.length) return;
    this.pauseReturnState = this.state;
    this.state = 'PAUSED';
    this.swipe.cancel();
    this.swipe.enabled = false;
    this.aimGfx?.clear();
    this.meterUi?.forEach((label) => label.setVisible(false));
    this.time.paused = true;
    this.tweens.pauseAll();
    this.kicker?.pauseAction?.();
    PlatformService.gameplayStop();

    const objects = this.pauseOverlayObjects;
    objects.push(
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.72)
        .setDepth(3499).setInteractive()
    );
    const panel = this.add.graphics().setDepth(3500);
    drawPanel(panel, 90, 55, 300, 160, {
      fill: PAL.panel, border: PAL.goldDark, corner: PAL.gold
    });
    objects.push(panel);
    objects.push(titleText(this, GAME_W / 2, 80, 'MATCH PAUSED', '15px', '#f3c449').setDepth(3501));
    objects.push(bodyText(this, GAME_W / 2, 111, 'Take a breath. Your shot is frozen exactly where you left it.', {
      originX: 0.5, originY: 0.5, align: 'center', fontSize: '7px', color: '#cfe8ff',
      wordWrap: { width: 250, useAdvancedWrap: true }
    }).setDepth(3501));

    const assistLabel = () => `AIM ASSIST · ${String(this.aimAssist).toUpperCase()}`;
    const assistText = bodyText(this, GAME_W / 2, 131, assistLabel(), {
      originX: 0.5, originY: 0.5, fontFamily: FONT, fontSize: '7px', color: '#f3c449'
    }).setDepth(3501);
    objects.push(assistText);

    const actions = [
      { label: 'RESUME', color: PAL.blue, hover: PAL.blueHi, cb: () => this.closePauseMenu() },
      {
        label: 'SETTINGS',
        color: PAL.panelHi,
        hover: PAL.border,
        cb: () => {
          SettingsPanel.open({
            onChange: (nextSettings) => {
              this.applyLiveSettings(nextSettings);
              if (assistText.active) assistText.setText(assistLabel());
            }
          });
        }
      },
      { label: 'RESTART', color: PAL.goldDark, hover: PAL.gold, cb: () => this.restartCurrentLevel() },
      { label: 'EXIT MATCH', color: PAL.panelHi, hover: PAL.border, cb: () => this.startScene('Menu') }
    ];
    // Four buttons across the 300px panel: 68 wide on a 72px pitch, centred.
    const first = GAME_W / 2 - ((actions.length - 1) * 72) / 2;
    actions.forEach((action, index) => {
      objects.push(makeButton(this, first + index * 72, 162, 68, 27, action.label, action.cb, {
        color: action.color, hover: action.hover, border: index === 0 ? PAL.goldDark : PAL.borderDark,
        fontSize: action.label.length > 7 ? '6px' : '7px', hitHeight: 32
      }).setDepth(3501));
    });
    objects.push(bodyText(this, GAME_W / 2, 198, 'TAB TO RESUME  ·  CHOOSE RESTART OR EXIT MATCH', {
      originX: 0.5, originY: 0.5, align: 'center', fontSize: '6px', color: '#8fa2ab'
    }).setDepth(3501));
    this.announceStatus('Match paused. Settings, resume, restart, and exit controls are available.');
  }

  applyLiveSettings(nextSettings = {}) {
    this.settings = { ...this.settings, ...nextSettings };
    this.aimAssist = AIM_ASSIST_MODES.includes(this.settings.aimAssist)
      ? this.settings.aimAssist
      : 'full';
    if (this.kicker) {
      this.kicker.reducedMotion = Boolean(this.settings.reducedMotion);
      if (this.kicker.reducedMotion) this.kicker.pauseAmbient?.();
      else this.kicker.resumeAmbient?.();
    }
    for (const keeper of this.keepers || []) keeper.reducedMotion = Boolean(this.settings.reducedMotion);
    return this.settings;
  }

  closePauseMenu() {
    if (this.state !== 'PAUSED' || this.transitioning) return false;
    const returnState = this.pauseReturnState || 'AIMING';
    this.destroyPauseOverlay();
    this.time.paused = false;
    this.tweens.resumeAll();
    this.kicker?.resumeAction?.();
    this.state = returnState;
    this.pauseReturnState = null;
    this.swipe.enabled = returnState === 'AIMING';
    if (!globalThis.document?.hidden && (returnState === 'AIMING' || returnState === 'WINDUP' || returnState === 'FLIGHT')) {
      PlatformService.gameplayStart();
    }
    this.announceStatus('Match resumed.');
    return true;
  }

  destroyPauseOverlay() {
    this.pauseOverlayObjects?.forEach((object) => {
      if (object?.active) object.destroy();
    });
    this.pauseOverlayObjects = [];
  }

  shutdownSession() {
    if (this.sessionShutdown) return;
    this.sessionShutdown = true;
    this.sessionAlive = false;
    this.pendingAsyncCancels?.forEach((cancel) => cancel());
    this.pendingAsyncCancels?.clear();
    this.activeAdCleanup?.();
    this.activeAdCleanup = null;
    this.cancelScheduledCalls();
    this.time.paused = false;
    this.tweens.resumeAll();
    this.destroyPauseOverlay();

    const keyboard = this.input.keyboard;
    keyboard?.off?.('keydown-TAB', this.onTabKey);
    keyboard?.removeCapture?.('TAB');
    globalThis.document?.removeEventListener?.('visibilitychange', this.onDocumentVisibility);
    this.onDocumentVisibility = null;
    if (import.meta.env.DEV && globalThis.window?.__fkl === this) globalThis.window.__fkl = null;
    PlatformService.gameplayStop();

    // Destroy game objects and rigs safely
    this.keepers?.forEach((keeper) => keeper?.destroy?.());
    this.keepers = [];
    this.keeper = null;
    this.walls?.forEach((wall) => wall?.destroy?.());
    this.walls = [];
    this.wall = null;
    this.kicker?.destroy?.();
    this.kicker = null;
    this.snowEmitters?.forEach((emitter) => emitter?.destroy?.());
    this.snowEmitters = [];
    this.hazardVisuals?.forEach((v) => { if (v?.destroy) v.destroy(); });
    this.hazardVisuals = [];
    this.ringVisuals?.forEach((v) => this.destroyRingVisual(v));
    this.ringVisuals?.clear();
    this.threadTimer?.remove?.();
    this.threadTimer = null;
    this.threadGfx?.destroy?.();
    this.threadGfx = null;
    this.threadFarGfx?.destroy?.();
    this.threadFarGfx = null;
    this.threadPoints = [];
    this.targetGfx?.destroy?.();
    this.targetGfx = null;
    this.pitchGfx?.destroy?.();
    this.pitchGfx = null;
    this.trailGfx?.destroy?.();
    this.trailGfx = null;
    this.pressureMeterGfx?.destroy?.();
    this.pressureMeterGfx = null;
    this.crowdTiers?.destroy?.();
    this.crowdTiers = null;
    this.tracksideTweens?.forEach((timer) => timer?.remove?.(false));
    this.tracksideTweens = [];

    // Drop references to objects the DisplayList destroyed during shutdown.
    this.nearCrowd = [];
    this.securityGuards = [];
    this.securityGuardTweens = [];
    this.sponsorBoardObjects = [];
    this.tracksideObjects = [];
    this.cornerFlags = [];
    this.ballGhosts = [];
    this.objectiveUi = null;
    this.objectiveStripGfx = null;
    this.objectiveSteps = [];
    this.objectiveBrief = null;
    this.tutorialGfx = null;
    this.tutorialCaption = null;
    this.tutorialDetail = null;
    this.attemptIcons = null;
    this.terminalOverlayObjects?.forEach((obj) => { if (obj?.active) obj.destroy(); });
    this.terminalOverlayObjects = [];
    this.terminalOverlayShown = false;
  }

  // ---------------------------------------------------------------- visuals

  buildNearCrowd() {
    if (this.crowdImage) {
      this.crowdImage.setTexture('crowd')
        .setOrigin(0, 0)
        .setPosition(0, 0)
        .setDisplaySize(GAME_W, STADIUM_Y)
        .setDepth(0)
        .setVisible(true);
      const atmosphereTint = CUP_TINTS[this.level.cup];
      // The empty stand behind the supporters is dimmed hard. Everything in
      // front of it - players, ball, hoops, goal - then owns the contrast.
      this.crowdImage.setTint(atmosphereTint ? mixColor(atmosphereTint, 0x4a5a6b, 0.72) : 0x64748a);
    }

    // Two aspect-locked tiers: far/small/dark behind, near/large in front.
    this.crowdTiers?.destroy?.();
    this.crowdTiers = addCrowdTiers(this, {
      viewWidth: GAME_W,
      reducedMotion: Boolean(this.settings.reducedMotion)
    });
    this.nearCrowd = this.crowdTiers.tiles;
    this.buildStandEntrances();
  }

  // Dark vomitory gaps punched through the stand. Drawn over the far tier and
  // under the near tier so they read as openings rather than stickers.
  buildStandEntrances() {
    const gfx = this.add.graphics().setDepth(1.27);

    for (const x of STAND_ENTRANCES) {
      gfx.fillStyle(PAL.ink, 0.92).fillRect(x, 26, 9, 26);
      gfx.fillStyle(PAL.night, 0.9).fillRect(x + 1, 27, 7, 24);
      // Stair treads catching the floodlights.
      for (let step = 0; step < 5; step++) {
        gfx.fillStyle(PAL.border, 0.16 + step * 0.05);
        gfx.fillRect(x + 2, 30 + step * 4, 5, 1);
      }
      gfx.fillStyle(PAL.borderDark, 0.8).fillRect(x, 26, 9, 1);
    }
  }

  buildSecurityGuards() {
    this.securityGuards = [];
    this.securityGuardTweens = [];
    if (!this.textures.exists('security-guards-hd')) return;

    // Keep the stewards irregularly spaced, as they would be around a real
    // stand. Their lower bodies sit behind the LED boards at the next depth.
    SECURITY_GUARD_LAYOUT.forEach((x, index) => {
      const frame = (index + this.levelIndex) % 6;
      const guard = this.add.image(x, 99, 'security-guards-hd', frame)
        .setOrigin(0.5, 1)
        .setDisplaySize(14, 32)
        .setDepth(1.4);
      this.securityGuards.push(guard);

      if (!this.settings.reducedMotion) this.animateSecurityGuard(guard, index);
    });
  }

  animateSecurityGuard(guard, index) {
    const motion = SECURITY_GUARD_MOTION[index % SECURITY_GUARD_MOTION.length];
    const baseScaleY = guard.scaleY;
    const canScan = index % 3 !== 1;
    const tween = this.tweens.add({
      targets: guard,
      x: guard.x + motion.dx,
      y: guard.y + motion.dy,
      angle: motion.angle,
      scaleY: baseScaleY * 0.988,
      duration: motion.duration,
      delay: 180 + index * 210,
      hold: motion.hold,
      repeatDelay: motion.repeatDelay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onRepeat: () => {
        // A mirrored pose reads as a quick look along the touchline. Only a
        // subset scan so the entire steward line never moves in unison.
        if (canScan && guard.active) guard.setFlipX(!guard.flipX);
      }
    });
    this.securityGuardTweens.push(tween);
  }

  drawSponsorBoards() {
    const y = BOARD_TOP_Y;
    const h = STADIUM_Y - y;
    const board = this.add.graphics().setDepth(1.45);
    const labels = [];

    board.fillStyle(PAL.ink, 1).fillRect(0, y - 2, GAME_W, h + 3);
    // Start part-way into the first board so the run never begins on a seam,
    // which is what made the old rhythm look machine-generated.
    let x = -34;
    let index = 0;
    while (x < GAME_W) {
      const spec = SPONSOR_BOARDS[index % SPONSOR_BOARDS.length];
      const w = spec.width;
      board.fillStyle(spec.fill, 1).fillRect(x + 1, y, w - 2, h);
      board.fillStyle(spec.shade, 1).fillRect(x + 1, y + h - 4, w - 2, 3);
      board.fillStyle(spec.trim, 0.82).fillRect(x + 2, y + 1, w - 4, 1);
      board.fillStyle(spec.trim, 0.5).fillRect(x + 3, y + h - 6, w - 6, 1);
      board.fillStyle(PAL.ink, 1).fillRect(x + w - 1, y - 1, 2, h + 1);

      // The mark is only drawn when it fits entirely on screen. A half-cut
      // logo at the frame edge reads as a bug; a plain coloured board that
      // runs off the edge reads as a stadium.
      const centreX = x + w / 2;
      if (centreX - 33 >= 1 && centreX + 33 <= GAME_W - 1 &&
          this.textures.exists('calynx-logo-pixel')) {
        labels.push(this.add.image(centreX, y + h / 2, 'calynx-logo-pixel')
          .setDisplaySize(66, 20)
          .setTint(spec.logo)
          .setDepth(1.5));
      }

      x += w;
      index++;
    }
    this.sponsorBoardObjects = [board, ...labels];
  }

  buildTrackside() {
    this.tracksideObjects = [];
    this.tracksideTweens = [];

    for (const spec of TRACKSIDE_LAYOUT) {
      if (!this.textures.exists(spec.texture)) continue;
      const sprite = this.add.image(spec.x, spec.y, spec.texture)
        .setOrigin(0.5, 1)
        .setDisplaySize(spec.w, spec.h)
        .setDepth(1.42)
        .setFlipX(Boolean(spec.flip))
        // Muted on purpose: the pit crew is depth, not a focal point.
        .setTint(0xb4c1cb);
      this.tracksideObjects.push(sprite);

      if (!spec.flash || this.settings.reducedMotion) continue;
      // A photographer who never fires is set dressing; one who does is a
      // stadium. The flash is two frames of a bright quad, not a tween ramp.
      const flash = this.add.rectangle(spec.x + (spec.flip ? -8 : 8), spec.y - 15, 5, 4, 0xffffff, 0)
        .setDepth(1.52);
      this.tracksideObjects.push(flash);
      const timer = this.time.addEvent({
        delay: spec.flash,
        loop: true,
        callback: () => {
          if (!flash.active) return;
          flash.setAlpha(0.9);
          this.tweens.add({
            targets: flash, alpha: 0, duration: 130, ease: 'Quad.easeOut'
          });
        }
      });
      this.tracksideTweens.push(timer);
    }

    this.buildCornerFlags();
  }

  // Corner flags belong to the pitch, so they are projected like everything
  // else and lean with the level's wind instead of standing to attention.
  buildCornerFlags() {
    this.cornerFlags = [];
    if (!this.textures.exists('corner-flag')) return;
    const windX = this.currentWind?.x ?? this.level.wind?.x ?? 0;

    for (const side of [-1, 1]) {
      // Anchored to the same goal-line extent the pitch markings use. The
      // camera pans with the free-kick spot, so on offset levels one corner is
      // legitimately out of frame - skip it rather than clamp it into view.
      const base = project(side * PITCH_MARKING_DIMENSIONS.fieldHalfWidth, 0, this.zGoal);
      if (base.x < -8 || base.x > GAME_W + 8) continue;
      const height = Math.max(10, base.s * 1.55);
      const flag = this.add.image(base.x, base.y, 'corner-flag')
        // The pole is at x=2 in the 12px texture. Anchoring its centre, rather
        // than the texture centre, keeps the pole planted when the flag flips.
        .setOrigin(2 / 12, 1)
        .setDisplaySize(height * 0.5, height)
        .setDepth(1000 - this.zGoal * 10 - 4)
        .setFlipX(windX < 0)
        .setTint(0xdfe9ef);
      this.cornerFlags.push(flag);

      if (this.settings.reducedMotion) continue;
      this.tweens.add({
        targets: flag,
        scaleX: flag.scaleX * (0.82 + Math.min(Math.abs(windX), 1) * 0.1),
        duration: 520 + side * 90,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  playCrowdGoal() {
    this.crowdTiers?.playGoal((delay, callback) => this.schedule(delay, callback));
  }

  // A short punch on whichever score/progress readout this mode owns, so the
  // reward lands somewhere the eye is already looking.
  popScoreReadout() {
    if (this.settings.reducedMotion) return;
    const targets = [this.scoreTxt, this.objectiveProgressTxt].filter((text) => text?.active);
    if (!targets.length) return;
    this.tweens.killTweensOf(targets);
    targets.forEach((text) => text.setScale(1));
    this.tweens.add({
      targets,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 130,
      yoyo: true,
      ease: 'Back.easeOut'
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
    if (this.textures.exists('pitch-grass-pixel-v3')) {
      this.pitchImage = this.add.image(0, STADIUM_Y, 'pitch-grass-pixel-v3')
        .setOrigin(0, 0)
        .setDisplaySize(GAME_W, GAME_H - STADIUM_Y)
        .setTint(0xd6ffdc)
        .setDepth(1);
    } else {
      this.add.rectangle(GAME_W / 2, STADIUM_Y + (GAME_H - STADIUM_Y) / 2,
        GAME_W, GAME_H - STADIUM_Y, PAL.grass)
        .setDepth(1);
    }

    if (this.pitchGfx) {
      this.pitchGfx.destroy();
      this.pitchGfx = null;
    }
    const m = this.add.graphics().setDepth(1);
    this.pitchGfx = m;
    m.lineStyle(1, PAL.line, 0.86);

    const snap = (value) => Math.round(value * 4) / 4;

    const line = (x1, z1, x2, z2) => {
      const minZ = 5.8;
      if (z1 < minZ && z2 < minZ) return;
      let cz1 = z1, cx1 = x1, cz2 = z2, cx2 = x2;
      if (cz1 < minZ) {
        const t = (minZ - z1) / (z2 - z1);
        cz1 = minZ; cx1 = x1 + t * (x2 - x1);
      }
      if (cz2 < minZ) {
        const t = (minZ - z2) / (z1 - z2);
        cz2 = minZ; cx2 = x2 + t * (x1 - x2);
      }
      const a = project(cx1, 0, cz1);
      const b = project(cx2, 0, cz2);
      m.lineBetween(snap(a.x), snap(a.y), snap(b.x), snap(b.y));
    };

    const layout = buildPitchMarkingLayout(this.zGoal);
    layout.straight.forEach(({ from, to }) => line(from.x, from.z, to.x, to.z));

    // The spot and D use the same world-space depth as the box layout.
    const spotZ = layout.penaltySpot.z;
    if (spotZ >= 5.8) {
      const spot = project(0, 0, spotZ);
      m.fillStyle(PAL.line, 0.85);
      const spotSize = Math.max(1, Math.round(spot.s * 0.18));
      m.fillRect(Math.round(spot.x - spotSize / 2), Math.round(spot.y - spotSize / 2),
        spotSize, spotSize);
    }

    // Penalty D-Arc (centered at penalty spot, in front of boxZ)
    m.lineStyle(1, PAL.line, 0.72);
    const arcPoints = [];
    for (let a = -0.8; a <= 0.8; a += 0.1) {
      const px = Math.sin(a) * PITCH_MARKING_DIMENSIONS.penaltyArcRadius;
      const pz = spotZ - Math.cos(a) * PITCH_MARKING_DIMENSIONS.penaltyArcRadius;
      if (pz >= 5.8 && pz < layout.penaltyFrontZ) {
        arcPoints.push(project(px, 0, pz));
      }
    }
    for (let i = 0; i < arcPoints.length - 1; i++) {
      m.lineBetween(
        snap(arcPoints[i].x), snap(arcPoints[i].y),
        snap(arcPoints[i + 1].x), snap(arcPoints[i + 1].y)
      );
    }
  }

  drawGoal() {
    const z = this.zGoal;
    const zb = z + 2.2;
    const HW = this.goalWidth / 2;
    const height = this.goalHeight;

    // Spring membrane renders behind the keeper and deforms at the exact goal
    // crossing point instead of behaving like a painted background.
    this.netBack = this.add.graphics().setDepth(2);
    this.netPhysics = new GoalNetPhysics({
      goalWidth: this.goalWidth,
      goalHeight: height,
      goalZ: z,
      depth: zb - z
    });
    this.netPhysics.draw(this.netBack, project, { alpha: 0.28 });

    // goal frame (renders in front of the ball once it is inside the net)
    const frame = this.add.graphics().setDepth(1000 - z * 10 + 2);
    const s = project(0, 0, z).s;
    const lw = Math.max(Math.round(POST_R * 2 * s), 2);
    const bl = project(-HW, 0, z);
    const tl = project(-HW, height, z);
    const tr = project(HW, height, z);
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
    const tlb = project(-HW, height * 0.92, zb);
    const trb = project(HW, height * 0.92, zb);
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
      const t = project(x, height * 0.92, zb);
      const b = project(x, 0, zb);
      this.netFront.lineBetween(t.x, t.y, b.x, b.y);
    }
    for (let y = 0; y <= height * 0.92 + 0.01; y += 0.45) {
      const l = project(-HW, y, zb);
      const r = project(HW, y, zb);
      this.netFront.lineBetween(l.x, l.y, r.x, r.y);
    }
  }

  drawTargetZone() {
    const target = this.activeTarget;
    if (!target || typeof target !== 'object') return;
    const geometry = targetGeometry(target, this.goalWidth, this.goalHeight);
    const worldX = geometry.x;
    const worldY = geometry.y;
    const centre = project(worldX, worldY, this.zGoal + 0.08);
    const edgeX = project(worldX + geometry.rx, worldY, this.zGoal + 0.08);
    const edgeY = project(worldX, worldY + geometry.ry, this.zGoal + 0.08);
    const radiusX = Math.max(Math.abs(edgeX.x - centre.x), 4);
    const radiusY = Math.max(Math.abs(edgeY.y - centre.y), 4);
    // The target is a gameplay reticle, so it stays readable over the wall and
    // keeper while its geometry remains anchored to the goal plane.
    const g = this.add.graphics().setDepth(1200);
    this.targetGfx = g;
    this.targetAnchorScreenX = centre.x;
    g.fillStyle(0xf3c449, 0.2);
    g.fillEllipse(centre.x, centre.y, radiusX * 2, radiusY * 2);
    g.lineStyle(2, 0xf3c449, 0.9);
    g.strokeEllipse(centre.x, centre.y, radiusX * 2, radiusY * 2);
    g.lineStyle(1, 0xf3e7c3, 0.72);
    g.lineBetween(centre.x - radiusX * 0.62, centre.y, centre.x + radiusX * 0.62, centre.y);
    g.lineBetween(centre.x, centre.y - radiusY * 0.62, centre.x, centre.y + radiusY * 0.62);

    // The corner is the last step of the sequence, so it stays quiet until the
    // hoops before it have been dealt with. Levels without hoops arm at once.
    this.targetArmed = !(this.level.rings?.length);
    this.setTargetArmed(this.targetArmed, { instant: true });
  }

  setTargetArmed(armed, { instant = false } = {}) {
    const g = this.targetGfx;
    if (!g?.active) return;
    this.targetArmed = Boolean(armed);
    this.tweens.killTweensOf(g);
    const restingAlpha = armed ? 0.92 : 0.34;
    g.setAlpha(instant ? restingAlpha : g.alpha);
    if (this.settings.reducedMotion) {
      g.setAlpha(restingAlpha);
      return;
    }
    if (!armed) {
      this.tweens.add({ targets: g, alpha: restingAlpha, duration: instant ? 0 : 200 });
      return;
    }
    // Armed: a firm pulse that reads as "this is the shot now".
    this.tweens.add({
      targets: g,
      alpha: 0.5,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  // ----------------------------------------------------------------- thread

  /**
   * The route the ball has to take, as one object.
   *
   * Two gold circles floating in front of the goal told the player where the
   * gates were but nothing about how to connect them, on a level whose whole
   * premise is a single threaded line. This builds that line: a smooth 3D curve
   * from the ball, through every gate centre in flight order, into the finish.
   * The gates become eyes on the thread rather than two unrelated rings.
   */
  buildThreadPath() {
    this.threadPoints = [];
    if (!this.ringOrder?.length) return;

    const knots = [{ x: this.level.offsetX, y: BALL_R, z: CAM.ballDist }];
    for (const id of this.ringOrder) {
      const geometry = this.ringVisuals.get(id)?.geometry;
      if (geometry) knots.push({ x: geometry.x, y: geometry.y, z: geometry.z });
    }
    const finish = this.baseTarget
      ? targetGeometry(this.baseTarget, this.goalWidth, this.goalHeight)
      : { x: 0, y: this.goalHeight * 0.5 };
    knots.push({ x: finish.x, y: finish.y, z: this.zGoal });
    if (knots.length < 3) return;

    // Catmull-Rom through the knots, with the ends duplicated so the curve
    // starts at the ball and finishes on the goal line instead of overshooting.
    const padded = [knots[0], ...knots, knots[knots.length - 1]];
    const axis = (a, b, c, d, t, key) => {
      const t2 = t * t;
      const t3 = t2 * t;
      return 0.5 * (
        2 * b[key] +
        (-a[key] + c[key]) * t +
        (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * t2 +
        (-a[key] + 3 * b[key] - 3 * c[key] + d[key]) * t3
      );
    };

    const spans = padded.length - 3;
    for (let i = 0; i <= THREAD_SAMPLES; i++) {
      const u = (i / THREAD_SAMPLES) * spans;
      const span = Math.min(Math.floor(u), spans - 1);
      const t = u - span;
      const [a, b, c, d] = padded.slice(span, span + 4);
      const point = {
        x: axis(a, b, c, d, t, 'x'),
        y: axis(a, b, c, d, t, 'y'),
        z: axis(a, b, c, d, t, 'z')
      };
      if (point.z <= 0.6) continue;
      const screen = project(point.x, point.y, point.z);
      this.threadPoints.push({ x: screen.x, y: screen.y, s: screen.s, z: point.z });
    }
  }

  /**
   * Redraw the thread for the current progress. Everything up to the gate the
   * player still has to find is bright; beyond it the thread is a whisper, so
   * the eye is pulled to the next thing to do rather than the whole route.
   */
  refreshThread() {
    const near = this.threadGfx;
    const far = this.threadFarGfx;
    if (!near?.active || !far?.active) return;
    near.clear();
    far.clear();
    if (!this.threadPoints?.length) return;

    const crossed = new Set(this.ringProgress?.crossedIds || []);
    const nextId = this.ringOrder?.find((id) => !crossed.has(id));
    const nextZ = nextId
      ? this.ringVisuals.get(nextId)?.geometry?.z ?? this.zGoal
      : this.zGoal;
    const flow = this.settings.reducedMotion ? 0 : this.threadFlow;

    for (let i = 0; i < this.threadPoints.length; i++) {
      const point = this.threadPoints[i];
      // A short dark gap every few beads reads as a twisted thread and gives
      // the flow animation something to travel along.
      if ((i + flow) % 9 < 2) continue;
      const gfx = point.z < this.zWall ? near : far;
      const ahead = point.z > nextZ + 0.05;
      // Beads are sized by depth so the thread tapers away from the ball like
      // any other object in the scene rather than reading as a flat UI stroke.
      // Kept deliberately faint: this is a route the player reads past, and at
      // full strength it buried the wall, the keeper and the ball behind it.
      const size = Math.max(1, Math.round(point.s * 0.038));
      const alpha = ahead ? THREAD_ALPHA_AHEAD : THREAD_ALPHA_LIVE;
      gfx.fillStyle(0x071018, alpha * 0.5);
      gfx.fillRect(Math.round(point.x - size / 2) - 1, Math.round(point.y - size / 2) - 1, size + 2, size + 2);
      gfx.fillStyle(ahead ? 0xb98f38 : PAL.gold, alpha);
      gfx.fillRect(Math.round(point.x - size / 2), Math.round(point.y - size / 2), size, size);
    }
  }

  // ------------------------------------------------------------------ hoops

  /**
   * Screen-space samples around a hoop's rim.
   *
   * The hoop is a physical gate leaning away from the camera, so every rim
   * point is projected individually: the near (lower) edge comes out larger
   * than the far (upper) edge, which is what stops it reading as a flat UI
   * sticker pasted over the goal.
   */
  hoopRimSamples(geometry) {
    const samples = [];
    const lean = Math.sin(HOOP_TILT);
    const rise = Math.cos(HOOP_TILT);
    for (let i = 0; i < HOOP_SEGMENTS; i++) {
      const phi = (i / HOOP_SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const point = project(
        geometry.x + cos * geometry.radius,
        geometry.y + sin * geometry.radius * rise,
        Math.max(geometry.z + sin * geometry.radius * lean, 0.6)
      );
      samples.push({
        x: point.x,
        y: point.y,
        s: point.s,
        // sin > 0 is the top (far) half of the rim, which the ball flies behind.
        far: sin > 0,
        // Light comes from the upper left, as it does on every other sprite.
        lit: cos < 0.15 && sin > -0.55
      });
    }
    return samples;
  }

  /**
   * Chunky-pixel rim pass. Squares on integer pixels, drawn dark-first, keep
   * the hoops in the same rendering language as the players instead of the
   * smooth vector ellipse they used to be.
   */
  strokeHoopArc(gfx, samples, wantFar, colors, alpha) {
    const block = (x, y, size, color, a) => {
      const half = size / 2;
      gfx.fillStyle(color, a);
      gfx.fillRect(Math.round(x - half), Math.round(y - half), size, size);
    };

    for (const sample of samples) {
      if (sample.far !== wantFar) continue;
      const thickness = Math.max(2, Math.round(HOOP_TUBE * 2 * sample.s));
      // Outline first and one pixel proud on every side.
      block(sample.x, sample.y, thickness + 2, 0x071018, 0.92 * alpha);
    }
    for (const sample of samples) {
      if (sample.far !== wantFar) continue;
      const thickness = Math.max(2, Math.round(HOOP_TUBE * 2 * sample.s));
      block(sample.x, sample.y, thickness, sample.lit ? colors.hi : colors.band, alpha);
    }
    // Specular pixels along the lit arc only.
    for (const sample of samples) {
      if (sample.far !== wantFar || !sample.lit) continue;
      block(sample.x - 0.5, sample.y - 0.5, 1, 0xfffbe8, 0.75 * alpha);
    }
  }

  /** Full render of one hoop in a given stage. */
  paintHoop(visual, stageName) {
    const stage = HOOP_STAGES[stageName] || HOOP_STAGES.pending;
    const { geometry, samples, back, front, post, label, badge } = visual;
    const alpha = stage.alpha;

    back.clear();
    front.clear();
    post.clear();

    // No ground shadow and no post: the thread running through the eye is what
    // ties it to the scene now. A shadow cast by a gate standing on nothing
    // just reads as a stain on the pitch several metres away from it.

    // Cast shadow. Offset down and to the right of the rim only - filling the
    // opening would turn the gate into a lens and hide the keeper behind it.
    const centre = project(geometry.x, geometry.y, geometry.z);
    const spread = geometry.radius * centre.s;
    // Below about 10 logical pixels of radius the offset copy stops reading as
    // a shadow and starts reading as a second rim, so distant gates go without.
    if (spread > 10) {
      const shadowOffset = Math.max(1, spread * 0.12);
      for (const sample of samples) {
        const thickness = Math.max(2, Math.round(HOOP_TUBE * 2 * sample.s));
        back.fillStyle(0x04070c, 0.24 * alpha);
        back.fillRect(
          Math.round(sample.x + shadowOffset - thickness / 2),
          Math.round(sample.y + shadowOffset - thickness / 2),
          thickness + 1,
          thickness + 1
        );
      }
    }

    this.strokeHoopArc(back, samples, true, stage, alpha);
    this.strokeHoopArc(front, samples, false, stage, alpha);

    label.setColor(stage.glyphColor).setAlpha(alpha);
    badge?.setColor(stage.glyphColor).setText(stage.glyph || '').setAlpha(stage.glyph ? alpha : 0);
    visual.stage = stageName;
  }

  drawRings() {
    this.ringVisuals = new Map();
    this.ringOrder = [];
    const rings = this.level.rings || [];
    // Author order is not guaranteed to be flight order; the player reads them
    // near-to-far, so the numbering has to follow depth.
    const ordered = rings
      .map((ring, index) => ({ ring, index }))
      .sort((a, b) => (a.ring?.z ?? 0) - (b.ring?.z ?? 0));

    ordered.forEach(({ ring }, order) => {
      const geometry = getRingWorldGeometry(ring, {
        startZ: CAM.ballDist,
        goalZ: this.zGoal,
        goalWidth: this.goalWidth,
        goalHeight: this.goalHeight
      });
      const samples = this.hoopRimSamples(geometry);
      const centre = project(geometry.x, geometry.y, geometry.z);
      const spread = geometry.radius * centre.s;

      // Three layers at three depths: the far rim behind the ball, the post and
      // shadow on the turf, the near rim in front. The ball then genuinely
      // passes through the gate rather than over a decal.
      const back = this.add.graphics().setDepth(1000 - (geometry.z + geometry.radius) * 10 - 1);
      const post = this.add.graphics().setDepth(1000 - (geometry.z + geometry.radius) * 10 - 2);
      const front = this.add.graphics().setDepth(1000 - (geometry.z - geometry.radius) * 10 + 1);

      // The number plate is mounted on the post, not floating in the opening,
      // so it never competes with the ball passing through.
      const plateY = centre.y + spread * Math.cos(HOOP_TILT) + 5;
      const plate = this.add.graphics().setDepth(front.depth + 1);
      const plateW = 11;
      const plateH = 9;
      plate.fillStyle(0x071018, 0.92)
        .fillRect(Math.round(centre.x - plateW / 2), Math.round(plateY - plateH / 2), plateW, plateH);
      plate.fillStyle(0x18293a, 0.95)
        .fillRect(Math.round(centre.x - plateW / 2) + 1, Math.round(plateY - plateH / 2) + 1, plateW - 2, plateH - 2);

      const label = bodyText(this, centre.x - 2, plateY, String(order + 1), {
        originX: 0.5, originY: 0.5, fontFamily: FONT, fontSize: '6px', color: '#f3e7c3',
        stroke: '#071018', strokeThickness: 2
      }).setDepth(front.depth + 2);
      const badge = bodyText(this, centre.x + 3.5, plateY, '', {
        originX: 0.5, originY: 0.5, fontFamily: FONT, fontSize: '5px', color: '#9ef0b8',
        stroke: '#071018', strokeThickness: 2
      }).setDepth(front.depth + 2);

      const visual = {
        order,
        geometry,
        samples,
        back,
        front,
        post,
        plate,
        label,
        badge,
        centre,
        stage: 'pending',
        pulse: null
      };
      this.paintHoop(visual, 'pending');
      const id = geometry.id || `ring-${order + 1}`;
      this.ringVisuals.set(id, visual);
      this.ringOrder.push(id);
    });

    // Two layers, split at the wall. One flat graphics object would put the
    // stretch of thread nearest the ball behind the defenders it passes in
    // front of; the split keeps the route correctly occluded along its length.
    this.threadGfx?.destroy?.();
    this.threadFarGfx?.destroy?.();
    this.threadGfx = this.ringOrder.length
      ? this.add.graphics().setDepth(1000 - CAM.ballDist * 10 - 4)
      : null;
    this.threadFarGfx = this.ringOrder.length
      ? this.add.graphics().setDepth(1000 - this.zGoal * 10 - 6)
      : null;
    this.buildThreadPath();
    this.threadFlow = 0;
    this.threadTimer?.remove?.();
    this.threadTimer = null;
    if (this.threadGfx && !this.settings.reducedMotion) {
      this.threadTimer = this.time.addEvent({
        delay: 90,
        loop: true,
        callback: () => {
          this.threadFlow = (this.threadFlow + 1) % 9;
          this.refreshThread();
        }
      });
    }

    this.updateHoopSequence();
  }

  /**
   * Light the hoop the player has to thread next and leave the rest quiet.
   * This is what makes the challenge legible with the objective text hidden:
   * exactly one gate is ever bright, and it advances as the ball threads them.
   */
  updateHoopSequence() {
    const crossed = new Set(this.ringProgress?.crossedIds || []);
    const missed = new Set(this.ringProgress?.missedIds || []);
    let activeAssigned = false;

    for (const id of this.ringOrder) {
      const visual = this.ringVisuals.get(id);
      if (!visual) continue;
      let stage = 'pending';
      if (crossed.has(id)) stage = 'cleared';
      else if (missed.has(id)) stage = 'missed';
      else if (!activeAssigned) {
        stage = 'active';
        activeAssigned = true;
      }
      if (visual.stage !== stage) this.setHoopStage(visual, stage);
    }

    this.refreshThread();

    // Levels without hoops have nothing to sequence, so their corner stays
    // armed from the whistle.
    if (this.ringOrder.length) {
      const allCleared = this.ringOrder.every((id) => crossed.has(id));
      if (allCleared !== this.targetArmed) this.setTargetArmed(allCleared);
    }
    this.refreshObjectiveStrip();
  }

  setHoopStage(visual, stage) {
    visual.pulse?.remove?.();
    visual.pulse = null;
    this.tweens.killTweensOf([visual.front, visual.back]);
    visual.front.setAlpha(1);
    visual.back.setAlpha(1);
    this.paintHoop(visual, stage);

    if (stage !== 'active' || this.settings.reducedMotion) return;
    // A soft breath on the live gate. Alpha only - repainting the rim every
    // frame would cost a full graphics rebuild for no extra readability.
    visual.pulse = this.tweens.add({
      targets: [visual.front, visual.back],
      alpha: 0.62,
      duration: 560,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  destroyRingVisual(visual) {
    visual?.pulse?.remove?.();
    visual?.back?.destroy?.();
    visual?.front?.destroy?.();
    visual?.post?.destroy?.();
    visual?.plate?.destroy?.();
    visual?.label?.destroy?.();
    visual?.badge?.destroy?.();
  }

  refreshRingVisuals() {
    this.updateHoopSequence();

    // A gate that has just been threaded gets a one-off hit: a white flash on
    // the rim and a kick on its number plate. Passing through should feel like
    // an event, not a quiet state change.
    for (const id of (this.ringProgress?.newlyCrossedIds || [])) {
      const visual = this.ringVisuals?.get(id);
      if (!visual || this.settings.reducedMotion) continue;
      this.tweens.add({
        targets: [visual.front, visual.back],
        alpha: 0.35,
        duration: 90,
        yoyo: true,
        ease: 'Cubic.easeOut'
      });
      this.tweens.add({
        targets: [visual.label, visual.badge],
        scaleX: 1.35,
        scaleY: 1.35,
        duration: 140,
        yoyo: true,
        ease: 'Back.easeOut'
      });
    }
    for (const id of (this.ringProgress?.newlyMissedIds || [])) {
      const visual = this.ringVisuals?.get(id);
      if (!visual || this.settings.reducedMotion) continue;
      this.tweens.add({
        targets: [visual.front, visual.back],
        alpha: 0.3,
        duration: 110,
        yoyo: true,
        ease: 'Cubic.easeOut'
      });
    }
  }

  buildHazardVisuals() {
    this.hazardVisuals = [];
    const fog = getHazard(this.hazards, 'fog');
    if (fog) {
      const fogBands = [
        this.add.ellipse(GAME_W * 0.26, CAM.horizonY + 28, GAME_W * 0.82, 72, 0xdde8e5, fog.density * 0.2),
        this.add.ellipse(GAME_W * 0.74, CAM.horizonY + 48, GAME_W * 0.92, 96, 0xc8d9d8, fog.density * 0.18),
        this.add.rectangle(GAME_W / 2, CAM.horizonY + 26, GAME_W, 64, 0xd5e1df, fog.density * 0.1)
      ];
      fogBands.forEach((band, index) => {
        band.setDepth(1180 + index).setBlendMode(Phaser.BlendModes.SCREEN);
        this.hazardVisuals.push(band);
        if (!this.settings.reducedMotion && index < 2) {
          this.tweens.add({
            targets: band,
            x: band.x + (index ? -18 : 18),
            duration: 5200 + index * 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
        }
      });
    }

    const glare = getHazard(this.hazards, 'glare');
    if (glare) {
      const left = glare.corner.includes('left');
      const top = glare.corner.includes('top');
      const world = project(
        (left ? -1 : 1) * this.goalWidth * 0.42,
        top ? this.goalHeight * 0.9 : this.goalHeight * 0.18,
        this.zGoal
      );
      const radius = 18 + glare.radius * 48;
      [1, 0.64, 0.32].forEach((factor, index) => {
        const glow = this.add.circle(world.x, world.y, radius * factor, 0xfff2b3,
          glare.strength * (0.035 + index * 0.04))
          .setDepth(1340 + index)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.hazardVisuals.push(glow);
      });
    }

    const snow = getHazard(this.hazards, 'snow');
    if (snow && this.textures.exists('spark')) {
      // Snow needs depth, not just a particle overlay: a cold low haze settles
      // over the pitch, distant flakes establish the weather at the goal, and
      // fast foreground flakes occasionally cross the shot line.
      const groundFrost = this.add.graphics().setDepth(6);
      groundFrost.fillStyle(0xcfe7f7, 0.08 + snow.density * 0.06);
      groundFrost.fillTriangle(0, STADIUM_Y + 7, GAME_W, STADIUM_Y + 7, GAME_W, GAME_H);
      groundFrost.fillTriangle(0, STADIUM_Y + 7, GAME_W, GAME_H, 0, GAME_H);
      groundFrost.fillStyle(0xffffff, 0.035 + snow.density * 0.025);
      for (let index = 0; index < 22; index++) {
        const t = index / 21;
        const y = STADIUM_Y + 12 + t * (GAME_H - STADIUM_Y - 16);
        const width = 12 + ((index * 29) % 44);
        const x = ((index * 97) % (GAME_W + width)) - width / 2;
        groundFrost.fillRect(x, y, width, Math.max(1, 1 + Math.floor(t * 1.4)));
      }
      this.hazardVisuals.push(groundFrost);

      const lowMist = this.add.ellipse(GAME_W / 2, STADIUM_Y + 17, GAME_W * 1.08, 36,
        0xdff0fa, 0.045 + snow.density * 0.07)
        .setDepth(1175)
        .setBlendMode(Phaser.BlendModes.SCREEN);
      this.hazardVisuals.push(lowMist);
      if (!this.settings.reducedMotion) {
        this.tweens.add({
          targets: lowMist, x: GAME_W / 2 + 12, alpha: lowMist.alpha * 1.45,
          duration: 4100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      }

      const farFlakes = this.add.particles(0, 0, 'spark', {
        x: { min: -16, max: GAME_W + 16 }, y: { min: CAM.horizonY - 12, max: CAM.horizonY + 18 },
        speedX: { min: -5 - snow.density * 8, max: 2 }, speedY: { min: 13, max: 25 },
        lifespan: { min: 4300, max: 6900 }, scale: { start: 0.38, end: 0.15 },
        alpha: { start: 0.72, end: 0.12 }, tint: [0xffffff, 0xd9efff], quantity: 1,
        frequency: Math.round(132 - snow.density * 68), advance: 2300,
        maxParticles: 136, maxAliveParticles: 108, reserve: 108
      }).setDepth(1420);
      this.snowEmitters.push(farFlakes);
      this.hazardVisuals.push(farFlakes);

      if (!this.settings.reducedMotion) {
        const nearFlakes = this.add.particles(0, 0, 'spark', {
          x: { min: -25, max: GAME_W + 25 }, y: { min: -8, max: GAME_H * 0.48 },
          speedX: { min: -24 - snow.density * 18, max: -5 }, speedY: { min: 42, max: 76 },
          lifespan: { min: 1750, max: 3100 }, scale: { start: 0.92, end: 0.28 },
          alpha: { start: 0.58, end: 0.08 }, tint: [0xffffff, 0xc6e7ff], quantity: 1,
          frequency: Math.round(165 - snow.density * 72), advance: 900,
          maxParticles: 84, maxAliveParticles: 64, reserve: 64
        }).setDepth(2101);
        this.snowEmitters.push(nearFlakes);
        this.hazardVisuals.push(nearFlakes);
      }
    }

    const pressure = this.hazardMap.get('crowd-pressure');
    if (pressure) {
      this.pressureMeterGfx = this.add.graphics().setDepth(2001);
      const label = bodyText(this, 9, GAME_H - 53, 'CROWD PRESSURE', {
        fontFamily: FONT, fontSize: '5px', color: '#ffcf8a', letterSpacing: 0.25
      }).setDepth(2002);
      this.hazardVisuals.push(this.pressureMeterGfx, label);
    }
  }

  /**
   * Where a single keeper chooses to stand.
   *
   * A keeper parked dead centre says nothing about the level. Shading him
   * toward the post the objective is *not* asking for turns the challenge into
   * something you can read off the pitch: the far corner is open because he is
   * guarding the near one, and beating him is the whole point of the shot.
   */
  keeperShadingFor(instance) {
    if (this.keeperConfig.count > 1 || !this.baseTarget) return instance.offsetX;
    const targetSide = Math.sign(this.baseTarget.x || 0);
    if (!targetSide) return instance.offsetX;
    const reach = Math.max(0, this.goalWidth / 2 - 1.15);
    return instance.offsetX - targetSide * Math.min(reach, this.goalWidth * 0.16);
  }

  buildKeepers() {
    this.keepers?.forEach((keeper) => keeper.destroy?.());
    this.keepers = this.keeperConfig.instances.map((instance, index) => {
      const bossBoost = this.keeperConfig.type === 'boss'
        ? Math.min((this.attempt - 1) * this.keeperConfig.adaptation, 0.18)
        : 0;
      const keeper = new Goalkeeper(this, Math.min(instance.skill + bossBoost, 0.96), this.zGoal, {
        reducedMotion: this.settings.reducedMotion,
        style: this.level.style,
        homeX: this.keeperShadingFor(instance),
        goalWidth: this.goalWidth,
        goalHeight: this.goalHeight,
        seed: (((this.levelIndex + 1) * 2654435761) + index * 1013904223) >>> 0
      });
      keeper.fklBaseSkill = instance.skill;
      keeper.fklBaseZ = keeper.z;
      keeper.fklTargetZ = keeper.z - (this.keeperConfig.type === 'sweeper' ? this.keeperConfig.rushDistance : 0);
      keeper.fklPrevZ = keeper.z;
      keeper.draw();
      return keeper;
    });
    this.keeper = this.keepers[0] || null;
  }

  updateConditions(dt = FIXED_STEP) {
    // Preserve the start-of-step keeper plane before a sweeper advances. The
    // collision pass can then solve ball/keeper motion relative to each other.
    for (const keeper of this.keepers || []) keeper.fklPrevZ = keeper.z;

    const moving = this.level.movingTarget;
    if (moving && this.activeTarget && this.baseTarget) {
      const offset = Math.sin(this.simTime * moving.speed + moving.phase) * moving.range;
      this.activeTarget.x = Phaser.Math.Clamp(this.baseTarget.x + offset, -0.78, 0.78);
      const geometry = targetGeometry(this.activeTarget, this.goalWidth, this.goalHeight);
      const centre = project(geometry.x, geometry.y, this.zGoal + 0.08);
      this.targetGfx?.setX(centre.x - this.targetAnchorScreenX);
    }

    if (this.ball) {
      this.currentWind = getWindVectorAt(this.level.wind, this.simTime, {
        gustPhase: this.level.distance
      });
      this.ball.setWind(this.currentWind);
      if (this.windTxt) {
        const horizontal = this.currentWind.x;
        const vertical = this.currentWind.y;
        const arrow = Math.abs(horizontal) < 0.06 ? (vertical >= 0 ? '^' : 'v') : horizontal > 0 ? '>' : '<';
        this.windTxt.setText(`WIND ${this.currentWind.magnitude.toFixed(1)} ${arrow}`);
      }
    }

    if (this.keeperConfig.type === 'sweeper' && this.state === 'FLIGHT' &&
        this.flightT >= this.keeperConfig.triggerFlightTime) {
      for (const keeper of this.keepers) {
        keeper.z = Math.max(keeper.fklTargetZ, keeper.z - this.keeperConfig.rushSpeed * dt);
      }
    }

    const pressure = this.hazardMap.get('crowd-pressure');
    if (pressure && this.pressureMeterGfx) {
      const pulse = 0.5 + 0.5 * Math.sin(this.simTime * pressure.pulseSpeed * Math.PI * 2);
      const amount = Phaser.Math.Clamp(pressure.intensity * (0.72 + pulse * 0.28), 0, 1);
      this.pressureMeterGfx.clear();
      this.pressureMeterGfx.fillStyle(0x071018, 0.78).fillRect(9, GAME_H - 45, 72, 6);
      this.pressureMeterGfx.fillStyle(amount > 0.66 ? 0xff8a65 : PAL.gold, 0.95)
        .fillRect(10, GAME_H - 44, 70 * amount, 4);
    }
  }

  buildWall() {
    this.walls?.forEach((wall) => wall.destroy());
    this.walls = [];
    this.wallPlanesChecked = new Set();
    if (this.wallConfig.count <= 0) {
      this.wall = null;
      return;
    }
    // Wall stands on the line between the ball and the goal center, shaded
    // toward the near post - the far-post curler is always a real option.
    const t = (this.zWall - CAM.ballDist) / (this.zGoal - CAM.ballDist);
    const lineX = this.level.offsetX * (1 - t) + Math.sign(this.level.offsetX) * 0.3;
    this.wall = new Wall(this, this.wallConfig, this.zWall, lineX);
    this.walls = [this.wall];
  }

  buildHud() {
    // At short landscape heights each logical pixel maps to roughly 1.4 device
    // pixels. Promote the smallest broadcast labels so the HUD remains
    // glance-readable without covering more of the pitch.
    const primaryHudFont = this.compactHud ? '5px' : '4px';
    const tinyHudFont = this.compactHud ? '5px' : '3px';
    const secondaryHudFont = this.compactHud ? '5px' : '4px';
    const chrome = this.add.graphics().setDepth(1988);
    drawPanel(chrome, 4, 1, GAME_W - 8, 9, {
      fill: PAL.panel,
      border: PAL.borderDark,
      corner: PAL.goldDark
    });

    this.muteButton = makeIconButton(this, 10, 5.5, 7,
      Audio.muted ? 'icon-mute' : 'icon-sound', () => {
        const muted = Audio.toggleMuted();
        MenuMusic.setMuted(muted);
        SaveManager.setSetting('muted', muted);
        this.muteButton.buttonIcon?.setTexture(muted ? 'icon-mute' : 'icon-sound');
      }, {
        color: PAL.panelHi, hover: PAL.blue, border: PAL.borderDark,
        iconScale: 0.3, hitWidth: 22, hitHeight: 19
      }).setDepth(2000);

    if (this.mode === 'career') {
      // One strip, three zones: identity left, match title centred, conditions
      // right. Everything used to compete inside the same run of text.
      bodyText(this, 24, 5.5, `MATCH ${String(this.levelIndex + 1).padStart(2, '0')}`, {
        fontFamily: FONT, fontSize: primaryHudFont, color: '#f3e7c3', letterSpacing: 0.2
      }).setDepth(2000);
      bodyText(this, GAME_W / 2, 5.5, String(this.level.name).toUpperCase(), {
        originX: 0.5, fontFamily: FONT, fontSize: '6px', color: '#f3c449', letterSpacing: 0.3
      }).setDepth(2000);

      this.attemptIcons = [];
      // Cosmetic balls ship at several native sizes (12px pixel art, 57px HD),
      // so size the HUD icons from the texture instead of a fixed scale.
      const iconTexW = this.textures.get(this.ballTexture).getSourceImage()?.width || 12;
      for (let i = 0; i < this.maxAttempts; i++) {
        const icon = this.add.image(GAME_W - 8 - i * 8, 5.5, this.ballTexture)
          .setScale(5.5 / iconTexW).setDepth(2000);
        this.attemptIcons.push(icon);
      }
      const wind = getWindVectorAt(this.level.wind, this.simTime);
      const attemptsWidth = this.maxAttempts * 8;
      if (wind.magnitude >= 0.1 || this.level.wind?.rotation) {
        const arrow = Math.abs(wind.x) < 0.06 ? (wind.y >= 0 ? '^' : 'v') : wind.x > 0 ? '>' : '<';
        this.windTxt = bodyText(this, GAME_W - 8 - attemptsWidth, 5.5, `WIND ${wind.magnitude.toFixed(1)} ${arrow}`, {
          originX: 1, fontFamily: FONT, fontSize: primaryHudFont, color: '#f3c449', letterSpacing: 0.2
        }).setDepth(2000);
      }

      // Secondary strip: cup identity and objective count, out of the way of
      // the primary readout above it.
      const subChrome = this.add.graphics().setDepth(1988);
      const needed = Math.max(1, this.level.objective?.goals || 1);
      const subWidth = needed > 1 ? 118 : 78;
      drawPanel(subChrome, 4, 11.5, subWidth, 8, {
        fill: PAL.panelMuted, border: PAL.borderDark, corner: PAL.goldDark, alpha: 0.9
      });
      bodyText(this, 9, 15.5, `${String(this.level.cup || 'career').toUpperCase()} CUP`, {
        fontSize: secondaryHudFont, color: '#b9c6c5', letterSpacing: 0.24
      }).setDepth(2000);
      if (needed > 1) {
        this.objectiveProgressTxt = bodyText(this, 4 + subWidth - 5, 15.5, `0 / ${needed} TARGETS`, {
          originX: 1, fontFamily: FONT, fontSize: secondaryHudFont, color: '#f3c449', letterSpacing: 0.2
        }).setDepth(2000);
      }

      const styleX = 4 + subWidth + 4;
      const styleLabel = `${this.loadoutGameplay.ability} · ${this.loadoutGameplay.ballFeel}`.toUpperCase();
      const styleWidth = Math.min(this.compactHud ? 128 : 112,
        styleLabel.length * (this.compactHud ? 2.8 : 2.25) + 10);
      const stylePlate = this.add.graphics().setDepth(1988);
      drawPanel(stylePlate, styleX, 11.5, styleWidth, 8, {
        fill: 0x153d3a, border: PAL.borderDark, corner: PAL.greenHi, alpha: 0.92
      });
      bodyText(this, styleX + styleWidth / 2, 15.5, styleLabel, {
        originX: 0.5, fontSize: secondaryHudFont, color: '#9ef0dc', letterSpacing: 0.14
      }).setDepth(2000);
      this.buildConditionChips(styleX + styleWidth + 4);
      this.buildTutorial();
      this.buildObjectiveStrip();
    } else if (this.mode === 'daily') {
      bodyText(this, 38, 5.5, `DAILY KICK  ·  ${this.dailyDate}`, {
        fontSize: tinyHudFont, color: '#f3c449', letterSpacing: 0.18
      }).setDepth(2000);
      bodyText(this, 132, 5.5, 'FIVE SHOTS  ·  ONE SHARED CHALLENGE', {
        fontFamily: FONT, fontSize: tinyHudFont, color: '#f3e7c3', letterSpacing: 0.08
      }).setDepth(2000);
      this.scoreTxt = bodyText(this, 342, 5.5, `SCORE ${this.score}`, {
        originX: 0.5, fontFamily: FONT, fontSize: primaryHudFont, color: '#f3e7c3'
      }).setDepth(2000);
      const shots = makeStatChip(this, GAME_W - 28, 5.5, 44, 'icon-star', `1/${this.maxAttempts}`, {
        height: 8, fill: PAL.night, border: PAL.goldDark, color: '#f3c449', fontSize: primaryHudFont, iconScale: 0.42
      }).setDepth(2000);
      this.dailyShotsTxt = shots.valueText;

      const objectivePlate = this.add.graphics().setDepth(1975);
      drawPanel(objectivePlate, 130, GAME_H - 39, 344, 25, {
        fill: PAL.panel, border: PAL.goldDark, corner: PAL.gold, alpha: 0.93
      });
      const dailyLabel = bodyText(this, 143, GAME_H - 26.5, 'DAILY BONUS', {
        fontFamily: FONT, fontSize: '6px', color: '#f3c449', letterSpacing: 0.45
      }).setDepth(2000);
      const dailyCopy = bodyText(this, 216, GAME_H - 26.5, 'Hit the moving target for +650. Every goal counts.', {
        fontSize: '7px', color: '#d7dfda', letterSpacing: 0.12
      }).setDepth(2000);
      this.objectiveUi = [objectivePlate, dailyLabel, dailyCopy];
    } else {
      this.scoreTxt = bodyText(this, GAME_W / 2 - 32, 5.5, `SCORE ${this.score}`, {
        originX: 0.5, fontFamily: FONT, fontSize: primaryHudFont, color: '#f3e7c3'
      }).setDepth(2000);
      this.comboTxt = bodyText(this, GAME_W / 2 + 32, 5.5,
        this.combo > 1 ? `x${this.combo} COMBO` : `${this.goals} GOALS`, {
          originX: 0.5, fontSize: tinyHudFont, color: '#74bde8', letterSpacing: 0.18
        }).setDepth(2000);
      const timer = makeStatChip(this, GAME_W - 27, 5.5, 42, 'icon-clock', Math.ceil(this.timeLeft), {
        height: 8, fill: PAL.night, border: PAL.goldDark, color: '#f3c449', fontSize: primaryHudFont, iconScale: 0.42
      }).setDepth(2000);
      this.timerTxt = timer.valueText;
    }

    this.bannerPlate = this.add.graphics().setDepth(2095).setAlpha(0);
    drawPanel(this.bannerPlate, GAME_W / 2 - 105, 38, 210, 28, {
      fill: PAL.panel, border: PAL.goldDark, corner: PAL.gold
    });
    this.banner = titleText(this, GAME_W / 2, 52, '', '14px').setDepth(2100).setAlpha(0);
    // Diagnostic line under the banner: the banner is the feeling, this is the
    // reason. Both clear together when the next attempt starts.
    this.shotReadoutPlate = this.add.graphics().setDepth(2095).setAlpha(0);
    this.shotReadout = bodyText(this, GAME_W / 2, READOUT_Y + 6.5, '', {
      originX: 0.5, originY: 0.5, fontFamily: FONT, fontSize: '6px',
      color: '#d7dfda', letterSpacing: 0.2
    }).setDepth(2100).setAlpha(0);
    this.inputHint = crispText(this.add.text(GAME_W / 2, GAME_H - 34, '', {
      fontFamily: FONT, fontSize: '9px', color: '#f3e7c3',
      stroke: '#071018', strokeThickness: 3
    }).setOrigin(0.5).setDepth(2100).setAlpha(0));
    if (this.mode === 'arcade' && !this.arcadeStarted) {
      this.inputHint
        .setText('SWIPE TO START THE 60-SECOND RUN')
        .setY(COACHING_HINT_Y)
        .setAlpha(1);
    }
    // A small, permanently visible route to the only match-control surface.
    // It stays in the lower safe area so the objective, swipe cue and goal
    // never compete with it at any responsive size.
    this.menuHint = bodyText(this, GAME_W - 7, GAME_H - 8, 'TAB  MATCH MENU', {
      originX: 1, originY: 0.5, fontFamily: FONT, fontSize: this.compactHud ? '5px' : '4px',
      color: '#cfe8ff', letterSpacing: 0.28
    }).setDepth(2102);

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

  /**
   * Name the match conditions that change how the ball behaves.
   *
   * A snow level genuinely makes the ball heavier - there is extra drag on
   * every axis - and a slippery run-up genuinely moves the power at the moment
   * of contact. Both are deliberate, and both look like faults until the game
   * says so out loud.
   */
  buildConditionChips(startX) {
    let x = startX;
    for (const hazard of this.hazards) {
      const chip = CONDITION_CHIPS[hazard.type];
      if (!chip) continue;
      const width = chip.label.length * (this.compactHud ? 2.9 : 2.4) + 10;
      if (x + width > GAME_W - 4) break;
      const plate = this.add.graphics().setDepth(1988);
      drawPanel(plate, x, 11.5, width, 8, {
        fill: PAL.panelMuted, border: PAL.borderDark, corner: PAL.goldDark, alpha: 0.9
      });
      bodyText(this, x + width / 2, 15.5, chip.label, {
        originX: 0.5, fontSize: this.compactHud ? '5px' : '4px', color: chip.color, letterSpacing: 0.18
      }).setDepth(2000);
      x += width + 4;
    }
  }

  /**
   * Compact objective readout.
   *
   * The old panel was a 344x25 slab carrying a full sentence for the entire
   * match. It is now a short chip of step markers - 1 -> 2 -> GOAL - that
   * tracks live state, with the explanatory sentence shown once at kick-off and
   * then retired. The strip is a summary of the same sequencing the hoops
   * themselves show, so the screen stays readable with it hidden.
   */
  buildObjectiveStrip() {
    const rings = this.level.rings || [];
    const steps = [
      ...rings.map((_, index) => ({ kind: 'hoop', text: String(index + 1) })),
      { kind: 'goal', text: this.describeFinish() }
    ];

    const gap = 7;
    const chipW = (step) => (step.kind === 'hoop' ? 11 : Math.max(24, step.text.length * 4.4 + 8));
    const contentW = steps.reduce((sum, step) => sum + chipW(step), 0) + gap * (steps.length - 1);
    const labelW = 44;
    const plateW = Math.round(labelW + contentW + 16);
    const plateH = 15;
    const plateX = Math.round(GAME_W / 2 - plateW / 2);
    const plateY = GAME_H - 20;
    const midY = plateY + plateH / 2;

    const plate = this.add.graphics().setDepth(1975);
    drawPanel(plate, plateX, plateY, plateW, plateH, {
      fill: PAL.panel, border: PAL.borderDark, corner: PAL.goldDark, alpha: 0.92
    });
    const label = bodyText(this, plateX + 7, midY, 'OBJECTIVE', {
      originY: 0.5, fontFamily: FONT, fontSize: '5px', color: '#f3c449', letterSpacing: 0.4
    }).setDepth(2000);

    const marks = this.add.graphics().setDepth(1990);
    this.objectiveSteps = [];
    let x = plateX + 8 + labelW;
    steps.forEach((step, index) => {
      const w = chipW(step);
      const text = bodyText(this, x + w / 2, midY, step.text, {
        originX: 0.5, originY: 0.5, fontFamily: FONT, fontSize: '5px', color: '#8fa2ab', letterSpacing: 0.2
      }).setDepth(2000);
      this.objectiveSteps.push({ ...step, x, w, text, state: 'pending' });
      x += w;
      if (index < steps.length - 1) {
        // Pixel chevron rather than an arrow glyph, so the strip stays in the
        // same drawing language as the rest of the chrome.
        marks.fillStyle(PAL.borderDark, 1);
        marks.fillRect(Math.round(x + 2), Math.round(midY) - 2, 1, 1);
        marks.fillRect(Math.round(x + 3), Math.round(midY) - 1, 1, 1);
        marks.fillRect(Math.round(x + 4), Math.round(midY), 1, 1);
        marks.fillRect(Math.round(x + 3), Math.round(midY) + 1, 1, 1);
        marks.fillRect(Math.round(x + 2), Math.round(midY) + 2, 1, 1);
        x += gap;
      }
    });

    this.objectiveStripGfx = this.add.graphics().setDepth(1985);
    this.objectiveUi = [plate, label, marks, this.objectiveStripGfx,
      ...this.objectiveSteps.map((step) => step.text)];

    // The full sentence still gets said - once, above the strip, then it goes
    // away and gives the screen back. During the tutorial it is not said at
    // all: the coaching copy occupies that line, and stacking a third sentence
    // under it is the dump-everything-at-once problem this is here to avoid.
    const brief = this.tutorialActive() ? null : this.level.objective?.label;
    if (brief) {
      this.objectiveBrief = bodyText(this, GAME_W / 2, plateY - 9, brief, {
        originX: 0.5, originY: 0.5, fontSize: '7px', color: '#d7dfda',
        stroke: '#071018', strokeThickness: 3, letterSpacing: 0.15
      }).setDepth(2000);
      this.tweens.add({
        targets: this.objectiveBrief,
        alpha: 0,
        delay: 3400,
        duration: 500,
        ease: 'Sine.easeOut',
        onComplete: () => this.objectiveBrief?.setVisible(false)
      });
    }

    this.refreshObjectiveStrip();
  }

  describeFinish() {
    const target = this.baseTarget;
    if (!target) return 'GOAL';
    const vertical = (target.y ?? 0.5) >= 0.6 ? 'TOP' : (target.y ?? 0.5) <= 0.3 ? 'LOW' : '';
    const lateral = (target.x ?? 0) <= -0.25 ? 'LEFT' : (target.x ?? 0) >= 0.25 ? 'RIGHT' : 'CENTRE';
    return [vertical, lateral].filter(Boolean).join(' ');
  }

  refreshObjectiveStrip() {
    const gfx = this.objectiveStripGfx;
    if (!gfx?.active || !this.objectiveSteps?.length) return;
    const crossed = new Set(this.ringProgress?.crossedIds || []);
    const missed = new Set(this.ringProgress?.missedIds || []);

    gfx.clear();
    let hoopIndex = 0;
    let activeTaken = false;
    for (const step of this.objectiveSteps) {
      let state = 'pending';
      if (step.kind === 'hoop') {
        const id = this.ringOrder?.[hoopIndex];
        if (id && crossed.has(id)) state = 'cleared';
        else if (id && missed.has(id)) state = 'missed';
        else if (!activeTaken) { state = 'active'; activeTaken = true; }
        hoopIndex++;
      } else {
        state = this.targetArmed && !activeTaken ? 'active' : 'pending';
      }

      const stage = HOOP_STAGES[state] || HOOP_STAGES.pending;
      const box = { x: Math.round(step.x), y: Math.round(step.text.y - 5), w: Math.round(step.w), h: 10 };
      gfx.fillStyle(0x071018, 0.55).fillRect(box.x, box.y, box.w, box.h);
      gfx.lineStyle(1, stage.band, state === 'pending' ? 0.5 : 0.95);
      gfx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
      if (state === 'cleared') {
        gfx.fillStyle(stage.band, 0.22).fillRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
      }
      step.text.setColor(state === 'pending' ? '#8fa2ab' : stage.glyphColor);
      step.state = state;
    }
  }

  // ---------------------------------------------------------------- tutorial

  /**
   * Match 01 teaches the swipe instead of assuming it.
   *
   * The tutorial only ever runs on the first career level, for a player who has
   * not finished it, and it never takes control: the ghost swipe is a loop the
   * player can copy or ignore, and it gets out of the way the moment they put a
   * finger down. Each attempt advances one concept - direction, then power,
   * then bend - so nothing arrives at the same time as anything else.
   */
  tutorialActive() {
    return this.mode === 'career' && this.levelIndex === 0 && !this.tutorialDone;
  }

  buildTutorial() {
    const record = SaveManager.getTutorial?.() ?? { completed: false, step: 0 };
    this.tutorialDone = Boolean(record.completed);
    this.tutorialStep = Phaser.Math.Clamp(record.step ?? 0, 0, TUTORIAL_STEPS.length - 1);
    if (!this.tutorialActive()) return;

    this.tutorialGfx = this.add.graphics().setDepth(1495);
    this.tutorialPhase = 0;
    this.tutorialCaption = bodyText(this, GAME_W / 2, READOUT_Y - 16, '', {
      originX: 0.5, originY: 0.5, fontFamily: FONT, fontSize: '8px', color: '#f3c449',
      stroke: '#071018', strokeThickness: 3, letterSpacing: 0.3
    }).setDepth(2000);
    this.tutorialDetail = bodyText(this, GAME_W / 2, READOUT_Y - 6, '', {
      originX: 0.5, originY: 0.5, fontSize: '7px', color: '#d7dfda',
      stroke: '#071018', strokeThickness: 3
    }).setDepth(2000);
    this.refreshTutorialCopy();
  }

  refreshTutorialCopy() {
    const step = TUTORIAL_STEPS[this.tutorialStep];
    if (!step || !this.tutorialCaption) return;
    this.tutorialCaption.setText(step.caption).setAlpha(1);
    this.tutorialDetail.setText(step.detail).setAlpha(1);
  }

  setTutorialCopyAlpha(alpha, duration = 0) {
    const copy = [this.tutorialCaption, this.tutorialDetail].filter((item) => item?.active);
    if (!copy.length) return;
    this.tweens.killTweensOf(copy);
    if (duration > 0) {
      this.tweens.add({ targets: copy, alpha, duration, ease: 'Cubic.easeOut' });
    } else {
      copy.forEach((item) => item.setAlpha(alpha));
    }
  }

  /** The looping ghost swipe: a path to copy, drawn from the ball outward. */
  drawTutorialGhost(delta) {
    const gfx = this.tutorialGfx;
    if (!gfx?.active) return;
    gfx.clear();
    const step = TUTORIAL_STEPS[this.tutorialStep];
    // Hidden while the player is actually swiping - their own line is the one
    // that matters, and two overlapping trails is exactly the clutter this is
    // meant to avoid.
    if (!step || this.state !== 'AIMING' || this.swipe?.activePath?.length) return;

    if (!this.settings.reducedMotion) {
      this.tutorialPhase = (this.tutorialPhase + delta * 0.00055 * step.speed) % 1.6;
    } else {
      this.tutorialPhase = 1;
    }
    const travel = Phaser.Math.Clamp(this.tutorialPhase, 0, 1);
    const ball = project(this.ball.x, this.ball.y, this.ball.z);

    const at = (t) => ({
      x: ball.x + Math.sin(t * Math.PI) * step.bow,
      y: ball.y - step.reach * t
    });

    // The trail behind the finger, fading toward the ball.
    const drawn = Math.max(2, Math.round(travel * 26));
    for (let i = 1; i <= drawn; i++) {
      const point = at((i / drawn) * travel);
      const fade = i / drawn;
      gfx.fillStyle(0x071018, 0.34 * fade);
      gfx.fillRect(Math.round(point.x) - 2, Math.round(point.y) - 2, 4, 4);
      gfx.fillStyle(0xf3c449, 0.5 * fade);
      gfx.fillRect(Math.round(point.x) - 1, Math.round(point.y) - 1, 2, 2);
    }

    // The hand itself: a chunky ring, so it reads as a pointer and not as ball.
    const head = at(travel);
    gfx.lineStyle(3, 0x071018, 0.8);
    gfx.strokeCircle(head.x, head.y, 4);
    gfx.lineStyle(1.5, 0xfff3cd, 0.95);
    gfx.strokeCircle(head.x, head.y, 4);
    gfx.fillStyle(0xfff3cd, 0.9);
    gfx.fillRect(Math.round(head.x) - 1, Math.round(head.y) - 1, 2, 2);
  }

  /** One concept per attempt; scoring ends the lesson early. */
  advanceTutorial(outcome) {
    if (!this.tutorialActive()) return;
    const last = this.tutorialStep >= TUTORIAL_STEPS.length - 1;
    if (outcome === 'GOAL' || last) {
      this.tutorialDone = true;
      SaveManager.setTutorial?.({ completed: true, step: TUTORIAL_STEPS.length });
      this.tutorialGfx?.clear();
      [this.tutorialCaption, this.tutorialDetail].forEach((text) => text?.setAlpha(0));
      return;
    }
    this.tutorialStep += 1;
    SaveManager.setTutorial?.({ step: this.tutorialStep });
    this.refreshTutorialCopy();
  }

  /**
   * Say what the shot actually did, in the player's terms.
   *
   * Every number here already existed - power, spin and the gesture are all
   * computed by the input mapping, and the goal-plane crossing is solved for
   * the keeper read - but none of it was ever shown. A miss was just "OFF
   * TARGET", which tells the player nothing they can act on. Reporting
   * "78% POWER - 32% RIGHT CURL - TOO HIGH" turns the same failure into a
   * correction they can make on the next attempt.
   */
  describeShot(outcome, point, rating) {
    const shot = this.lastShot || {};
    const parts = [];

    const power = Math.round(Phaser.Math.Clamp(shot.power ?? 0, 0, 1.2) * 100);
    parts.push(shot.powerCapped ? `${power}% POWER (CAPPED)` : `${power}% POWER`);

    const spin = shot.spin ?? 0;
    const curl = Math.round(Math.abs(spin) * 100);
    if (curl < 6) parts.push('NO CURL');
    else parts.push(`${curl}% ${spin > 0 ? 'RIGHT' : 'LEFT'} CURL`);

    parts.push(this.describeOutcome(outcome, point, rating));
    if (outcome === 'GOAL' && rating?.points) parts.push(`+${rating.points}`);
    return parts.join('  ·  ');
  }

  /** The single most useful field: why the shot ended the way it did. */
  describeOutcome(outcome, point, rating) {
    const halfWidth = this.goalWidth / 2;
    // For a shot stopped short, fall back to where it had been heading.
    const plane = point && Number.isFinite(point.x) ? point : this.headingFor;

    switch (outcome) {
      case 'GOAL':
        if (rating?.topCorner) return 'TOP CORNER';
        return String(rating?.label || 'GOAL').toUpperCase();
      case 'SAVE':
        return 'KEEPER READ IT';
      case 'CAUGHT':
        return 'KEEPER HELD IT';
      case 'WALL': {
        if (this.lastWallKnockdown) return 'THUNDERSTRIKE · WALL FLATTENED';
        if (!plane) return 'INTO THE WALL';
        // Say which way out was available, not just that it failed.
        const overBar = plane.y > this.goalHeight;
        if (overBar) return 'INTO THE WALL · AND OVER';
        return plane.y < 0.9 ? 'INTO THE WALL · GO OVER IT' : 'INTO THE WALL · BEND AROUND IT';
      }
      case 'POST':
        return this.frameContacts.has('crossbar') ? 'OFF THE BAR' : 'OFF THE POST';
      default: {
        if (!plane) return 'NEVER GOT THERE · MORE POWER';
        const high = plane.y > this.goalHeight;
        const wide = Math.abs(plane.x) > halfWidth;
        if (high && wide) return 'HIGH AND WIDE';
        if (high) return plane.y > this.goalHeight + 1.2 ? 'WAY TOO HIGH' : 'JUST TOO HIGH';
        if (wide) {
          const margin = Math.abs(plane.x) - halfWidth;
          const side = plane.x < 0 ? 'LEFT' : 'RIGHT';
          return margin < 0.6 ? `INCHES WIDE ${side}` : `WIDE ${side}`;
        }
        return 'OFF TARGET';
      }
    }
  }

  showShotReadout(outcome, point, rating) {
    const text = this.describeShot(outcome, point, rating);
    const scored = outcome === 'GOAL';
    this.announceStatus(`${scored ? 'Goal' : String(outcome).toLowerCase()}. ${text}.`);
    if (!this.shotReadout) return;
    this.tweens.killTweensOf([this.shotReadout, this.shotReadoutPlate]);

    this.shotReadout.setText(text).setColor(scored ? '#f3c449' : '#d7dfda');
    // The plate is redrawn to the text so it never sits half-empty or clips.
    const width = Math.min(GAME_W - 16, Math.round(this.shotReadout.displayWidth) + 16);
    this.shotReadoutPlate.clear();
    drawPanel(this.shotReadoutPlate, Math.round(GAME_W / 2 - width / 2), READOUT_Y, width, 13, {
      fill: PAL.panel, border: PAL.borderDark, corner: scored ? PAL.gold : PAL.goldDark, alpha: 0.94
    });

    const objects = [this.shotReadout, this.shotReadoutPlate];
    objects.forEach((object) => object.setAlpha(0));
    this.tweens.add({ targets: objects, alpha: 1, duration: 160, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: objects, alpha: 0, delay: 1750, duration: 260, ease: 'Cubic.easeOut'
    });
  }

  hideShotReadout() {
    if (!this.shotReadout) return;
    this.tweens.killTweensOf([this.shotReadout, this.shotReadoutPlate]);
    this.shotReadout.setAlpha(0);
    this.shotReadoutPlate.setAlpha(0);
  }

  announceStatus(message) {
    const status = globalThis.document?.getElementById?.('game-status');
    if (!status || !message) return false;
    // Clearing first makes repeated outcomes (for example two saves) announce
    // again instead of being swallowed as unchanged live-region text.
    status.textContent = '';
    globalThis.requestAnimationFrame?.(() => {
      if (status.isConnected) status.textContent = String(message);
    });
    return true;
  }

  showBanner(text, color = '#f0e8d0') {
    this.tweens.killTweensOf([this.banner, this.bannerPlate]);
    const reduced = Boolean(this.settings.reducedMotion);
    this.bannerPlate?.setAlpha(0).setY(reduced ? 0 : -7);
    this.banner.setText(text).setColor(color).setAlpha(0).setScale(reduced ? 1 : 0.94).setY(reduced ? 52 : 45);
    // One writer per property. The old version tweened `y` across both objects
    // AND wrote this.banner.setY() from an onUpdate on the same tween, so two
    // sources fought over the banner's position and it visibly juddered as it
    // came in. The plate slides; the banner's y is derived from it, once.
    this.tweens.add({
      targets: [this.banner, this.bannerPlate],
      alpha: 1,
      duration: reduced ? 120 : 200,
      ease: 'Cubic.easeOut'
    });
    if (!reduced) {
      this.tweens.add({
        targets: this.bannerPlate,
        y: 0,
        duration: 200,
        ease: 'Cubic.easeOut',
        onUpdate: () => this.banner.setY(52 + this.bannerPlate.y)
      });
      this.tweens.add({ targets: this.banner, scale: 1, duration: 200, ease: 'Cubic.easeOut' });
    }
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
    // Aiming has begun: the striker loads into the ready stance. Until now he
    // has been standing, which is what the frame should show before any input.
    if (this.state === 'AIMING') this.kicker?.setPose('ready');
    if (this.mode === 'arcade' && !this.arcadeStarted && this.inputHint?.active) {
      // The ready CTA occupies the same lower lane as the truthful live meter.
      // Clear it as soon as aiming begins; an invalid release supplies its own
      // corrective message, while a valid release starts the clock.
      this.tweens?.killTweensOf?.(this.inputHint);
      this.inputHint.setAlpha(0);
    }
    this.setTutorialCopyAlpha(0.12, 110);
    if (!this.objectiveUi) return;
    this.tweens.killTweensOf(this.objectiveUi);
    this.tweens.add({ targets: this.objectiveUi, alpha: 0.14, duration: 140, ease: 'Cubic.easeOut' });
  }

  onSwipeEnd(valid) {
    if (valid || this.state !== 'AIMING') return;
    this.kicker?.setPose('idle');
    this.setTutorialCopyAlpha(1, 140);
    if (!this.objectiveUi) return;
    this.tweens.killTweensOf(this.objectiveUi);
    this.tweens.add({ targets: this.objectiveUi, alpha: 1, duration: 160, ease: 'Cubic.easeOut' });
  }

  showSwipeHintMessage(message) {
    if (!this.inputHint || this.state === 'OVERLAY') return;
    this.inputHint.setText(message).setAlpha(1).setY(COACHING_HINT_Y);
    this.tweens.killTweensOf(this.inputHint);
    this.tweens.add({
      targets: this.inputHint,
      y: COACHING_HINT_Y - 5,
      alpha: 0,
      delay: 700,
      duration: 450,
      ease: 'Quad.easeOut'
    });
  }

  // ---------------------------------------------------------------- shooting

  /**
   * Resolve a gesture into the shot it will actually produce.
   *
   * `preview` matters on slippery levels. The jitter is a continuous function
   * of simTime at up to 10Hz, and drawAim calls this every frame - so the
   * preview arc, the reticle and all three meters were re-rolling sixty times
   * a second and thrashing on screen. That reads as a broken game, not as a
   * treacherous run-up. Previews therefore take the un-jittered shot and carry
   * the jitter's *range* instead, which the meter draws as an uncertainty band;
   * the live shot at release still gets the real jitter applied.
   */
  prepareShot(input = {}, { preview = false } = {}) {
    const shot = {
      ...input,
      vx: Number(input.vx) || 0,
      vy: Number(input.vy) || 0,
      vz: Number(input.vz) || 0,
      spin: Number(input.spin) || 0
    };
    const authoredPower = Phaser.Math.Clamp(
      Number.isFinite(input.power) ? input.power : 0.82,
      0,
      1
    );
    const maxPower = Phaser.Math.Clamp(this.level.shotRules?.maxPower ?? 1, 0.45, 1);
    let effectivePower = Math.min(authoredPower, maxPower);
    let velocityScale = authoredPower > 1e-6 ? effectivePower / authoredPower : 1;

    const slippery = this.hazardMap.get('slippery');
    const jitterAmount = Math.max(
      Number(this.level.shotRules?.powerJitter || 0),
      Number(slippery?.powerJitter || 0)
    );
    shot.powerJitterRange = jitterAmount;
    if (jitterAmount > 0 && !preview) {
      const jitter = getJitteredPower(effectivePower, {
        amount: jitterAmount,
        frequency: slippery?.frequency,
        elapsedSeconds: this.simTime,
        seed: `${this.level.id}:${this.attempt}`,
        maxPower
      });
      velocityScale *= effectivePower > 1e-6 ? jitter.power / effectivePower : 1;
      effectivePower = jitter.power;
      shot.powerJitter = jitter.delta;
    }

    shot.vx *= velocityScale;
    shot.vy *= velocityScale;
    shot.vz *= velocityScale;
    shot.power = effectivePower;
    shot.authoredPower = authoredPower;
    shot.powerCapped = authoredPower > maxPower + 1e-6;
    const guideMode = this.level.shotRules?.aimGuide || this.level.objective?.guideMode || 'always';
    shot.aimGuideHidden = guideMode === 'hide-on-run-up' || guideMode === 'commit';
    shot.guideCommitted = shot.aimGuideHidden;
    Object.assign(shot, applyLoadoutToShot(shot, this.loadoutGameplay, maxPower));
    shot.powerCapped ||= effectivePower > shot.power + 1e-6;
    return shot;
  }

  takeShot(inputShot) {
    if (this.state !== 'AIMING' || this.over) return;
    this.startArcadeClock();
    const shot = this.prepareShot(inputShot);
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
    this.aimGuideHidden = shot.aimGuideHidden;
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
    // Contact throws turf. Cheap, brief, and it plants the strike on the pitch.
    if (!this.settings.reducedMotion) {
      const contact = project(this.ball.x, 0, this.ball.z);
      this.turf?.explode(6 + Math.round(shot.power * 8), contact.x, contact.y);
      this.playImpactShake(70, 0.5 + shot.power * 0.45);
      // Hit-stop: the world holds for a couple of frames on the strike. It is
      // the cheapest way to make contact land as an impact rather than the ball
      // simply starting to move, and it scales with how hard it was struck.
      this.hitStopT = HIT_STOP_SECONDS * (0.6 + shot.power * 0.4);
    }
    if (Math.abs(shot.spin) > 0.45) Audio.whoosh(Math.abs(shot.spin));
    this.ball.kick(shot.vx, shot.vy, shot.vz, shot.spin);
    this.lastWallKnockdown = false;
    // Where this shot was headed before a wall or a keeper got involved. Solved
    // once, from the launch state, so it already contains the curl.
    const heading = this.ball.predictAt(this.zGoal);
    this.headingFor = heading?.reached ? { x: heading.x, y: heading.y } : null;
    const wallContext = {
      seed: `${this.level.id}:${this.attempt}`,
      attempt: this.attempt,
      levelId: this.level.id,
      vx: shot.vx,
      targetX: this.ball.predictAt(this.zWall)?.x,
      ball: this.ball
    };
    this.wall?.onStrike(wallContext);
    this.keepers.forEach((keeper) => keeper.onShot(this.ball, this.zGoal));
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
    // Pause and terminal cards intentionally freeze the simulated match. The
    // Scene remains active so keyboard/pointer UI and overlay tweens still work.
    if (this.state === 'PAUSED' || this.state === 'OVERLAY' || this.state === 'TRANSITIONING') return;

    // Step 3: Subtle slow ambient crowd shimmer (no distracting movement)
    if (this.crowdImage && !this.settings?.reducedMotion) {
      const shimmer = 0.96 + Math.sin(time * 0.0018) * 0.04;
      this.crowdImage.setAlpha(shimmer);
    }
    // Physics runs at a fixed cadence so the same gesture produces the same
    // shot at 30, 60, 120 Hz and after small browser stalls. The mode clock is
    // real-time based, including result cards; only an explicit pause freezes it.
    const rawDt = Math.min(Math.max(delta, 0), 250) / 1000;

    // Hit-stop takes precedence over everything: the world is stopped, briefly.
    // The restore is not optional - simSpeed is the accumulator's multiplier, so
    // leaving it at zero when the hold expires freezes the shot for good.
    if (this.hitStopT > 0) {
      this.hitStopT = Math.max(0, this.hitStopT - rawDt);
      if (this.hitStopT > 0) {
        this.simSpeed = 0;
        this.drawBall();
        this.drawAim();
        return;
      }
      this.simSpeed = 1;
    }

    // Timed bullet time: hold briefly, then ramp smoothly back to full speed.
    if (this.slowmoT > 0) {
      this.slowmoT = Math.max(0, this.slowmoT - rawDt);
      const ramp = 0.14;
      this.simSpeed = this.slowmoT > ramp
        ? 0.45
        : 0.45 + 0.55 * (1 - this.slowmoT / ramp);
      if (this.slowmoT === 0) this.simSpeed = 1;
    }

    if (this.updateArcadeClock(rawDt)) return;

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
      this.walls.forEach((wall) => wall.draw());
      this.keepers.forEach((keeper) => keeper.draw());
    }

    this.drawBall();
    this.drawAim();
    this.drawTutorialGhost(delta);
  }

  updateArcadeClock(rawDt) {
    if (this.mode !== 'arcade' || this.over || this.state === 'OVERLAY') return false;
    if (!this.arcadeStarted) {
      this.timerTxt?.setText(`${Math.max(Math.ceil(this.timeLeft), 0)}`);
      return false;
    }
    // Wall-clock seconds: cinematic slow motion and result cards never stretch
    // the advertised 60-second round. Explicit pause returns before this call.
    this.timeLeft -= rawDt;
    const secs = Math.max(Math.ceil(this.timeLeft), 0);
    this.timerTxt?.setText(`${secs}`);
    if (secs <= 10 && secs !== this.lastTickSecond) {
      this.lastTickSecond = secs;
      Audio.tick();
    }
    if (this.timeLeft > 0) return false;
    this.endArcade();
    return true;
  }

  startArcadeClock() {
    if (this.mode !== 'arcade' || this.arcadeStarted) return false;
    this.arcadeStarted = true;
    if (this.inputHint?.active) {
      this.tweens?.killTweensOf?.(this.inputHint);
      this.tweens?.add?.({
        targets: this.inputHint,
        alpha: 0,
        duration: 120,
        ease: 'Cubic.easeOut'
      });
    }
    return true;
  }

  simulate(dt, renderTime) {
    this.simTime += dt;
    this.updateConditions(dt);
    this.frameCollisionCooldown = Math.max(0, this.frameCollisionCooldown - dt);
    this.walls.forEach((wall) => wall.update(dt, this.simTime, {
      inFlight: this.state === 'FLIGHT',
      struck: this.state === 'FLIGHT' || this.state === 'RESULT'
    }));
    this.keepers.forEach((keeper) => keeper.update(dt, renderTime));
    if (this.netPhysics?.active) {
      this.netPhysics.update(dt);
      if (this.netPhysics.needsRedraw) this.netPhysics.draw(this.netBack, project, { alpha: 0.36 });
    }

    if (this.state === 'FLIGHT' || this.state === 'RESULT') {
      const vx = this.ball.vx;
      const vy = this.ball.vy;
      const vz = this.ball.vz;
      this.ball.update(dt);
      const snow = this.hazardMap.get('snow');
      if (snow && this.ball.flying) {
        const damping = Math.exp(-snow.drag * dt);
        this.ball.vx *= damping;
        this.ball.vy *= damping;
        this.ball.vz *= damping;
      }
      if (this.state === 'FLIGHT' && this.level.rings?.length) {
        this.ringProgress = updateRingProgress(
          this.ringProgress,
          this.level.rings,
          this.ball.prev,
          this.ball,
          {
            startZ: CAM.ballDist,
            goalZ: this.zGoal,
            goalWidth: this.goalWidth,
            goalHeight: this.goalHeight,
            ballRadius: BALL_R,
            forgiveness: RING_FORGIVENESS
          }
        );
        if (this.ringProgress.newlyCrossedIds.length || this.ringProgress.newlyMissedIds.length) {
          this.refreshRingVisuals();
          if (this.ringProgress.newlyCrossedIds.length) {
            // A thread is a small success and should sound and read like one.
            Audio.star(Math.min(this.ringProgress.count - 1, 2));
            this.showSwipeHintMessage(
              `THREAD ${this.ringProgress.count} ✓  ·  x${this.ringProgress.multiplier.toFixed(2)}`
            );
            const crossed = this.ringVisuals?.get(this.ringProgress.newlyCrossedIds.at(-1));
            if (crossed) this.impact.explode(10, crossed.centre.x, crossed.centre.y);
          }
        }
      }
      if (this.ball.inNet) this.checkNetContact(vx, vy, vz);
      else this.checkBoardRebound();
    }
    if (this.state === 'FLIGHT') {
      this.flightT += dt;
      this.checkFlight();
    }
  }

  /**
   * Balls that miss the goal come back off the hoardings.
   *
   * Anything wide or past the post used to sail out of the world entirely. The
   * boards are a physical backstop at `zBoards`, so a miss now thumps into the
   * advertising and rebounds onto the pitch. Presentation only: the shot's
   * outcome is already decided by the time the ball gets this far.
   */
  checkBoardRebound() {
    const ball = this.ball;
    if (!ball?.flying || this.boardStruck) return;
    if (!ball.crossed(this.zBoards)) return;

    const point = ball.pointAt(this.zBoards);
    // Over the top of the hoarding and into the crowd: nothing to hit.
    if (point.y > BOARD_HEIGHT) {
      this.boardStruck = true;
      return;
    }

    this.boardStruck = true;
    ball.z = this.zBoards - (BALL_R + 0.02);
    if (ball.prev) ball.prev.z = ball.z;
    ball.vz = -Math.abs(ball.vz) * 0.44;
    ball.vx *= 0.58;
    ball.vy = ball.vy * 0.35 - 0.6;
    ball.spin *= -0.3;

    const screen = project(point.x, point.y, this.zBoards);
    this.impact.explode(9, screen.x, screen.y);
    this.playImpactShake(80, 0.6);
    Audio.post('post');
    this.flashBoard(screen.x, screen.y, this.zBoards);
  }

  // A short bright panel where the ball struck, so the hoarding reads as the
  // thing that stopped it rather than the ball simply changing its mind.
  flashBoard(screenX, screenY, z) {
    if (this.settings.reducedMotion) return;
    const width = Math.max(6, (CAM.focal / z) * 1.4);
    const flash = this.add.rectangle(screenX, screenY, width, 8, 0xfff3c4, 0.85)
      .setDepth(1000 - z * 10 + 1);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleY: 0.4,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy()
    });
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
        speed: Math.max(Math.hypot(vx, vy, vz), (this.netEntrySpeed || 0) * 0.7) * 1.35,
        radius: 1.1
      });
      Audio.net();
      return;
    }

    if (!this.netSideRippled) {
      const sideLimit = this.goalWidth / 2 - BALL_R;
      const hitSide = Math.abs(ball.x) >= sideLimit - 1e-6 && vx * Math.sign(ball.x) > 1.2;
      const hitRoof = ball.y >= this.goalHeight - BALL_R - 1e-6 && vy > 1.2;
      if (hitSide || hitRoof) {
        this.netSideRippled = true;
        net.impact({
          x: hitSide ? Math.sign(ball.x) * (this.goalWidth / 2 - 0.5) : ball.x,
          y: hitRoof ? this.goalHeight * 0.9 : ball.y,
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

    // Every authored wall row is its own physical plane. This is what makes a
    // staggered double wall materially different instead of decorative clones.
    if (this.wall) {
      const planes = this.wall.getCollisionPlanes();
      if (ball.vz > 0.5) {
        for (const plane of planes) {
          if ((plane.z - ball.z) / ball.vz < 0.34 && plane.z > ball.z) this.wall.jump(plane.z);
        }
      }
      for (const plane of planes) {
        const planeKey = `row-${plane.row}`;
        if (this.wallPlanesChecked.has(planeKey)) continue;
        const crossing = sweepMovingZPlane(
          ball.prev,
          ball,
          Number.isFinite(plane.prevZ) ? plane.prevZ : plane.z,
          plane.z
        );
        if (!crossing) continue;
        this.wallPlanesChecked.add(planeKey);
        const pt = { x: crossing.x, y: crossing.y };
        if (this.wallClearanceY == null) this.wallClearanceY = pt.y;
        const wallContact = this.wall.contactAtZ(pt, plane.z);
        if (!wallContact) continue;
        this.lastWallKnockdown = Boolean(this.lastShot?.wallKnockdown);
        this.wall.impact(wallContact, pt, ball, { collapse: this.lastWallKnockdown });
        ball.vz *= -0.25;
        ball.vx = -ball.vx * 0.32 + Math.sign(pt.x - (this.wall.centerX || 0) || 1) * 0.9;
        ball.vy = Math.min(ball.vy * 0.4 + 1.5, 5);
        ball.spin = 0;
        const spos = project(pt.x, pt.y, crossing.planeZ);
        this.impact.explode(wallContact.part === 'leg' ? 11 : 8, spos.x, spos.y);
        this.playImpactShake(90, 0.72);
        Audio.save();
        this.resolve('WALL');
        return;
      }
    }

    // Keeper contact is resolved at the keeper's actual depth and against the
    // current animated body/hands, not retroactively at the goal line.
    for (const keeper of this.keepers) {
      if (this.keeperContactChecked.has(keeper)) continue;
      const crossing = sweepMovingZPlane(
        ball.prev,
        ball,
        Number.isFinite(keeper.fklPrevZ) ? keeper.fklPrevZ : keeper.z,
        keeper.z
      );
      if (!crossing) continue;
      this.keeperContactChecked.add(keeper);
      const pt = { x: crossing.x, y: crossing.y };
      const contact = keeper.contact(pt, ball);
      if (contact?.result === 'catch') {
        keeper.catchBall(pt);
        ball.flying = false;
        this.ballCaught = true;
        Audio.save();
        this.resolve('CAUGHT');
        return;
      }
      if (contact?.result === 'parry') {
        keeper.impact(pt, ball);
        ball.vz = -(6.5 + keeper.skill * 2);
        ball.vx += Math.sign(pt.x - keeper.x || keeper.diveDir) * (3.2 + keeper.skill * 1.8);
        ball.vy = Math.max(ball.vy * 0.25, 2.8);
        ball.spin *= -0.25;
        const spos = project(pt.x, pt.y, crossing.planeZ);
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
      if (p.reached && Math.abs(p.x) < this.goalWidth / 2 && p.y < this.goalHeight) {
        this.slowmoUsed = true;
        const nearPost = Math.abs(p.x) > this.goalWidth / 2 - 0.9;
        const underBar = p.y > this.goalHeight - 0.55;
        if (isTopCorner(p, this.goalWidth, this.goalHeight) || nearPost || underBar) {
          this.slowmoT = 0.4;
          this.simSpeed = 0.45;
        }
      }
    }

    const sweptFrame = sweepGoalFrame(ball, this.zGoal, {
      goalWidth: this.goalWidth,
      goalHeight: this.goalHeight,
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
        goalWidth: this.goalWidth,
        goalHeight: this.goalHeight,
        postRadius: POST_R,
        ballRadius: BALL_R
      });

      if (contact.frame && this.frameCollisionCooldown <= 0) {
        this.handleFrameImpact(contact, pt);
      } else if (contact.inFrame) {
        this.resolve('GOAL', pt);
      } else {
        this.resolve(this.frameTouched ? 'POST' : 'MISS', pt);
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
    if (contact?.frame) this.frameContacts.add(contact.frame);
    this.frameImpactT = this.simTime;
    this.frameCollisionCooldown = 0.045;
    reboundFromGoalFrame(this.ball, point, contact, this.zGoal, 0.72);
    const screen = project(point.x, point.y, point.z ?? this.zGoal);
    this.impact.explode(contact.frame === 'crossbar' ? 14 : 11, screen.x, screen.y);
    this.playImpactShake(110, contact.frame === 'crossbar' ? 1.05 : 0.82);
    Audio.post(contact.frame);

    // In off the post. The rebound parks the ball tangent to the frame and
    // rewrites ball.prev to match, so if that lands behind the goal line the
    // ordinary crossed(zGoal) test can never fire again - the goal went
    // unscored and the ball carried on through the netting. Settle it here,
    // at the contact, which is the only place that information still exists.
    const settled = classifyReboundPosition(this.ball, this.zGoal, {
      goalWidth: this.goalWidth,
      goalHeight: this.goalHeight,
      postRadius: POST_R,
      ballRadius: BALL_R
    });
    if (settled === 'goal') this.resolve('GOAL', { x: this.ball.x, y: this.ball.y });
  }

  resolve(outcome, pt) {
    // A scene transition or duplicate collision must never finish an old shot.
    // Phaser text textures are already released during shutdown, so letting a
    // late result write into the retired HUD can freeze the next match.
    if (this.state === 'RESULT' || this.state === 'OVERLAY' || this.state === 'PAUSED' ||
        this.state === 'TRANSITIONING' || !this.sys?.isActive?.()) return;
    this.state = 'RESULT';
    PlatformService.gameplayStop();
    this.simSpeed = 1;
    this.slowmoT = 0;
    // A result must never be left waiting behind a hit-stop.
    this.hitStopT = 0;
    this.swipe.enabled = false;

    let shotRating = scoreShot({
      outcome,
      point: pt,
      shot: this.lastShot,
      streak: outcome === 'GOAL' ? this.combo : 0,
      target: this.activeTarget,
      goalWidth: this.goalWidth,
      goalHeight: this.goalHeight
    });
    if (outcome === 'GOAL' && (this.ringProgress?.multiplier || 1) > 1) {
      const points = Math.round(shotRating.points * this.ringProgress.multiplier);
      shotRating = {
        ...shotRating,
        points,
        grade: points >= 2350 ? 'S' : points >= 1850 ? 'A' : points >= 1450 ? 'B' : 'C',
        label: `${shotRating.label} · hoops`,
        ringMultiplier: this.ringProgress.multiplier
      };
    }
    this.lastShotRating = shotRating;
    let isTopCorner = shotRating.topCorner;
    switch (outcome) {
      case 'GOAL': {
        this.netTouched = false;
        this.netSideRippled = false;
        this.netEntrySpeed = Math.hypot(this.ball.vx, this.ball.vy, this.ball.vz);
        this.ball.enterNet(this.zGoal + 2.15, {
          width: this.goalWidth,
          height: this.goalHeight
        });
        this.netFront?.setVisible(true);
        this.schedule(180, () => this.kicker?.celebrate(720));
        this.schedule(150, () => this.keepers.forEach((keeper) => keeper.reactToGoal()));
        const spos = project(pt.x, pt.y, this.zGoal);
        this.confetti.explode(this.trailStyle.mode === 'confetti' ? 92 : 48, spos.x, spos.y);
        this.showBanner(isTopCorner ? 'TOP BINS' : shotRating.grade === 'S' ? 'WORLD CLASS' : 'GOAL', '#f2c832');
        Audio.goal();
        this.playCrowdGoal();
        // The goal is the payoff, so it lands on the camera as well as the net.
        this.playImpactShake(180, isTopCorner ? 1.5 : 1.15);
        this.popScoreReadout();
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
        Audio.groan();
        break;
      case 'WALL':
        this.showBanner(this.lastWallKnockdown ? 'WALL FLATTENED!' : 'BLOCKED!', this.lastWallKnockdown ? '#f2c832' : '#ff8a65');
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

    this.showShotReadout(outcome, pt, shotRating);
    this.advanceTutorial(outcome);
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
      this.schedule(this.resultResetDelay(outcome, 1150), () => {
        if (!this.over) {
          this.restartCurrentLevel({
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
      this.schedule(this.resultResetDelay(outcome, 1400), () => this.showDailyComplete());
      return;
    }

    this.attempt++;
    const remaining = this.maxAttempts - this.attempt + 1;
    this.dailyShotsTxt?.setText(`${this.attempt}/${this.maxAttempts}`);
    this.schedule(550, () => this.showSwipeHintMessage(
      outcome === 'GOAL'
        ? `${rating.label.toUpperCase()}  ·  ${remaining} SHOTS LEFT`
        : `${remaining} SHOTS LEFT  ·  BUILD THE SCORE`
    ));
    this.schedule(this.resultResetDelay(outcome), () => this.resetAttempt());
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

    const advanced = evaluateAdvancedObjective({
      objective,
      outcome,
      point,
      shot,
      rating,
      target: this.activeTarget,
      targetHit: rating.targetHit,
      frameTouched: this.frameTouched,
      frameContacts: [...this.frameContacts],
      ringProgress: this.ringProgress,
      aimGuideHidden: this.aimGuideHidden,
      zoneHit: rating.targetHit ? this.activeTarget?.number : null,
      goalDimensions: this.goalDimensions
    });
    if (advanced.handled) {
      const finish = rating.topCorner
        ? 'top-corner'
        : Math.abs(shot.spin || 0) >= 0.34
          ? 'curve'
          : (shot.power ?? 0) >= 0.86
            ? 'power'
            : point?.y < 0.95 ? 'low' : 'placed';
      return { qualifies: advanced.qualifies, finish, reason: advanced.reason };
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
      else if (objective.type === 'power') reason = 'MORE POWER NEEDED — SWIPE FASTER';
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
    this.objectiveProgressTxt?.setText(`${Math.min(this.goalsThisLevel, needed)} / ${needed} TARGETS`);
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
      this.schedule(this.resultResetDelay(outcome, 1450), () => this.showLevelClear(stars));
      return;
    }

    this.attemptIcons[this.attempt - 1]?.setTint(0x4b5560).setAlpha(0.42);
    this.attempt++;
    const remaining = Math.max(this.maxAttempts - this.attempt + 1, 0);
    if (this.attempt > this.maxAttempts) {
      this.schedule(this.resultResetDelay(outcome, 1350), () => this.showLevelFailed());
    } else {
      const message = scored && !check.qualifies
        ? check.reason
        : scored ? `${this.goalsThisLevel}/${needed} DONE — ${remaining} SHOTS LEFT` : `${check.reason}  ·  ${remaining} LEFT`;
      this.schedule(550, () => this.showSwipeHintMessage(message));
      this.schedule(this.resultResetDelay(outcome), () => this.resetAttempt());
    }
  }

  resultResetDelay(outcome, minimum = 750) {
    if (outcome !== 'SAVE' && outcome !== 'CAUGHT') return minimum;
    const keeperHold = Math.max(
      minimum,
      ...this.keepers.map((keeper) => keeper.getResultHoldMs?.() || minimum)
    );
    return Math.max(minimum, Math.min(keeperHold, 1350));
  }

  resetAttempt() {
    if (this.state === 'OVERLAY') return;
    this.ball.reset(this.level.offsetX);
    this.ball.setGoalBounds(this.goalWidth, this.goalHeight);
    this.currentWind = getWindVectorAt(this.level.wind, this.simTime);
    this.ball.setWind(this.currentWind);
    this.ballCaught = false;
    this.keeperContactChecked = new Set();
    this.frameTouched = false;
    this.frameContacts = new Set();
    this.frameImpactT = null;
    this.frameCollisionCooldown = 0;
    this.netFront?.setVisible(false);
    this.netTouched = false;
    this.netSideRippled = false;
    this.boardStruck = false;
    this.netPhysics?.reset();
    if (this.netPhysics?.needsRedraw) this.netPhysics.draw(this.netBack, project, { alpha: 0.28 });
    this.ballSpr.setVisible(true);
    this.shadowSpr.setVisible(true);
    this.keepers.forEach((keeper) => {
      if (keeper.resetForNextAttempt) keeper.resetForNextAttempt();
      else keeper.reset();
      keeper.z = keeper.fklBaseZ;
      if (this.keeperConfig.type === 'boss') {
        keeper.skill = Math.min(
          (keeper.fklBaseSkill ?? keeper.skill) + (this.attempt - 1) * this.keeperConfig.adaptation,
          0.96
        );
      }
      keeper.draw();
    });
    this.hideShotReadout();
    this.kicker?.cancelSequence().setPose('idle');
    this.buildWall();
    this.ringVisuals?.forEach((visual) => this.destroyRingVisual(visual));
    // Progress has to be cleared before the gates are rebuilt, or the new
    // hoops would light up from the previous attempt's crossings.
    this.ringProgress = createRingProgress(
      this.level.rings,
      this.level.objective?.ringsRequired ?? this.level.rings?.length
    );
    this.drawRings();
    this.trailPts = [];
    this.trailGfx.clear();
    this.prevBallScreen = null;
    this.ballGhosts?.forEach((ghost) => ghost.spr.setVisible(false));
    this.simSpeed = 1;
    this.slowmoT = 0;
    this.hitStopT = 0;
    this.aimGuideHidden = false;
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
    this.showArcadeCompleteOverlay({
      score: this.score,
      goals: this.goals,
      best: SaveManager.getBestArcade(),
      reward: runReward
    });
    this.schedule(1150, () => this.requestNaturalBreakAd());
  }

  showArcadeCompleteOverlay({ score, goals, best, reward }) {
    if (this.terminalOverlayShown || this.transitioning || !this.sessionAlive) return;
    this.terminalOverlayShown = true;
    this.over = true;
    this.state = 'OVERLAY';
    this.swipe.enabled = false;
    this.swipe.cancel();
    this.cancelScheduledCalls();

    const overlayObjects = this.terminalOverlayObjects;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.84)
      .setDepth(2999).setInteractive();
    overlayObjects.push(dim);

    // Time Attack earns a dedicated broadcast-results card. The outer frame,
    // crest, three fast-scanning stat rows, and oversized rematch actions are
    // deliberately closer to an arcade cabinet result screen than the generic
    // career/daily terminal overlay.
    const chrome = this.add.graphics().setDepth(3000);
    drawPanel(chrome, 64, 31, 352, 211, {
      fill: 0x0d2236,
      border: PAL.goldDark,
      corner: PAL.gold,
      highlight: 0x31506a
    });

    // Double inset and clipped gold corners give the large slab enough detail
    // without depending on a resolution-specific bitmap frame.
    chrome.fillStyle(PAL.borderDark, 0.86);
    chrome.fillRect(70, 37, 340, 1);
    chrome.fillRect(70, 37, 1, 198);
    chrome.fillStyle(PAL.ink, 0.9);
    chrome.fillRect(70, 234, 340, 1);
    chrome.fillRect(409, 37, 1, 198);
    chrome.fillStyle(PAL.gold, 0.92);
    chrome.fillRect(73, 39, 8, 2);
    chrome.fillRect(399, 39, 8, 2);
    chrome.fillRect(73, 232, 8, 2);
    chrome.fillRect(399, 232, 8, 2);

    // Header rail pauses behind the ball crest, matching the visual rhythm of
    // the reference while using the player's currently equipped ball skin.
    chrome.fillStyle(PAL.goldDark, 1);
    chrome.fillRect(82, 35, 142, 3);
    chrome.fillRect(256, 35, 142, 3);
    chrome.fillStyle(PAL.gold, 1);
    chrome.fillRect(84, 34, 140, 1);
    chrome.fillRect(256, 34, 140, 1);

    const shieldOuter = [
      { x: 221, y: 22 }, { x: 228, y: 17 }, { x: 252, y: 17 }, { x: 259, y: 22 },
      { x: 259, y: 44 }, { x: 240, y: 58 }, { x: 221, y: 44 }
    ];
    const shieldGold = [
      { x: 224, y: 23 }, { x: 230, y: 20 }, { x: 250, y: 20 }, { x: 256, y: 23 },
      { x: 256, y: 42 }, { x: 240, y: 54 }, { x: 224, y: 42 }
    ];
    const shieldInner = [
      { x: 227, y: 25 }, { x: 232, y: 22 }, { x: 248, y: 22 }, { x: 253, y: 25 },
      { x: 253, y: 40 }, { x: 240, y: 50 }, { x: 227, y: 40 }
    ];
    chrome.fillStyle(PAL.ink, 1).fillPoints(shieldOuter, true);
    chrome.fillStyle(PAL.gold, 1).fillPoints(shieldGold, true);
    chrome.fillStyle(PAL.panel, 1).fillPoints(shieldInner, true);

    // Title divider and compact central star keep the hierarchy legible even
    // when the 480x270 canvas is scaled down to mobile landscape.
    chrome.fillStyle(PAL.borderDark, 0.95);
    chrome.fillRect(91, 91, 131, 1);
    chrome.fillRect(258, 91, 131, 1);
    chrome.fillStyle(PAL.panelHi, 0.9);
    chrome.fillRect(96, 89, 126, 1);
    chrome.fillRect(258, 89, 126, 1);

    drawPanel(chrome, 97, 99, 286, 83, {
      fill: 0x091a2a,
      border: PAL.borderDark,
      corner: 0x48627a,
      highlight: 0x274157
    });
    chrome.fillStyle(PAL.borderDark, 0.68);
    chrome.fillRect(103, 126, 274, 1);
    chrome.fillRect(103, 153, 274, 1);
    overlayObjects.push(chrome);

    const ballTexture = this.ballTexture || 'ball-classic';
    const crestBall = this.add.image(240, 34.5, ballTexture)
      .setDisplaySize(21, 21).setDepth(3002);
    const dividerStar = this.add.image(240, 90, 'icon-star')
      .setScale(0.62).setAlpha(0.72).setDepth(3002);
    overlayObjects.push(crestBall, dividerStar);

    const headline = titleText(this, GAME_W / 2, 69, "TIME'S UP!", '24px', '#f3c449')
      .setDepth(3002);
    overlayObjects.push(headline);

    const starIcon = this.add.image(121, 113, 'icon-star').setScale(1.12).setDepth(3002);
    const ballIcon = this.add.image(121, 140, ballTexture).setDisplaySize(15, 15).setDepth(3002);
    const coinIcon = this.add.image(121, 167, 'icon-coin').setScale(1.08).setDepth(3002);
    overlayObjects.push(starIcon, ballIcon, coinIcon);

    const statCopy = [
      bodyText(this, 139, 113, 'SCORE', {
        fontFamily: FONT, fontSize: '10px', color: '#f3e7c3'
      }),
      bodyText(this, 358, 113, String(score), {
        originX: 1, fontFamily: FONT, fontSize: '11px', color: '#f3c449'
      }),
      bodyText(this, 139, 140, 'GOALS', {
        fontFamily: FONT, fontSize: '10px', color: '#f3e7c3'
      }),
      bodyText(this, 256, 140, String(goals), {
        originX: 1, fontFamily: FONT, fontSize: '11px', color: '#f3c449'
      }),
      bodyText(this, 270, 140, '•', {
        originX: 0.5, fontFamily: FONT, fontSize: '9px', color: '#667b88'
      }),
      bodyText(this, 284, 140, 'BEST', {
        fontFamily: FONT, fontSize: '8px', color: '#f3e7c3'
      }),
      bodyText(this, 358, 140, String(best), {
        originX: 1, fontFamily: FONT, fontSize: '11px', color: '#f3c449'
      }),
      bodyText(this, 139, 167, `+${reward}`, {
        fontFamily: FONT, fontSize: '11px', color: '#f3c449'
      }),
      bodyText(this, 189, 167, 'COINS', {
        fontFamily: FONT, fontSize: '10px', color: '#f3e7c3'
      })
    ];
    statCopy.forEach((copy) => {
      copy.setDepth(3002);
      overlayObjects.push(copy);
    });

    const retry = makeButton(this, 168, 216, 136, 34, 'RETRY',
      () => this.restartCurrentLevel({ mode: 'arcade' }), {
        color: 0xb85818,
        hover: 0xd87828,
        pressed: 0x81340f,
        border: PAL.gold,
        highlight: 0xee9847,
        lowlight: 0x71300f,
        fontSize: '11px',
        hitHeight: 40
      }).setDepth(3003);
    const menu = makeButton(this, 312, 216, 136, 34, 'MENU',
      () => this.startScene('Menu'), {
        color: 0x315f8d,
        hover: 0x487fae,
        pressed: 0x234567,
        border: 0x86a9c9,
        highlight: 0x6191bd,
        lowlight: 0x1b3854,
        fontSize: '11px',
        hitHeight: 40
      }).setDepth(3003);
    overlayObjects.push(retry, menu);

    const cardObjects = overlayObjects.slice(1);
    if (!this.settings.reducedMotion) {
      cardObjects.forEach((object) => object.setAlpha?.(0));
      this.tweens.add({
        targets: cardObjects,
        alpha: 1,
        duration: 180,
        ease: 'Cubic.easeOut'
      });
    }
    this.announceStatus(`Time is up. Score ${score}. ${goals} goals. Best ${best}. ${reward} coins earned.`);
  }

  showDailyComplete() {
    if (this.over) return;
    this.over = true;
    this.state = 'OVERLAY';
    this.swipe.enabled = false;
    PlatformService.gameplayStop();
    const result = SaveManager.completeDaily(this.dailyDate, this.score, this.goals > 0);
    this.dailyCompletion = result;
    const buttons = [];
    if (result.completed && result.firstCompletion && result.reward > 0 && PlatformService.supportsAds()) {
      buttons.push({
        label: '2X COINS', color: PAL.green, hover: PAL.greenHi,
        cb: () => this.requestDailyBonus(result.reward)
      });
    } else {
      buttons.push({
        label: 'RETRY', color: PAL.blue, hover: PAL.blueHi,
        cb: () => this.restartCurrentLevel({ mode: 'daily', dailyDate: this.dailyDate })
      });
    }
    buttons.push({
      label: 'MISSIONS', color: PAL.goldDark, hover: PAL.gold,
      cb: () => this.startScene('Progress', { tab: 'daily' })
    });
    buttons.push({
      label: 'MENU', color: PAL.panelHi, hover: PAL.border,
      cb: () => this.startScene('Menu')
    });

    const rewardLine = !result.completed
      ? 'LAND A GOAL TO COMPLETE TODAY\'S KICK'
      : result.reward > 0
      ? `STREAK ${result.streak}  ·  +${result.reward} COINS`
      : `STREAK ${result.streak}  ·  DAILY REWARD CLAIMED`;
    this.showOverlay(result.completed ? 'DAILY COMPLETE' : 'DAILY ATTEMPT', [
      `SCORE ${this.score}  ·  BEST ${result.best}`,
      `${this.goals}/${this.maxAttempts} GOALS  ·  BEST SHOT ${this.bestShotScore}`,
      rewardLine
    ], buttons);
  }

  async requestDailyBonus(reward) {
    if (this.adRequestActive || !this.isSessionActive() || !PlatformService.supportsAds()) return;
    const token = this.sessionToken;
    this.adRequestActive = true;
    const wasMuted = Audio.muted;
    const blocker = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.28)
      .setDepth(4000).setInteractive();
    const status = bodyText(this, GAME_W / 2, GAME_H - 18, 'REWARD VIDEO', {
      originX: 0.5, fontFamily: FONT, fontSize: '7px', color: '#f3c449', letterSpacing: 0.5
    }).setDepth(4001);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (this.activeAdCleanup === cleanup) this.activeAdCleanup = null;
      this.adRequestActive = false;
      Audio.setMuted(Boolean(wasMuted || this.settings?.muted));
      if (blocker.active) blocker.destroy();
      if (status.active) status.destroy();
    };
    this.activeAdCleanup = cleanup;
    const shown = await this.awaitSessionTask(PlatformService.requestRewardedAd({
      onStarted: () => {
        if (!cleaned && token === this.sessionToken) Audio.setMuted(true);
      }
    }));
    const canContinue = this.isSessionActive(token) && this.state === 'OVERLAY';
    cleanup();
    if (!shown || !canContinue) return;
    const bonus = SaveManager.claimDailyBonus(this.dailyDate, reward);
    if (bonus.success) Audio.coin();
    this.startScene('Progress', { tab: 'daily' });
  }

  showLevelClear(stars) {
    this.state = 'OVERLAY';
    PlatformService.gameplayStop();
    const buttons = [];
    if (this.levelIndex + 1 < LEVELS.length) {
      buttons.push({
        label: 'NEXT >', color: 0x2e7d32, hover: 0x43a047,
        cb: () => this.restartCurrentLevel({ mode: 'career', levelIndex: this.levelIndex + 1 })
      });
    }
    buttons.push({
      label: 'REPLAY', color: 0x1976d2, hover: 0x2196f3,
      cb: () => this.restartCurrentLevel({ mode: 'career', levelIndex: this.levelIndex })
    });
    buttons.push({
      label: 'LEVELS', color: 0x37474f, hover: 0x546e7a,
      cb: () => this.startScene('LevelSelect')
    });
    const lines = [
      `${this.lastShotRating?.label || 'Objective complete'}  •  ${this.bestShotScore} pts`,
      `3★ MASTERY: ${Math.max(1, this.level.objective?.goals ?? 1)} SHOT${(this.level.objective?.goals ?? 1) === 1 ? '' : 'S'} · 2050+ PTS`,
      this.lastReward > 0 ? `+${this.lastReward} COINS EARNED` : 'BEST REWARD ALREADY CLAIMED'
    ];
    this.showOverlay('LEVEL CLEAR', lines, buttons, stars);
    this.schedule(1150, () => this.requestNaturalBreakAd());
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
        cb: () => this.restartCurrentLevel({ mode: 'career', levelIndex: this.levelIndex })
      },
      { label: 'LEVELS', color: 0x37474f, hover: 0x546e7a, cb: () => this.startScene('LevelSelect') }
    ]);
  }

  showOverlay(title, lines, buttons, stars = -1) {
    if (this.terminalOverlayShown || this.transitioning || !this.sessionAlive) return;
    this.terminalOverlayShown = true;
    this.over = true;
    this.state = 'OVERLAY';
    this.swipe.enabled = false;
    this.swipe.cancel();
    this.cancelScheduledCalls();
    const overlayObjects = this.terminalOverlayObjects;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, PAL.ink, 0.74)
      .setDepth(2999).setInteractive();
    overlayObjects.push(dim);

    const panel = this.add.graphics().setDepth(3000);
    drawPanel(panel, GAME_W / 2 - 145, 43, 290, 184, {
      fill: PAL.panel, border: PAL.goldDark, corner: PAL.gold
    });
    overlayObjects.push(panel);

    overlayObjects.push(titleText(this, GAME_W / 2, 73, title, '17px', '#f3c449').setDepth(3001));

    if (stars >= 0) {
      for (let i = 0; i < 3; i++) {
        const star = this.add.image(
          GAME_W / 2 + (i - 1) * 34,
          112,
          i < stars ? 'icon-star' : 'icon-star-empty'
        ).setDepth(3001).setScale(this.settings.reducedMotion ? 1 : 0.94);
        overlayObjects.push(star);
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

    // One wrapped text block keeps failure explanations inside the card at
    // every backing resolution. The former 11px unwrapped lines were wider
    // than the 250px panel and produced the broken Try Again screenshot.
    overlayObjects.push(bodyText(this, GAME_W / 2, stars >= 0 ? 150 : 123, lines.join('\n'), {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
      fontSize: '7px',
      color: '#cfe8ff',
      lineSpacing: 5,
      wordWrap: { width: 250, useAdvancedWrap: true }
    }).setDepth(3001));

    const buttonW = buttons.length >= 3 ? 82 : 112;
    const gap = 8;
    const totalW = buttons.length * buttonW + (buttons.length - 1) * gap;
    buttons.forEach((b, i) => {
      const button = makeButton(this,
        GAME_W / 2 - totalW / 2 + buttonW / 2 + i * (buttonW + gap), 203, buttonW, 26,
        b.label, b.cb, {
          color: b.color, hover: b.hover, border: i === 0 ? PAL.goldDark : PAL.borderDark,
          fontSize: '8px', hitHeight: 30
        }
      ).setDepth(3001);
      overlayObjects.push(button);
    });
  }

  async requestNaturalBreakAd() {
    if (this.state !== 'OVERLAY' || !this.isSessionActive() ||
        !PlatformService.supportsAds() || this.adRequestActive) return;
    const token = this.sessionToken;
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
      if (this.activeAdCleanup === cleanup) this.activeAdCleanup = null;
      this.adRequestActive = false;
      Audio.setMuted(Boolean(wasMuted || this.settings?.muted));
      if (blocker.active) blocker.destroy();
      if (status.active) status.destroy();
    };
    this.activeAdCleanup = cleanup;
    await this.awaitSessionTask(PlatformService.requestMidgameAd({
      onStarted: () => {
        if (!cleaned && token === this.sessionToken) Audio.setMuted(true);
      }
    }));
    cleanup();
  }

  // ---------------------------------------------------------------- drawing

  /**
   * How much of the ball texture is actually ball.
   *
   * The HD football is 57px wide but only 41px of that is opaque, so a keyline
   * drawn at half the sprite's display width lands a third of a ball outside
   * it. Cosmetic balls ship at different paddings, so this is measured from the
   * equipped texture once rather than hard-coded.
   */
  measureBallRadiusFraction(textureKey) {
    const source = this.textures.get(textureKey)?.getSourceImage?.();
    const width = source?.width;
    const height = source?.height;
    if (!width || !height) return 1;
    const row = Math.floor(height / 2);
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      const alpha = this.textures.getPixelAlpha(x, row, textureKey);
      if (alpha === null || alpha <= 16) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) return 1;
    return Phaser.Math.Clamp((last - first + 1) / width, 0.2, 1);
  }

  drawBall() {
    if (this.ballCaught) {
      this.ballSpr.setVisible(false);
      this.shadowSpr.setVisible(false);
      this.ballOutlineGfx?.clear();
      this.ballGlossGfx?.clear();
      this.ballGhosts?.forEach((ghost) => ghost.spr.setVisible(false));
      this.trailGfx.clear();
      return;
    }
    const b = this.ball;
    const pos = project(b.x, b.y, b.z);
    // A resting ball breathes very slightly. Purely visual: the physics body
    // never moves, so the swipe hit-test and the launch point are unaffected.
    if (this.state === 'AIMING' && !this.settings.reducedMotion) {
      this.ballIdlePhase += 0.05;
      pos.y += Math.sin(this.ballIdlePhase) * 0.35;
    } else {
      this.ballIdlePhase = 0;
    }
    const depth = 1000 - b.z * 10;
    // The ball is the subject of the shot, so it is allowed to read a little
    // larger than strict projection - just not so large it out-masses a player.
    const visualScale = this.ballVisualScale ?? 1;
    const ballScale = ((pos.s * BALL_R * 2) / (this.ballSpr.texture.source[0]?.width || 12)) * 0.66 * visualScale;
    this.ballSpr
      .setPosition(pos.x, pos.y)
      .setScale(ballScale)
      .setRotation(b.rot)
      .setDepth(depth);

    // Keyline and specular. Both are drawn from the projected radius so they
    // stay welded to the ball at every depth.
    const radius = Math.max(1.2, pos.s * BALL_R * 0.66 * (this.ballRadiusFraction ?? 1) * visualScale);
    if (this.ballOutlineGfx) {
      this.ballOutlineGfx.clear().setDepth(depth - 0.5)
        .fillStyle(0x071018, 0.8)
        .fillCircle(pos.x, pos.y, radius + 0.9);
    }
    if (this.ballGlossGfx) {
      this.ballGlossGfx.clear().setDepth(depth + 0.5)
        .fillStyle(0xffffff, 0.45)
        .fillCircle(pos.x - radius * 0.36, pos.y - radius * 0.4, Math.max(0.7, radius * 0.2));
    }

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

    // Grounding shadow. Tighter and darker than before so a resting ball is
    // visibly sitting on the turf rather than hovering over it.
    const sh = project(b.x, 0, b.z);
    const k = Phaser.Math.Clamp(1 - b.y * 0.1, 0.3, 1);
    // Sized from the ball's *visible* width, so it sits just proud of the ball
    // instead of spreading a slab of dark turf under it.
    const shadowWidth = sh.s * BALL_R * 2 * 0.66 * (this.ballRadiusFraction ?? 1) * 1.2 * visualScale * k;
    this.shadowSpr
      .setPosition(sh.x, sh.y)
      .setScale(shadowWidth / 10)
      .setAlpha(0.5 * k)
      .setDepth(depth - 1);

    // trail: fading pixel squares
    if (this.state === 'FLIGHT' || this.state === 'RESULT') {
      const snowTrail = Boolean(this.hazardMap.get('snow')?.trail);
      if (b.flying) {
        this.trailPts.push({ x: pos.x, y: pos.y, r: Math.max(pos.s * BALL_R, 1) });
        const maxTrail = snowTrail && !this.trailStyle.enabled ? 24 : this.trailStyle.samples;
        if (this.trailPts.length > maxTrail) this.trailPts.shift();
      }
      this.trailGfx.clear().setDepth(depth - 2);
      const n = this.trailPts.length;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        const sz = Math.max(this.trailPts[i].r * (0.4 + f * 0.8), 1);
        const color = snowTrail && !this.trailStyle.enabled
          ? mixColor(0xb9d8ef, 0xffffff, f)
          : mixColor(this.trailStyle.end, this.trailStyle.start, f);
        const alpha = f * (snowTrail && !this.trailStyle.enabled ? 0.52 : this.trailStyle.opacity);
        const trailX = this.trailPts[i].x;
        const trailY = this.trailPts[i].y;
        this.trailGfx.fillStyle(color, alpha);
        if (this.trailStyle.mode === 'diamond') {
          this.trailGfx.fillTriangle(trailX, trailY - sz, trailX + sz, trailY, trailX, trailY + sz);
          this.trailGfx.fillTriangle(trailX, trailY - sz, trailX - sz, trailY, trailX, trailY + sz);
        } else if (this.trailStyle.mode === 'aurora') {
          const previous = this.trailPts[i - 1];
          if (previous) {
            const dx = trailX - previous.x;
            const dy = trailY - previous.y;
            const length = Math.max(0.001, Math.hypot(dx, dy));
            const nx = -dy / length;
            const ny = dx / length;
            const offset = Math.max(0.65, sz * 0.42);
            const width = Math.max(1, sz * 0.24);
            this.trailGfx.lineStyle(width, color, alpha);
            this.trailGfx.lineBetween(
              previous.x + nx * offset, previous.y + ny * offset,
              trailX + nx * offset, trailY + ny * offset
            );
            this.trailGfx.lineStyle(width, mixColor(this.trailStyle.start, this.trailStyle.end, f), alpha * 0.82);
            this.trailGfx.lineBetween(
              previous.x - nx * offset, previous.y - ny * offset,
              trailX - nx * offset, trailY - ny * offset
            );
          }
        } else {
          const powerScale = this.trailStyle.mode === 'square' ? 0.7 + (this.lastShot?.power ?? 0.7) * 0.65 : 1;
          const drawSize = sz * powerScale;
          this.trailGfx.fillRect(trailX - drawSize / 2, trailY - drawSize / 2, drawSize, drawSize);
        }
      }
    }
  }

  /**
   * Sample the opening of the shot the current gesture would produce.
   *
   * This runs the real solver on a scratch ball, so the arc it draws already
   * contains gravity, drag, curl and the level's wind. That is what makes the
   * WIND readout mean something: change the gesture and the preview visibly
   * bends with the conditions instead of decorating the HUD.
   */
  previewTrajectory(shot, fraction = shot?.previewFraction ?? 0.55) {
    const sim = this.previewBall;
    if (!sim) return [];
    sim.setGoalBounds(this.goalWidth, this.goalHeight);
    sim.setWind(this.currentWind);
    sim.reset(this.ball.x);
    sim.kick(shot.vx, shot.vy, shot.vz, shot.spin);

    // Stop short of the goal on purpose: the player gets the shape of the
    // strike, never the finished answer to the level.
    const limitZ = CAM.ballDist + (this.zGoal - CAM.ballDist) * Phaser.Math.Clamp(fraction, 0.1, 0.9);
    const points = [];
    for (let step = 0; step < 90 && sim.flying && sim.z < limitZ; step++) {
      sim.step(FIXED_STEP * 2);
      if (step % 3) continue;
      const screen = project(sim.x, sim.y, sim.z);
      points.push({ x: screen.x, y: screen.y, s: screen.s });
    }
    return points;
  }

  /**
   * The aiming layer proper: opening arc, wind drift and the reticle where the
   * shot would meet the goal plane. Together these turn a bare swipe into an
   * aim you can commit to.
   */
  drawShotPreview(preview, guideAlpha, lineColor) {
    const gfx = this.previewGfx;
    if (!gfx?.active) return;
    gfx.setAlpha(Phaser.Math.Clamp(guideAlpha, 0.12, 1));

    const arc = this.previewTrajectory(preview);
    for (let i = 0; i < arc.length; i++) {
      const point = arc[i];
      // The first stretch is skipped and the dot size is capped. Sizing purely
      // by depth put the biggest, boldest markers right on top of the ball and
      // the swipe line - directly over the one place the player is looking.
      if (i < PREVIEW_ARC_SKIP) continue;
      const fade = 1 - i / Math.max(arc.length, 1);
      const size = Math.min(PREVIEW_DOT_MAX, Math.max(1, Math.round(point.s * BALL_R * 0.4)));
      gfx.fillStyle(0x071018, 0.34 * fade);
      gfx.fillRect(Math.round(point.x - size / 2) - 1, Math.round(point.y - size / 2) - 1, size + 2, size + 2);
      gfx.fillStyle(lineColor, 0.2 + 0.34 * fade);
      gfx.fillRect(Math.round(point.x - size / 2), Math.round(point.y - size / 2), size, size);
    }

    // Where this shot actually arrives. Drawn as a reticle on the goal plane so
    // the wall, keeper and hoops can all be judged against it. Reduced assist
    // keeps the arc off the ball and stops here - the player reads the flight
    // for themselves rather than being told the destination.
    if (this.aimAssist === 'reduced') return;
    const landing = this.previewBall?.predictAt?.(this.zGoal);
    if (landing?.reached) {
      const hit = project(landing.x, landing.y, this.zGoal);
      const r = Math.max(3, hit.s * 0.34);
      const inFrame = Math.abs(landing.x) <= this.goalWidth / 2 &&
        landing.y >= 0 && landing.y <= this.goalHeight;
      const color = inFrame ? 0xf3e7c3 : 0xff8a65;
      gfx.lineStyle(2, 0x071018, 0.45);
      gfx.strokeCircle(hit.x, hit.y, r + 1);
      gfx.lineStyle(1, color, 0.75);
      gfx.strokeCircle(hit.x, hit.y, r);
      gfx.fillStyle(color, 0.8);
      gfx.fillRect(Math.round(hit.x) - 1, Math.round(hit.y) - 1, 2, 2);

      // Wind tell: a short arrow off the reticle in the direction the air is
      // pushing, sized by strength.
      const wind = this.currentWind;
      const strength = Math.min(wind?.magnitude ?? 0, 1.2);
      if (strength >= 0.08) {
        const length = 4 + strength * 7;
        const dirX = Math.sign(wind.x) || 0;
        const dirY = -Math.sign(wind.y) || 0;
        const tipX = hit.x + dirX * (r + 3 + length);
        const tipY = hit.y + dirY * (r + 3 + length);
        gfx.lineStyle(1, 0x74bde8, 0.6);
        gfx.lineBetween(hit.x + dirX * (r + 3), hit.y + dirY * (r + 3), tipX, tipY);
        gfx.fillStyle(0x74bde8, 0.7);
        gfx.fillRect(Math.round(tipX) - 1, Math.round(tipY) - 1, 2, 2);
      }
    }
  }

  drawAim() {
    this.aimGfx.clear().setAlpha(1);
    this.previewGfx?.clear();
    const pts = this.state === 'AIMING' ? this.swipe.activePath : [];
    const rawPreview = pts.length >= 2 ? computeShotFromPath(pts, { preview: true }).shot : null;
    const preview = rawPreview ? this.prepareShot(rawPreview, { preview: true }) : null;
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

    let guideAlpha = 1;
    const pressure = this.hazardMap.get('crowd-pressure');
    if (pressure) {
      const cycle = 0.5 + 0.5 * Math.sin(this.simTime * pressure.pulseSpeed * Math.PI * 2);
      const visibleWindow = cycle <= pressure.aimWindowScale;
      guideAlpha *= visibleWindow ? 1 : 0.22;
    }
    const glare = this.hazardMap.get('glare');
    const fadeCorner = this.level.shotRules?.aimFadeCorner || glare?.corner;
    if (fadeCorner) {
      const travelTime = Math.max((this.zGoal - CAM.ballDist) / Math.max(preview.vz, 0.1), 0);
      const predictedX = this.level.offsetX + preview.vx * travelTime;
      const targetSide = fadeCorner.includes('left') ? -1 : 1;
      const horizontal = Math.abs(predictedX / Math.max(this.goalWidth / 2, 0.1) - targetSide);
      const vertical = fadeCorner.includes('top') ? Math.abs(loft - 0.85) : Math.abs(loft - 0.18);
      const proximity = Phaser.Math.Clamp(1 - Math.hypot(horizontal, vertical) / 0.78, 0, 1);
      guideAlpha *= 1 - proximity * (glare?.strength ?? 0.62) * 0.88;
    }
    this.aimGfx.setAlpha(Phaser.Math.Clamp(guideAlpha, 0.12, 1));
    this.meterUi?.forEach((label) => label.setAlpha(Phaser.Math.Clamp(guideAlpha + 0.18, 0.3, 1)));

    if (!preview.aimGuideHidden && this.aimAssist !== 'off') {
      this.drawShotPreview(preview, guideAlpha, lineColor);
    }

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
    // Slippery run-up: the band is how much the footing can take off or add.
    if (preview.powerJitterRange > 0) {
      const lo = Phaser.Math.Clamp(power - preview.powerJitterRange, 0, 1);
      const hi = Phaser.Math.Clamp(power + preview.powerJitterRange, 0, 1);
      this.aimGfx.fillStyle(0xff8a65, 0.5);
      this.aimGfx.fillRect(meterX + Math.round(94 * lo), meterY - 2, Math.max(1, Math.round(94 * (hi - lo))), 9);
    }
    const maxPower = Phaser.Math.Clamp(this.level.shotRules?.maxPower ?? 1, 0.45, 1);
    if (maxPower < 1) {
      const capX = meterX + Math.round(94 * maxPower);
      this.aimGfx.fillStyle(0xff8a65, 1);
      this.aimGfx.fillRect(capX - 1, meterY - 2, 2, 9);
    }
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
