const STATES = Object.freeze({
  idle: 0,
  chant: 1,
  arms: 2,
  jump: 3,
  tifo: 4,
  flags: 5
});

// One atlas cell contains a complete supporters' end. The full-height crop is
// used only by the two immutable architecture plates. Their different authored
// poses prevent the old, immediately visible left/right duplicate while the
// rails, stairwells and roofline never change after construction.
const CROP = Object.freeze({ x: 0, y: 34, width: 768, height: 272 });
const STATIC_PANEL_POSES = Object.freeze([STATES.idle, STATES.chant]);
const PANEL_PHASE_OFFSETS = Object.freeze([0, 1]);

// Animated windows deliberately stop before the two stair/vomitory lanes in
// each authored panel. Those lanes, plus the roof and front rail, remain visible
// from the immutable architecture plate underneath. This makes pose changes a
// change in supporters rather than a whole-stadium texture replacement.
const COHORT_OVERLAY = Object.freeze({ y: 16, height: 222 });
const PANEL_COHORT_WINDOWS = Object.freeze([
  Object.freeze({ x: 0, width: 132 }),
  Object.freeze({ x: 214, width: 324 }),
  Object.freeze({ x: 635, width: 133 })
]);

// Six cohorts (three per half), not two copies of one panorama. The right-hand
// patterns are deliberate complements of their corresponding left-hand
// pattern: matching source columns are never showing the same ambient pose in
// the same tick. All sequences are deterministic for replay/test stability.
const COHORT_AMBIENT_PATTERNS = Object.freeze([
  Object.freeze([0, 0, 1, 0, 1, 1, 0, 1]),
  Object.freeze([1, 0, 0, 1, 1, 0, 1, 0]),
  Object.freeze([0, 1, 0, 0, 1, 0, 1, 1]),
  Object.freeze([1, 1, 0, 1, 0, 0, 1, 0]),
  Object.freeze([0, 1, 1, 0, 0, 1, 0, 1]),
  Object.freeze([1, 0, 1, 1, 0, 1, 0, 0])
]);

const CHEER_FRAMES = Object.freeze([
  STATES.chant,
  STATES.arms,
  STATES.chant,
  STATES.arms,
  STATES.chant,
  STATES.idle
]);
const GOAL_TIFO_FRAMES = Object.freeze([
  STATES.arms,
  STATES.jump,
  STATES.tifo,
  STATES.tifo,
  STATES.tifo,
  STATES.jump,
  STATES.arms,
  STATES.chant,
  STATES.idle
]);
const GOAL_FLAG_FRAMES = Object.freeze([
  STATES.chant,
  STATES.arms,
  STATES.jump,
  STATES.flags,
  STATES.flags,
  STATES.flags,
  STATES.arms,
  STATES.chant,
  STATES.idle
]);
const CHEER_COHORT_DELAYS_MS = Object.freeze([0, 72, 144, 36, 108, 180]);
const GOAL_COHORT_DELAYS_MS = Object.freeze([0, 48, 96, 24, 72, 120]);

