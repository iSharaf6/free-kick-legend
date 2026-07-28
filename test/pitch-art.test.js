import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import zlib from 'node:zlib';

const PITCH_PATH = new URL('../public/assets/hd/pitch-grass-pixel-v3.png', import.meta.url);

test('pixel pitch has the exact runtime dimensions and a restrained authored palette', () => {
  const png = fs.readFileSync(PITCH_PATH);
  assert.equal(png.readUInt32BE(16), 960);
  assert.equal(png.readUInt32BE(20), 350);
  assert.equal(png[25], 2, 'pitch is an opaque RGB texture');

  let offset = 8;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const colors = new Set();
  const stride = 960 * 3 + 1;
  for (let y = 0; y < 350; y++) {
    assert.equal(raw[y * stride], 0);
    for (let x = 0; x < 960; x++) {
      const i = y * stride + 1 + x * 3;
      colors.add(raw.subarray(i, i + 3).toString('hex'));
    }
  }

  assert.ok(colors.size >= 6, 'pitch keeps enough tones for mowing and grass clusters');
  assert.ok(colors.size <= 8, 'pitch avoids noisy photographic colour variation');
});
