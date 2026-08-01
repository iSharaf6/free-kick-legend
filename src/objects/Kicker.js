import { STARTER_COSMETICS, getCosmetic, kickerHdTextureKey } from '../data/cosmetics.js';

// Presentation striker shared by the menu, locker and match scenes.
//
// Every authored HD pose is normalized onto the same 256px canvas, common
// bottom-centre anchor and shared per-player scale. Texture changes can therefore
// carry anticipation, contact, recovery and watch poses without teleporting the
// body core or resizing a character between frames.
//
// The second rule: exactly one writer per transform property. Ambient breathing
// and the kick sequence both used to tween the sprite directly while setPose()
// wrote setScale() underneath them, so the three fought for the same fields.
// Motion is now accumulated into two plain state objects and composed in
// applyTransform(), which is the only function that touches the sprite.

const POSE_SEQUENCE = ['idle', 'ready', 'windup', 'strike', 'follow', 'recover', 'watch', 'celebrate'];

const FALLBACK_ANCHOR = Object.freeze({ originX: 0.5, originY: 1 });
const HD_ANCHOR = Object.freeze({ originX: 0.5, originY: 247 / 256 });

// Source pixels per rendered logical pixel for the 256px-tall HD art.
const HD_SCALE_RATIO = 0.106;

const ACTION_HOLDS = Object.freeze({
  // Phaser is configured to preserve every contact frame under a hitch, so
  // these holds are intentionally compact. The eased body offsets continue
  // across texture swaps and carry the movement; the poses are punctuation,
  // not a six-step slideshow.
  ready: 44,
  windup: 78,
  strike: 52,
  follow: 68,
  recover: 82,
  watch: 92
});
const MOTION_TEMPO = Object.freeze({
  'character-mica': 1,
  'character-power-striker': 1.12,
  'character-agile-winger': 0.82,
  'character-islam-sharaf': 0.94
});
const CELEBRATION_MOTION = Object.freeze({
  'character-mica': Object.freeze({ lift: -4.2, lunge: 0.8, duration: 230 }),
  'character-power-striker': Object.freeze({ lift: -2.4, lunge: 1.8, duration: 260 }),
  'character-agile-winger': Object.freeze({ lift: -6.2, lunge: 2.2, duration: 205 }),
  'character-islam-sharaf': Object.freeze({ lift: -3.8, lunge: 1.1, duration: 235 })
});
const KICK_ANIMATION_KEY = 'kicker-action';

function anchorFor(pose, isHd) {
  if (!isHd) return FALLBACK_ANCHOR;
  return HD_ANCHOR;
}

function poseFromTexture(textureKey) {
  const key = String(textureKey || '');
  return POSE_SEQUENCE.find((pose) => key.endsWith(`-${pose}`)) || null;
}

function characterIdOrDefault(characterId) {
  return getCosmetic(characterId)?.category === 'character'
    ? characterId
    : STARTER_COSMETICS.character;
}

