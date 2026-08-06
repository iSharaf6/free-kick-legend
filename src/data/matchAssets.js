import { KEEPER_SHEETS, queueKeeperSheets } from './keeperAssets.js';

// Sprites that only ever appear once a match is on the pitch. They used to boot
// with the title screen, which put roughly 4.3 MB of goalkeeper and defender
// atlases in front of the main menu even for a player who only wanted to change
// their kit. The menu prefetches this pack in the background instead, so a
// match still starts instantly without holding the first paint hostage.
const MATCH_SPRITES = Object.freeze([
  Object.freeze({ key: 'defender-hd', file: 'defender-hd.png' }),
  Object.freeze({
    key: 'defender-collapse-hd',
    file: 'defender-collapse-sheet-hd.png',
    frameWidth: 256,
    frameHeight: 256
  }),
  Object.freeze({
    key: 'security-guards-hd',
    file: 'security-guards-sheet-hd.png',
    frameWidth: 88,
    frameHeight: 204
  })
]);

/**
 * Queue everything a match needs beyond the menu pack. Returns the number of
 * files added so callers can avoid starting an empty loader batch.
 */
export function queueMatchPack(scene) {
  const base = import.meta.env.BASE_URL;
  let queued = queueKeeperSheets(scene, { initial: true });

  for (const sprite of MATCH_SPRITES) {
    if (scene.textures?.exists?.(sprite.key)) continue;
    const path = `${base}assets/hd/${sprite.file}`;
    if (sprite.frameWidth) {
      scene.load.spritesheet(sprite.key, path, {
        frameWidth: sprite.frameWidth,
        frameHeight: sprite.frameHeight
      });
    } else {
      scene.load.image(sprite.key, path);
    }
    queued++;
  }

  return queued;
}

/**
 * Warm the browser's HTTP cache for the match pack without touching Phaser's
 * texture cache.
 *
 * Loading these through a menu scene's own loader looked equivalent and was
 * not: leaving the menu mid-flight does not abort Phaser's in-flight files, so
 * they still landed and registered their texture key after the match scene had
 * queued the same key, and every match opened on a row of "Texture key already
 * in use" errors. Keeping exactly one Phaser owner per key removes that race
 * by construction, and an HTTP-cache hit makes the real load near-free.
 *
 * Entirely best-effort: a rejected prefetch just means the match loads it
 * normally, so failures are swallowed rather than surfaced.
 */
export function prefetchMatchPack() {
  if (typeof fetch !== 'function') return 0;
  const base = import.meta.env.BASE_URL;
  const files = [
    ...KEEPER_SHEETS.filter((sheet) => sheet.initial).map((sheet) => sheet.file),
    ...MATCH_SPRITES.map((sprite) => sprite.file)
  ];
  for (const file of files) {
    fetch(`${base}assets/hd/${file}`, { priority: 'low', mode: 'same-origin' })
      // Draining the body is what actually commits the response to the cache.
      .then((response) => response.ok && response.blob())
      .catch(() => {});
  }
  return files.length;
}
