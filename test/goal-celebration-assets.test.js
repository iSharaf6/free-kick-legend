import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const assets = Object.freeze([
  Object.freeze({
    file: 'goal-celebration-stand-v1.png',
    width: 960,
    height: 218,
    colorType: 2,
    hash: '3a99fd8010b79618cad09a71702914ea8ce7fa3b16188f5681035317fa2af10b'
  }),
  Object.freeze({
    file: 'goal-pyro-fountain-strip-v1.png',
    width: 384,
    height: 256,
    colorType: 6,
    hash: 'c695643f2e21b045de72a5e7ae5efee4f565b3bff5676f8f906e343cfde40bd0'
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
