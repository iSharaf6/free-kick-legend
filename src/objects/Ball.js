import { CAM, BALL_R, GOAL_W, GOAL_H, PHYS } from '../config.js';

const EPSILON = 1e-8;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function windVector(value = PHYS.wind) {
  return {
    x: finite(value?.x),
    y: finite(value?.y),
    z: finite(value?.z)
  };
}

// Deterministic pseudo-3D ball model. update() remains compatible with the
// scene's variable render delta, but divides it into bounded physics steps.
// A scene with its own fixed accumulator can call step() once per fixed tick.
export class Ball {
  constructor(options = {}) {
    this.wind = windVector(options.wind);
    this.prev = null;
    this.reset(options.x ?? 0);
  }

  reset(x = 0) {
    this.x = finite(x);
    this.y = BALL_R;
    this.z = CAM.ballDist;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.spin = 0;
    this.rot = 0;
    this.flying = false;
    this.grounded = true;
    this.inNet = false;
    this.netBackZ = null;
    this.prev = null;
  }

  kick(vx, vy, vz, spin = 0) {
    this.vx = finite(vx);
    this.vy = finite(vy);
    this.vz = finite(vz);
    this.spin = clamp(finite(spin), -1.5, 1.5);
    this.flying = true;
    this.grounded = this.vy <= 0 && this.y <= BALL_R + EPSILON;
    this.inNet = false;
    this.netBackZ = null;
  }

  setWind(value, y, z) {
    this.wind = typeof value === 'object'
      ? windVector(value)
      : windVector({ x: value, y, z });
    return this;
  }

  // Call after a valid goal. When backZ is supplied, the ball also rebounds
  // softly from the back net rather than travelling through the stadium.
  enterNet(backZ = null) {
    this.inNet = true;
    this.netBackZ = Number.isFinite(backZ) ? backZ : null;
    return this;
  }

  leaveNet() {
    this.inNet = false;
    this.netBackZ = null;
    return this;
  }

  update(dt) {
    if (!this.flying || !Number.isFinite(dt) || dt <= 0) return 0;

    const frameDt = Math.min(dt, PHYS.maxFrameDt);
    const steps = Math.min(
      PHYS.maxSubsteps,
      Math.max(1, Math.ceil(frameDt / PHYS.fixedStep - EPSILON))
    );
    const stepDt = frameDt / steps;

    this._capturePrevious();
    for (let i = 0; i < steps && this.flying; i++) this._integrate(stepDt);
    return steps;
  }

  // One simulation step for a scene-owned fixed timestep. Collision queries
  // should run after every call so a response happens at the crossing tick.
  step(dt = PHYS.fixedStep) {
    if (!this.flying || !Number.isFinite(dt) || dt <= 0) return false;
    this._capturePrevious();
    this._integrate(Math.min(dt, PHYS.maxFrameDt));
    return true;
  }

  _capturePrevious() {
    if (!this.prev) this.prev = { x: this.x, y: this.y, z: this.z };
    else {
      this.prev.x = this.x;
      this.prev.y = this.y;
      this.prev.z = this.z;
    }
  }

  _integrate(dt) {
    // Scene collision responses may write a positive vertical impulse directly
    // (wall/keeper parries). Honour it even if the ball had been rolling.
    if (this.grounded && (this.y > BALL_R + EPSILON || this.vy > EPSILON)) {
      this.grounded = false;
    }
    if (this.grounded) this._integrateGrounded(dt);
    else this._integrateAirborne(dt);

    if (this.inNet) this._resolveNetBounds();
  }

  _resolveNetBounds() {
    const maxX = GOAL_W / 2 - BALL_R;
    if (Math.abs(this.x) > maxX) {
      const side = Math.sign(this.x) || 1;
      this.x = side * maxX;
      if (this.vx * side > 0) this.vx *= -PHYS.netBounce;
      this.vz *= 0.72;
      this.spin *= 0.55;
    }

    const roofY = GOAL_H - BALL_R;
    if (this.y > roofY) {
      this.y = roofY;
      if (this.vy > 0) this.vy *= -PHYS.netBounce;
      this.vx *= 0.72;
      this.vz *= 0.72;
      this.spin *= 0.55;
    }

    if (Number.isFinite(this.netBackZ) && this.vz > 0 && this.z + BALL_R >= this.netBackZ) {
      this.z = this.netBackZ - BALL_R;
      this.vz = -Math.min(this.vz * PHYS.netBounce, 1.4);
      this.vx *= 0.55;
      this.vy *= 0.55;
      this.spin *= 0.5;
    }
  }

