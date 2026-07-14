import { project, PLAYER_H, BALL_R, PHYS } from '../config.js';

const SPACING = 0.58;      // shoulder-to-shoulder without sealing the goal
const JUMP_GRAVITY = 11;

function deterministicJumpSpeed(index, count) {
  // Stable variation keeps the silhouettes organic without making an
  // identical shot change outcome between retries or replay recordings.
  const bucket = (index * 37 + count * 17 + 11) % 9;
  return 3.55 + bucket * 0.075;
}

function deterministicBuild(index, count) {
  const bucket = (index * 29 + count * 13 + 5) % 7;
  const heightFactor = 0.86 + bucket * 0.028;
  return {
    height: PLAYER_H * heightFactor,
    halfWidth: 0.255 + (bucket % 3) * 0.018
  };
}

// The defensive wall: a row of defenders that jumps as the ball arrives.
// A well-timed low shot can sneak under a jumping wall. Rendered with the
// authored HD defender sprite; a block knocks the hit man into a flinch.
export class Wall {
  constructor(scene, count, zWall, centerX, options = {}) {
    this.scene = scene;
    this.z = zWall;
    this.centerX = centerX;
    this.jumped = false;
    this.clock = 0;
    this.rng = typeof options === 'function' ? options : options?.rng;
    this.players = [];
    for (let i = 0; i < count; i++) {
      const x = centerX + (i - (count - 1) / 2) * SPACING;
      const hd = Boolean(scene.textures?.exists?.('defender-hd'));
      const spr = scene.add.sprite(0, 0, hd ? 'defender-hd' : (i % 2 ? 'defender2' : 'defender'))
        .setOrigin(0.5, 1)
        .setFlipX(hd && i % 2 === 1);
      const jumpSpeed = this.rng
        ? 3.55 + Math.max(0, Math.min(1, Number(this.rng()) || 0)) * 0.60
        : deterministicJumpSpeed(i, count);
      const build = deterministicBuild(i, count);
      this.players.push({
        x, jumpY: 0, vy: 0, jumpSpeed, spr, index: i,
        flinch: 0, flinchDir: 1,
        ...build
      });
    }
    this.draw();
  }

  jump() {
    if (this.jumped) return;
    this.jumped = true;
    for (const p of this.players) p.vy = p.jumpSpeed;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const boundedDt = Math.min(dt, PHYS.maxFrameDt);
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
        }
      }
      if (p.flinch > 0) p.flinch = Math.max(0, p.flinch - dt * 2.4);
    }
  }

  draw() {
    for (const p of this.players) {
      const pos = project(p.x, p.jumpY, this.z);
      p.spr.setPosition(pos.x, pos.y);
      const textureH = p.spr.texture?.source?.[0]?.height || 28;
      const baseScale = (pos.s * p.height) / textureH;
      // Impact flinch tips the hit defender from the boots; a faint idle sway
      // keeps the line alive while they wait on the whistle.
      const sway = p.jumpY > 0 ? 0 : Math.sin(this.clock * 1.5 + p.index * 0.9) * 0.012;
      const lean = p.flinchDir * p.flinch * 0.32;
      p.spr.setRotation?.(sway + lean);
      p.spr.setScale(baseScale, baseScale * (1 - p.flinch * 0.07));
      p.spr.setDepth(1000 - this.z * 10);
    }
  }

  // pt = interpolated {x, y} where the ball pierced the wall plane.
  contact(pt) {
    for (let index = 0; index < this.players.length; index++) {
      const p = this.players[index];
      const footY = p.jumpY;
      const headY = p.jumpY + p.height;
      const overlapsX = Math.abs(pt.x - p.x) < p.halfWidth + BALL_R;
      const overlapsY = pt.y + BALL_R > footY && pt.y - BALL_R < headY;
      if (overlapsX && overlapsY) return { player: p, index };
    }
    return null;
  }

  blocks(pt) {
    return Boolean(this.contact(pt));
  }

  impact(contact, pt, ball) {
    const p = contact?.player || this.players[contact?.index];
    if (!p) return false;
    p.flinch = 1;
    p.flinchDir = Math.sign(ball?.vx || pt.x - p.x || 1) || 1;
    // A mid-air hit chops the jump so the defender drops with the deflection.
    if (p.jumpY > 0) p.vy = Math.min(p.vy, 0.4);
    p.spr.setTint?.(0xfff3c4);
    this.scene.time?.delayedCall?.(95, () => p.spr?.clearTint?.());
    return true;
  }

  destroy() {
    for (const p of this.players) p.spr.destroy();
    this.players = [];
  }
}
