import { project, GOAL_W, GOAL_H, BALL_R, PHYS } from '../config.js';

const KEEPER_H = 1.95;
const DIVE_H = 1.35;
const GROUND_Y = 0.36;      // body centre height when lying on the turf
const HALF_GOAL = GOAL_W / 2;
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
    this.targetX = 0;
    this.moveTargetX = 0;
    this.targetY = 1;
    this.diveDir = 1;
    this.catchY = 1;
    this.landY = GROUND_Y;
    this.landVy = 0;
    this.grounded = false;
    this.contactPulse = 0;
    this.idlePhase = this._random() * Math.PI * 2;
    this.spr = scene.add.sprite(0, 0, scene.textures?.exists?.('keeper-hd') ? 'keeper-hd' : 'keeper');
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
    this.diveDir = this.targetX >= this.x ? 1 : -1;
    this.moveTargetX = clamp(
      this.targetX - this.diveDir * (0.42 + this.skill * 0.10),
      -HALF_GOAL + 0.55,
      HALF_GOAL - 0.55
    );

    this.reactT = (0.13 + (1 - this.skill) * 0.25) * this.profile.reaction;
    this.setT = (0.045 + (1 - this.skill) * 0.09) * this.profile.set;
    this.diveDuration = (0.30 + (1 - this.skill) * 0.12) / Math.sqrt(this.profile.speed);
    this.state = 'read';
    this.pose = 'ready';
    this.stateT = 0;
    this.diveP = 0;
    this.moveVx = 0;
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
      case 'read':
        this.stateT += dt;
        this.pose = 'ready';
        this.x += (this.moveTargetX * 0.18 - this.x) * Math.min(dt * 5, 1);
        if (this.stateT >= this.reactT) {
          this.state = 'set';
          this.stateT = 0;
        }
        break;

      case 'set':
        this.stateT += dt;
        this.pose = 'ready';
        this.x += (this.moveTargetX * 0.42 - this.x) * Math.min(dt * 8, 1);
        if (this.stateT >= this.setT) {
          this.state = 'dive';
          this.pose = 'dive';
          this.stateT = 0;
          this.diveP = 0;
        }
        break;

      case 'dive': {
        this.stateT += dt;
        this.pose = 'dive';
        this.diveP = clamp(this.stateT / this.diveDuration, 0, 1);

        const maxSpeed = (4.8 + this.skill * 4.2) * this.profile.speed;
        const acceleration = (22 + this.skill * 20) * this.profile.speed;
        const deltaX = this.moveTargetX - this.x;
        const desiredVx = clamp(deltaX * 13, -maxSpeed, maxSpeed);
        this.moveVx += clamp(desiredVx - this.moveVx, -acceleration * dt, acceleration * dt);
        const nextX = this.x + this.moveVx * dt;
        if ((this.moveTargetX - this.x) * (this.moveTargetX - nextX) <= 0) {
          this.x = this.moveTargetX;
          this.moveVx = 0;
        } else {
          this.x = nextX;
        }

        if (this.stateT >= this.diveDuration) {
          // Full stretch reached - now gravity takes over and he comes down.
          this.state = 'land';
          this.stateT = 0;
          this.landY = lerp(0.95, clamp(this.targetY, 0.5, 2.45), 1);
          this.landVy = 0;
          this.grounded = false;
        }
        break;
      }

      case 'land':
        this.stateT += dt;
        this.pose = 'dive';
        if (!this.grounded) {
          this.landVy += 9.2 * dt;
          this.landY -= this.landVy * dt;
          // A touch of slide keeps the momentum honest.
          this.x = clamp(this.x + this.moveVx * dt * 0.5, -HALF_GOAL + 0.4, HALF_GOAL - 0.4);
          this.moveVx *= Math.max(0, 1 - 3.2 * dt);
          if (this.landY <= GROUND_Y) {
            this.landY = GROUND_Y;
            this.grounded = true;
            this.contactPulse = Math.max(this.contactPulse, 0.55);
          }
        } else {
          this.x = clamp(this.x + this.moveVx * dt * 0.35, -HALF_GOAL + 0.4, HALF_GOAL - 0.4);
          this.moveVx *= Math.max(0, 1 - 5 * dt);
          if (this.stateT >= 0.55) {
            this.state = 'return';
            this.pose = 'idle';
            this.stateT = 0;
          }
        }
        break;

      case 'return':
        this.stateT += dt;
        this.pose = 'idle';
        this.x += (0 - this.x) * Math.min(dt * 3, 1);
        if (Math.abs(this.x) <= 0.06) {
          this.state = 'idle';
          this.stateT = 0;
          this.x = clamp(this.x, -0.06, 0.06);
          this.moveVx = 0;
          this.diveP = 0;
        }
        break;

      case 'catch':
        this.pose = 'catch';
        break;

      default:
        this.state = 'idle';
        this.pose = 'idle';
        this.idleClock += dt;
        this.x = Math.sin(this.idleClock * 1.2 + this.idlePhase) * 0.38;
    }
  }

  getContactPose() {
    const progress = smoothstep(this.diveP);
    let y;
    if (this.state === 'catch') {
      y = this.catchY;
    } else if (this.state === 'land') {
      y = this.landY;
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

  draw() {
    if (this.pose === 'dive') {
      const contact = this.getContactPose();
      const pos = project(this.x, contact.y, this.z);
      const authoredRight = this.diveDir > 0 && this.scene.textures?.exists?.('keeper-dive-right-hd');
      const diveTexture = authoredRight
        ? 'keeper-dive-right-hd'
        : (this.scene.textures?.exists?.('keeper-dive-hd') ? 'keeper-dive-hd' : 'keeper-dive');
      this.spr.setTexture(diveTexture).setOrigin(0.5, 0.5);
      const hasAuthoredLeft = this.scene.textures?.exists?.('keeper-dive-hd');
      this.spr.setFlipX(hasAuthoredLeft ? (!authoredRight && this.diveDir > 0) : this.diveDir < 0);
      this.spr.setPosition(pos.x, pos.y);
      const textureH = this.spr.texture?.source?.[0]?.height || 9;
      const baseScale = (pos.s * DIVE_H) / textureH;
      const pulse = this.reducedMotion ? 1 : 1 + this.contactPulse * 0.06;
      if (this.state === 'land') {
        // Grounded: settle flat with a small impact squash on touchdown.
        const squash = this.reducedMotion || !this.grounded ? 1 : 1 - Math.min(this.contactPulse, 0.5) * 0.12;
        this.spr.setScale(baseScale * pulse, baseScale * squash * pulse);
        this.spr.setRotation?.(0);
      } else {
        // Mid-air: reach for the ball, arcing the body into the dive.
        const extension = this.reducedMotion ? 1 : 0.92 + contact.progress * 0.08;
        this.spr.setScale(baseScale * extension * pulse, baseScale * (2 - extension) * pulse);
        this.spr.setRotation?.(this.reducedMotion ? 0 : this.diveDir * (1 - contact.progress) * 0.06);
      }
    } else {
      const pos = project(this.x, 0, this.z);
      const texture = this.pose === 'catch'
        ? (this.scene.textures?.exists?.('keeper-catch-hd') ? 'keeper-catch-hd' : 'keeper-catch')
        : (this.scene.textures?.exists?.('keeper-hd') ? 'keeper-hd' : 'keeper');
      this.spr.setTexture(texture).setOrigin(0.5, 1);
      this.spr.setFlipX(false);
      this.spr.setPosition(pos.x, pos.y);
      const textureH = this.spr.texture?.source?.[0]?.height || 28;
      const baseScale = (pos.s * KEEPER_H) / textureH;
      const setting = !this.reducedMotion && this.state === 'set';
      const reading = !this.reducedMotion && this.state === 'read';
      const rising = !this.reducedMotion && this.state === 'return' && this.stateT < 0.22;
      const pulse = this.reducedMotion ? 1 : 1 + this.contactPulse * 0.06;
      this.spr.setScale(
        baseScale * (setting ? 1.055 : reading ? 1.018 : rising ? 1.04 : 1) * pulse,
        baseScale * (setting ? 0.925 : reading ? 0.985 : rising ? 0.94 : 1) * pulse
      );
      this.spr.setRotation?.(
        this.reducedMotion ? 0 : this.diveDir * (setting ? 0.018 : reading ? 0.008 : 0)
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
          { part: 'hands', x: pose.x - 0.38, y: 1.18, rx: 0.30 + BALL_R, ry: 0.32 + BALL_R },
          { part: 'hands', x: pose.x + 0.38, y: 1.18, rx: 0.30 + BALL_R, ry: 0.32 + BALL_R },
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
    this.state = 'catch';
    this.pose = 'catch';
    this.catchY = clamp(pt?.y ?? 1, 0.35, 2.15);
    this.x = clamp(pt?.x ?? this.x, -HALF_GOAL + 0.5, HALF_GOAL - 0.5);
    this.moveVx = 0;
    this.impact(pt, null);
  }

  impact(pt = null, ball = null) {
    this.contactPulse = 1;
    this.spr.setTint?.(0xfff3c4);
    this.scene.time?.delayedCall?.(95, () => this.spr?.clearTint?.());
    // A parry knocks some momentum out of the dive so the deflection reads.
    if (ball && (this.state === 'dive' || this.state === 'land')) {
      this.moveVx *= 0.4;
      this.landVy = Math.max(this.landVy, 1.2);
    }
  }

  reset() {
    this.state = 'idle';
    this.pose = 'idle';
    this.stateT = 0;
    this.idleClock = 0;
    this.x = 0;
    this.moveVx = 0;
    this.diveP = 0;
    this.targetX = 0;
    this.targetY = 1;
    this.catchY = 1;
    this.landY = GROUND_Y;
    this.landVy = 0;
    this.grounded = false;
    this.contactPulse = 0;
    this.spr.clearTint?.();
    this.spr.setRotation?.(0);
    this.draw();
  }

  destroy() {
    this.spr.destroy();
  }
}
