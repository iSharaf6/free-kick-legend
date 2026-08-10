import {
  CROWD_ANIMATION,
  crowdAmbientPose,
  crowdCheerFramesForCohort,
  crowdCohortFrameName,
  crowdCohortFrames,
  crowdCohortLayout,
  crowdGoalFramesForCohort,
  crowdPanelLayout,
  crowdPoseFrames,
  crowdStaticFrameName,
  crowdStaticFrames
} from '../data/crowdAnimation.js';
import { addStandDressing } from './StandDressing.js';

// Stadium architecture and supporter motion are separate layers. Two distinct
// full-panel plates remain unchanged for the scene's lifetime; six smaller
// supporter cohorts crossfade above them. The cohort windows stop at the atlas'
// stair/vomitory lanes and short of its roof/front rail, so those hard lines can
// never pop between generated poses.

/** Add every named runtime crop to the generated 2x3 atlas. */
export function registerCrowdAnimationFrames(scene) {
  const texture = scene.textures.get(CROWD_ANIMATION.textureKey);
  if (!texture || texture.key === '__MISSING') return false;

  const frames = [
    ...crowdPoseFrames(),
    ...crowdStaticFrames(),
    ...crowdCohortFrames()
  ];
  for (const frame of frames) {
    if (!texture.has(frame.name)) {
      texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
    }
  }
  return frames.every((frame) => texture.has(frame.name));
}

// Compatibility alias retained for scenes/tests from the retired slice stand.
export const registerCrowdSliceFrames = registerCrowdAnimationFrames;

function timerNow(scene) {
  return Number.isFinite(scene.time?.now) ? scene.time.now : 0;
}

// The sole construction scale site. Width and height are never assigned
// independently, preserving every generated pixel's authored aspect ratio.
function addScaledCrowdImage(scene, x, y, frame, scale, depth, alpha = 1) {
  return scene.add
    .image(x, y, CROWD_ANIMATION.textureKey, frame)
    .setOrigin(0, 0)
    .setScale(scale)
    .setAlpha(alpha)
    .setDepth(depth);
}

class CrowdStand {
  constructor(scene, baseSprites, cohorts, dressing, {
    reducedMotion = false,
    phaseOffset = 0
  } = {}) {
    this.scene = scene;
    this.baseSprites = baseSprites.filter(Boolean);
    this.cohorts = cohorts.filter(Boolean);
    this.sprites = this.cohorts.flatMap((cohort) => cohort.layers).filter(Boolean);
    this.sprite = this.baseSprites[0] || this.sprites[0] || null;
    // Existing scene code keeps this compatibility collection as `nearCrowd`.
    // It now points at one active handle per independent supporter cohort.
    this.tiles = this.cohorts.map((cohort) => cohort.layers[cohort.activeLayer]);
    this.dressing = dressing;
    this.reducedMotion = Boolean(reducedMotion);
    const cycle = CROWD_ANIMATION.cohortAmbientPatterns[0].length;
    this.phase = Math.abs(Math.trunc(phaseOffset)) % cycle;
    this.sequenceUntil = 0;
    this.goalUntil = 0;
    this.timer = null;
    this.scheduled = [];
    this.destroyed = false;
    this.currentPose = CROWD_ANIMATION.states.idle;
    this.currentPoses = this.cohorts.map(() => null);
    this.setPose(CROWD_ANIMATION.states.idle, { instant: true, force: true });
  }

  isRenderable() {
    return Boolean(!this.destroyed && this.cohorts.some((cohort) => (
      cohort.layers.some((sprite) => sprite?.active !== false)
    )));
  }

  killCohortTransitions() {
    this.cohorts.forEach((cohort) => {
      this.scene.tweens?.killTweensOf?.(cohort.layers);
    });
    return this;
  }

  /**
   * Crossfade one supporter region using a two-sprite buffer.
   *
   * The persistent architecture plate is never touched here. A transition can
   * therefore reveal that same plate between poses rather than replacing a
   * stairwell, tunnel or fascia on a single animation tick.
   */
  setCohortPose(cohortIndex, frame, {
    instant = false,
    force = false,
    transitionMs = CROWD_ANIMATION.ambientTransitionMs
  } = {}) {
    const cohort = this.cohorts[cohortIndex];
    if (!cohort || this.destroyed) return this;
    if (!force && this.currentPoses[cohortIndex] === frame) return this;

    this.scene.tweens?.killTweensOf?.(cohort.layers);
    const current = cohort.layers[cohort.activeLayer];
    const nextIndex = 1 - cohort.activeLayer;
    const next = cohort.layers[nextIndex];
    next.setFrame(crowdCohortFrameName(cohortIndex, frame));

    const shouldCut = instant
      || this.reducedMotion
      || !(transitionMs > 0)
      || typeof this.scene.tweens?.add !== 'function';
    if (shouldCut) {
      current.setAlpha(0);
      next.setAlpha(1);
    } else {
      current.setAlpha(1);
      next.setAlpha(0);
      this.scene.tweens.add({
        targets: current,
        alpha: 0,
        duration: transitionMs,
        ease: 'Sine.easeInOut'
      });
      this.scene.tweens.add({
        targets: next,
        alpha: 1,
        duration: transitionMs,
        ease: 'Sine.easeInOut'
      });
    }

    cohort.activeLayer = nextIndex;
    this.tiles[cohortIndex] = next;
    this.currentPoses[cohortIndex] = frame;
    if (cohortIndex === 0) this.currentPose = frame;
    return this;
  }