function characterScaleFor(characterId) {
  const scale = Number(getCosmetic(characterId)?.renderScale ?? 1);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function actionTimingFor(characterId) {
  const tempo = MOTION_TEMPO[characterId] ?? 1;
  const holds = Object.fromEntries(
    Object.entries(ACTION_HOLDS).map(([pose, duration]) => [pose, Math.round(duration * tempo)])
  );
  let elapsed = 0;
  const at = {};
  for (const pose of ['ready', 'windup', 'strike', 'follow', 'recover', 'watch']) {
    elapsed += holds[pose];
    at[pose] = elapsed;
  }
  return Object.freeze({ holds: Object.freeze(holds), at: Object.freeze(at), complete: elapsed });
}

export class Kicker {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.kitId = opts.kitId || 'kit-home';
    this.characterId = characterIdOrDefault(opts.characterId);
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
    this.actionClipCharacter = null;
    this.animationListenersBound = false;

    // Ambient breathing and the kick sequence own separate state objects, so
    // cancelling a kick can never destroy the idle loop and vice versa.
    this.idleState = { bob: 0, swell: 0 };
    this.actState = { lunge: 0, lift: 0, tilt: 0, squashX: 1, squashY: 1 };

    const texture = this.textureFor(this.pose);
    this.isHd = texture.startsWith('kicker-hd-');
    this.characterScale = characterScaleFor(this.characterId);
    this.visualScale = this.scale * (this.isHd ? HD_SCALE_RATIO : 1) * this.characterScale;

    this.shadow = scene.add.image(x, y, 'shadow')
      .setOrigin(0.5, 0.5)
      .setScale(this.scale * this.characterScale * 1.28, this.scale * this.characterScale * 0.7)
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

  refreshVisualScale() {
    this.characterScale = characterScaleFor(this.characterId);
    this.visualScale = this.scale * (this.isHd ? HD_SCALE_RATIO : 1) * this.characterScale;
  }

  textureFor(pose) {
    const hd = kickerHdTextureKey(this.characterId, this.kitId, pose);
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
    this.refreshVisualScale();
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
    this.refreshVisualScale();
    const anchor = anchorFor(this.pose, this.isHd);
    this.sprite.setOrigin(anchor.originX, anchor.originY);
    this.applyTransform();
    return this;
  }

  setupActionAnimation() {
    const anims = this.sprite?.anims;
    if (!anims?.create || !this.sprite?.on) return false;

    if (anims.exists?.(KICK_ANIMATION_KEY)) anims.remove?.(KICK_ANIMATION_KEY);
    const timing = actionTimingFor(this.characterId);
    const frameSpecs = ['ready', 'windup', 'strike', 'follow', 'recover', 'watch']
      .map((pose) => [pose, timing.holds[pose]]);
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
    this.actionClipCharacter = this.characterId;
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
    if (this.actionClipKit !== this.kitId || this.actionClipCharacter !== this.characterId) {
      this.setupActionAnimation();
    }
    return Boolean(
      this.actionClipKit === this.kitId &&
      this.actionClipCharacter === this.characterId &&
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
    this.sprite.setRotation?.(act.tilt);
    if (this.shadow) {
      // The shadow tightens as the striker rises: it tracks lift, never bob.
      const lift = Math.max(0, -act.lift);
      const tighten = Math.max(0.62, 1 - lift * 0.035);
      this.shadow.setPosition(this.x + act.lunge * 0.45, this.y);
      this.shadow.setScale(
        this.scale * this.characterScale * 1.28 * tighten,
        this.scale * this.characterScale * 0.7 * tighten
      );
    }
  }

  setKit(kitId) {
    this.kitId = kitId || 'kit-home';
    this.applyPoseTexture();
    this.setupActionAnimation();
    return this;
  }

  setCharacter(characterId) {
    this.characterId = characterIdOrDefault(characterId);
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
      bob: -0.48,
      // Do not inflate the whole silhouette to fake breathing. A sub-pixel
      // weight shift keeps the stance alive without the "AI puppet" pulse.
      swell: 0,
      duration: 1080,
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
      this.actState.tilt = 0;
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
      rotation: this.sprite.rotation,
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
      .setRotation(source.rotation || 0)
      .setFlipX(source.flipX)
      .setAlpha(0.14)
      .setDepth(this.depth)
      .setVisible(true);
    this.scene.tweens.killTweensOf(this.ghost);
    this.scene.tweens.add({
      targets: this.ghost,
      alpha: 0,
      duration: 72,
      ease: 'Cubic.easeOut',
      onComplete: () => this.ghost?.setVisible(false)
    });
  }

  enterWindupFrame(action) {
    if (!action || action.phase !== 'ready') return;
    action.phase = 'windup';
    this.adoptAnimatedPose('windup');
    if (!action.reducedMotion) {
      this._tweenAct({
        lunge: -3,
        lift: 0.48,
        tilt: -0.045,
        duration: action.timing.holds.windup,
        ease: 'Cubic.easeIn'
      }, action.token);
    }
    action.previousVisual = this.snapshotSprite();
  }

  enterStrikeFrame(action) {
    if (!action) return;
    // A badly delayed render may deliver contact without the wind-up update.
    // Advance through it synchronously so the state machine and callback stay
    // deterministic while the visible strike frame remains authoritative.
    if (action.phase === 'ready') this.enterWindupFrame(action);
    if (action.phase !== 'windup') return;
    action.phase = 'strike';
    if (!action.reducedMotion) this._spawnGhost(action.previousVisual);
    this.adoptAnimatedPose('strike');
    this.actState.squashX = action.reducedMotion ? 1 : 1.035;
    this.actState.squashY = action.reducedMotion ? 1 : 0.985;
    this.actState.lunge = action.reducedMotion ? 0 : 0.65;
    this.actState.lift = action.reducedMotion ? 0 : -0.22;
    this.actState.tilt = action.reducedMotion ? 0 : 0.024;
    this.applyTransform();
    if (!action.reducedMotion) {
      this._tweenAct({
        lunge: 0.95,
        lift: 0,
        tilt: 0.038,
        squashX: 1,
        squashY: 1,
        duration: action.timing.holds.strike,
        ease: 'Cubic.easeOut'
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
        lunge: 2.25,
        lift: 0,
        tilt: 0.052,
        duration: action.timing.holds.follow,
        ease: 'Cubic.easeOut'
      }, action.token);
    }
    action.previousVisual = this.snapshotSprite();
  }

  enterRecoveryFrame(action) {
    if (!action || action.phase !== 'follow') return;
    action.phase = 'recover';
    this.adoptAnimatedPose('recover');
    if (!action.reducedMotion) {
      this._tweenAct({
        lunge: 1.55,
        lift: 0,
        tilt: 0.018,
        squashX: 1,
        squashY: 1,
        duration: action.timing.holds.recover,
        ease: 'Sine.easeOut'
      }, action.token);
    } else {
      this.actState.lunge = 0;
      this.actState.lift = 0;
      this.applyTransform();
    }
    action.previousVisual = this.snapshotSprite();
  }

  enterWatchFrame(action) {
    if (!action || action.phase !== 'recover') return;
    action.phase = 'watch';
    this.adoptAnimatedPose('watch');
    if (!action.reducedMotion) {
      this._tweenAct({
        lunge: 1.05,
        lift: 0,
        tilt: 0,
        squashX: 1,
        squashY: 1,
        duration: action.timing.holds.watch,
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
    if (pose === 'windup') this.enterWindupFrame(action);
    else if (pose === 'strike') this.enterStrikeFrame(action);
    else if (pose === 'follow') this.enterFollowFrame(action);
    else if (pose === 'recover') this.enterRecoveryFrame(action);
    else if (pose === 'watch') this.enterWatchFrame(action);
  }

  finishActionAnimation() {
    const action = this.activeKick;
    if (!action || action.token !== this.sequenceToken || this.destroyed) return;
    if (action.phase === 'ready') this.enterWindupFrame(action);
    if (!action.contactFired) this.enterStrikeFrame(action);
    if (action.phase === 'strike') this.enterFollowFrame(action);
    if (action.phase === 'follow') this.enterRecoveryFrame(action);
    if (action.phase === 'recover') this.enterWatchFrame(action);
    this.activeKick = null;
    // Hold the watch pose after the clip has completed. GameScene changes the
    // pose only when the shot is resolved, so every striker visibly tracks the
    // ball instead of snapping back to a generic ready frame mid-flight.
    this.actState.lunge = action.reducedMotion ? 0 : 1.05;
    this.actState.lift = 0;
    this.actState.tilt = 0;
    this.actState.squashX = 1;
    this.actState.squashY = 1;
    this.applyTransform();
    this.resumeAmbient();
    action.onComplete?.();
  }

  // The contact callback is the authoritative kick frame: GameScene applies the
  // ball impulse there, so boot and ball can never drift apart. Every stage
  // moves the same state object, so the run-up reads as one connected motion.
  playKick({ onContact, onComplete, reducedMotion = this.reducedMotion } = {}) {
    this.cancelSequence();
    const token = this.sequenceToken;
    this.pauseAmbient();
    this.setPose('ready');

    const action = {
      token,
      phase: 'ready',
      timing: actionTimingFor(this.characterId),
      reducedMotion: Boolean(reducedMotion),
      contactFired: false,
      onContact,
      onComplete,
      previousVisual: this.snapshotSprite()
    };
    this.activeKick = action;

    if (this.hasPlayableActionAnimation()) {
      if (!action.reducedMotion) {
        this.actState.lunge = -1.4;
        this.actState.tilt = -0.012;
        this.applyTransform();
        action.previousVisual = this.snapshotSprite();
        this._tweenAct({
          lunge: -2.4,
          lift: 0.5,
          tilt: -0.026,
          duration: action.timing.holds.ready,
          ease: 'Quad.easeIn'
        }, token);
      }
      if (this.sprite.play) this.sprite.play(KICK_ANIMATION_KEY);
      else this.sprite.anims.play(KICK_ANIMATION_KEY);
      return this;
    }

    if (reducedMotion) {
      this._after(action.timing.at.ready, token, () => {
        this.setPose('windup');
        this.enterWindupFrame(action);
      });
      this._after(action.timing.at.windup, token, () => {
        this.setPose('strike');
        this.enterStrikeFrame(action);
      });
      this._after(action.timing.at.strike, token, () => {
        this.setPose('follow');
        this.enterFollowFrame(action);
      });
      this._after(action.timing.at.follow, token, () => {
        this.setPose('recover');
        this.enterRecoveryFrame(action);
      });
      this._after(action.timing.at.recover, token, () => {
        this.setPose('watch');
        this.enterWatchFrame(action);
      });
      this._after(action.timing.complete, token, () => this.finishActionAnimation());
      return this;
    }

    // Load: weight settles back and down before the strike.
    this.actState.lunge = -1.4;
    this.actState.tilt = -0.012;
    this.applyTransform();
    this._tweenAct({
      lunge: -2.4,
      lift: 0.5,
      tilt: -0.026,
      duration: action.timing.holds.ready,
      ease: 'Quad.easeIn'
    }, token);

    this._after(action.timing.at.ready, token, () => {
      this.setPose('windup');
      this.enterWindupFrame(action);
    });

    this._after(action.timing.at.windup, token, () => {
      this.setPose('strike');
      this.enterStrikeFrame(action);
    });

    this._after(action.timing.at.strike, token, () => {
      this.setPose('follow');
      this.enterFollowFrame(action);
    });

    this._after(action.timing.at.follow, token, () => {
      this.setPose('recover');
      this.enterRecoveryFrame(action);
    });
    this._after(action.timing.at.recover, token, () => {
      this.setPose('watch');
      this.enterWatchFrame(action);
    });
    this._after(action.timing.complete, token, () => this.finishActionAnimation());
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
    const motion = CELEBRATION_MOTION[this.characterId] ?? CELEBRATION_MOTION['character-mica'];
    this._tweenAct({
      lift: motion.lift,
      lunge: motion.lunge,
      squashX: this.characterId === 'character-power-striker' ? 1.045 : 1,
      squashY: this.characterId === 'character-power-striker' ? 0.97 : 1,
      tilt: this.characterId === 'character-agile-winger' ? 0.06 : -0.035,
      duration: motion.duration,
      ease: 'Cubic.easeOut',
      yoyo: true,
      repeat: 0,
      hold: Math.max(0, duration - motion.duration * 2),
      onComplete: () => {
        if (token !== this.sequenceToken) return;
        this.actState.lift = 0;
        this.actState.lunge = 0;
        this.actState.tilt = 0;
        this.actState.squashX = 1;
        this.actState.squashY = 1;
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
