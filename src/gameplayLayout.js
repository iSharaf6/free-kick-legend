import { GAME_H, GAME_W, RENDER_SCALE } from './config.js';

const freeze = (value) => Object.freeze(value);

export const REFERENCE_VIEWPORT = freeze({ width: 1664, height: 926 });

export const GAMEPLAY_LAYOUT = freeze({
  header: freeze({
    x: 4 / GAME_W,
    y: 2 / GAME_H,
    width: (GAME_W - 8) / GAME_W,
    height: 27 / GAME_H,
    exit: freeze({ x: 29 / GAME_W, y: 15 / GAME_H, width: 46 / GAME_W, height: 19 / GAME_H }),
    audio: freeze({ x: 61 / GAME_W, y: 15 / GAME_H, size: 18 / GAME_H }),
    titleX: 82 / GAME_W,
    eyebrowY: 8 / GAME_H,
    titleY: 20 / GAME_H,
    attemptsRightX: 0.86,
    attemptsY: 14.5 / GAME_H,
    attemptsGap: 11 / GAME_W,
    attemptDiameter: 9 / GAME_W,
    statusX: 0.68,
    chipX: 0.89,
    chipWidth: 58 / GAME_W,
    chipHeight: 18 / GAME_H
  }),
  objective: freeze({
    width: 0.61,
    height: 18 / GAME_H,
    bottom: 7 / GAME_H,
    labelInset: 11 / GAME_W,
    copyInset: 73 / GAME_W
  }),
  kicker: freeze({
    offsetX: -26 / GAME_W,
    offsetY: 10 / GAME_H,
    textureBoxHeight: 52,
    shadowScale: 1.89
  }),
  character: freeze({ foregroundOpaqueHeight: 49 }),
  wall: freeze({ minPlayers: 4, spacing: 0.72, distanceRatio: 0.62 }),
  crowd: freeze({ spriteBaseScale: 0.256 }),
  ball: freeze({ visualScale: 0.69 }),
  aimCone: freeze({ goalWidthFraction: 0.43, alpha: 0.032 })
});

const PERSPECTIVE_ANCHORS = freeze([
  freeze({ y: 0.40, scale: 0.44 }),
  freeze({ y: 0.47, scale: 0.53 }),
  freeze({ y: 0.54, scale: 0.68 }),
  freeze({ y: 0.82, scale: 1.00 })
]);

export function screenX(normalized) {
  return normalized * GAME_W;
}

export function screenY(normalized) {
  return normalized * GAME_H;
}

export function snapLogical(value) {
  return Math.round(value * RENDER_SCALE) / RENDER_SCALE;
}

// One feet-anchored perspective curve drives every human layer. The anchors
// correspond to upper seating, the close rail, the wall and the kicker.
export function perspectiveScale(y) {
  const normalizedY = y / GAME_H;
  if (normalizedY <= PERSPECTIVE_ANCHORS[0].y) return PERSPECTIVE_ANCHORS[0].scale;
  for (let index = 1; index < PERSPECTIVE_ANCHORS.length; index++) {
    const previous = PERSPECTIVE_ANCHORS[index - 1];
    const next = PERSPECTIVE_ANCHORS[index];
    if (normalizedY <= next.y) {
      const t = (normalizedY - previous.y) / (next.y - previous.y);
      return previous.scale + (next.scale - previous.scale) * t;
    }
  }
  return PERSPECTIVE_ANCHORS[PERSPECTIVE_ANCHORS.length - 1].scale;
}

export function pixelSafeSize(value, minimum = 1) {
  return Math.max(minimum, Math.round(value));
}
