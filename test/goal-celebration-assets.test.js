import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// All three files are produced by scripts/build_goal_pyro.py. The simulations
// are seeded and the permanent unit is deterministic, so the same script always
// writes the same bytes. Pinning hashes checks that checked-in art still matches
// its generator rather than merely catching corrupt files.
const assets = Object.freeze([
  Object.freeze({
    file: 'goal-pyro-unit-v1.png',
    // One transparent 96x256 plate containing only the permanent stage unit.
    width: 96,
    height: 256,
    colorType: 6,
    hash: '472660f2a959d81e8656585e98e96fa0e67dfff36d45050e0bc0faf2d341fc56'
  }),
  Object.freeze({
    file: 'goal-pyro-fountain-strip-v2.png',
    // Ten 96x256 frames of additive plume, with no hardware baked into them.
    width: 960,
    height: 256,
    colorType: 6,
    hash: '242a56f57c339a734b7593736d68f08f14238c7fe12b26bb0e3ce039215beb7f'
  }),
  Object.freeze({
    file: 'goal-firework-shell-v1.png',
    // Twelve 128x128 frames of shell burst, authored in luminance so the
    // renderer can tint one sheet into a whole display.
    width: 1536,
    height: 128,
    colorType: 6,
    hash: 'd10cd160005519ca0d91add43bc07ab794098d9f8d6bf41569929dd333ab7cb2'
  })
]);

test('generated goal celebration art ships at its authored aspect and alpha contract', async () => {
  for (const asset of assets) {
    const bytes = await readFile(new URL(`../public/assets/fx/${asset.file}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
    assert.equal(bytes.readUInt32BE(16), asset.width);
    assert.equal(bytes.readUInt32BE(20), asset.height);
    assert.equal(bytes[25], asset.colorType, `${asset.file} alpha/color type changed`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.hash);
  }
});