export const CROWD_ANIMATION = Object.freeze({
  textureKey: 'crowd-animation-v3',
  assetPath: 'assets/hd/crowd-animation-sheet-v3.png',
  sourceWidth: 1536,
  sourceHeight: 1023,
  frameWidth: 768,
  frameHeight: 341,
  columns: 2,
  rows: 3,
  frameCount: 6,
  states: STATES,
  crop: CROP,
  staticPanelPoses: STATIC_PANEL_POSES,
  panelCount: 2,
  // Retained as public diagnostic metadata for runtime/e2e consumers. Cohort
  // patterns now provide the real phasing, while the halves still begin apart.
  panelPhaseOffsets: PANEL_PHASE_OFFSETS,
  cohortsPerPanel: PANEL_COHORT_WINDOWS.length,
  cohortCount: PANEL_COHORT_WINDOWS.length * 2,
  panelCohortWindows: PANEL_COHORT_WINDOWS,
  cohortOverlay: COHORT_OVERLAY,
  cohortAmbientPatterns: COHORT_AMBIENT_PATTERNS,
  cheerCohortDelaysMs: CHEER_COHORT_DELAYS_MS,
  goalCohortDelaysMs: GOAL_COHORT_DELAYS_MS,
  // Kept for the presentation-duration contract and downstream diagnostics.
  ambientFrames: Object.freeze([STATES.idle, STATES.chant]),
  cheerFrames: CHEER_FRAMES,
  goalFrames: Object.freeze([
    STATES.arms,
    STATES.jump,
    STATES.tifo,
    STATES.flags,
    STATES.flags,
    STATES.tifo,
    STATES.jump,
    STATES.arms,
    STATES.chant,
    STATES.idle
  ]),
  goalTifoFrames: GOAL_TIFO_FRAMES,
  goalFlagFrames: GOAL_FLAG_FRAMES,
  ambientFrameMs: 340,
  ambientTransitionMs: 180,
  cheerFrameMs: 150,
  cheerTransitionMs: 88,
  goalFrameMs: 132,
  goalTransitionMs: 78,
  reducedCheerHoldMs: 620,
  reducedGoalHoldMs: 1080,
  displayWidth: 480,
  panelDisplayWidth: 240,
  // Derived with the same scalar as width. It is metadata for layout only;
  // the renderer never sets width and height independently.
  displayHeight: CROP.height * (480 / (CROP.width * 2)),
  top: 3,
  depth: 1.1
});

function requireFrameIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= CROWD_ANIMATION.frameCount) {
    throw new RangeError(`Crowd pose frame out of range: ${index}`);
  }
}

function requirePanelIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= CROWD_ANIMATION.panelCount) {
    throw new RangeError(`Crowd static panel out of range: ${index}`);
  }
}

function requireCohortIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= CROWD_ANIMATION.cohortCount) {
    throw new RangeError(`Crowd cohort out of range: ${index}`);
  }
}

/** Stable named full-panel pose frame retained for diagnostics and tooling. */
export function crowdPoseFrameName(index) {
  requireFrameIndex(index);
  return `crowd-v3-pose-${index}`;
}

/** Source rectangle for the same full supporter band inside one atlas cell. */
export function crowdPoseSourceRect(index) {
  requireFrameIndex(index);
  const column = index % CROWD_ANIMATION.columns;
  const row = Math.floor(index / CROWD_ANIMATION.columns);
  return Object.freeze({
    x: column * CROWD_ANIMATION.frameWidth + CROP.x,
    y: row * CROWD_ANIMATION.frameHeight + CROP.y,
    width: CROP.width,
    height: CROP.height
  });
}

/** All complete pose frames. They are not swapped by the live controller. */
export function crowdPoseFrames() {
  return Array.from({ length: CROWD_ANIMATION.frameCount }, (_, index) => Object.freeze({
    name: crowdPoseFrameName(index),
    index,
    ...crowdPoseSourceRect(index)
  }));
}

/** Immutable architecture plate for one display half. */
export function crowdStaticFrameName(panelIndex) {
  requirePanelIndex(panelIndex);
  return `crowd-v3-static-panel-${panelIndex}`;
}

export function crowdStaticFrames() {
  return STATIC_PANEL_POSES.map((pose, panelIndex) => Object.freeze({
    name: crowdStaticFrameName(panelIndex),
    panelIndex,
    pose,
    ...crowdPoseSourceRect(pose)
  }));
}

/** Metadata for one independently animated supporter window. */
export function crowdCohortDefinition(cohortIndex) {
  requireCohortIndex(cohortIndex);
  const panelIndex = Math.floor(cohortIndex / CROWD_ANIMATION.cohortsPerPanel);
  const windowIndex = cohortIndex % CROWD_ANIMATION.cohortsPerPanel;
  return Object.freeze({
    index: cohortIndex,
    panelIndex,
    windowIndex,
    ...PANEL_COHORT_WINDOWS[windowIndex],
    ambientPattern: COHORT_AMBIENT_PATTERNS[cohortIndex],
    goalRole: panelIndex === 0 ? 'tifo' : 'flags'
  });
}

