const EPSILON = 1e-9;
const MAX_SPIN = 1.5;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function unitNormal(value = {}) {
  let x = finite(value.x);
  let y = finite(value.y);
  let z = finite(value.z, -1);
  const length = Math.hypot(x, y, z);
  if (length <= EPSILON) return { x: 0, y: 0, z: -1 };
  x /= length;
  y /= length;
  z /= length;
  // Every match contact handled here faces the incoming shot. Keeping the
  // normal pointed back toward the kicker makes malformed authored data fail
  // safely instead of accelerating the ball through a defender.
  if (z > 0) {
    x *= -1;
    y *= -1;
    z *= -1;
  }
  return { x, y, z };
}

function velocity(ball) {
  return {
    x: finite(ball?.vx),
    y: finite(ball?.vy),
    z: finite(ball?.vz)
  };
}

/**
 * Deterministic sphere response shared by walls, keepers and the hoardings.
 *
 * The normal component rebounds while the tangent is damped independently.
 * That distinction is what makes an edge clip retain its sideways pace while
 * a square hit comes straight back. Small authored impulses are applied after
 * the physical response to preserve the punchy readability of an arcade game.
 */
export function applyArcadeDeflection(ball, {
  normal = { x: 0, y: 0, z: -1 },
  restitution = 0.25,
  tangentRetention = 0.35,
  impulse = null,
  minBackSpeed = 0,
  maxSpeedScale = 0.82
} = {}) {
  if (!ball) return null;

  const incoming = velocity(ball);
  const incomingSpeed = Math.hypot(incoming.x, incoming.y, incoming.z);
  const n = unitNormal(normal);
  let approach = incoming.x * n.x + incoming.y * n.y + incoming.z * n.z;
  // A caller may resolve a slightly separated ball on the next fixed tick.
  // Only the inbound part should bounce; never reflect an already outbound
  // velocity back into the obstacle.
  if (approach > 0) approach = 0;

  const tangent = {
    x: incoming.x - approach * n.x,
    y: incoming.y - approach * n.y,
    z: incoming.z - approach * n.z
  };
  const retain = clamp(finite(tangentRetention, 0.35), 0, 1);
  const bounce = clamp(finite(restitution, 0.25), 0, 0.92);
  const authoredImpulse = {
    x: finite(impulse?.x),
    y: finite(impulse?.y),
    z: finite(impulse?.z)
  };
  const outgoing = {
    x: tangent.x * retain - approach * n.x * bounce + authoredImpulse.x,
    y: tangent.y * retain - approach * n.y * bounce + authoredImpulse.y,
    z: tangent.z * retain - approach * n.z * bounce + authoredImpulse.z
  };

  const speedLimit = incomingSpeed * clamp(finite(maxSpeedScale, 0.82), 0.35, 1);
  // A readable return floor is useful for ordinary strikes, but is bounded by
  // the incoming energy. A nearly stationary test ball can never be turned
  // into a fast rebound simply because it touched a keeper or board.
  const requiredBackSpeed = Math.min(Math.max(0, finite(minBackSpeed)), speedLimit);
  if (requiredBackSpeed > 0 && outgoing.z > -requiredBackSpeed) {
    outgoing.z = -requiredBackSpeed;
  }

  // Authored lift and lateral direction remain below the strike speed that
  // reached the obstacle, including deliberately weak-contact edge cases.
  const outgoingSpeed = Math.hypot(outgoing.x, outgoing.y, outgoing.z);
  if (outgoingSpeed > speedLimit && outgoingSpeed > EPSILON) {
    const scale = speedLimit / outgoingSpeed;
    outgoing.x *= scale;
    outgoing.y *= scale;
    outgoing.z *= scale;
  }
  ball.vx = outgoing.x;
  ball.vy = outgoing.y;
  ball.vz = outgoing.z;
  if (ball.vy > 0 && 'grounded' in ball) ball.grounded = false;

  return {
    normal: n,
    approachSpeed: Math.max(0, -approach),
    incomingSpeed,
    outgoingSpeed: Math.hypot(ball.vx, ball.vy, ball.vz)
  };
}

/** Resolve a body/leg block using the actual point hit on the defender. */
export function resolveWallDeflection(ball, contact = {}, point = {}, {
  wallCenterX = 0
} = {}) {
  if (!ball) return null;
  const player = contact.player || {};
  const playerX = finite(player.x, finite(wallCenterX));
  const halfWidth = Math.max(0.25, finite(player.halfWidth, 0.34));
  const footY = finite(player.jumpY) + finite(player.footY);
  const headY = finite(player.jumpY) + finite(player.headY, footY + finite(player.height, 1.85));
  const bodyMidY = (footY + headY) * 0.5;
  const halfHeight = Math.max(0.5, (headY - footY) * 0.5);
  const localX = clamp((finite(point.x, playerX) - playerX) / (halfWidth + 0.26), -1, 1);
  const localY = clamp((finite(point.y, bodyMidY) - bodyMidY) / halfHeight, -1, 1);
  const leg = contact.part === 'leg';
  const legDirection = Math.sign(finite(player.deflectorDir, localX || 1)) || 1;
  const surfaceX = clamp(localX * 0.56 + (leg ? legDirection * 0.22 : 0), -0.78, 0.78);
  const incomingSpeed = Math.hypot(finite(ball.vx), finite(ball.vy), finite(ball.vz));

  const outwardDirection = Math.sign(surfaceX) || Math.sign(finite(ball.vx));
  const response = applyArcadeDeflection(ball, {
    normal: { x: surfaceX, y: localY * 0.12, z: -1 },
    restitution: leg ? 0.31 : 0.24,
    tangentRetention: leg ? 0.43 : 0.34,
    impulse: {
      x: (leg ? (outwardDirection || legDirection) : outwardDirection) * (leg ? 0.75 : 0.42),
      y: leg ? 1.65 : 1.18,
      z: 0
    },
    minBackSpeed: clamp(incomingSpeed * (leg ? 0.2 : 0.16), 3.2, 7.2),
    maxSpeedScale: leg ? 0.76 : 0.68
  });

  ball.vy = clamp(ball.vy, -1.2, leg ? 5.6 : 4.8);
  ball.spin = clamp(
    -finite(ball.spin) * (leg ? 0.28 : 0.18) + surfaceX * 0.38 + (leg ? legDirection * 0.12 : 0),
    -MAX_SPIN,
    MAX_SPIN
  );
  return { ...response, part: leg ? 'leg' : 'body', localX, localY };
}