  // Compatibility method: a "panel" now means the three cohorts on that half.
  setPanelPose(panelIndex, frame, options) {
    const first = panelIndex * CROWD_ANIMATION.cohortsPerPanel;
    for (let offset = 0; offset < CROWD_ANIMATION.cohortsPerPanel; offset++) {
      this.setCohortPose(first + offset, frame, options);
    }
    return this;
  }

  setPose(frame, options) {
    this.cohorts.forEach((_, cohortIndex) => {
      this.setCohortPose(cohortIndex, frame, options);
    });
    this.currentPose = frame;
    return this;
  }

  startAmbient() {
    if (this.destroyed || this.reducedMotion || this.timer || !this.isRenderable()) return this;
    // Establish the six different deterministic poses immediately; the first
    // live interval should never expose two repeated half-panels.
    this.applyAmbient({ instant: true });
    this.timer = this.scene.time.addEvent({
      delay: CROWD_ANIMATION.ambientFrameMs,
      loop: true,
      callback: () => {
        if (timerNow(this.scene) < this.sequenceUntil) return;
        const cycle = CROWD_ANIMATION.cohortAmbientPatterns[0].length;
        this.phase = (this.phase + 1) % cycle;
        this.applyAmbient();
      }
    });
    return this;
  }

  /** Independently phase each of the six deterministic supporter regions. */
  applyAmbient(options = {}) {
    if (this.reducedMotion) {
      return this.setPose(CROWD_ANIMATION.states.idle, { instant: true });
    }
    this.cohorts.forEach((_, cohortIndex) => {
      this.setCohortPose(
        cohortIndex,
        crowdAmbientPose(cohortIndex, this.phase),
        { transitionMs: CROWD_ANIMATION.ambientTransitionMs, ...options }
      );
    });
    return this;
  }

  cancelSequence() {
    this.scheduled.forEach((timer) => timer?.remove?.(false));
    this.scheduled.length = 0;
    this.sequenceUntil = 0;
    this.goalUntil = 0;
    this.killCohortTransitions();
    return this;
  }

  scheduleFrame(after, delay, callback) {
    const timer = after(delay, () => {
      if (!this.destroyed) callback();
    });
    if (timer) this.scheduled.push(timer);
    return timer;
  }

  runCohortSequences(sequenceFor, frameMs, transitionMs, schedule, delays) {
    if (!this.isRenderable()) return this;
    this.cancelSequence();

    const after = schedule
      || ((delay, callback) => this.scene.time.delayedCall(delay, callback));
    const sequences = this.cohorts.map((_, index) => sequenceFor(index));
    const cohortDelays = this.cohorts.map((_, index) => Math.max(0, delays[index] || 0));
    const duration = Math.max(...sequences.map((frames, index) => (
      frames.length * frameMs + cohortDelays[index]
    )));
    this.sequenceUntil = timerNow(this.scene) + duration;
    this.goalUntil = this.sequenceUntil;

    sequences.forEach((frames, cohortIndex) => {
      frames.forEach((frame, frameIndex) => {
        const delay = cohortDelays[cohortIndex] + frameIndex * frameMs;
        const show = () => this.setCohortPose(cohortIndex, frame, { transitionMs });
        if (delay === 0) show();
        else this.scheduleFrame(after, delay, show);
      });
    });
    this.scheduleFrame(after, duration, () => {
      this.sequenceUntil = 0;
      this.goalUntil = 0;
      this.phase = 0;
      this.applyAmbient();
    });
    return this;
  }

  runReducedPoses(poses, holdMs, schedule = null) {
    if (!this.isRenderable()) return this;
    this.cancelSequence();
    const after = schedule
      || ((delay, callback) => this.scene.time.delayedCall(delay, callback));
    this.sequenceUntil = timerNow(this.scene) + holdMs;
    this.goalUntil = this.sequenceUntil;
    this.cohorts.forEach((_, cohortIndex) => {
      this.setCohortPose(cohortIndex, poses[cohortIndex % poses.length], { instant: true });
    });
    this.scheduleFrame(after, holdMs, () => {
      this.sequenceUntil = 0;
      this.goalUntil = 0;
      this.setPose(CROWD_ANIMATION.states.idle, { instant: true });
    });
    return this;
  }

