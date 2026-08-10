const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function goalMouthGeometry({ goalWidth, goalHeight, postRadius, ballRadius }) {
  const clearance = postRadius + ballRadius;
  return {
    halfWidth: goalWidth / 2,
    goalHeight,
    ballRadius,
    clearance,
    innerHalfWidth: goalWidth / 2 - clearance,
    innerHeight: goalHeight - clearance
  };
}

export function classifyGoalPlane(point, dimensions) {
  const geometry = goalMouthGeometry(dimensions);
  const { halfWidth, goalHeight, clearance, innerHalfWidth, innerHeight } = geometry;
  const sideDistance = Math.abs(Math.abs(point.x) - halfWidth);
  const barDistance = Math.abs(point.y - goalHeight);
  const hitsPost = sideDistance <= clearance && point.y >= -clearance && point.y <= goalHeight + clearance;
  const hitsBar = barDistance <= clearance && Math.abs(point.x) <= halfWidth + clearance;

  let frame = null;
  if (hitsPost && hitsBar) frame = sideDistance / clearance <= barDistance / clearance ? 'post' : 'crossbar';
  else if (hitsPost) frame = 'post';
  else if (hitsBar) frame = 'crossbar';

  return {
    frame,
    inFrame: Math.abs(point.x) < innerHalfWidth && point.y > dimensions.ballRadius * 0.5 && point.y < innerHeight,
    geometry
  };
}

function closestSegmentTime(a0, b0, da, db) {
  const lengthSq = da * da + db * db;
  if (lengthSq <= 1e-12) return 0;
  return clamp(-(a0 * da + b0 * db) / lengthSq, 0, 1);
}

// Sweeps the ball centre against the cylindrical posts/crossbar. This runs on
// every fixed tick, so contact happens when the ball surface reaches the frame
// instead of waiting for its centre to cross the goal plane.
export function sweepGoalFrame(ball, zGoal, dimensions) {
  if (!ball?.prev || !Number.isFinite(zGoal)) return null;
  const geometry = goalMouthGeometry(dimensions);
  const start = ball.prev;
  const dx = ball.x - start.x;
  const dy = ball.y - start.y;
  const dz = ball.z - start.z;
  const clearanceSq = geometry.clearance * geometry.clearance;
  const candidates = [];

  for (const side of [-1, 1]) {
    const postX = side * geometry.halfWidth;
    const t = closestSegmentTime(start.x - postX, start.z - zGoal, dx, dz);
    const point = {
      x: start.x + dx * t,
      y: start.y + dy * t,
      z: start.z + dz * t
    };
    const distanceSq = (point.x - postX) ** 2 + (point.z - zGoal) ** 2;
    if (distanceSq <= clearanceSq + 1e-8 && point.y >= 0 && point.y <= geometry.goalHeight) {
      candidates.push({ t, point, frame: 'post' });
    }
  }

  const barT = closestSegmentTime(start.y - geometry.goalHeight, start.z - zGoal, dy, dz);
  const barPoint = {
    x: start.x + dx * barT,
    y: start.y + dy * barT,
    z: start.z + dz * barT
  };
  const barDistanceSq = (barPoint.y - geometry.goalHeight) ** 2 + (barPoint.z - zGoal) ** 2;
  if (barDistanceSq <= clearanceSq + 1e-8 && Math.abs(barPoint.x) <= geometry.halfWidth) {
    candidates.push({ t: barT, point: barPoint, frame: 'crossbar' });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.t - b.t);
  const hit = candidates[0];
  return {
    point: hit.point,
    contact: { frame: hit.frame, inFrame: false, geometry }
  };
}

/**
 * Where a ball ended up relative to the goal mouth after a frame rebound.
 *
 * `reboundFromGoalFrame` repositions the ball tangent to the post or bar it
 * struck, and writes that position into `ball.prev` as well. When the contact
 * was on the goal side of the plane - the classic in-off-the-post - the ball is
 * left with both `z` and `prev.z` beyond `zGoal`, which permanently disables
 * `Ball.crossed(zGoal)`: the goal-line test can never fire again, so the shot
 * is never scored and the ball sails on through the netting. Callers use this
 * to settle the outcome at the moment of contact instead.
 *
 * Returns 'goal' when the ball sits inside the mouth behind the line, 'behind'
 * when it is past the line but outside the frame, and null while it is still in
 * front of the line (the ordinary case, which `crossed()` handles).
 */
