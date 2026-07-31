// Presentation striker shared by the menu, locker and match scenes.
//
// Registration is the whole story here. The authored HD poses are all 256px
// tall and share a content baseline at y=247, but their canvases grow to the
// right as the kicking leg extends: idle is 108px wide, ready 160, strike 215,
// follow 213, celebrate 144. Pinning the canvas centre (origin 0.5) therefore
// teleports the torso up to 28 source pixels between consecutive poses, which
// at match scale is a visible sideways lurch on every frame change. Each pose
// instead declares the source column its shoulders occupy, so the body core
// stays welded to one spot and only the limbs travel.
//
// The second rule: exactly one writer per transform property. Ambient breathing
// and the kick sequence both used to tween the sprite directly while setPose()
// wrote setScale() underneath them, so the three fought for the same fields.
// Motion is now accumulated into two plain state objects and composed in
// applyTransform(), which is the only function that touches the sprite.

const POSE_SEQUENCE = ['idle', 'ready', 'strike', 'follow', 'celebrate'];

// originX = shoulderColumnCentre / canvasWidth, measured from the shipped art.
// originY = contentBaseline / canvasHeight, so the boots meet the pitch instead
// of floating on the 9px of transparent padding every frame carries.
const HD_POSE_ANCHOR = Object.freeze({
  idle: Object.freeze({ originX: 48.0 / 108, originY: 247 / 256 }),
  ready: Object.freeze({ originX: 81.0 / 160, originY: 247 / 256 }),
  strike: Object.freeze({ originX: 80.0 / 215, originY: 247 / 256 }),
  follow: Object.freeze({ originX: 84.0 / 213, originY: 247 / 256 }),
  celebrate: Object.freeze({ originX: 70.5 / 144, originY: 247 / 256 })
});
const FALLBACK_ANCHOR = Object.freeze({ originX: 0.5, originY: 1 });

// Source pixels per rendered logical pixel for the 256px-tall HD art.
const HD_SCALE_RATIO = 0.106;

const KICK_TIMELINE = Object.freeze({
  plant: 55,     // weight drops onto the standing foot
  contact: 155,  // boot meets ball - authoritative impulse frame
  follow: 245,   // leg swings through
  recover: 440,  // back to the ready stance
  complete: 560  // recovery transform and clip finish together
});
const KICK_ANIMATION_KEY = 'kicker-action';

function anchorFor(pose, isHd) {
  if (!isHd) return FALLBACK_ANCHOR;
  return HD_POSE_ANCHOR[pose] || HD_POSE_ANCHOR.idle;
}

function poseFromTexture(textureKey) {
  const key = String(textureKey || '');
  return POSE_SEQUENCE.find((pose) => key.endsWith(`-${pose}`)) || null;
}

export class Kicker {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.kitId = opts.kitId || 'kit-home';
    this.pose = opts.pose || 'idle';
    this.scale = opts.scale ?? 3.6;
    this.reducedMotion = Boolean(opts.reducedMotion);
    this.ambientEnabled = opts.ambient !== false;
    this.depth = opts.depth ?? 100;
    this.destroyed = false;
    this.sequenceToken = 0;
    this.sequenceTimers = [];
    this.activeKick = null;
    this.actionClipKit = null;
    this.animationListenersBound = false;

    // Ambient breathing and the kick sequence own separate state objects, so
    // cancelling a kick can never destroy the idle loop and vice versa.
    this.idleState = { bob: 0, swell: 0 };
    this.actState = { lunge: 0, lift: 0, squashX: 1, squashY: 1 };

    const texture = this.textureFor(this.pose);
    this.isHd = texture.startsWith('kicker-hd-');
    this.visualScale = this.scale * (this.isHd ? HD_SCALE_RATIO : 1);

    this.shadow = scene.add.image(x, y, 'shadow')
      .setOrigin(0.5, 0.5)
      .setScale(this.scale * 1.28, this.scale * 0.7)
      .setAlpha(opts.shadowAlpha ?? 0.42)
      .setDepth(this.depth);