  /** A short save/near-miss response with adjacent cohorts on different beats. */
  playCheer(schedule = null) {
    if (this.reducedMotion) {
      return this.runReducedPoses(
        [CROWD_ANIMATION.states.arms, CROWD_ANIMATION.states.chant],
        CROWD_ANIMATION.reducedCheerHoldMs,
        schedule
      );
    }
    return this.runCohortSequences(
      crowdCheerFramesForCohort,
      CROWD_ANIMATION.cheerFrameMs,
      CROWD_ANIMATION.cheerTransitionMs,
      schedule,
      CROWD_ANIMATION.cheerCohortDelaysMs
    );
  }

  cheer(schedule = null) {
    return this.playCheer(schedule);
  }

  /** Goal surge: left cohorts unfurl the tifo while right cohorts raise flags. */
  playGoal(schedule = null) {
    this.dressing?.celebrate?.();
    if (this.reducedMotion) {
      return this.runReducedPoses(
        [
          CROWD_ANIMATION.states.tifo,
          CROWD_ANIMATION.states.tifo,
          CROWD_ANIMATION.states.tifo,
          CROWD_ANIMATION.states.flags,
          CROWD_ANIMATION.states.flags,
          CROWD_ANIMATION.states.flags
        ],
        CROWD_ANIMATION.reducedGoalHoldMs,
        schedule
      );
    }
    return this.runCohortSequences(
      crowdGoalFramesForCohort,
      CROWD_ANIMATION.goalFrameMs,
      CROWD_ANIMATION.goalTransitionMs,
      schedule,
      CROWD_ANIMATION.goalCohortDelaysMs
    );
  }

  reset() {
    this.cancelSequence();
    this.phase = 0;
    return this.setPose(CROWD_ANIMATION.states.idle, { instant: true });
  }

  setReducedMotion(reduced) {
    const next = Boolean(reduced);
    if (next === this.reducedMotion) return this;
    this.reducedMotion = next;
    this.cancelSequence();
    this.dressing?.setReducedMotion?.(next);

    if (next) {
      this.timer?.remove?.(false);
      this.timer = null;
      return this.reset();
    }
    return this.reset().startAmbient();
  }

  destroy() {
    if (this.destroyed) return;
    this.timer?.remove?.(false);
    this.timer = null;
    this.cancelSequence();
    this.destroyed = true;
    this.dressing?.destroy?.();
    this.dressing = null;
    this.baseSprites.forEach((sprite) => sprite?.destroy?.());
    this.sprites.forEach((sprite) => sprite?.destroy?.());
    this.baseSprites = [];
    this.cohorts = [];
    this.sprites = [];
    this.sprite = null;
    this.tiles = [];
  }
}

/** Build two static architecture plates and six independent supporter cohorts. */
export function addCrowdStand(scene, {
  viewWidth = CROWD_ANIMATION.displayWidth,
  x = 0,
  top = CROWD_ANIMATION.top,
  reducedMotion = false,
  phaseOffset = 0,
  depthOffset = 0,
  dressed = true,
  autoStart = true
} = {}) {
  const baseSprites = [];
  const cohorts = [];

  if (registerCrowdAnimationFrames(scene)) {
    for (const panel of crowdPanelLayout(viewWidth, x)) {
      const sprite = addScaledCrowdImage(
        scene,
        panel.x,
        top,
        crowdStaticFrameName(panel.index),
        panel.scale,
        CROWD_ANIMATION.depth - 0.002 + depthOffset
      );
      sprite.fklBaselineY = top;
      sprite.fklPanelIndex = panel.index;
      sprite.fklLayerRole = 'static-architecture';
      baseSprites.push(sprite);
    }

    for (const layout of crowdCohortLayout(viewWidth, x, top)) {
      const layers = [0, 1].map((bufferIndex) => {
        const sprite = addScaledCrowdImage(
          scene,
          layout.x,
          layout.y,
          crowdCohortFrameName(layout.index, CROWD_ANIMATION.states.idle),
          layout.scale,
          CROWD_ANIMATION.depth + bufferIndex * 0.0005 + depthOffset,
          bufferIndex === 0 ? 1 : 0
        );
        sprite.fklBaselineY = layout.y;
        sprite.fklCohortIndex = layout.index;
        sprite.fklLayerRole = 'supporter-cohort';
        return sprite;
      });
      cohorts.push({
        index: layout.index,
        panelIndex: layout.panelIndex,
        goalRole: layout.goalRole,
        layers,
        activeLayer: 0
      });
    }
  }

  const dressing = dressed
    ? addStandDressing(scene, { viewWidth, reducedMotion, depthOffset })
    : null;

  const controller = new CrowdStand(scene, baseSprites, cohorts, dressing, {
    reducedMotion,
    phaseOffset
  });
  if (autoStart) controller.startAmbient();
  return controller;
}

/** Menu variant, rebased so the static stadium plate starts at `depth`. */
export function addMenuCrowd(scene, {
  depth = 2,
  viewWidth = CROWD_ANIMATION.displayWidth,
  top = CROWD_ANIMATION.top,
  reducedMotion = false,
  dressed = true
} = {}) {
  return addCrowdStand(scene, {
    viewWidth,
    top,
    reducedMotion,
    dressed,
    depthOffset: depth - CROWD_ANIMATION.depth
  });
}
