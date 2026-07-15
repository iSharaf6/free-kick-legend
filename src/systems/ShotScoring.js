const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function isTopCorner(point, goalWidth, goalHeight) {
  if (!point) return false;
  return Math.abs(point.x) >= goalWidth / 2 - 1.45 && point.y >= goalHeight - 1.15;
}

export function targetGeometry(target, goalWidth, goalHeight, forgiveness = 0.14) {
  if (!target) return null;
  return {
    x: (target.x ?? 0) * (goalWidth / 2),
    y: (target.y ?? 0.62) * goalHeight,
    rx: (target.rx ?? 0.9) + forgiveness,
    ry: (target.ry ?? 0.65) + forgiveness
  };
}

export function hitTarget(point, target, goalWidth, goalHeight) {
  if (!point || !target) return false;
  const geometry = targetGeometry(target, goalWidth, goalHeight);
  const dx = (point.x - geometry.x) / geometry.rx;
  const dy = (point.y - geometry.y) / geometry.ry;
  return dx * dx + dy * dy <= 1;
}

export function scoreShot({
  outcome,
  point = null,
  shot = {},
  streak = 0,
  target = null,
  goalWidth = 9,
  goalHeight = 3.1
}) {
  if (outcome !== 'GOAL') {
    const labels = { SAVE: 'Denied', CAUGHT: 'Read', WALL: 'Blocked', POST: 'Woodwork', MISS: 'Wide' };
    return { points: outcome === 'POST' ? 125 : 0, grade: '—', label: labels[outcome] || 'Off target', topCorner: false, targetHit: false };
  }

  const topCorner = isTopCorner(point, goalWidth, goalHeight);
  const targetHit = hitTarget(point, target, goalWidth, goalHeight);
  const curl = clamp01(Math.abs(shot.spin || 0));
  const power = clamp01(shot.power ?? 0.65);
  const centrality = point
    ? clamp01(Math.hypot(point.x / (goalWidth / 2), (point.y - goalHeight * 0.55) / (goalHeight * 0.65)))
    : 0;

  const placement = Math.round(centrality * 340);
  const technique = Math.round(curl * 260 + power * 110);
  const cornerBonus = topCorner ? 500 : 0;
  const targetBonus = targetHit ? 650 : 0;
  const comboMultiplier = 1 + Math.min(Math.max(streak, 0), 8) * 0.12;
  const points = Math.round((1000 + placement + technique + cornerBonus + targetBonus) * comboMultiplier);
  const grade = points >= 2350 ? 'S' : points >= 1850 ? 'A' : points >= 1450 ? 'B' : 'C';
  const label = targetHit ? 'Target smashed' : topCorner ? 'Top bins' : curl > 0.62 ? 'Bent around' : power > 0.88 ? 'Rocket' : 'Clean finish';
  return { points, grade, label, topCorner, targetHit, comboMultiplier };
}

export function careerStars({
  attempt = 1,
  attempts = 3,
  objectiveMet = false,
  shotScore = 0,
  goalsRequired = 1
}) {
  // The fewest shots that can possibly complete the objective: one per
  // required goal. Multi-goal levels are therefore three-starrable by
  // finishing with every attempt a qualifying goal, not by the impossible
  // "complete a two-goal objective on attempt one".
  const minimumShots = Math.max(1, goalsRequired);
  let stars = 1;
  if (attempt < attempts || shotScore >= 1600) stars++;
  // Three stars are mastery, not merely completion: finish in the minimum
  // possible number of shots and land at least one genuinely high-quality
  // strike. Late clears can still earn two via placement/technique.
  if (objectiveMet && attempt <= minimumShots && shotScore >= 2050) stars++;
  return Math.min(stars, 3);
}
