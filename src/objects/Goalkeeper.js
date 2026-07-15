import { project, GOAL_W, GOAL_H, BALL_R, PHYS } from '../config.js';

const KEEPER_H = 1.95;
const DIVE_H = 1.35;
const GROUND_Y = 0;         // visual root height above the pitch
const HALF_GOAL = GOAL_W / 2;
const KEEPER_ANIMATION_TEXTURE = 'keeper-anim-hd';
const KEEPER_RECOVERY_TEXTURE = 'keeper-recovery-hd';
const KEEPER_DIVE_MOTION_TEXTURE = 'keeper-dive-motion-hd';
const KEEPER_FOOTWORK_TEXTURE = 'keeper-footwork-hd';
const KEEPER_HANDLING_TEXTURE = 'keeper-handling-hd';
const KEEPER_HIGH_CLAIM_TEXTURE = 'keeper-high-claim-hd';
const KEEPER_STANDING_REFERENCE_H = 210;
const KEEPER_DIVE_REFERENCE_H = 180;
const KEEPER_RECOVERY_REFERENCE_H = 242;
const KEEPER_RECOVERY_IMPACT_REFERENCE_H = 286;
const KEEPER_MOTION_REFERENCE_H = 200;
const KEEPER_HANDLING_REFERENCE_H = 205;
const GROUND_RECOVERY_DURATION = 0.78;
const GROUND_IMPACT_HOLD = 0.10;
const CONTACT_PROGRESS = 0.68;
const CONTACT_HOLD_DURATION = 0.058;
const RETURN_SPEED = 2.8;
const RETURN_ACCELERATION = 18;
const TRACK_ACCELERATION = 14;
const STANDING_SAVE_REACH = 0.44;
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

    this.x = 0;
    this.moveVx = 0;
    this.pose = 'idle';
    this.state = 'idle';
    this.stateT = 0;
    this.idleClock = 0;
    this.reactT = 0;
    this.setT = 0;
    this.diveDuration = 0.36;
    this.diveP = 0;
    this.diveStartX = 0;
    this.contactRootX = 0;
    this.landingRootX = 0;
    this.visualLift = 0;
    this.diveHandY = 0.95;
    this.diveVy = 0;
    this.contactLift = 0;
    this.contactHoldT = 0;
    this.contactRegistered = false;
    this.pendingLandImpulse = 0;
    this.targetX = 0;
    this.moveTargetX = 0;
    this.targetY = 1;
    this.diveDir = 1;
    this.catchY = 1;
    this.landY = GROUND_Y;
    this.landVy = 0;
    this.grounded = false;
    this.contactPulse = 0;
    this.footworkDistance = 0;
    this.catchType = 'chest';
    this.catchDuration = 0.82;
    this.standingSave = false;
    this.idlePhase = this._random() * Math.PI * 2;
    this.hasAnimationAtlas = Boolean(scene.textures?.exists?.(KEEPER_ANIMATION_TEXTURE));
    this.hasRecoveryAtlas = Boolean(scene.textures?.exists?.(KEEPER_RECOVERY_TEXTURE));
    this.hasDiveMotionAtlas = Boolean(scene.textures?.exists?.(KEEPER_DIVE_MOTION_TEXTURE));
    this.hasFootworkAtlas = Boolean(scene.textures?.exists?.(KEEPER_FOOTWORK_TEXTURE));
    this.hasHandlingAtlas = Boolean(scene.textures?.exists?.(KEEPER_HANDLING_TEXTURE));
    this.hasHighClaimAtlas = Boolean(scene.textures?.exists?.(KEEPER_HIGH_CLAIM_TEXTURE));
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

  onShot(ball, zGoal) {
    const interceptZ = this.z > ball.z ? this.z : zGoal;
    const prediction = ball.predictAt(interceptZ);
    const flightT = Number.isFinite(prediction.T) ? prediction.T : 0.6;

    // Weak keepers under-read curl and have more perception error, but the
    // error sequence is seeded/replayable instead of depending on Math.random.
    const curl = 0.5 * ball.spin * PHYS.magnus * Math.max(ball.vz, 0) * flightT * flightT;
    const curlRead = clamp(0.52 + this.skill * 0.43 + this.profile.read, 0.42, 0.98);
    const errorX = (this._random() * 2 - 1) * (0.28 + (1 - this.skill) * 1.05) * this.profile.error;
    const errorY = (this._random() * 2 - 1) * (0.12 + (1 - this.skill) * 0.30) * this.profile.error;

    this.targetX = clamp(
      prediction.x - curl * (1 - curlRead) + errorX,
      -HALF_GOAL + 0.35,
      HALF_GOAL - 0.35
    );
    this.targetY = clamp(prediction.y + errorY, 0.28, GOAL_H - 0.28);
    const shotDeltaX = prediction.x - this.x;
    this.diveDir = Math.abs(shotDeltaX) > 0.18
      ? (shotDeltaX >= 0 ? 1 : -1)
      : (this.targetX >= this.x ? 1 : -1);
    // Perception error can make a weak keeper under- or over-shoot the ball,
    // but a clearly left/right shot must never produce an opposite-facing
    // dive. That looked exactly like an inverted animation in motion.
    if (Math.abs(shotDeltaX) > 0.18 && (this.targetX - this.x) * this.diveDir < 0.08) {
      this.targetX = clamp(
        this.x + this.diveDir * Math.max(0.08, Math.min(Math.abs(shotDeltaX) * 0.35, 0.32)),
        -HALF_GOAL + 0.35,
        HALF_GOAL - 0.35
      );
    }
    this.standingSave = Math.abs(shotDeltaX) <= STANDING_SAVE_REACH;
    this.moveTargetX = clamp(
      this.targetX - this.diveDir * (0.42 + this.skill * 0.10),
      -HALF_GOAL + 0.55,
      HALF_GOAL - 0.55
    );

    // Time the contact pose to the ball's actual keeper-plane crossing. Slow
    // shots create more visible tracking footwork; fast shots compress the
    // read without making the keeper complete his dive before the ball arrives.
    this.setT = (0.055 + (1 - this.skill) * 0.045) * this.profile.set;
    this.diveDuration = (0.40 + (1 - this.skill) * 0.08) / Math.sqrt(this.profile.speed);
    const minimumRead = (0.045 + (1 - this.skill) * 0.07) * this.profile.reaction;
    const scheduledRead = flightT - this.setT -
      (this.standingSave ? 0 : this.diveDuration * CONTACT_PROGRESS);
    this.reactT = clamp(scheduledRead, minimumRead, 0.72);
    this.state = 'read';
    this.pose = 'ready';
    this.stateT = 0;
    this.diveP = 0;
    this.moveVx = 0;
    this.visualLift = 0;
    this.diveHandY = 0.95;
    this.contactLift = clamp(this.targetY - 0.86, 0.03, 1.58);
    this.contactHoldT = 0;
    this.contactRegistered = false;
    this.pendingLandImpulse = 0;
    this.footworkDistance = 0;
  }

  update(dt, _time = 0) {
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
    switch (this.state) {
      case 'read': {
        this.stateT += dt;
        this.pose = 'ready';
        const trackTarget = this.moveTargetX * 0.34;
        const maxSpeed = (1.35 + this.skill * 1.25) * this.profile.speed;
        const desiredVx = clamp((trackTarget - this.x) * 8, -maxSpeed, maxSpeed);
        this.moveVx += clamp(
          desiredVx - this.moveVx,
          -TRACK_ACCELERATION * dt,
          TRACK_ACCELERATION * dt
        );
        const previousX = this.x;
        this.x = clamp(this.x + this.moveVx * dt, -HALF_GOAL + 0.55, HALF_GOAL - 0.55);
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
        const plantTarget = this.moveTargetX * 0.52;
        const desiredVx = clamp((plantTarget - this.x) * 10, -2.4, 2.4);
        this.moveVx += clamp(
          desiredVx - this.moveVx,
          -TRACK_ACCELERATION * 1.2 * dt,
          TRACK_ACCELERATION * 1.2 * dt
        );
        const previousX = this.x;
        this.x = clamp(this.x + this.moveVx * dt, -HALF_GOAL + 0.55, HALF_GOAL - 0.55);
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
          this.contactRootX = this.moveTargetX;
          this.landingRootX = clamp(
            this.contactRootX + this.diveDir * (0.20 + this.skill * 0.10),
            -HALF_GOAL + 0.4,
            HALF_GOAL - 0.4
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
        this.x = clamp(this.x, -HALF_GOAL + 0.4, HALF_GOAL - 0.4);
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
          this.x = clamp(this.x + this.moveVx * dt, -HALF_GOAL + 0.4, HALF_GOAL - 0.4);
          this.moveVx *= Math.max(0, 1 - 1.8 * dt);
          if (this.landY <= 0) {
            this.landY = 0;
            this.grounded = true;
            this.stateT = 0;
            this.contactPulse = Math.max(this.contactPulse, 0.55);
          }
        } else {
          this.stateT += dt;
          this.x = clamp(this.x + this.moveVx * dt, -HALF_GOAL + 0.4, HALF_GOAL - 0.4);
          this.moveVx *= Math.max(0, 1 - 5 * dt);
          if (this.stateT >= GROUND_IMPACT_HOLD + GROUND_RECOVERY_DURATION) {
            this.state = 'return';
            this.pose = 'idle';
            this.stateT = 0;
            this.footworkDistance = 0;
          }
        }
        break;

      case 'return': {
        this.stateT += dt;
        this.pose = 'idle';
        this.idleClock += dt;
        const desiredVx = clamp(-this.x * 7, -RETURN_SPEED, RETURN_SPEED);
        this.moveVx += clamp(
          desiredVx - this.moveVx,
          -RETURN_ACCELERATION * dt,
          RETURN_ACCELERATION * dt
        );
        const previousX = this.x;
        const nextX = this.x + this.moveVx * dt;
        if ((this.x < 0 && nextX >= 0) || (this.x > 0 && nextX <= 0)) {
          this.x = 0;
        } else {
          this.x = nextX;
        }
        this.footworkDistance += Math.abs(this.x - previousX);
        if (Math.abs(this.x) <= 0.035 && Math.abs(this.moveVx) <= 0.22) {
          this.state = 'idle';
          this.stateT = 0;
          this.x = 0;
          this.moveVx = 0;
          this.diveP = 0;
          this.visualLift = 0;
        }
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
        }
        break;

      default:
        this.state = 'idle';
        this.pose = 'idle';
        this.idleClock += dt;
        // Idle animation supplies the weight shift; keep planted feet fixed in
        // world space instead of moving the whole sprite independently.
        this.x += (0 - this.x) * Math.min(dt * 5, 1);
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

    const phaseOffset = this.idlePhase / (Math.PI * 2) * 0.88;
    const index = Math.floor((this.idleClock + phaseOffset) / 0.22) % KEEPER_FRAMES.idle.length;
    return KEEPER_FRAMES.idle[index];
  }

  getRecoveryFrame() {
    const base = this.diveDir > 0 ? 0 : 6;
    const progress = clamp(
      (this.stateT - GROUND_IMPACT_HOLD) / GROUND_RECOVERY_DURATION,
      0,
      1
    );
    if (progress < 0.12) return base;
    if (progress < 0.28) return base + 1;
    if (progress < 0.47) return base + 2;
    if (progress < 0.66) return base + 3;
    if (progress < 0.84) return base + 4;
    return base + 5;
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

  getFootworkFrame() {
    let direction = this.moveVx;
    if (Math.abs(direction) < 0.05) {
      direction = this.state === 'return' ? -this.x : this.diveDir;
    }
    // Atlas row one travels screen-left; row two travels screen-right.
    const base = direction >= 0 ? 5 : 0;
    if (Math.abs(this.moveVx) < 0.12 && Math.abs(this.x) < 0.08) return base + 4;
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

  getResultHoldMs() {
    // Let a save finish its physical sequence before the scene resets. This
    // follows the same gravity/recovery/return phases as _step(), so a high
    // save receives more screen time than a low one without slowing all shots.
    const fallTime = (height, downwardVelocity = 0) => {
      const distance = Math.max(0, height);
      return distance <= 0
        ? 0
        : (-downwardVelocity + Math.sqrt(downwardVelocity * downwardVelocity + 2 * 9.2 * distance)) / 9.2;
    };
    const returnDistance = Math.max(Math.abs(this.x), Math.abs(this.landingRootX || 0));
    const returnTime = returnDistance > 0.06 ? returnDistance / RETURN_SPEED + 0.22 : 0;

    let remaining = 0;
    if (this.state === 'dive') {
      remaining += Math.max(0, this.diveDuration - this.stateT);
      remaining += fallTime(Math.max(this.contactLift * 0.52, 0), Math.max(0, -this.diveVy));
      remaining += GROUND_IMPACT_HOLD + GROUND_RECOVERY_DURATION;
    } else if (this.state === 'land') {
      remaining += this.grounded
        ? Math.max(0, GROUND_IMPACT_HOLD + GROUND_RECOVERY_DURATION - this.stateT)
        : fallTime(this.landY, this.landVy) + GROUND_IMPACT_HOLD + GROUND_RECOVERY_DURATION;
    } else if (this.state === 'return') {
      return Math.ceil((Math.abs(this.x) / RETURN_SPEED + 0.28) * 1000);
    } else if (this.state === 'catch') {
      remaining = Math.max(0, this.catchDuration - this.stateT);
    } else {
      return 750;
    }

    return Math.ceil((remaining + returnTime + 0.1) * 1000);
  }

  draw() {
    this.ghost?.setVisible?.(false);
    this.prevDraw = null;

    const groundedRecovery = this.hasRecoveryAtlas &&
      this.state === 'land' &&
      this.grounded &&
      (!this.hasDiveMotionAtlas || this.stateT >= GROUND_IMPACT_HOLD);
    const motionPhase = this.hasDiveMotionAtlas &&
      (this.state === 'set' || this.state === 'dive' || this.state === 'land') &&
      !groundedRecovery;
    const footworkPhase = this.hasFootworkAtlas &&
      (this.state === 'return' || (this.state === 'read' && Math.abs(this.moveVx) > 0.08));
    const highClaim = this.state === 'catch' && this.catchType === 'high' && this.hasHighClaimAtlas;
    const handling = this.state === 'catch' && this.catchType !== 'high' && this.hasHandlingAtlas;

    if (!motionPhase && !groundedRecovery && !footworkPhase && !highClaim && !handling) {
      this.drawLegacy();
      return;
    }

    let texture;
    let frame;
    let referenceHeight;
    let rootLift = 0;

    if (motionPhase) {
      texture = KEEPER_DIVE_MOTION_TEXTURE;
      frame = this.getDiveMotionFrame();
      referenceHeight = KEEPER_MOTION_REFERENCE_H;
      rootLift = this.state === 'dive' ? this.visualLift : this.state === 'land' ? this.landY : 0;
    } else if (groundedRecovery) {
      texture = KEEPER_RECOVERY_TEXTURE;
      frame = this.getRecoveryFrame();
      const recoveryProgress = clamp(
        (this.stateT - GROUND_IMPACT_HOLD) / GROUND_RECOVERY_DURATION,
        0,
        1
      );
      referenceHeight = lerp(
        KEEPER_RECOVERY_IMPACT_REFERENCE_H,
        KEEPER_RECOVERY_REFERENCE_H,
        recoveryProgress
      );
    } else if (footworkPhase) {
      texture = KEEPER_FOOTWORK_TEXTURE;
      frame = this.getFootworkFrame();
      referenceHeight = KEEPER_HANDLING_REFERENCE_H;
    } else if (highClaim) {
      texture = KEEPER_HIGH_CLAIM_TEXTURE;
      frame = this.getHandlingFrame();
      referenceHeight = KEEPER_HANDLING_REFERENCE_H;
    } else {
      texture = KEEPER_HANDLING_TEXTURE;
      frame = this.getHandlingFrame();
      referenceHeight = KEEPER_HANDLING_REFERENCE_H;
    }

    const pos = project(this.x, rootLift, this.z);
    this.spr.setTexture(texture, frame).setFlipX(false).setOrigin(0.5, 1);
    this.spr.setPosition(pos.x, pos.y);
    const baseScale = (pos.s * KEEPER_H) / referenceHeight;
    const pulse = this.reducedMotion ? 1 : 1 + this.contactPulse * 0.045;
    const impactSquash = groundedRecovery && !this.reducedMotion
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
      const texture = usingAtlas
        ? KEEPER_ANIMATION_TEXTURE
        : this.pose === 'catch'
          ? (this.scene.textures?.exists?.('keeper-catch-hd') ? 'keeper-catch-hd' : 'keeper-catch')
          : (this.scene.textures?.exists?.('keeper-hd') ? 'keeper-hd' : 'keeper');
      this.spr.setTexture(texture, animationFrame).setOrigin(0.5, 1);
      this.spr.setFlipX(false);
      this.spr.setPosition(pos.x, pos.y);
      const textureH = usingAtlas ? KEEPER_STANDING_REFERENCE_H : spriteFrameHeight(this.spr);
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
    const shapes = isDiving
      ? [
          {
            part: 'hands',
            x: pose.x + pose.direction * (0.42 + pose.progress * 0.38),
            y: pose.y,
            rx: 0.34 + this.skill * 0.06 + BALL_R,
            ry: 0.34 + this.skill * 0.06 + BALL_R
          },
          {
            part: 'body',
            x: pose.x - pose.direction * 0.24,
            y: pose.y - 0.05,
            rx: 0.62 + BALL_R,
            ry: 0.34 + BALL_R
          }
        ]
      : [
          { part: 'hands', x: pose.x, y: 1.78, rx: 0.38 + BALL_R, ry: 0.48 + BALL_R },
          { part: 'hands', x: pose.x - 0.34, y: 1.18, rx: 0.32 + BALL_R, ry: 0.34 + BALL_R },
          { part: 'hands', x: pose.x + 0.34, y: 1.18, rx: 0.32 + BALL_R, ry: 0.34 + BALL_R },
          { part: 'body', x: pose.x, y: 0.98, rx: 0.38 + BALL_R, ry: 0.88 + BALL_R }
        ];

    let hit = null;
    for (const shape of shapes) {
      const distance = ellipseDistance(pt, shape);
      if (distance <= 1 && (!hit || distance < hit.distance)) hit = { ...shape, distance };
    }
    if (!hit) return false;

    const speed = ball ? Math.hypot(ball.vx, ball.vy, ball.vz) : 20;
    const catchSpeed = 23 + this.skill * 6;
    const secure = hit.part === 'hands'
      ? hit.distance < 0.72
      : hit.distance < 0.52;
    return {
      result: secure && speed <= catchSpeed ? 'catch' : 'parry',
      part: hit.part,
      distance: hit.distance,
      x: hit.x,
      y: hit.y
    };
  }

  saves(pt, ball = null) {
    return this.contact(pt, ball)?.result ?? false;
  }

  catchBall(pt) {
    this.contactPulse = 1;
    this.spr.setTint?.(0xfff3c4);
    this.scene.time?.delayedCall?.(95, () => this.spr?.clearTint?.());

    // A diving catch remains part of the dive. Snapping to an upright catch
    // here was the most visible source of discontinuity at ball contact.
    if (this.state === 'dive' || this.state === 'land') {
      this.contactRegistered = true;
      if (this.state === 'dive') this.contactHoldT = CONTACT_HOLD_DURATION;
      this.pendingLandImpulse = Math.max(this.pendingLandImpulse, 0.55);
      return;
    }

    this.state = 'catch';
    this.pose = 'catch';
    this.stateT = 0;
    this.catchY = clamp(pt?.y ?? 1, 0.35, 2.15);
    const requestedX = clamp(pt?.x ?? this.x, -HALF_GOAL + 0.5, HALF_GOAL - 0.5);
    this.x = clamp(requestedX, this.x - 0.14, this.x + 0.14);
    this.moveVx = 0;
    this.catchType = this.catchY < 0.78 ? 'low' : this.catchY > 1.62 ? 'high' : 'chest';
    this.catchDuration = this.catchType === 'high' ? 0.92 : this.catchType === 'low' ? 0.84 : 0.76;
  }

  impact(pt = null, ball = null) {
    this.contactPulse = 1;
    this.spr.setTint?.(0xfff3c4);
    this.scene.time?.delayedCall?.(95, () => this.spr?.clearTint?.());
    if (!ball) return;

    if (this.state === 'dive' || this.state === 'land') {
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
    this.targetX = clamp(contactX, -HALF_GOAL + 0.35, HALF_GOAL - 0.35);
    this.targetY = clamp(contactY, 0.5, 2.45);
    this.moveTargetX = clamp(
      contactX - this.diveDir * 0.58,
      -HALF_GOAL + 0.55,
      HALF_GOAL - 0.55
    );
    this.state = 'dive';
    this.pose = 'dive';
    this.diveStartX = this.x;
    this.contactRootX = clamp(
      contactX - this.diveDir * 0.50,
      -HALF_GOAL + 0.45,
      HALF_GOAL - 0.45
    );
    this.landingRootX = clamp(
      this.contactRootX + this.diveDir * (0.22 + this.skill * 0.08),
      -HALF_GOAL + 0.4,
      HALF_GOAL - 0.4
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
    this.state = 'idle';
    this.pose = 'idle';
    this.stateT = 0;
    this.idleClock = 0;
    this.x = 0;
    this.moveVx = 0;
    this.diveP = 0;
    this.diveStartX = 0;
    this.contactRootX = 0;
    this.landingRootX = 0;
    this.visualLift = 0;
    this.diveHandY = 0.95;
    this.diveVy = 0;
    this.contactLift = 0;
    this.contactHoldT = 0;
    this.contactRegistered = false;
    this.pendingLandImpulse = 0;
    this.targetX = 0;
    this.moveTargetX = 0;
    this.targetY = 1;
    this.catchY = 1;
    this.landY = GROUND_Y;
    this.landVy = 0;
    this.grounded = false;
    this.contactPulse = 0;
    this.footworkDistance = 0;
    this.catchType = 'chest';
    this.catchDuration = 0.82;
    this.standingSave = false;
    this.spr.clearTint?.();
    this.spr.setRotation?.(0);
    this.draw();
  }

  destroy() {
    this.ghost?.destroy?.();
    this.spr.destroy();
  }
}
