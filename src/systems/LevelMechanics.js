/**
 * Pure runtime helpers for level-schema v2.
 *
 * This module intentionally has no Phaser imports. The scene owns rendering
 * and object lifecycles; these helpers only turn authored level data and
 * deterministic runtime inputs into small immutable values.
 */

const TAU = Math.PI * 2;
const EPSILON = 1e-9;

const HAZARD_ALIASES = Object.freeze({
  'sun-glare': 'glare',
  haze: 'fog',
  ice: 'slippery',
  'crowd_pressure': 'crowd-pressure',
  'crowd pressure': 'crowd-pressure'
});

const HAZARD_DEFAULTS = Object.freeze({
  glare: Object.freeze({
    type: 'glare',
    corner: 'top-right',
    strength: 0.5,
    radius: 0.32
  }),
  fog: Object.freeze({
    type: 'fog',
    density: 0.35,
    goalVisibility: 0.65
  }),
  snow: Object.freeze({
    type: 'snow',
    drag: 0.06,
    trail: true,
    density: 0.5
  }),
  slippery: Object.freeze({
    type: 'slippery',
    powerJitter: 0.08,
    frequency: 8
  }),
  'crowd-pressure': Object.freeze({
    type: 'crowd-pressure',
    intensity: 0.4,
    aimWindowScale: 0.82,
    pulseSpeed: 1
  })
});

const ADVANCED_OBJECTIVES = new Set([
  'bank-shot',
  'corner-only',
  'limited-power',
  'blind-shot',
  'reverse-target',
  'ring-shot'
]);