/** Resolve a catchable-envelope hit that the keeper elects to parry. */
export function resolveKeeperParry(ball, contact = {}, keeper = {}, point = {}) {
  if (!ball) return null;
  const skill = clamp(finite(keeper.skill), 0, 1);
  const quality = clamp(1 - finite(contact.distance, 1), 0, 1);
  const pointX = finite(point.x, finite(keeper.x));
  const fallbackDirection = Math.sign(pointX - finite(keeper.x)) || Math.sign(finite(keeper.diveDir, 1)) || 1;
  const contactNormalX = clamp(finite(contact.normalX), -1, 1);
  const contactNormalY = clamp(finite(contact.normalY), -1, 1);
  const direction = Math.abs(contactNormalX) > 0.08 ? Math.sign(contactNormalX) : fallbackDirection;
  const part = contact.part || 'body';
  const isHands = part === 'hands';
  const isFoot = part === 'foot';
  const fingertip = isHands && finite(contact.distance, 1) >= 0.55;
  const incomingSpeed = Math.hypot(finite(ball.vx), finite(ball.vy), finite(ball.vz));
  const surfaceX = clamp(
    contactNormalX * (fingertip ? 0.30 : 0.48) +
      direction * (fingertip ? 0.18 : isHands ? 0.30 : isFoot ? 0.38 : 0.22),
    -0.78,
    0.78
  );
  const surfaceY = clamp(contactNormalY * (fingertip ? 0.2 : 0.30) + (isHands ? 0.08 : isFoot ? -0.03 : 0), -0.34, 0.42);
  const lift = isFoot ? 2.15 : fingertip ? 0.72 : isHands ? 1.55 : 1.35;

  const response = applyArcadeDeflection(ball, {
    normal: { x: surfaceX, y: surfaceY, z: -1 },
    restitution: fingertip ? 0.15 + skill * 0.035 : 0.25 + skill * 0.055 + (isHands ? 0.02 : 0),
    tangentRetention: fingertip ? 0.28 : isFoot ? 0.29 : isHands ? 0.24 : 0.21,
    impulse: {
      x: direction * (fingertip ? 0.48 + skill * 0.22 : 1.08 + skill * 0.8 + quality * 0.4),
      y: lift + quality * (fingertip ? 0.18 : 0.44),
      z: 0
    },
    minBackSpeed: fingertip
      ? clamp(incomingSpeed * (0.13 + skill * 0.02), 2.8, 5.6)
      : clamp(incomingSpeed * (0.22 + skill * 0.04), 5.2, 9.8),
    maxSpeedScale: fingertip ? 0.48 + skill * 0.035 : 0.7 + skill * 0.06
  });

  ball.vy = clamp(ball.vy, -1.5, 6.2);
  ball.spin = clamp(
    -finite(ball.spin) * 0.3 - direction * (0.12 + (1 - quality) * 0.18),
    -MAX_SPIN,
    MAX_SPIN
  );
  return { ...response, part, quality, direction, fingertip };
}

/** A height-aware rebound from the physical advertising backstop. */
export function resolveBoardDeflection(ball, point = {}, { boardHeight = 1 } = {}) {
  if (!ball) return null;
  const incomingSpin = finite(ball.spin);
  const heightRatio = clamp(finite(point.y) / Math.max(0.1, finite(boardHeight, 1)), 0, 1);
  const incomingSpeed = Math.hypot(finite(ball.vx), finite(ball.vy), finite(ball.vz));
  const response = applyArcadeDeflection(ball, {
    normal: { x: 0, y: 0, z: -1 },
    restitution: 0.48 - heightRatio * 0.12,
    tangentRetention: 0.60 - heightRatio * 0.06,
    impulse: { y: -0.52 - heightRatio * 0.18 },
    minBackSpeed: clamp(incomingSpeed * (0.31 + (1 - heightRatio) * 0.06), 3.4, 10.5),
    maxSpeedScale: 0.66
  });
  ball.vy = clamp(ball.vy, -4.2, 3.2);
  ball.spin = clamp(-incomingSpin * 0.36 + finite(ball.vx) * 0.012, -MAX_SPIN, MAX_SPIN);
  return { ...response, heightRatio };
}
