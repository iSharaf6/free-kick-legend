export const CROWD_PANORAMA = Object.freeze({
  frameWidth: 384,
  frameHeight: 216,
  frameCount: 5,
  tileWidth: 96,
  tileHeight: 54,
  baselineY: 95
});

export const CROWD_SETS = Object.freeze(Array.from({ length: 5 }, (_, index) => Object.freeze({
  textureKey: `crowd-set-${index + 1}`,
  assetPath: `assets/hd/crowd-set-${index + 1}-atlas.png`
})));

export const CROWD_MOTION = Object.freeze({
  ambientFrames: Object.freeze([0, 1, 0, 4]),
  ambientFrameMs: 420,
  goalFrames: Object.freeze([1, 2, 3, 2, 4, 0]),
  goalFrameMs: 105
});

export function getCrowdTilePositions(
  viewWidth,
  tileWidth = CROWD_PANORAMA.tileWidth,
  startX = 0
) {
  if (![viewWidth, tileWidth, startX].every(Number.isInteger) || tileWidth <= 0) {
    throw new TypeError('Crowd tiling requires positive integer dimensions and positions');
  }

  const positions = [];
  for (let x = startX; x < viewWidth; x += tileWidth) positions.push(x);
  return positions;
}
