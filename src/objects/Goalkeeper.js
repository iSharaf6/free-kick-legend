import { project, GOAL_W, GOAL_H, BALL_R, PHYS } from '../config.js';
import {
  getKeeperMove,
  KEEPER_BAKED_BALL_FRAMES,
  KEEPER_CATCH_PHASES,
  KEEPER_DISTRIBUTION_IDS,
  KEEPER_PLAN_PRESENTATION,
  KEEPER_SAVE_PHASES
} from '../data/keeperMoveset.js';

// The keeper is the only defender the player has to read at a glance, so he is
// authored slightly taller than the wall he stands behind. Below 1.9m he
// disappeared into the wall silhouette entirely.
const KEEPER_H = 2.02;
const DIVE_H = 1.41;
const GROUND_Y = 0;         // visual root height above the pitch
const KEEPER_ANIMATION_TEXTURE = 'keeper-anim-hd';
const KEEPER_RECOVERY_TEXTURE = 'keeper-practical-recovery-hd';
const KEEPER_DIVE_MOTION_TEXTURE = 'keeper-dive-motion-hd';
const KEEPER_FOOTWORK_TEXTURE = 'keeper-footwork-hd';
const KEEPER_RETURN_TEXTURE = 'keeper-return-hd';
const KEEPER_LOW_SAVE_TEXTURE = 'keeper-low-save-hd';
const KEEPER_HANDLING_TEXTURE = 'keeper-handling-hd';
const KEEPER_HIGH_CLAIM_TEXTURE = 'keeper-high-claim-hd';
const KEEPER_SITUATIONAL_TEXTURE = 'keeper-situational-punch-hd';
const SAVE_FAMILY_TEXTURES = Object.freeze({
  'low-smother': 'keeper-low-smother-hd',
  'mid-catch': 'keeper-mid-catch-hd',
  'upper-parry': 'keeper-upper-parry-hd',
  'top-tip': 'keeper-top-tip-hd',
  'reflex-foot': 'keeper-reflex-foot-hd'
});
const DIRECTIONAL_PRACTICAL_MOVES = Object.freeze({
  'full-stretch': Object.freeze({ left: 'full-stretch-dive-left', right: 'full-stretch-dive-right' }),
  'low-dive': Object.freeze({ left: 'low-dive-left', right: 'low-dive-right' }),
  'mid-dive': Object.freeze({ left: 'mid-height-dive-left', right: 'mid-height-dive-right' }),
  'top-tip': Object.freeze({ left: 'top-left-fingertip-tip', right: 'top-right-fingertip-tip' }),
  'upper-parry': Object.freeze({ left: 'upper-parry-left', right: 'upper-parry-right' }),
  'low-parry': Object.freeze({ left: 'low-parry-left', right: 'low-parry-right' }),
  'low-catch': Object.freeze({ left: 'low-catch-left', right: 'low-catch-right' }),
  'mid-catch': Object.freeze({ left: 'mid-catch-left', right: 'mid-catch-right' }),
  'low-smother': Object.freeze({ left: 'smother-left', right: 'smother-right' }),
  'reflex-foot': Object.freeze({ left: 'foot-save-left', right: 'foot-save-right' })
});
// A dive plan can only be built for a centre or catch-only family when a
// close shot reaches the keeper mid-read (impact()). Those clips are standing
// catches with a baked-in ball, so the dive presents a ball-free counterpart.
const PLAN_FAMILY_FALLBACK = Object.freeze({
  'front-smother': 'low-parry',
  'low-catch': 'low-parry',
  'high-claim': 'upper-parry',
  'jump-catch': 'upper-parry'
});
const CENTRE_PRACTICAL_MOVES = Object.freeze({
  'front-smother': 'front-smother',
  'spread-save': 'spread-save',
  'high-claim': 'high-claim-standing',
  'jump-catch': 'jump-catch-cross-claim'
});
// The ready/idle sheet is packed at its source scale: its balanced stance
// (frame 0) is 231px tall. Every frame of that sheet shares this one height so
// crouches, the ready bounce and the overhead claim keep their authored size.
// Normalising each frame to its own bounding box erased the bounce (the head
// never moved) and pulsed the whole keeper 6-19% instead.
const KEEPER_ANIM_REFERENCE_H = 231;
const KEEPER_DIVE_REFERENCE_H = 180;
const KEEPER_RECOVERY_REFERENCE_H = 205;
// scripts/build_hd_sprites.py packs every gameplay keeper sheet at ONE scale
// per sheet with its ready stance 205px tall, so one reference height keeps
// the body the same size through every save.
const KEEPER_MOTION_REFERENCE_H = 205;
const KEEPER_RETURN_REFERENCE_H = 205;
const KEEPER_LOW_SAVE_REFERENCE_H = 205;
const KEEPER_HANDLING_REFERENCE_H = 205;
const KEEPER_ACTION_REFERENCE_H = 205;
const TEXTURE_REFERENCE_H = Object.freeze({ 'keeper-anim-hd': KEEPER_ANIM_REFERENCE_H });
const referenceHeightFor = (texture) => TEXTURE_REFERENCE_H[texture] ?? KEEPER_ACTION_REFERENCE_H;
// Upright follow-throughs are already standing: once the ball is dealt with
// they only need a beat before the jog back instead of a full turf recovery.
const UPRIGHT_RECOVERY_DURATION = 0.2;
const RETURN_STRIDE_METRES = 0.14;
// Physical hands lead the dive root by this much (see onShot desiredRootX).
const DIVE_HAND_LEAD = 0.59;
// Glove centre (metres from the sprite root) for held-ball frames whose art
// shows empty, clasped gloves, so the scene can draw the real ball in them.
const HELD_GLOVE_POINTS = Object.freeze({
  'keeper-anim-hd': Object.freeze({ 15: [0.17, 0.4], 16: [0.23, 0.73], 17: [0.02, 1.34], 18: [-0.02, 2.05] })
});
const HELD_CHEST_POINT = Object.freeze([0, 1.15]);
const IDLE_FRAME_SECONDS = (getKeeperMove('idle-stance')?.frameMs ?? 520) / 1000;
const READY_FRAME_SECONDS = (getKeeperMove('ready-set')?.frameMs ?? 130) / 1000;
const GROUND_RECOVERY_DURATION = 0.86;
const GROUND_IMPACT_HOLD = 0.06;
const CONTACT_PROGRESS = 0.68;
const CONTACT_HOLD_DURATION = 0.058;
// Scheduled-contact pose is held until this dive progress if the ball is late.
const CONTACT_HOLD_PROGRESS = 0.8;
const RETURN_SPEED = 3.4;
const RETURN_ACCELERATION = 18;
const TRACK_ACCELERATION = 14;
const STANDING_SAVE_REACH = 0.42;
const LOW_SAVE_MAX_Y = 1.02;
const SITUATIONAL_SAVE_FAMILIES = Object.freeze([
  'narrow-block',
  'spread-save',
  'body-block',
  'two-fist-punch',
  'single-hand-punch-left',
  'single-hand-punch-right'
]);
const GROUNDED_PRACTICAL_FAMILIES = Object.freeze([
  'low-smother', 'low-catch', 'low-parry', 'low-dive', 'reflex-foot', 'spread-save'
]);
const SITUATIONAL_SAVE_FRAMES = Object.freeze({
  'narrow-block': Object.freeze([0, 1, 2, 5]),
  'spread-save': Object.freeze([0, 1, 2, 3, 4, 5]),
  'body-block': Object.freeze([1, 2, 3, 5]),
  'two-fist-punch': Object.freeze([6, 7, 8, 9, 10, 11]),
  'single-hand-punch-left': Object.freeze([12, 13, 14, 15, 16, 17]),
  'single-hand-punch-right': Object.freeze([18, 19, 20, 21, 22, 23])
});
// The authored ready-set bounce, played while the striker runs in.
const BRACE_MOVE = getKeeperMove('ready-set');
const BRACE_FRAMES = Object.freeze(BRACE_MOVE?.frames?.length ? [...BRACE_MOVE.frames] : [2, 4]);
const BRACE_FRAME_SECONDS = (BRACE_MOVE?.frameMs ?? 130) / 1000 * 0.85;
const KEEPER_FRAMES = Object.freeze({
  idle: Object.freeze([0, 1, 0, 3]),
  anticipate: 2,
  set: 4,
  // The atlas is authored from the fixed camera view: row two reaches
  // screen-right and row three reaches screen-left.
  diveLeft: 10,
  diveRight: 5,
  lowScoop: 15,
  lowKneel: 16,
  chestCatch: 17,
  highCatch: 18,
  recovery: 19
});
const STYLE_PROFILES = Object.freeze({
  training: Object.freeze({ reaction: 1.18, error: 1.22, read: -0.06, speed: 0.9, set: 1.08 }),
  calm: Object.freeze({ reaction: 1.06, error: 1.02, read: 0, speed: 0.96, set: 1 }),
  balanced: Object.freeze({ reaction: 1, error: 1, read: 0, speed: 1, set: 1 }),
  'late-dive': Object.freeze({ reaction: 1.12, error: 0.82, read: 0.04, speed: 1.08, set: 0.95 }),
  'line-reader': Object.freeze({ reaction: 0.96, error: 0.78, read: 0.08, speed: 1, set: 0.92 }),
  aggressive: Object.freeze({ reaction: 0.88, error: 1.08, read: -0.02, speed: 1.12, set: 0.82 }),
  anticipator: Object.freeze({ reaction: 0.84, error: 0.72, read: 0.1, speed: 1.08, set: 0.86 }),
  legend: Object.freeze({ reaction: 0.8, error: 0.62, read: 0.12, speed: 1.14, set: 0.82 }),
  boss: Object.freeze({ reaction: 0.76, error: 0.54, read: 0.14, speed: 1.18, set: 0.78 })
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function travellingEase(value) {
  const t = clamp(value, 0, 1);
  // Keeps non-zero end velocity so flight flows into descent/slide instead of
  // stopping at full extension and dropping vertically.
  return t + Math.sin(Math.PI * t) * 0.10;
}

function spriteFrameHeight(sprite) {
  return sprite?.frame?.realHeight ||
    sprite?.frame?.height ||
    sprite?.texture?.source?.[0]?.height ||
    1;
}

function ellipseDistance(point, shape) {
  return Math.hypot(
    (point.x - shape.x) / shape.rx,
    (point.y - shape.y) / shape.ry
  );
}

export function classifySaveFamily({ y = 1, speed = 20, lateral = 1 } = {}) {
  if (y < 0.58 && speed >= 23.5 && lateral <= 1.55) return 'reflex-foot';
  if (speed >= 25.5 && lateral <= 0.92 && y < 1.45) return 'spread-save';
  if (lateral <= 0.38) {
    if (y < 0.58 && speed < 21.5) return 'front-smother';
    if (y < 0.86) return speed < 23 ? 'low-catch' : 'low-parry';
    if (y < 1.55) return speed >= 24 ? 'upper-parry' : 'mid-catch';
    if (y < 1.98) return speed >= 24 ? 'upper-parry' : 'high-claim';
    return speed >= 24 ? 'top-tip' : 'jump-catch';
  }
  if (y < 0.64 && speed < 21.5) return 'low-smother';
  if (y < 0.82) return speed >= 24.5 ? 'low-parry' : 'low-dive';
  if (y < 1.38) return speed < 21.5 ? 'mid-catch' : 'mid-dive';
  if (y >= 2.02) return 'top-tip';
  if (lateral >= 1.25) return 'full-stretch';
  if (y < 2.02) return 'upper-parry';
  return 'top-tip';
}

function practicalMoveIdForFamily(family, direction, standing = false) {
  if (family === 'mid-catch' && standing) return 'mid-catch-centre';
  const centre = CENTRE_PRACTICAL_MOVES[family];
  if (centre) return centre;
  const pair = DIRECTIONAL_PRACTICAL_MOVES[family];
  if (!pair) return null;
  return direction < 0 ? pair.left : pair.right;
}

function defaultSeed(skill, zGoal) {
  let seed = (Math.round(skill * 1_000_000) ^ Math.round(zGoal * 10_000) ^ 0x9e3779b9) >>> 0;
  if (seed === 0) seed = 0x6d2b79f5;
  return seed;
}

// Goalkeeper with deterministic perception and a physical pose-dependent save
// envelope. Rendered entirely with the authored HD sprites: ready crouch,
// full-stretch dive along an arc, a hard landing that leaves him on the turf,
// then getting up and jogging back to his line.
export class Goalkeeper {
  constructor(scene, skill, zGoal, randomOptions = {}) {
    this.scene = scene;
    const options = typeof randomOptions === 'function' ? { rng: randomOptions } : randomOptions;
    this.skill = clamp(Number(skill) || 0, 0, 1);
    this.z = zGoal - 0.4;
    this.rng = typeof options.rng === 'function' ? options.rng : null;
    this.reducedMotion = Boolean(options.reducedMotion);
    this.style = STYLE_PROFILES[options.style] ? options.style : 'balanced';
    this.profile = STYLE_PROFILES[this.style];
    this.seed = (options.seed ?? defaultSeed(this.skill, zGoal)) >>> 0;
    this.destroyed = false;
    this.flashTimer = null;

    this.goalWidth = Number.isFinite(options.goalWidth) && options.goalWidth > 0
      ? options.goalWidth
      : GOAL_W;
    this.goalHeight = Number.isFinite(options.goalHeight) && options.goalHeight > 0
      ? options.goalHeight
      : GOAL_H;
    this.halfGoal = this.goalWidth / 2;
    this.homeX = clamp(
      Number(options.homeX) || 0,
      -this.halfGoal + 0.55,
      this.halfGoal - 0.55
    );
    this.x = this.homeX;
    this.moveVx = 0;
    this.pose = 'idle';
    this.state = 'idle';
    this.stateT = 0;
    this.idleClock = 0;
    this.reactT = 0;
    this.setT = 0;
    this.diveDuration = 0.36;
    this.diveP = 0;
    this.diveStartX = this.homeX;
    this.contactRootX = this.homeX;
    this.landingRootX = this.homeX;
    this.visualLift = 0;
    this.diveHandY = 0.95;
    this.diveVy = 0;
    this.contactLift = 0;
    this.contactHoldT = 0;
    this.contactRegistered = false;
    this.pendingLandImpulse = 0;
    this.targetX = this.homeX;
    this.moveTargetX = this.homeX;
    this.trackTargetX = this.homeX;
    this.targetY = 1;
    this.shotX = this.homeX;
    this.shotY = 1;
    this.shotSpeed = 20;
    this.maxHandY = 2;
    this.maxDiveRootTravel = 0;
    this.saveFamily = 'mid-catch';
    this.activeSaveMoveId = null;
    // Atlas locked for the duration of one save; see buildSavePlan().
    this.savePlan = null;
    this.diveDir = 1;
    this.catchY = 1;
    this.landY = GROUND_Y;
    this.landVy = 0;
    this.grounded = false;
    this.contactPulse = 0;
    this.footworkDistance = 0;
    this.returnDirection = 0;
    this.catchType = 'chest';
    this.catchDuration = 0.82;
    this.catchSecureT = 0.46;
    this.catchDistributed = false;
    this.hasBall = false;
    this.distributionId = KEEPER_DISTRIBUTION_IDS[0];
    this.presentationAction = null;
    this.presentationT = 0;
    this.presentationDuration = 0;
    this.hasOrganisedWall = false;
    this.standingSave = false;
    this.idlePhase = this._random() * Math.PI * 2;
    this.refreshTextureAvailability();
    const initialTexture = this.hasAnimationAtlas
      ? KEEPER_ANIMATION_TEXTURE
      : (scene.textures?.exists?.('keeper-hd') ? 'keeper-hd' : 'keeper');
    const initialFrame = this.hasAnimationAtlas ? KEEPER_FRAMES.idle[0] : undefined;
    this.spr = scene.add.sprite(0, 0, initialTexture, initialFrame);
    // One-frame afterimage used to smear the explosive first half of a dive.
    this.ghost = scene.add.sprite(0, 0, initialTexture, initialFrame);
    this.ghost.setVisible?.(false);
    this.prevDraw = null;
    this.draw();
  }

  refreshTextureAvailability() {
    const exists = (texture) => Boolean(this.scene?.textures?.exists?.(texture));
    this.hasAnimationAtlas = exists(KEEPER_ANIMATION_TEXTURE);
    this.hasRecoveryAtlas = exists(KEEPER_RECOVERY_TEXTURE);
    this.hasDiveMotionAtlas = exists(KEEPER_DIVE_MOTION_TEXTURE);
    this.hasFootworkAtlas = exists(KEEPER_FOOTWORK_TEXTURE);
    this.hasReturnAtlas = exists(KEEPER_RETURN_TEXTURE);
    this.hasLowSaveAtlas = exists(KEEPER_LOW_SAVE_TEXTURE);
    this.hasHandlingAtlas = exists(KEEPER_HANDLING_TEXTURE);
    this.hasHighClaimAtlas = exists(KEEPER_HIGH_CLAIM_TEXTURE);
    this.hasSituationalAtlas = exists(KEEPER_SITUATIONAL_TEXTURE);
    this.hasSaveFamilyAtlas = Object.fromEntries(
      Object.entries(SAVE_FAMILY_TEXTURES).map(([family, texture]) => [family, exists(texture)])
    );
    return this;
  }

  _random() {
    if (this.rng) return clamp(Number(this.rng()) || 0, 0, 1);
    let x = this.seed || 0x6d2b79f5;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 0x100000000;
  }

  setRandomSource(rng) {
    this.rng = typeof rng === 'function' ? rng : null;
    return this;
  }

  // The striker has started his run-up: the keeper comes up onto his toes
  // with the authored ready-set bounce until the ball is struck.
  brace() {
    if (this.destroyed || this.state !== 'idle' || this.presentationAction) return this;
    this.braced = true;
    this.braceClock = 0;
    return this;
  }

  onShot(ball, zGoal) {
    this.hasBall = false;
    this.braced = false;
    const interceptZ = this.z > ball.z ? this.z : zGoal;
    const prediction = ball.predictAt(interceptZ);
    const flightT = Number.isFinite(prediction.T) ? prediction.T : 0.6;

    // Keeper reads are deterministic. Skill changes what the keeper can read,
    // track and physically reach; identical shots never roll a different save.
    const curl = 0.5 * ball.spin * PHYS.magnus * Math.max(ball.vz, 0) * flightT * flightT;
    const curlRead = clamp(0.56 + this.skill * 0.34 + this.profile.read, 0.44, 0.96);
    this.shotX = clamp(prediction.x, -this.halfGoal + 0.2, this.halfGoal - 0.2);
    this.shotY = clamp(prediction.y, 0.2, this.goalHeight - 0.18);
    this.shotSpeed = Math.hypot(
      Number(ball.vx) || 0,
      Number(ball.vy) || 0,
      Number(ball.vz) || 0
    );
    this.maxHandY = clamp(
      1.55 + this.skill * 0.66 + clamp((flightT - 0.55) * 0.16, 0, 0.18),
      1.55,
      2.42
    );
    this.targetX = clamp(
      prediction.x - curl * (1 - curlRead),
      -this.halfGoal + 0.35,
      this.halfGoal - 0.35
    );
    this.targetY = clamp(Math.min(prediction.y, this.maxHandY), 0.28, this.goalHeight - 0.28);
    const shotDeltaX = prediction.x - this.x;
    this.diveDir = Math.abs(shotDeltaX) > 0.18
      ? (shotDeltaX >= 0 ? 1 : -1)
      : (this.targetX >= this.x ? 1 : -1);
    this.saveFamily = classifySaveFamily({
      y: prediction.y,
      speed: this.shotSpeed,
      lateral: Math.abs(shotDeltaX)
    });
    this.standingSave = Math.abs(shotDeltaX) <= STANDING_SAVE_REACH &&
      this.saveFamily !== 'spread-save';
    this.activeSaveMoveId = practicalMoveIdForFamily(
      this.saveFamily,
      this.diveDir,
      this.standingSave
    );
    // Commit to one sprite sheet for this entire save. Later reclassification
    // in catchBall()/impact() may still refine saveFamily for scoring and
    // contact geometry, but the rendered atlas no longer changes underneath a
    // dive that is already in the air.
    this.savePlan = this.buildSavePlan();

    // Time the contact pose to the ball's actual keeper-plane crossing. Slow
    // shots create more visible tracking footwork; fast shots compress the
    // read without making the keeper complete his dive before the ball arrives.
    this.setT = (0.055 + (1 - this.skill) * 0.045) * this.profile.set;
    this.diveDuration = (0.40 + (1 - this.skill) * 0.08) / Math.sqrt(this.profile.speed);
    const minimumRead = (0.11 + (1 - this.skill) * 0.13) * this.profile.reaction;
    const scheduledRead = flightT - this.setT -
      (this.standingSave ? 0 : this.diveDuration * CONTACT_PROGRESS);
    this.reactT = Math.max(scheduledRead, minimumRead);
    const desiredRootX = this.standingSave
      ? this.targetX
      : this.targetX - this.diveDir * 0.59;
    const trackSpeed = (1.30 + this.skill * 1.15) * this.profile.speed;
    const availableTrackT = Math.max(0, this.reactT - minimumRead * 0.55);
    const maxTrackTravel = trackSpeed * availableTrackT;
    this.trackTargetX = clamp(
      desiredRootX,
      Math.max(-this.halfGoal + 0.55, this.x - maxTrackTravel),
      Math.min(this.halfGoal - 0.55, this.x + maxTrackTravel)
    );
    this.moveTargetX = this.trackTargetX;
    const diveRootSpeed = (2.15 + this.skill * 1.55) * this.profile.speed;
    this.maxDiveRootTravel = diveRootSpeed * this.diveDuration * CONTACT_PROGRESS;
    this.state = 'read';
    this.pose = 'ready';
    this.stateT = 0;
    this.diveP = 0;
    this.moveVx = 0;
    this.visualLift = 0;
    this.diveHandY = 0.95;
    this.contactLift = clamp(this.targetY - 0.86, 0.03, 1.46);
    this.contactHoldT = 0;
    this.contactRegistered = false;
    this.pendingLandImpulse = 0;
    this.footworkDistance = 0;
    this.catchDistributed = false;
    this.presentationAction = null;
    this.presentationT = 0;
    this.presentationDuration = 0;
  }

  update(dt, _time = 0) {
    if (this.destroyed) return;
    let boundedDt = 0;
    if (Number.isFinite(dt) && dt > 0) {
      boundedDt = Math.min(dt, PHYS.maxFrameDt);
      const steps = Math.min(
        PHYS.maxSubsteps,
        Math.max(1, Math.ceil(boundedDt / PHYS.fixedStep - 1e-8))
      );
      const stepDt = boundedDt / steps;
      for (let i = 0; i < steps; i++) this._step(stepDt);
    }
    this.draw();
  }

  _step(dt) {
    this.contactPulse = Math.max(0, this.contactPulse - dt * 7.5);
    if (this.presentationAction) {
      this.presentationT += dt;
      if (this.presentationT >= this.presentationDuration) {
        this.presentationAction = null;
        this.presentationT = 0;
        this.presentationDuration = 0;
      }
      // Presentation clips own this fixed step. Letting the hidden read/dive
      // state continue underneath them makes the keeper reappear in a later
      // phase when the clip ends. Wall commands and grounded concede reactions
      // instead resume from the same planted root on the following step.
      return;
    }
    switch (this.state) {
      case 'read': {
        this.stateT += dt;
        this.pose = 'ready';
        const trackTarget = this.trackTargetX;
        const maxSpeed = (1.35 + this.skill * 1.25) * this.profile.speed;
        const desiredVx = clamp((trackTarget - this.x) * 8, -maxSpeed, maxSpeed);
        this.moveVx += clamp(
          desiredVx - this.moveVx,
          -TRACK_ACCELERATION * dt,
          TRACK_ACCELERATION * dt
        );
        const previousX = this.x;
        this.x = clamp(this.x + this.moveVx * dt, -this.halfGoal + 0.55, this.halfGoal - 0.55);
        this.footworkDistance += Math.abs(this.x - previousX);
        if (this.stateT >= this.reactT) {
          this.state = 'set';
          this.stateT = 0;
        }
        break;
      }

      case 'set': {
        this.stateT += dt;
        this.pose = 'ready';
        const plantTarget = this.trackTargetX;
        const desiredVx = clamp((plantTarget - this.x) * 10, -2.4, 2.4);
        this.moveVx += clamp(
          desiredVx - this.moveVx,
          -TRACK_ACCELERATION * 1.2 * dt,
          TRACK_ACCELERATION * 1.2 * dt
        );
        const previousX = this.x;
        this.x = clamp(this.x + this.moveVx * dt, -this.halfGoal + 0.55, this.halfGoal - 0.55);
        this.footworkDistance += Math.abs(this.x - previousX);
        if (this.stateT >= this.setT) {
          if (this.standingSave) {
            // Stay loaded behind central shots so contact can flow into the
            // dedicated scoop/chest/high-claim sequences instead of forcing
            // a needless horizontal dive.
            this.stateT = this.setT;
            this.moveVx *= Math.max(0, 1 - 12 * dt);
            break;
          }
          this.state = 'dive';
          this.pose = 'dive';
          this.stateT = 0;
          this.diveP = 0;
          this.diveStartX = this.x;
          const desiredContactRootX = this.targetX - this.diveDir * 0.59;
          this.contactRootX = clamp(
            desiredContactRootX,
            Math.max(-this.halfGoal + 0.45, this.x - this.maxDiveRootTravel),
            Math.min(this.halfGoal - 0.45, this.x + this.maxDiveRootTravel)
          );
          this.landingRootX = clamp(
            this.contactRootX + this.diveDir * (0.20 + this.skill * 0.10),
            -this.halfGoal + 0.4,
            this.halfGoal - 0.4
          );
          this.visualLift = 0;
          this.diveHandY = 0.95;
          this.diveVy = 0;
        }
        break;
      }

      case 'dive': {
        this.pose = 'dive';
        if (this.contactHoldT > 0) {
          this.contactHoldT = Math.max(0, this.contactHoldT - dt);
          break;
        }

        this.stateT += dt;
        this.diveP = clamp(this.stateT / this.diveDuration, 0, 1);
        const previousX = this.x;
        const previousLift = this.visualLift;

        if (this.diveP <= CONTACT_PROGRESS) {
          const contactP = this.diveP / CONTACT_PROGRESS;
          const travel = travellingEase(contactP);
          this.x = lerp(this.diveStartX, this.contactRootX, travel);
          this.visualLift = this.contactLift * smoothstep(contactP);
          this.diveHandY = lerp(0.95, this.targetY, smoothstep(contactP));
        } else {
          const followP = (this.diveP - CONTACT_PROGRESS) / (1 - CONTACT_PROGRESS);
          const travel = travellingEase(followP);
          this.x = lerp(this.contactRootX, this.landingRootX, travel);
          this.visualLift = this.contactLift * (1 - 0.48 * travel);
          this.diveHandY = lerp(this.targetY, Math.max(0.55, this.targetY - 0.46), smoothstep(followP));
        }
        this.x = clamp(this.x, -this.halfGoal + 0.4, this.halfGoal - 0.4);
        this.moveVx = (this.x - previousX) / dt;
        this.diveVy = (this.visualLift - previousLift) / dt;

        if (this.stateT >= this.diveDuration) {
          // Preserve both axes of momentum into a ballistic descent.
          this.state = 'land';
          this.stateT = 0;
          this.landY = Math.max(this.visualLift, 0);
          this.landVy = Math.max(0, -this.diveVy) + this.pendingLandImpulse;
          this.grounded = false;
        }
        break;
      }

      case 'land':
        this.pose = 'dive';
        if (!this.grounded) {
          this.stateT += dt;
          this.landVy += 9.2 * dt;
          this.landY -= this.landVy * dt;
          this.diveHandY = Math.max(0.42, this.diveHandY - this.landVy * dt * 0.35);
          this.x = clamp(this.x + this.moveVx * dt, -this.halfGoal + 0.4, this.halfGoal - 0.4);
          this.moveVx *= Math.max(0, 1 - 1.8 * dt);
          if (this.landY <= 0) {
            this.landY = 0;
            this.grounded = true;
            this.stateT = 0;
            this.contactPulse = Math.max(this.contactPulse, 0.55);
          }
        } else {
          this.stateT += dt;
          this.x = clamp(this.x + this.moveVx * dt, -this.halfGoal + 0.4, this.halfGoal - 0.4);
          this.moveVx *= Math.max(0, 1 - 5 * dt);
          if (this.stateT >= GROUND_IMPACT_HOLD + this.getRecoveryDuration()) {
            // Fold any presentation-only offset into the root now that the
            // save is over, so the return run starts where the body is drawn.
            const drawnOffset = this.getPresentationOffsetX();
            if (drawnOffset) {
              this.x = clamp(this.x + drawnOffset, -this.halfGoal + 0.4, this.halfGoal - 0.4);
            }
            this.state = 'return';
            this.pose = 'idle';
            this.stateT = 0;
            this.footworkDistance = 0;
            this.returnDirection = Math.sign(this.homeX - this.x);
            // Recovery art finishes planted. Discard the tiny residual slide so
            // the first return step starts from a stable boot contact.
            this.moveVx = 0;
          }
        }
        break;

      case 'return': {
        this.stateT += dt;
        this.pose = 'idle';
        this.idleClock += dt;
        const distance = Math.abs(this.x - this.homeX);
        if (distance <= 0.022) {
          this.state = 'idle';
          this.stateT = 0;
          this.x = this.homeX;
          this.moveVx = 0;
          this.diveP = 0;
          this.visualLift = 0;
          break;
        }

        // Cap speed by the exact stopping distance. The old spring target kept
        // carrying velocity through the keeper's home, which made the keeper
        // flip directions for several frames before finally settling.
        const direction = Math.sign(this.homeX - this.x);
        const brakingSpeed = Math.sqrt(2 * RETURN_ACCELERATION * distance);
        const desiredVx = direction * Math.min(RETURN_SPEED, brakingSpeed);
        this.moveVx += clamp(
          desiredVx - this.moveVx,
          -RETURN_ACCELERATION * dt,
          RETURN_ACCELERATION * dt
        );
        const previousX = this.x;
        const nextX = this.x + this.moveVx * dt;
        if ((this.x < this.homeX && nextX >= this.homeX) ||
            (this.x > this.homeX && nextX <= this.homeX)) {
          this.x = this.homeX;
          this.moveVx = 0;
          this.state = 'idle';
          this.stateT = 0;
          this.diveP = 0;
          this.visualLift = 0;
        } else {
          this.x = nextX;
        }
        this.footworkDistance += Math.abs(this.x - previousX);
        break;
      }

      case 'catch':
        this.stateT += dt;
        this.pose = 'catch';
        if (this.stateT >= this.catchDuration) {
          this.state = 'return';
          this.pose = 'idle';
          this.stateT = 0;
          this.footworkDistance = 0;
          this.returnDirection = Math.sign(this.homeX - this.x);
        }
        break;

      default:
        this.state = 'idle';
        this.pose = 'idle';
        this.idleClock += dt;
        if (this.braced) this.braceClock = (this.braceClock || 0) + dt;
        // Idle animation supplies the weight shift; keep planted feet fixed in
        // world space instead of moving the whole sprite independently.
        this.x += (this.homeX - this.x) * Math.min(dt * 5, 1);
    }
  }

  getContactPose() {
    const progress = smoothstep(this.diveP);
    let y;
    if (this.state === 'catch') {
      y = this.catchY;
    } else if (this.state === 'dive' || this.state === 'land') {
      // Contact geometry follows the hands while drawing follows the body
      // root. Keeping them separate prevents the impact sprite from floating.
      y = this.diveHandY;
    } else {
      y = lerp(0.95, clamp(this.targetY, 0.5, 2.45), progress);
    }
    return {
      state: this.state,
      x: this.x,
      y,
      progress: this.state === 'land' ? 1 : progress,
      direction: this.diveDir
    };
  }

  getAnimationFrame() {
    if (this.pose === 'dive') {
      const base = this.diveDir > 0 ? KEEPER_FRAMES.diveRight : KEEPER_FRAMES.diveLeft;
      // Keep the full-stretch flight pose while gravity brings the body down.
      // The side-lying pose is legal only after actual turf contact.
      if (this.state === 'land') return base + (this.grounded ? 4 : 3);
      const progress = clamp(this.diveP, 0, 1);
      if (progress < 0.16) return base;
      if (progress < 0.38) return base + 1;
      if (progress < 0.68) return base + 2;
      return base + 3;
    }

    if (this.state === 'catch') {
      if (this.catchY < 0.62) return KEEPER_FRAMES.lowScoop;
      if (this.catchY < 1.02) return KEEPER_FRAMES.lowKneel;
      if (this.catchY < 1.72) return KEEPER_FRAMES.chestCatch;
      return KEEPER_FRAMES.highCatch;
    }
    if (this.state === 'return' && this.stateT < 0.24 && !this.hasRecoveryAtlas) {
      return KEEPER_FRAMES.recovery;
    }
    if (this.state === 'read') return this.diveDir > 0 ? 3 : 1;
    if (this.state === 'set') {
      const progress = this.setT > 0 ? this.stateT / this.setT : 1;
      return progress < 0.52 ? KEEPER_FRAMES.anticipate : KEEPER_FRAMES.set;
    }

    if (this.braced && this.state === 'idle') {
      const bounce = BRACE_FRAMES[Math.floor((this.braceClock || 0) / BRACE_FRAME_SECONDS) % BRACE_FRAMES.length];
      return bounce;
    }

    const idleCycle = IDLE_FRAME_SECONDS * KEEPER_FRAMES.idle.length;
    const phaseOffset = this.idlePhase / (Math.PI * 2) * idleCycle;
    const index = Math.floor((this.idleClock + phaseOffset) / IDLE_FRAME_SECONDS) % KEEPER_FRAMES.idle.length;
    return KEEPER_FRAMES.idle[index];
  }

  getRecoveryFrame() {
    const progress = clamp(
      (this.stateT - GROUND_IMPACT_HOLD) / GROUND_RECOVERY_DURATION,
      0,
      1
    );
    if (!this.hasBall) {
      return 12 + Math.min(5, Math.floor(progress * 6));
    }
    // A held ball rises straight from the hold frames to a standing hold. It
    // must never drop back to the prone, ball-free get-up row.
    const base = this.diveDir > 0 ? 0 : 6;
    return base + Math.min(5, Math.floor(progress * 6));
  }

  getActivePracticalMove() {
    const move = getKeeperMove(this.activeSaveMoveId);
    if (!move || !this.scene.textures?.exists?.(move.texture)) return null;
    return move;
  }

  getPracticalSaveFrame(move) {
    const frames = move.frames;
    if (this.state === 'set') {
      const setProgress = this.setT > 0 ? clamp(this.stateT / this.setT, 0, 1) : 1;
      return frames[setProgress < 0.55 ? 0 : Math.min(1, frames.length - 1)];
    }
    if (this.state === 'land') return frames[frames.length - 1];

    const lastFlightIndex = Math.max(1, frames.length - 2);
    if (this.contactHoldT > 0) {
      return frames[Math.min(lastFlightIndex, Math.round(lastFlightIndex * CONTACT_PROGRESS))];
    }
    const index = Math.min(
      lastFlightIndex,
      Math.max(1, Math.floor(clamp(this.diveP, 0, 1) * (lastFlightIndex + 1)))
    );
    return frames[index];
  }

  getPracticalCatchFrame(move) {
    return this.getPracticalCatchClip(move).frame;
  }

  // The ball is already in the gloves when a standing catch clip starts, so
  // it begins at the first ball-secured phase rather than replaying the ball
  // arriving from the side.
  getPracticalCatchClip(move) {
    const spec = KEEPER_CATCH_PHASES[move.id];
    let texture = move.texture;
    let frames = move.frames;
    if (spec?.frames && this.scene.textures?.exists?.(spec.texture)) {
      texture = spec.texture;
      frames = spec.frames;
    } else if (spec?.from) {
      frames = move.frames.slice(Math.min(spec.from, move.frames.length - 1));
    }
    const progress = clamp(this.stateT / Math.max(this.catchDuration, 0.01), 0, 1);
    const index = Math.min(frames.length - 1, Math.floor(progress * frames.length));
    return { texture, frame: frames[index] };
  }

  getDiveMotionFrame() {
    const base = this.diveDir > 0 ? 0 : 12;
    if (this.state === 'set') {
      const progress = this.setT > 0 ? clamp(this.stateT / this.setT, 0, 1) : 1;
      return base + (progress < 0.48 ? 3 : 4);
    }
    if (this.state === 'land') return base + (this.grounded ? 11 : 10);

    const progress = clamp(this.diveP, 0, 1);
    if (this.contactHoldT > 0 || (this.contactRegistered && progress >= CONTACT_PROGRESS - 0.08)) {
      return base + 9;
    }
    if (progress < 0.12) return base + 5;
    if (progress < 0.28) return base + 6;
    if (progress < 0.48) return base + 7;
    if (progress < 0.64) return base + 8;
    if (progress < 0.78) return base + 9;
    return base + 10;
  }

  getLowSaveFrame() {
    const base = this.diveDir > 0 ? 0 : 8;
    if (this.state === 'set') {
      const progress = this.setT > 0 ? clamp(this.stateT / this.setT, 0, 1) : 1;
      return base + (progress < 0.48 ? 2 : 3);
    }
    if (this.state === 'land') return base + 7;

    const progress = clamp(this.diveP, 0, 1);
    if (progress < 0.16) return base + 4;
    if (progress < 0.42) return base + 5;
    if (progress < 0.76 || this.contactHoldT > 0) return base + 6;
    return base + 7;
  }

  getSaveFamilyFrame() {
    const base = this.diveDir > 0 ? 0 : 8;
    if (this.state === 'set') {
      const progress = this.setT > 0 ? clamp(this.stateT / this.setT, 0, 1) : 1;
      return base + (progress < 0.5 ? 2 : 3);
    }
    if (this.state === 'land') return base + 7;

    const progress = clamp(this.diveP, 0, 1);
    if (progress < 0.12) return base + 3;
    if (progress < 0.32) return base + 4;
    if (progress < 0.55) return base + 5;
    if (progress < 0.78 || this.contactHoldT > 0) return base + 6;
    return base + 7;
  }

  getReturnFrame() {
    let direction = this.returnDirection || this.moveVx;
    if (Math.abs(direction) < 0.04) direction = this.homeX - this.x;
    // Generated atlas row one moves screen-left and row two screen-right.
    const base = direction >= 0 ? 9 : 0;
    if (this.stateT < 0.07) return base;
    if (Math.abs(this.x - this.homeX) < 0.26) return base + (Math.abs(this.moveVx) > 0.30 ? 7 : 8);
    return base + 1 + Math.floor(this.footworkDistance / RETURN_STRIDE_METRES) % 6;
  }

  getFootworkFrame() {
    let direction = this.moveVx;
    if (Math.abs(direction) < 0.05) {
      direction = this.state === 'return' ? this.homeX - this.x : this.diveDir;
    }
    // Atlas row one travels screen-left; row two travels screen-right.
    const base = direction >= 0 ? 5 : 0;
    const footworkTarget = this.state === 'return' ? this.homeX : this.trackTargetX;
    const planted = Math.abs(this.moveVx) < 0.12 && Math.abs(footworkTarget - this.x) < 0.06;
    if (planted) {
      // Both end frames are centred, so alternating them reads as a light set
      // bounce without sliding the boots. The previous x≈0 check froze a
      // keeper who had finished tracking away from centre on a mid-shuffle
      // frame, making the animation appear broken for slow and central shots.
      const bounce = Math.floor(this.stateT / READY_FRAME_SECONDS) % 2;
      return base + bounce * 4;
    }
    return base + Math.floor(this.footworkDistance / 0.11) % 4;
  }

  getHandlingFrame() {
    const progress = clamp(this.stateT / Math.max(this.catchDuration, 0.01), 0, 1);
    if (this.catchType === 'high') {
      if (progress < 0.18) return 0;
      if (progress < 0.40) return 1;
      if (progress < 0.62) return 2;
      if (progress < 0.82) return 3;
      return 4;
    }
    const base = this.catchType === 'low' ? 0 : 5;
    if (progress < 0.24) return base;
    if (progress < 0.50) return base + 1;
    if (progress < 0.76) return base + 2;
    return base + 3;
  }

  getSituationalSaveFrame() {
    const frames = SITUATIONAL_SAVE_FRAMES[this.saveFamily] || SITUATIONAL_SAVE_FRAMES['narrow-block'];
    const progress = this.state === 'set'
      ? clamp(this.stateT / Math.max(this.setT, 0.01), 0, 0.18)
      : this.state === 'land'
        ? 1
        : clamp(this.diveP, 0, 1);
    return frames[Math.min(frames.length - 1, Math.floor(progress * frames.length))];
  }

  chooseDistribution(pt = null) {
    const x = Number.isFinite(pt?.x) ? pt.x : this.x;
    const y = Number.isFinite(pt?.y) ? pt.y : this.catchY;
    const signature = Math.abs(Math.round((x * 11 + y * 17 + this.shotSpeed * 3) * 10));
    return KEEPER_DISTRIBUTION_IDS[signature % KEEPER_DISTRIBUTION_IDS.length];
  }

  playPresentation(actionId, duration = 0.72) {
    const action = getKeeperMove(actionId);
    if (!action || !this.scene.textures?.exists?.(action.texture)) return false;
    this.presentationAction = actionId;
    this.presentationT = 0;
    this.presentationDuration = Math.max(0.2, duration);
    return true;
  }

  organiseWall(duration = 0.82) {
    if (this.hasOrganisedWall) return false;
    const started = this.playPresentation('organise-wall', duration);
    if (started) this.hasOrganisedWall = true;
    return started;
  }

  reactToGoal(duration = 0.82) {
    // A failed dive is already the correct concede animation. Replacing it with
    // a bottom-anchored standing atlas would teleport an airborne keeper to the
    // turf, then reveal a later hidden dive/landing phase when the clip ends.
    if (
      this.state === 'dive' ||
      this.state === 'land' ||
      this.state === 'catch' ||
      Math.abs(this.visualLift) > 0.01
    ) {
      return false;
    }

    const started = this.playPresentation('concede-reaction', duration);
    if (!started) return false;

    // The outcome is authoritative now, so a standing read/set can settle into
    // a stable post-result base without changing any save or collision decision.
    // Keep the current x: the next-attempt reset owns the return to centre.
    this.state = 'idle';
    this.pose = 'idle';
    this.stateT = 0;
    this.moveVx = 0;
    this.diveP = 0;
    this.visualLift = 0;
    this.contactHoldT = 0;
    this.pendingLandImpulse = 0;
    this.savePlan = null;
    this.standingSave = false;
    return true;
  }

  celebrateSave(duration = 0.52) {
    return this.playPresentation('big-save-celebration', duration);
  }

  getPresentationFrame() {
    const action = getKeeperMove(this.presentationAction);
    if (!action) return null;
    const progress = clamp(this.presentationT / Math.max(this.presentationDuration, 0.01), 0, 1);
    const index = Math.min(action.frames.length - 1, Math.floor(progress * action.frames.length));
    return { action, frame: action.frames[index] };
  }

  drawPresentation() {
    const current = this.getPresentationFrame();
    if (!current) return false;
    const pos = project(this.x, 0, this.z);
    this.ghost?.setVisible?.(false);
    this.prevDraw = null;
    this.lastDrawn = { texture: current.action.texture, frame: current.frame, x: this.x, lift: 0, flip: false };
    this.spr
      .setTexture(current.action.texture, current.frame)
      .setFlipX(false)
      .setOrigin(0.5, 1)
      .setPosition(pos.x, pos.y)
      .setScale((pos.s * KEEPER_H) / KEEPER_ACTION_REFERENCE_H)
      .setDepth(1000 - this.z * 10);
    this.spr.setRotation?.(0);
    return true;
  }

  getResultHoldMs() {
    // Hold only through impact and the readable part of recovery. The next shot
    // never waits for a full jog back to centre.
    const fallTime = (height, downwardVelocity = 0) => {
      const distance = Math.max(0, height);
      return distance <= 0
        ? 0
        : (-downwardVelocity + Math.sqrt(downwardVelocity * downwardVelocity + 2 * 9.2 * distance)) / 9.2;
    };
    let remaining = 0;
    const recovery = GROUND_IMPACT_HOLD + this.getRecoveryDuration();
    if (this.state === 'dive') {
      remaining += Math.max(0, this.diveDuration - this.stateT);
      remaining += fallTime(Math.max(this.contactLift * 0.52, 0), Math.max(0, -this.diveVy));
      remaining += recovery;
    } else if (this.state === 'land') {
      remaining += this.grounded
        ? Math.max(0, recovery - this.stateT)
        : fallTime(this.landY, this.landVy) + recovery;
    } else if (this.state === 'return') {
      return 250;
    } else if (this.state === 'catch') {
      remaining = Math.max(0, this.catchDuration - this.stateT);
    } else {
      return 650;
    }
    return Math.ceil(clamp(remaining + 0.06, 0.55, 1.35) * 1000);
  }

  // Resolve which authored atlas plays this save, ONCE, at the moment the save
  // is committed. This used to be an eleven-branch cascade re-evaluated on every
  // single frame, keyed off saveFamily - and catchBall()/impact() rewrite
  // saveFamily mid-flight. The keeper therefore swapped sprite sheets partway
  // through a dive, and because each sheet is authored around a different body
  // baseline he visibly teleported and rescaled between two frames. Locking the
  // plan is what stops the keeper tearing himself apart mid-save.
  buildSavePlan() {
    const familyTexture = SAVE_FAMILY_TEXTURES[this.saveFamily];
    const practicalMove = this.getActivePracticalMove();

    // A planted central save must remain on the ready/set atlas until actual
    // ball contact. Falling through to the generic dive sheet made the keeper
    // lean toward a corner for two frames even though no dive would happen.
    if (this.standingSave) return null;

    if (practicalMove) {
      let family = this.saveFamily;
      let move = getKeeperMove(KEEPER_PLAN_PRESENTATION[practicalMove.id]) || practicalMove;
      const fallback = PLAN_FAMILY_FALLBACK[family];
      if (fallback) {
        const alternative = getKeeperMove(practicalMoveIdForFamily(fallback, this.diveDir, false));
        if (alternative && this.scene.textures?.exists?.(alternative.texture)) {
          move = alternative;
          family = fallback;
        }
      }
      if (!this.scene.textures?.exists?.(move.texture)) move = practicalMove;
      const phases = KEEPER_SAVE_PHASES[family] || null;
      return {
        kind: 'practical',
        texture: move.texture,
        referenceHeight: referenceHeightFor(move.texture),
        move,
        family,
        phases,
        ...(phases ? this.resolveContactPose(phases) : {}),
        // Furthest phase shown so far: the clip may hold or skip forward but
        // never steps back to an earlier pose.
        sequencePos: 0,
        centred: Boolean(phases?.centred),
        grounded: GROUNDED_PRACTICAL_FAMILIES.includes(this.saveFamily)
      };
    }
    if (this.hasSituationalAtlas && SITUATIONAL_SAVE_FAMILIES.includes(this.saveFamily)) {
      return {
        kind: 'situational',
        texture: KEEPER_SITUATIONAL_TEXTURE,
        referenceHeight: KEEPER_ACTION_REFERENCE_H,
        punching: this.saveFamily.includes('punch')
      };
    }
    if (familyTexture && this.hasSaveFamilyAtlas[this.saveFamily]) {
      return {
        kind: 'family',
        texture: familyTexture,
        referenceHeight: KEEPER_HANDLING_REFERENCE_H
      };
    }
    if (this.hasLowSaveAtlas && this.targetY <= LOW_SAVE_MAX_Y) {
      return {
        kind: 'low',
        texture: KEEPER_LOW_SAVE_TEXTURE,
        referenceHeight: KEEPER_LOW_SAVE_REFERENCE_H
      };
    }
    if (this.hasDiveMotionAtlas) {
      return {
        kind: 'motion',
        texture: KEEPER_DIVE_MOTION_TEXTURE,
        referenceHeight: KEEPER_MOTION_REFERENCE_H
      };
    }
    return null;
  }

  // Pick the authored contact pose whose leading glove sits at (or just
  // below) the ball height so the drawn glove can be lifted onto the ball;
  // poses after it in the authored flight become follow-through.
  resolveContactPose(phases) {
    const contacts = phases.contacts || [];
    let chosen = null;
    for (const candidate of contacts) {
      if (candidate[2] <= this.targetY + 1e-9 && (!chosen || candidate[2] > chosen[2])) chosen = candidate;
    }
    if (!chosen && contacts.length) {
      chosen = contacts.reduce((low, candidate) => (candidate[2] < low[2] ? candidate : low));
    }
    const contactIndex = chosen
      ? Math.max(0, phases.flight.indexOf(chosen[0]))
      : phases.flight.length - 1;
    const tail = phases.flight.slice(contactIndex + 1);
    return {
      flight: phases.flight.slice(0, contactIndex + 1),
      after: [...tail, ...phases.after],
      // A held ball goes straight into the catch follow-through.
      afterCatch: phases.afterCatch ? [...phases.afterCatch] : null,
      reach: chosen ? [chosen[1], chosen[2]] : null
    };
  }

  resolvePlanFrame(plan, entry) {
    if (entry && typeof entry === 'object') {
      if (this.scene.textures?.exists?.(entry.texture)) {
        return { texture: entry.texture, frame: this.diveDir > 0 ? entry.right : entry.left, flip: false };
      }
      entry = plan.move.frames.length - 1;
    }
    const frames = plan.move.frames;
    return { texture: plan.move.texture, frame: frames[clamp(entry, 0, frames.length - 1)], flip: false };
  }

  planEndType(plan) {
    const phases = plan.phases;
    return (this.hasBall && phases.endCatch) || phases.end;
  }

  // Authored phase playback for a committed save:
  //   set          -> wind-up poses (feet planted, before any travel)
  //   dive         -> launch .. contact spread to the scheduled contact, then
  //                   follow-through; an early contact skips ahead to the
  //                   contact pose and holds it
  //   land (air)   -> the last flight/follow-through pose
  //   land (turf)  -> the ground pose, then a recovery chosen by how the save
  //                   ended (see getPlanRecoveryFrame)
  getPhasedPlanFrame(plan) {
    const phases = plan.phases;
    const held = this.hasBall;
    const flight = plan.flight || phases.flight;
    const after = held && plan.afterCatch ? plan.afterCatch : (plan.after || phases.after);
    const sequence = [...phases.windup, ...flight, ...after];
    const windupCount = phases.windup.length;
    const contactPos = windupCount + flight.length - 1;

    if (this.state === 'land' && this.grounded) {
      const ground = held && phases.groundCatch !== undefined ? phases.groundCatch : phases.ground;
      if (this.stateT >= GROUND_IMPACT_HOLD) {
        const recovery = this.getPlanRecoveryFrame(plan);
        if (recovery) return recovery;
      }
      return this.resolvePlanFrame(plan, ground);
    }

    let pos;
    if (this.state === 'set') {
      const progress = this.setT > 0 ? clamp(this.stateT / this.setT, 0, 0.999) : 0.999;
      pos = windupCount ? Math.floor(progress * windupCount) : windupCount;
    } else if (this.state === 'land') {
      pos = sequence.length - 1;
    } else {
      const preContact = flight.length - 1;
      // A ball that arrives a touch after the scheduled contact still meets
      // the contact pose: hold it briefly before the follow-through starts.
      const followStart = this.contactRegistered ? CONTACT_PROGRESS : CONTACT_HOLD_PROGRESS;
      if (this.contactHoldT > 0 || (this.contactRegistered && this.diveP <= CONTACT_PROGRESS)) {
        pos = contactPos;
      } else if (this.diveP < CONTACT_PROGRESS) {
        pos = windupCount + Math.min(
          Math.max(0, preContact - 1),
          Math.floor((this.diveP / CONTACT_PROGRESS) * preContact)
        );
      } else if (this.diveP < followStart || !after.length) {
        pos = contactPos;
      } else {
        const followP = clamp((this.diveP - followStart) / (1 - followStart), 0, 0.999);
        pos = contactPos + 1 + Math.floor(followP * after.length);
      }
    }
    pos = clamp(Math.max(pos, plan.sequencePos || 0), 0, sequence.length - 1);
    plan.sequencePos = pos;
    return this.resolvePlanFrame(plan, sequence[pos]);
  }

  // Recovery follows the pose the save ended in. Upright endings (spread,
  // foot block) stay on their standing pose until the return run; a held ball
  // plays the hold-and-rise frames; a ball-free turf ending gets up from the
  // turf, mirrored so the body rises from the side it landed on.
  getPlanRecoveryFrame(plan) {
    const end = this.planEndType(plan);
    if (end === 'upright' || !this.hasRecoveryAtlas) return null;
    const progress = clamp(
      (this.stateT - GROUND_IMPACT_HOLD) / GROUND_RECOVERY_DURATION,
      0,
      0.999
    );
    if (this.hasBall) {
      const base = this.diveDir > 0 ? 0 : 6;
      const first = end === 'kneel' ? 3 : 0;
      const count = 6 - first;
      return {
        texture: KEEPER_RECOVERY_TEXTURE,
        frame: base + first + Math.floor(progress * count),
        flip: false
      };
    }
    const first = end === 'kneel' ? 14 : 12;
    const count = 18 - first;
    return {
      texture: KEEPER_RECOVERY_TEXTURE,
      frame: first + Math.floor(progress * count),
      // The shared get-up row is authored rising from a screen-left landing.
      flip: this.diveDir > 0
    };
  }

  getRecoveryDuration() {
    const plan = this.savePlan;
    if (plan?.phases && this.planEndType(plan) === 'upright' && this.contactRegistered) {
      return UPRIGHT_RECOVERY_DURATION;
    }
    return GROUND_RECOVERY_DURATION;
  }

  presentationRamp() {
    if (this.state === 'dive') return smoothstep(this.diveP / CONTACT_PROGRESS);
    if (this.state === 'land') return 1;
    return 0;
  }

  // Presentation-only horizontal offset (collision keeps the physical root;
  // the offset is folded into the root once the save is over).
  //  - Dives: the physical hands lead the root by DIVE_HAND_LEAD, but the
  //    contact pose draws its leading glove `plan.reach[0]` ahead of the sprite
  //    root. Shift the body back so the drawn glove sits on the physical hand.
  //  - The spread save commits its root behind the ball like a dive, but its
  //    art is a square-on block: draw it on the ball line.
  getPresentationOffsetX() {
    const plan = this.savePlan;
    if (!plan?.phases) return 0;
    const ramp = this.presentationRamp();
    if (!ramp) return 0;
    if (plan.centred) {
      return clamp(this.targetX - this.contactRootX, -DIVE_HAND_LEAD, DIVE_HAND_LEAD) * ramp;
    }
    const reach = plan.reach;
    return reach ? this.diveDir * (DIVE_HAND_LEAD - reach[0]) * ramp : 0;
  }

  // Presentation-only lift scale. Physics lifts the root to targetY - 0.86 (a
  // generic hand height); each contact pose actually draws its leading glove
  // `plan.reach[1]` above the sprite root, so scale the drawn lift until that glove
  // meets the ball height. Landing timing and contact geometry are unchanged.
  presentationLiftRatio(plan) {
    const reach = plan.reach;
    if (!reach) return plan.grounded ? 0.25 : 1;
    const drawnLift = clamp(this.targetY - reach[1], 0, 1.46);
    return drawnLift / Math.max(this.contactLift, 0.03);
  }

  savePlanFrame(plan) {
    switch (plan.kind) {
      case 'practical': return this.getPracticalSaveFrame(plan.move);
      case 'situational': return this.getSituationalSaveFrame();
      case 'family': return this.getSaveFamilyFrame();
      case 'low': return this.getLowSaveFrame();
      default: return this.getDiveMotionFrame();
    }
  }

  savePlanRootLift(plan) {
    if (plan.phases) {
      if (this.state === 'land') return this.landY * this.presentationLiftRatio(plan);
      if (this.state === 'dive') return this.visualLift * this.presentationLiftRatio(plan);
      return 0;
    }
    if (this.state === 'land') {
      if (plan.kind === 'situational') return this.landY * 0.2;
      // Grounded clips carry a quarter of the lift in flight; keep that ratio
      // through the descent so the body does not jump up at dive end.
      return plan.kind === 'practical' && plan.grounded ? this.landY * 0.25 : this.landY;
    }
    if (this.state !== 'dive') return 0;
    if (plan.kind === 'practical') return this.visualLift * (plan.grounded ? 0.25 : 1);
    if (plan.kind === 'situational') return plan.punching ? this.visualLift * 0.24 : 0;
    return this.visualLift;
  }

  draw() {
    if (this.destroyed || !this.spr) return;
    if (this.presentationAction && this.drawPresentation()) return;
    this.ghost?.setVisible?.(false);
    this.prevDraw = null;

    const savingState = this.state === 'set' || this.state === 'dive' || this.state === 'land';
    // Late safety net: if a save began before a plan was built (a shot that
    // reaches the keeper while he is still reading), build it now and keep it.
    if (savingState && !this.savePlan) this.savePlan = this.buildSavePlan();
    // Phased plans own their whole save, including the turf recovery.
    const phasedPlan = savingState && Boolean(this.savePlan?.phases);
    const groundedRecovery = !phasedPlan &&
      this.hasRecoveryAtlas &&
      this.state === 'land' &&
      this.grounded &&
      (!(this.hasDiveMotionAtlas || this.hasLowSaveAtlas) || this.stateT >= GROUND_IMPACT_HOLD);
    const touchdown = this.state === 'land' && this.grounded && (groundedRecovery || phasedPlan);
    const savePhase = savingState && !groundedRecovery && Boolean(this.savePlan);
    const returnPhase = this.hasReturnAtlas && this.state === 'return';
    const footworkPhase = this.hasFootworkAtlas &&
      ((!this.hasReturnAtlas && this.state === 'return') || this.state === 'read');
    const practicalCatchMove = this.state === 'catch' ? this.getActivePracticalMove() : null;
    const practicalCatchPhase = Boolean(practicalCatchMove);
    const highClaim = !practicalCatchPhase && this.state === 'catch' && this.catchType === 'high' && this.hasHighClaimAtlas;
    const handling = !practicalCatchPhase && this.state === 'catch' && this.catchType !== 'high' && this.hasHandlingAtlas;

    if (!savePhase && !groundedRecovery && !returnPhase &&
        !footworkPhase && !practicalCatchPhase && !highClaim && !handling) {
      this.drawLegacy();
      return;
    }

    let texture;
    let frame;
    let referenceHeight;
    let rootLift = 0;
    let flip = false;

    if (savePhase && phasedPlan) {
      const plan = this.savePlan;
      const phased = this.getPhasedPlanFrame(plan);
      texture = phased.texture;
      frame = phased.frame;
      flip = phased.flip;
      referenceHeight = referenceHeightFor(texture);
      rootLift = this.savePlanRootLift(plan);
    } else if (savePhase) {
      const plan = this.savePlan;
      texture = plan.texture;
      frame = this.savePlanFrame(plan);
      referenceHeight = plan.referenceHeight;
      rootLift = this.savePlanRootLift(plan);
    } else if (groundedRecovery) {
      texture = KEEPER_RECOVERY_TEXTURE;
      frame = this.getRecoveryFrame();
      referenceHeight = KEEPER_RECOVERY_REFERENCE_H;
    } else if (returnPhase) {
      texture = KEEPER_RETURN_TEXTURE;
      frame = this.getReturnFrame();
      referenceHeight = KEEPER_RETURN_REFERENCE_H;
    } else if (footworkPhase) {
      texture = KEEPER_FOOTWORK_TEXTURE;
      frame = this.getFootworkFrame();
      referenceHeight = KEEPER_HANDLING_REFERENCE_H;
    } else if (practicalCatchPhase) {
      const clip = this.getPracticalCatchClip(practicalCatchMove);
      texture = clip.texture;
      frame = clip.frame;
      referenceHeight = referenceHeightFor(texture);
    } else if (highClaim) {
      texture = KEEPER_HIGH_CLAIM_TEXTURE;
      frame = this.getHandlingFrame();
      referenceHeight = KEEPER_HANDLING_REFERENCE_H;
    } else {
      texture = KEEPER_HANDLING_TEXTURE;
      frame = this.getHandlingFrame();
      referenceHeight = KEEPER_HANDLING_REFERENCE_H;
    }

    const drawnX = this.x + this.getPresentationOffsetX();
    const pos = project(drawnX, rootLift, this.z);
    this.lastDrawn = { texture, frame, x: drawnX, lift: rootLift, flip };
    this.spr.setTexture(texture, frame).setFlipX(flip).setOrigin(0.5, 1);
    this.spr.setPosition(pos.x, pos.y);
    const baseScale = (pos.s * KEEPER_H) / referenceHeight;
    const pulse = this.reducedMotion ? 1 : 1 + this.contactPulse * 0.045;
    const impactSquash = touchdown && !this.reducedMotion
      ? 1 - Math.max(0, 1 - this.stateT / GROUND_IMPACT_HOLD) * 0.07
      : 1;
    this.spr.setScale(baseScale * pulse, baseScale * pulse * impactSquash);
    this.spr.setRotation?.(0);
    this.spr.setDepth(1000 - this.z * 10);
  }

  drawLegacy() {
    const usingAtlas = this.hasAnimationAtlas;
    const usingRecoveryAtlas = this.hasRecoveryAtlas && this.state === 'land' && this.grounded;
    const animationFrame = usingRecoveryAtlas
      ? this.getRecoveryFrame()
      : (usingAtlas ? this.getAnimationFrame() : undefined);
    if (this.pose === 'dive') {
      const contact = this.getContactPose();
      const pos = project(this.x, usingRecoveryAtlas ? 0 : contact.y, this.z);
      this.lastDrawn = {
        texture: usingRecoveryAtlas ? KEEPER_RECOVERY_TEXTURE : (usingAtlas ? KEEPER_ANIMATION_TEXTURE : null),
        frame: animationFrame,
        x: this.x,
        lift: usingRecoveryAtlas ? 0 : Math.max(0, contact.y - 0.86),
        flip: false
      };
      let diveTexture;
      if (usingRecoveryAtlas) {
        diveTexture = KEEPER_RECOVERY_TEXTURE;
        this.spr.setTexture(diveTexture, animationFrame).setFlipX(false);
      } else if (usingAtlas) {
        diveTexture = KEEPER_ANIMATION_TEXTURE;
        this.spr.setTexture(diveTexture, animationFrame).setFlipX(false);
      } else {
        const authoredRight = this.diveDir > 0 && this.scene.textures?.exists?.('keeper-dive-right-hd');
        diveTexture = authoredRight
          ? 'keeper-dive-right-hd'
          : (this.scene.textures?.exists?.('keeper-dive-hd') ? 'keeper-dive-hd' : 'keeper-dive');
        this.spr.setTexture(diveTexture);
        const hasAuthoredLeft = this.scene.textures?.exists?.('keeper-dive-hd');
        this.spr.setFlipX(hasAuthoredLeft ? (!authoredRight && this.diveDir > 0) : this.diveDir < 0);
      }
      // Recovery frames are packed on one shared baseline, so originY=1 pins
      // the lowest glove/hip/knee/boot pixel to the projected pitch surface.
      this.spr.setOrigin(0.5, usingRecoveryAtlas ? 1 : 0.5);
      this.spr.setPosition(pos.x, pos.y);
      const textureH = usingRecoveryAtlas
        ? KEEPER_RECOVERY_REFERENCE_H
        : (usingAtlas ? KEEPER_DIVE_REFERENCE_H : spriteFrameHeight(this.spr));
      const renderedHeight = usingRecoveryAtlas ? KEEPER_H : DIVE_H;
      const baseScale = (pos.s * renderedHeight) / textureH;
      const pulse = this.reducedMotion ? 1 : 1 + this.contactPulse * 0.06;
      if (this.state === 'land') {
        // Grounded: settle flat with a small impact squash on touchdown.
        const squash = this.reducedMotion || !this.grounded ? 1 : 1 - Math.min(this.contactPulse, 0.5) * 0.12;
        this.spr.setScale(baseScale * pulse, baseScale * squash * pulse);
        this.spr.setRotation?.(0);
        this.ghost?.setVisible?.(false);
        this.prevDraw = null;
      } else {
        // Mid-air smear: the body elongates hard along the dive axis during
        // the explosive launch. Authored phase frames need only a restrained
        // accent; the legacy one-pose fallback keeps the stronger smear.
        const launch = 1 - contact.progress;
        const stretchAmount = usingAtlas ? 0.08 : 0.5;
        const squashAmount = usingAtlas ? 0.05 : 0.3;
        const stretch = this.reducedMotion ? 1 : 1 + launch * launch * stretchAmount;
        const squash = this.reducedMotion ? 1 : 1 / (1 + launch * launch * squashAmount);
        this.spr.setScale(baseScale * stretch * pulse, baseScale * squash * pulse);
        this.spr.setRotation?.(
          this.reducedMotion ? 0 : this.diveDir * launch * (usingAtlas ? 0.015 : 0.06)
        );

        // Afterimage: last frame's pose lingers for one frame at low alpha.
        const showGhost = !this.reducedMotion && contact.progress < 0.6 && this.prevDraw;
        if (showGhost) {
          this.ghost.setVisible?.(true);
          this.ghost.setTexture?.(this.prevDraw.texture, this.prevDraw.frame);
          this.ghost.setOrigin?.(0.5, 0.5);
          this.ghost.setFlipX?.(this.prevDraw.flipX);
          this.ghost.setPosition?.(this.prevDraw.x, this.prevDraw.y);
          this.ghost.setScale?.(this.prevDraw.scaleX, this.prevDraw.scaleY);
          this.ghost.setAlpha?.(0.24);
          this.ghost.setDepth?.(1000 - this.z * 10 - 1);
        } else {
          this.ghost.setVisible?.(false);
        }
        this.prevDraw = {
          texture: diveTexture,
          frame: animationFrame,
          flipX: Boolean(this.spr.flipX),
          x: pos.x,
          y: pos.y,
          scaleX: baseScale * stretch * pulse,
          scaleY: baseScale * squash * pulse
        };
      }
    } else {
      this.ghost?.setVisible?.(false);
      this.prevDraw = null;
      const pos = project(this.x, 0, this.z);
      this.lastDrawn = { texture: usingAtlas ? KEEPER_ANIMATION_TEXTURE : null, frame: animationFrame, x: this.x, lift: 0, flip: false };
      const texture = usingAtlas
        ? KEEPER_ANIMATION_TEXTURE
        : this.pose === 'catch'
          ? (this.scene.textures?.exists?.('keeper-catch-hd') ? 'keeper-catch-hd' : 'keeper-catch')
          : (this.scene.textures?.exists?.('keeper-hd') ? 'keeper-hd' : 'keeper');
      this.spr.setTexture(texture, animationFrame).setOrigin(0.5, 1);
      this.spr.setFlipX(false);
      this.spr.setPosition(pos.x, pos.y);
      const textureH = usingAtlas ? KEEPER_ANIM_REFERENCE_H : spriteFrameHeight(this.spr);
      const baseScale = (pos.s * KEEPER_H) / textureH;
      const setting = !this.reducedMotion && this.state === 'set';
      const reading = !this.reducedMotion && this.state === 'read';
      const rising = !this.reducedMotion && this.state === 'return' && this.stateT < 0.22;
      const pulse = this.reducedMotion ? 1 : 1 + this.contactPulse * 0.06;
      const settingX = usingAtlas ? 1.018 : 1.055;
      const settingY = usingAtlas ? 0.965 : 0.925;
      const readingX = usingAtlas ? 1.006 : 1.018;
      const readingY = usingAtlas ? 0.995 : 0.985;
      const risingX = usingAtlas ? 1 : 1.04;
      const risingY = usingAtlas ? 1 : 0.94;
      this.spr.setScale(
        baseScale * (setting ? settingX : reading ? readingX : rising ? risingX : 1) * pulse,
        baseScale * (setting ? settingY : reading ? readingY : rising ? risingY : 1) * pulse
      );
      this.spr.setRotation?.(
        this.reducedMotion
          ? 0
          : this.diveDir * (setting ? (usingAtlas ? 0.006 : 0.018) : reading ? (usingAtlas ? 0.003 : 0.008) : 0)
      );
    }
    this.spr.setDepth(1000 - this.z * 10);
  }

  // Returns detailed contact information for fixed-step scene integration.
  // pt is the ball centre at the keeper plane; passing ball allows catch quality
  // to account for shot speed. The legacy saves(pt) wrapper returns a string.
  contact(pt, ball = null) {
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return false;
    if (this.state === 'catch') return { result: 'catch', part: 'hands', distance: 0 };

    const pose = this.getContactPose();
    const isDiving = this.state === 'dive' || this.state === 'land';
    const shapes = isDiving && this.saveFamily === 'reflex-foot'
      ? [
          {
            part: 'foot',
            x: pose.x + pose.direction * (0.34 + pose.progress * 0.22),
            y: 0.42,
            rx: 0.34 + BALL_R,
            ry: 0.16 + BALL_R
          },
          {
            part: 'body',
            x: pose.x - pose.direction * 0.08,
            y: 0.88,
            rx: 0.36 + BALL_R,
            ry: 0.34 + BALL_R
          }
        ]
      : isDiving
        ? [
          {
            part: 'hands',
            x: pose.x + pose.direction * (0.34 + pose.progress * 0.25),
            y: pose.y,
            rx: 0.23 + this.skill * 0.025 + BALL_R,
            ry: 0.20 + this.skill * 0.025 + BALL_R
          },
          {
            part: 'body',
            x: pose.x - pose.direction * (0.10 + pose.progress * 0.18),
            y: pose.y - 0.05,
            rx: 0.43 + BALL_R,
            ry: 0.23 + BALL_R
          }
          ]
        : [
          { part: 'hands', kind: 'low-scoop', x: pose.x, y: 0.48, rx: 0.34 + BALL_R, ry: 0.18 + BALL_R },
          { part: 'hands', x: pose.x, y: 1.72, rx: 0.27 + BALL_R, ry: 0.28 + BALL_R },
          { part: 'hands', x: pose.x - 0.28, y: 1.15, rx: 0.18 + BALL_R, ry: 0.20 + BALL_R },
          { part: 'hands', x: pose.x + 0.28, y: 1.15, rx: 0.18 + BALL_R, ry: 0.20 + BALL_R },
          { part: 'body', x: pose.x, y: 0.98, rx: 0.30 + BALL_R, ry: 0.57 + BALL_R }
        ];

    let hit = null;
    for (const shape of shapes) {
      const distance = ellipseDistance(pt, shape);
      if (distance <= 1 && (!hit || distance < hit.distance)) hit = { ...shape, distance };
    }
    if (!hit) return false;

    const speed = ball
      ? Math.hypot(Number(ball.vx) || 0, Number(ball.vy) || 0, Number(ball.vz) || 0)
      : 20;
    // Curling rockets are harder to cushion cleanly than a straight strike at
    // the same linear speed. Treat spin as a small control load rather than an
    // RNG roll, preserving replay-stable outcomes while producing more glove
    // parries on the spectacular shots players expect to spill.
    const controlLoad = speed + Math.abs(Number(ball?.spin) || 0) * 1.65;
    const catchSpeed = 23 + this.skill * 6;
    const secure = hit.part === 'hands'
      ? hit.distance < (hit.kind === 'low-scoop' ? 0.82 : 0.60)
      : hit.distance < 0.40;
    const divingFamilyCanCatch = !isDiving ||
      this.saveFamily === 'low-smother' ||
      this.saveFamily === 'low-dive' ||
      this.saveFamily === 'low-catch' ||
      this.saveFamily === 'mid-catch';
    const gradientX = (pt.x - hit.x) / Math.max(hit.rx * hit.rx, 1e-8);
    const gradientY = (pt.y - hit.y) / Math.max(hit.ry * hit.ry, 1e-8);
    const gradientLength = Math.hypot(gradientX, gradientY);
    return {
      result: divingFamilyCanCatch && secure && controlLoad <= catchSpeed ? 'catch' : 'parry',
      part: hit.part,
      distance: hit.distance,
      quality: clamp(1 - hit.distance, 0, 1),
      x: hit.x,
      y: hit.y,
      // Surface gradient gives the scene's response solver a real outward
      // direction. A fingertip at the edge now glances away from the glove;
      // a square body block still travels mostly back toward the kicker.
      normalX: gradientLength > 1e-8 ? gradientX / gradientLength : 0,
      normalY: gradientLength > 1e-8 ? gradientY / gradientLength : 0
    };
  }

  saves(pt, ball = null) {
    return this.contact(pt, ball)?.result ?? false;
  }

  flashContact() {
    if (this.destroyed || !this.spr) return;
    this.flashTimer?.remove?.(false);
    this.spr.setTint?.(0xfff3c4);
    this.flashTimer = this.scene.time?.delayedCall?.(95, () => {
      this.flashTimer = null;
      if (!this.destroyed) this.spr?.clearTint?.();
    }) || null;
  }

  // World point of the held ball while the keeper has it and the current
  // frame does not already draw one; null otherwise (hide the scene ball).
  getHeldBallPoint() {
    if (this.destroyed || !this.hasBall) return null;
    const drawn = this.lastDrawn;
    if (!drawn) return null;
    if (KEEPER_BAKED_BALL_FRAMES[drawn.texture]?.includes(drawn.frame)) return null;
    const z = this.z - 0.12;
    if ((this.state === 'dive' || this.state === 'land') && this.heldBallOffset) {
      return {
        x: drawn.x + this.heldBallOffset.x,
        y: Math.max(BALL_R, (drawn.lift || 0) + this.heldBallOffset.y),
        z
      };
    }
    const glove = HELD_GLOVE_POINTS[drawn.texture]?.[drawn.frame] || HELD_CHEST_POINT;
    return { x: drawn.x + (drawn.flip ? -glove[0] : glove[0]), y: (drawn.lift || 0) + glove[1], z };
  }

  catchBall(pt) {
    this.hasBall = true;
    this.contactPulse = 1;
    this.flashContact();
    this.catchY = clamp(pt?.y ?? 1, 0.35, 2.15);

    this.distributionId = this.chooseDistribution(pt);
    this.catchDistributed = false;

    // A diving catch remains part of the dive. Snapping to an upright catch
    // here was the most visible source of discontinuity at ball contact.
    if (this.state === 'dive' || this.state === 'land') {
      // Keep the ball where it met the gloves, relative to the drawn body, so
      // the scene can carry it with the keeper until a held-ball pose shows it.
      const drawn = this.lastDrawn;
      this.heldBallOffset = drawn && Number.isFinite(pt?.x)
        ? { x: pt.x - drawn.x, y: this.catchY - (drawn.lift || 0) }
        : null;
      if (this.catchY < 0.86 && !['low-smother', 'reflex-foot'].includes(this.saveFamily)) {
        this.saveFamily = 'low-catch';
      } else if (this.catchY < 1.45 && this.saveFamily === 'mid-dive') {
        this.saveFamily = 'mid-catch';
      }
      this.activeSaveMoveId = practicalMoveIdForFamily(this.saveFamily, this.diveDir, false);
      this.contactRegistered = true;
      if (this.state === 'dive') this.contactHoldT = CONTACT_HOLD_DURATION;
      this.pendingLandImpulse = Math.max(this.pendingLandImpulse, 0.55);
      return;
    }

    this.state = 'catch';
    this.pose = 'catch';
    this.stateT = 0;
    const requestedX = clamp(pt?.x ?? this.x, -this.halfGoal + 0.5, this.halfGoal - 0.5);
    this.x = clamp(requestedX, this.x - 0.14, this.x + 0.14);
    this.moveVx = 0;
    this.catchType = this.catchY < 0.78 ? 'low' : this.catchY > 1.62 ? 'high' : 'chest';
    this.saveFamily = this.catchType === 'low'
      ? 'front-smother'
      : this.catchType === 'high'
        ? (this.catchY >= 1.98 ? 'jump-catch' : 'high-claim')
        : 'mid-catch';
    this.activeSaveMoveId = practicalMoveIdForFamily(this.saveFamily, this.diveDir, true);
    this.catchDuration = this.catchType === 'high' ? 1.02 : this.catchType === 'low' ? 0.98 : 0.94;
    this.catchSecureT = this.catchType === 'high' ? 0.52 : 0.46;
  }

  impact(pt = null, ball = null) {
    this.hasBall = false;
    this.contactPulse = 1;
    this.flashContact();
    if (!ball) return;

    if (this.state === 'dive' || this.state === 'land') {
      if (this.targetY < 0.86 && !['reflex-foot', 'spread-save'].includes(this.saveFamily)) {
        this.saveFamily = 'low-parry';
      } else if (this.targetY < 1.45 && ['mid-catch', 'mid-dive'].includes(this.saveFamily)) {
        this.saveFamily = 'mid-dive';
      }
      this.activeSaveMoveId = practicalMoveIdForFamily(this.saveFamily, this.diveDir, false);
      // Hold the authored contact pose for only a few frames, then preserve
      // the existing horizontal momentum through descent and turf impact.
      this.contactRegistered = true;
      if (this.state === 'dive') this.contactHoldT = CONTACT_HOLD_DURATION;
      this.pendingLandImpulse = Math.max(this.pendingLandImpulse, 0.65);
      if (this.state === 'land') this.landVy = Math.max(this.landVy, 0.65);
      return;
    }

    // Close shots can reach the keeper while he is still reading or setting.
    // Start the save follow-through from the real contact point, rather than
    // letting an earlier prediction send the sprite the opposite direction.
    const contactX = Number.isFinite(pt?.x) ? pt.x : this.x;
    const contactY = Number.isFinite(pt?.y) ? pt.y : 1;
    this.diveDir = contactX >= this.x ? 1 : -1;
    this.targetX = clamp(contactX, -this.halfGoal + 0.35, this.halfGoal - 0.35);
    this.targetY = clamp(contactY, 0.5, 2.45);
    this.shotX = contactX;
    this.shotY = contactY;
    this.shotSpeed = Math.hypot(ball.vx || 0, ball.vy || 0, ball.vz || 0);
    const lateral = Math.abs(contactX - this.x);
    const classifiedFamily = classifySaveFamily({
      y: contactY,
      speed: this.shotSpeed,
      lateral
    });
    this.saveFamily = classifiedFamily;
    this.standingSave = false;
    this.activeSaveMoveId = practicalMoveIdForFamily(this.saveFamily, this.diveDir, false);
    // A shot that arrives while the keeper is still reading starts a brand new
    // dive here, so this is a legitimate point to choose a fresh atlas.
    this.savePlan = this.buildSavePlan();
    this.moveTargetX = clamp(
      contactX - this.diveDir * 0.58,
      -this.halfGoal + 0.55,
      this.halfGoal - 0.55
    );
    this.state = 'dive';
    this.pose = 'dive';
    this.diveStartX = this.x;
    this.contactRootX = clamp(
      contactX - this.diveDir * 0.50,
      -this.halfGoal + 0.45,
      this.halfGoal - 0.45
    );
    this.landingRootX = clamp(
      this.contactRootX + this.diveDir * (0.22 + this.skill * 0.08),
      -this.halfGoal + 0.4,
      this.halfGoal - 0.4
    );
    this.contactLift = clamp(this.targetY - 0.86, 0.03, 1.58);
    this.visualLift = this.contactLift;
    this.diveHandY = this.targetY;
    this.stateT = this.diveDuration * CONTACT_PROGRESS;
    this.diveP = CONTACT_PROGRESS;
    this.contactRegistered = true;
    this.contactHoldT = CONTACT_HOLD_DURATION;
    this.pendingLandImpulse = 0.65;
    this.moveVx = this.diveDir * (2.4 + this.skill * 1.5);
  }

  reset() {
    if (this.destroyed) return this;
    this.flashTimer?.remove?.(false);
    this.flashTimer = null;
    this.braced = false;
    this.braceClock = 0;
    this.state = 'idle';
    this.pose = 'idle';
    this.stateT = 0;
    this.idleClock = 0;
    this.x = this.homeX;
    this.moveVx = 0;
    this.diveP = 0;
    this.diveStartX = this.homeX;
    this.contactRootX = this.homeX;
    this.landingRootX = this.homeX;
    this.visualLift = 0;
    this.diveHandY = 0.95;
    this.diveVy = 0;
    this.contactLift = 0;
    this.contactHoldT = 0;
    this.contactRegistered = false;
    this.pendingLandImpulse = 0;
    this.targetX = this.homeX;
    this.moveTargetX = this.homeX;
    this.trackTargetX = this.homeX;
    this.targetY = 1;
    this.shotX = this.homeX;
    this.shotY = 1;
    this.shotSpeed = 20;
    this.maxHandY = 2;
    this.maxDiveRootTravel = 0;
    this.saveFamily = 'mid-catch';
    this.activeSaveMoveId = null;
    this.savePlan = null;
    this.catchY = 1;
    this.landY = GROUND_Y;
    this.landVy = 0;
    this.grounded = false;
    this.contactPulse = 0;
    this.footworkDistance = 0;
    this.returnDirection = 0;
    this.catchType = 'chest';
    this.catchDuration = 0.82;
    this.catchSecureT = 0.46;
    this.catchDistributed = false;
    this.hasBall = false;
    this.heldBallOffset = null;
    this.distributionId = KEEPER_DISTRIBUTION_IDS[0];
    this.presentationAction = null;
    this.presentationT = 0;
    this.presentationDuration = 0;
    this.standingSave = false;
    this.spr.clearTint?.();
    this.spr.setRotation?.(0);
    this.draw();
    return this;
  }

  // Start the next attempt without teleporting across the goalmouth. All save
  // state is cleared immediately, then the dedicated return atlas carries the
  // keeper back to his mark while the player is already allowed to aim.
  resetForNextAttempt() {
    if (this.destroyed) return this;
    // Start the return from where the body is drawn (including any
    // presentation offset of an unfinished save), not the physics root.
    const previousX = Number.isFinite(this.x)
      ? clamp(this.x + this.getPresentationOffsetX(), -this.halfGoal + 0.4, this.halfGoal - 0.4)
      : this.homeX;
    // A keeper already jogging home keeps his stride: restarting the return
    // clip here snapped him from mid-step back to the hand-off pose.
    const returning = this.state === 'return';
    const stride = {
      stateT: this.stateT,
      footworkDistance: this.footworkDistance,
      moveVx: this.moveVx
    };
    this.reset();
    if (Math.abs(previousX - this.homeX) < 0.08 || this.reducedMotion) return this;
    this.x = previousX;
    this.diveStartX = previousX;
    this.contactRootX = previousX;
    this.landingRootX = previousX;
    this.state = 'return';
    this.pose = 'recovery';
    this.stateT = 0;
    this.footworkDistance = 0;
    this.returnDirection = Math.sign(this.homeX - previousX);
    this.moveVx = 0;
    if (returning && Math.sign(stride.moveVx || this.returnDirection) === this.returnDirection) {
      this.stateT = stride.stateT;
      this.footworkDistance = stride.footworkDistance;
      this.moveVx = stride.moveVx;
    }
    this.draw();
    return this;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.flashTimer?.remove?.(false);
    this.flashTimer = null;
    this.ghost?.destroy?.();
    this.spr?.destroy?.();
    this.ghost = null;
    this.spr = null;
  }
}