  _integrateAirborne(dt) {
    const relX = this.vx - this.wind.x;
    const relY = this.vy - this.wind.y;
    const relZ = this.vz - this.wind.z;

    // Sidespin is angular velocity around the vertical axis. omega x velocity
    // produces lateral curl plus a small physically-consistent forward term.
    const magnusX = this.spin * PHYS.magnus * relZ;
    const magnusZ = -this.spin * PHYS.magnus * relX;

    this.vx += (-PHYS.drag * relX + magnusX) * dt;
    this.vy += (-PHYS.gravity - PHYS.drag * relY) * dt;
    this.vz += (-PHYS.drag * relZ + magnusZ) * dt;

    const spinDamping = Math.exp(-PHYS.spinDecay * dt);
    this.spin *= spinDamping;

    if (this.inNet) {
      const netDamping = Math.exp(-PHYS.netDrag * dt);
      this.vx *= netDamping;
      this.vy *= netDamping;
      this.vz *= netDamping;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this._rollVisual(dt);

    if (this.y <= BALL_R && this.vy <= 0) this._resolveGroundContact();
  }

  _integrateGrounded(dt) {
    this.y = BALL_R;
    this.vy = 0;

    const dampingRate = PHYS.rollingDrag + (this.inNet ? PHYS.netDrag : 0);
    const damping = Math.exp(-dampingRate * dt);
    this.vx *= damping;
    this.vz *= damping;
    this.spin *= Math.exp(-(PHYS.spinDecay + PHYS.rollingDrag * 0.5) * dt);

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this._rollVisual(dt);

    if (Math.hypot(this.vx, this.vz) < PHYS.stopSpeed) {
      this.vx = 0;
      this.vz = 0;
      if (Math.abs(this.spin) < 0.03) this.spin = 0;
      this.flying = false;
    }
  }

  _resolveGroundContact() {
    this.y = BALL_R;
    this.vx *= PHYS.impactFriction;
    this.vz *= PHYS.impactFriction;
    this.spin *= PHYS.impactFriction;

    if (this.vy < -PHYS.groundImpactMin) {
      this.vy *= -PHYS.bounce;
      this.grounded = false;
    } else {
      this.vy = 0;
      this.grounded = true;
    }
  }

  _rollVisual(dt) {
    const travelSpeed = Math.hypot(this.vx, this.vz);
    this.rot += (travelSpeed * 0.35 + Math.abs(this.spin) * 3) * dt;
  }

  // Did the ball pass through the plane at zPlane during the last step/update?
  crossed(zPlane) {
    return this.prev !== null && this.prev.z < zPlane && this.z >= zPlane;
  }

  // Interpolated (x, y) at the moment of crossing zPlane.
  pointAt(zPlane) {
    if (!this.prev) return { x: this.x, y: this.y };
    const dz = this.z - this.prev.z;
    if (Math.abs(dz) < EPSILON) return { x: this.x, y: this.y };
    const t = clamp((zPlane - this.prev.z) / dz, 0, 1);
    return {
      x: this.prev.x + (this.x - this.prev.x) * t,
      y: this.prev.y + (this.y - this.prev.y) * t
    };
  }

  // Uses the same deterministic solver as live play, so keeper reads and
  // cinematic checks cannot drift from the actual trajectory model.
  predictAt(zPlane, maxTime = 5) {
    if (!Number.isFinite(zPlane) || zPlane <= this.z + EPSILON) {
      return { x: this.x, y: this.y, T: 0, reached: zPlane <= this.z + EPSILON };
    }

    const sim = this._predictionClone();
    let elapsed = 0;

    while (elapsed < maxTime && sim.flying) {
      const h = Math.min(PHYS.fixedStep, maxTime - elapsed);
      const startZ = sim.z;
      sim.step(h);

      if (sim.crossed(zPlane)) {
        const dz = sim.z - startZ;
        const fraction = Math.abs(dz) < EPSILON ? 1 : clamp((zPlane - startZ) / dz, 0, 1);
        const point = sim.pointAt(zPlane);
        return {
          x: point.x,
          y: point.y,
          T: elapsed + h * fraction,
          reached: true,
          vx: sim.vx,
          vy: sim.vy,
          vz: sim.vz
        };
      }

      elapsed += h;
      if (sim.vz <= 0 && sim.z < zPlane) break;
    }

    return {
      x: sim.x,
      y: sim.y,
      T: elapsed,
      reached: false,
      vx: sim.vx,
      vy: sim.vy,
      vz: sim.vz
    };
  }

  _predictionClone() {
    const sim = new Ball({ wind: this.wind });
    sim.x = this.x;
    sim.y = this.y;
    sim.z = this.z;
    sim.vx = this.vx;
    sim.vy = this.vy;
    sim.vz = this.vz;
    sim.spin = this.spin;
    sim.rot = this.rot;
    sim.flying = this.flying || Math.hypot(this.vx, this.vy, this.vz) >= PHYS.stopSpeed;
    sim.grounded = this.grounded;
    sim.inNet = this.inNet;
    sim.netBackZ = this.netBackZ;
    sim.prev = null;
    return sim;
  }
}
