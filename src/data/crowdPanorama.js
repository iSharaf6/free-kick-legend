export const CROWD_PANORAMA = Object.freeze({
  textureKey: 'crowd-panorama-v3',
  assetPath: 'assets/hd/crowd-panorama-v3-clean.png',
  sourceCrop: Object.freeze({ x: 4, y: 273, width: 1819, height: 308 }),
  tileWidth: 240,
  tileHeight: 55,
  baselineY: 83
});

export const CROWD_MOTION = Object.freeze({
  ambientLifts: Object.freeze([0, 1, 0, 0, 1, 0, 0, 0]),
  ambientFrameMs: 240,
  goalLifts: Object.freeze([2, 0, 2, 1, 2, 0]),
  goalFrameMs: 90
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
