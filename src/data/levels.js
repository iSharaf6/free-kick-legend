// Career progression is deliberately data-driven. The original scalar fields
// (distance/offsetX/wall/keeper/wind/target) remain the compatibility layer;
// schema v2 adds structured encounter data without changing stable level IDs.

export const LEVEL_SCHEMA_VERSION = 2;

export const WALL_TYPES = Object.freeze([
  'standard',
  'moving',
  'rushing',
  'split',
  'double',
  'deflector'
]);

export const HAZARD_TYPES = Object.freeze([
  'glare',
  'fog',
  'snow',
  'slippery',
  'crowd-pressure'
]);

export const ADVANCED_OBJECTIVE_TYPES = Object.freeze([
  'bank-shot',
  'ring-shot',
  'corner-only',
  'limited-power',
  'blind-shot',
  'reverse-target'
]);

const VALID_OBJECTIVE_TYPES = new Set([
  'score', 'target', 'loft', 'curve', 'goals', 'curve-target', 'dip',
  'low-shot', 'power', 'target-streak', 'wind-target', 'streak',
  'curve-streak', 'final', 'daily-score', ...ADVANCED_OBJECTIVE_TYPES
]);

const EMPTY_LIST = Object.freeze([]);
const FULL_GOAL = Object.freeze({ widthScale: 1, heightScale: 1 });
const STANDARD_SHOT_RULES = Object.freeze({
  maxPower: 1,
  aimGuide: 'always',
  aimFadeCorner: null,
  powerJitter: 0
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const CUPS = Object.freeze([
  { id: 'academy', name: 'Rookie Academy', subtitle: 'Learn the strike', levelIds: [] },
  { id: 'curve', name: 'Curve Craft', subtitle: 'Shape the impossible', levelIds: [] },
  { id: 'targets', name: 'Target Masters', subtitle: 'Own every corner', levelIds: [] },
  { id: 'pressure', name: 'Pressure Tour', subtitle: 'Deliver when it matters', levelIds: [] },
  { id: 'legend', name: 'Legend Finals', subtitle: 'Become unplayable', levelIds: [] }
]);

export const TARGETS = Object.freeze({
  // x is normalized across the goal (-1..1), y is normalized from ground to
  // crossbar (0..1), while rx/ry are the ellipse radii in world metres.
  center: Object.freeze({ id: 'center', label: 'Centre target', x: 0, y: 0.5, rx: 1.25, ry: 0.9 }),
  lowCenter: Object.freeze({ id: 'low-center', label: 'Low centre', x: 0, y: 0.22, rx: 1.5, ry: 0.56 }),
  lowLeft: Object.freeze({ id: 'low-left', label: 'Bottom left', x: -0.68, y: 0.23, rx: 1.1, ry: 0.58 }),
  lowRight: Object.freeze({ id: 'low-right', label: 'Bottom right', x: 0.68, y: 0.23, rx: 1.1, ry: 0.58 }),
  topLeft: Object.freeze({ id: 'top-left', label: 'Top left', x: -0.68, y: 0.77, rx: 1.05, ry: 0.56 }),
  topCenter: Object.freeze({ id: 'top-center', label: 'Top centre', x: 0, y: 0.78, rx: 1.3, ry: 0.54 }),
  topRight: Object.freeze({ id: 'top-right', label: 'Top right', x: 0.68, y: 0.77, rx: 1.05, ry: 0.56 })
});

const CALM = Object.freeze({ x: 0, y: 0, z: 0, gust: 0, direction: 'calm', label: 'Calm' });

function wind(x, gust = 0, z = 0, customLabel = null) {
  const direction = x < 0 ? 'left' : x > 0 ? 'right' : 'calm';
  return Object.freeze({
    x,
    y: 0,
    z,
    gust,
    direction,
    label: customLabel ?? (direction === 'calm' ? 'Calm' : `${Math.abs(x).toFixed(1)} crosswind ${direction}`)
  });
}

// Rotating wind retains x/y/z/gust so older consumers get a safe initial
// vector. A v2 runtime can rotate that vector from magnitude/period/phase.
function rotatingWind(magnitude, period, options = {}) {
  const phase = options.phase ?? 0;
  const clockwise = options.clockwise ?? true;
  return deepFreeze({
    x: Math.cos(phase) * magnitude,
    y: Math.sin(phase) * magnitude,
    z: options.z ?? 0,
    gust: options.gust ?? 0,
    direction: 'rotating',
    label: options.label ?? 'Swirling stadium wind',
    rotation: {
      magnitude,
      period,
      phase,
      clockwise
    }
  });
}

// Wall distances/ranges are world metres. Oscillation speed is radians/second;
// rushSpeed is metres/second and phase is radians.
function wallConfig(type, count, options = {}) {
  return deepFreeze({ type, count, ...options });
}

function goal(widthScale, heightScale = 1) {
  return deepFreeze({ widthScale, heightScale });
}

function hazard(type, options = {}) {
  return deepFreeze({ type, ...options });
}

function keeperConfig(type, options = {}) {
  return deepFreeze({ type, ...options });
}

// Hoops use normalized goal coordinates for x/y and normalized ball-to-goal
// progress for z. Radius remains in world metres for consistent collision.
function ring(id, x, y, z, radius = 0.65, multiplier = 1.25) {
  return deepFreeze({ id, x, y, z, radius, multiplier });
}

function shotRules(options = {}) {
  return deepFreeze({ ...STANDARD_SHOT_RULES, ...options });
}

function numberedTarget(number, target) {
  return deepFreeze({ ...target, id: `zone-${number}`, label: `Zone ${number}`, number });
}

function objective(type, label, options = {}) {
  const advanced = {};
  for (const key of [
    'requiredContact',
    'ringsRequired',
    'allowedZones',
    'maximumPower',
    'requiredZone',
    'guideMode'
  ]) {
    if (options[key] != null) advanced[key] = options[key];
  }

  return deepFreeze({
    type,
    label,
    goals: options.goals ?? 1,
    attempts: options.attempts ?? Math.max(3, (options.goals ?? 1) + 2),
    curveDirection: options.curveDirection ?? null,
    // Honor authored curve requirements; the guard only rejects impossible
    // values (spin is capped at 1.0 by SHOT.maxSpin).
    minimumCurve: Math.min(options.minimumCurve ?? 0, 0.6),
    maximumHeight: options.maximumHeight ?? null,
    minimumHeight: options.minimumHeight ?? null,
    consecutive: options.consecutive ?? false,
    ...advanced
  });
}

function reward(coins, threeStarBonus = Math.round(coins * 0.5)) {
  return Object.freeze({ coins, threeStarBonus });
}

function makeLevel(definition) {
  return deepFreeze({
    schemaVersion: LEVEL_SCHEMA_VERSION,
    wind: CALM,
    target: null,
    style: 'balanced',
    attempts: definition.objective?.attempts ?? 3,
    ...definition
  });
}

const RAW_LEVELS = [
  // ---------------------------------------------------------------- academy
  makeLevel({
    id: 'academy-01', cup: 'academy', name: 'First Touch', distance: 14, offsetX: 0, wall: 0, keeper: 0.08,
    objective: objective('score', 'Score your first free kick'), reward: reward(40), style: 'training'
  }),
  makeLevel({
    id: 'academy-02', cup: 'academy', name: 'Find the Middle', distance: 14.5, offsetX: 0, wall: 0, keeper: 0.12,
    objective: objective('target', 'Place the ball through the centre'), target: TARGETS.center, reward: reward(45), style: 'training'
  }),
  makeLevel({
    id: 'academy-03', cup: 'academy', name: 'Lift Off', distance: 15, offsetX: 0, wall: 2, keeper: 0.14,
    objective: objective('loft', 'Lift the ball over the wall', { minimumHeight: 1.9 }), reward: reward(50), style: 'training'
  }),
  makeLevel({
    id: 'academy-04', cup: 'academy', name: 'Pick the Left', distance: 15, offsetX: 1.5, wall: 1, keeper: 0.16,
    objective: objective('target', 'Finish in the bottom-left target'), target: TARGETS.lowLeft, reward: reward(55), style: 'calm'
  }),
  makeLevel({
    id: 'academy-05', cup: 'academy', name: 'Pick the Right', distance: 15, offsetX: -1.5, wall: 1, keeper: 0.18,
    objective: objective('target', 'Finish in the bottom-right target'), target: TARGETS.lowRight, reward: reward(55), style: 'calm'
  }),
  makeLevel({
    id: 'academy-06', cup: 'academy', name: 'First Bend', distance: 15.5, offsetX: -2.5, wall: 2, keeper: 0.2,
    objective: objective('curve', 'Bend the shot around the wall', { minimumCurve: 0.2 }), reward: reward(60), style: 'late-dive'
  }),
  makeLevel({
    id: 'academy-07', cup: 'academy', name: 'Keeper Awake', distance: 16, offsetX: 0, wall: 2, keeper: 0.27,
    objective: objective('score', 'Beat the alert goalkeeper'), reward: reward(65), style: 'balanced'
  }),
  makeLevel({
    id: 'academy-08', cup: 'academy', name: 'Academy Final', distance: 17, offsetX: 2, wall: 3, keeper: 0.3,
    objective: objective('goals', 'Score twice before the attempts run out', { goals: 2 }), reward: reward(90, 50), style: 'balanced'
  }),
  makeLevel({
    id: 'academy-09', cup: 'academy', name: 'Either Corner', distance: 16.5, offsetX: 0.5, wall: 2, keeper: 0.27,
    objective: objective('score', 'Finish past the keeper'), reward: reward(75), style: 'balanced'
  }),
  makeLevel({
    id: 'academy-10', cup: 'academy', name: 'Graduation Kick', distance: 17.5, offsetX: -2, wall: 3, keeper: 0.32,
    objective: objective('curve', 'Score with visible curl', { minimumCurve: 0.2 }), reward: reward(105, 60), style: 'late-dive'
  }),

  // ------------------------------------------------------------------- curve
  makeLevel({
    id: 'curve-01', cup: 'curve', name: 'Outside Left', distance: 16, offsetX: 3.5, wall: 3, keeper: 0.3,
    objective: objective('curve', 'Curl the ball left around the wall', { curveDirection: 'left', minimumCurve: 0.28 }), reward: reward(70), style: 'line-reader'
  }),
  makeLevel({
    id: 'curve-02', cup: 'curve', name: 'Outside Right', distance: 16, offsetX: -3.5, wall: 3, keeper: 0.32,
    objective: objective('curve', 'Curl the ball right around the wall', { curveDirection: 'right', minimumCurve: 0.28 }), reward: reward(70), style: 'line-reader'
  }),
  makeLevel({
    id: 'curve-03', cup: 'curve', name: 'Far Post Artist', distance: 17, offsetX: -4, wall: 3, keeper: 0.34,
    objective: objective('curve-target', 'Curl into the far top corner', { curveDirection: 'right', minimumCurve: 0.3 }), target: TARGETS.topRight,
    reward: reward(80), style: 'late-dive'
  }),
  makeLevel({
    id: 'curve-04', cup: 'curve', name: 'Near Post Snap', distance: 17, offsetX: 4, wall: 3, keeper: 0.36,
    objective: objective('curve-target', 'Bend it into the near top corner', { curveDirection: 'left', minimumCurve: 0.25 }), target: TARGETS.topLeft,
    reward: reward(80), style: 'aggressive'
  }),
  makeLevel({
    id: 'curve-05', cup: 'curve', name: 'Over and Down', distance: 18, offsetX: 0, wall: 4, keeper: 0.36,
    objective: objective('dip', 'Clear the wall, then finish away from the keeper', { minimumHeight: 1.95 }),
    reward: reward(85), style: 'line-reader'
  }),
  makeLevel({
    id: 'curve-06', cup: 'curve', name: 'Under the Jump', distance: 16, offsetX: 1, wall: 4, keeper: 0.38,
    objective: objective('low-shot', 'Sneak a low finish beneath the jumping wall', { maximumHeight: 0.75 }),
    reward: reward(90), style: 'aggressive'
  }),
  makeLevel({
    id: 'curve-07', cup: 'curve', name: 'Changing Breeze', distance: 18, offsetX: -2, wall: 4, keeper: 0.4,
    objective: objective('curve', 'Read the flags, then shape the finish', { curveDirection: 'right', minimumCurve: 0.22 }),
    wind: rotatingWind(0.36, 7.2, { phase: 0.3, gust: 0.06, label: 'Slow swirling breeze' }),
    reward: reward(95), style: 'line-reader'
  }),
  makeLevel({
    id: 'curve-08', cup: 'curve', name: 'Curve Craft Final', distance: 19, offsetX: 3, wall: 4, keeper: 0.44,
    objective: objective('goals', 'Score two curved goals', { goals: 2, minimumCurve: 0.3 }), wind: wind(-0.25, 0.05),
    reward: reward(120, 70), style: 'anticipator'
  }),
  makeLevel({
    id: 'curve-09', cup: 'curve', name: 'Switchback', distance: 18.5, offsetX: -3.5, wall: 4, keeper: 0.42,
    objective: objective('curve', 'Curve against the crosswind', { curveDirection: 'right', minimumCurve: 0.24 }), wind: wind(-0.35, 0.05),
    wallConfig: wallConfig('moving', 4, { range: 0.55, speed: 0.58, phase: 0.4 }),
    reward: reward(110), style: 'line-reader'
  }),
  makeLevel({
    id: 'curve-10', cup: 'curve', name: 'Master of Bend', distance: 19.5, offsetX: 2.5, wall: 4, keeper: 0.46,
    objective: objective('goals', 'Score two shaped finishes', { goals: 2, minimumCurve: 0.24 }), reward: reward(145, 85), style: 'anticipator'
  }),

  // ----------------------------------------------------------------- targets
  makeLevel({
    id: 'targets-01', cup: 'targets', name: 'Low Left Lock', distance: 17, offsetX: 1, wall: 3, keeper: 0.4,
    objective: objective('target', 'Hit the bottom-left target'), target: TARGETS.lowLeft, reward: reward(95), style: 'balanced'
  }),
  makeLevel({
    id: 'targets-02', cup: 'targets', name: 'Low Right Lock', distance: 17, offsetX: -1, wall: 3, keeper: 0.42,
    objective: objective('target', 'Hit the bottom-right target'), target: TARGETS.lowRight, reward: reward(95), style: 'balanced'
  }),
  makeLevel({
    id: 'targets-03', cup: 'targets', name: 'Top Left Postage', distance: 18, offsetX: 2.5, wall: 4, keeper: 0.42,
    objective: objective('target', 'Find the top-left target'), target: TARGETS.topLeft, reward: reward(105), style: 'line-reader'
  }),
  makeLevel({
    id: 'targets-04', cup: 'targets', name: 'Top Right Postage', distance: 18, offsetX: -2.5, wall: 4, keeper: 0.44,
    objective: objective('target', 'Find the top-right target'), target: TARGETS.topRight, reward: reward(105), style: 'line-reader'
  }),
  makeLevel({
    id: 'targets-05', cup: 'targets', name: 'Crossbar Window', distance: 19, offsetX: 0, wall: 4, keeper: 0.46,
    objective: objective('target', 'Drive through the high centre window'), target: TARGETS.topCenter,
    goal: goal(0.92), reward: reward(110), style: 'anticipator'
  }),
  makeLevel({
    id: 'targets-06', cup: 'targets', name: 'Dead Centre', distance: 20, offsetX: 0, wall: 5, keeper: 0.48,
    objective: objective('target', 'Thread the centre target'), target: TARGETS.center, wind: wind(-0.3, 0.04),
    wallConfig: wallConfig('moving', 5, { range: 0.7, speed: 0.64, phase: 1.2 }),
    reward: reward(115), style: 'aggressive'
  }),
  makeLevel({
    id: 'targets-07', cup: 'targets', name: 'Golden Thread', distance: 19, offsetX: 4.5, wall: 4, keeper: 0.5,
    objective: objective('ring-shot', 'Thread both hoops, then find the far corner', { ringsRequired: 2 }),
    target: TARGETS.topLeft, wind: wind(0.25, 0.05),
    // Gate centres are sampled from a real scoring trajectory (vx -8.7, vy 6.8,
    // vz 22, spin +0.35) rather than placed by eye. The authored-by-eye pair
    // this replaces could only be threaded with maximum curl and a 5mm margin,
    // and no shot that threaded them could also reach the top-left target.
    rings: [
      ring('near-hoop', 0.49, 0.54, 0.3, 0.95),
      ring('far-hoop', -0.11, 0.8, 0.72, 0.85, 1.5)
    ],
    reward: reward(120), style: 'anticipator'
  }),
  makeLevel({
    id: 'targets-08', cup: 'targets', name: 'Split Decision', distance: 20, offsetX: -3, wall: 5, keeper: 0.52,
    objective: objective('target-streak', 'Time the shifting gap and hit two targets', { goals: 2, consecutive: true }), target: TARGETS.topRight,
    wallConfig: wallConfig('split', 5, { gapWidth: 1.2, gapRange: 0.72, speed: 0.82, phase: 0.3 }),
    reward: reward(150, 90), style: 'anticipator'
  }),
  makeLevel({
    id: 'targets-09', cup: 'targets', name: 'Velvet Touch', distance: 18.5, offsetX: 1.5, wall: 4, keeper: 0.48,
    objective: objective('limited-power', 'Find the low target without exceeding 72% power', { maximumPower: 0.72 }),
    target: TARGETS.lowCenter, shotRules: shotRules({ maxPower: 0.72 }), reward: reward(130), style: 'aggressive'
  }),
  makeLevel({
    id: 'targets-10', cup: 'targets', name: 'Zone Seven', distance: 20, offsetX: -2, wall: 4, keeper: 0.54,
    objective: objective('reverse-target', 'Score twice through numbered zone 7', { goals: 2, requiredZone: 7 }),
    target: numberedTarget(7, TARGETS.topCenter), goal: goal(0.86, 0.96),
    reward: reward(175, 105), style: 'anticipator'
  }),

  // ---------------------------------------------------------------- pressure
  makeLevel({
    id: 'pressure-01', cup: 'pressure', name: 'Through the Haze', distance: 22, offsetX: 0, wall: 4, keeper: 0.48,
    objective: objective('score', 'Score from long range through light fog'), wind: wind(0.2, 0.05),
    hazards: [hazard('fog', { density: 0.28, goalVisibility: 0.72 })], reward: reward(120), style: 'balanced'
  }),
  makeLevel({
    id: 'pressure-02', cup: 'pressure', name: 'Wide Left', distance: 18, offsetX: -5.5, wall: 4, keeper: 0.5,
    objective: objective('curve', 'Recover the angle while the wall tracks you', { curveDirection: 'right', minimumCurve: 0.3 }),
    wallConfig: wallConfig('moving', 4, { range: 0.9, speed: 0.78, phase: 2.1 }), reward: reward(125), style: 'line-reader'
  }),
  makeLevel({
    id: 'pressure-03', cup: 'pressure', name: 'Closing Down', distance: 18, offsetX: 5.5, wall: 4, keeper: 0.52,
    objective: objective('curve', 'Bend it before the wall closes you down', { curveDirection: 'left', minimumCurve: 0.3 }),
    wallConfig: wallConfig('rushing', 4, { rushDistance: 2.4, rushSpeed: 4.2, trigger: 'strike' }), reward: reward(125), style: 'line-reader'
  }),
  makeLevel({
    id: 'pressure-04', cup: 'pressure', name: 'Into the Wind', distance: 21, offsetX: 0, wall: 5, keeper: 0.52,
    objective: objective('power', 'Beat the headwind and hostile crowd'), wind: wind(0, 0.18, -3.2, 'Strong headwind'),
    hazards: [hazard('crowd-pressure', { intensity: 0.35, aimWindowScale: 0.86, pulseSpeed: 0.8 })],
    reward: reward(130), style: 'aggressive'
  }),
  makeLevel({
    id: 'pressure-05', cup: 'pressure', name: 'Weather Vane', distance: 20, offsetX: 2, wall: 5, keeper: 0.54,
    objective: objective('wind-target', 'Read the flags and counter the rotating wind'), target: TARGETS.topRight,
    wind: rotatingWind(0.68, 5.8, { phase: 2.7, gust: 0.1, clockwise: false }),
    reward: reward(135), style: 'anticipator'
  }),
  makeLevel({
    id: 'pressure-06', cup: 'pressure', name: 'Lost in the Lights', distance: 20, offsetX: -2, wall: 5, keeper: 0.56,
    objective: objective('blind-shot', 'Commit early, then finish through the glare', { guideMode: 'hide-on-run-up' }),
    target: TARGETS.topLeft, wind: wind(0.38, 0.08),
    hazards: [hazard('glare', { corner: 'top-left', strength: 0.62, radius: 0.34 })],
    shotRules: shotRules({ aimGuide: 'hide-on-run-up', aimFadeCorner: 'top-left' }),
    reward: reward(135), style: 'anticipator'
  }),
  makeLevel({
    id: 'pressure-07', cup: 'pressure', name: 'Double Decker', distance: 18, offsetX: 0, wall: 6, keeper: 0.58,
    objective: objective('score', 'Dip the ball beyond two staggered rows'),
    wallConfig: wallConfig('double', 6, {
      rows: [
        { count: 3, depthOffset: -0.55, lateralOffset: -0.48 },
        { count: 3, depthOffset: 0.55, lateralOffset: 0.48 }
      ]
    }),
    reward: reward(145), style: 'aggressive'
  }),
  makeLevel({
    id: 'pressure-08', cup: 'pressure', name: 'Pressure Final', distance: 21, offsetX: 3.5, wall: 5, keeper: 0.62,
    objective: objective('streak', 'Score two goals without missing', { goals: 2, consecutive: true }), wind: wind(-0.35, 0.1),
    wallConfig: wallConfig('split', 5, { gapWidth: 1.05, gapRange: 0.82, speed: 1.05, phase: 1.4 }),
    hazards: [hazard('crowd-pressure', { intensity: 0.56, aimWindowScale: 0.75, pulseSpeed: 1.15 })],
    reward: reward(180, 110), style: 'anticipator'
  }),
  makeLevel({
    id: 'pressure-09', cup: 'pressure', name: 'Snow Day', distance: 23, offsetX: -2.5, wall: 5, keeper: 0.58,
    objective: objective('power', 'Drive through the snow before the ball slows'), wind: wind(0.25, 0.05),
    hazards: [hazard('snow', { drag: 0.075, trail: true, density: 0.58 })], reward: reward(155), style: 'aggressive'
  }),
  makeLevel({
    id: 'pressure-10', cup: 'pressure', name: 'Hold Your Nerve', distance: 21.5, offsetX: 3, wall: 5, keeper: 0.64,
    objective: objective('goals', 'Score twice on the slippery run-up', { goals: 2 }), wind: wind(-0.3, 0.08),
    hazards: [hazard('slippery', { powerJitter: 0.09, frequency: 8.5 })],
    shotRules: shotRules({ powerJitter: 0.09 }),
    reward: reward(205, 125), style: 'anticipator'
  }),

  // ------------------------------------------------------------------ legend
  makeLevel({
    id: 'legend-01', cup: 'legend', name: 'Needlework', distance: 20, offsetX: -4, wall: 5, keeper: 0.62,
    objective: objective('ring-shot', 'Curve through both hoops into the far corner', { curveDirection: 'right', minimumCurve: 0.34, ringsRequired: 2 }),
    target: TARGETS.topRight,
    // Sampled from a scoring trajectory that also satisfies this level's
    // minimum right-hand curve (vx 5.7, vy 7.0, vz 22, spin +0.45); the
    // previous pair needed maximum spin and left a 1mm margin.
    rings: [
      ring('bend-gate', -0.47, 0.6, 0.32, 0.9),
      ring('finish-gate', 0.09, 0.84, 0.74, 0.8, 1.6)
    ],
    reward: reward(155), style: 'legend'
  }),
  makeLevel({
    id: 'legend-02', cup: 'legend', name: 'Sweeper Trap', distance: 18, offsetX: 2, wall: 4, keeper: 0.66,
    objective: objective('target', 'Beat the sweeper before he closes the angle'), target: TARGETS.lowLeft,
    keeperConfig: keeperConfig('sweeper', { rushDistance: 2.2, rushSpeed: 4.8, triggerFlightTime: 0.32 }),
    reward: reward(160), style: 'legend'
  }),
  makeLevel({
    id: 'legend-03', cup: 'legend', name: 'Whiteout', distance: 20, offsetX: 6, wall: 5, keeper: 0.66,
    objective: objective('wind-target', 'Memorise the corner, then master the storm'), target: TARGETS.topLeft,
    wind: rotatingWind(0.82, 4.9, { phase: 0.8, gust: 0.18, clockwise: false, label: 'Swirling storm' }),
    hazards: [hazard('fog', { density: 0.6, goalVisibility: 0.38 })],
    reward: reward(170), style: 'legend'
  }),
  makeLevel({
    id: 'legend-04', cup: 'legend', name: 'Top Bins Only', distance: 21, offsetX: 0, wall: 5, keeper: 0.7,
    objective: objective('corner-only', 'Only a top-corner finish counts', { allowedZones: ['top-left', 'top-right'] }),
    goal: goal(0.84, 0.94),
    reward: reward(175), style: 'legend'
  }),
  makeLevel({
    id: 'legend-05', cup: 'legend', name: 'The Deflector', distance: 17, offsetX: -1, wall: 6, keeper: 0.7,
    objective: objective('low-shot', 'Stay low beneath the defender\'s outstretched leg', { maximumHeight: 0.72 }),
    wallConfig: wallConfig('deflector', 6, { defenderIndex: 4, extensionChance: 0.72, extensionReach: 0.62 }),
    reward: reward(180), style: 'legend'
  }),
  makeLevel({
    id: 'legend-06', cup: 'legend', name: 'Two of a Kind', distance: 22, offsetX: 4, wall: 5, keeper: 0.74,
    objective: objective('goals', 'Score twice past the cup-final keeper duo', { goals: 2 }), wind: wind(-0.4, 0.1),
    keeperConfig: keeperConfig('double', { offsets: [-1.75, 1.75], skillScale: 0.82 }),
    reward: reward(190), style: 'legend'
  }),
  makeLevel({
    id: 'legend-07', cup: 'legend', name: 'No Standing Still', distance: 23, offsetX: -5, wall: 6, keeper: 0.77,
    objective: objective('curve-streak', 'Score two curved goals before the rush', { goals: 2, consecutive: true, minimumCurve: 0.35 }), wind: wind(0.45, 0.14),
    wallConfig: wallConfig('rushing', 6, { rushDistance: 2.8, rushSpeed: 5.2, trigger: 'strike' }),
    hazards: [hazard('slippery', { powerJitter: 0.11, frequency: 10 })],
    shotRules: shotRules({ powerJitter: 0.11 }),
    reward: reward(210), style: 'legend'
  }),
  makeLevel({
    id: 'legend-08', cup: 'legend', name: 'Vega\'s Duel', distance: 21, offsetX: 0, wall: 6, keeper: 0.8,
    objective: objective('final', 'Decode Vega and score three different finishes', { goals: 3 }), wind: wind(-0.25, 0.16),
    keeperConfig: keeperConfig('boss', {
      name: 'Vega', signature: 'late-double-step', adaptation: 0.16, fakeChance: 0.42
    }),
    wallConfig: wallConfig('double', 6, {
      rows: [
        { count: 3, depthOffset: -0.5, lateralOffset: -0.42 },
        { count: 3, depthOffset: 0.5, lateralOffset: 0.42 }
      ]
    }),
    reward: reward(300, 200), style: 'boss'
  }),
  makeLevel({
    id: 'legend-09', cup: 'legend', name: 'Woodwork', distance: 22, offsetX: 4.5, wall: 6, keeper: 0.76,
    objective: objective('bank-shot', 'Bank the ball in off a post or the crossbar', { attempts: 4, requiredContact: 'frame' }),
    wind: wind(0.35, 0.12), goal: goal(0.9, 0.96),
    reward: reward(230, 140), style: 'legend'
  }),
  makeLevel({
    id: 'legend-10', cup: 'legend', name: 'Immortal', distance: 22, offsetX: 0, wall: 6, keeper: 0.78,
    objective: objective('final', 'Score three different finishes in the gauntlet', { goals: 3, attempts: 5 }),
    wind: rotatingWind(0.52, 5.2, { phase: 2.2, gust: 0.13, label: 'Finals swirl' }),
    wallConfig: wallConfig('split', 6, { gapWidth: 0.96, gapRange: 0.9, speed: 1.12, phase: 2.4 }),
    goal: goal(0.82, 0.92),
    hazards: [
      hazard('glare', { corner: 'top-right', strength: 0.48, radius: 0.3 }),
      hazard('crowd-pressure', { intensity: 0.72, aimWindowScale: 0.68, pulseSpeed: 1.35 })
    ],
    shotRules: shotRules({ aimGuide: 'fade-near-corner', aimFadeCorner: 'top-right' }),
    keeperConfig: keeperConfig('boss', { name: 'Vega Prime', signature: 'adaptive-read', adaptation: 0.22 }),
    reward: reward(360, 240), style: 'boss'
  })
];

export const LEVELS = Object.freeze(RAW_LEVELS);

const AIM_GUIDE_MODES = new Set(['always', 'hide-on-run-up', 'fade-near-corner', 'commit']);
const KEEPER_TYPES = new Set(['line', 'sweeper', 'double', 'boss']);

/**
 * Return stable mechanic tags for menus, telemetry and runtime routing.
 * The helper accepts legacy levels: absent v2 fields simply produce no tags.
 */
export function getLevelMechanics(level) {
  const mechanics = [];
  const wall = level?.wallConfig;
  const goalSize = level?.goal ?? FULL_GOAL;

  if (wall?.type && wall.type !== 'standard') mechanics.push(`${wall.type}-wall`);
  if (level?.movingTarget) mechanics.push('moving-target');
  if (level?.wind?.rotation) mechanics.push('rotating-wind');
  if (goalSize.widthScale < 1 || goalSize.heightScale < 1) mechanics.push('smaller-goal');
  for (const condition of level?.hazards ?? EMPTY_LIST) mechanics.push(condition.type);
  if (level?.rings?.length) mechanics.push('hoop-threading');
  if (ADVANCED_OBJECTIVE_TYPES.includes(level?.objective?.type)) mechanics.push(level.objective.type);
  if (level?.keeperConfig?.type && level.keeperConfig.type !== 'line') {
    mechanics.push(`${level.keeperConfig.type}-keeper`);
  }

  return Object.freeze([...new Set(mechanics)]);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function inRange(value, min, max) {
  return finite(value) && value >= min && value <= max;
}

/** Validate one authored level without Phaser or browser globals. */
export function validateLevelDefinition(level) {
  const errors = [];
  const fail = (message) => errors.push(`${level?.id ?? '<unknown>'}: ${message}`);

  if (!level || typeof level !== 'object') return ['<unknown>: level must be an object'];
  if (!/^[a-z]+-\d{2}$/.test(level.id ?? '')) fail('id must use cup-00 format');
  if (typeof level.name !== 'string' || !level.name.trim()) fail('name is required');
  if (!inRange(level.distance, 13, 23)) fail('distance must be between 13 and 23 metres');
  if (!inRange(level.offsetX, -6, 6)) fail('offsetX must be between -6 and 6 metres');
  if (!Number.isInteger(level.wall) || level.wall < 0 || level.wall > 6) fail('wall must be an integer from 0 to 6');
  if (!inRange(level.keeper, 0, 0.8)) fail('keeper skill must be between 0 and 0.8');
  if (!level.objective || typeof level.objective.label !== 'string') fail('objective label is required');
  if (!VALID_OBJECTIVE_TYPES.has(level.objective?.type)) fail(`unknown objective type ${level.objective?.type}`);
  if (!Number.isInteger(level.attempts) || level.attempts < 1) fail('attempts must be a positive integer');
  if (!Number.isInteger(level.objective?.goals) || level.objective.goals < 1) fail('objective goals must be a positive integer');
  if (level.objective?.goals > level.attempts) fail('objective goals cannot exceed attempts');

  if (!level.wind || !finite(level.wind.x) || !finite(level.wind.y) || !finite(level.wind.z) || !finite(level.wind.gust)) {
    fail('wind must expose finite x/y/z/gust compatibility fields');
  }
  if (level.wind?.rotation) {
    if (!(level.wind.rotation.magnitude > 0)) fail('rotating wind magnitude must be positive');
    if (!(level.wind.rotation.period >= 2)) fail('rotating wind period must be at least two seconds');
    if (!finite(level.wind.rotation.phase)) fail('rotating wind phase must be finite');
  }

  if (level.target) {
    if (!inRange(level.target.x, -1, 1) || !inRange(level.target.y, 0, 1)) fail('target centre must be normalized');
    if (!(level.target.rx > 0) || !(level.target.ry > 0)) fail('target radii must be positive');
  }
  if (level.movingTarget) {
    if (!level.target) fail('movingTarget requires target');
    if (!(level.movingTarget.range > 0) || !(level.movingTarget.speed > 0) || !finite(level.movingTarget.phase)) {
      fail('movingTarget requires positive range/speed and finite phase');
    }
  }

  if (level.wallConfig) {
    if (!WALL_TYPES.includes(level.wallConfig.type)) fail(`unknown wall type ${level.wallConfig.type}`);
    if (level.wallConfig.count !== level.wall) fail('wallConfig.count must match legacy wall');
    if (level.wallConfig.type === 'double') {
      const rowCount = (level.wallConfig.rows ?? EMPTY_LIST).reduce((sum, row) => sum + (row.count || 0), 0);
      if (rowCount !== level.wall) fail('double-wall row counts must match legacy wall');
    }
    if (level.wallConfig.type === 'split' && !(level.wallConfig.gapWidth > 0)) fail('split wall needs a positive gapWidth');
    if (level.wallConfig.type === 'rushing' && !(level.wallConfig.rushSpeed > 0)) fail('rushing wall needs a positive rushSpeed');
  }

  if (level.goal) {
    if (!inRange(level.goal.widthScale, 0.65, 1) || !inRange(level.goal.heightScale, 0.65, 1)) {
      fail('goal scales must be between 0.65 and 1');
    }
  }
  if (level.shotRules) {
    if (!inRange(level.shotRules.maxPower, 0.45, 1)) fail('shotRules.maxPower must be between 0.45 and 1');
    if (!AIM_GUIDE_MODES.has(level.shotRules.aimGuide)) fail(`unknown aim guide mode ${level.shotRules.aimGuide}`);
    if (!inRange(level.shotRules.powerJitter, 0, 0.2)) fail('power jitter must be between 0 and 0.2');
  }

  const hazardTypes = new Set();
  for (const condition of level.hazards ?? EMPTY_LIST) {
    if (!HAZARD_TYPES.includes(condition.type)) fail(`unknown hazard type ${condition.type}`);
    if (hazardTypes.has(condition.type)) fail(`duplicate hazard ${condition.type}`);
    hazardTypes.add(condition.type);
  }

  const ringIds = new Set();
  for (const hoop of level.rings ?? EMPTY_LIST) {
    if (!hoop.id || ringIds.has(hoop.id)) fail('ring IDs must be present and unique per level');
    ringIds.add(hoop.id);
    if (!inRange(hoop.x, -1, 1) || !inRange(hoop.y, 0, 1) || !inRange(hoop.z, 0.05, 0.95)) fail(`ring ${hoop.id} coordinates must be normalized`);
    if (!(hoop.radius > 0)) fail(`ring ${hoop.id} radius must be positive`);
  }
  if (level.objective?.ringsRequired > (level.rings?.length ?? 0)) fail('ringsRequired cannot exceed authored rings');
  if (level.objective?.type === 'reverse-target' && level.target?.number !== level.objective.requiredZone) {
    fail('reverse-target objective must match the numbered target');
  }
  if (level.objective?.type === 'bank-shot' && level.objective.requiredContact !== 'frame') {
    fail('bank-shot must require a frame contact');
  }
  if (level.objective?.type === 'limited-power' && level.objective.maximumPower !== level.shotRules?.maxPower) {
    fail('limited-power objective and shotRules must use the same cap');
  }

  if (level.keeperConfig && !KEEPER_TYPES.has(level.keeperConfig.type)) fail(`unknown keeper type ${level.keeperConfig.type}`);
  return errors;
}

/** Validate IDs and every level payload; returns messages instead of throwing. */
export function validateLevelSet(levels = LEVELS) {
  const errors = [];
  const ids = new Set();
  for (const level of levels) {
    if (ids.has(level?.id)) errors.push(`${level.id}: duplicate level id`);
    ids.add(level?.id);
    errors.push(...validateLevelDefinition(level));
  }
  return errors;
}

// Populate immutable cup metadata after the level list is known.
for (const cup of CUPS) {
  cup.levelIds.push(...LEVELS.filter((level) => level.cup === cup.id).map((level) => level.id));
  Object.freeze(cup.levelIds);
  Object.freeze(cup);
}

function hashSeed(seed) {
  const text = String(seed ?? 'free-kick-legend');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Create a repeatable, dependency-free pseudo-random number generator. */
export function createSeededRng(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveRng(source) {
  if (typeof source === 'function') return source;
  if (source && typeof source === 'object' && typeof source.rng === 'function') return source.rng;
  const seed = source && typeof source === 'object' ? source.seed : source;
  return createSeededRng(seed);
}

function sample(rng) {
  const value = Number(rng());
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(Math.max(value, 0), 0.999999999);
}

// Backward compatible with randomScenario(rng), while also accepting a seed or
// { seed } for deterministic Daily Kick and automated tests.
export function randomScenario(source = Math.random) {
  const rng = resolveRng(source);
  const styles = ['balanced', 'late-dive', 'line-reader', 'aggressive'];
  const distance = 13 + sample(rng) * 10;
  const offsetX = (sample(rng) - 0.5) * 12;
  const wallCount = 2 + Math.floor(sample(rng) * 4);
  const keeper = 0.25 + sample(rng) * 0.45;
  const windX = (sample(rng) - 0.5) * 0.9;
  const style = styles[Math.floor(sample(rng) * styles.length)];

  return {
    id: 'arcade-random',
    cup: 'arcade',
    name: 'Time Attack',
    distance,
    offsetX,
    wall: wallCount,
    keeper,
    objective: objective('score', 'Score before time runs out'),
    wind: wind(Math.abs(windX) < 0.08 ? 0 : windX, 0.04),
    reward: reward(0, 0),
    target: null,
    style
  };
}

/** One fair, shared five-shot challenge per UTC day. */
export function dailyScenario(date) {
  const rng = createSeededRng(`daily-kick:${date}`);
  const base = randomScenario({ rng });
  const targetChoices = [TARGETS.lowLeft, TARGETS.lowRight, TARGETS.topLeft, TARGETS.topRight, TARGETS.topCenter];
  const selectedTarget = targetChoices[Math.floor(sample(rng) * targetChoices.length)];
  const gust = 0.04 + sample(rng) * 0.08;

  return {
    ...base,
    id: `daily-${date}`,
    cup: 'daily',
    name: 'Daily Kick',
    distance: 16 + sample(rng) * 4.5,
    offsetX: (sample(rng) - 0.5) * 7,
    wall: 2 + Math.floor(sample(rng) * 4),
    keeper: 0.32 + sample(rng) * 0.25,
    attempts: 5,
    objective: objective('daily-score', 'Five shots. Chase today\'s high score.', { attempts: 5 }),
    wind: wind((sample(rng) - 0.5) * 0.55, gust),
    target: { ...selectedTarget },
    movingTarget: {
      range: 0.16 + sample(rng) * 0.09,
      speed: 0.8 + sample(rng) * 0.45,
      phase: sample(rng) * Math.PI * 2
    },
    reward: reward(0, 0)
  };
}
