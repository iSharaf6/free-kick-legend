import Body from 'phaser/src/physics/matter-js/lib/body/Body.js';
import Composite from 'phaser/src/physics/matter-js/lib/body/Composite.js';
import Sleeping from 'phaser/src/physics/matter-js/lib/core/Sleeping.js';
import Constraint from 'phaser/src/physics/matter-js/lib/constraint/Constraint.js';
import Bodies from 'phaser/src/physics/matter-js/lib/factory/Bodies.js';

export const PUPPET_HEIGHT = 75;

const PARTS = Object.freeze({
  head: Object.freeze({ width: 12, height: 14, round: true, layer: 8 }),
  torso: Object.freeze({ width: 18, height: 24, layer: 4 }),
  leftUpperArm: Object.freeze({ width: 7, height: 16, texture: 'upper-arm', layer: 6 }),
  leftLowerArm: Object.freeze({ width: 6, height: 16, texture: 'lower-arm', layer: 7 }),
  rightUpperArm: Object.freeze({ width: 7, height: 16, texture: 'upper-arm', layer: 6 }),
  rightLowerArm: Object.freeze({ width: 6, height: 16, texture: 'lower-arm', layer: 7 }),
  leftUpperLeg: Object.freeze({ width: 8, height: 18, texture: 'upper-leg', layer: 2 }),
  leftLowerLeg: Object.freeze({ width: 7, height: 19, texture: 'lower-leg', layer: 1 }),
  rightUpperLeg: Object.freeze({ width: 8, height: 18, texture: 'upper-leg', layer: 3 }),
  rightLowerLeg: Object.freeze({ width: 7, height: 19, texture: 'lower-leg', layer: 2 })
});