export function crowdCohortDefinitions() {
  return Array.from(
    { length: CROWD_ANIMATION.cohortCount },
    (_, index) => crowdCohortDefinition(index)
  );
}

export function crowdCohortFrameName(cohortIndex, pose) {
  requireCohortIndex(cohortIndex);
  requireFrameIndex(pose);
  return `crowd-v3-cohort-${cohortIndex}-pose-${pose}`;
}

export function crowdCohortSourceRect(cohortIndex, pose) {
  const cohort = crowdCohortDefinition(cohortIndex);
  const poseRect = crowdPoseSourceRect(pose);
  return Object.freeze({
    x: poseRect.x + cohort.x,
    y: poseRect.y + COHORT_OVERLAY.y,
    width: cohort.width,
    height: COHORT_OVERLAY.height
  });
}

/** Two buffers per cohort select from this complete named-frame set. */
export function crowdCohortFrames() {
  return crowdCohortDefinitions().flatMap((cohort) => (
    Array.from({ length: CROWD_ANIMATION.frameCount }, (_, pose) => Object.freeze({
      name: crowdCohortFrameName(cohort.index, pose),
      cohortIndex: cohort.index,
      pose,
      ...crowdCohortSourceRect(cohort.index, pose)
    }))
  ));
}

/** The one uniform scalar used by architecture plates and every cohort. */
export function crowdDisplayScale(viewWidth = CROWD_ANIMATION.displayWidth) {
  if (!Number.isFinite(viewWidth) || viewWidth <= 0) {
    throw new TypeError('Crowd display needs a positive view width');
  }
  return viewWidth / (CROP.width * CROWD_ANIMATION.panelCount);
}

/** Deterministic, gap-free placement for the two immutable architecture plates. */
export function crowdPanelLayout(
  viewWidth = CROWD_ANIMATION.displayWidth,
  x = 0
) {
  if (!Number.isFinite(x)) throw new TypeError('Crowd display x must be finite');
  const scale = crowdDisplayScale(viewWidth);
  const panelWidth = CROP.width * scale;
  return Array.from({ length: CROWD_ANIMATION.panelCount }, (_, index) => Object.freeze({
    index,
    x: x + index * panelWidth,
    width: panelWidth,
    height: CROP.height * scale,
    scale
  }));
}

/** Position the six supporter windows exactly over their immutable base plates. */
export function crowdCohortLayout(
  viewWidth = CROWD_ANIMATION.displayWidth,
  x = 0,
  top = CROWD_ANIMATION.top
) {
  if (!Number.isFinite(top)) throw new TypeError('Crowd display top must be finite');
  const panels = crowdPanelLayout(viewWidth, x);
  return crowdCohortDefinitions().map((cohort) => {
    const panel = panels[cohort.panelIndex];
    return Object.freeze({
      ...cohort,
      x: panel.x + cohort.x * panel.scale,
      y: top + COHORT_OVERLAY.y * panel.scale,
      width: cohort.width * panel.scale,
      height: COHORT_OVERLAY.height * panel.scale,
      scale: panel.scale
    });
  });
}

export function crowdAmbientPose(cohortIndex, tick) {
  const { ambientPattern } = crowdCohortDefinition(cohortIndex);
  const normalizedTick = Math.abs(Math.trunc(tick)) % ambientPattern.length;
  return ambientPattern[normalizedTick];
}

export function crowdCheerFramesForCohort(cohortIndex) {
  requireCohortIndex(cohortIndex);
  // Alternating direction keeps adjacent banks from snapping on the same beat.
  return cohortIndex % 2 === 0 ? CHEER_FRAMES : Object.freeze([...CHEER_FRAMES].reverse());
}

export function crowdGoalFramesForCohort(cohortIndex) {
  return crowdCohortDefinition(cohortIndex).goalRole === 'tifo'
    ? GOAL_TIFO_FRAMES
    : GOAL_FLAG_FRAMES;
}
