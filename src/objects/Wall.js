import { project, PLAYER_H, BALL_R, PHYS } from '../config.js';
import { getWallPoseOffsets, normalizeWallConfig } from '../systems/LevelMechanics.js';

const SPACING = 0.64;      // shoulder-to-shoulder without sealing the goal
const JUMP_GRAVITY = 11;
const IMPACT_FLASH_SECONDS = 0.095;
const COLLAPSE_SECONDS = 0.62;
const COLLAPSE_FRAMES = 6;
const PLANE_TOLERANCE = 0.08;
const DEFLECTOR_RAMP_SECONDS = 0.14;
const DEFLECTOR_READY_LEAD_SECONDS = 0.04;
const DEFLECTOR_FALLBACK_ETA = 0.22;

// Do not raise this to buy a wider gap underneath.
//
// It was briefly 3.8, on the evidence that the total share of blocked shots
// did not move (19.5% either way). That number was hiding a straight trade:
// bucketing the blocked shots by the ball's height at the wall showed -5,624
// in the 0.0-0.8m bands and +5,762 in the 2.4-2.8m band. The extra leap paid
// for the ground route by eating the chip over the wall into the top corner,
// which is the shot this game is about. Aggregates are not enough here; check
// the distribution by height before touching it.
const JUMP_SPEED_BASE = 3.55;

function deterministicJumpSpeed(index, count) {
  // Stable variation keeps the silhouettes organic without making an
  // identical shot change outcome between retries or replay recordings.
  const bucket = (index * 37 + count * 17 + 11) % 9;
  return JUMP_SPEED_BASE + bucket * 0.075;
}

// Collision box measured from the shipped defender art rather than guessed.
// defender-hd.png is a 77x204 canvas whose opaque body occupies rows 8..195
// and whose median row is 50px wide; the sprite is drawn so the whole canvas
// spans `height`, which makes one canvas pixel height/204 world metres.
//
// This matters beyond tidiness. The old box ran from the defender's feet to
// the full canvas height and was 0.48-0.54m wide, so it claimed the 9px of
// transparent padding under the boots and a chunk of empty air above the head.
// Since contact also inflates by the ball's radius, that padding was the
// difference between a low drive sliding under a jumping wall and being
// blocked by nothing.
const SPRITE_HEIGHT_PX = 204;
const BODY_TOP_PX = 8;
const BODY_BOTTOM_PX = 195;
const BODY_WIDTH_PX = 50;
const BODY_FOOT_RATIO = (SPRITE_HEIGHT_PX - BODY_BOTTOM_PX) / SPRITE_HEIGHT_PX;
const BODY_HEAD_RATIO = (SPRITE_HEIGHT_PX - BODY_TOP_PX) / SPRITE_HEIGHT_PX;
const BODY_HALF_WIDTH_RATIO = BODY_WIDTH_PX / SPRITE_HEIGHT_PX / 2;

