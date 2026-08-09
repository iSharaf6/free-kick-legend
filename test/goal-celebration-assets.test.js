import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const assets = Object.freeze([
  Object.freeze({
    file: 'goal-spark-fountain-static-v2.png',
    width: 96,
    height: 160,
    colorType: 6,
    hash: '75633e741f1d2bec6c1ea2401071167db13940e028bdff51ff386bb58475c1bc'
  }),
  Object.freeze({
    file: 'goal-flare-static-v2.png',
    width: 112,
    height: 160,
    colorType: 6,
    hash: '2f23fb8ddef124745785f6bcaf439cad6f08a8db244eaf5cb4fc96942c5620c7'
  }),
  Object.freeze({
    file: 'goal-flags-static-v2.png',
    width: 160,
    height: 128,
    colorType: 6,
    hash: 'a3fe318b634f5baf406869e416e339c952b68a9564a4d5145eddf36e614f3104'
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
