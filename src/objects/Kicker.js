import { STARTER_COSMETICS, getCosmetic, kickerHdTextureKey } from '../data/cosmetics.js';

// Presentation striker shared by the menu, locker and match scenes.
//
// Every authored HD pose is normalized onto the same 256px canvas, common
// bottom-centre anchor and shared per-player scale. Texture changes can therefore
// carry anticipation, contact, recovery and watch poses without resizing a
// character between frames.
//
// The second rule: exactly one writer per transform property. Ambient breathing
// and the kick sequence both used to tween the sprite directly while setPose()
// wrote setScale() underneath them, so the three fought for the same fields.
// Motion is now accumulated into two plain state objects and composed in
// applyTransform(), which is the only function that touches the sprite.
//
// The third rule: the support foot does not slide. The source strips were
// painted pose-by-pose, so the planted boot lands at a different canvas column
// in the wind-up, strike and follow-through frames - on Islam and Malik by
// ~90 source pixels, which read as the striker teleporting sideways at the one
// moment the eye is locked on him. POSE_REGISTRATION pins that boot to the
// kicker's world x instead of pinning the canvas centre.

const POSE_SEQUENCE = ['idle', 'ready', 'windup', 'strike', 'follow', 'recover', 'watch', 'celebrate'];

const FALLBACK_ANCHOR = Object.freeze({ originX: 0.5, originY: 1 });
const HD_ANCHOR = Object.freeze({ originX: 0.5, originY: 247 / 256 });
const HD_FRAME = 256;
const HD_BASELINE = 247;

// Source pixels per rendered logical pixel for the 256px-tall HD art.
const HD_SCALE_RATIO = 0.106;

// Source-pixel columns measured from the shipped 256px frames (kit-home; the
// kit builder only palette-swaps, so every kit shares them). For the kick
// chain it is the planted boot; for watch it is the midpoint of both boots.
// Poses that are not listed register on the canvas centre (128).
export const POSE_REGISTRATION = Object.freeze({
  'character-mica': Object.freeze({ windup: 171, strike: 171, follow: 137, watch: 137 }),
  'character-power-striker': Object.freeze({ windup: 187, strike: 90, follow: 106, watch: 134 }),
  'character-agile-winger': Object.freeze({ windup: 89, strike: 107, follow: 99, watch: 134 }),
  'character-islam-sharaf': Object.freeze({ windup: 182, strike: 93, follow: 106, watch: 135 })
});

// Where the kicking boot is in the cocked wind-up and in the strike frame, and
// where the torso sits in the wind-up. Used to aim the strike at the ball, to
// draw the leg-swing smear, and to hand the run-up over to the plant without
// the torso jumping.
export const STRIKE_GEOMETRY = Object.freeze({
  'character-mica': Object.freeze({ windupBoot: [86, 162], strikeBoot: [206, 190], windupTorso: 135 }),
  'character-power-striker': Object.freeze({ windupBoot: [36, 187], strikeBoot: [182, 174], windupTorso: 138 }),
  'character-agile-winger': Object.freeze({ windupBoot: [82, 168], strikeBoot: [198, 145], windupTorso: 115 }),
  'character-islam-sharaf': Object.freeze({ windupBoot: [98, 172], strikeBoot: [210, 174], windupTorso: 133 })
});

// Run cycles. Mica is painted from behind, so mirroring his stride gives the
// opposite leg and the shoulder counter-rotation of a real run. The other
// three are painted three-quarter, facing the ball; mirroring them would turn
// them round mid-run, so they cycle stride -> passing on the same side and
// the bob carries the rhythm.
const RUN_CYCLES = Object.freeze({
  'character-mica': Object.freeze([
    Object.freeze({ pose: 'ready', flip: false }),
    Object.freeze({ pose: 'recover', flip: false, step: true }),
    Object.freeze({ pose: 'ready', flip: true }),
    Object.freeze({ pose: 'recover', flip: true, step: true })
  ]),
  default: Object.freeze([
    Object.freeze({ pose: 'ready', flip: false }),
    Object.freeze({ pose: 'recover', flip: false, step: true }),
    Object.freeze({ pose: 'ready', flip: false }),
    Object.freeze({ pose: 'recover', flip: false, step: true })
  ])
});

// Compact kick (menu flourish, embeds): no travel, the striker is already at
// the ball. The two pre-contact holds are one shared budget.
export const COMPACT_CONTACT_MS = 150;
// Match kick: two running strides, a plant, contact. Every character reaches
// the ball on the same tick - Time Attack starts on swipe release, so the
// run-up must not secretly grant one striker more clock than another.
export const RUN_UP_CONTACT_MS = 330;

const ACTION_HOLDS = Object.freeze({
  ready: 58,
  windup: 92,
  // Contact is held long enough to cover the scene's kick hit-stop, so the
  // boot is on the ball for the whole freeze instead of already swinging off.
  strike: 92,
  follow: 112,
  recover: 132,
  watch: 150
});
const RUN_UP_WINDUP_MS = 112;
// Stride frame vs passing frame share of one stride.
const RUN_STRIDE_SHARE = 0.6;
const RUN_BOB_PX = 2.1;