const JOINTS = Object.freeze([
  { name: 'neck', parent: 'torso', child: 'head', a: [0, -12], b: [0, 6], min: -0.52, max: 0.52 },
  { name: 'leftShoulder', parent: 'torso', child: 'leftUpperArm', a: [-8, -7], b: [0, -8], min: -2.82, max: 2.82 },
  { name: 'leftElbow', parent: 'leftUpperArm', child: 'leftLowerArm', a: [0, 8], b: [0, -8], min: -2.45, max: 0.42 },
  { name: 'rightShoulder', parent: 'torso', child: 'rightUpperArm', a: [8, -7], b: [0, -8], min: -2.82, max: 2.82 },
  { name: 'rightElbow', parent: 'rightUpperArm', child: 'rightLowerArm', a: [0, 8], b: [0, -8], min: -0.42, max: 2.45 },
  { name: 'leftHip', parent: 'torso', child: 'leftUpperLeg', a: [-4, 12], b: [0, -9], min: -0.82, max: 0.82 },
  { name: 'leftKnee', parent: 'leftUpperLeg', child: 'leftLowerLeg', a: [0, 9], b: [0, -9.5], min: -0.12, max: 2.25 },
  { name: 'rightHip', parent: 'torso', child: 'rightUpperLeg', a: [4, 12], b: [0, -9], min: -0.82, max: 0.82 },
  { name: 'rightKnee', parent: 'rightUpperLeg', child: 'rightLowerLeg', a: [0, 9], b: [0, -9.5], min: -2.25, max: 0.12 }
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rotate(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function normalizeAngle(angle) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function endpoint(center, halfLength, angle) {
  const offset = rotate(0, halfLength, angle);
  return { x: center.x + offset.x, y: center.y + offset.y };
}

function fromTop(joint, halfLength, angle) {
  const offset = rotate(0, -halfLength, angle);
  return { x: joint.x - offset.x, y: joint.y - offset.y };
}

function fromBottom(joint, halfLength, angle) {
  const offset = rotate(0, halfLength, angle);
  return { x: joint.x - offset.x, y: joint.y - offset.y };
}

function transform(center, localX, localY, angle, scale) {
  const offset = rotate(localX * scale, localY * scale, angle);
  return { x: center.x + offset.x, y: center.y + offset.y };
}

function poseAngles(name, phase = 0, direction = 1, progress = 0) {
  const breath = Math.sin(phase) * 0.025;
  if (name === 'wall-jump') {
    return {
      torso: breath,
      head: -breath * 0.5,
      leftUpperArm: 2.56, leftLowerArm: 2.84,
      rightUpperArm: -2.56, rightLowerArm: -2.84,
      leftUpperLeg: 0.26, leftLowerLeg: -0.38,
      rightUpperLeg: -0.26, rightLowerLeg: 0.38
    };
  }
  if (name === 'keeper-ready') {
    return {
      torso: breath,
      head: -breath,
      leftUpperArm: 0.82, leftLowerArm: 0.52,
      rightUpperArm: -0.82, rightLowerArm: -0.52,
      leftUpperLeg: 0.13, leftLowerLeg: -0.08,
      rightUpperLeg: -0.13, rightLowerLeg: 0.08
    };
  }
  if (name === 'keeper-catch') {
    return {
      torso: direction * 0.04,
      head: 0,
      leftUpperArm: 2.58, leftLowerArm: 2.92,
      rightUpperArm: -2.58, rightLowerArm: -2.92,
      leftUpperLeg: 0.08, leftLowerLeg: 0,
      rightUpperLeg: -0.08, rightLowerLeg: 0
    };
  }
  if (name === 'keeper-dive') {
    const reach = 1.22 + progress * 0.32;
    const torso = direction * reach;
    return {
      torso,
      head: torso * 0.9,
      leftUpperArm: -direction * (1.26 + progress * 0.22),
      leftLowerArm: -direction * (1.42 + progress * 0.12),
      rightUpperArm: -direction * (1.14 + progress * 0.28),
      rightLowerArm: -direction * (1.36 + progress * 0.16),
      leftUpperLeg: direction * (1.0 + progress * 0.2),
      leftLowerLeg: direction * (1.25 - progress * 0.1),
      rightUpperLeg: direction * (1.3 + progress * 0.1),
      rightLowerLeg: direction * (0.92 + progress * 0.2)
    };
  }
  // Wall players protect themselves with crossed forearms; the small phase
  // offsets stop a row of defenders looking like cloned cardboard cut-outs.
  return {
    torso: breath,
    head: -breath * 0.7,
    leftUpperArm: -0.42 + breath, leftLowerArm: -1.34,
    rightUpperArm: 0.42 + breath, rightLowerArm: 1.34,
    leftUpperLeg: 0.045, leftLowerLeg: -0.025,
    rightUpperLeg: -0.045, rightLowerLeg: 0.025
  };
}

/**
 * Builds a complete pose from an anchor and absolute segment angles. Because
 * every child starts exactly at its parent's joint, releasing the static pose
 * into Matter does not create a one-frame constraint explosion.
 */
function buildPose(config, scale) {
  const angles = poseAngles(config.pose, config.phase, config.direction, config.progress);
  const torso = config.root
    ? { x: config.root.x, y: config.root.y }
    : {
        x: config.x,
        y: config.y - (PARTS.leftLowerLeg.height + PARTS.leftUpperLeg.height + PARTS.torso.height / 2) * scale
      };
  const result = { torso: { ...torso, angle: angles.torso } };

  const neck = transform(torso, 0, -PARTS.torso.height / 2, angles.torso, scale);
  const headCenter = fromBottom(neck, PARTS.head.height * scale / 2, angles.head);
  result.head = { ...headCenter, angle: angles.head };

  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? -1 : 1;
    const upperArmName = `${side}UpperArm`;
    const lowerArmName = `${side}LowerArm`;
    const shoulder = transform(torso, sign * 8, -7, angles.torso, scale);
    const upperArm = fromTop(shoulder, PARTS[upperArmName].height * scale / 2, angles[upperArmName]);
    const elbow = endpoint(upperArm, PARTS[upperArmName].height * scale / 2, angles[upperArmName]);
    const lowerArm = fromTop(elbow, PARTS[lowerArmName].height * scale / 2, angles[lowerArmName]);
    result[upperArmName] = { ...upperArm, angle: angles[upperArmName] };
    result[lowerArmName] = { ...lowerArm, angle: angles[lowerArmName] };

    const upperLegName = `${side}UpperLeg`;
    const lowerLegName = `${side}LowerLeg`;
    const hip = transform(torso, sign * 4, 12, angles.torso, scale);
    const upperLeg = fromTop(hip, PARTS[upperLegName].height * scale / 2, angles[upperLegName]);
    const knee = endpoint(upperLeg, PARTS[upperLegName].height * scale / 2, angles[upperLegName]);
    const lowerLeg = fromTop(knee, PARTS[lowerLegName].height * scale / 2, angles[lowerLegName]);
    result[upperLegName] = { ...upperLeg, angle: angles[upperLegName] };
    result[lowerLegName] = { ...lowerLeg, angle: angles[lowerLegName] };
  }
  return result;
}

export class PuppetRig {
  constructor(scene, options = {}) {
    if (!scene.matter?.world?.add) throw new Error('PuppetRig requires the Phaser Matter physics plugin.');
    this.scene = scene;
    this.kind = options.kind === 'keeper' ? 'keeper' : 'wall';
    this.scale = Math.max(0.12, Number(options.scale) || 1);
    this.depth = options.depth ?? 800;
    this.autoReset = options.autoReset !== false;
    this.autoResetDelay = Math.max(0.25, options.autoResetDelay ?? 0.9);
    this.recoveryDuration = Math.max(0.18, options.recoveryDuration ?? 0.48);
    this.state = 'controlled';
    this.stateTime = 0;
    this.settledFor = 0;
    this.poseConfig = {
      x: options.x || 0,
      y: options.y || 0,
      pose: options.pose || (this.kind === 'keeper' ? 'keeper-ready' : 'wall-idle'),
      phase: options.phase || 0,
      direction: 1,
      progress: 0,
      root: null
    };
    this.bodies = {};
    this.sprites = {};
    this.constraints = [];
    this.jointLimits = [];
    this.recoveryStart = null;
    this.group = Body.nextGroup(true);
    this.composite = Composite.create({ label: `puppet-composite:${this.kind}` });

    this.createBodies();
    this.createJoints();
    Composite.add(this.composite, [...this.bodyList, ...this.constraints]);
    this.scene.matter.world.add(this.composite);
    this.applyPose(buildPose(this.poseConfig, this.scale), true);
    this.syncSprites();
  }

  get bodyList() {
    return Object.values(this.bodies);
  }

  get isControlled() {
    return this.state === 'controlled';
  }

  createBodies() {
    for (const [name, spec] of Object.entries(PARTS)) {
      const common = {
        label: `puppet:${this.kind}:${name}`,
        friction: 0.72,
        frictionStatic: 0.92,
        frictionAir: 0.018,
        restitution: name === 'head' ? 0.16 : 0.06,
        density: name === 'torso' ? 0.0026 : 0.00165,
        chamfer: { radius: Math.max(0.5, Math.min(spec.width, spec.height) * this.scale * 0.22) },
        collisionFilter: { group: this.group }
      };
      const width = spec.width * this.scale;
      const height = spec.height * this.scale;
      const body = spec.round
        ? Bodies.circle(0, 0, width * 0.48, common)
        : Bodies.rectangle(0, 0, width, height, common);
      body.plugin = body.plugin || {};
      body.plugin.puppetRig = this;
      body.plugin.puppetPart = name;
      this.bodies[name] = body;

      const texturePart = spec.texture || name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const texture = `puppet-${this.kind}-${texturePart.replace(/^left-|^right-/, '')}`;
      const sprite = this.scene.add.image(0, 0, texture)
        .setDisplaySize(width, height)
        .setDepth(this.depth + spec.layer);
      if (name.startsWith('right')) sprite.setFlipX(true);
      this.sprites[name] = sprite;
    }
  }

  createJoints() {
    for (const joint of JOINTS) {
      const parent = this.bodies[joint.parent];
      const child = this.bodies[joint.child];
      const constraint = Constraint.create({
        label: `puppet-joint:${joint.name}`,
        bodyA: parent,
        bodyB: child,
        pointA: { x: joint.a[0] * this.scale, y: joint.a[1] * this.scale },
        pointB: { x: joint.b[0] * this.scale, y: joint.b[1] * this.scale },
        length: 0,
        stiffness: 0.88,
        damping: 0.18,
        angularStiffness: 0.035
      });
      this.constraints.push(constraint);
      this.jointLimits.push({ ...joint, parent, child });
    }
  }

  setPose(config = {}) {
    this.poseConfig = {
      ...this.poseConfig,
      ...config,
      root: config.root === undefined ? this.poseConfig.root : config.root
    };
    if (this.state !== 'controlled') return this;
    this.applyPose(buildPose(this.poseConfig, this.scale), true);
    this.syncSprites();
    return this;
  }

  applyPose(pose, makeStatic = false) {
    for (const [name, target] of Object.entries(pose)) {
      const body = this.bodies[name];
      if (makeStatic && !body.isStatic) Body.setStatic(body, true);
      Body.setPosition(body, { x: target.x, y: target.y });
      Body.setAngle(body, target.angle);
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
      Sleeping.set(body, false);
    }
  }

  closestBody(point) {
    let closest = this.bodies.torso;
    let best = Infinity;
    for (const body of this.bodyList) {
      const distance = (body.position.x - point.x) ** 2 + (body.position.y - point.y) ** 2;
      if (distance < best) {
        best = distance;
        closest = body;
      }
    }
    return closest;
  }

  /**
   * Releases every segment into the Matter world and applies velocity at the
   * actual contact point. `impulse` is expressed as a readable target velocity
   * rather than Matter's tiny force units, which makes match tuning stable.
   */
  triggerRagdoll(point, impulse = { x: 5, y: -2 }) {
    const contact = point || this.bodies.torso.position;
    const velocity = {
      x: clamp(Number(impulse.x) || 0, -6, 6),
      y: clamp(Number(impulse.y) || 0, -6, 6)
    };
    const firstImpact = this.state !== 'ragdoll';
    this.state = 'ragdoll';
    this.stateTime = 0;
    this.settledFor = 0;

    if (firstImpact) {
      for (const body of this.bodyList) {
        Body.setStatic(body, false);
        Sleeping.set(body, false);
        Body.setVelocity(body, { x: velocity.x * 0.12, y: velocity.y * 0.12 });
      }
    }

    const hitBody = this.closestBody(contact);
    Body.setVelocity(hitBody, velocity);
    Body.setVelocity(this.bodies.torso, {
      x: velocity.x * 0.42,
      y: velocity.y * 0.42
    });
    const lever = clamp((contact.x - hitBody.position.x) / Math.max(hitBody.bounds.max.x - hitBody.bounds.min.x, 1), -1, 1);
    Body.setAngularVelocity(hitBody, clamp(lever * 0.24 + velocity.x * 0.012, -0.34, 0.34));
    const forceScale = hitBody.mass * 0.00055;
    Body.applyForce(hitBody, contact, {
      x: velocity.x * forceScale,
      y: velocity.y * forceScale
    });
    return hitBody.plugin?.puppetPart || 'torso';
  }

  /** Used by the standalone lab, where the ball itself is a Matter body. */
  handleMatterImpact(ballBody, playerBody, pair, threshold = 4.2) {
    if (!playerBody?.plugin?.puppetRig || playerBody.plugin.puppetRig !== this) return false;
    const relative = {
      x: ballBody.velocity.x - playerBody.velocity.x,
      y: ballBody.velocity.y - playerBody.velocity.y
    };
    const speed = Math.hypot(relative.x, relative.y);
    if (speed < threshold) return false;
    const support = pair?.collision?.supports?.[0];
    const point = support || { x: ballBody.position.x, y: ballBody.position.y };
    this.triggerRagdoll(point, {
      x: relative.x * 0.26,
      y: relative.y * 0.26
    });
    return true;
  }

  enforceJointLimits() {
    for (const joint of this.jointLimits) {
      const relative = normalizeAngle(joint.child.angle - joint.parent.angle);
      let error = 0;
      if (relative < joint.min) error = relative - joint.min;
      else if (relative > joint.max) error = relative - joint.max;
      if (error === 0) continue;

      // Matter pin constraints do not include angular stops. A small positional
      // correction plus opposing angular velocity behaves like a soft joint
      // limit without the instability of snapping to the limit in one frame.
      const correction = clamp(error * 0.12, -0.065, 0.065);
      Body.setAngle(joint.child, joint.child.angle - correction);
      Body.setAngularVelocity(joint.child, joint.child.angularVelocity - correction * 0.45);
      if (!joint.parent.isStatic) {
        Body.setAngularVelocity(joint.parent, joint.parent.angularVelocity + correction * 0.12);
      }
    }
  }

  beginRecovery() {
    this.state = 'recovering';
    this.stateTime = 0;
    this.recoveryStart = {};
    for (const [name, body] of Object.entries(this.bodies)) {
      this.recoveryStart[name] = {
        x: body.position.x,
        y: body.position.y,
        angle: body.angle
      };
      Body.setStatic(body, true);
    }
  }

  updateRecovery(dt) {
    this.stateTime += dt;
    const raw = clamp(this.stateTime / this.recoveryDuration, 0, 1);
    const t = raw * raw * (3 - 2 * raw);
    const target = buildPose(this.poseConfig, this.scale);
    for (const [name, body] of Object.entries(this.bodies)) {
      const start = this.recoveryStart[name];
      const end = target[name];
      Body.setPosition(body, {
        x: lerp(start.x, end.x, t),
        y: lerp(start.y, end.y, t)
      });
      Body.setAngle(body, start.angle + normalizeAngle(end.angle - start.angle) * t);
    }
    if (raw >= 1) {
      this.state = 'controlled';
      this.stateTime = 0;
      this.recoveryStart = null;
      this.applyPose(target, true);
    }
  }

  update(dt = 1 / 60) {
    const safeDt = clamp(Number(dt) || 0, 0, 0.1);
    if (this.state === 'ragdoll') {
      this.stateTime += safeDt;
      this.enforceJointLimits();
      const bodies = this.bodyList;
      const quiet = bodies.every((body) => body.isSleeping || (body.speed < 0.22 && body.angularSpeed < 0.035));
      this.settledFor = quiet ? this.settledFor + safeDt : 0;
      if (this.autoReset && this.stateTime > 1.05 && this.settledFor >= this.autoResetDelay) {
        this.beginRecovery();
      }
    } else if (this.state === 'recovering') {
      this.updateRecovery(safeDt);
    }
    this.syncSprites();
  }

  reset(config = {}) {
    this.state = 'controlled';
    this.stateTime = 0;
    this.settledFor = 0;
    this.recoveryStart = null;
    this.poseConfig = { ...this.poseConfig, ...config };
    this.applyPose(buildPose(this.poseConfig, this.scale), true);
    this.syncSprites();
    return this;
  }

  syncSprites() {
    for (const [name, body] of Object.entries(this.bodies)) {
      this.sprites[name]
        .setPosition(body.position.x, body.position.y)
        .setRotation(body.angle)
        .setVisible(true);
    }
  }

  setVisible(visible) {
    for (const sprite of Object.values(this.sprites)) sprite.setVisible(visible);
    return this;
  }

  destroy() {
    for (const sprite of Object.values(this.sprites)) sprite.destroy();
    if (this.composite) this.scene.matter?.world?.remove(this.composite, true);
    this.sprites = {};
    this.bodies = {};
    this.constraints = [];
    this.jointLimits = [];
    this.composite = null;
  }
}
