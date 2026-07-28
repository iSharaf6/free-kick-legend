// Authored supporter panorama.
//
// The source art is a single 1819x308 strip (aspect 5.906). Every renderer must
// keep that ratio: the previous runtime drew it into 240x55 tiles (aspect 4.36),
// which squeezed each supporter to 74% of their width and made the whole stand
// look stretched vertically. Tier sizes below are therefore derived from the
// source aspect, not authored by eye, and `crowdTierAspectError` guards them.

const SOURCE_WIDTH = 1819;
const SOURCE_HEIGHT = 308;
const SOURCE_ASPECT = SOURCE_WIDTH / SOURCE_HEIGHT;

// Two tiers instead of one flat band. The far tier is smaller, higher and
// darker; the near tier is larger and sits on the advertising boards. That
// difference in scale is what reads as stadium depth, and it lets the crowd be
// desaturated as a group so the pitch, ball and hoops stay the bright layer.
const TIERS = Object.freeze([
  Object.freeze({
    id: 'far',
    tileWidth: 201,
    tileHeight: 34,
    baselineY: 51,
    startX: -63,     // deliberately out of phase with the near tier
    depth: 1.24,
    tint: 0x5d7183,
    alpha: 0.95,
    bobScale: 0.6
  }),
  Object.freeze({
    id: 'near',
    tileWidth: 290,
    tileHeight: 49,
    baselineY: 84,
    startX: -24,
    depth: 1.3,
    tint: 0x93a3b0,
    alpha: 1,
    bobScale: 1
  })
]);

export const CROWD_PANORAMA = Object.freeze({
  textureKey: 'crowd-panorama-v3',
  assetPath: 'assets/hd/crowd-panorama-v3-clean.png',
  sourceCrop: Object.freeze({ x: 4, y: 273, width: SOURCE_WIDTH, height: SOURCE_HEIGHT }),
  sourceWidth: SOURCE_WIDTH,
  sourceHeight: SOURCE_HEIGHT,
  sourceAspect: SOURCE_ASPECT,
  tiers: TIERS,
  // Single-tier consumers (menu backdrop) use the near tier verbatim.
  tileWidth: TIERS[1].tileWidth,
  tileHeight: TIERS[1].tileHeight,
  baselineY: TIERS[1].baselineY
});

// Vertical bob only. Nothing here may resize a tile: the previous ambient loop
// animated display height, which is exactly what made the crowd look stretched.
export const CROWD_MOTION = Object.freeze({
  ambientLifts: Object.freeze([0, 0, 1, 1, 0, 0, 1, 0]),
  ambientFrameMs: 240,
  goalLifts: Object.freeze([3, 1, 3, 2, 3, 1, 2, 0]),
  goalFrameMs: 90,
  // Each tile steps through the pattern from a different index so the stand
  // ripples rather than rising as one solid block.
  tilePhaseStride: 3
});

/**
 * Relative difference between a tier's rendered aspect and the source aspect.
 * Anything above ~1% is visible as squashed or stretched supporters.
 */
export function crowdTierAspectError(tier) {
  const width = Number(tier?.tileWidth);
  const height = Number(tier?.tileHeight);
  if (!(width > 0) || !(height > 0)) {
    throw new TypeError('Crowd tiers require positive tile dimensions');
  }
  return Math.abs(width / height - SOURCE_ASPECT) / SOURCE_ASPECT;
}

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
