import test from 'node:test';
import assert from 'node:assert/strict';

// src/data/assetBase.js resolves BASE_URL defensively, so these manifests load
// under node --test as well as under Vite.
const { queueKickerSet, queueLockerThumbnails, ensureLoaded, KICKER_POSES } =
  await import('../src/data/kickerAssets.js');
const { queueMatchPack } = await import('../src/data/matchAssets.js');
const { KEEPER_SHEETS } = await import('../src/data/keeperAssets.js');
const { kickerHdTextureKey, STARTER_COSMETICS, getCosmeticsByCategory } =
  await import('../src/data/cosmetics.js');

/** Minimal stand-in for the parts of a Phaser scene the loaders touch. */
function fakeScene({ resident = [] } = {}) {
  const textures = new Set(resident);
  const requested = [];
  const handlers = new Map();
  return {
    requested,
    textures: { exists: (key) => textures.has(key) },
    load: {
      started: 0,
      image: (key, url) => requested.push({ key, url, type: 'image' }),
      spritesheet: (key, url) => requested.push({ key, url, type: 'spritesheet' }),
      once: (event, fn) => handlers.set(event, fn),
      start() {
        this.started++;
        // Mimic Phaser: queued files land, then 'complete' fires.
        for (const file of requested) textures.add(file.key);
        handlers.get('complete')?.();
      }
    },
    events: { once: (event, fn) => handlers.set(`events:${event}`, fn) }
  };
}

test('boot queues exactly one striker set, not the whole matrix', () => {
  const scene = fakeScene();
  const queued = queueKickerSet(scene, 'character-power-striker', 'kit-royal');

  assert.equal(queued, KICKER_POSES.length);
  assert.equal(scene.requested.length, 8);
  const characters = getCosmeticsByCategory('character').length;
  const kits = getCosmeticsByCategory('kit').length;
  assert.ok(
    queued < characters * kits * KICKER_POSES.length,
    'a single set must be far smaller than the full character x kit x pose matrix'
  );
  for (const pose of KICKER_POSES) {
    const key = kickerHdTextureKey('character-power-striker', 'kit-royal', pose);
    assert.ok(scene.requested.some((file) => file.key === key), `missing pose ${pose}`);
  }
});

test('already-resident frames are never re-requested', () => {
  const resident = KICKER_POSES.map((pose) =>
    kickerHdTextureKey(STARTER_COSMETICS.character, STARTER_COSMETICS.kit, pose));
  const scene = fakeScene({ resident });

  const queued = queueKickerSet(scene, STARTER_COSMETICS.character, STARTER_COSMETICS.kit);
  assert.equal(queued, 0);
  assert.deepEqual(scene.requested, []);
});

test('locker thumbnails cover every character and the previewed kits only', () => {
  const scene = fakeScene();
  queueLockerThumbnails(scene, 'character-agile-winger');

  const keys = new Set(scene.requested.map((file) => file.key));
  for (const character of getCosmeticsByCategory('character')) {
    assert.ok(
      keys.has(kickerHdTextureKey(character.id, STARTER_COSMETICS.kit, 'idle')),
      `${character.id} needs a grid thumbnail`
    );
  }
  for (const kit of getCosmeticsByCategory('kit')) {
    assert.ok(
      keys.has(kickerHdTextureKey('character-agile-winger', kit.id, 'idle')),
      `${kit.id} needs a preview frame`
    );
  }
  // Only still frames - the locker never animates the roster.
  assert.ok(
    scene.requested.every((file) => file.key.endsWith('-idle')),
    'locker must not stream action poses'
  );
});

test('the match pack carries initial keepers, defenders and authored goal celebration art', () => {
  const scene = fakeScene();
  const queued = queueMatchPack(scene);

  const keys = scene.requested.map((file) => file.key);
  const initialSheets = KEEPER_SHEETS.filter((sheet) => sheet.initial);
  assert.equal(queued, initialSheets.length + 8);
  for (const sheet of initialSheets) assert.ok(keys.includes(sheet.key), `missing ${sheet.key}`);
  for (const key of ['defender-hd', 'defender-collapse-hd', 'security-guards-hd']) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }
  for (const key of ['goal-pyro-unit-v1', 'goal-pyro-fountain-v2', 'goal-firework-shell-v1']) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }
  for (const key of ['crowd-goal-v3', 'crowd-out-v3']) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }
  // Specialist sheets still wait for gameplay to ask for them.
  const specialist = KEEPER_SHEETS.find((sheet) => sheet.key === 'keeper-practical-recovery-hd');
  assert.ok(!keys.includes(specialist.key), 'specialist sheets must stay deferred');
});

test('queueing the match pack twice is a no-op the second time', () => {
  const scene = fakeScene();
  queueMatchPack(scene);
  scene.load.start();
  scene.requested.length = 0;

  assert.equal(queueMatchPack(scene), 0);
  assert.deepEqual(scene.requested, []);
});

test('ensureLoaded resolves without starting a loader when nothing is queued', async () => {
  const scene = fakeScene();
  const ran = await ensureLoaded(scene, () => 0);

  assert.equal(ran, false);
  assert.equal(scene.load.started, 0, 'an empty batch must not start the loader');
});

test('ensureLoaded resolves once the queued batch completes', async () => {
  const scene = fakeScene();
  const ran = await ensureLoaded(scene, (target) =>
    queueKickerSet(target, 'character-islam-sharaf', 'kit-crimson'));

  assert.equal(ran, true);
  assert.equal(scene.load.started, 1);
  assert.equal(scene.requested.length, KICKER_POSES.length);
});