export function classifyReboundPosition(ball, zGoal, dimensions) {
  if (!ball || !Number.isFinite(zGoal) || !Number.isFinite(ball.z)) return null;
  if (ball.z <= zGoal + 1e-6) return null;

  const geometry = goalMouthGeometry(dimensions);
  // The ball has already been separated to rest tangent to the frame, so the
  // outer mouth bounds are the correct discriminator here: an inside graze
  // lands just within them, an outside graze just beyond.
  const inside = Math.abs(ball.x) <= geometry.halfWidth &&
    ball.y >= 0 &&
    ball.y <= geometry.goalHeight;
  return inside ? 'goal' : 'behind';
}

export function reboundFromGoalFrame(ball, point, contact, zGoal, restitution = 0.72) {
  const { geometry, frame } = contact;
  let nx = 0;
  let ny = 0;
  let nz = -1;

  if (frame === 'post') {
    const postX = Math.sign(point.x || 1) * geometry.halfWidth;
    if (Number.isFinite(point.z)) {
      const length = Math.hypot(point.x - postX, point.z - zGoal) || 1;
      nx = (point.x - postX) / length;
      nz = (point.z - zGoal) / length;
    } else {
      nx = clamp((point.x - postX) / geometry.clearance, -0.96, 0.96);
      nz = -Math.sqrt(Math.max(0.08, 1 - nx * nx));
    }
  } else {
    if (Number.isFinite(point.z)) {
      const length = Math.hypot(point.y - geometry.goalHeight, point.z - zGoal) || 1;
      ny = (point.y - geometry.goalHeight) / length;
      nz = (point.z - zGoal) / length;
    } else {
      ny = clamp((point.y - geometry.goalHeight) / geometry.clearance, -0.96, 0.96);
      nz = -Math.sqrt(Math.max(0.08, 1 - ny * ny));
    }
  }

  const incoming = { vx: ball.vx, vy: ball.vy, vz: ball.vz, spin: ball.spin };
  const approach = incoming.vx * nx + incoming.vy * ny + incoming.vz * nz;
  if (approach < 0) {
    // Steel frame contact keeps a strong normal rebound but scrubs the tangent
    // separately. This preserves the famous in-off post while stopping near-
    // frictionless ricochets from carrying implausibly perfect side velocity.
    const tangentRetention = frame === 'post' ? 0.74 : 0.68;
    // The public restitution remains the material control, while the arcade
    // response intentionally spends some energy on the audible/visual impact.
    // Representative post and bar hits retain roughly 50-65% of linear speed.
    const bounce = clamp(restitution * 0.72, 0, 0.76);
    const tx = incoming.vx - approach * nx;
    const ty = incoming.vy - approach * ny;
    const tz = incoming.vz - approach * nz;
    ball.vx = tx * tangentRetention - approach * nx * bounce;
    ball.vy = ty * tangentRetention - approach * ny * bounce;
    ball.vz = tz * tangentRetention - approach * nz * bounce;
  }

  // Contact friction both reverses the existing rotation and transfers a small
  // amount of tangential pace into fresh spin. Mirrored post hits therefore
  // leave mirrored rotation instead of every impact using the same canned
  // multiplier.
  const tangentSlip = frame === 'post'
    ? incoming.vx * -nz + incoming.vz * nx
    : incoming.vx;
  const spinTransfer = clamp(tangentSlip * (frame === 'post' ? 0.014 : 0.009), -0.34, 0.34);
  ball.spin = clamp(-incoming.spin * 0.38 + spinTransfer, -1.5, 1.5);
  const separation = geometry.clearance + 0.004;
  if (frame === 'post') {
    const postX = Math.sign(point.x || 1) * geometry.halfWidth;
    ball.x = postX + nx * separation;
    ball.y = Math.max(point.y, contact.geometry.ballRadius);
  } else {
    ball.x = point.x;
    ball.y = Math.max(geometry.goalHeight + ny * separation, contact.geometry.ballRadius);
  }
  ball.z = zGoal + nz * separation;
  if (ball.prev) {
    ball.prev.x = ball.x;
    ball.prev.y = ball.y;
    ball.prev.z = ball.z;
  }
  const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const incomingSpeed = Math.hypot(incoming.vx, incoming.vy, incoming.vz);
  return {
    nx,
    ny,
    nz,
    speed,
    incomingSpeed,
    energyRatio: incomingSpeed > 1e-8 ? (speed / incomingSpeed) ** 2 : 0
  };
}
