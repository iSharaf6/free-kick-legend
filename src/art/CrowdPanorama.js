import {
  CROWD_MOTION,
  CROWD_PANORAMA,
  CROWD_SETS,
  getCrowdTilePositions
} from '../data/crowdPanorama.js';

export function addAnimatedCrowdPanorama(scene, {
  depth = 2,
  reducedMotion = false,
  tint = null
} = {}) {
  const { tileWidth, tileHeight, baselineY } = CROWD_PANORAMA;
  const tiles = getCrowdTilePositions(480, tileWidth, 0).map((x, index) => {
    const tile = scene.add.sprite(x, baselineY, CROWD_SETS[index].textureKey, 0)
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
        phase = (phase + 1) % CROWD_MOTION.ambientFrames.length;
        tiles.forEach((tile, index) => {
          if (!tile.active) return;
          const pose = CROWD_MOTION.ambientFrames[
            (phase + index) % CROWD_MOTION.ambientFrames.length
          ];
          tile.setFrame(pose);
        });
      }
    });
  }

  return tiles;
}