function deterministicBuild(index, count) {
  const bucket = (index * 29 + count * 13 + 5) % 7;
  // Keep natural build variation without turning the shortest defenders into
  // children beside a farther-away goalkeeper. Trimmed ~7% from the old build so
  // the wall stops out-massing the goal it is standing in front of.
  const heightFactor = 0.855 + bucket * 0.017;
  const height = PLAYER_H * heightFactor;
  return {
    height,
    // A hair of per-defender variation on top of the measured torso width.
    halfWidth: height * BODY_HALF_WIDTH_RATIO * (0.97 + (bucket % 3) * 0.03),
    footY: height * BODY_FOOT_RATIO,
    headY: height * BODY_HEAD_RATIO
  };
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Ease a committed deflector from planted stance to full reach shortly before
 * the predicted wall crossing. The value drives both drawing and contact, so a
 * visible leg never disagrees with the collision envelope.
 */
export function deflectorExtensionProgress(elapsedSeconds, wallEta, active = true) {
  if (!active) return 0;
  const elapsed = Math.max(0, finite(elapsedSeconds));
  const suppliedEta = wallEta == null ? Number.NaN : Number(wallEta);
  const arrival = Number.isFinite(suppliedEta) && suppliedEta >= 0
    ? suppliedEta
    : DEFLECTOR_FALLBACK_ETA;
  const readyAt = Math.max(0, arrival - DEFLECTOR_READY_LEAD_SECONDS);
  const startsAt = Math.max(0, readyAt - DEFLECTOR_RAMP_SECONDS);
  if (readyAt <= startsAt + 1e-9) return elapsed >= readyAt ? 1 : 0;
  const linear = Math.max(0, Math.min(1, (elapsed - startsAt) / (readyAt - startsAt)));
  return linear * linear * (3 - 2 * linear);
}

function stableUnitInterval(parts) {
  // FNV-1a over a deliberately ordered signature. This keeps deflector
  // decisions identical in retries/replays without consuming gameplay RNG.
  const signature = parts.map((part) => String(part ?? '')).join('|');
  let hash = 0x811c9dc5;
  for (let index = 0; index < signature.length; index++) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

function resolveConstructorConfig(countOrConfig, options) {
  const optionBag = typeof options === 'function'
    ? { rng: options }
    : (options && typeof options === 'object' ? options : {});
  const legacyCount = typeof countOrConfig === 'object'
    ? finite(countOrConfig?.count)
    : finite(countOrConfig);
  const authored = typeof countOrConfig === 'object'
    ? countOrConfig
    : (
        optionBag.config ??
        optionBag.wallConfig ??
        optionBag.mechanic ??
        (optionBag.type ? optionBag : null)
      );
  const requestedType = String(authored?.type ?? 'standard').toLowerCase();
  const type = requestedType === 'stagger' || requestedType === 'staggered'
    ? 'double'
    : requestedType;
  const config = normalizeWallConfig({
    ...(authored || {}),
    type,
    count: authored?.count ?? legacyCount
  }, legacyCount);
  return { config, optionBag };
}

// The defensive wall: a row of defenders that jumps as the ball arrives.
// A well-timed low shot can sneak under a jumping wall. Rendered with the
// authored HD defender sprite; a block knocks the hit man into a flinch.
export class Wall {
  constructor(scene, countOrConfig, zWall, centerX, options = {}) {
    const { config, optionBag } = resolveConstructorConfig(countOrConfig, options);
    this.scene = scene;
    this.config = config;
    this.style = config.type;
    this.count = config.count;
    this.baseZ = zWall;
    this.z = zWall;
    this.centerX = centerX;
    this.jumped = false;
    this.clock = 0;
    this.mechanicElapsed = 0;
    this.struck = false;
    this.strikeElapsed = 0;
    this.deflectorActive = false;
    this.deflectorEta = null;
    this.deflectorProgress = 0;
    this._strikeStartedAt = 0;
    this._shotContext = null;
    this.rng = optionBag.rng;
    this.players = [];
    const initialPoses = getWallPoseOffsets(config, 0, { spacing: SPACING });
    for (let i = 0; i < config.count; i++) {
      const pose = initialPoses[i] || { x: 0, z: 0, row: 0, role: 'wall', legExtension: 0 };
      const hd = Boolean(scene.textures?.exists?.('defender-hd'));
      const baseTexture = hd ? 'defender-hd' : (i % 2 ? 'defender2' : 'defender');
      const spr = scene.add.sprite(0, 0, baseTexture)
        .setOrigin(0.5, 1)
        .setFlipX(hd && i % 2 === 1);
      const jumpSpeed = this.rng
        ? JUMP_SPEED_BASE + Math.max(0, Math.min(1, Number(this.rng()) || 0)) * 0.60
        : deterministicJumpSpeed(i, config.count);
      const build = deterministicBuild(i, config.count);
      this.players.push({
        x: centerX + pose.x,
        z: zWall + pose.z,
        prevX: centerX + pose.x,
        prevZ: zWall + pose.z,
        localX: pose.x,
        localZ: pose.z,
        row: pose.row,
        role: pose.role,
        legExtension: pose.legExtension,
        deflectorDir: i % 2 ? -1 : 1,
        jumpY: 0, vy: 0, jumpSpeed, spr, baseTexture, index: i,
        flinch: 0, flinchDir: 1, landSquash: 0,
        flashTime: 0,
        collapsing: false, collapseTime: 0,
        ...build
      });
    }
    this.rowMetadata = this.getCollisionPlanes().map(({ id, row, z, players }) => ({
      id,
      row,
      zOffset: z - this.baseZ,
      count: players.length
    }));
    this.draw();
  }

  jump(planeZ = null) {
    const candidates = Number.isFinite(planeZ)
      ? this.players.filter((player) => Math.abs(player.z - planeZ) <= PLANE_TOLERANCE)
      : this.players;
    if (!candidates.length || candidates.every((player) => player.vy !== 0 || player.jumpY > 0)) {
      return false;
    }
    this.jumped = true;
    for (const player of candidates) {
      if (player.vy === 0 && player.jumpY === 0) player.vy = player.jumpSpeed;
    }
    return true;
  }

  /**
   * Mark the shot as struck and start this wall's shot clock. The wall holds
   * its authored distance from the ball for the whole flight; the only thing a
   * strike decides is whether a deflector commits its leg.
   */
  onStrike(shotContext = {}) {
    if (this.struck) return false;
    this.struck = true;
    this.strikeElapsed = 0;
    this._strikeStartedAt = this.mechanicElapsed;
    this._shotContext = shotContext;

    if (this.style === 'deflector') {
      const forced = shotContext.deflectorActive;
      const sample = stableUnitInterval([
        shotContext.seed,
        shotContext.attempt,
        shotContext.levelId,
        shotContext.targetX,
        shotContext.vx,
        this.config.defenderIndex,
        this.config.count
      ]);
      this.deflectorActive = forced == null
        ? sample < this.config.extensionChance
        : Boolean(forced);
      const prediction = shotContext.wallPrediction ?? shotContext.ball?.predictAt?.(this.baseZ);
      const predictedEta = Number(shotContext.wallEta ?? prediction?.T);
      this.deflectorEta = Number.isFinite(predictedEta) && predictedEta >= 0
        ? predictedEta
        : null;
      const player = this.players[this.config.defenderIndex];
      if (player) {
        const targetX = finite(
          shotContext.targetX ??
          shotContext.x ??
          shotContext.ball?.x,
          player.x + (player.index % 2 ? -1 : 1)
        );
        player.deflectorDir = Math.sign(targetX - player.x) || (player.index % 2 ? -1 : 1);
      }
    }
    return true;
  }

  /**
   * Apply an authored pose at an absolute scene time. Movement derives from
   * elapsedSeconds rather than accumulated tweens/timers, so it is replay and
   * frame-rate deterministic.
   */
  updateMechanic(elapsedSeconds, dt = 0, shotContext = {}) {
    const elapsed = Math.max(0, finite(elapsedSeconds, this.mechanicElapsed));
    if (shotContext.struck === true && !this.struck) this.onStrike(shotContext);

    this.mechanicElapsed = elapsed;
    this.strikeElapsed = this.struck
      ? Math.max(0, elapsed - this._strikeStartedAt)
      : 0;
    this.deflectorProgress = deflectorExtensionProgress(
      this.strikeElapsed,
      this.deflectorEta,
      this.deflectorActive
    );
    const poses = getWallPoseOffsets(this.config, elapsed, {
      spacing: SPACING,
      deflectorActive: this.deflectorActive,
      deflectorProgress: this.deflectorProgress
    });

    for (let index = 0; index < this.players.length; index++) {
      const player = this.players[index];
      const pose = poses[index];
      if (!pose) continue;
      player.prevX = player.x;
      player.prevZ = player.z;
      player.localX = pose.x;
      player.localZ = pose.z;
      player.x = this.centerX + pose.x;
      player.z = this.baseZ + pose.z;
      player.row = pose.row;
      player.role = pose.role;
      player.legExtension = pose.legExtension;
    }
    this.z = this.baseZ;
    return this;
  }

  update(dt, elapsedSeconds = null, shotContext = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const boundedDt = Math.min(dt, PHYS.maxFrameDt);
    const mechanicTime = Number.isFinite(elapsedSeconds)
      ? elapsedSeconds
      : this.mechanicElapsed + boundedDt;
    this.updateMechanic(mechanicTime, boundedDt, shotContext);
    this.clock += boundedDt;
    const steps = Math.min(
      PHYS.maxSubsteps,
      Math.max(1, Math.ceil(boundedDt / PHYS.fixedStep - 1e-8))
    );
    const stepDt = boundedDt / steps;
    for (let i = 0; i < steps; i++) this.step(stepDt);
    this.draw();
  }

  step(dt = PHYS.fixedStep) {
    for (const p of this.players) {
      if (p.vy !== 0 || p.jumpY > 0) {
        p.vy -= JUMP_GRAVITY * dt;
        p.jumpY += p.vy * dt;
        if (p.jumpY <= 0) {
          p.jumpY = 0;
          p.vy = 0;
          // Touchdown: a brief squash sells the weight of the landing.
          p.landSquash = 1;
        }
      }
      if (p.flinch > 0) p.flinch = Math.max(0, p.flinch - dt * 2.4);
      if (p.collapsing) p.collapseTime = Math.min(COLLAPSE_SECONDS, p.collapseTime + dt);
      if (p.landSquash > 0) p.landSquash = Math.max(0, p.landSquash - dt * 6);
      if (p.flashTime > 0) {
        p.flashTime = Math.max(0, p.flashTime - dt);
        if (p.flashTime === 0) p.spr?.clearTint?.();
      }
    }
  }

  draw() {
    for (const p of this.players) {
      const pos = project(p.x, p.jumpY, p.z);
      p.spr.setPosition(pos.x, pos.y);
      if (p.collapsing && this.scene.textures?.exists?.('defender-collapse-hd')) {
        const progress = Math.min(p.collapseTime / COLLAPSE_SECONDS, 0.9999);
        p.spr.setTexture('defender-collapse-hd', Math.min(COLLAPSE_FRAMES - 1, Math.floor(progress * COLLAPSE_FRAMES)));
      }
      const textureH = p.spr.texture?.source?.[0]?.height || 28;
      const baseScale = (pos.s * p.height) / textureH;
      // Impact flinch tips the hit defender from the boots; a faint idle sway
      // keeps the line alive while they wait on the whistle.
      const sway = p.collapsing || p.jumpY > 0 ? 0 : Math.sin(this.clock * 1.5 + p.index * 0.9) * 0.012;
      const lean = p.collapsing ? 0 : p.flinchDir * p.flinch * 0.32;
      const deflectLean = p.deflectorDir * p.legExtension * 0.13;
      p.spr.setRotation?.(sway + lean - deflectLean);
      // Smear the jump: elongate with upward velocity, squash on touchdown.
      // Frozen frames look stretched; in motion they read as explosive hops.
      const rise = p.jumpY > 0 ? Math.min(Math.max(p.vy, 0) * 0.05, 0.16) : 0;
      const squash = (p.landSquash || 0) * 0.16;
      if (p.collapsing) p.spr.setScale(baseScale);
      else {
        p.spr.setScale(
          baseScale * (1 - rise * 0.55 + squash * 0.7 + p.legExtension * 0.08),
          baseScale * (1 + rise - squash) * (1 - p.flinch * 0.07)
        );
      }
      p.spr.setDepth(1000 - p.z * 10);
    }
  }

  getCollisionPlanes() {
    const groups = new Map();
    for (const player of this.players) {
      const key = Math.round(player.z * 10000);
      if (!groups.has(key)) {
        groups.set(key, {
          id: `wall-row-${player.row}`,
          row: player.row,
          prevZ: Number.isFinite(player.prevZ) ? player.prevZ : player.z,
          z: player.z,
          players: []
        });
      }
      groups.get(key).players.push(player);
    }
    return [...groups.values()].sort((left, right) => left.z - right.z);
  }

  getPlaneZs() {
    return this.getCollisionPlanes().map((plane) => plane.z);
  }

  getPoseSnapshot() {
    return this.players.map((player) => ({
      index: player.index,
      row: player.row,
      role: player.role,
      x: player.x,
      z: player.z,
      legExtension: player.legExtension
    }));
  }

  _contactPlayer(player, pt) {
    // The body, not the canvas: footY/headY are the defender's actual boots and
    // head, so a ball can pass through the padding the sprite carries.
    const footY = player.jumpY + player.footY;
    const headY = player.jumpY + player.headY;
    const overlapsX = Math.abs(pt.x - player.x) < player.halfWidth + BALL_R;
    const overlapsY = pt.y + BALL_R > footY && pt.y - BALL_R < headY;
    if (overlapsX && overlapsY) return { player, index: player.index, part: 'body' };

    if (player.legExtension > 0) {
      const hipX = player.x + player.deflectorDir * player.halfWidth * 0.45;
      const footX = player.x + player.deflectorDir * (player.halfWidth + player.legExtension);
      const minX = Math.min(hipX, footX) - BALL_R;
      const maxX = Math.max(hipX, footX) + BALL_R;
      const legBottom = footY + 0.08;
      const legTop = footY + Math.min(0.88, player.height * 0.48);
      const hitsLegX = pt.x > minX && pt.x < maxX;
      const hitsLegY = pt.y + BALL_R > legBottom && pt.y - BALL_R < legTop;
      if (hitsLegX && hitsLegY) return { player, index: player.index, part: 'leg' };
    }
    return null;
  }

  // pt = interpolated {x, y} where the ball pierced the wall plane.
  contact(pt, planeZ = null) {
    const candidates = Number.isFinite(planeZ)
      ? this.players.filter((player) => Math.abs(player.z - planeZ) <= PLANE_TOLERANCE)
      : this.players;
    for (const player of candidates) {
      const result = this._contactPlayer(player, pt);
      if (result) {
        return {
          ...result,
          row: player.row,
          planeZ: player.z
        };
      }
    }
    return null;
  }

  contactAtZ(pt, planeZ, tolerance = PLANE_TOLERANCE) {
    const candidates = this.players.filter((player) => Math.abs(player.z - planeZ) <= tolerance);
    for (const player of candidates) {
      const result = this._contactPlayer(player, pt);
      if (result) {
        return {
          ...result,
          row: player.row,
          planeZ: player.z
        };
      }
    }
    return null;
  }

  blocks(pt, planeZ = null) {
    return Boolean(this.contact(pt, planeZ));
  }

  impact(contact, pt, ball, options = {}) {
    const p = contact?.player || this.players[contact?.index];
    if (!p) return false;
    p.flinch = 1;
    p.flinchDir = Math.sign(ball?.vx || pt.x - p.x || 1) || 1;
    // A mid-air hit chops the jump so the defender drops with the deflection,
    // but retains the current root. The collapse atlas then travels to the turf
    // under the same fixed-step gravity instead of teleporting there on contact.
    if (p.jumpY > 0) p.vy = Math.min(p.vy, 0.4);
    p.spr.setTint?.(0xfff3c4);
    p.flashTime = IMPACT_FLASH_SECONDS;
    if (options.collapse && this.scene.textures?.exists?.('defender-collapse-hd')) {
      p.collapsing = true;
      p.collapseTime = 0;
    }
    return true;
  }

  resetMechanic() {
    this.clock = 0;
    this.mechanicElapsed = 0;
    this.struck = false;
    this.strikeElapsed = 0;
    this.deflectorActive = false;
    this.deflectorEta = null;
    this.deflectorProgress = 0;
    this._strikeStartedAt = 0;
    this._shotContext = null;
    this.jumped = false;
    for (const player of this.players) {
      player.jumpY = 0;
      player.vy = 0;
      player.flinch = 0;
      player.flinchDir = 1;
      player.landSquash = 0;
      player.flashTime = 0;
      player.collapsing = false;
      player.collapseTime = 0;
      player.spr?.setTexture?.(player.baseTexture);
      player.spr?.clearTint?.();
      player.spr?.setRotation?.(0);
    }
    this.updateMechanic(0);
    for (const player of this.players) {
      player.prevX = player.x;
      player.prevZ = player.z;
    }
    this.draw();
    return this;
  }

  reset() {
    return this.resetMechanic();
  }

  destroy() {
    for (const p of this.players) {
      p.spr?.clearTint?.();
      p.spr?.destroy?.();
    }
    this.players = [];
  }
}
