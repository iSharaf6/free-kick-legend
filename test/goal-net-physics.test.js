import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalNetPhysics } from '../src/systems/GoalNetPhysics.js';

const makeNet = (options = {}) => new GoalNetPhysics({
  goalWidth: 9,
  goalHeight: 3.1,
  goalZ: 24,
  columns: 10,
  rows: 6,
  ...options
});

test('net impulse deforms nearby knots while every perimeter knot stays pinned', () => {
  const net = makeNet();
  net.impact({ x: 0, y: 1.5, speed: 26 });
  net.update(1 / 30);

  assert.ok(net.node(5, 3).displacement > 0, 'the knot nearest impact should move into the net');
  for (let column = 0; column <= net.columns; column++) {
    assert.equal(net.node(column, 0).displacement, 0);
    assert.equal(net.node(column, net.rows).displacement, 0);
  }
  for (let row = 0; row <= net.rows; row++) {
    assert.equal(net.node(0, row).displacement, 0);
    assert.equal(net.node(net.columns, row).displacement, 0);
  }
});

test('spring response is bounded and settles back to rest', () => {
  const net = makeNet({ maxDisplacement: 0.5 });
  net.impact({ x: 0, y: 1.5, speed: 100, strength: 2 });

  for (let i = 0; i < 1200; i++) {
    net.update(1 / 120);
    for (const displacement of net.displacement) {
      assert.ok(displacement <= 0.5 + 1e-6);
      assert.ok(displacement >= -0.18 - 1e-6);
    }
  }

  assert.equal(net.active, false);
  assert.ok(net.displacement.every((value) => value === 0));
});

test('a full-power goal snap settles within the result presentation window', () => {
  const net = makeNet();
  net.impact({ x: 2.4, y: 2.5, speed: 34, strength: 1.85, radius: 1.55 });
  let elapsed = 0;
  let peak = 0;
  while (net.active && elapsed < 2) {
    net.step(1 / 120);
    elapsed += 1 / 120;
    for (const displacement of net.displacement) peak = Math.max(peak, displacement);
  }

  assert.ok(peak > 0.35, `the initial net bulge should remain emphatic, got ${peak}`);
  assert.ok(elapsed <= 1.2 + 1e-9, `net should settle within 1.2s, took ${elapsed}`);
  assert.equal(net.active, false);
  assert.ok(net.displacement.every((value) => value === 0));
});

test('net deformation is identical at 30, 60 and 120 render frames per second', () => {
  const simulate = (fps) => {
    const net = makeNet();
    net.impact({ x: 1.2, y: 1.8, speed: 30, strength: 1.5, radius: 1.2 });
    for (let frame = 0; frame < fps * 0.8; frame++) net.update(1 / fps);
    return net;
  };
  const baseline = simulate(120);

  for (const fps of [30, 60]) {
    const candidate = simulate(fps);
    assert.equal(candidate.active, baseline.active);
    assert.equal(candidate.activeTime, baseline.activeTime);
    assert.deepEqual(Array.from(candidate.displacement), Array.from(baseline.displacement));
    assert.deepEqual(Array.from(candidate.velocity), Array.from(baseline.velocity));
  }
});

test('off-target impacts clamp to the net and still transfer energy to an inside knot', () => {
  const net = makeNet();
  net.impact({ x: 50, y: -4, speed: 24, radius: 1.8 });
  net.update(1 / 60);

  const movingKnots = Array.from(net.velocity).filter((value) => Math.abs(value) > 1e-5);
  assert.ok(movingKnots.length > 0);
});

test('draw emits a crisp projected mesh without depending on Phaser', () => {
  const calls = [];
  const graphics = {
    clear: () => calls.push(['clear']),
    lineStyle: (...args) => calls.push(['style', ...args]),
    lineBetween: (...args) => calls.push(['line', ...args])
  };
  const project = (x, y, z) => ({ x: x * 10 + 100, y: 200 - y * 10 + z * 0.1 });
  const net = makeNet({ columns: 4, rows: 3 });

  net.draw(graphics, project);

  const expectedBackSegments = (net.columns + 1) * net.rows + (net.rows + 1) * net.columns;
  const expectedTies = net.rows * 2 + net.columns + 1;
  assert.equal(calls.filter(([type]) => type === 'line').length, expectedBackSegments + expectedTies);
  assert.deepEqual(calls[0], ['clear']);
  assert.deepEqual(calls[1], ['style', 1, 0xe8eef4, 0.3]);
  assert.equal(net.needsRedraw, false);
  for (const [, x1, y1, x2, y2] of calls.filter(([type]) => type === 'line')) {
    assert.equal(x1 % 1, 0.5);
    assert.equal(y1 % 1, 0.5);
    assert.equal(x2 % 1, 0.5);
    assert.equal(y2 % 1, 0.5);
  }
});

test('reset removes all stored motion immediately', () => {
  const net = makeNet();
  net.impact({ x: -1.2, y: 2, speed: 28 });
  net.update(0.04);
  net.reset();

  assert.equal(net.active, false);
  assert.equal(net.needsRedraw, true);
  assert.ok(net.displacement.every((value) => value === 0));
  assert.ok(net.velocity.every((value) => value === 0));
});
