import { GAME_W, project, PLAYER_H, BALL_R, PHYS } from '../config.js';
import { PuppetRig, PUPPET_HEIGHT } from './PuppetRig.js';

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
// A well-timed low shot can sneak under a jumping wall.
export class Wall {
  constructor(scene, count, zWall, centerX, options = {}) {
    this.scene = scene;
    this.z = zWall;
    this.centerX = centerX;
    this.jumped = false;
    this.clock = 0;
    this.rng = typeof options === 'function' ? options : options?.rng;
    this.puppetsEnabled = Boolean(
      scene.matter?.add &&
      scene.textures?.exists?.('puppet-wall-torso') &&
      options?.puppets !== false
    );
    this.groundBody = null;
    if (this.puppetsEnabled) {
      const groundY = project(centerX, 0, zWall).y + 3;
      this.groundBody = scene.matter.add.rectangle(GAME_W / 2, groundY + 5, GAME_W + 80, 10, {
        isStatic: true,
        label: 'puppet-ground:wall',
        friction: 0.9,
        restitution: 0.02
      });
    }
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
      const screen = project(x, 0, zWall);
      const rig = this.puppetsEnabled
        ? new PuppetRig(scene, {
            kind: 'wall',
            x: screen.x,
            y: screen.y,
            scale: (screen.s * build.height) / PUPPET_HEIGHT,
            depth: 1000 - zWall * 10,
            pose: 'wall-idle',
            phase: i * 0.72,
            autoResetDelay: 0.72
          })
        : null;
      if (rig) spr.setVisible(false);
      this.players.push({ x, jumpY: 0, vy: 0, jumpSpeed, spr, rig, index: i, ...build });
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
    for (const p of this.players) p.rig?.update(boundedDt);
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
    }
  }

  draw() {
    for (const p of this.players) {
      const pos = project(p.x, p.jumpY, this.z);
      p.spr.setPosition(pos.x, pos.y);
      const textureH = p.spr.texture?.source?.[0]?.height || 28;
      p.spr.setScale((pos.s * p.height) / textureH);
      p.spr.setDepth(1000 - this.z * 10);
      if (p.rig?.isControlled) {
        p.rig.setPose({
          x: pos.x,
          y: pos.y,
          root: null,
          pose: p.jumpY > 0 ? 'wall-jump' : 'wall-idle',
          phase: this.clock * 2.1 + p.index * 0.72
        });
      }
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
    if (!p?.rig) return false;
    const screen = project(pt.x, pt.y, this.z);
    const side = Math.sign(pt.x - p.x) || Math.sign(ball?.vx) || 1;
    const impulse = {
      x: Math.max(-4.2, Math.min(4.2, (ball?.vx || 0) * 0.22 + side * 0.8)),
      y: Math.max(-4.2, Math.min(1, -(Math.abs(ball?.vy || 0) * 0.15 + Math.abs(ball?.vz || 0) * 0.035 + 0.5)))
    };
    p.rig.triggerRagdoll(screen, impulse);
    const standing = project(p.x, 0, this.z);
    p.rig.setPose({
      x: standing.x,
      y: standing.y,
      root: null,
      pose: 'wall-idle',
      phase: this.clock * 2.1 + p.index * 0.72
    });
    return true;
  }

  destroy() {
    for (const p of this.players) {
      p.rig?.destroy();
      p.spr.destroy();
    }
    if (this.groundBody) this.scene.matter?.world?.remove(this.groundBody, true);
    this.groundBody = null;
    this.players = [];
  }
}