const KEEPER_TYPES = new Set(['line', 'sweeper', 'double', 'boss']);
const WALL_TYPES = new Set(['standard', 'moving', 'rushing', 'split', 'double', 'deflector']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  const number = finite(value, fallback);
  return number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function frozenArray(values) {
  return Object.freeze(values);
}

function normalizeHazardType(type) {
  const normalized = String(type ?? '').trim().toLowerCase();
  return HAZARD_ALIASES[normalized] ?? normalized;
}

function normalizeFrameContact(contact) {
  const value = String(contact ?? '').trim().toLowerCase();
  return value === 'post' || value === 'crossbar' ? value : value === 'frame' ? 'frame' : null;
}

function hashSeed(seed) {
  const text = String(seed ?? 'free-kick-legend');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Resolve a level's scaled goal dimensions in world units.
 *
 * @param {object} level Authored level containing an optional `goal` field.
 * @param {{width?: number, height?: number}} base Full-size goal dimensions.
 */
export function getEffectiveGoalDimensions(
  level = {},
  base = {}
) {
  const baseWidth = positive(base.width, 9);
  const baseHeight = positive(base.height, 3.1);
  const goal = level?.goal ?? {};
  // The schema currently authors 0.65..1. Runtime clamping is deliberately a
  // little wider so a malformed portal payload cannot create a zero-size goal.
  const widthScale = clamp(goal.widthScale ?? 1, 0.5, 1);
  const heightScale = clamp(goal.heightScale ?? 1, 0.5, 1);
  const width = baseWidth * widthScale;
  const height = baseHeight * heightScale;

  return Object.freeze({
    width,
    height,
    halfWidth: width / 2,
    widthScale,
    heightScale,
    baseWidth,
    baseHeight
  });
}

/**
 * Sample fixed or rotating wind at a deterministic simulation time.
 *
 * Clockwise rotation is negative in the game's x/right, y/up world plane.
 * Gust frequency is angular frequency (radians per second), matching the
 * existing GameScene sine sampling.
 */
export function getWindVectorAt(wind = {}, elapsedSeconds = 0, options = {}) {
  const time = Math.max(0, finite(elapsedSeconds));
  const baseX = finite(wind?.x);
  const baseY = finite(wind?.y);
  const baseZ = finite(wind?.z);
  const gust = Math.max(0, finite(wind?.gust));
  const gustAngularFrequency = positive(
    options.gustAngularFrequency ?? wind?.gustAngularFrequency,
    2.15
  );
  const gustPhase = finite(options.gustPhase);
  const gustOffset = gust * Math.sin(time * gustAngularFrequency + gustPhase);
  const rotation = wind?.rotation;

  if (rotation && positive(rotation.period, 0) > 0 && positive(rotation.magnitude, 0) > 0) {
    const period = positive(rotation.period, 1);
    const direction = rotation.clockwise === false ? 1 : -1;
    const angle = finite(rotation.phase) + direction * TAU * (time / period);
    const magnitude = Math.max(0, positive(rotation.magnitude, 0) + gustOffset);
    return Object.freeze({
      x: Math.cos(angle) * magnitude,
      y: Math.sin(angle) * magnitude,
      z: baseZ,
      angle,
      magnitude,
      rotating: true
    });
  }

  const x = baseX + gustOffset;
  return Object.freeze({
    x,
    y: baseY,
    z: baseZ,
    angle: Math.atan2(baseY, x),
    magnitude: Math.hypot(x, baseY),
    rotating: false
  });
}

/**
 * Apply continuous, seeded jitter to a normalized power value.
 *
 * Returning the sampled noise and delta makes the same helper useful for both
 * the displayed meter and the final strike. Call it with simulation time, not
 * wall-clock time, so a pause cannot change the committed shot.
 */
export function getJitteredPower(basePower, options = {}) {
  const minimum = finite(options.minPower, 0);
  const maximum = Math.max(minimum, finite(options.maxPower, 1));
  const input = clamp(basePower, minimum, maximum);
  const amount = clamp(options.amount ?? options.powerJitter ?? 0, 0, 0.35);
  const frequency = positive(options.frequency, 8);
  const time = Math.max(0, finite(options.elapsedSeconds ?? options.time));
  const seed = hashSeed(options.seed);

  // Three incommensurate harmonics avoid the mechanical single-sine look while
  // remaining continuous and exactly repeatable for replays/tests.
  const phaseA = (seed / 0x100000000) * TAU;
  const phaseB = (((seed >>> 8) & 0xffff) / 0xffff) * TAU;
  const phaseC = (((seed >>> 17) & 0x7fff) / 0x7fff) * TAU;
  const noise =
    Math.sin(time * frequency + phaseA) * 0.58 +
    Math.sin(time * frequency * 1.731 + phaseB) * 0.29 +
    Math.sin(time * frequency * 0.477 + phaseC) * 0.13;
  const delta = noise * amount;
  const power = clamp(input + delta, minimum, maximum);

  return Object.freeze({
    power,
    delta: power - input,
    rawDelta: delta,
    noise,
    input,
    minPower: minimum,
    maxPower: maximum
  });
}

function normalizeOneHazard(condition) {
  if (!condition || typeof condition !== 'object') return null;
  const type = normalizeHazardType(condition.type);
  const defaults = HAZARD_DEFAULTS[type];
  if (!defaults) return null;

  if (type === 'glare') {
    const corners = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
    return Object.freeze({
      type,
      corner: corners.has(condition.corner) ? condition.corner : defaults.corner,
      strength: clamp01(condition.strength ?? defaults.strength),
      radius: clamp(condition.radius ?? defaults.radius, 0.05, 1)
    });
  }
  if (type === 'fog') {
    const density = clamp01(condition.density ?? defaults.density);
    return Object.freeze({
      type,
      density,
      goalVisibility: clamp01(condition.goalVisibility ?? (1 - density))
    });
  }
  if (type === 'snow') {
    return Object.freeze({
      type,
      drag: clamp(condition.drag ?? defaults.drag, 0, 0.3),
      trail: condition.trail == null ? defaults.trail : Boolean(condition.trail),
      density: clamp01(condition.density ?? defaults.density)
    });
  }
  if (type === 'slippery') {
    return Object.freeze({
      type,
      powerJitter: clamp(condition.powerJitter ?? defaults.powerJitter, 0, 0.2),
      frequency: clamp(condition.frequency ?? defaults.frequency, 0.1, 30)
    });
  }
  return Object.freeze({
    type,
    intensity: clamp01(condition.intensity ?? defaults.intensity),
    aimWindowScale: clamp(condition.aimWindowScale ?? defaults.aimWindowScale, 0.3, 1),
    pulseSpeed: clamp(condition.pulseSpeed ?? defaults.pulseSpeed, 0.1, 4)
  });
}

/**
 * Normalize, validate and de-duplicate an authored hazard array.
 * Unknown hazards are ignored; later duplicates replace earlier definitions.
 */
export function normalizeHazards(hazards = []) {
  const byType = new Map();
  for (const condition of Array.isArray(hazards) ? hazards : []) {
    const normalized = normalizeOneHazard(condition);
    if (normalized) byType.set(normalized.type, normalized);
  }
  return frozenArray([...byType.values()]);
}

/** Return one normalized hazard or null. */
export function getHazard(hazards, type) {
  const wanted = normalizeHazardType(type);
  return normalizeHazards(hazards).find((condition) => condition.type === wanted) ?? null;
}

/**
 * Convert one authored ring from normalized level coordinates to world space.
 */
export function getRingWorldGeometry(ring, context = {}) {
  const startZ = finite(context.startZ);
  const goalZ = finite(context.goalZ, startZ);
  const goalWidth = positive(context.goalWidth, 9);
  const goalHeight = positive(context.goalHeight, 3.1);
  const goalCenterX = finite(context.goalCenterX);
  const progress = clamp01(ring?.z);

  return Object.freeze({
    id: String(ring?.id ?? ''),
    x: goalCenterX + clamp(ring?.x, -1, 1) * (goalWidth / 2),
    y: clamp01(ring?.y) * goalHeight,
    z: startZ + (goalZ - startZ) * progress,
    radius: positive(ring?.radius, 0.65),
    multiplier: positive(ring?.multiplier, 1),
    progress
  });
}

/**
 * Test a forward-moving 3D line segment against a ring's z-plane.
 *
 * `ballRadius` is subtracted from the opening to require the whole ball to
 * pass through. Leave it at zero for forgiving centre-point gameplay.
 */
export function getRingCrossing(ring, previous, current, context = {}) {
  if (!previous || !current) return null;
  const geometry = getRingWorldGeometry(ring, context);
  const previousZ = finite(previous.z, Number.NaN);
  const currentZ = finite(current.z, Number.NaN);
  if (!Number.isFinite(previousZ) || !Number.isFinite(currentZ)) return null;
  if (currentZ <= previousZ + EPSILON) return null;
  if (previousZ > geometry.z + EPSILON || currentZ < geometry.z - EPSILON) return null;

  const fraction = clamp((geometry.z - previousZ) / (currentZ - previousZ), 0, 1);
  const point = Object.freeze({
    x: finite(previous.x) + (finite(current.x) - finite(previous.x)) * fraction,
    y: finite(previous.y) + (finite(current.y) - finite(previous.y)) * fraction,
    z: geometry.z
  });
  const distance = Math.hypot(point.x - geometry.x, point.y - geometry.y);
  const ballRadius = Math.max(0, finite(context.ballRadius));
  const forgiveness = finite(context.forgiveness);
  const clearanceRadius = Math.max(0, geometry.radius - ballRadius + forgiveness);

  return Object.freeze({
    id: geometry.id,
    hit: distance <= clearanceRadius + EPSILON,
    distance,
    clearanceRadius,
    fraction,
    point,
    geometry
  });
}

/** Create immutable per-shot ring progress. */
export function createRingProgress(rings = [], required = rings.length) {
  const authored = Array.isArray(rings) ? rings : [];
  const target = Math.max(0, Math.min(authored.length, Math.floor(finite(required, authored.length))));
  return Object.freeze({
    crossedIds: frozenArray([]),
    missedIds: frozenArray([]),
    newlyCrossedIds: frozenArray([]),
    newlyMissedIds: frozenArray([]),
    count: 0,
    resolvedCount: 0,
    required: target,
    complete: target === 0,
    failed: false,
    multiplier: 1
  });
}

/**
 * Advance immutable ring progress with one ball movement segment.
 *
 * Rings are resolved in flight order, not array order, so a large fixed step
 * can safely pass multiple closely-spaced hoops.
 */
export function updateRingProgress(progress, rings, previous, current, context = {}) {
  const authored = Array.isArray(rings) ? rings : [];
  const state = progress ?? createRingProgress(authored);
  const crossedIds = [...(state.crossedIds ?? [])];
  const missedIds = [...(state.missedIds ?? [])];
  const resolved = new Set([...crossedIds, ...missedIds]);
  const newlyCrossedIds = [];
  const newlyMissedIds = [];

  const ordered = authored
    .map((ring, index) => ({
      ring,
      index,
      geometry: getRingWorldGeometry(ring, context)
    }))
    .sort((left, right) => left.geometry.z - right.geometry.z || left.index - right.index);

  for (const entry of ordered) {
    const id = entry.geometry.id || `ring-${entry.index + 1}`;
    if (resolved.has(id)) continue;
    const crossing = getRingCrossing({ ...entry.ring, id }, previous, current, context);
    if (!crossing) continue;
    if (crossing.hit) {
      crossedIds.push(id);
      newlyCrossedIds.push(id);
    } else {
      missedIds.push(id);
      newlyMissedIds.push(id);
    }
    resolved.add(id);
  }

  const required = Math.max(
    0,
    Math.min(authored.length, Math.floor(finite(state.required, authored.length)))
  );
  const count = crossedIds.length;
  const resolvedCount = resolved.size;
  const remaining = authored.length - resolvedCount;
  const complete = count >= required;
  const failed = !complete && count + remaining < required;
  const multiplier = ordered
    .filter((entry) => crossedIds.includes(entry.geometry.id || `ring-${entry.index + 1}`))
    .reduce((value, entry) => value * positive(entry.geometry.multiplier, 1), 1);

  return Object.freeze({
    crossedIds: frozenArray(crossedIds),
    missedIds: frozenArray(missedIds),
    newlyCrossedIds: frozenArray(newlyCrossedIds),
    newlyMissedIds: frozenArray(newlyMissedIds),
    count,
    resolvedCount,
    required,
    complete,
    failed,
    multiplier
  });
}

/**
 * Classify a goal-plane point into a stable zone id.
 *
 * Top corners use a stricter lateral threshold than the general three-column
 * grid so "corner-only" cannot be cleared by a central shot under the bar.
 */
export function classifyGoalZone(point, dimensions = {}) {
  if (!point) return null;
  const width = positive(dimensions.width ?? dimensions.goalWidth, 9);
  const height = positive(dimensions.height ?? dimensions.goalHeight, 3.1);
  const x = finite(point.x, Number.NaN);
  const y = finite(point.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > width / 2 + EPSILON || y < 0 || y > height + EPSILON) return 'outside';

  const normalizedX = x / (width / 2);
  const normalizedY = y / height;
  if (normalizedY >= 0.62) {
    if (normalizedX <= -0.65) return 'top-left';
    if (normalizedX >= 0.65) return 'top-right';
    return 'top-center';
  }

  const row = normalizedY <= 0.34 ? 'bottom' : 'middle';
  const column = normalizedX <= -1 / 3 ? 'left' : normalizedX >= 1 / 3 ? 'right' : 'center';
  return `${row}-${column}`;
}

function frameRequirementMet(requiredContact, input) {
  const required = normalizeFrameContact(requiredContact) ?? 'frame';
  const contacts = new Set(
    (Array.isArray(input.frameContacts) ? input.frameContacts : [])
      .map(normalizeFrameContact)
      .filter(Boolean)
  );
  const direct = normalizeFrameContact(input.frameContact);
  if (direct) contacts.add(direct);
  if (input.frameTouched) contacts.add('frame');
  if (contacts.has('post') || contacts.has('crossbar')) contacts.add('frame');
  return contacts.has(required);
}

function objectiveFailure(reason, checks, extra = {}) {
  return Object.freeze({
    handled: true,
    qualifies: false,
    reason,
    checks: Object.freeze(checks),
    ...extra
  });
}

/**
 * Evaluate the six level-schema v2 objectives.
 *
 * Unknown/legacy objectives return `handled: false`, allowing GameScene's
 * existing objective switch to remain the compatibility path.
 */
export function evaluateAdvancedObjective(input = {}) {
  const objective = input.objective ?? {};
  const type = String(objective.type ?? '');
  if (!ADVANCED_OBJECTIVES.has(type)) {
    return Object.freeze({ handled: false, qualifies: false, reason: null, checks: Object.freeze({}) });
  }

  const outcome = String(input.outcome ?? '').toUpperCase();
  const shot = input.shot ?? {};
  const targetRequired = Boolean(input.target);
  const targetHit = input.targetHit ?? input.rating?.targetHit ?? !targetRequired;
  const spin = finite(shot.spin);
  const curveDirectionOk = !objective.curveDirection ||
    (objective.curveDirection === 'right' ? spin > 0 : spin < 0);
  const curveOk = Math.abs(spin) + EPSILON >= Math.max(0, finite(objective.minimumCurve)) &&
    curveDirectionOk;
  const checks = {
    scored: outcome === 'GOAL',
    target: Boolean(targetHit),
    curve: curveOk
  };

  if (!checks.scored) {
    return objectiveFailure('SCORE THE GOAL TO COMPLETE THE OBJECTIVE', checks);
  }
  if (!curveOk) {
    const reason = curveDirectionOk
      ? 'MORE BEND NEEDED — ARC THE END OF YOUR SWIPE'
      : `CURVE THE OTHER WAY — ${String(objective.curveDirection).toUpperCase()}`;
    return objectiveFailure(reason, checks);
  }

  let qualifies = false;
  let reason = null;
  const extra = {};

  if (type === 'bank-shot') {
    const frame = frameRequirementMet(objective.requiredContact, input);
    checks.frame = frame;
    qualifies = frame;
    reason = frame ? null : 'THE GOAL MUST GO IN OFF THE POST OR CROSSBAR';
  } else if (type === 'corner-only') {
    const zone = input.goalZone ?? classifyGoalZone(input.point, input.goalDimensions);
    const allowed = Array.isArray(objective.allowedZones) && objective.allowedZones.length
      ? objective.allowedZones
      : ['top-left', 'top-right'];
    checks.zone = allowed.includes(zone);
    extra.zone = zone;
    qualifies = checks.zone;
    reason = qualifies ? null : 'ONLY A TOP-CORNER FINISH COUNTS';
  } else if (type === 'limited-power') {
    const maximumPower = clamp(
      objective.maximumPower ?? input.maximumPower ?? 1,
      0,
      1
    );
    const power = clamp01(shot.power);
    checks.power = power <= maximumPower + EPSILON;
    qualifies = checks.power && checks.target;
    extra.maximumPower = maximumPower;
    reason = !checks.power
      ? `KEEP POWER AT OR BELOW ${Math.round(maximumPower * 100)}%`
      : !checks.target
        ? 'GOAL SCORED, BUT THE GOLD TARGET WAS MISSED'
        : null;
  } else if (type === 'blind-shot') {
    const aimGuideHidden = Boolean(
      input.aimGuideHidden ??
      shot.aimGuideHidden ??
      shot.guideCommitted
    );
    checks.aimGuideHidden = aimGuideHidden;
    qualifies = aimGuideHidden && checks.target;
    reason = !aimGuideHidden
      ? 'COMMIT BEFORE THE AIM GUIDE DISAPPEARS'
      : !checks.target
        ? 'GOAL SCORED, BUT THE GOLD TARGET WAS MISSED'
        : null;
  } else if (type === 'reverse-target') {
    const requiredZone = objective.requiredZone;
    const zoneHit = input.zoneHit ??
      input.hitZone ??
      (checks.target ? input.target?.number : null);
    checks.zone = requiredZone != null && String(zoneHit) === String(requiredZone);
    extra.zone = zoneHit;
    qualifies = checks.target && checks.zone;
    reason = qualifies
      ? null
      : `FIND NUMBERED ZONE ${String(requiredZone ?? '?')}`;
  } else if (type === 'ring-shot') {
    const ringProgress = input.ringProgress ?? {};
    const crossed = finite(
      ringProgress.count ?? ringProgress.crossedIds?.length ?? input.ringsCrossed,
      0
    );
    const required = Math.max(1, Math.floor(finite(objective.ringsRequired, 1)));
    checks.rings = crossed >= required;
    extra.ringsCrossed = crossed;
    extra.ringsRequired = required;
    qualifies = checks.rings && checks.target;
    reason = !checks.rings
      ? `THREAD ${required} HOOP${required === 1 ? '' : 'S'} BEFORE SCORING`
      : !checks.target
        ? 'HOOPS CLEARED — NOW FIND THE GOLD TARGET'
        : null;
  }

  return Object.freeze({
    handled: true,
    qualifies,
    reason,
    checks: Object.freeze(checks),
    ...extra
  });
}

/**
 * Normalize a keeper variant into explicit runtime instances.
 *
 * @param {object|null} config Authored `level.keeperConfig`.
 * @param {{baseSkill?: number, goalWidth?: number}} options Runtime context.
 */
export function normalizeKeeperConfig(config, options = {}) {
  const requestedType = String(config?.type ?? 'line').toLowerCase();
  const type = KEEPER_TYPES.has(requestedType) ? requestedType : 'line';
  const baseSkill = clamp01(options.baseSkill);
  const goalWidth = positive(options.goalWidth, 9);
  const maximumOffset = Math.max(0, goalWidth / 2 - 0.55);
  let instances;
  let normalized;

  if (type === 'double') {
    const authoredOffsets = Array.isArray(config?.offsets) && config.offsets.length >= 2
      ? config.offsets.slice(0, 2)
      : [-goalWidth * 0.195, goalWidth * 0.195];
    const offsets = authoredOffsets
      .map((value) => clamp(value, -maximumOffset, maximumOffset))
      .sort((left, right) => left - right);
    const skillScale = clamp(config?.skillScale ?? 0.85, 0.5, 1.2);
    instances = offsets.map((offsetX, index) => Object.freeze({
      id: `keeper-${index + 1}`,
      offsetX,
      skill: clamp01(baseSkill * skillScale)
    }));
    normalized = { type, skillScale, offsets: frozenArray(offsets) };
  } else {
    instances = [Object.freeze({ id: 'keeper-1', offsetX: 0, skill: baseSkill })];
    if (type === 'sweeper') {
      normalized = {
        type,
        rushDistance: clamp(config?.rushDistance ?? 2.2, 0.25, 5),
        rushSpeed: clamp(config?.rushSpeed ?? 4.5, 0.5, 9),
        triggerFlightTime: clamp(config?.triggerFlightTime ?? 0.35, 0, 2)
      };
    } else if (type === 'boss') {
      normalized = {
        type,
        name: String(config?.name ?? 'The Keeper').slice(0, 40),
        signature: String(config?.signature ?? 'adaptive-read').slice(0, 64),
        adaptation: clamp(config?.adaptation ?? 0.15, 0, 0.5),
        fakeChance: clamp01(config?.fakeChance ?? 0)
      };
    } else {
      normalized = { type: 'line' };
    }
  }

  return Object.freeze({
    ...normalized,
    baseSkill,
    count: instances.length,
    instances: frozenArray(instances)
  });
}

/**
 * Normalize legacy wall count plus optional v2 wall configuration.
 */
export function normalizeWallConfig(config, fallbackCount = 0) {
  const count = Math.max(
    0,
    Math.min(12, Math.floor(finite(config?.count, fallbackCount)))
  );
  const requestedType = String(config?.type ?? 'standard').toLowerCase();
  const type = WALL_TYPES.has(requestedType) ? requestedType : 'standard';
  const base = { type, count };

  if (type === 'moving') {
    return Object.freeze({
      ...base,
      range: clamp(config?.range ?? 0.6, 0, 2.5),
      speed: clamp(config?.speed ?? 0.7, 0.05, 4),
      phase: finite(config?.phase)
    });
  }
  if (type === 'rushing') {
    return Object.freeze({
      ...base,
      rushDistance: clamp(config?.rushDistance ?? 2.4, 0, 5),
      rushSpeed: clamp(config?.rushSpeed ?? 4.2, 0.1, 9),
      trigger: config?.trigger === 'flight' ? 'flight' : 'strike'
    });
  }
  if (type === 'split') {
    return Object.freeze({
      ...base,
      gapWidth: clamp(config?.gapWidth ?? 1.1, 0.4, 3),
      gapRange: clamp(config?.gapRange ?? 0.7, 0, 2),
      speed: clamp(config?.speed ?? 0.8, 0.05, 4),
      phase: finite(config?.phase)
    });
  }
  if (type === 'double') {
    const defaultFront = Math.floor(count / 2);
    const authoredRows = Array.isArray(config?.rows) && config.rows.length
      ? config.rows
      : [
          { count: defaultFront, depthOffset: -0.5, lateralOffset: -0.42 },
          { count: count - defaultFront, depthOffset: 0.5, lateralOffset: 0.42 }
        ];
    let remaining = count;
    const rows = authoredRows.slice(0, 4).map((row, index) => {
      const rowCount = index === authoredRows.length - 1
        ? remaining
        : Math.min(remaining, Math.max(0, Math.floor(finite(row?.count))));
      remaining -= rowCount;
      return Object.freeze({
        count: rowCount,
        depthOffset: clamp(row?.depthOffset ?? (index - 0.5), -2, 2),
        lateralOffset: clamp(row?.lateralOffset ?? 0, -2, 2)
      });
    });
    if (remaining > 0 && rows.length) {
      const last = rows.length - 1;
      rows[last] = Object.freeze({ ...rows[last], count: rows[last].count + remaining });
    }
    return Object.freeze({ ...base, rows: frozenArray(rows.filter((row) => row.count > 0)) });
  }
  if (type === 'deflector') {
    return Object.freeze({
      ...base,
      defenderIndex: Math.max(0, Math.min(Math.max(count - 1, 0), Math.floor(finite(config?.defenderIndex)))),
      extensionChance: clamp01(config?.extensionChance ?? 0.65),
      extensionReach: clamp(config?.extensionReach ?? 0.6, 0, 1.2)
    });
  }
  return Object.freeze({ type: 'standard', count });
}

function rowOffsets(count, spacing, center = 0) {
  return Array.from({ length: count }, (_, index) =>
    center + (index - (count - 1) / 2) * spacing
  );
}

/**
 * Produce defender pose offsets relative to the wall's authored center/z.
 *
 * For a rushing wall, negative z moves toward the kicker. Deflector reach is
 * returned as pose metadata; collision/render code decides the leg direction.
 */
export function getWallPoseOffsets(config, elapsedSeconds = 0, runtime = {}) {
  const normalized = normalizeWallConfig(config, config?.count);
  const time = Math.max(0, finite(elapsedSeconds));
  const spacing = clamp(runtime.spacing ?? 0.58, 0.25, 1.2);
  const poses = [];

  if (normalized.type === 'double') {
    let index = 0;
    normalized.rows.forEach((row, rowIndex) => {
      for (const x of rowOffsets(row.count, spacing, row.lateralOffset)) {
        poses.push({
          index,
          row: rowIndex,
          x,
          z: row.depthOffset,
          role: 'wall',
          legExtension: 0
        });
        index++;
      }
    });
  } else if (normalized.type === 'split') {
    const gapCenter = Math.sin(time * normalized.speed + normalized.phase) * normalized.gapRange;
    const leftCount = Math.floor(normalized.count / 2);
    const rightCount = normalized.count - leftCount;
    for (let index = 0; index < leftCount; index++) {
      poses.push({
        index,
        row: 0,
        x: gapCenter - normalized.gapWidth / 2 - spacing * (leftCount - index - 0.5),
        z: 0,
        role: 'wall',
        legExtension: 0
      });
    }
    for (let index = 0; index < rightCount; index++) {
      poses.push({
        index: leftCount + index,
        row: 0,
        x: gapCenter + normalized.gapWidth / 2 + spacing * (index + 0.5),
        z: 0,
        role: 'wall',
        legExtension: 0
      });
    }
  } else {
    const movingX = normalized.type === 'moving'
      ? Math.sin(time * normalized.speed + normalized.phase) * normalized.range
      : 0;
    const rushingZ = normalized.type === 'rushing' && runtime.struck
      ? -Math.min(
          normalized.rushDistance,
          Math.max(0, finite(runtime.strikeElapsed)) * normalized.rushSpeed
        )
      : 0;
    for (const [index, x] of rowOffsets(normalized.count, spacing, movingX).entries()) {
      const deflector = normalized.type === 'deflector' && index === normalized.defenderIndex;
      poses.push({
        index,
        row: 0,
        x,
        z: rushingZ,
        role: deflector ? 'deflector' : 'wall',
        legExtension: deflector && runtime.deflectorActive ? normalized.extensionReach : 0
      });
    }
  }

  return frozenArray(poses.map((pose) => Object.freeze(pose)));
}

