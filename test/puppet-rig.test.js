import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from 'phaser/src/physics/matter-js/lib/core/Engine.js';
import Bodies from 'phaser/src/physics/matter-js/lib/factory/Bodies.js';
import Constraint from 'phaser/src/physics/matter-js/lib/constraint/Constraint.js';
import Composite from 'phaser/src/physics/matter-js/lib/body/Composite.js';
import { PuppetRig, normalizeAngle } from '../src/objects/PuppetRig.js';

function spriteStub() {
  return {
    setDisplaySize() { return this; },
    setDepth() { return this; },
    setFlipX() { return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setRotation(rotation) { this.rotation = rotation; return this; },
    setVisible() { return this; },
    destroy() {}
  };
}

function rigWorld(options = {}) {
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.y = 0.82;
  const add = (object) => {
    Composite.add(engine.world, object);
    return object;
  };
  const scene = {
    matter: {
      add: {
        circle: (x, y, radius, config) => add(Bodies.circle(x, y, radius, config)),
        rectangle: (x, y, width, height, config) => add(Bodies.rectangle(x, y, width, height, config)),
        constraint: (bodyA, bodyB, length, stiffness, config) => add(Constraint.create({
          ...config, bodyA, bodyB, length, stiffness
        }))
      },
      world: {
        add,
        remove: (object, deep) => Composite.remove(engine.world, object, deep)
      }
    },
    add: { image: spriteStub }
  };
  add(Bodies.rectangle(240, 105, 500, 20, { isStatic: true, friction: 0.9 }));
  const rig = new PuppetRig(scene, {
    x: 240,
    y: 95,
    scale: 1,
    autoResetDelay: 0.2,
    recoveryDuration: 0.2,
    ...options
  });
  return { engine, rig };
}

function step(engine, rig, frames) {
  for (let frame = 0; frame < frames; frame++) {
    Engine.update(engine, 1000 / 60);
    rig.update(1 / 60);
  }
}

test('puppet builds the requested segmented body and pinned standing pose', () => {
  const { rig } = rigWorld();
  assert.equal(rig.bodyList.length, 10);
  assert.equal(rig.constraints.length, 9);
  assert.equal(rig.state, 'controlled');
  assert.ok(rig.bodyList.every((body) => body.isStatic));
  assert.ok(rig.bodyList.every((body) => Number.isFinite(body.position.x) && Number.isFinite(body.position.y)));
});

test('impact releases finite-mass bodies and joints remain stable through a fall', () => {
  const { engine, rig } = rigWorld({ autoReset: false });
  rig.triggerRagdoll({ x: 240, y: 55 }, { x: 3.5, y: -2 });
  assert.equal(rig.state, 'ragdoll');
  assert.ok(rig.bodyList.every((body) => !body.isStatic && Number.isFinite(body.mass)));

  step(engine, rig, 180);
  assert.ok(rig.bodyList.every((body) => Number.isFinite(body.position.x) && Number.isFinite(body.position.y)));
  const horizontalSpread = Math.max(...rig.bodyList.map((body) => body.position.x)) -
    Math.min(...rig.bodyList.map((body) => body.position.x));
  assert.ok(horizontalSpread < 90, `jointed body spread too far: ${horizontalSpread}`);
});

test('a resting ragdoll recovers to the authored standing pose', () => {
  const { engine, rig } = rigWorld();
  rig.triggerRagdoll({ x: 240, y: 55 }, { x: 2, y: -1 });
  step(engine, rig, 360);
  assert.equal(rig.state, 'controlled');
  assert.ok(rig.bodyList.every((body) => body.isStatic));
  assert.ok(Math.abs(rig.bodies.torso.position.x - 240) < 0.01);
  assert.ok(Math.abs(rig.bodies.torso.position.y - 46) < 0.01);
});

test('soft angular stops push an overextended knee back toward its limit', () => {
  const { rig } = rigWorld({ autoReset: false });
  rig.triggerRagdoll({ x: 240, y: 55 }, { x: 0.5, y: 0 });
  const parent = rig.bodies.leftUpperLeg;
  const child = rig.bodies.leftLowerLeg;
  child.angle = parent.angle + 2.8;
  const before = normalizeAngle(child.angle - parent.angle);
  rig.enforceJointLimits();
  const after = normalizeAngle(child.angle - parent.angle);
  assert.ok(after < before);
});
