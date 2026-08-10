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

// The authored stadium meets the turf below the camera's mathematical
// vanishing line. Keeping those two values separate lets the goal, wall and
// striker sit high in the cinematic frame while the crowd and advertising
// boards still occupy a substantial upper tier.
//
// This value is also what decides how much daylight there is behind the goal.
// The ground between the goal line and the hoardings projects into the band
// between the goal's foot and this seam, so at 104 that band was under four
// logical pixels on a long-range level and the goal frame appeared to be
// bolted to the advertising. Raising the seam pushes the boards back - they
// stand at the depth that projects the ground to this line, so they move from
// roughly 26m to 33m - and roughly triples the visible turf behind the net.
//
// Everything anchored to the seam (hoardings, stewards, photographers' pit,
// the stand tiers) is expressed as an offset from it rather than as its own
// literal, so the whole trackside moves together and cannot drift apart.
export const STADIUM_Y = 98;

// Pseudo-3D camera: x = lateral, y = up, z = depth away from camera.
export const CAM = {
  focal: 316,     // pixels per meter at 1m depth - tighter framing so the
                  // goal, keeper and wall read big instead of miniature
  height: 2.3,    // camera height above the pitch
  horizonY: 76,   // mathematical vanishing line (stadium/pitch seam is STADIUM_Y)
  ballDist: 5.7,  // camera sits this far behind the ball
  x: 0            // lateral camera position, set per level
};

// The scoring area is deliberately a touch wider than the wall's reach. At 9.0m
// a five-man wall covered so much of the frame that the goal stopped reading as
// the biggest object in the shot.
export const GOAL_W = 9.4;   // goal frame width
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
  netDrag: 1.5,
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
  // A normal decisive flick used to hit the ceiling almost immediately: even
  // a minimum-length 26px logical gesture could read 95% power. Preserve the
  // speed-based control, but give touch and mouse players a useful middle
  // third before only genuinely fast releases reach maximum power.
  maxSpeedPxMs: 1.35,
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