    // The action poses are separate textures, but Phaser animations can span
    // texture keys. A Sprite keeps those frames on Phaser's update list and
    // lets the strike callback follow the actual animation frame instead of a
    // free-running timer. Retain the Image fallback for light-weight test and
    // embedding stubs that do not expose a Sprite factory.
    const spriteFactory = typeof scene.add.sprite === 'function'
      ? scene.add.sprite.bind(scene.add)
      : scene.add.image.bind(scene.add);
    this.sprite = spriteFactory(x, y, texture).setDepth(this.depth + 1);

    // Single-frame afterimage used to smear the strike. Created lazily so menu
    // and locker screens that never kick pay nothing for it.
    this.ghost = null;

    this.applyPoseTexture();
    this.applyTransform();
    this.setupActionAnimation();

    if (this.ambientEnabled && !this.reducedMotion) this.startAmbient();
  }

  // ------------------------------------------------------------- appearance

  textureFor(pose) {
    const hd = `kicker-hd-${this.kitId}-${pose}`;
    if (this.scene.textures.exists(hd)) return hd;
    const keyed = `kicker-${this.kitId}-${pose}`;
    if (this.scene.textures.exists(keyed)) return keyed;
    const fallbackPose = pose === 'follow' ? 'strike' : pose;
    const generic = `kicker-${fallbackPose}`;
    if (this.scene.textures.exists(generic)) return generic;
    return this.scene.textures.exists('kicker-idle') ? 'kicker-idle' : '__MISSING';
  }

  applyPoseTexture() {
    if (this.destroyed || !this.sprite) return this;
    const texture = this.textureFor(this.pose);
    this.isHd = texture.startsWith('kicker-hd-');
    this.visualScale = this.scale * (this.isHd ? HD_SCALE_RATIO : 1);
    const anchor = anchorFor(this.pose, this.isHd);
    // Order matters: origin before position, so the new anchor is honoured by
    // the transform written on the very same frame the texture changes.
    this.sprite.setTexture(texture);
    this.sprite.setOrigin(anchor.originX, anchor.originY);
    this.applyTransform();
    return this;
  }

  adoptAnimatedPose(pose) {
    if (this.destroyed || !this.sprite) return this;
    this.pose = POSE_SEQUENCE.includes(pose) ? pose : 'idle';
    const texture = this.sprite.texture?.key || this.textureFor(this.pose);
    this.isHd = texture.startsWith('kicker-hd-');
    this.visualScale = this.scale * (this.isHd ? HD_SCALE_RATIO : 1);
    const anchor = anchorFor(this.pose, this.isHd);
    this.sprite.setOrigin(anchor.originX, anchor.originY);
    this.applyTransform();
    return this;
  }

  setupActionAnimation() {
    const anims = this.sprite?.anims;
    if (!anims?.create || !this.sprite?.on) return false;

    if (anims.exists?.(KICK_ANIMATION_KEY)) anims.remove?.(KICK_ANIMATION_KEY);
    const frameSpecs = [
      ['ready', KICK_TIMELINE.contact],
      ['strike', KICK_TIMELINE.follow - KICK_TIMELINE.contact],
      ['follow', KICK_TIMELINE.recover - KICK_TIMELINE.follow],
      ['ready', KICK_TIMELINE.complete - KICK_TIMELINE.recover]
    ];
    const frames = frameSpecs.map(([pose, duration]) => ({
      key: this.textureFor(pose),
      frame: '__BASE',
      // Phaser 3.90 treats an AnimationFrame duration as the full frame hold
      // (Phaser 4 makes it additive). Explicit non-zero holds keep the contact
      // timing exact on the version shipped by this game.
      duration
    }));
    if (frames.some((frame) => frame.key === '__MISSING')) return false;

    const clip = anims.create({
      key: KICK_ANIMATION_KEY,
      frames,
      frameRate: 1000,
      repeat: 0,
      // Never jump over the strike frame after a browser hitch. It is the
      // authoritative gameplay contact frame, so stretching by one render is
      // preferable to launching the ball without showing the kick.
      skipMissedFrames: false
    });
    if (!clip && !anims.exists?.(KICK_ANIMATION_KEY)) return false;

    this.actionClipKit = this.kitId;
    if (!this.animationListenersBound) {
      this.onAnimationUpdate = (animation, frame) => {
        if (animation?.key !== KICK_ANIMATION_KEY) return;
        this.handleActionFrame(frame);
      };
      this.onAnimationComplete = (animation) => {
        if (animation?.key !== KICK_ANIMATION_KEY) return;
        this.finishActionAnimation();
      };
      this.sprite.on('animationupdate', this.onAnimationUpdate);
      this.sprite.on('animationcomplete', this.onAnimationComplete);
      this.animationListenersBound = true;
    }
    return true;
  }

  hasPlayableActionAnimation() {
    if (this.actionClipKit !== this.kitId) this.setupActionAnimation();
    return Boolean(
      this.actionClipKit === this.kitId &&
      this.sprite?.anims?.exists?.(KICK_ANIMATION_KEY) &&
      (this.sprite?.play || this.sprite?.anims?.play)
    );
  }

  // The single writer for every sprite transform property.
  applyTransform() {
    if (this.destroyed || !this.sprite) return;
    const idle = this.idleState;
    const act = this.actState;
    const scale = this.visualScale;
    this.sprite.setPosition(
      this.x + act.lunge,
      this.y + act.lift + idle.bob
    );
    this.sprite.setScale(
      scale * act.squashX * (1 + idle.swell),
      scale * act.squashY * (1 - idle.swell * 0.5)
    );
    if (this.shadow) {
      // The shadow tightens as the striker rises: it tracks lift, never bob.
      const lift = Math.max(0, -act.lift);
      const tighten = Math.max(0.62, 1 - lift * 0.035);
      this.shadow.setPosition(this.x + act.lunge * 0.45, this.y);
      this.shadow.setScale(this.scale * 1.28 * tighten, this.scale * 0.7 * tighten);
    }
  }

  setKit(kitId) {
    this.kitId = kitId || 'kit-home';
    this.applyPoseTexture();
    this.setupActionAnimation();
    return this;
  }

  setPose(pose) {
    this.pose = POSE_SEQUENCE.includes(pose) ? pose : 'idle';
    this.applyPoseTexture();
    return this;
  }

  setBasePosition(x, y) {
    this.x = x;
    this.y = y;
    this.applyTransform();
    return this;
  }

  setDepth(depth) {
    this.depth = depth;
    this.shadow?.setDepth(depth);
    this.sprite?.setDepth(depth + 1);
    this.ghost?.setDepth(depth);
    return this;
  }

  // ----------------------------------------------------------------- ambient

  startAmbient() {
    if (this.destroyed || this.reducedMotion || !this.ambientEnabled || this.ambient) return this;
    this.ambient = this.scene.tweens.add({
      targets: this.idleState,
      bob: -1.1,
      swell: 0.012,
      duration: 780,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      onUpdate: () => this.applyTransform()
    });
    return this;
  }

  pauseAmbient() {
    if (this.ambient?.isPlaying?.()) this.ambient.pause();
    this.idleState.bob = 0;
    this.idleState.swell = 0;
    return this;
  }

  resumeAmbient() {
    if (this.destroyed || this.reducedMotion || !this.ambientEnabled) return this;
    // A tween destroyed by a scene-wide sweep cannot be resumed; rebuild it.
    if (!this.ambient || this.ambient.state === undefined || !this.ambient.parent) {
      this.ambient = null;
      this.startAmbient();
      return this;
    }
    this.ambient.resume();
    return this;
  }

  // ---------------------------------------------------------------- sequence

  cancelSequence() {
    this.sequenceToken++;
    this.sequenceTimers.forEach((timer) => timer?.remove?.(false));
    this.sequenceTimers.length = 0;
    this.activeKick = null;
    this.previewPending = false;
    this.actionAnimationPaused = false;
    this.sprite?.anims?.stop?.();
    if (!this.destroyed) {
      // Only the action state is swept. The ambient loop lives on its own
      // target and survives, which is what kept breaking after the first kick.
      this.scene.tweens.killTweensOf(this.actState);
      this.actState.lunge = 0;
      this.actState.lift = 0;
      this.actState.squashX = 1;
      this.actState.squashY = 1;
      this.sprite?.setRotation(0).setAlpha(1);
      if (this.ghost) {
        this.scene.tweens.killTweensOf(this.ghost);
        this.ghost.setVisible(false);
      }
      this.applyTransform();
    }
    return this;
  }

  // Phaser Scene clocks/tweens pause independently from Sprite animations.
  // Keep the action clip on the same timeline so pausing during WINDUP cannot
  // advance to the contact frame and silently drop the shot callback.
  pauseAction() {
    if (this.activeKick && this.sprite?.anims?.isPlaying) {
      this.sprite.anims.pause?.();
      this.actionAnimationPaused = true;
    }
    return this;
  }

  resumeAction() {
    if (this.actionAnimationPaused) this.sprite?.anims?.resume?.();
    this.actionAnimationPaused = false;
    return this;
  }

  _after(delay, token, callback) {
    if (this.destroyed) return null;
    let timer = null;
    timer = this.scene.time.delayedCall(delay, () => {
      const index = this.sequenceTimers.indexOf(timer);
      if (index >= 0) this.sequenceTimers.splice(index, 1);
      if (token !== this.sequenceToken || this.destroyed) return;
      if (!this.scene?.sys?.isActive?.()) return;
      callback();
    });
    this.sequenceTimers.push(timer);
    return timer;
  }

  _tweenAct(props, token) {
    if (this.destroyed) return null;
    return this.scene.tweens.add({
      targets: this.actState,
      ...props,
      onUpdate: () => {
        if (token === this.sequenceToken) this.applyTransform();
      }
    });
  }

  snapshotSprite() {
    if (!this.sprite) return null;
    return {
      texture: this.sprite.texture?.key,
      originX: this.sprite.originX,
      originY: this.sprite.originY,
      x: this.sprite.x,
      y: this.sprite.y,
      scaleX: this.sprite.scaleX,
      scaleY: this.sprite.scaleY,
      flipX: this.sprite.flipX
    };
  }

  _spawnGhost(snapshot = null) {
    if (this.reducedMotion || this.destroyed || !this.scene.add?.image) return;
    const source = snapshot || this.snapshotSprite();
    if (!source?.texture) return;
    const anchor = snapshot
      ? { originX: source.originX, originY: source.originY }
      : anchorFor(this.pose, this.isHd);
    if (!this.ghost || !this.ghost.scene) {
      this.ghost = this.scene.add.image(0, 0, source.texture);
    }
    this.ghost
      .setTexture(source.texture)
      .setOrigin(anchor.originX, anchor.originY)
      .setPosition(source.x, source.y)
      .setScale(source.scaleX, source.scaleY)
      .setFlipX(source.flipX)
      .setAlpha(0.3)
      .setDepth(this.depth)
      .setVisible(true);
    this.scene.tweens.killTweensOf(this.ghost);
    this.scene.tweens.add({
      targets: this.ghost,
      alpha: 0,
      duration: 110,
      ease: 'Quad.easeOut',
      onComplete: () => this.ghost?.setVisible(false)
    });
  }

  enterStrikeFrame(action) {
    if (!action || action.phase !== 'ready') return;
    action.phase = 'strike';
    if (!action.reducedMotion) this._spawnGhost(action.previousVisual);
    this.adoptAnimatedPose('strike');
    this.actState.squashX = action.reducedMotion ? 1 : 1.12;
    this.actState.squashY = action.reducedMotion ? 1 : 0.94;
    this.actState.lunge = action.reducedMotion ? 0 : 0.6;
    this.actState.lift = action.reducedMotion ? 0 : -0.4;
    this.applyTransform();
    if (!action.reducedMotion) {
      this._tweenAct({
        squashX: 1,
        squashY: 1,
        duration: 95,
        ease: 'Quad.easeOut'
      }, action.token);
    }
    if (!action.contactFired) {
      action.contactFired = true;
      action.onContact?.();
    }
    action.previousVisual = this.snapshotSprite();
  }

  enterFollowFrame(action) {
    if (!action || action.phase !== 'strike') return;
    action.phase = 'follow';
    this.adoptAnimatedPose('follow');
    if (!action.reducedMotion) {
      this._tweenAct({
        lunge: 2.6,
        lift: 0,
        duration: 150,
        ease: 'Cubic.easeOut'
      }, action.token);
    }
    action.previousVisual = this.snapshotSprite();
  }

  enterRecoveryFrame(action) {
    if (!action || action.phase !== 'follow') return;
    action.phase = 'recover';
    this.adoptAnimatedPose('ready');
    if (!action.reducedMotion) {
      this._tweenAct({
        lunge: 0,
        lift: 0,
        squashX: 1,
        squashY: 1,
        duration: KICK_TIMELINE.complete - KICK_TIMELINE.recover,
        ease: 'Sine.easeOut'
      }, action.token);
    } else {
      this.actState.lunge = 0;
      this.actState.lift = 0;
      this.applyTransform();
    }
    action.previousVisual = this.snapshotSprite();
  }

  handleActionFrame(frame) {
    const action = this.activeKick;
    if (!action || action.token !== this.sequenceToken || this.destroyed) return;
    const textureKey = frame?.textureKey || frame?.key || frame?.frame?.texture?.key || this.sprite?.texture?.key;
    const pose = poseFromTexture(textureKey);
    if (pose === 'strike') this.enterStrikeFrame(action);
    else if (pose === 'follow') this.enterFollowFrame(action);
    else if (pose === 'ready' && action.phase === 'follow') this.enterRecoveryFrame(action);
  }

  finishActionAnimation() {
    const action = this.activeKick;
    if (!action || action.token !== this.sequenceToken || this.destroyed) return;
    if (!action.contactFired) this.enterStrikeFrame(action);
    if (action.phase === 'strike') this.enterFollowFrame(action);
    if (action.phase === 'follow') this.enterRecoveryFrame(action);
    this.activeKick = null;
    this.actState.lunge = 0;
    this.actState.lift = 0;
    this.actState.squashX = 1;
    this.actState.squashY = 1;
    this.applyTransform();
    this.resumeAmbient();
    action.onComplete?.();
  }

  // The contact callback is the authoritative kick frame: GameScene applies the
  // ball impulse there, so boot and ball can never drift apart. Every stage
  // moves the same state object, so the run-up reads as one connected motion
  // instead of four competing setPosition() writes.
  playKick({ onContact, onComplete, reducedMotion = this.reducedMotion } = {}) {
    this.cancelSequence();
    const token = this.sequenceToken;
    this.pauseAmbient();
    this.setPose('ready');

    const action = {
      token,
      phase: 'ready',
      reducedMotion: Boolean(reducedMotion),
      contactFired: false,
      onContact,
      onComplete,
      previousVisual: this.snapshotSprite()
    };
    this.activeKick = action;

    if (this.hasPlayableActionAnimation()) {
      if (!action.reducedMotion) {
        this.actState.lunge = -2.2;
        this.applyTransform();
        action.previousVisual = this.snapshotSprite();
        this._tweenAct({
          lunge: -3.4,
          lift: 0.8,
          duration: KICK_TIMELINE.plant + 60,
          ease: 'Quad.easeIn'
        }, token);
      }
      if (this.sprite.play) this.sprite.play(KICK_ANIMATION_KEY);
      else this.sprite.anims.play(KICK_ANIMATION_KEY);
      return this;
    }

    if (reducedMotion) {
      this._after(KICK_TIMELINE.contact, token, () => {
        this.setPose('strike');
        this.enterStrikeFrame(action);
      });
      this._after(KICK_TIMELINE.follow, token, () => {
        this.setPose('follow');
        this.enterFollowFrame(action);
      });
      this._after(KICK_TIMELINE.recover, token, () => {
        this.setPose('ready');
        this.enterRecoveryFrame(action);
      });
      this._after(KICK_TIMELINE.complete, token, () => this.finishActionAnimation());
      return this;
    }

    // Load: weight settles back and down before the strike.
    this.actState.lunge = -2.2;
    this.applyTransform();
    this._tweenAct({
      lunge: -3.4,
      lift: 0.8,
      duration: KICK_TIMELINE.plant + 60,
      ease: 'Quad.easeIn'
    }, token);

    this._after(KICK_TIMELINE.contact, token, () => {
      this.setPose('strike');
      this.enterStrikeFrame(action);
    });

    this._after(KICK_TIMELINE.follow, token, () => {
      this.setPose('follow');
      this.enterFollowFrame(action);
    });

    this._after(KICK_TIMELINE.recover, token, () => {
      this.setPose('ready');
      this.enterRecoveryFrame(action);
    });
    this._after(KICK_TIMELINE.complete, token, () => this.finishActionAnimation());
    return this;
  }

  // Menu "continue" flourish: a short beat on the ready stance, then a kick.
  // The lead-in timer is tracked like every other stage, so leaving the scene
  // mid-flourish cannot fire a callback into a torn-down scene.
  previewStrike(onComplete) {
    if (this.previewPending || this.activeKick) return false;
    this.cancelSequence();
    this.previewPending = true;
    const token = this.sequenceToken;
    this.pauseAmbient();
    this.setPose('ready');
    this._after(150, token, () => {
      this.playKick({
        onComplete: () => {
          this.previewPending = false;
          onComplete?.();
        }
      });
    });
    return this;
  }

  celebrate(duration = 850) {
    this.cancelSequence();
    const token = this.sequenceToken;
    this.pauseAmbient();
    this.setPose('celebrate');
    if (this.reducedMotion) {
      this._after(duration, token, () => {
        this.setPose('idle');
        this.resumeAmbient();
      });
      return this;
    }
    this._tweenAct({
      lift: -7,
      duration: 180,
      ease: 'Quad.easeOut',
      yoyo: true,
      repeat: 1,
      hold: Math.max(0, duration - 540),
      onComplete: () => {
        if (token !== this.sequenceToken) return;
        this.actState.lift = 0;
        this.setPose('idle');
        this.resumeAmbient();
      }
    }, token);
    return this;
  }

  setVisible(value) {
    this.sprite?.setVisible(value);
    this.shadow?.setVisible(value);
    if (!value) this.ghost?.setVisible(false);
    return this;
  }

  destroy() {
    this.cancelSequence();
    this.destroyed = true;
    if (this.ambient) {
      this.scene.tweens.killTweensOf(this.idleState);
      this.ambient = null;
    }
    if (this.ghost) {
      this.scene.tweens.killTweensOf(this.ghost);
      this.ghost.destroy();
      this.ghost = null;
    }
    if (this.animationListenersBound && this.sprite?.off) {
      this.sprite.off('animationupdate', this.onAnimationUpdate);
      this.sprite.off('animationcomplete', this.onAnimationComplete);
    }
    this.animationListenersBound = false;
    this.sprite?.destroy();
    this.shadow?.destroy();
    this.sprite = null;
    this.shadow = null;
  }
}