const MOTION_TEMPO = Object.freeze({
  'character-mica': 1,
  'character-power-striker': 1.12,
  'character-agile-winger': 0.82,
  'character-islam-sharaf': 0.94
});
// Celebration jump per character: how high, how far forward, and how long in
// the air. Malik is heavy and low; Nico is springy.
const CELEBRATION_MOTION = Object.freeze({
  'character-mica': Object.freeze({ lift: -8.5, lunge: 1.2, air: 250, hops: 2 }),
  'character-power-striker': Object.freeze({ lift: -5.2, lunge: 2.2, air: 230, hops: 1 }),
  'character-agile-winger': Object.freeze({ lift: -11, lunge: 2.4, air: 280, hops: 2 }),
  'character-islam-sharaf': Object.freeze({ lift: -8, lunge: 1.4, air: 250, hops: 2 })
});
const KICK_ANIMATION_KEY = 'kicker-action';
const RUN_UP_ANIMATION_KEY = 'kicker-runup';
const ACTION_KEYS = new Set([KICK_ANIMATION_KEY, RUN_UP_ANIMATION_KEY]);
const KICK_CHAIN = new Set(['windup', 'strike', 'follow']);

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

function registrationFor(characterId, pose) {
  return POSE_REGISTRATION[characterId]?.[pose] ?? HD_FRAME / 2;
}

