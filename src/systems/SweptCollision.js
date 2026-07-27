const EPSILON = 1e-9;

function finitePoint(point) {
  return point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

/**
 * Intersect a moving point segment with a Z plane that may also move during
 * the same simulation step. The crossing is solved in relative coordinates:
 *
 *   ballZ(t) - planeZ(t) = 0
 *
 * This catches a rushing wall or sweeper moving through a slower ball even
 * when the plane's final Z is already behind the ball's previous Z.
 * Returns null unless the point starts behind and finishes on/ahead of the
 * plane. All returned coordinates are interpolated at the same time fraction.
 */
export function sweepMovingZPlane(previousPoint, currentPoint, previousPlaneZ, currentPlaneZ) {
  if (
    !finitePoint(previousPoint) ||
    !finitePoint(currentPoint) ||
    !Number.isFinite(previousPlaneZ) ||
    !Number.isFinite(currentPlaneZ)
  ) {
    return null;
  }

  const relativeStart = previousPoint.z - previousPlaneZ;
  const relativeEnd = currentPoint.z - currentPlaneZ;
  if (relativeStart >= 0 || relativeEnd < 0) return null;

  const relativeDelta = relativeEnd - relativeStart;
  if (relativeDelta <= EPSILON) return null;
  const time = Math.max(0, Math.min(1, -relativeStart / relativeDelta));
  const planeZ = lerp(previousPlaneZ, currentPlaneZ, time);

  return {
    time,
    x: lerp(previousPoint.x, currentPoint.x, time),
    y: lerp(previousPoint.y, currentPoint.y, time),
    z: planeZ,
    planeZ,
    relativeStart,
    relativeEnd
  };
}

