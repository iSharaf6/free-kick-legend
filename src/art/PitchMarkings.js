// Pitch paint is authored in world space, then passed through the same camera
// projection as the goal and players. Keeping these dimensions together makes
// it impossible for one box to drift into screen-space perspective by accident.
export const PITCH_MARKING_DIMENSIONS = Object.freeze({
  fieldHalfWidth: 16,
  penaltyAreaHalfWidth: 7.5,
  penaltyAreaDepth: 8.5,
  goalAreaHalfWidth: 5.75,
  goalAreaDepth: 3,
  penaltySpotDistance: 5.5,
  penaltyArcRadius: 4.5
});

const segment = (id, x1, z1, x2, z2) => Object.freeze({
  id,
  from: Object.freeze({ x: x1, z: z1 }),
  to: Object.freeze({ x: x2, z: z2 })
});

/**
 * Build every straight marking as a ground-plane segment. Longitudinal edges
 * keep a constant world x, so projecting them necessarily sends them toward
 * the camera's single vanishing point instead of an independently drawn box.
 */
export function buildPitchMarkingLayout(goalZ, minimumZ = 5.8) {
  const d = PITCH_MARKING_DIMENSIONS;
  const penaltyFrontZ = Math.max(minimumZ, goalZ - d.penaltyAreaDepth);
  const goalAreaFrontZ = Math.max(minimumZ, goalZ - d.goalAreaDepth);
  const penaltySpotZ = goalZ - d.penaltySpotDistance;

  return Object.freeze({
    goalZ,
    penaltyFrontZ,
    goalAreaFrontZ,
    penaltySpot: Object.freeze({ x: 0, z: penaltySpotZ }),
    straight: Object.freeze([
      segment('goal-line', -d.fieldHalfWidth, goalZ, d.fieldHalfWidth, goalZ),
      segment('penalty-left', -d.penaltyAreaHalfWidth, goalZ, -d.penaltyAreaHalfWidth, penaltyFrontZ),
      segment('penalty-right', d.penaltyAreaHalfWidth, goalZ, d.penaltyAreaHalfWidth, penaltyFrontZ),
      segment('penalty-front', -d.penaltyAreaHalfWidth, penaltyFrontZ, d.penaltyAreaHalfWidth, penaltyFrontZ),
      segment('goal-area-left', -d.goalAreaHalfWidth, goalZ, -d.goalAreaHalfWidth, goalAreaFrontZ),
      segment('goal-area-right', d.goalAreaHalfWidth, goalZ, d.goalAreaHalfWidth, goalAreaFrontZ),
      segment('goal-area-front', -d.goalAreaHalfWidth, goalAreaFrontZ, d.goalAreaHalfWidth, goalAreaFrontZ)
    ])
  });
}