function geometryFor(characterId) {
  return STRIKE_GEOMETRY[characterId] ?? STRIKE_GEOMETRY['character-mica'];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function postContactHolds(tempo) {
  return {
    strike: Math.round(ACTION_HOLDS.strike * tempo),
    follow: Math.round(ACTION_HOLDS.follow * tempo),
    recover: Math.round(ACTION_HOLDS.recover * tempo),
    watch: Math.round(ACTION_HOLDS.watch * tempo)
  };
}

function actionTimingFor(characterId) {
  const tempo = MOTION_TEMPO[characterId] ?? 1;
  // Preserve each silhouette's rhythm by redistributing ready/windup within a
  // fixed pre-contact budget; tempo still owns follow-through and recovery.
  const windup = Math.round(ACTION_HOLDS.windup * tempo);
  const holds = {
    ready: COMPACT_CONTACT_MS - windup,
    windup,
    ...postContactHolds(tempo)
  };
  let elapsed = 0;
  const at = {};
  for (const pose of ['ready', 'windup', 'strike', 'follow', 'recover', 'watch']) {
    elapsed += holds[pose];
    at[pose] = elapsed;
  }
  return Object.freeze({ holds: Object.freeze(holds), at: Object.freeze(at), complete: elapsed });
}

// Frame list for the compact kick. One entry per animation frame.
function compactFramesFor(characterId) {
  const timing = actionTimingFor(characterId);
  return ['ready', 'windup', 'strike', 'follow', 'recover', 'watch'].map((pose) => Object.freeze({
    pose,
    flip: false,
    hold: timing.holds[pose],
    stage: pose === 'ready' ? 'run' : pose,
    step: false
  }));
}

// Frame list for the match run-up: stride cycle, plant, contact and the same
// follow-through. The pre-contact frames always sum to RUN_UP_CONTACT_MS.
function runUpFramesFor(characterId) {
  const tempo = MOTION_TEMPO[characterId] ?? 1;
  const cycle = RUN_CYCLES[characterId] ?? RUN_CYCLES.default;
  const windup = Math.round(RUN_UP_WINDUP_MS * tempo);
  const runBudget = RUN_UP_CONTACT_MS - windup;
  const strides = cycle.length / 2;
  const strideMs = runBudget / strides;
  const frames = [];
  let used = 0;
  cycle.forEach((entry, index) => {
    const isStride = entry.pose === 'ready';
    let hold = Math.round(strideMs * (isStride ? RUN_STRIDE_SHARE : 1 - RUN_STRIDE_SHARE));
    // Put any rounding remainder on the last run frame so contact is exact.
    if (index === cycle.length - 1) hold = runBudget - used;
    used += hold;
    frames.push(Object.freeze({ pose: entry.pose, flip: entry.flip, hold, stage: 'run', step: Boolean(entry.step) }));
  });
  frames.push(Object.freeze({ pose: 'windup', flip: false, hold: windup, stage: 'windup', step: true }));
  const post = postContactHolds(tempo);
  for (const pose of ['strike', 'follow', 'recover', 'watch']) {
    frames.push(Object.freeze({ pose, flip: false, hold: post[pose], stage: pose, step: false }));
  }
  return Object.freeze(frames);
}

// Visual scale (logical px per source px) for a gameplay scale and character.
function hdVisualScale(scale, characterId) {
  return scale * HD_SCALE_RATIO * characterScaleFor(characterId);
}

/**
 * Where the striker must plant so the boot meets the ball on the strike frame.
 *
 * `ball` is in screen space: centre x/y, the turf y under it and its drawn
 * radius. `scaleAtGroundY(y)` returns the kicker gameplay scale for a foot
 * planted at screen y (perspective). The plant may drop a few pixels towards
 * the camera so a high-swinging boot still reaches the ball's upper half.
 */
export function planStrikerContact({ characterId, ball, scaleAtGroundY, maxDrop = 5 }) {
  const id = characterIdOrDefault(characterId);
  const geometry = geometryFor(id);
  const reg = registrationFor(id, 'strike');
  const [bootX, bootY] = geometry.strikeBoot;
  let groundY = ball.groundY;
  let scale = scaleAtGroundY(groundY);
  for (let i = 0; i < 3; i++) {
    const vs = hdVisualScale(scale, id);
    const bootHeight = (HD_BASELINE - bootY) * vs;
    const wanted = ball.y + bootHeight;
    groundY = Math.max(ball.groundY - 1, Math.min(ball.groundY + maxDrop, wanted));
    scale = scaleAtGroundY(groundY);
  }
  const vs = hdVisualScale(scale, id);
  return {
    x: ball.x - ball.r * 0.55 - (bootX - reg) * vs,
    y: groundY,
    scale
  };
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
    this.actionClips = new Map();
    this.animationListenersBound = false;
    this.flip = false;
    // Compact kicks keep the torso where the idle stance was; the planted
    // boot is then this far from the stance root.
    this.plantShift = 0;
    this.approachTween = null;

    // Ambient breathing and the kick sequence own separate state objects, so
    // cancelling a kick can never destroy the idle loop and vice versa.
    this.idleState = { bob: 0, swell: 0 };
    this.actState = { lunge: 0, lift: 0, tilt: 0, squashX: 1, squashY: 1 };

    const texture = this.textureFor(this.pose);
    this.isHd = texture.startsWith('kicker-hd-');
    this.characterScale = characterScaleFor(this.characterId);
    this.visualScale = this.scale * (this.isHd ? HD_SCALE_RATIO : 1) * this.characterScale;

    this.shadowAlpha = opts.shadowAlpha ?? 0.42;
    this.shadow = scene.add.image(x, y, 'shadow')
      .setOrigin(0.5, 0.5)
      .setScale(this.scale * this.characterScale * 1.28, this.scale * this.characterScale * 0.7)
      .setAlpha(this.shadowAlpha)
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

    // Single-frame afterimage used to smear the strike, and the leg-swing arc.
    // Created lazily so menu and locker screens that never kick pay nothing.
    this.ghost = null;
    this.smearGfx = null;

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

  // True when this striker's authored HD frames for `poses` are resident. A
  // freshly equipped striker may only have his idle still streamed in, and the
  // procedural fallback frames must never stand in for his kick.
  hasHdPoses(poses = ['ready', 'windup', 'strike', 'follow', 'recover', 'watch']) {
    return poses.every((pose) => this.scene.textures?.exists?.(
      kickerHdTextureKey(this.characterId, this.kitId, pose)
    ));
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

  adoptAnimatedPose(pose, flip = this.flip) {
    if (this.destroyed || !this.sprite) return this;
    this.pose = POSE_SEQUENCE.includes(pose) ? pose : 'idle';
    this.flip = Boolean(flip);
    const texture = this.sprite.texture?.key || this.textureFor(this.pose);
    this.isHd = texture.startsWith('kicker-hd-');
    this.refreshVisualScale();
    const anchor = anchorFor(this.pose, this.isHd);
    this.sprite.setOrigin(anchor.originX, anchor.originY);
    this.applyTransform();
    return this;
  }

  // Horizontal offset, in logical pixels, that moves this pose's registration
  // column onto the kicker's world x.
  registrationOffset(pose = this.pose, flip = this.flip) {
    if (!this.isHd) return 0;
    const reg = registrationFor(this.characterId, pose);
    const offset = (HD_FRAME / 2 - reg) * this.visualScale;
    const chain = KICK_CHAIN.has(pose) ? this.plantShift : 0;
    return (flip ? -offset : offset) + chain;
  }

  // Screen position of a source pixel of `pose`, given the current root.
  sourcePoint(pose, sx, sy, flip = false) {
    const reg = registrationFor(this.characterId, pose);
    const dx = (sx - reg) * this.visualScale * (flip ? -1 : 1);
    const chain = KICK_CHAIN.has(pose) ? this.plantShift : 0;
    return {
      x: this.x + chain + this.actState.lunge + dx,
      y: this.y + this.actState.lift + (sy - HD_BASELINE) * this.visualScale
    };
  }

  buildClip(key, frameSpecs) {
    const anims = this.sprite?.anims;
    if (!anims?.create) return null;
    if (anims.exists?.(key)) anims.remove?.(key);
    const frames = frameSpecs.map((spec) => ({
      key: this.textureFor(spec.pose),
      frame: '__BASE',
      // Phaser 3.90 treats an AnimationFrame duration as the full frame hold
      // (Phaser 4 makes it additive). Explicit non-zero holds keep the contact
      // timing exact on the version shipped by this game.
      duration: spec.hold
    }));
    if (frames.some((frame) => frame.key === '__MISSING')) return null;
    const clip = anims.create({
      key,
      frames,
      frameRate: 1000,
      repeat: 0,
      // Never jump over the strike frame after a browser hitch. It is the
      // authoritative gameplay contact frame, so stretching by one render is
      // preferable to launching the ball without showing the kick.
      skipMissedFrames: false
    });
    if (!clip && !anims.exists?.(key)) return null;
    return { key, specs: frameSpecs };
  }

  setupActionAnimation() {
    const anims = this.sprite?.anims;
    if (!anims?.create || !this.sprite?.on) return false;

    this.actionClips.clear();
    const compact = this.buildClip(KICK_ANIMATION_KEY, compactFramesFor(this.characterId));
    if (!compact) return false;
    this.actionClips.set(KICK_ANIMATION_KEY, compact);
    const runUp = this.buildClip(RUN_UP_ANIMATION_KEY, runUpFramesFor(this.characterId));
    if (runUp) this.actionClips.set(RUN_UP_ANIMATION_KEY, runUp);

    this.actionClipKit = this.kitId;
    this.actionClipCharacter = this.characterId;
    if (!this.animationListenersBound) {
      this.onAnimationUpdate = (animation, frame) => {
        if (!ACTION_KEYS.has(animation?.key)) return;
        this.handleActionFrame(frame, animation.key);
      };
      this.onAnimationComplete = (animation) => {
        if (!ACTION_KEYS.has(animation?.key)) return;
        this.finishActionAnimation();
      };
      this.sprite.on('animationupdate', this.onAnimationUpdate);
      this.sprite.on('animationcomplete', this.onAnimationComplete);
      this.animationListenersBound = true;
    }
    return true;
  }

  hasPlayableActionAnimation(key = KICK_ANIMATION_KEY) {
    if (this.actionClipKit !== this.kitId || this.actionClipCharacter !== this.characterId) {
      this.setupActionAnimation();
    }
    return Boolean(
      this.actionClipKit === this.kitId &&
      this.actionClipCharacter === this.characterId &&
      this.actionClips.has(key) &&
      this.sprite?.anims?.exists?.(key) &&
      (this.sprite?.play || this.sprite?.anims?.play)
    );
  }

  // The single writer for every sprite transform property.
  applyTransform() {
    if (this.destroyed || !this.sprite) return;
    const idle = this.idleState;
    const act = this.actState;
    const scale = this.visualScale;
    const register = this.registrationOffset();
    this.sprite.setFlipX?.(this.flip);
    this.sprite.setPosition(
      this.x + act.lunge + register,
      this.y + act.lift + idle.bob
    );
    this.sprite.setScale(
      scale * act.squashX * (1 + idle.swell),
      scale * act.squashY * (1 - idle.swell * 0.5)
    );
    this.sprite.setRotation?.(act.tilt);
    if (this.shadow) {
      // The shadow tightens and fades as the striker rises: it tracks lift,
      // never bob, and stays on the turf under him.
      const lift = Math.max(0, -act.lift);
      const tighten = Math.max(0.55, 1 - lift * 0.045);
      const shadowX = this.x + act.lunge * 0.45 + (KICK_CHAIN.has(this.pose) ? this.plantShift : 0);
      this.shadow.setPosition(shadowX, this.y);
      this.shadow.setScale(
        this.scale * this.characterScale * 1.28 * tighten * act.squashX,
        this.scale * this.characterScale * 0.7 * tighten
      );
      this.shadow.setAlpha?.(this.shadowAlpha * Math.max(0.45, tighten));
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
    this.flip = false;
    this.applyPoseTexture();
    return this;
  }

  setBasePosition(x, y) {
    this.x = x;
    this.y = y;
    this.applyTransform();
    return this;
  }

  // Root position and gameplay scale together: used when the striker moves
  // between his run-up mark and the ball, where perspective changes his size.
  setStance({ x = this.x, y = this.y, scale = this.scale } = {}) {
    this.x = x;
    this.y = y;
    this.scale = scale;
    this.refreshVisualScale();
    this.applyTransform();
    return this;
  }

  setDepth(depth) {
    this.depth = depth;
    this.shadow?.setDepth(depth);
    this.sprite?.setDepth(depth + 1);
    this.ghost?.setDepth(depth);
    this.smearGfx?.setDepth(depth + 0.5);
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
    this.applyTransform();
    return this;
  }

  stopAmbient() {
    // Reduced motion is not a temporary scene pause. Remove the tween from the
    // manager entirely so a later resumeAll() cannot wake it behind the user's
    // back when the pause/settings overlay closes.
    this.scene.tweens.killTweensOf(this.idleState);
    this.ambient = null;
    this.idleState.bob = 0;
    this.idleState.swell = 0;
    this.applyTransform();
    return this;
  }

  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
    if (this.reducedMotion) this.stopAmbient();
    else this.resumeAmbient();
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

  stopApproach() {
    if (!this.approachTween) return;
    this.approachTween.stop?.();
    this.approachTween.remove?.();
    this.approachTween = null;
  }

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
      this.stopApproach();
      this.actState.lunge = 0;
      this.actState.lift = 0;
      this.actState.tilt = 0;
      this.actState.squashX = 1;
      this.actState.squashY = 1;
      this.flip = false;
      this.plantShift = 0;
      this.sprite?.setRotation(0).setAlpha(1);
      if (this.ghost) {
        this.scene.tweens.killTweensOf(this.ghost);
        this.ghost.setVisible(false);
      }
      if (this.smearGfx) {
        this.scene.tweens.killTweensOf(this.smearGfx);
        this.smearGfx.clear?.();
        this.smearGfx.setVisible?.(false);
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
      .setAlpha(0.22)
      .setDepth(this.depth)
      .setVisible(true);
    this.scene.tweens.killTweensOf(this.ghost);
    this.scene.tweens.add({
      targets: this.ghost,
      alpha: 0,
      duration: 85,
      ease: 'Cubic.easeOut',
      onComplete: () => this.ghost?.setVisible(false)
    });
  }

  // The leg-swing smear: one chunky pixel crescent from the cocked boot,
  // through the ball, to the strike boot. It is the in-between the source
  // strip never painted, drawn for the few frames the eye needs it.
  _drawLegSmear(action) {
    if (action.reducedMotion || this.destroyed || !this.isHd || !this.scene.add?.graphics) return;
    const geometry = geometryFor(this.characterId);
    const start = this.sourcePoint('windup', geometry.windupBoot[0], geometry.windupBoot[1]);
    const end = this.sourcePoint('strike', geometry.strikeBoot[0], geometry.strikeBoot[1]);
    const through = action.contactPoint || {
      x: lerp(start.x, end.x, 0.62),
      y: Math.max(start.y, end.y) + 4 * (this.visualScale / 0.25)
    };
    // Quadratic control point that makes the curve pass through `through`.
    const cx = 2 * through.x - (start.x + end.x) / 2;
    const cy = 2 * through.y - (start.y + end.y) / 2;
    if (!this.smearGfx || !this.smearGfx.scene) {
      this.smearGfx = this.scene.add.graphics();
    }
    const gfx = this.smearGfx;
    this.scene.tweens.killTweensOf(gfx);
    gfx.clear().setDepth(this.depth + 0.5).setAlpha(1).setVisible(true);
    const span = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(12, Math.ceil(span * 1.6));
    const px = this.visualScale / 0.25;
    const point = (t) => {
      const u = 1 - t;
      const x = u * u * start.x + 2 * u * t * cx + t * t * end.x;
      const y = u * u * start.y + 2 * u * t * cy + t * t * end.y;
      // Unit normal of the curve, for the parallel motion lines.
      const dx = 2 * u * (cx - start.x) + 2 * t * (end.x - cx);
      const dy = 2 * u * (cy - start.y) + 2 * t * (end.y - cy);
      const len = Math.max(0.001, Math.hypot(dx, dy));
      return { x, y, nx: -dy / len, ny: dx / len };
    };
    // Rasterise onto the logical pixel grid, keeping the strongest alpha per
    // pixel: overlapping translucent stamps would otherwise stack into a
    // solid white bar.
    const pixels = new Map();
    const plot = (x, y, alpha, color) => {
      const key = `${x},${y}`;
      const previous = pixels.get(key);
      if (!previous || previous.alpha < alpha) pixels.set(key, { x, y, alpha, color });
    };
    // Core: a crescent that is thin where the swing starts, fullest through
    // the ball and thin again at the painted boot, fading in from the tail so
    // it reads as speed rather than as a solid object.
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = point(t);
      const swell = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 1.2);
      const w = Math.max(1, Math.round(3 * px * swell));
      const half = Math.floor(w / 2);
      const alpha = 0.1 + 0.5 * Math.pow(t, 1.4);
      const x0 = Math.round(p.x) - half;
      const y0 = Math.round(p.y) - half;
      for (let ox = 0; ox < w; ox++) {
        for (let oy = 0; oy < w; oy++) plot(x0 + ox, y0 + oy, alpha, 0xffffff);
      }
    }
    // Two one-pixel motion lines either side of the core, over the part of
    // the swing that passes the ball.
    for (const side of [-1, 1]) {
      const offset = side * Math.max(2, Math.round(2.6 * px));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (t < 0.3 || t > 0.92) continue;
        const p = point(t);
        plot(
          Math.round(p.x + p.nx * offset),
          Math.round(p.y + p.ny * offset),
          0.45 * Math.sin(Math.PI * (t - 0.3) / 0.62),
          0xf6f1e2
        );
      }
    }
    for (const pixel of pixels.values()) {
      gfx.fillStyle(pixel.color, pixel.alpha);
      gfx.fillRect(pixel.x, pixel.y, 1, 1);
    }
    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      delay: 24,
      duration: 70,
      ease: 'Quad.easeIn',
      onComplete: () => {
        gfx.clear?.();
        gfx.setVisible?.(false);
      }
    });
  }

  // Run-up travel: the root moves from the mark to the plant along an
  // accelerating path, while the stride bob and footfall squash are derived
  // from the same clock as the stride frames.
  _updateApproach(action, progress) {
    const approach = action.approach;
    if (!approach || action.phase !== 'ready') return;
    const p = Math.max(0, Math.min(1, progress));
    // A run-up accelerates into the ball.
    const e = p * (0.62 + 0.38 * p);
    this.x = lerp(approach.from.x, approach.runEnd.x, e);
    this.y = lerp(approach.from.y, approach.to.y, e);
    this.scale = lerp(approach.from.scale, approach.to.scale, e);
    this.refreshVisualScale();
    if (!action.reducedMotion) {
      const elapsed = p * approach.runMs;
      const phase = (elapsed % approach.strideMs) / approach.strideMs;
      const inAir = phase < RUN_STRIDE_SHARE;
      const air = Math.sin(Math.PI * Math.min(1, phase / RUN_STRIDE_SHARE));
      const landing = inAir
        ? 0
        : Math.max(0, 1 - ((phase - RUN_STRIDE_SHARE) / (1 - RUN_STRIDE_SHARE)) * 1.6);
      this.actState.lift = inAir ? -RUN_BOB_PX * air : 0.35 * landing;
      this.actState.squashY = inAir ? 1 + 0.02 * air : 1 - 0.045 * landing;
      this.actState.squashX = inAir ? 1 - 0.012 * air : 1 + 0.035 * landing;
      // Lean into the run; the three-quarter painted strikers already lean.
      this.actState.tilt = approach.lean * Math.min(1, p * 3);
    }
    this.applyTransform();
  }

  _emitStep(action, heavy = false) {
    if (!action?.onStep) return;
    action.onStep({ x: this.x, y: this.y, scale: this.scale, heavy });
  }

  enterWindupFrame(action) {
    if (!action || action.phase !== 'ready') return;
    action.phase = 'windup';
    if (action.approach) {
      // Plant: the root lands exactly on the planned spot. The run frames were
      // aimed at the wind-up torso, so the body continues without a jump.
      this.stopApproach();
      this.x = action.approach.to.x;
      this.y = action.approach.to.y;
      this.scale = action.approach.to.scale;
      this.refreshVisualScale();
    }
    this.scene.tweens.killTweensOf(this.actState);
    this.adoptAnimatedPose('windup', false);
    if (action.approach) this._emitStep(action, true);
    if (!action.reducedMotion) {
      // Plant squash, then the body coils back over the planted boot.
      this.actState.lift = 0.9;
      this.actState.squashX = 1.05;
      this.actState.squashY = 0.955;
      this.actState.lunge = 0;
      this.actState.tilt = -0.02;
      this.applyTransform();
      this._tweenAct({
        lift: 0.35,
        squashX: 1.012,
        squashY: 0.99,
        lunge: -1.1,
        tilt: -0.05,
        duration: action.timing.windup,
        ease: 'Cubic.easeOut'
      }, action.token);
    } else {
      this.actState.lunge = 0;
      this.actState.lift = 0;
      this.actState.tilt = 0;
      this.actState.squashX = 1;
      this.actState.squashY = 1;
      this.applyTransform();
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
    this.scene.tweens.killTweensOf(this.actState);
    if (!action.reducedMotion) this._spawnGhost(action.previousVisual);
    this.adoptAnimatedPose('strike', false);
    // Impact frame: the body whips round over the planted boot. The frame is
    // snapped, not eased in - contact is a hit, not a slide.
    this.actState.squashX = action.reducedMotion ? 1 : 1.06;
    this.actState.squashY = action.reducedMotion ? 1 : 0.965;
    this.actState.lunge = action.reducedMotion ? 0 : 0.8;
    this.actState.lift = action.reducedMotion ? 0 : -0.4;
    this.actState.tilt = action.reducedMotion ? 0 : 0.045;
    this.applyTransform();
    if (!action.reducedMotion) {
      this._drawLegSmear(action);
      this._tweenAct({
        lunge: 1.4,
        lift: -0.2,
        tilt: 0.05,
        squashX: 1,
        squashY: 1,
        duration: action.timing.strike,
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
    this.adoptAnimatedPose('follow', false);
    if (!action.reducedMotion) {
      // Momentum carries him up onto the toes of the planted foot.
      this._tweenAct({
        lunge: 2.6,
        lift: -1.3,
        tilt: 0.06,
        squashX: 0.985,
        squashY: 1.02,
        duration: action.timing.follow,
        ease: 'Cubic.easeOut'
      }, action.token);
    }
    action.previousVisual = this.snapshotSprite();
  }

  enterRecoveryFrame(action) {
    if (!action || action.phase !== 'follow') return;
    action.phase = 'recover';
    this.adoptAnimatedPose('recover', false);
    if (!action.reducedMotion) {
      // Lands on the kicking foot, a step past the ball.
      this.scene.tweens.killTweensOf(this.actState);
      this.actState.lift = 0.6;
      this.actState.squashX = 1.035;
      this.actState.squashY = 0.97;
      this.applyTransform();
      this._emitStep(action, false);
      this._tweenAct({
        lunge: 4.2,
        lift: 0,
        tilt: 0.018,
        squashX: 1,
        squashY: 1,
        duration: action.timing.recover,
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
    this.adoptAnimatedPose('watch', false);
    if (!action.reducedMotion) {
      this._tweenAct({
        lunge: 4.6,
        lift: 0,
        tilt: 0,
        squashX: 1,
        squashY: 1,
        duration: action.timing.watch,
        ease: 'Sine.easeOut'
      }, action.token);
    } else {
      this.actState.lunge = 0;
      this.actState.lift = 0;
      this.applyTransform();
    }
    action.previousVisual = this.snapshotSprite();
  }

  // Resolve the spec for an animation frame. Phaser frames carry a 1-based
  // index; stubs and older callers only carry the texture key, which is
  // unambiguous for every stage after the run.
  specForFrame(frame, clipKey) {
    const clip = this.actionClips.get(clipKey || this.activeKick?.clipKey);
    const index = Number(frame?.index);
    if (clip && Number.isInteger(index) && index >= 1 && index <= clip.specs.length) {
      return clip.specs[index - 1];
    }
    const textureKey = frame?.textureKey || frame?.key || frame?.frame?.texture?.key || this.sprite?.texture?.key;
    const pose = poseFromTexture(textureKey);
    if (!pose) return null;
    return { pose, flip: false, stage: pose === 'ready' ? 'run' : pose, step: false };
  }

  handleActionFrame(frame, clipKey) {
    const action = this.activeKick;
    if (!action || action.token !== this.sequenceToken || this.destroyed) return;
    const spec = this.specForFrame(frame, clipKey);
    if (!spec) return;
    if (spec.stage === 'run') {
      if (action.phase !== 'ready') return;
      // Stride frames: texture + mirror only; travel is continuous.
      this.adoptAnimatedPose(spec.pose, spec.flip);
      if (spec.step) this._emitStep(action, false);
      return;
    }
    if (spec.stage === 'windup') this.enterWindupFrame(action);
    else if (spec.stage === 'strike') this.enterStrikeFrame(action);
    else if (spec.stage === 'follow') this.enterFollowFrame(action);
    else if (spec.stage === 'recover') this.enterRecoveryFrame(action);
    else if (spec.stage === 'watch') this.enterWatchFrame(action);
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
    this.scene.tweens.killTweensOf(this.actState);
    this.actState.lunge = action.reducedMotion ? 0 : 4.6;
    this.actState.lift = 0;
    this.actState.tilt = 0;
    this.actState.squashX = 1;
    this.actState.squashY = 1;
    this.applyTransform();
    this.resumeAmbient();
    action.onComplete?.();
  }

  // Run-up geometry for a match kick. `approach.to` is the planted root (from
  // planStrikerContact); the run frames aim at the wind-up torso so the plant
  // hands over without the body jumping.
  _prepareApproach(approach, specs) {
    if (!approach?.to || !this.isHd) return null;
    const geometry = geometryFor(this.characterId);
    const toScale = approach.to.scale ?? this.scale;
    const toVs = hdVisualScale(toScale, this.characterId);
    const runSpecs = specs.filter((spec) => spec.stage === 'run');
    const runMs = runSpecs.reduce((sum, spec) => sum + spec.hold, 0);
    const strides = Math.max(1, runSpecs.length / 2);
    return {
      from: { x: this.x, y: this.y, scale: this.scale },
      to: { x: approach.to.x, y: approach.to.y, scale: toScale },
      runEnd: { x: approach.to.x + (geometry.windupTorso - registrationFor(this.characterId, 'windup')) * toVs },
      runMs,
      strideMs: runMs / strides,
      lean: this.characterId === 'character-mica' ? 0.035 : 0.02
    };
  }

  // The contact callback is the authoritative kick frame: GameScene applies the
  // ball impulse there, so boot and ball can never drift apart. Every stage
  // moves the same state object, so the run-up reads as one connected motion.
  //
  // With `approach`, the striker runs from his mark to the ball first (the
  // match). Without it he kicks in place (the menu flourish).
  playKick({ onContact, onComplete, onStep, approach = null, contactPoint = null, reducedMotion = this.reducedMotion } = {}) {
    this.cancelSequence();
    const token = this.sequenceToken;
    this.pauseAmbient();
    this.setPose('ready');

    const wantsRunUp = Boolean(approach?.to) && this.isHd && this.hasPlayableActionAnimation(RUN_UP_ANIMATION_KEY);
    const clipKey = wantsRunUp ? RUN_UP_ANIMATION_KEY : KICK_ANIMATION_KEY;
    const specs = this.actionClips.get(clipKey)?.specs || compactFramesFor(this.characterId);
    const timing = Object.fromEntries(specs.map((spec) => [spec.stage === 'run' ? 'ready' : spec.stage, spec.hold]));
    const action = {
      token,
      clipKey,
      phase: 'ready',
      timing,
      reducedMotion: Boolean(reducedMotion),
      contactFired: false,
      onContact,
      onComplete,
      onStep,
      contactPoint,
      approach: wantsRunUp ? this._prepareApproach(approach, specs) : null,
      previousVisual: this.snapshotSprite()
    };
    this.activeKick = action;

    if (approach?.to && !action.approach) {
      // Run-up unavailable (stubs, missing clip): plant at the ball directly.
      this.setStance(approach.to);
    } else if (!action.approach && this.isHd) {
      // Without a run-up the plant lands under the stance's torso rather than
      // under its root, so the flourish kicks in place instead of lurching.
      const geometry = geometryFor(this.characterId);
      this.plantShift = (registrationFor(this.characterId, 'windup') - geometry.windupTorso) * this.visualScale;
    }

    if (this.hasPlayableActionAnimation(clipKey)) {
      if (action.approach) {
        const clock = { t: 0 };
        this.approachTween = this.scene.tweens.add({
          targets: clock,
          t: 1,
          duration: action.approach.runMs,
          ease: 'Linear',
          onUpdate: () => {
            if (token === this.sequenceToken) this._updateApproach(action, clock.t);
          }
        });
      } else if (!action.reducedMotion) {
        this.actState.lunge = -1.4;
        this.actState.tilt = -0.012;
        this.applyTransform();
        action.previousVisual = this.snapshotSprite();
        this._tweenAct({
          lunge: -2.4,
          lift: 0.5,
          tilt: -0.026,
          duration: timing.ready ?? ACTION_HOLDS.ready,
          ease: 'Quad.easeIn'
        }, token);
      }
      if (this.sprite.play) this.sprite.play(clipKey);
      else this.sprite.anims.play(clipKey);
      return this;
    }

    // Timer fallback for sprites without an animation component.
    const fallback = actionTimingFor(this.characterId);
    if (!action.reducedMotion) {
      this.actState.lunge = -1.4;
      this.actState.tilt = -0.012;
      this.applyTransform();
      this._tweenAct({
        lunge: -2.4,
        lift: 0.5,
        tilt: -0.026,
        duration: fallback.holds.ready,
        ease: 'Quad.easeIn'
      }, token);
    }
    this._after(fallback.at.ready, token, () => {
      this.setPose('windup');
      this.enterWindupFrame(action);
    });
    this._after(fallback.at.windup, token, () => {
      this.setPose('strike');
      this.enterStrikeFrame(action);
    });
    this._after(fallback.at.strike, token, () => {
      this.setPose('follow');
      this.enterFollowFrame(action);
    });
    this._after(fallback.at.follow, token, () => {
      this.setPose('recover');
      this.enterRecoveryFrame(action);
    });
    this._after(fallback.at.recover, token, () => {
      this.setPose('watch');
      this.enterWatchFrame(action);
    });
    this._after(fallback.complete, token, () => this.finishActionAnimation());
    return this;
  }

  // Between attempts the striker walks back to his mark - the free-kick
  // ritual - instead of teleporting there. The player may swipe at any
  // point; the run-up then simply starts from wherever he has got to.
  returnToMark(mark, { duration = 560 } = {}) {
    if (!mark) return this;
    this.cancelSequence();
    const token = this.sequenceToken;
    const from = { x: this.x, y: this.y, scale: this.scale };
    const distance = Math.hypot(mark.x - from.x, mark.y - from.y);
    const settle = () => {
      this.setStance(mark);
      this.actState.lift = 0;
      this.setPose('idle');
      this.resumeAmbient();
    };
    if (this.reducedMotion || distance < 1.5 || !this.scene.tweens?.add) {
      settle();
      return this;
    }
    this.pauseAmbient();
    const steps = Math.max(2, Math.round(distance / 12));
    const clock = { t: 0 };
    this.approachTween = this.scene.tweens.add({
      targets: clock,
      t: 1,
      duration: Math.min(900, duration * Math.max(0.75, distance / 55)),
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        if (token !== this.sequenceToken) return;
        const t = clock.t;
        this.x = lerp(from.x, mark.x, t);
        this.y = lerp(from.y, mark.y, t);
        this.scale = lerp(from.scale, mark.scale ?? from.scale, t);
        const phase = (t * steps) % 1;
        const pose = phase < 0.5 ? 'recover' : 'idle';
        if (pose !== this.pose) {
          this.pose = pose;
          this.flip = false;
          this.applyPoseTexture();
        } else {
          this.refreshVisualScale();
        }
        this.actState.lift = -0.8 * Math.abs(Math.sin(Math.PI * phase * 2));
        this.applyTransform();
      },
      onComplete: () => {
        if (token !== this.sequenceToken) return;
        this.approachTween = null;
        settle();
      }
    });
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

  // Goal celebration: crouch, spring, land, and (for the lighter strikers) a
  // second smaller hop - squash on every take-off and landing so the jump
  // reads as weight rather than a sprite sliding up and down.
  celebrate(duration = 850) {
    this.cancelSequence();
    const token = this.sequenceToken;
    this.pauseAmbient();
    this.setPose('celebrate');
    const finish = () => {
      if (token !== this.sequenceToken) return;
      this.scene.tweens.killTweensOf(this.actState);
      this.actState.lift = 0;
      this.actState.lunge = 0;
      this.actState.tilt = 0;
      this.actState.squashX = 1;
      this.actState.squashY = 1;
      this.setPose('idle');
      this.resumeAmbient();
    };
    if (this.reducedMotion) {
      this._after(duration, token, finish);
      return this;
    }
    const motion = CELEBRATION_MOTION[this.characterId] ?? CELEBRATION_MOTION['character-mica'];
    const lean = this.characterId === 'character-agile-winger' ? 0.07 : -0.03;
    const crouch = 70;
    const land = 60;
    const settle = 110;
    const secondAir = Math.round(motion.air * 0.7);
    const secondHop = motion.hops > 1 &&
      duration >= crouch + motion.air + land + settle + secondAir + land + 120;

    // Anticipation.
    this._tweenAct({ lift: 1.2, squashX: 1.08, squashY: 0.9, duration: crouch, ease: 'Quad.easeOut' }, token);
    // Take-off: stretch on the way up, ease into the apex.
    this._after(crouch, token, () => {
      this.actState.squashX = 0.94;
      this.actState.squashY = 1.08;
      this._tweenAct({
        lift: motion.lift, lunge: motion.lunge, tilt: lean, squashX: 1, squashY: 1,
        duration: motion.air * 0.5, ease: 'Quad.easeOut'
      }, token);
    });
    // Fall back to the turf.
    this._after(crouch + motion.air * 0.5, token, () => {
      this._tweenAct({
        lift: 0, tilt: lean * 0.4, squashX: 0.97, squashY: 1.04,
        duration: motion.air * 0.5, ease: 'Quad.easeIn'
      }, token);
    });
    // Landing squash and settle.
    const landedAt = crouch + motion.air;
    this._after(landedAt, token, () => {
      this.actState.lift = 0.8;
      this.actState.squashX = 1.1;
      this.actState.squashY = 0.9;
      this.applyTransform();
      this._tweenAct({ lift: 0, squashX: 1, squashY: 1, tilt: 0, duration: land + settle, ease: 'Back.easeOut' }, token);
    });
    if (secondHop) {
      const hopAt = landedAt + land + settle;
      this._after(hopAt, token, () => {
        this.actState.squashX = 0.96;
        this.actState.squashY = 1.05;
        this._tweenAct({
          lift: motion.lift * 0.45, tilt: lean * 0.6, squashX: 1, squashY: 1,
          duration: secondAir * 0.5, ease: 'Quad.easeOut'
        }, token);
      });
      this._after(hopAt + secondAir * 0.5, token, () => {
        this._tweenAct({ lift: 0, tilt: 0, duration: secondAir * 0.5, ease: 'Quad.easeIn' }, token);
      });
      this._after(hopAt + secondAir, token, () => {
        this.actState.squashX = 1.06;
        this.actState.squashY = 0.94;
        this.applyTransform();
        this._tweenAct({ squashX: 1, squashY: 1, duration: land + 60, ease: 'Back.easeOut' }, token);
      });
    }
    this._after(duration, token, finish);
    return this;
  }

  setVisible(value) {
    this.sprite?.setVisible(value);
    this.shadow?.setVisible(value);
    if (!value) {
      this.ghost?.setVisible(false);
      this.smearGfx?.setVisible?.(false);
    }
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
    if (this.smearGfx) {
      this.scene.tweens.killTweensOf(this.smearGfx);
      this.smearGfx.destroy?.();
      this.smearGfx = null;
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
