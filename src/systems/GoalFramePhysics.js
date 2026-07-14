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

  const approach = ball.vx * nx + ball.vy * ny + ball.vz * nz;
  if (approach < 0) {
    const impulse = (1 + restitution) * approach;
    ball.vx = (ball.vx - impulse * nx) * 0.985;
    ball.vy = (ball.vy - impulse * ny) * 0.985;
    ball.vz = (ball.vz - impulse * nz) * 0.985;
  }

  ball.spin *= -0.42;
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
  return { nx, ny, nz, speed: Math.hypot(ball.vx, ball.vy, ball.vz) };
}
