// Presentation-only striker used by menu and locker screens. GameScene can opt
// into the same pose API later without coupling the visual layer to ball physics.
export class Kicker {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.kitId = opts.kitId || 'kit-home';
    this.pose = opts.pose || 'idle';
    this.scale = opts.scale ?? 3.6;
    this.reducedMotion = Boolean(opts.reducedMotion);
    this.sequenceToken = 0;
    this.sequenceTimers = [];
    const texture = this.textureFor(this.pose);
    this.isHd = texture.startsWith('kicker-hd-');
    this.visualScale = this.scale * (this.isHd ? 0.106 : 1);

    this.shadow = scene.add.image(x + 1, y - 2, 'shadow')
      .setOrigin(0.5)
      .setScale(this.scale * 1.28, this.scale * 0.7)
      .setAlpha(opts.shadowAlpha ?? 0.42)
      .setDepth(opts.depth ?? 100);
    this.sprite = scene.add.image(x, y, texture)
      .setOrigin(0.5, 1)
      .setScale(this.visualScale)
      .setDepth((opts.depth ?? 100) + 1);

    if (opts.ambient !== false) {
      this.ambient = scene.tweens.add({
        targets: this.sprite,
        y: y - 1,
        scaleX: this.visualScale * 1.012,
        duration: 780,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1
      });
    }
  }

  textureFor(pose) {
    const hd = `kicker-hd-${this.kitId}-${pose}`;
    if (this.scene.textures.exists(hd)) return hd;
    const keyed = `kicker-${this.kitId}-${pose}`;
    if (this.scene.textures.exists(keyed)) return keyed;
    const fallbackPose = pose === 'follow' ? 'strike' : pose;
    return `kicker-${fallbackPose}`;
  }

  applyPoseTexture() {
    const texture = this.textureFor(this.pose);
    this.isHd = texture.startsWith('kicker-hd-');
    this.visualScale = this.scale * (this.isHd ? 0.106 : 1);
    this.sprite.setTexture(texture).setScale(this.visualScale);
  }

  setKit(kitId) {
    this.kitId = kitId || 'kit-home';
    this.applyPoseTexture();
    return this;
  }

  setPose(pose) {
    this.pose = pose;
    this.applyPoseTexture();
    return this;
  }

  setBasePosition(x, y) {
    this.x = x;
    this.y = y;
    this.sprite.setPosition(x, y);
    this.shadow.setPosition(x + 1, y - 2);
    return this;
  }

  cancelSequence() {
    this.sequenceToken++;
    this.sequenceTimers.forEach((timer) => timer?.remove?.(false));
    this.sequenceTimers = [];
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setPosition(this.x, this.y).setRotation(0).setAlpha(1);
    return this;
  }

  _after(delay, token, callback) {
    const timer = this.scene.time.delayedCall(delay, () => {
      if (token === this.sequenceToken) callback();
    });
    this.sequenceTimers.push(timer);
    return timer;
  }

  // The contact callback is the authoritative kick frame. GameScene applies
  // the ball impulse there, so the boot and ball can never drift apart.
  playKick({ onContact, onComplete, reducedMotion = this.reducedMotion } = {}) {
    this.cancelSequence();
    const token = this.sequenceToken;
    this.ambient?.pause();
    this.sprite.setPosition(this.x - (reducedMotion ? 0 : 6), this.y).setRotation(0);
    this.setPose('ready');

    // The authored order is ready/run-up -> strike/contact -> follow-through.
    // Keeping contact tied to the strike texture prevents the ball impulse from
    // appearing a frame before or after the boot reaches it.
    this._after(55, token, () => {
      if (!reducedMotion) {
        this.scene.tweens.add({
          targets: this.sprite,
          x: this.x - 1,
          y: this.y - 1,
          duration: 95,
          ease: 'Cubic.easeIn'
        });
      }
    });

    this._after(155, token, () => {
      // Smear the strike: the wind-up pose lingers as a brief afterimage and
      // the body stretches through contact. Neither frame reads alone - at
      // full speed they sell one whipping, connected motion.
      if (!reducedMotion && this.scene.add?.image) {
        const ghost = this.scene.add.image(this.sprite.x, this.sprite.y, this.sprite.texture.key)
          .setOrigin(0.5, 1)
          .setScale(this.sprite.scaleX, this.sprite.scaleY)
          .setFlipX(this.sprite.flipX)
          .setAlpha(0.28)
          .setDepth(this.sprite.depth - 1);
        this.scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 90,
          onComplete: () => ghost.destroy()
        });
      }
      this.setPose('strike');
      this.sprite.setPosition(this.x + (reducedMotion ? 0 : 4), this.y - (reducedMotion ? 0 : 1));
      if (!reducedMotion) {
        this.sprite.setScale(this.visualScale * 1.14, this.visualScale * 0.93);
        this.scene.tweens.add({
          targets: this.sprite,
          scaleX: this.visualScale,
          scaleY: this.visualScale,
          duration: 85,
          ease: 'Quad.easeOut'
        });
      }
      onContact?.();
    });

    this._after(245, token, () => {
      this.setPose('follow');
      if (!reducedMotion) {
        this.scene.tweens.add({
          targets: this.sprite,
          x: this.x + 7,
          y: this.y,
          duration: 130,
          ease: 'Cubic.easeOut'
        });
      }
    });

    this._after(440, token, () => {
      this.setPose('ready');
      this.sprite.setPosition(this.x, this.y).setRotation(0);
      this.ambient?.resume();
      onComplete?.();
    });
    return this;
  }

  previewStrike(onComplete) {
    this.cancelSequence();
    this.ambient?.pause();
    this.sprite.setY(this.y);
    this.setPose('ready');
    this.scene.time.delayedCall(150, () => {
      this.playKick({ onComplete });
    });
    return this;
  }

  celebrate(duration = 850) {
    this.cancelSequence();
    this.ambient?.pause();
    this.setPose('celebrate');
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.y - 7,
      duration: 180,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.sprite.setY(this.y);
        this.setPose('idle');
        this.ambient?.resume();
      },
      hold: Math.max(0, duration - 540)
    });
    return this;
  }

  setVisible(value) {
    this.sprite.setVisible(value);
    this.shadow.setVisible(value);
    return this;
  }

  destroy() {
    this.cancelSequence();
    this.ambient?.stop();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
