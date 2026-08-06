import { getCosmeticsByCategory, kickerHdTextureKey, STARTER_COSMETICS } from './cosmetics.js';

// Every selectable striker exists as four characters x six kits x eight poses.
// Booting all 192 of those frames cost 5.6 MB and 192 requests before the menu
// could draw, for a screen that only ever shows the one equipped combination.
// Loading is therefore scoped: the menu boots one set, the locker streams the
// thumbnails it renders, and a match tops up the poses it is about to play.
export const KICKER_POSES = Object.freeze([
  'idle', 'ready', 'windup', 'strike', 'follow', 'recover', 'watch', 'celebrate'
]);

// The only pose the menu hero, the locker preview and the locker grid draw.
export const KICKER_STILL_POSE = 'idle';

function queueImage(scene, key) {
  if (!key || scene.textures?.exists?.(key)) return 0;
  scene.load.image(key, `${import.meta.env.BASE_URL}assets/hd/${key}.png`);
  return 1;
}

/**
 * Queue one striker's full pose set. Returns how many files were actually
 * added, so callers can skip starting an empty loader batch.
 */
export function queueKickerSet(scene, characterId, kitId, poses = KICKER_POSES) {
  let queued = 0;
  for (const pose of poses) {
    queued += queueImage(scene, kickerHdTextureKey(characterId, kitId, pose));
  }
  return queued;
}

/**
 * The still frames the locker grid needs: every character in the home kit, plus
 * every kit on the character currently being previewed.
 */
export function queueLockerThumbnails(scene, characterId = STARTER_COSMETICS.character) {
  let queued = 0;
  for (const character of getCosmeticsByCategory('character')) {
    queued += queueImage(
      scene,
      kickerHdTextureKey(character.id, STARTER_COSMETICS.kit, KICKER_STILL_POSE)
    );
  }
  for (const kit of getCosmeticsByCategory('kit')) {
    queued += queueImage(scene, kickerHdTextureKey(characterId, kit.id, KICKER_STILL_POSE));
  }
  return queued;
}

/**
 * Run a queue function as a background top-up: if it queued nothing the scene
 * is already warm and nothing starts.
 */
export function streamInBackground(scene, queue) {
  if (!scene?.load || queue(scene) === 0) return false;
  scene.load.start();
  return true;
}

/**
 * Await a queue function before continuing. Resolves immediately when the
 * frames are already cached, and still resolves if the scene shuts down, so a
 * missing optional frame can never strand the player on a dead screen.
 */
export function ensureLoaded(scene, queue) {
  return new Promise((resolve) => {
    if (!scene?.load || queue(scene) === 0) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(true);
    };
    scene.load.once('complete', finish);
    scene.events?.once?.('shutdown', finish);
    scene.load.start();
  });
}
