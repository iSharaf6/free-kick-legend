import { CROWD_MOTION, CROWD_PANORAMA, getCrowdTilePositions } from '../data/crowdPanorama.js';

export function addAnimatedCrowdPanorama(scene, {
  depth = 2,
  reducedMotion = false,
  tint = null
} = {}) {
  const { textureKey, tileWidth, tileHeight, baselineY } = CROWD_PANORAMA;
  const tiles = getCrowdTilePositions(480, tileWidth, 0).map((x) => {
    const tile = scene.add.image(x, baselineY, textureKey)
      .setOrigin(0, 1)
      .setDisplaySize(tileWidth, tileHeight)
      .setDepth(depth);
    if (tint !== null) tile.setTint(tint);
    return tile;
  });

  if (!reducedMotion) {
    let phase = 0;
    scene.time.addEvent({
      delay: CROWD_MOTION.ambientFrameMs,
      loop: true,
      callback: () => {
        phase = (phase + 1) % CROWD_MOTION.ambientLifts.length;
        const lift = CROWD_MOTION.ambientLifts[phase];
        tiles.forEach((tile) => {
          if (tile.active) tile.setDisplaySize(tileWidth, tileHeight + lift);
        });
      }
    });
  }

  return tiles;
}
