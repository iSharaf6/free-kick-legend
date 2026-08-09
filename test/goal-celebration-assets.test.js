import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const assets = Object.freeze([
  Object.freeze({
    file: 'goal-spark-fountain-sheet-v3.png',
    frameWidth: 128,
    width: 128 * 8,
    height: 192,
    colorType: 6,
    hash: '6895396bee74199ea1d9de906c104d4bbafc83c2c665f162a7c680402c15f57e'
  }),
  Object.freeze({
    file: 'goal-flare-sheet-v3.png',
    frameWidth: 128,
    width: 128 * 8,
    height: 192,
    colorType: 6,
    hash: 'a74bf561e91479dfca7a3bea7af0a6e6ff4017e6121ddfa548afc6a5db19027c'
  }),
  Object.freeze({
    file: 'goal-crowd-banner-sheet-v4.png',
    frameWidth: 256,
    width: 256 * 8,
    height: 128,
    colorType: 6,
    hash: '31b25e632a07cc6ba6f634a06bb459c220de37672f7cf12b885e478c6ff7670a'
  })
]);

test('generated goal celebration art ships at its authored aspect and alpha contract', async () => {
  for (const asset of assets) {
    const bytes = await readFile(new URL(`../public/assets/fx/${asset.file}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
    assert.equal(bytes.readUInt32BE(16), asset.width);
    assert.equal(bytes.readUInt32BE(20), asset.height);
    assert.equal(asset.width / asset.frameWidth, 8, `${asset.file} must contain eight frames`);
    assert.equal(bytes[25], asset.colorType, `${asset.file} alpha/color type changed`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.hash);
  }
});
