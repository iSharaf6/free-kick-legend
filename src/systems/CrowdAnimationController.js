import { CROWD_ANIMATION, crowdClip } from '../data/crowdAnimation.js';

/** Register every resident crowd clip without assuming all match assets exist. */
export function registerCrowdAnimations(scene) {
  for (const clip of Object.values(CROWD_ANIMATION.states)) {
    if (!scene.textures?.exists?.(clip.textureKey) || scene.anims.exists(clip.animationKey)) continue;
    scene.anims.create({
      key: clip.animationKey,
      frames: scene.anims.generateFrameNumbers(clip.textureKey, { frames: clip.frames }),
      frameRate: clip.frameRate,
      repeat: clip.repeat
    });
  }
}

export class CrowdAnimationController {
  constructor(scene, sprite, dressing, { reducedMotion = false } = {}) {
    this.scene = scene;
    this.sprite = sprite;
    // Kept as a collection for callers that previously inspected crowd tiles.
    // It now contains one authored, non-repeating panoramic plate.
    this.tiles = sprite ? [sprite] : [];
    this.dressing = dressing;
    this.reducedMotion = Boolean(reducedMotion);
    this.currentState = 'moving';
    this.reactionTimer = null;
    this.reactionUntil = 0;
  }

  cancelReaction() {
    this.reactionTimer?.remove?.(false);
    this.reactionTimer = null;
    this.reactionUntil = 0;
  }

  startAmbient() {
    if (!this.sprite?.active) return this;
    this.cancelReaction();
    registerCrowdAnimations(this.scene);
    const moving = crowdClip('moving');
    this.currentState = 'moving';
    this.sprite.anims?.stop?.();
    this.sprite.setTexture(moving.textureKey, 0);
    if (!this.reducedMotion && this.scene.anims.exists(moving.animationKey)) {
      this.sprite.play(moving.animationKey);
    }
    return this;
  }

  playReaction(state, schedule = null) {
    if (!this.sprite?.active) return this;
    const clip = crowdClip(state);
    if (!this.scene.textures?.exists?.(clip.textureKey)) return this.startAmbient();

    this.cancelReaction();
    registerCrowdAnimations(this.scene);
    this.currentState = state;
    this.sprite.anims?.stop?.();
    this.sprite.setTexture(clip.textureKey, this.reducedMotion ? clip.reactionFrame : 0);
    if (!this.reducedMotion && this.scene.anims.exists(clip.animationKey)) {
      this.sprite.play(clip.animationKey);
    }

    const duration = this.reducedMotion
      ? 650
      : Math.ceil((clip.frames.length / clip.frameRate) * 1000);
    this.reactionUntil = (this.scene.time?.now ?? 0) + duration;
    const after = schedule || ((delay, callback) => this.scene.time.delayedCall(delay, callback));
    this.reactionTimer = after(duration, () => {
      this.reactionTimer = null;
      this.startAmbient();
    });
    return this;
  }

  playGoal(schedule = null) {
    this.playReaction('goal', schedule);
    this.dressing?.celebrate?.();
    return this;
  }

  playOut(schedule = null) {
    return this.playReaction('out', schedule);
  }

  reset() {
    return this.startAmbient();
  }

  destroy() {
    this.cancelReaction();
    this.dressing?.destroy?.();
    this.dressing = null;
    this.sprite?.destroy?.();
    this.sprite = null;
    this.tiles = [];
    this.scene = null;
  }
}
