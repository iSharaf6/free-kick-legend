import Phaser from 'phaser';
import { CROWD_MATCH_ANIMATION } from '../data/crowdMatchAnimation.js';

function registerAnimation(scene, spec) {
  if (!scene.textures.exists(spec.textureKey) || scene.anims.exists(spec.animationKey)) return;
  scene.anims.create({
    key: spec.animationKey,
    frames: scene.anims.generateFrameNumbers(spec.textureKey, {
      start: 0,
      end: CROWD_MATCH_ANIMATION.frameCount - 1
    }),
    frameRate: spec.frameRate,
    repeat: spec.repeat
  });
}

/**
 * One authored, full-width supporters' end.
 *
 * The stadium shell is locked across every source frame while individual
 * supporters, scarves, flags and camera flashes change pose. That gives the
 * menu and match actual sprite animation without the stretching and vertical
 * bob that made the previous sliced renderer look like moving wallpaper.
 */
class AnimatedCrowd {
  constructor(scene, { depth = 1.28, reducedMotion = false } = {}) {
    this.scene = scene;
    this.reducedMotion = Boolean(reducedMotion);
    this.reaction = null;
    this.destroyed = false;
    this.timer = null;

    registerAnimation(scene, CROWD_MATCH_ANIMATION.idle);
    registerAnimation(scene, CROWD_MATCH_ANIMATION.goal);
    registerAnimation(scene, CROWD_MATCH_ANIMATION.out);

    this.sprite = scene.add.sprite(
      240,
      0,
      CROWD_MATCH_ANIMATION.idle.textureKey,
      0
    )
      .setOrigin(0.5, 0)
      .setScale(CROWD_MATCH_ANIMATION.displayScale)
      .setDepth(depth);
    this.tiles = [this.sprite];

    this.onAnimationComplete = (animation) => {
      if (this.destroyed || animation?.key === CROWD_MATCH_ANIMATION.idle.animationKey) return;
      this.reaction = null;
      this.startAmbient();
    };
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimationComplete);
    this.startAmbient();
  }

  startAmbient() {
    if (!this.sprite?.active) return this;
    this.reaction = null;
    this.sprite.setTexture(CROWD_MATCH_ANIMATION.idle.textureKey, 0);
    if (this.reducedMotion) {
      this.sprite.anims.stop();
      this.timer = null;
    } else {
      this.sprite.play(CROWD_MATCH_ANIMATION.idle.animationKey, true);
      this.timer = this.sprite.anims.currentAnim;
    }
    return this;
  }

  playReaction(name) {
    const spec = CROWD_MATCH_ANIMATION[name];
    if (!spec || !this.sprite?.active || !this.scene.textures.exists(spec.textureKey)) return this;
    this.reaction = name;
    this.sprite.setTexture(spec.textureKey, 0);
    if (this.reducedMotion) {
      this.sprite.anims.stop();
      this.timer = null;
    } else {
      this.sprite.play(spec.animationKey, true);
      this.timer = this.sprite.anims.currentAnim;
    }
    return this;
  }

  playGoal() {
    return this.playReaction('goal');
  }

  playOut() {
    return this.playReaction('out');
  }

  setReducedMotion(reduced) {
    const next = Boolean(reduced);
    if (next === this.reducedMotion) return this;
    this.reducedMotion = next;
    if (next) {
      this.sprite?.anims?.stop?.();
      this.timer = null;
      const spec = CROWD_MATCH_ANIMATION[this.reaction || 'idle'];
      if (this.sprite?.active && spec) this.sprite.setTexture(spec.textureKey, 0);
    } else if (this.reaction) {
      this.playReaction(this.reaction);
    } else {
      this.startAmbient();
    }
    return this;
  }

  pause() {
    this.sprite?.anims?.pause?.();
    return this;
  }

  resume() {
    if (!this.reducedMotion) this.sprite?.anims?.resume?.();
    return this;
  }

  reset() {
    return this.startAmbient();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sprite?.off?.(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimationComplete);
    this.sprite?.destroy?.();
    this.sprite = null;
    this.timer = null;
    this.tiles = [];
    this.scene = null;
  }
}

export function addAnimatedCrowd(scene, options = {}) {
  if (!scene.textures.exists(CROWD_MATCH_ANIMATION.idle.textureKey)) return null;
  return new AnimatedCrowd(scene, options);
}
