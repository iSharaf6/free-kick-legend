// Career progression is deliberately data-driven. Existing gameplay only needs
// name/distance/offsetX/wall/keeper; the remaining fields describe objectives,
// rewards and presentation for the richer progression scenes.

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

function objective(type, label, options = {}) {
  return Object.freeze({
    type,
    label,
    goals: options.goals ?? 1,
    attempts: options.attempts ?? Math.max(3, (options.goals ?? 1) + 2),
    curveDirection: options.curveDirection ?? null,
    minimumCurve: Math.min(options.minimumCurve ?? 0, 0.3),
    maximumHeight: options.maximumHeight ?? null,
    minimumHeight: options.minimumHeight ?? null,
    consecutive: options.consecutive ?? false
  });
}

function reward(coins, threeStarBonus = Math.round(coins * 0.5)) {
  return Object.freeze({ coins, threeStarBonus });
}

function makeLevel(definition) {
  return Object.freeze({
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
    objective: objective('dip', 'Clear the wall and dip under the bar', { minimumHeight: 2.05 }), target: TARGETS.topCenter,
    reward: reward(85), style: 'line-reader'
  }),
  makeLevel({
    id: 'curve-06', cup: 'curve', name: 'Under the Jump', distance: 16, offsetX: 1, wall: 4, keeper: 0.38,
    objective: objective('low-shot', 'Sneak a low shot beneath the wall', { maximumHeight: 1.05 }), target: TARGETS.lowCenter,
    reward: reward(90), style: 'aggressive'
  }),
  makeLevel({
    id: 'curve-07', cup: 'curve', name: 'Changing Breeze', distance: 18, offsetX: -2, wall: 4, keeper: 0.4,
    objective: objective('curve', 'Use the breeze to shape the finish', { curveDirection: 'right', minimumCurve: 0.22 }), wind: wind(0.35, 0.08),
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
    objective: objective('target', 'Drive through the high centre window'), target: TARGETS.topCenter, reward: reward(110), style: 'anticipator'
  }),
  makeLevel({
    id: 'targets-06', cup: 'targets', name: 'Dead Centre', distance: 20, offsetX: 0, wall: 5, keeper: 0.48,
    objective: objective('target', 'Thread the centre target'), target: TARGETS.center, wind: wind(-0.3, 0.04),
    reward: reward(115), style: 'aggressive'
  }),
  makeLevel({
    id: 'targets-07', cup: 'targets', name: 'Call Your Corner', distance: 19, offsetX: 4.5, wall: 4, keeper: 0.5,
    objective: objective('target', 'Hit the far top corner'), target: TARGETS.topLeft, wind: wind(0.25, 0.05),
    reward: reward(120), style: 'anticipator'
  }),
  makeLevel({
    id: 'targets-08', cup: 'targets', name: 'Bullseye Final', distance: 20, offsetX: -3, wall: 5, keeper: 0.52,
    objective: objective('target-streak', 'Hit two targets in a row', { goals: 2, consecutive: true }), target: TARGETS.topRight,
    reward: reward(150, 90), style: 'anticipator'
  }),
  makeLevel({
    id: 'targets-09', cup: 'targets', name: 'Grass Cutter', distance: 18.5, offsetX: 1.5, wall: 4, keeper: 0.48,
    objective: objective('target', 'Drive through the low centre target'), target: TARGETS.lowCenter, reward: reward(130), style: 'aggressive'
  }),
  makeLevel({
    id: 'targets-10', cup: 'targets', name: 'Double Bullseye', distance: 20, offsetX: -2, wall: 4, keeper: 0.54,
    objective: objective('target-streak', 'Hit the high target twice', { goals: 2 }), target: TARGETS.topCenter,
    reward: reward(175, 105), style: 'anticipator'
  }),

  // ---------------------------------------------------------------- pressure
  makeLevel({
    id: 'pressure-01', cup: 'pressure', name: 'The Long Shot', distance: 22, offsetX: 0, wall: 4, keeper: 0.48,
    objective: objective('score', 'Score from long range'), wind: wind(0.2, 0.05), reward: reward(120), style: 'balanced'
  }),
  makeLevel({
    id: 'pressure-02', cup: 'pressure', name: 'Wide Left', distance: 18, offsetX: -5.5, wall: 4, keeper: 0.5,
    objective: objective('curve', 'Recover the angle with curl', { curveDirection: 'right', minimumCurve: 0.3 }), reward: reward(125), style: 'line-reader'
  }),
  makeLevel({
    id: 'pressure-03', cup: 'pressure', name: 'Wide Right', distance: 18, offsetX: 5.5, wall: 4, keeper: 0.52,
    objective: objective('curve', 'Recover the angle with curl', { curveDirection: 'left', minimumCurve: 0.3 }), reward: reward(125), style: 'line-reader'
  }),
  makeLevel({
    id: 'pressure-04', cup: 'pressure', name: 'Into the Wind', distance: 21, offsetX: 0, wall: 5, keeper: 0.52,
    objective: objective('power', 'Beat the headwind with a driven strike'), wind: wind(0, 0.18, -3.2, 'Strong headwind'), reward: reward(130), style: 'aggressive'
  }),
  makeLevel({
    id: 'pressure-05', cup: 'pressure', name: 'Left Crosswind', distance: 20, offsetX: 2, wall: 5, keeper: 0.54,
    objective: objective('wind-target', 'Counter the left crosswind'), target: TARGETS.topRight, wind: wind(-0.65, 0.12),
    reward: reward(135), style: 'anticipator'
  }),
  makeLevel({
    id: 'pressure-06', cup: 'pressure', name: 'Right Crosswind', distance: 20, offsetX: -2, wall: 5, keeper: 0.56,
    objective: objective('wind-target', 'Counter the right crosswind'), target: TARGETS.topLeft, wind: wind(0.65, 0.12),
    reward: reward(135), style: 'anticipator'
  }),
  makeLevel({
    id: 'pressure-07', cup: 'pressure', name: 'Fortress', distance: 18, offsetX: 0, wall: 6, keeper: 0.58,
    objective: objective('score', 'Break the six-player fortress'), reward: reward(145), style: 'aggressive'
  }),
  makeLevel({
    id: 'pressure-08', cup: 'pressure', name: 'Pressure Final', distance: 21, offsetX: 3.5, wall: 5, keeper: 0.62,
    objective: objective('streak', 'Score two goals without missing', { goals: 2, consecutive: true }), wind: wind(-0.35, 0.1),
    reward: reward(180, 110), style: 'anticipator'
  }),
  makeLevel({
    id: 'pressure-09', cup: 'pressure', name: 'Last Minute', distance: 23, offsetX: -2.5, wall: 5, keeper: 0.58,
    objective: objective('power', 'Score with a driven strike'), wind: wind(0.25, 0.05), reward: reward(155), style: 'aggressive'
  }),
  makeLevel({
    id: 'pressure-10', cup: 'pressure', name: 'Hold Your Nerve', distance: 21.5, offsetX: 3, wall: 5, keeper: 0.64,
    objective: objective('goals', 'Score twice under pressure', { goals: 2 }), wind: wind(-0.3, 0.08),
    reward: reward(205, 125), style: 'anticipator'
  }),

  // ------------------------------------------------------------------ legend
  makeLevel({
    id: 'legend-01', cup: 'legend', name: 'The Specialist', distance: 20, offsetX: -4, wall: 5, keeper: 0.62,
    objective: objective('curve-target', 'Curl into the far top corner', { curveDirection: 'right', minimumCurve: 0.34 }), target: TARGETS.topRight,
    reward: reward(155), style: 'legend'
  }),
  makeLevel({
    id: 'legend-02', cup: 'legend', name: 'Cat-Like Reflex', distance: 18, offsetX: 2, wall: 4, keeper: 0.66,
    objective: objective('target', 'Beat the reflex keeper low'), target: TARGETS.lowLeft, reward: reward(160), style: 'legend'
  }),
  makeLevel({
    id: 'legend-03', cup: 'legend', name: 'Storm Angle', distance: 20, offsetX: 6, wall: 5, keeper: 0.66,
    objective: objective('wind-target', 'Master the storm from a tight angle'), target: TARGETS.topLeft, wind: wind(0.8, 0.2),
    reward: reward(170), style: 'legend'
  }),
  makeLevel({
    id: 'legend-04', cup: 'legend', name: 'Top Bins Only', distance: 21, offsetX: 0, wall: 5, keeper: 0.7,
    objective: objective('target', 'Pick out the top-right postage stamp'), target: TARGETS.topRight,
    reward: reward(175), style: 'legend'
  }),
  makeLevel({
    id: 'legend-05', cup: 'legend', name: 'The Great Wall', distance: 17, offsetX: -1, wall: 6, keeper: 0.7,
    objective: objective('low-shot', 'Find a route beneath the great wall', { maximumHeight: 1.0 }), target: TARGETS.lowRight,
    reward: reward(180), style: 'legend'
  }),
  makeLevel({
    id: 'legend-06', cup: 'legend', name: 'World Class', distance: 22, offsetX: 4, wall: 5, keeper: 0.74,
    objective: objective('goals', 'Score twice against a world-class keeper', { goals: 2 }), wind: wind(-0.4, 0.1),
    reward: reward(190), style: 'legend'
  }),
  makeLevel({
    id: 'legend-07', cup: 'legend', name: 'Legend Trial', distance: 23, offsetX: -5, wall: 6, keeper: 0.77,
    objective: objective('curve-streak', 'Score two curved goals in a row', { goals: 2, consecutive: true, minimumCurve: 0.35 }), wind: wind(0.45, 0.14),
    reward: reward(210), style: 'legend'
  }),
  makeLevel({
    id: 'legend-08', cup: 'legend', name: 'Final Boss', distance: 21, offsetX: 0, wall: 6, keeper: 0.8,
    objective: objective('final', 'Score three different finishes', { goals: 3 }), wind: wind(-0.25, 0.16),
    reward: reward(300, 200), style: 'boss'
  }),
  makeLevel({
    id: 'legend-09', cup: 'legend', name: 'No Easy Side', distance: 22, offsetX: 4.5, wall: 6, keeper: 0.76,
    objective: objective('score', 'Find a way past the legend keeper', { attempts: 4 }), wind: wind(0.35, 0.12),
    reward: reward(230, 140), style: 'legend'
  }),
  makeLevel({
    id: 'legend-10', cup: 'legend', name: 'Immortal', distance: 22, offsetX: 0, wall: 6, keeper: 0.78,
    objective: objective('final', 'Score three different finishes', { goals: 3, attempts: 5 }), wind: wind(-0.2, 0.1),
    reward: reward(360, 240), style: 'boss'
  })
];

export const LEVELS = Object.freeze(RAW_LEVELS);

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
