import {
  CROWD_ANIMATION,
  crowdDisplayScale,
  crowdFrameName,
  crowdFrames,
  crowdGoalSequence,
  crowdPanelLayout,
  crowdSource,
  crowdWatchingFrame
} from '../data/crowdAnimation.js';
import { ensureCrowdPaletteTextures } from './CrowdPalette.js';

export function registerCrowdAnimationFrames(scene) {
  let complete = true;
  for (const kind of ['watch', 'goal']) {
    const source = crowdSource(kind);
    const texture = scene.textures.get(source.activeTextureKey);
    if (!texture || texture.key === '__MISSING') {
      complete = false;
      continue;
    }
    for (const frame of crowdFrames(kind)) {
      if (!texture.has(frame.name)) {
        texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
      }
    }
    complete &&= crowdFrames(kind).every((frame) => texture.has(frame.name));
  }
  return complete;
}

// Compatibility alias retained for diagnostics that used the old slice stand.
export const registerCrowdSliceFrames = registerCrowdAnimationFrames;

function now(scene) {
  return Number.isFinite(scene.time?.now) ? scene.time.now : 0;
}

class CrowdStand {
  constructor(scene, panels, {
    viewWidth,
    reducedMotion = false,
    phaseOffset = 0
  }) {
    this.scene = scene;
    this.panels = panels;
    this.viewWidth = viewWidth;
    this.reducedMotion = Boolean(reducedMotion);
    this.phase = Math.abs(Math.trunc(phaseOffset)) % CROWD_ANIMATION.frameCount;
    this.timer = null;
    this.scheduled = [];
    this.sequenceUntil = 0;
    this.goalUntil = 0;
    this.destroyed = false;
    this.currentKind = 'watch';
    this.currentFrames = panels.map(() => 0);
    this.tiles = panels.map((panel) => panel.layers[panel.activeLayer]);
    this.sprites = panels.flatMap((panel) => panel.layers);
    this.sprite = this.tiles[0] || null;
    this.applyWatching({ instant: true, force: true });
  }

  isRenderable() {
    return !this.destroyed && this.panels.some((panel) => panel.layers.some((sprite) => sprite?.active !== false));
  }

  setPanelFrame(panelIndex, kind, frame, {
    instant = false,
    force = false,
    transitionMs = CROWD_ANIMATION.watchingTransitionMs
  } = {}) {
    const panel = this.panels[panelIndex];
    if (!panel || this.destroyed) return this;
    if (!force && this.currentKind === kind && this.currentFrames[panelIndex] === frame) return this;

    this.scene.tweens?.killTweensOf?.(panel.layers);
    const current = panel.layers[panel.activeLayer];
    const nextIndex = 1 - panel.activeLayer;
    const next = panel.layers[nextIndex];
    next.setTexture(crowdSource(kind).activeTextureKey, crowdFrameName(kind, frame));
    next.setScale(crowdDisplayScale(kind, this.viewWidth));

    const cut = instant || this.reducedMotion || !(transitionMs > 0) || !this.scene.tweens?.add;
    if (cut) {
      current.setAlpha(0);
      next.setAlpha(1);
    } else {
      current.setAlpha(1);
      next.setAlpha(0);
      this.scene.tweens.add({ targets: current, alpha: 0, duration: transitionMs, ease: 'Sine.easeInOut' });
      this.scene.tweens.add({ targets: next, alpha: 1, duration: transitionMs, ease: 'Sine.easeInOut' });
    }
    panel.activeLayer = nextIndex;
    this.tiles[panelIndex] = next;
    this.currentFrames[panelIndex] = frame;
    this.currentKind = kind;
    return this;
  }

  applyWatching(options = {}) {
    this.panels.forEach((_, panelIndex) => {
      this.setPanelFrame(panelIndex, 'watch', crowdWatchingFrame(panelIndex, this.phase), options);
    });
    this.currentKind = 'watch';
    return this;
  }

  startAmbient() {
    if (this.destroyed || this.reducedMotion || this.timer || !this.isRenderable()) return this;
    this.timer = this.scene.time.addEvent({
      delay: CROWD_ANIMATION.watchingFrameMs,
      loop: true,
      callback: () => {
        if (now(this.scene) < this.sequenceUntil) return;
        this.phase = (this.phase + 1) % CROWD_ANIMATION.frameCount;
        this.applyWatching();
      }
    });
    return this;
  }

  cancelSequence() {
    this.scheduled.forEach((timer) => timer?.remove?.(false));
    this.scheduled.length = 0;
    this.sequenceUntil = 0;
    this.goalUntil = 0;
    return this;
  }

  schedule(delay, callback, schedule = null) {
    const timer = schedule
      ? schedule(delay, callback)
      : this.scene.time.delayedCall(delay, callback);
    if (timer) this.scheduled.push(timer);
    return timer;
  }

