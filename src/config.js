// Global tuning constants. All world units are "game meters" (slightly
// exaggerated vs real football so shots read well on a small screen).
// Gameplay stays in a compact 480x270 coordinate system, while Phaser renders
// to a true 1920x1080 Full-HD backing canvas. The 4x camera preserves physics and layout
// maths while giving text and high-density sprites a full-resolution grid.

export const GAME_W = 480;
export const GAME_H = 270;
export const RENDER_SCALE = 4;
export const RENDER_W = GAME_W * RENDER_SCALE;
export const RENDER_H = GAME_H * RENDER_SCALE;

// Pseudo-3D camera: x = lateral, y = up, z = depth away from camera.
export const CAM = {
  focal: 260,     // pixels per meter at 1m depth
  height: 2.3,    // camera height above the pitch
  horizonY: 95,   // screen y of the horizon line
  ballDist: 6.5,  // camera sits this far behind the ball
  x: 0            // lateral camera position, set per level
};

export const GOAL_W = 9.0;   // goal frame width
export const GOAL_H = 3.1;   // crossbar height
export const POST_R = 0.13;  // post thickness

export const BALL_R = 0.26;
export const PLAYER_H = 2.0; // wall defender height
export const WALL_DIST = 9.15;

export const PHYS = {
  gravity: 9.81,
  drag: 0.10,          // linear air drag per second, applied to full air-relative velocity
  magnus: 0.25,        // sidespin coefficient; lateral accel scales with forward speed
  spinDecay: 0.32,     // exponential decay per second
  bounce: 0.42,
  impactFriction: 0.92,
  groundImpactMin: 1.1,
  rollingDrag: 0.62,   // exponential rolling resistance per second
  stopSpeed: 0.16,
  fixedStep: 1 / 120,
  maxSubsteps: 12,
  maxFrameDt: 0.10,
  netDrag: 4.8,
  netBounce: 0.13,
  wind: { x: 0, y: 0, z: 0 }
};

export const SHOT = {
  minVz: 15,
  maxVz: 30,
  vxPerPx: 0.060,   // lateral m/s per horizontal swipe pixel (480px logical space)
  maxVx: 11.5,
  vyPerPx: 0.052,   // vertical m/s per vertical swipe pixel
  minVy: 1.8,
  maxVy: 11.5,
  maxSpin: 1.0,
  spinPx: 22,
  minSpeedPxMs: 0.10,
  maxSpeedPxMs: 0.68,
  maxSamples: 32,
  resampleCount: 12,
  minSwipePx: 22    // shorter swipes are ignored
};

// Project world (x, y, z) to screen. z must be > 0.
export function project(x, y, z) {
  const s = CAM.focal / z;
  return {
    x: GAME_W / 2 + (x - CAM.x) * s,
    y: CAM.horizonY + (CAM.height - y) * s,
    s
  };
}