  playGoal(schedule = null) {
    if (!this.isRenderable()) return this;
    this.cancelSequence();
    if (this.reducedMotion) {
      this.panels.forEach((_, panelIndex) => this.setPanelFrame(panelIndex, 'goal', 5, { instant: true }));
      this.sequenceUntil = now(this.scene) + CROWD_ANIMATION.reducedGoalHoldMs;
      this.goalUntil = this.sequenceUntil;
      this.schedule(CROWD_ANIMATION.reducedGoalHoldMs, () => {
        this.sequenceUntil = 0;
        this.goalUntil = 0;
        this.applyWatching({ instant: true });
      }, schedule);
      return this;
    }

    const frames = crowdGoalSequence();
    const panelDelay = 34;
    const duration = frames.length * CROWD_ANIMATION.goalFrameMs + panelDelay;
    this.sequenceUntil = now(this.scene) + duration;
    this.goalUntil = this.sequenceUntil;
    frames.forEach((frame, frameIndex) => {
      this.panels.forEach((_, panelIndex) => {
        const delay = frameIndex * CROWD_ANIMATION.goalFrameMs + panelIndex * panelDelay;
        const show = () => this.setPanelFrame(panelIndex, 'goal', frame, {
          transitionMs: CROWD_ANIMATION.goalTransitionMs
        });
        if (delay === 0) show();
        else this.schedule(delay, show, schedule);
      });
    });
    this.schedule(duration, () => {
      this.sequenceUntil = 0;
      this.goalUntil = 0;
      this.phase = 0;
      this.applyWatching();
    }, schedule);
    return this;
  }

  playCheer(schedule = null) {
    if (!this.isRenderable()) return this;
    this.cancelSequence();
    const frames = this.reducedMotion ? [4] : [2, 3, 4, 9];
    const duration = this.reducedMotion
      ? CROWD_ANIMATION.reducedCheerHoldMs
      : frames.length * CROWD_ANIMATION.cheerFrameMs;
    this.sequenceUntil = now(this.scene) + duration;
    frames.forEach((frame, index) => {
      const show = () => this.panels.forEach((_, panelIndex) => this.setPanelFrame(
        panelIndex,
        'watch',
        (frame + CROWD_ANIMATION.panelPhaseOffsets[panelIndex]) % CROWD_ANIMATION.frameCount,
        { instant: this.reducedMotion, transitionMs: CROWD_ANIMATION.cheerTransitionMs }
      ));
      if (index === 0) show();
      else this.schedule(index * CROWD_ANIMATION.cheerFrameMs, show, schedule);
    });
    this.schedule(duration, () => {
      this.sequenceUntil = 0;
      this.applyWatching({ instant: this.reducedMotion });
    }, schedule);
    return this;
  }

  cheer(schedule = null) {
    return this.playCheer(schedule);
  }

  reset() {
    this.cancelSequence();
    this.phase = 0;
    return this.applyWatching({ instant: true, force: true });
  }

  setReducedMotion(reduced) {
    const next = Boolean(reduced);
    if (next === this.reducedMotion) return this;
    this.reducedMotion = next;
    this.cancelSequence();
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
    this.sprites.forEach((sprite) => sprite?.destroy?.());
    this.panels = [];
    this.tiles = [];
    this.sprites = [];
    this.sprite = null;
  }
}

export function addCrowdStand(scene, {
  viewWidth = CROWD_ANIMATION.displayWidth,
  x = 0,
  top = CROWD_ANIMATION.top,
  reducedMotion = false,
  phaseOffset = 0,
  depthOffset = 0,
  autoStart = true,
  kitId = 'kit-home',
  palette = null
} = {}) {
  ensureCrowdPaletteTextures(scene, kitId, palette);
  const panels = [];
  if (registerCrowdAnimationFrames(scene)) {
    for (const layout of crowdPanelLayout('watch', viewWidth, x)) {
      const layers = [0, 1].map((bufferIndex) => scene.add
        .image(layout.x, top, crowdSource('watch').activeTextureKey, crowdFrameName('watch', 0))
        .setOrigin(0, 0)
        .setScale(layout.scale)
        .setAlpha(bufferIndex === 0 ? 1 : 0)
        .setDepth(CROWD_ANIMATION.depth + bufferIndex * 0.0005 + depthOffset));
      layers.forEach((sprite) => {
        sprite.fklPanelIndex = layout.index;
        sprite.fklBaselineY = top;
      });
      panels.push({ index: layout.index, layers, activeLayer: 0 });
    }
  }
  const controller = new CrowdStand(scene, panels, { viewWidth, reducedMotion, phaseOffset });
  if (autoStart) controller.startAmbient();
  return controller;
}

export function addMenuCrowd(scene, {
  depth = 2,
  viewWidth = CROWD_ANIMATION.displayWidth,
  top = CROWD_ANIMATION.top,
  reducedMotion = false,
  kitId = 'kit-home',
  palette = null
} = {}) {
  return addCrowdStand(scene, {
    viewWidth,
    top,
    reducedMotion,
    kitId,
    palette,
    depthOffset: depth - CROWD_ANIMATION.depth
  });
}
